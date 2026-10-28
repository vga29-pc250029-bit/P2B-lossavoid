const assert = require('node:assert/strict');
const { test } = require('node:test');
const { performance } = require('node:perf_hooks');
const { resolveRecipe, scheduleKitchenItems } = require('../src/main/resources/static/kitchen-scheduler.js');

const NOW = Date.parse('2026-10-23T03:00:00Z');

function item(overrides = {}) {
    return {
        orderId: '1',
        itemId: String(overrides.itemId ?? Math.random()),
        itemIndex: 0,
        table: '01',
        createdAtMs: NOW - 5 * 60000,
        qty: 1,
        code: '1305',
        name: '田舎風ミネストローネ',
        cookTime: 3,
        menuCategory: 'appetizer',
        station: 'kitchen',
        ...overrides
    };
}

test('uses the real 330-second lower conveyor time instead of rounded six minutes', () => {
    const recipe = resolveRecipe(item({ code: '1401', name: '辛味チキン', cookTime: 6 }));
    assert.equal(recipe.resource, 'OVEN_LOWER');
    assert.equal(recipe.durationSeconds, 330);
    assert.equal(recipe.resourceLabel, '下段オーブン 5:30');
});

test('loads two upper-oven pans side by side and advances the next pair after 23 seconds', () => {
    const input = [0, 1, 2].map(index => item({ itemId: String(index), orderId: String(index) }));
    const result = scheduleKitchenItems(input, { nowMs: NOW });
    assert.deepEqual(result.items.map(value => value.scheduleStartSeconds), [0, 0, 23]);
    assert.deepEqual(result.items.map(value => value.batchNumber), [1, 1, 2]);
    assert.deepEqual(result.items.slice(0, 2).map(value => value.lane), ['1', '2']);
});

test('uses a 43-second continuous-feed pitch on the lower conveyor', () => {
    const input = [0, 1, 2].map(index => item({
        itemId: String(index), orderId: String(index), code: '2101', name: 'ミラノ風ドリア', cookTime: 6,
        menuCategory: 'doria'
    }));
    const result = scheduleKitchenItems(input, { nowMs: NOW });
    assert.deepEqual(result.items.map(value => value.scheduleStartSeconds), [0, 0, 43]);
});

test('delays shorter same-table dishes so upper, lower and pasta finish together', () => {
    const input = [
        item({ itemId: 'lower', code: '2101', name: 'ミラノ風ドリア', cookTime: 6, menuCategory: 'doria' }),
        item({ itemId: 'upper', code: '1305', name: '田舎風ミネストローネ' }),
        item({ itemId: 'pasta', code: '2303', name: 'ペペロンチーノ', menuCategory: 'pasta', station: 'heat' })
    ];
    const result = scheduleKitchenItems(input, { nowMs: NOW });
    const byId = new Map(result.items.map(value => [value.itemId, value]));
    assert.equal(byId.get('lower').scheduleStartSeconds, 0);
    assert.equal(byId.get('upper').scheduleStartSeconds, 150);
    assert.equal(byId.get('pasta').scheduleStartSeconds, 150);
    assert.equal(byId.get('lower').scheduleFinishSeconds, 330);
    assert.equal(byId.get('upper').scheduleFinishSeconds, 330);
    assert.equal(byId.get('pasta').scheduleFinishSeconds, 330);
});

test('pairs lower-oven dishes from different tables when both lanes are free', () => {
    const input = [
        item({ itemId: 'a', table: '01', code: '1401', name: '辛味チキン', cookTime: 6 }),
        item({ itemId: 'b', table: '02', code: '2101', name: 'ミラノ風ドリア', cookTime: 6, menuCategory: 'doria' })
    ];
    const result = scheduleKitchenItems(input, { nowMs: NOW });
    assert.deepEqual(result.items.map(value => value.scheduleStartSeconds), [0, 0]);
    assert.deepEqual(new Set(result.items.map(value => value.table)), new Set(['01', '02']));
});

