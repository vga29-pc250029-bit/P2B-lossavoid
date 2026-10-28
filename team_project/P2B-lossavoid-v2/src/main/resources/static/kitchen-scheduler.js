(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.KitchenScheduler = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
    "use strict";

    const DEFAULTS = {
        targetWaitMinutes: 12,
        // 1mの炉内を、搬送方向13cmの鉄板が隙間なく進む暫定値。
        // 実測後はここだけを変更すれば投入枠が再計算される。
        upperFeedSeconds: 23,
        lowerFeedSeconds: 43,
        largeBacklogThreshold: 30
    };

    const LOWER_OVEN_CODES = new Set([
        "1401", "1402", "1405", "1410", "1452",
        "2101", "2103", "2108", "2110", "2115"
    ]);

    const UPPER_OVEN_CODES = new Set([
        "1305", "1307", "1404", "1407", "1416",
        "2203", "2204", "2206", "2208",
        "3110", "3111", "3112", "3114"
    ]);

    const CHICKEN_FINISH_CODES = new Set(["2402", "2404"]);
    const HAMBURGER_CODES = new Set(["2403", "2406", "2407"]);

    const RESOURCE_ORDER = {
        OVEN_LOWER: 0,
        OVEN_UPPER: 1,
        PASTA: 2,
        HEAT: 3,
        FLOOR_PREP: 4,
        OTHER: 5
    };
    const STABLE_COLLATOR = new Intl.Collator("ja", { numeric: true });

    function normalizeCode(item) {
        return String(item.code ?? item.menuCode ?? "").trim();
    }

    function resolveRecipe(item) {
        const code = normalizeCode(item);
        const category = String(item.menuCategory || item.category || "").toLowerCase();
        const station = String(item.station || item.prepStation || "").toLowerCase();
        const fallbackMinutes = Math.max(0.5, Number(item.cookTime) || 0.5);

        if (LOWER_OVEN_CODES.has(code)) {
            return {
                resource: "OVEN_LOWER",
                resourceLabel: "下段オーブン 5:30",
                durationSeconds: 330,
                trayUnits: 1,
                passes: 1,
                instruction: "下段へ投入"
            };
        }

        if (UPPER_OVEN_CODES.has(code)) {
            return {
                resource: "OVEN_UPPER",
                resourceLabel: "上段オーブン 3:00",
                durationSeconds: 180,
                trayUnits: 1,
                passes: 1,
                instruction: "上段へ投入"
            };
        }

        if (category === "pasta") {
            return {
                resource: "PASTA",
                resourceLabel: "自動IH 麺3:00＋ソース1:00",
                durationSeconds: 180,
                trayUnits: 1,
                passes: 1,
                instruction: "麺とソースを並行開始"
            };
        }

        if (CHICKEN_FINISH_CODES.has(code)) {
            return {
                resource: "OVEN_UPPER",
                resourceLabel: "上段オーブン 3:00",
                durationSeconds: 180,
                trayUnits: 1,
                passes: 1,
                instruction: "仕込み済み鶏＋ポテト・コーン"
            };
        }

        if (HAMBURGER_CODES.has(code)) {
            const eggNote = code === "2403" ? "卵なし" : "最後に焼き卵を載せる";
            return {
                resource: "OVEN_UPPER",
                resourceLabel: "上段オーブン 3:00×2",
                durationSeconds: 360,
                trayUnits: 1,
                passes: 2,
                instruction: `肉3分→ポテト・コーン3分／${eggNote}`
            };
        }

        if (code === "2417") {
            return {
                resource: "OVEN_UPPER",
                resourceLabel: "上段オーブン 3:00・左右2枚",
                durationSeconds: 180,
                trayUnits: 2,
                passes: 1,
                instruction: "肉と付合せを別鉄板で同時投入・提供時に裏返す"
            };
        }

        if (code === "2418") {
            return {
                resource: "OVEN_UPPER",
                resourceLabel: "上段オーブン 6:00（暫定）",
                durationSeconds: 360,
                trayUnits: 1,
                passes: 2,
                provisional: true,
                instruction: "全部載せ・6分（工程は要実測確認）"
            };
        }

        if (station === "kitchen" && fallbackMinutes >= 5) {
            return {
                resource: "OVEN_LOWER",
                resourceLabel: "下段オーブン 5:30",
                durationSeconds: 330,
                trayUnits: 1,
                passes: 1,
                instruction: "下段へ投入（商品設定から推定）"
            };
        }

        if (station === "kitchen" && fallbackMinutes >= 3) {
            return {
                resource: "OVEN_UPPER",
                resourceLabel: "上段オーブン 3:00",
                durationSeconds: Math.round(fallbackMinutes * 60),
                trayUnits: 1,
                passes: 1,
                instruction: "上段へ投入（商品設定から推定）"
            };
        }

        const resource = station === "flor" || station === "floor" ? "FLOOR_PREP" :
            (station === "heat" ? "HEAT" : "OTHER");
        const resourceLabel = resource === "FLOOR_PREP" ? "フロア準備" :
            (resource === "HEAT" ? "ヒート台" : "その他工程");

        return {
            resource,
            resourceLabel,
            durationSeconds: Math.round(fallbackMinutes * 60),
            trayUnits: 1,
            passes: 1,
            instruction: `${resourceLabel}で調理`
        };
    }

    function stableCompare(a, b) {
        return STABLE_COLLATOR.compare(String(a ?? ""), String(b ?? ""));
    }

    function priorityCompare(a, b) {
        if (a._tablePriorityRank !== b._tablePriorityRank) {
            return a._tablePriorityRank - b._tablePriorityRank;
        }
        const aOverdue = a._slackSeconds < 0 ? 0 : 1;
        const bOverdue = b._slackSeconds < 0 ? 0 : 1;
        if (aOverdue !== bOverdue) return aOverdue - bOverdue;
        if (a._slackSeconds !== b._slackSeconds) return a._slackSeconds - b._slackSeconds;
        if (a._createdAtMs !== b._createdAtMs) return a._createdAtMs - b._createdAtMs;
        if (a._desiredStartSeconds !== b._desiredStartSeconds) {
            return a._desiredStartSeconds - b._desiredStartSeconds;
        }
        if (a._recipe.durationSeconds !== b._recipe.durationSeconds) {
            return b._recipe.durationSeconds - a._recipe.durationSeconds;
        }
        const tableDiff = stableCompare(a.table, b.table);
        if (tableDiff) return tableDiff;
        const orderDiff = stableCompare(a.orderId, b.orderId);
        if (orderDiff) return orderDiff;
        return stableCompare(a.itemId ?? a.itemIndex, b.itemId ?? b.itemIndex);
    }

    function prepare(items, nowMs, settings) {
        const enriched = items.map((item, index) => ({
            ...item,
            _inputIndex: index,
            _recipe: resolveRecipe(item),
            _createdAtMs: Number(item.createdAtMs) || nowMs,
            _table: String(item.table ?? "--")
        }));

        const longestByTable = new Map();
        const oldestByTable = new Map();
        for (const task of enriched) {
            longestByTable.set(
                task._table,
                Math.max(longestByTable.get(task._table) || 0, task._recipe.durationSeconds)
            );
            oldestByTable.set(
                task._table,
                Math.min(oldestByTable.get(task._table) ?? Number.POSITIVE_INFINITY, task._createdAtMs)
            );
        }

        // Every resource uses the same table order. Without this shared order,
        // upper and lower ovens can each put a different table first and table
        // synchronization oscillates forever (a classic job-shop cycle).
        const tablePriority = new Map(
            [...longestByTable.keys()]
                .sort((a, b) => {
                    const aSlack = (oldestByTable.get(a) + settings.targetWaitMinutes * 60000 - nowMs) / 1000 -
                        longestByTable.get(a);
                    const bSlack = (oldestByTable.get(b) + settings.targetWaitMinutes * 60000 - nowMs) / 1000 -
                        longestByTable.get(b);
                    const aOverdue = aSlack < 0 ? 0 : 1;
                    const bOverdue = bSlack < 0 ? 0 : 1;
                    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
                    if (aSlack !== bSlack) return aSlack - bSlack;
                    if (oldestByTable.get(a) !== oldestByTable.get(b)) {
                        return oldestByTable.get(a) - oldestByTable.get(b);
                    }
                    return stableCompare(a, b);
                })
                .map((table, index) => [table, index])
        );

        return enriched.map(task => {
            const tableCriticalSeconds = longestByTable.get(task._table) || task._recipe.durationSeconds;
            const dueAtMs = task._createdAtMs + settings.targetWaitMinutes * 60000;
            const anchoredFinishSeconds = tableTargetFinishSeconds(settings, task._table);
            const desiredStartSeconds = Math.max(
                0,
                tableCriticalSeconds - task._recipe.durationSeconds,
                anchoredFinishSeconds - task._recipe.durationSeconds
            );
            return {
                ...task,
                _tablePriorityRank: tablePriority.get(task._table),
                _baseDesiredStartSeconds: desiredStartSeconds,
                _desiredStartSeconds: desiredStartSeconds,
                _slackSeconds: (dueAtMs - nowMs) / 1000 - tableCriticalSeconds,
                _dueAtMs: dueAtMs
            };
        });
    }

    function partnerCompare(seed, a, b) {
        const aSameTable = a._table === seed._table ? 0 : 1;
        const bSameTable = b._table === seed._table ? 0 : 1;
        if (aSameTable !== bSameTable) return aSameTable - bSameTable;
        const aSlackDistance = Math.abs(a._slackSeconds - seed._slackSeconds);
        const bSlackDistance = Math.abs(b._slackSeconds - seed._slackSeconds);
        if (aSlackDistance !== bSlackDistance) return aSlackDistance - bSlackDistance;
        return priorityCompare(a, b);
    }

    function resourceNotBeforeSeconds(settings, resource) {
        const constraint = settings.resourceNotBeforeSeconds;
        if (Number.isFinite(Number(constraint))) return Math.max(0, Number(constraint));
        if (!constraint || typeof constraint !== "object") return 0;
        const value = constraint[resource] ?? constraint.default ?? 0;
        return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
    }

    function tableTargetFinishSeconds(settings, table) {
        const targets = settings.tableTargetFinishSeconds;
        const value = targets instanceof Map ? targets.get(table) : targets?.[table];
        return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
    }

    function fixedReservations(settings, resource, feedSeconds) {
        if (!Array.isArray(settings.fixedReservations)) return [];
        const byTime = new Map();
        for (const reservation of settings.fixedReservations) {
            if (!reservation || reservation.resource !== resource) continue;
            const time = Number(reservation.startSeconds);
            const usedUnits = Number(reservation.trayUnits ?? 1);
            if (!Number.isFinite(time) || time < 0) {
                throw new RangeError(`${resource} の固定予約時刻が不正です`);
            }
            if (!Number.isInteger(usedUnits) || usedUnits < 1 || usedUnits > 2) {
                throw new RangeError(`${resource} の固定予約レーン数が不正です`);
            }
            byTime.set(time, (byTime.get(time) || 0) + usedUnits);
        }

        const reservations = [...byTime]
            .map(([time, usedUnits]) => {
                if (usedUnits > 2) {
                    throw new RangeError(`${resource} の固定予約が2レーンを超えています`);
                }
                return { time, usedUnits, fixed: true };
            })
            .sort((a, b) => a.time - b.time);

        for (let index = 1; index < reservations.length; index += 1) {
            if (reservations[index].time - reservations[index - 1].time < feedSeconds - 1e-9) {
                throw new RangeError(`${resource} の固定予約が投入間隔を満たしていません`);
            }
        }
        return reservations;
    }

    function passStarts(task, firstStartSeconds) {
        const passes = Math.max(1, Number(task._recipe.passes) || 1);
        const passDurationSeconds = task._recipe.durationSeconds / passes;
        return Array.from({ length: passes }, (_, index) =>
            firstStartSeconds + index * passDurationSeconds
        );
    }

    function sameTime(a, b) {
        return Math.abs(a - b) <= 1e-9;
    }

    function slotPosition(slots, time) {
        let low = 0;
        let high = slots.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (slots[middle].time < time) low = middle + 1;
            else high = middle;
        }
        return low;
    }

    function slotAt(slots, time) {
        const position = slotPosition(slots, time);
        if (position < slots.length && sameTime(slots[position].time, time)) return slots[position];
        if (position > 0 && sameTime(slots[position - 1].time, time)) return slots[position - 1];
        return undefined;
    }

    function canPlacePasses(task, firstStartSeconds, slots, feedSeconds) {
        const units = Math.max(1, Number(task._recipe.trayUnits) || 1);
        const starts = passStarts(task, firstStartSeconds);

        for (let index = 0; index < starts.length; index += 1) {
            for (let other = index + 1; other < starts.length; other += 1) {
                if (Math.abs(starts[index] - starts[other]) < feedSeconds - 1e-9) return false;
            }

            const position = slotPosition(slots, starts[index]);
            const nearby = slots.slice(Math.max(0, position - 1), Math.min(slots.length, position + 2));
            for (const slot of nearby) {
                const distance = Math.abs(starts[index] - slot.time);
                if (sameTime(starts[index], slot.time)) {
                    if (slot.usedUnits + units > 2) return false;
                } else if (distance < feedSeconds - 1e-9) {
                    return false;
                }
            }
        }

        return true;
    }

    function earliestFeasibleStart(task, minimumStartSeconds, slots, feedSeconds) {
        const minimum = Math.max(0, minimumStartSeconds);
        const offsets = passStarts(task, 0);
        const candidates = new Set([minimum]);

        // A first pass can either share an existing feed position or start at the
        // first legal point after it. These boundaries contain the earliest
        // feasible answer for every existing reservation and every later pass.
        for (const slot of slots) {
            for (const offset of offsets) {
                const sharedStart = slot.time - offset;
                const afterStart = slot.time + feedSeconds - offset;
                if (sharedStart >= minimum - 1e-9) candidates.add(Math.max(minimum, sharedStart));
                if (afterStart >= minimum - 1e-9) candidates.add(Math.max(minimum, afterStart));
            }
        }

        const ordered = [...candidates].sort((a, b) => a - b);
        for (const candidate of ordered) {
            if (canPlacePasses(task, candidate, slots, feedSeconds)) return candidate;
        }

        // The boundary set above should always yield a result. Keep a bounded
        // fallback for malformed external reservations rather than hanging KDS.
        let candidate = ordered[ordered.length - 1] || minimum;
        for (let attempt = 0; attempt < slots.length * 4 + 16; attempt += 1) {
            candidate += feedSeconds;
            if (canPlacePasses(task, candidate, slots, feedSeconds)) return candidate;
        }
        throw new Error("オーブン投入枠を確保できませんでした");
    }

    function reserveTaskPasses(task, firstStartSeconds, slots) {
        const units = Math.max(1, Number(task._recipe.trayUnits) || 1);
        const starts = passStarts(task, firstStartSeconds);
        const lanes = [];

        for (const start of starts) {
            let slot = slotAt(slots, start);
            const usedBefore = slot ? slot.usedUnits : 0;
            lanes.push(units === 2 ? "左右" : String(usedBefore + 1));
            if (slot) {
                slot.usedUnits += units;
            } else {
                slot = { time: start, usedUnits: units, fixed: false };
                slots.splice(slotPosition(slots, start), 0, slot);
            }
        }
        return { starts, lanes };
    }

    function scheduleOven(tasks, resource, feedSeconds, settings) {
        // One order-detail row may represent several physical trays. Expand it
        // only inside the oven model, then collapse it back to one KDS row.
        const remaining = tasks.flatMap(task => {
            const quantity = Math.max(1, Math.ceil(Number(task.qty) || 1));
            return Array.from({ length: quantity }, (_, unitIndex) => ({
                ...task,
                _sourceTask: task,
                _unitIndex: unitIndex
            }));
        });
        const scheduledUnits = [];
        const slots = fixedReservations(settings, resource, feedSeconds);
        const notBefore = resourceNotBeforeSeconds(settings, resource);
        let cursorSeconds = Math.max(notBefore, Math.min(...remaining.map(task => task._desiredStartSeconds)));

        function scheduleAt(task, startSeconds) {
            const reservation = reserveTaskPasses(task, startSeconds, slots);
            scheduledUnits.push({
                ...task,
                scheduleStartSeconds: startSeconds,
                scheduleFinishSeconds: startSeconds + task._recipe.durationSeconds,
                ovenPassStartSeconds: reservation.starts,
                ovenPassLanes: reservation.lanes,
                lane: task._recipe.trayUnits === 2 ? "左右" : reservation.lanes[0]
            });
            remaining.splice(remaining.indexOf(task), 1);
        }

        while (remaining.length) {
            const earliestDesired = Math.max(
                notBefore,
                Math.min(...remaining.map(task => task._desiredStartSeconds))
            );
            cursorSeconds = Math.max(cursorSeconds, earliestDesired);

            let available = remaining
                .filter(task => Math.max(notBefore, task._desiredStartSeconds) <= cursorSeconds + 1e-9)
                .sort(priorityCompare);
            if (!available.length) {
                cursorSeconds = earliestDesired;
                available = remaining
                    .filter(task => Math.max(notBefore, task._desiredStartSeconds) <= cursorSeconds + 1e-9)
                    .sort(priorityCompare);
            }

            const seed = available[0];
            const seedStart = earliestFeasibleStart(
                seed,
                Math.max(cursorSeconds, seed._desiredStartSeconds, notBefore),
                slots,
                feedSeconds
            );
            scheduleAt(seed, seedStart);

            if (seed._recipe.trayUnits === 1) {
                const partner = available
                    .filter(task => task !== seed && task._recipe.trayUnits === 1)
                    .sort((a, b) => partnerCompare(seed, a, b))
                    .find(task => canPlacePasses(task, seedStart, slots, feedSeconds));
                if (partner) scheduleAt(partner, seedStart);
            }

            cursorSeconds = seedStart;
        }

        const scheduledByInput = new Map();
        for (const unit of scheduledUnits) {
            const key = unit._sourceTask._inputIndex;
            if (!scheduledByInput.has(key)) {
                scheduledByInput.set(key, {
                    ...unit._sourceTask,
                    scheduleStartSeconds: unit.scheduleStartSeconds,
                    scheduleFinishSeconds: unit.scheduleFinishSeconds,
                    ovenPassStartSeconds: [],
                    ovenPassLanes: [],
                    ovenFeedEvents: [],
                    lane: "-"
                });
            }
            const aggregate = scheduledByInput.get(key);
            aggregate.scheduleStartSeconds = Math.min(
                aggregate.scheduleStartSeconds,
                unit.scheduleStartSeconds
            );
            aggregate.scheduleFinishSeconds = Math.max(
                aggregate.scheduleFinishSeconds,
                unit.scheduleFinishSeconds
            );
            unit.ovenPassStartSeconds.forEach((startSeconds, passIndex) => {
                aggregate.ovenPassStartSeconds.push(startSeconds);
                aggregate.ovenPassLanes.push(unit.ovenPassLanes[passIndex]);
                aggregate.ovenFeedEvents.push({
                    startSeconds,
                    pass: passIndex + 1,
                    unit: unit._unitIndex + 1,
                    trayUnits: unit._recipe.trayUnits,
                    lane: unit.ovenPassLanes[passIndex]
                });
            });
        }

        const scheduled = [...scheduledByInput.values()];
        scheduled.forEach(task => {
            task.ovenFeedEvents.sort((a, b) =>
                a.startSeconds - b.startSeconds || a.pass - b.pass || a.unit - b.unit
            );
            task.ovenPassStartSeconds = task.ovenFeedEvents.map(event => event.startSeconds);
            task.ovenPassLanes = task.ovenFeedEvents.map(event => event.lane);
            task.lane = task.ovenFeedEvents.length === task._recipe.passes ?
                task.ovenFeedEvents[0].lane : "複数";
        });

        const batchStarts = [...new Set(scheduled.map(task => task.scheduleStartSeconds))]
            .sort((a, b) => a - b);
        const batchByStart = new Map(batchStarts.map((start, index) => [start, index + 1]));
        scheduled.forEach(task => {
            task.batchNumber = batchByStart.get(task.scheduleStartSeconds);
        });

        return scheduled;
    }

    function scheduleOther(tasks, resource, settings) {
        const notBefore = resourceNotBeforeSeconds(settings, resource);
        return [...tasks]
            .sort((a, b) => {
                if (a._desiredStartSeconds !== b._desiredStartSeconds) {
                    return a._desiredStartSeconds - b._desiredStartSeconds;
                }
                return priorityCompare(a, b);
            })
            .map((task, index) => ({
                ...task,
                scheduleStartSeconds: Math.max(notBefore, task._desiredStartSeconds),
                scheduleFinishSeconds: Math.max(notBefore, task._desiredStartSeconds) + task._recipe.durationSeconds,
                batchNumber: index + 1,
                lane: "-"
            }));
    }

    function scheduleResources(tasks, settings) {
        const byResource = new Map();
        for (const task of tasks) {
            const key = task._recipe.resource;
            if (!byResource.has(key)) byResource.set(key, []);
            byResource.get(key).push(task);
        }

        const scheduled = [];
        for (const [resource, resourceTasks] of byResource) {
            if (resource === "OVEN_UPPER") {
                scheduled.push(...scheduleOven(resourceTasks, resource, settings.upperFeedSeconds, settings));
            } else if (resource === "OVEN_LOWER") {
                scheduled.push(...scheduleOven(resourceTasks, resource, settings.lowerFeedSeconds, settings));
            } else {
                scheduled.push(...scheduleOther(resourceTasks, resource, settings));
            }
        }
        return scheduled;
    }

    function synchronizationSpread(scheduled) {
        const resourceFinishByTable = new Map();
        for (const task of scheduled) {
            if (!resourceFinishByTable.has(task._table)) {
                resourceFinishByTable.set(task._table, new Map());
            }
            const byResource = resourceFinishByTable.get(task._table);
            byResource.set(
                task._recipe.resource,
                Math.max(byResource.get(task._recipe.resource) || 0, task.scheduleFinishSeconds)
            );
        }

        const byTable = {};
        const shape = [];
        const absoluteShape = [];
        let maximum = 0;
        for (const [table, byResource] of [...resourceFinishByTable]
            .sort(([a], [b]) => stableCompare(a, b))) {
            const finishes = [...byResource.values()];
            const spread = finishes.length > 1 ? Math.max(...finishes) - Math.min(...finishes) : 0;
            byTable[table] = spread;
            maximum = Math.max(maximum, spread);
            const tableMaximum = Math.max(...finishes);
            shape.push([
                table,
                [...byResource]
                    .sort(([a], [b]) => stableCompare(a, b))
                    .map(([resource, finish]) => [resource, finish - tableMaximum])
            ]);
            absoluteShape.push([
                table,
                [...byResource].sort(([a], [b]) => stableCompare(a, b))
            ]);
        }
        return {
            maximum,
            byTable,
            signature: JSON.stringify(shape),
            absoluteSignature: JSON.stringify(absoluteShape)
        };
    }

    function synchronizeTables(tasks, settings) {
        const requestedLimit = Number(settings.maxSyncIterations);
        const maximumIterations = Number.isInteger(requestedLimit) && requestedLimit > 0 ?
            Math.min(64, requestedLimit) : 64;
        let scheduled = [];
        let iterations = 0;
        let previousActualStartByInput = new Map();
        const toleranceValue = Number(settings.syncToleranceSeconds);
        const syncToleranceSeconds = Number.isFinite(toleranceValue) ?
            Math.max(0, toleranceValue) :
            Math.floor(Math.max(settings.upperFeedSeconds, settings.lowerFeedSeconds) / 2);
        const largeBacklogThreshold = Math.max(1, Number(settings.largeBacklogThreshold) || 30);
        const hasExternalFloor = Boolean(settings.resourceNotBeforeSeconds) ||
            (Array.isArray(settings.fixedReservations) && settings.fixedReservations.length > 0);

        for (; iterations < maximumIterations; iterations += 1) {
            scheduled = scheduleResources(tasks, settings);
            const tableTargets = new Map();
            const resourceTargets = new Map();
            const scheduledByInput = new Map();

            for (const task of scheduled) {
                scheduledByInput.set(task._inputIndex, task);
                tableTargets.set(
                    task._table,
                    Math.max(
                        tableTargets.get(task._table) || 0,
                        tableTargetFinishSeconds(settings, task._table),
                        task.scheduleFinishSeconds
                    )
                );
                const groupKey = `${task._table}\u0000${task._recipe.resource}`;
                resourceTargets.set(
                    groupKey,
                    Math.max(resourceTargets.get(groupKey) || 0, task.scheduleFinishSeconds)
                );
            }

            const spread = synchronizationSpread(scheduled);
            if (tasks.length >= largeBacklogThreshold &&
                spread.maximum > 0 && spread.maximum <= syncToleranceSeconds) {
                return {
                    scheduled,
                    iterations: iterations + 1,
                    iterationLimit: maximumIterations,
                    converged: false,
                    stopReason: "within-feed-tolerance",
                    spread,
                    syncToleranceSeconds
                };
            }

            let changed = false;
            for (const task of tasks) {
                const groupKey = `${task._table}\u0000${task._recipe.resource}`;
                const difference = (tableTargets.get(task._table) || 0) -
                    (resourceTargets.get(groupKey) || 0);
                if (difference > 1e-9) {
                    const actualStartSeconds = scheduledByInput.get(task._inputIndex)
                        ?.scheduleStartSeconds ?? task._desiredStartSeconds;
                    const actualDidNotMove = sameTime(
                        previousActualStartByInput.get(task._inputIndex),
                        actualStartSeconds
                    );
                    task._desiredStartSeconds += difference;
                    if (actualDidNotMove && hasExternalFloor) {
                        // The wish is below a not-before/fixed-reservation floor.
                        // Jump from the actual feasible start after one observed
                        // plateau instead of inching forward for up to 43 loops.
                        task._desiredStartSeconds = Math.max(
                            task._desiredStartSeconds,
                            actualStartSeconds + difference
                        );
                    }
                    changed = true;
                }
            }
            previousActualStartByInput = new Map(
                [...scheduledByInput].map(([inputIndex, task]) => [inputIndex, task.scheduleStartSeconds])
            );

            if (!changed) {
                return {
                    scheduled,
                    iterations: iterations + 1,
                    iterationLimit: maximumIterations,
                    converged: true,
                    stopReason: "converged",
                    spread,
                    syncToleranceSeconds
                };
            }
        }

        // Apply the final desired starts when a heavily interlocked backlog hits
        // the iteration cap. This keeps runtime bounded and output self-consistent.
        scheduled = scheduleResources(tasks, settings);
        return {
            scheduled,
            iterations: iterations + 1,
            iterationLimit: maximumIterations,
            converged: false,
            stopReason: "iteration-limit",
            spread: synchronizationSpread(scheduled),
            syncToleranceSeconds
        };
    }

    function scheduleKitchenItems(items, options = {}) {
        if (!Array.isArray(items) || items.length === 0) {
            return {
                items: [],
                exact: true,
                score: 0,
                evaluatedTransitions: 0,
                model: "resource-slot-v3",
                syncSpreadSeconds: 0,
                syncSpreadByTable: {},
                assumptions: {
                    ...DEFAULTS,
                    ...options,
                    tablePriorityPolicy: "oldest-table-first-across-resources",
                    syncConverged: true,
                    syncIterations: 0,
                    syncIterationLimit: 0,
                    syncStopReason: "converged"
                }
            };
        }

        const settings = { ...DEFAULTS, ...options };
        const nowMs = Number(options.nowMs) || Date.now();
        const tasks = prepare(items, nowMs, settings);
        const synchronized = synchronizeTables(tasks, settings);
        const scheduled = synchronized.scheduled;

        scheduled.sort((a, b) => {
            if (a.scheduleStartSeconds !== b.scheduleStartSeconds) {
                return a.scheduleStartSeconds - b.scheduleStartSeconds;
            }
            const priority = priorityCompare(a, b);
            if (priority) return priority;
            const resource = (RESOURCE_ORDER[a._recipe.resource] ?? 99) -
                (RESOURCE_ORDER[b._recipe.resource] ?? 99);
            if (resource) return resource;
            return a._inputIndex - b._inputIndex;
        });

        const resultItems = scheduled.map((task, index) => ({
            ...items[task._inputIndex],
            sequence: index + 1,
            recipe: { ...task._recipe },
            scheduleStartSeconds: Math.round(task.scheduleStartSeconds),
            scheduleFinishSeconds: Math.round(task.scheduleFinishSeconds),
            batchNumber: task.batchNumber,
            lane: task.lane,
            ovenPassStartSeconds: task.ovenPassStartSeconds?.map(value => Math.round(value)),
            passStartSeconds: task.ovenPassStartSeconds?.map(value => Math.round(value)),
            ovenPassLanes: task.ovenPassLanes ? [...task.ovenPassLanes] : undefined,
            ovenFeedEvents: task.ovenFeedEvents?.map(event => ({
                ...event,
                startSeconds: Math.round(event.startSeconds)
            })),
            slackSeconds: Math.round(task._slackSeconds)
        }));

        const score = resultItems.reduce((sum, item) =>
            sum + Math.max(0, item.scheduleFinishSeconds - Math.max(0, item.slackSeconds)), 0);

        return {
            items: resultItems,
            exact: synchronized.converged,
            score,
            evaluatedTransitions: tasks.length * synchronized.iterations,
            model: "resource-slot-v3",
            syncSpreadSeconds: Math.round(synchronized.spread.maximum),
            syncSpreadByTable: Object.fromEntries(
                Object.entries(synchronized.spread.byTable)
                    .map(([table, spread]) => [table, Math.round(spread)])
            ),
            assumptions: {
                targetWaitMinutes: settings.targetWaitMinutes,
                upperFeedSeconds: settings.upperFeedSeconds,
                lowerFeedSeconds: settings.lowerFeedSeconds,
                ovenLanes: 2,
                tablePriorityPolicy: "oldest-table-first-across-resources",
                syncConverged: synchronized.converged,
                syncIterations: synchronized.iterations,
                syncIterationLimit: synchronized.iterationLimit,
                syncStopReason: synchronized.stopReason,
                syncToleranceSeconds: synchronized.syncToleranceSeconds,
                largeBacklogThreshold: Math.max(1, Number(settings.largeBacklogThreshold) || 30),
                anchoredTableCount: settings.tableTargetFinishSeconds instanceof Map ?
                    settings.tableTargetFinishSeconds.size :
                    Object.keys(settings.tableTargetFinishSeconds || {}).length,
                resourceNotBeforeSeconds: settings.resourceNotBeforeSeconds || 0,
                fixedReservationCount: Array.isArray(settings.fixedReservations) ?
                    settings.fixedReservations.length : 0
            }
        };
    }

    return { scheduleKitchenItems, resolveRecipe };
});
