"use strict";

const { resolveRecipe } = require("../../src/main/resources/static/kitchen-scheduler.js");

const HOURS = [3, 7, 13, 16, 10, 5, 8, 12, 15, 12, 7, 3];
const OPEN_HOUR = 11;
const CLOSE_SECONDS = 12 * 3600;
const FEEDS = { OVEN_UPPER: 23, OVEN_LOWER: 43 };
const CAPACITY = { PASTA: 2, HEAT: 1, COLD_PREP: 1, HOT_PLATING: 1, FLOOR_PREP: 1, OTHER: 1 };

function random(seed) {
    let state = seed >>> 0;
    return () => {
        state += 0x6d2b79f5;
        let value = Math.imul(state ^ state >>> 15, 1 | state);
        value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
}

function poisson(mean, rng) {
    let count = 0;
    let product = 1;
    const limit = Math.exp(-mean);
    while ((product *= rng()) > limit) count++;
    return count;
}

function weighted(values, rng) {
    const total = values.reduce((sum, item) => sum + item.weight, 0);
    let pick = rng() * total;
    for (const item of values) {
        pick -= item.weight;
        if (pick < 0) return item;
    }
    return values.at(-1);
}

function generateDay(dayIndex, menus, popularity, seed = 20261106, trafficFactor = 1) {
    const rng = random((seed + Math.imul(dayIndex + 1, 2654435761)) >>> 0);
    const date = new Date(Date.UTC(2026, 0, dayIndex + 1));
    const weekday = date.getUTCDay();
    const dayMultiplier = (weekday === 0 || weekday === 6 ? 1.18 : weekday === 5 ? 1.10 : 1) *
        (0.84 + 0.32 * rng()) * (1 + 0.06 * Math.sin(2 * Math.PI * dayIndex / 365));
    const pools = {};
    for (const menu of menus) {
        if (["drink", "dessert"].includes(menu.category)) continue;
        const group = menu.category === "rice" ? "side" : menu.category;
        if (!pools[group]) pools[group] = [];
        pools[group].push({ ...menu, weight: 1 + Math.min(8, Number(popularity[menu.code]) || 0) });
    }
    const orders = [];
    for (let hour = 0; hour < 12; hour++) {
        const count = poisson(HOURS[hour] * dayMultiplier * trafficFactor, rng);
        for (let i = 0; i < count; i++) {
            const arrival = hour * 3600 + Math.floor(rng() * 3600);
            const guestRoll = rng();
            const guests = guestRoll < 0.24 ? 1 : guestRoll < 0.72 ? 2 : guestRoll < 0.93 ? 3 : 4;
            const selected = [];
            for (let guest = 0; guest < guests; guest++) {
                const roll = rng();
                const category = roll < .38 ? "pasta" : roll < .63 ? "doria" : roll < .80 ? "pizza" : "meat";
                selected.push(weighted(pools[category], rng));
            }
            if (rng() < .45) selected.push(weighted(pools.appetizer, rng));
            if (rng() < .27) selected.push(weighted(pools.side, rng));
            const items = selected.map((menu, index) => {
                const recipe = resolveRecipe({
                    code: menu.code, category: menu.category,
                    station: menu.prepStation, cookTime: menu.cookTime
                });
                const variation = .80 + .40 * rng();
                const duration = Math.max(20, Math.round(recipe.durationSeconds * variation * (rng() < .025 ? 1.45 : 1)));
                return {
                    id: `${hour}-${i}-${index}`, code: menu.code, name: menu.name,
                    resource: recipe.resource, duration,
                    hot: !["COLD_PREP", "FLOOR_PREP", "OTHER"].includes(recipe.resource)
                };
            });
            orders.push({ arrival, guests, items });
        }
    }
    orders.sort((a, b) => a.arrival - b.arrival);
    orders.forEach((order, index) => {
        order.id = `${dayIndex + 1}-${index + 1}`;
        order.table = String(1 + index % 30).padStart(2, "0");
        order.critical = Math.max(...order.items.map(item => item.duration));
        order.items.forEach(item => { item.id = `${order.id}-${item.id}`; });
    });
    return { date: date.toISOString().slice(0, 10), dayIndex, weekday, dayMultiplier, orders };
}

class Heap {
    constructor() { this.data = []; }
    push(value) {
        const data = this.data;
        data.push(value);
        let index = data.length - 1;
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (data[parent].time <= value.time) break;
            data[index] = data[parent];
            index = parent;
        }
        data[index] = value;
    }
    pop() {
        const data = this.data;
        const first = data[0];
        const last = data.pop();
        if (data.length) {
            let index = 0;
            while ((index << 1) + 1 < data.length) {
                let child = (index << 1) + 1;
                if (child + 1 < data.length && data[child + 1].time < data[child].time) child++;
                if (data[child].time >= last.time) break;
                data[index] = data[child];
                index = child;
            }
            data[index] = last;
        }
        return first;
    }
    get size() { return this.data.length; }
    peek() { return this.data[0]; }
}