test('reserves both upper lanes for lamb meat and sides', () => {
    const input = [
        item({ itemId: 'lamb', code: '2417', name: 'ラム（仔羊）のランプステーキ', menuCategory: 'meat', createdAtMs: NOW - 20 * 60000 }),
        item({ itemId: 'pizza-a', code: '2203', name: 'マルゲリータピザ', menuCategory: 'pizza' }),
        item({ itemId: 'pizza-b', code: '2204', name: '野菜ときのこのピザ', menuCategory: 'pizza' })
    ];
    const result = scheduleKitchenItems(input, { nowMs: NOW });
    const lamb = result.items.find(value => value.itemId === 'lamb');
    assert.equal(lamb.batchNumber, 1);
    assert.equal(lamb.lane, '左右');
    assert.ok(result.items.filter(value => value.itemId !== 'lamb').every(value => value.batchNumber > 1));
});

test('maps peak chicken finishing and two-pass hamburgers explicitly', () => {
    const chicken = resolveRecipe(item({ code: '2402', name: '若鶏のディアボラ風', menuCategory: 'meat' }));
    const hamburger = resolveRecipe(item({ code: '2406', name: 'ハンバーグステーキ', menuCategory: 'meat', cookTime: 6 }));
    assert.equal(chicken.durationSeconds, 180);
    assert.match(chicken.instruction, /仕込み済み鶏/);
    assert.equal(hamburger.durationSeconds, 360);
    assert.equal(hamburger.passes, 2);
});

test('reserves every two-pass oven feed without violating lane capacity or pitch', () => {
    const input = [
        item({
            itemId: 'hamburger', table: '90', code: '2406', name: 'ハンバーグステーキ',
            menuCategory: 'meat', cookTime: 6
        }),
        ...Array.from({ length: 12 }, (_, index) => item({
            itemId: `pizza-${index}`,
            orderId: `pizza-${index}`,
            table: String(index + 1).padStart(2, '0'),
            code: '2203',
            name: `pizza-${index}`,
            menuCategory: 'pizza'
        }))
    ];
    const result = scheduleKitchenItems(input, { nowMs: NOW });
    const hamburger = result.items.find(value => value.itemId === 'hamburger');

    assert.equal(hamburger.passStartSeconds.length, 2);
    assert.equal(hamburger.passStartSeconds[1] - hamburger.passStartSeconds[0], 180);
    assert.deepEqual(hamburger.ovenFeedEvents.map(event => event.pass), [1, 2]);

    const usageByTime = new Map();
    for (const scheduled of result.items.filter(value => value.recipe.resource === 'OVEN_UPPER')) {
        for (const event of scheduled.ovenFeedEvents) {
            usageByTime.set(
                event.startSeconds,
                (usageByTime.get(event.startSeconds) || 0) + event.trayUnits
            );
        }
    }
    const times = [...usageByTime.keys()].sort((a, b) => a - b);
    assert.ok([...usageByTime.values()].every(units => units <= 2));
    assert.ok(times.slice(1).every((time, index) => time - times[index] >= 23));
});

test('reserves physical feed events for every quantity while keeping one KDS row', () => {
    const result = scheduleKitchenItems([
        item({ itemId: 'three-pizzas', qty: 3, code: '2203', name: 'マルゲリータ', menuCategory: 'pizza' })
    ], { nowMs: NOW });
    const scheduled = result.items[0];

    assert.equal(result.items.length, 1);
    assert.deepEqual(scheduled.passStartSeconds, [0, 0, 23]);
    assert.deepEqual(scheduled.ovenFeedEvents.map(event => event.unit), [1, 2, 3]);
    assert.equal(scheduled.scheduleFinishSeconds, 203);
    assert.equal(scheduled.lane, '複数');
});

test('keeps every quantity unit on its fixed second pass after three minutes', () => {
    const result = scheduleKitchenItems([
        item({
            itemId: 'three-hamburgers', qty: 3, code: '2406',
            name: 'ハンバーグステーキ', menuCategory: 'meat', cookTime: 6
        })
    ], { nowMs: NOW });
    const events = result.items[0].ovenFeedEvents;

    assert.equal(events.length, 6);
    for (const unit of [1, 2, 3]) {
        const feeds = events.filter(event => event.unit === unit);
        assert.deepEqual(feeds.map(event => event.pass), [1, 2]);
        assert.equal(feeds[1].startSeconds - feeds[0].startSeconds, 180);
    }
    assert.equal(result.items[0].scheduleFinishSeconds, 383);
});

