"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const snapshot = require("../tools/annual-simulation/menu-snapshot.json");
const { generateDay, simulateDay, FEEDS } = require("../tools/annual-simulation/engine.cjs");

const fifo = { rank: "fifo", align: 0, hold: 0, serve: "fifo" };

function fixture(items) {
    return { date: "2026-01-01", dayIndex: 0, weekday: 4,
        orders: [{ id: "1-1", table: "01", arrival: 0, guests: 2,
            critical: Math.max(...items.map(item => item.duration)), items }]
    };
}

function dish(id, resource, duration, hot = true) {
    return { id, code: id, name: id, resource, duration, hot };
}

test("the generated year-day workload is seeded, within business hours and independent of policy", () => {
    const a = generateDay(0, snapshot.menus, snapshot.popularity);
    const b = generateDay(0, snapshot.menus, snapshot.popularity);
    assert.deepEqual(a, b);
    assert.ok(a.orders.length > 0);
    assert.ok(a.orders.every(order => order.arrival >= 0 && order.arrival < 43200));
    const x = simulateDay(a, fifo);
    const y = simulateDay(a, { rank: "long", align: 1, hold: 120, serve: "quality" });
    assert.equal(x.orders, y.orders);
    assert.equal(x.items, y.items);
    assert.ok(Number.isFinite(x.meanLast) && Number.isFinite(y.meanLast));
});

test("two hot dishes start before a short cold dish when episode alignment is enabled", () => {
    const day = fixture([
        dish("doria-a", "OVEN_LOWER", 330),
        dish("doria-b", "OVEN_LOWER", 330),
        dish("salad", "COLD_PREP", 120, false)
    ]);
    const result = simulateDay(day, { rank: "episode", align: 1, hold: 120, serve: "quality" }, true);
    const items = result.detailedOrders[0].items;
    assert.equal(items[0].startedAt, 0);
    assert.equal(items[1].startedAt, 0);
    assert.ok(items[2].startedAt >= 200);
    assert.ok(items.every(item => item.startedAt >= 0 && item.readyAt > item.startedAt && item.servedAt >= item.readyAt));
});

test("conveyor feed spacing and simultaneous lanes are respected", () => {
    const day = fixture(Array.from({ length: 5 }, (_, i) => dish(`pizza-${i}`, "OVEN_UPPER", 180)));
    const starts = simulateDay(day, fifo, true).detailedOrders[0].items.map(item => item.startedAt).sort((a, b) => a - b);
    assert.deepEqual(starts, [0, 0, FEEDS.OVEN_UPPER, FEEDS.OVEN_UPPER, 2 * FEEDS.OVEN_UPPER]);
});

test("holding can group a ticket but must not block an earlier ready dish forever", () => {
    const day = fixture([dish("soup", "HOT_PLATING", 60), dish("pasta", "PASTA", 300)]);
    const immediate = simulateDay(day, fifo, true).detailedOrders[0].items;
    const grouped = simulateDay(day, { rank: "fifo", align: 0, hold: 400, serve: "fifo" }, true).detailedOrders[0].items;
    assert.ok(immediate[0].servedAt < immediate[1].servedAt);
    assert.equal(grouped[0].servedAt, grouped[1].servedAt);
    assert.ok(grouped[0].servedAt >= grouped[0].readyAt);
});

test("each non-oven station uses its configured parallel capacity", () => {
    const day = fixture(Array.from({ length: 4 }, (_, i) => dish(`pasta-${i}`, "PASTA", 180)));
    const starts = simulateDay(day, fifo, true).detailedOrders[0].items.map(item => item.startedAt).sort((a, b) => a - b);
    assert.deepEqual(starts, [0, 0, 180, 180]);
});

test("separate tickets at the same table are not held as a single serving group", () => {
    const first = fixture([dish("soup", "HOT_PLATING", 60)]);
    first.orders.push({ id: "1-2", table: "01", arrival: 0, guests: 1, critical: 300,
        items: [dish("pasta", "PASTA", 300)] });
    const result = simulateDay(first, { rank: "fifo", align: 0, hold: 400, serve: "complete" }, true);
    assert.ok(result.detailedOrders[0].items[0].servedAt < result.detailedOrders[1].items[0].readyAt);
});