function mean(values) {
    return values.length ? values.reduce((sum, x) => sum + x, 0) / values.length : 0;
}

function percentile(values, p) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.ceil(p * sorted.length) - 1];
}

function simulateDay(day, policy, detail = false) {
    const orders = day.orders.map(input => ({
        ...input, items: input.items.map(item => ({ ...item, orderId: input.id, arrival: input.arrival,
            status: "pending", startedAt: null, readyAt: null, servedAt: null }))
    }));
    const orderById = new Map(orders.map(order => [order.id, order]));
    const queues = new Map();
    const active = new Map();
    const ovenFeed = new Map(Object.keys(FEEDS).map(resource => [resource, 0]));
    const wakes = new Map();
    const events = new Heap();
    orders.forEach(order => events.push({ time: order.arrival, type: "arrival", orderId: order.id }));
    let runners = 0;
    let maxQueue = 0;
    let now = 0;
    let eventCount = 0;

    function wake(key, time) {
        if (!Number.isFinite(time) || time <= now) return;
        if ((wakes.get(key) ?? Infinity) <= time) return;
        wakes.set(key, time);
        events.push({ time, type: "wake", key });
    }

    function eligibleAt(task) {
        if (policy.align === 0 || task.duration >= orderById.get(task.orderId).critical) return task.arrival;
        const order = orderById.get(task.orderId);
        const critical = order.items.filter(item => item.duration === order.critical);
        if (critical.some(item => item.startedAt === null)) return order.arrival + 900;
        const finish = Math.max(...critical.map(item => item.startedAt + item.duration));
        return Math.min(order.arrival + 900,
            Math.max(order.arrival, Math.round(order.arrival + policy.align * (finish - task.duration - order.arrival))));
    }

    function taskCompare(a, b) {
        if (policy.rank === "short" && a.duration !== b.duration) return a.duration - b.duration;
        if (policy.rank === "long" && a.duration !== b.duration) return b.duration - a.duration;
        if (policy.rank === "slack" || policy.rank === "episode") {
            const aOrder = orderById.get(a.orderId);
            const bOrder = orderById.get(b.orderId);
            const aDue = a.arrival + 18 * 60 - aOrder.critical;
            const bDue = b.arrival + 18 * 60 - bOrder.critical;
            if (policy.rank === "episode") {
                const aStarted = aOrder.items.some(item => item.startedAt !== null) ? 1 : 0;
                const bStarted = bOrder.items.some(item => item.startedAt !== null) ? 1 : 0;
                if (aStarted !== bStarted) return bStarted - aStarted;
            }
            if (aDue !== bDue) return aDue - bDue;
        }
        return a.arrival - b.arrival || a.orderId.localeCompare(b.orderId) || a.id.localeCompare(b.id);
    }

    function start(resource, task) {
        task.status = "cooking";
        task.startedAt = now;
        events.push({ time: now + task.duration, type: "ready", task, resource });
        if (!(resource in FEEDS)) active.set(resource, (active.get(resource) || 0) + 1);
    }

    function dispatchResource(resource) {
        const queue = queues.get(resource);
        if (!queue?.length) return false;
        const oven = resource in FEEDS;
        if (oven && ovenFeed.get(resource) > now) {
            wake(resource, ovenFeed.get(resource));
            return false;
        }
        let slots = oven ? 2 : (CAPACITY[resource] || 1) - (active.get(resource) || 0);
        if (slots <= 0) return false;
        let started = false;
        while (slots > 0 && queue.length) {
            const candidates = queue.filter(task => eligibleAt(task) <= now).sort(taskCompare);
            if (!candidates.length) break;
            const selected = candidates[0];
            queue.splice(queue.indexOf(selected), 1);
            start(resource, selected);
            started = true;
            slots--;
        }
        if (oven && started) ovenFeed.set(resource, now + FEEDS[resource]);
        if (queue.length) {
            const next = Math.min(...queue.map(eligibleAt));
            if (oven && started) wake(resource, Math.max(ovenFeed.get(resource), next));
            else if (next > now) wake(resource, next);
        }
        return started;
    }

    function dispatchCooking() {
        for (let pass = 0; pass < 3; pass++) {
            let started = false;
            for (const resource of queues.keys()) started = dispatchResource(resource) || started;
            if (!started) break;
        }
    }

    function dispatchService() {
        while (runners < 2) {
            const candidates = [];
            for (const order of orders) {
                const ready = order.items.filter(item => item.status === "ready");
                if (!ready.length) continue;
                const oldest = Math.min(...ready.map(item => item.readyAt));
                const remaining = order.items.some(item => item.status === "pending" || item.status === "cooking" || item.status === "serving");
                if (remaining && now < oldest + policy.hold) {
                    wake(`serve-${order.id}`, oldest + policy.hold);
                    continue;
                }
                candidates.push({ order, ready, oldest, complete: !remaining });
            }
            if (!candidates.length) break;
            candidates.sort((a, b) => {
                if (policy.serve === "complete" && a.complete !== b.complete) return a.complete ? -1 : 1;
                if (policy.serve === "quality") {
                    const aDeadline = a.oldest + (a.ready.some(item => item.hot) ? 120 : 240);
                    const bDeadline = b.oldest + (b.ready.some(item => item.hot) ? 120 : 240);
                    if (aDeadline !== bDeadline) return aDeadline - bDeadline;
                    if (a.complete !== b.complete) return a.complete ? -1 : 1;
                }
                return a.oldest - b.oldest || a.order.arrival - b.order.arrival;
            });
            const chosen = candidates[0];
            chosen.ready.forEach(item => { item.status = "serving"; });
            runners++;
            events.push({ time: now + 45 + 10 * (chosen.ready.length - 1), type: "served", items: chosen.ready });
        }
    }

    while (events.size) {
        const event = events.pop();
        now = event.time;
        if (++eventCount > 250000 || now > CLOSE_SECONDS + 4 * 3600) {
            throw new Error(`Simulation did not drain on ${day.date}: ${eventCount} events, t=${now}`);
        }
        if (event.type === "wake") {
            if (wakes.get(event.key) !== event.time) continue;
            wakes.delete(event.key);
        } else if (event.type === "arrival") {
            const order = orderById.get(event.orderId);
            for (const task of order.items) {
                if (!queues.has(task.resource)) queues.set(task.resource, []);
                queues.get(task.resource).push(task);
            }
        } else if (event.type === "ready") {
            event.task.status = "ready";
            event.task.readyAt = now;
            if (!(event.resource in FEEDS)) active.set(event.resource, active.get(event.resource) - 1);
        } else if (event.type === "served") {
            for (const item of event.items) {
                item.status = "served";
                item.servedAt = now;
            }
            runners--;
        }
        maxQueue = Math.max(maxQueue, [...queues.values()].reduce((sum, queue) => sum + queue.length, 0));
        dispatchCooking();
        dispatchService();
    }
    if (orders.some(order => order.items.some(item => item.status !== "served"))) {
        throw new Error(`Unserved items on ${day.date}`);
    }

    const lastWait = [], firstWait = [], gaps = [], hotHolds = [], itemWait = [];
    let afterClose = 0;
    const hours = Array.from({ length: 12 }, (_, hour) => ({ hour: OPEN_HOUR + hour, orders: 0, last: [], first: [], gaps: [], hotHold: [] }));
    for (const order of orders) {
        const times = order.items.map(item => item.servedAt);
        const first = (Math.min(...times) - order.arrival) / 60;
        const last = (Math.max(...times) - order.arrival) / 60;
        const gap = (Math.max(...times) - Math.min(...times)) / 60;
        const hour = hours[Math.floor(order.arrival / 3600)];
        firstWait.push(first); lastWait.push(last);
        hour.orders++; hour.first.push(first); hour.last.push(last);
        if (order.items.length > 1) {
            gaps.push(gap);
            hour.gaps.push(gap);
        }
        if (Math.max(...times) > CLOSE_SECONDS) afterClose++;
        for (const item of order.items) {
            itemWait.push((item.servedAt - order.arrival) / 60);
            if (item.hot) {
                const hold = (item.servedAt - item.readyAt) / 60;
                hotHolds.push(hold); hour.hotHold.push(hold);
            }
        }
    }
    return {
        date: day.date, dayIndex: day.dayIndex, weekday: day.weekday, orders: orders.length,
        items: itemWait.length, multiOrders: gaps.length, afterClose, maxQueue,
        meanLast: mean(lastWait), p95Last: percentile(lastWait, .95),
        meanFirst: mean(firstWait), meanGap: mean(gaps), p90Gap: percentile(gaps, .90),
        meanHotHold: mean(hotHolds), p95HotHold: percentile(hotHolds, .95),
        sumLast: lastWait.reduce((a, b) => a + b, 0),
        sumFirst: firstWait.reduce((a, b) => a + b, 0),
        sumGap: gaps.reduce((a, b) => a + b, 0),
        sumHotHold: hotHolds.reduce((a, b) => a + b, 0),
        hotItems: hotHolds.length,
        lastWait, gaps, hotHolds,
        hours: hours.map(hour => ({ hour: hour.hour, orders: hour.orders,
            meanLast: mean(hour.last), p95Last: percentile(hour.last, .95),
            meanFirst: mean(hour.first), meanGap: mean(hour.gaps), multiOrders: hour.gaps.length,
            meanHotHold: mean(hour.hotHold), sumLast: hour.last.reduce((a, b) => a + b, 0),
            sumGap: hour.gaps.reduce((a, b) => a + b, 0), hotItems: hour.hotHold.length,
            sumHotHold: hour.hotHold.reduce((a, b) => a + b, 0) })),
        ...(detail ? { detailedOrders: orders } : {})
    };
}

module.exports = { HOURS, OPEN_HOUR, CLOSE_SECONDS, FEEDS, CAPACITY, generateDay, simulateDay, mean, percentile };