test('packs quantity-two hamburgers into both lanes on both passes', () => {
    const result = scheduleKitchenItems([
        item({
            itemId: 'two-hamburgers', qty: 2, code: '2406',
            name: 'ハンバーグステーキ', menuCategory: 'meat', cookTime: 6
        })
    ], { nowMs: NOW });

    assert.deepEqual(result.items[0].passStartSeconds, [0, 0, 180, 180]);
    assert.equal(result.items[0].scheduleFinishSeconds, 360);
});

test('uses consecutive full feed positions for two quantity-two lamb plates', () => {
    const result = scheduleKitchenItems([
        item({
            itemId: 'two-lambs', qty: 2, code: '2417',
            name: 'ラムのランプステーキ', menuCategory: 'meat'
        })
    ], { nowMs: NOW });

    assert.deepEqual(result.items[0].passStartSeconds, [0, 23]);
    assert.deepEqual(result.items[0].ovenFeedEvents.map(event => event.trayUnits), [2, 2]);
    assert.equal(result.items[0].scheduleFinishSeconds, 203);
});

test('keeps a same-table upper dish aligned after a ten-dish lower backlog', () => {
    const backlog = Array.from({ length: 10 }, (_, index) => item({
        itemId: `lower-backlog-${index}`,
        orderId: `lower-backlog-${index}`,
        table: String(index + 1).padStart(2, '0'),
        code: '2101',
        name: `lower-backlog-${index}`,
        cookTime: 6,
        menuCategory: 'doria',
        createdAtMs: NOW - 20 * 60000
    }));
    const result = scheduleKitchenItems([
        ...backlog,
        item({ itemId: 'sync-lower', table: '99', code: '2101', name: 'ドリア', cookTime: 6, menuCategory: 'doria' }),
        item({ itemId: 'sync-upper', table: '99', code: '1305', name: 'ミネストローネ' })
    ], { nowMs: NOW });
    const lower = result.items.find(value => value.itemId === 'sync-lower');
    const upper = result.items.find(value => value.itemId === 'sync-upper');

    assert.equal(lower.scheduleFinishSeconds, 545);
    assert.equal(upper.scheduleStartSeconds, 365);
    assert.equal(upper.scheduleFinishSeconds, lower.scheduleFinishSeconds);
});

test('uses one table priority across resources to break a cross-oven ordering cycle', () => {
    const input = [
        item({ itemId: '1', orderId: '1', itemIndex: 1, table: '3', createdAtMs: 1792723440000, qty: 3, code: '2417', name: 'x1', menuCategory: 'meat', cookTime: 3 }),
        item({ itemId: '2', orderId: '2', itemIndex: 2, table: '1', createdAtMs: 1792724340000, qty: 2, code: '2101', name: 'x2', menuCategory: 'doria', cookTime: 6 }),
        item({ itemId: '3', orderId: '3', itemIndex: 3, table: '1', createdAtMs: 1792724100000, qty: 3, code: '2417', name: 'x3', menuCategory: 'meat', cookTime: 3 }),
        item({ itemId: '7', orderId: '7', itemIndex: 7, table: '3', createdAtMs: 1792723980000, qty: 2, code: '2101', name: 'x7', menuCategory: 'doria', cookTime: 6 }),
        item({ itemId: '11', orderId: '11', itemIndex: 11, table: '1', createdAtMs: 1792723380000, qty: 3, code: '2101', name: 'x11', menuCategory: 'doria', cookTime: 6 })
    ];
    const result = scheduleKitchenItems(input, { nowMs: NOW });
    const resourceFinish = new Map();
    for (const scheduled of result.items) {
        const key = `${scheduled.table}:${scheduled.recipe.resource}`;
        resourceFinish.set(key, Math.max(resourceFinish.get(key) || 0, scheduled.scheduleFinishSeconds));
    }

    assert.equal(resourceFinish.get('1:OVEN_LOWER'), resourceFinish.get('1:OVEN_UPPER'));
    assert.equal(resourceFinish.get('3:OVEN_LOWER'), resourceFinish.get('3:OVEN_UPPER'));
    assert.equal(result.syncSpreadSeconds, 0);
    assert.equal(result.exact, true);
    assert.equal(result.assumptions.tablePriorityPolicy, 'oldest-table-first-across-resources');
});

