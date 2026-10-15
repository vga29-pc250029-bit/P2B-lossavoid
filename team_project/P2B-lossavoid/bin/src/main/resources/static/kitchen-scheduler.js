(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.KitchenScheduler = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
    "use strict";

    const DEFAULTS = {
        exactLimit: 16,
        targetWaitMinutes: 12,
        holdingWeight: 2.8,
        switchPenalty: 6,
        leaveTablePenalty: 14,
        returnTablePenalty: 42,
        coursePenalty: 14,
        durationInversionPenalty: 80,
        waitWeight: 0.32,
        lateWeight: 8
    };

    function freshnessWeight(item) {
        const category = String(item.menuCategory || "").toLowerCase();
        const station = String(item.station || "").toLowerCase();
        const minutes = Number(item.cookTime) || 0;

        if (category === "pasta") return 2.4;
        if (category === "pizza") return 2.2;
        if (category === "meat") return 2.1;
        if (category === "doria") return 1.9;
        if (category === "rice") return 1.1;
        if (category === "dessert" || category === "drink") return 0.25;
        if (station === "kitchen" && minutes >= 3) return 1.8;
        if (minutes >= 3) return 1.35;
        return 0.65;
    }

    function courseRank(item) {
        const category = String(item.menuCategory || "").toLowerCase();
        if (category === "appetizer") return 0;
        if (["pizza", "pasta", "doria", "meat", "rice"].includes(category)) return 1;
        if (category === "dessert") return 2;
        return 1;
    }

    function prepare(items, nowMs) {
        return items.map((item, index) => {
            const qty = Math.max(1, Number(item.qty) || 1);
            const baseDuration = Math.max(0.5, Number(item.cookTime) || 0.5);
            const batchFactor = Math.min(2, 1 + (qty - 1) * 0.25);
            const createdAtMs = Number(item.createdAtMs) || nowMs;
            return {
                ...item,
                _index: index,
                _table: String(item.table),
                _duration: baseDuration * batchFactor,
                _age: Math.max(0, (nowMs - createdAtMs) / 60000),
                _freshness: freshnessWeight(item),
                _course: courseRank(item)
            };
        });
    }

    function buildModel(tasks, settings) {
        const n = tasks.length;
        const tableNames = [...new Set(tasks.map(task => task._table))];
        const tableIndex = new Map(tableNames.map((table, index) => [table, index]));
        const tableMasks = new Uint32Array(tableNames.length);
        const tableAges = new Float64Array(tableNames.length);

        tasks.forEach((task, index) => {
            task._tableIndex = tableIndex.get(task._table);
            tableMasks[task._tableIndex] |= 1 << index;
            tableAges[task._tableIndex] = Math.max(tableAges[task._tableIndex], task._age);
        });

        return { n, tasks, tableNames, tableMasks, tableAges, settings };
    }

    function transitionCost(model, mask, last, next, elapsed, activeFreshness) {
        const { tasks, tableMasks, tableAges, settings } = model;
        const task = tasks[next];
        const nextMask = mask | (1 << next);
        const finish = elapsed + task._duration;
        let cost = settings.waitWeight * Math.pow(task._age + finish, 2);

        cost += settings.holdingWeight * activeFreshness * task._duration;

        if (last >= 0 && tasks[last]._tableIndex !== task._tableIndex) {
            cost += settings.switchPenalty;
            const lastTableMask = tableMasks[tasks[last]._tableIndex];
            if ((mask & lastTableMask) !== lastTableMask) cost += settings.leaveTablePenalty;
            if ((mask & tableMasks[task._tableIndex]) !== 0) cost += settings.returnTablePenalty;
        }

        for (let previous = 0; previous < tasks.length; previous += 1) {
            if ((mask & (1 << previous)) === 0) continue;
            if (tasks[previous]._tableIndex !== task._tableIndex) continue;
            if (tasks[previous]._course > task._course) {
                cost += settings.coursePenalty * (tasks[previous]._course - task._course);
            }
            if (tasks[previous]._duration < task._duration) {
                cost += settings.durationInversionPenalty * (task._duration - tasks[previous]._duration);
            }
        }

        const tableMask = tableMasks[task._tableIndex];
        if ((nextMask & tableMask) === tableMask && (mask & tableMask) !== tableMask) {
            const remaining = settings.targetWaitMinutes - tableAges[task._tableIndex];
            const lateness = Math.max(0, finish - remaining);
            cost += settings.lateWeight * lateness * lateness;
        }

        return cost;
    }

    function createSubsetData(model) {
        const { n, tasks, tableMasks } = model;
        const size = 1 << n;
        const elapsed = new Float64Array(size);
        const freshnessSum = new Float64Array(size);
        const activeFreshness = new Float64Array(size);

        for (let mask = 1; mask < size; mask += 1) {
            const bit = mask & -mask;
            const index = 31 - Math.clz32(bit);
            const previous = mask ^ bit;
            elapsed[mask] = elapsed[previous] + tasks[index]._duration;
            freshnessSum[mask] = freshnessSum[previous] + tasks[index]._freshness;
        }

        for (let mask = 1; mask < size; mask += 1) {
            let sum = 0;
            for (const tableMask of tableMasks) {
                const scheduled = mask & tableMask;
                if (scheduled !== 0 && scheduled !== tableMask) {
                    sum += freshnessSum[scheduled];
                }
            }
            activeFreshness[mask] = sum;
        }

        return { size, elapsed, activeFreshness };
    }

    function exactSchedule(model) {
        const { n } = model;
        const { size, elapsed, activeFreshness } = createSubsetData(model);
        const costs = new Float64Array(size * n);
        const previousLast = new Int16Array(size * n);
        costs.fill(Number.POSITIVE_INFINITY);
        previousLast.fill(-2);
        let evaluatedTransitions = 0;

        for (let first = 0; first < n; first += 1) {
            const mask = 1 << first;
            costs[mask * n + first] = transitionCost(model, 0, -1, first, 0, 0);
            previousLast[mask * n + first] = -1;
        }

        for (let mask = 1; mask < size; mask += 1) {
            const remaining = (size - 1) ^ mask;
            if (remaining === 0) continue;

            for (let last = 0; last < n; last += 1) {
                if ((mask & (1 << last)) === 0) continue;
                const baseCost = costs[mask * n + last];
                if (!Number.isFinite(baseCost)) continue;

                let choices = remaining;
                while (choices) {
                    const bit = choices & -choices;
                    const next = 31 - Math.clz32(bit);
                    const nextMask = mask | bit;
                    const nextCost = baseCost + transitionCost(
                        model,
                        mask,
                        last,
                        next,
                        elapsed[mask],
                        activeFreshness[mask]
                    );
                    const nextIndex = nextMask * n + next;
                    evaluatedTransitions += 1;
                    if (nextCost < costs[nextIndex]) {
                        costs[nextIndex] = nextCost;
                        previousLast[nextIndex] = last;
                    }
                    choices ^= bit;
                }
            }
        }

        const fullMask = size - 1;
        let bestLast = 0;
        for (let last = 1; last < n; last += 1) {
            if (costs[fullMask * n + last] < costs[fullMask * n + bestLast]) bestLast = last;
        }

        const sequence = [];
        let mask = fullMask;
        let last = bestLast;
        while (last >= 0) {
            sequence.push(last);
            const prior = previousLast[mask * n + last];
            mask ^= 1 << last;
            last = prior;
        }
        sequence.reverse();

        return {
            sequence,
            score: costs[fullMask * n + bestLast],
            exact: true,
            evaluatedTransitions
        };
    }

    function scoreSequence(model, sequence) {
        let elapsed = 0;
        let activeFreshness = 0;
        let cost = 0;
        let last = -1;
        const remainingByTable = new Int32Array(model.tableNames.length);
        const scheduledByTable = new Int32Array(model.tableNames.length);
        const scheduled = [];

        for (const task of model.tasks) remainingByTable[task._tableIndex] += 1;

        for (const next of sequence) {
            const task = model.tasks[next];
            const finish = elapsed + task._duration;
            cost += model.settings.waitWeight * Math.pow(task._age + finish, 2);
            cost += model.settings.holdingWeight * activeFreshness * task._duration;

            if (last >= 0 && model.tasks[last]._tableIndex !== task._tableIndex) {
                cost += model.settings.switchPenalty;
                if (remainingByTable[model.tasks[last]._tableIndex] > 0) {
                    cost += model.settings.leaveTablePenalty;
                }
                if (scheduledByTable[task._tableIndex] > 0) {
                    cost += model.settings.returnTablePenalty;
                }
            }

            for (const previous of scheduled) {
                const prior = model.tasks[previous];
                if (prior._tableIndex !== task._tableIndex) continue;
                if (prior._course > task._course) {
                    cost += model.settings.coursePenalty * (prior._course - task._course);
                }
                if (prior._duration < task._duration) {
                    cost += model.settings.durationInversionPenalty * (task._duration - prior._duration);
                }
            }

            remainingByTable[task._tableIndex] -= 1;
            scheduledByTable[task._tableIndex] += 1;
            scheduled.push(next);
            elapsed = finish;

            if (remainingByTable[task._tableIndex] === 0) {
                const remaining = model.settings.targetWaitMinutes - model.tableAges[task._tableIndex];
                const lateness = Math.max(0, finish - remaining);
                cost += model.settings.lateWeight * lateness * lateness;
            }

            activeFreshness = 0;
            for (const completed of scheduled) {
                const prior = model.tasks[completed];
                if (remainingByTable[prior._tableIndex] > 0) activeFreshness += prior._freshness;
            }
            last = next;
        }
        return cost;
    }

    function fallbackSchedule(model) {
        const remaining = new Set(model.tasks.map((_, index) => index));
        const sequence = [];

        while (remaining.size) {
            let best = null;
            let bestScore = Number.POSITIVE_INFINITY;
            for (const candidate of remaining) {
                const trial = [...sequence, candidate];
                const score = scoreSequence(model, trial);
                if (score < bestScore) {
                    bestScore = score;
                    best = candidate;
                }
            }
            sequence.push(best);
            remaining.delete(best);
        }

        let improved = true;
        while (improved) {
            improved = false;
            let bestScore = scoreSequence(model, sequence);
            for (let left = 0; left < sequence.length - 1; left += 1) {
                for (let right = left + 1; right < sequence.length; right += 1) {
                    const trial = [...sequence];
                    [trial[left], trial[right]] = [trial[right], trial[left]];
                    const score = scoreSequence(model, trial);
                    if (score + 1e-9 < bestScore) {
                        sequence.splice(0, sequence.length, ...trial);
                        bestScore = score;
                        improved = true;
                    }
                }
            }
        }

        return { sequence, score: scoreSequence(model, sequence), exact: false, evaluatedTransitions: null };
    }

    function scheduleKitchenItems(items, options = {}) {
        if (!Array.isArray(items) || items.length === 0) {
            return { items: [], exact: true, score: 0, evaluatedTransitions: 0 };
        }
        const settings = { ...DEFAULTS, ...options };
        const nowMs = Number(options.nowMs) || Date.now();
        const tasks = prepare(items, nowMs);
        const model = buildModel(tasks, settings);
        const result = tasks.length <= settings.exactLimit
            ? exactSchedule(model)
            : fallbackSchedule(model);

        return {
            ...result,
            items: result.sequence.map(index => items[index])
        };
    }

    return { scheduleKitchenItems, freshnessWeight, courseRank };
});