test('reports a bounded synchronization cap instead of claiming an exact plan', () => {
    const input = [
        item({ itemId: '1', orderId: '1', table: '3', createdAtMs: 1792723440000, qty: 3, code: '2417', menuCategory: 'meat' }),
        item({ itemId: '2', orderId: '2', table: '1', createdAtMs: 1792724340000, qty: 2, code: '2101', menuCategory: 'doria', cookTime: 6 }),
        item({ itemId: '3', orderId: '3', table: '1', createdAtMs: 1792724100000, qty: 3, code: '2417', menuCategory: 'meat' }),
        item({ itemId: '7', orderId: '7', table: '3', createdAtMs: 1792723980000, qty: 2, code: '2101', menuCategory: 'doria', cookTime: 6 }),
        item({ itemId: '11', orderId: '11', table: '1', createdAtMs: 1792723380000, qty: 3, code: '2101', menuCategory: 'doria', cookTime: 6 })
    ];
    const result = scheduleKitchenItems(input, { nowMs: NOW, maxSyncIterations: 1 });

    assert.equal(result.exact, false);
    assert.equal(result.assumptions.syncConverged, false);
    assert.equal(result.assumptions.syncIterationLimit, 1);
    assert.ok(result.syncSpreadSeconds > 0);
    assert.ok(Object.values(result.syncSpreadByTable).some(spread => spread > 0));
});

test('keeps an unlocked same-table dish on the locked finish anchor after reorganizing', () => {
    const initial = scheduleKitchenItems([
        item({ itemId: 'locked-lower', table: '01', code: '2101', name: 'ドリア', menuCategory: 'doria', cookTime: 6 }),
        item({ itemId: 'upper', table: '01', code: '1305', name: 'ミネストローネ' })
    ], { nowMs: NOW });
    const lockedFinish = initial.items.find(value => value.itemId === 'locked-lower').scheduleFinishSeconds;
    const oneSecondLater = scheduleKitchenItems([
        item({ itemId: 'upper', table: '01', code: '1305', name: 'ミネストローネ' })
    ], {
        nowMs: NOW + 1000,
        tableTargetFinishSeconds: { '01': lockedFinish - 1 }
    });
    const upper = oneSecondLater.items[0];

    assert.equal(upper.scheduleStartSeconds, 149);
    assert.equal(upper.scheduleFinishSeconds, 329);
    assert.equal(1 + upper.scheduleFinishSeconds, lockedFinish);
    assert.equal(oneSecondLater.assumptions.anchoredTableCount, 1);
});

test('honors oven not-before constraints and fixed feed reservations', () => {
    const result = scheduleKitchenItems([
        item({ itemId: 'a', table: '01' }),
        item({ itemId: 'b', table: '02' })
    ], {
        nowMs: NOW,
        resourceNotBeforeSeconds: { OVEN_UPPER: 60 },
        fixedReservations: [
            { resource: 'OVEN_UPPER', startSeconds: 60, trayUnits: 1 },
            { resource: 'OVEN_UPPER', startSeconds: 60, trayUnits: 1 }
        ]
    });

    assert.deepEqual(result.items.map(value => value.scheduleStartSeconds), [83, 83]);
    assert.equal(result.assumptions.fixedReservationCount, 2);
});

test('does not mistake progress below a not-before floor for synchronization stagnation', () => {
    const result = scheduleKitchenItems([
        item({ itemId: 'lower', table: '01', code: '2101', name: 'ドリア', menuCategory: 'doria', cookTime: 6 }),
        item({ itemId: 'upper', table: '01', code: '1305', name: 'ミネストローネ' })
    ], {
        nowMs: NOW,
        resourceNotBeforeSeconds: { OVEN_UPPER: 183 },
        fixedReservations: [{ resource: 'OVEN_LOWER', startSeconds: 0, trayUnits: 2 }],
        maxSyncIterations: 64
    });
    const byId = new Map(result.items.map(value => [value.itemId, value]));

    assert.equal(byId.get('lower').scheduleFinishSeconds, 373);
    assert.equal(byId.get('upper').scheduleStartSeconds, 193);
    assert.equal(byId.get('upper').scheduleFinishSeconds, 373);
    assert.equal(result.exact, true);
    assert.equal(result.syncSpreadSeconds, 0);
});

test('jumps across a one-second not-before plateau instead of exhausting iterations', () => {
    const result = scheduleKitchenItems([
        item({ itemId: 'lower', table: '01', code: '2101', name: 'ドリア', menuCategory: 'doria', cookTime: 6 }),
        item({ itemId: 'upper', table: '01', code: '1305', name: 'ミネストローネ' })
    ], {
        nowMs: NOW,
        resourceNotBeforeSeconds: { OVEN_UPPER: 192 },
        fixedReservations: [{ resource: 'OVEN_LOWER', startSeconds: 0, trayUnits: 2 }]
    });
    const byId = new Map(result.items.map(value => [value.itemId, value]));

    assert.equal(byId.get('lower').scheduleFinishSeconds, 373);
    assert.equal(byId.get('upper').scheduleStartSeconds, 193);
    assert.equal(byId.get('upper').scheduleFinishSeconds, 373);
    assert.equal(result.exact, true);
    assert.equal(result.syncSpreadSeconds, 0);
    assert.ok(result.assumptions.syncIterations < 8);
});

test('rejects fixed reservations that exceed lanes or violate feed pitch', () => {
    assert.throws(() => scheduleKitchenItems([item({ itemId: 'a' })], {
        nowMs: NOW,
        fixedReservations: [
            { resource: 'OVEN_UPPER', startSeconds: 0, trayUnits: 2 },
            { resource: 'OVEN_UPPER', startSeconds: 0, trayUnits: 1 }
        ]
    }), /2レーン/);

    assert.throws(() => scheduleKitchenItems([item({ itemId: 'a' })], {
        nowMs: NOW,
        fixedReservations: [
            { resource: 'OVEN_UPPER', startSeconds: 0, trayUnits: 1 },
            { resource: 'OVEN_UPPER', startSeconds: 22, trayUnits: 1 }
        ]
    }), /投入間隔/);
});

test('models pasta as a three-minute join with parallel one-minute sauce', () => {
    const pasta = resolveRecipe(item({ code: '2303', name: 'ペペロンチーノ', menuCategory: 'pasta', station: 'heat' }));
    assert.equal(pasta.resource, 'PASTA');
    assert.equal(pasta.durationSeconds, 180);
    assert.match(pasta.instruction, /並行/);
});

test('places an overdue dish before a newer dish at the same resource', () => {
    const input = [
        item({ itemId: 'new', table: '02', createdAtMs: NOW - 60000 }),
        item({ itemId: 'old', table: '01', createdAtMs: NOW - 20 * 60000 })
    ];
    const result = scheduleKitchenItems(input, { nowMs: NOW });
    assert.equal(result.items[0].itemId, 'old');
});

test('is deterministic and bounded for a large backlog', () => {
    const input = Array.from({ length: 40 }, (_, index) => item({
        itemId: String(index),
        orderId: String(index),
        table: String((index % 8) + 1).padStart(2, '0'),
        code: index % 2 ? '1305' : '2101',
        name: `dish-${index}`,
        cookTime: index % 2 ? 3 : 6,
        menuCategory: index % 2 ? 'appetizer' : 'doria'
    }));
    const first = scheduleKitchenItems(input, { nowMs: NOW });
    const second = scheduleKitchenItems(input, { nowMs: NOW });
    assert.equal(first.items.length, input.length);
    assert.equal(new Set(first.items.map(value => value.itemId)).size, input.length);
    assert.deepEqual(first, second);
});

test('keeps a complex quantity backlog within the KDS main-thread budget', () => {
    const recipes = [
        ['1305', 'appetizer', 3],
        ['2101', 'doria', 6],
        ['2406', 'meat', 6],
        ['2417', 'meat', 3]
    ];
    let state = 80;
    const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const input = Array.from({ length: 40 }, (_, index) => {
        const recipe = recipes[Math.floor(random() * recipes.length)];
        return item({
            itemId: String(index),
            orderId: String(index),
            table: String(1 + Math.floor(random() * 8)),
            createdAtMs: NOW - Math.floor(random() * 20) * 60000,
            qty: 1 + Math.floor(random() * 3),
            code: recipe[0],
            name: 'x',
            menuCategory: recipe[1],
            cookTime: recipe[2]
        });
    });

    const startedAt = performance.now();
    const result = scheduleKitchenItems(input, { nowMs: NOW });
    const elapsedMs = performance.now() - startedAt;

    assert.equal(result.items.length, 40);
    assert.ok(result.assumptions.syncIterations <= 16);
    assert.ok(elapsedMs < 500, `scheduler blocked for ${elapsedMs.toFixed(1)}ms`);
    if (!result.exact) {
        assert.ok(result.syncSpreadSeconds > 0);
        assert.match(result.assumptions.syncStopReason, /within-feed-tolerance|stagnated|iteration-limit/);
    }
});

test('allows a converging complex plan enough iterations to reach zero spread', () => {
    const recipes = [
        ['1305', 'appetizer', 3],
        ['2101', 'doria', 6],
        ['2406', 'meat', 6],
        ['2417', 'meat', 3],
        ['2418', 'meat', 6]
    ];
    let state = 72;
    const random = () => ((state = (state * 1103515245 + 12345) >>> 0) / 2 ** 32);
    const input = Array.from({ length: 20 }, (_, index) => {
        const recipe = recipes[Math.floor(random() * recipes.length)];
        return item({
            itemId: `72-${index}`,
            orderId: String(index),
            table: String(1 + Math.floor(random() * 6)),
            createdAtMs: NOW - Math.floor(random() * 20) * 60000,
            qty: 1 + Math.floor(random() * 4),
            code: recipe[0],
            name: 'x',
            menuCategory: recipe[1],
            cookTime: recipe[2]
        });
    });

    const result = scheduleKitchenItems(input, { nowMs: NOW });
    assert.equal(result.exact, true);
    assert.equal(result.syncSpreadSeconds, 0);
    assert.ok(result.assumptions.syncIterations <= 16);
    assert.equal(result.assumptions.syncStopReason, 'converged');
});

test('does not abandon a feasible twenty-row table synchronization at sixteen iterations', () => {
    const recipes = [
        ['1305', 'appetizer', 3],
        ['2101', 'doria', 6],
        ['2406', 'meat', 6],
        ['2417', 'meat', 3],
        ['2418', 'meat', 6]
    ];
    let state = 74;
    const random = () => ((state = (state * 1103515245 + 12345) >>> 0) / 2 ** 32);
    const input = Array.from({ length: 20 }, (_, index) => {
        const recipe = recipes[Math.floor(random() * recipes.length)];
        return item({
            itemId: `74-${index}`,
            orderId: String(index),
            table: String(1 + Math.floor(random() * 6)),
            createdAtMs: NOW - Math.floor(random() * 20) * 60000,
            qty: 1 + Math.floor(random() * 4),
            code: recipe[0],
            name: 'x',
            menuCategory: recipe[1],
            station: 'kitchen',
            cookTime: recipe[2]
        });
    });

    const startedAt = performance.now();
    const result = scheduleKitchenItems(input, { nowMs: NOW });
    const elapsedMs = performance.now() - startedAt;

    assert.equal(result.exact, true);
    assert.equal(result.syncSpreadSeconds, 0);
    assert.ok(result.assumptions.syncIterations > 16);
    assert.ok(result.assumptions.syncIterations <= 32);
    assert.ok(elapsedMs < 500, `scheduler blocked for ${elapsedMs.toFixed(1)}ms`);
});
