const assert = require('node:assert/strict');
const { test } = require('node:test');
const { resolveRecipe, scheduleKitchenItems } = require('../src/main/resources/static/kitchen-scheduler.js');

const NOW = Date.parse('2026-11-06T03:00:00Z');
const WORKFLOW_CODES = (`1202 1205 1209 1301 1305 1307 1401 1402 1403 1404 1405 1406 1407 1408
    1410 1413 1416 1417 1422 1423 1425 1452 2101 2103 2108 2110 2115 2203 2204 2206 2208
    2301 2303 2304 2305 2306 2310 2316 2317 2318 2320 2321 2325 2328 2402 2403 2404
    2406 2407 2417 2418 3101 3102 3103 3110 3111 3112 3114 3214`).trim().split(/\s+/);
const menu = code => {
    if (!WORKFLOW_CODES.includes(code)) return null;
    return {
        code,
        cookTime: /^12/.test(code) ? 2 : (/^(21|24)/.test(code) ? 6 : 3),
        prepStation: /^310/.test(code) ? 'Flor' : (/^(12|23)/.test(code) ? 'heat' : 'kitchen'),
        category: /^23/.test(code) ? 'pasta' : (/^21/.test(code) ? 'doria' : 'appetizer')
    };
};
const recipe = code => {
    const entry = menu(code);
    assert.ok(entry, `menu ${code} exists`);
    return resolveRecipe({
        code, cookTime: entry.cookTime, station: entry.prepStation,
        menuCategory: entry.category
    });
};
const orderItem = (code, itemId, extra = {}) => ({
    code, itemId, orderId: 'A', table: '01', qty: 1,
    createdAtMs: NOW - 300000, cookTime: menu(code).cookTime,
    station: menu(code).prepStation, menuCategory: menu(code).category,
    ...extra
});

test('every timetable kitchen, heat and floor dish has a visible workflow', () => {
    for (const code of WORKFLOW_CODES) {
        const steps = recipe(code).steps;
        assert.ok(steps?.length, code);
        assert.equal(new Set(steps.map(step => step.id)).size, steps.length, code);
    }
});

test('sheet oven rows use the correct level and measured heating cycle', () => {
    for (const code of ['1401', '1402', '1405', '1410', '1452', '2418']) {
        assert.equal(recipe(code).resource, 'OVEN_LOWER', code);
        assert.equal(recipe(code).durationSeconds, 330, code);
        assert.equal(recipe(code).passes, 1, code);
    }
    for (const code of ['1305', '1307', '1404', '1407', '1416', '2203', '2204',
        '2206', '2208', '2402', '2404', '3110', '3111', '3112', '3114', '3214']) {
        assert.equal(recipe(code).resource, 'OVEN_UPPER', code);
        assert.equal(recipe(code).durationSeconds, 180, code);
        assert.equal(recipe(code).passes, 1, code);
    }
});

test('sheet two-pass mains include a 30-second plating gap', () => {
    for (const code of ['2403', '2406', '2407', '2417']) {
        const result = recipe(code);
        assert.equal(result.resource, 'OVEN_UPPER', code);
        assert.equal(result.durationSeconds, 390, code);
        assert.equal(result.passes, 2, code);
        assert.deepEqual(result.passOffsets, [0, 210], code);
        assert.deepEqual(result.steps.filter(step => step.phase === 'HEAT')
            .map(step => step.durationSeconds), [180, 180], code);
        assert.equal(result.steps.find(step => step.id === 'between-passes').durationSeconds, 30, code);
    }
    assert.deepEqual(recipe('2406').passTrayUnits, [2, 1]);
    assert.deepEqual(recipe('2407').passTrayUnits, [2, 1]);
    assert.equal(recipe('2417').trayUnits, 1);
});

test('pasta sauce and noodle share the same 60-second timetable window', () => {
    for (const code of ['2301', '2303', '2304', '2305', '2306', '2310', '2316',
        '2317', '2318', '2320', '2321', '2325', '2328']) {
        const result = recipe(code);
        assert.equal(result.resource, 'PASTA', code);
        assert.equal(result.durationSeconds, 60, code);
        const sauce = result.steps.find(step => step.id === 'sauce-heat');
        if (sauce) assert.deepEqual(sauce.dependsOn, ['noodle-in'], code);
        assert.deepEqual(result.steps.find(step => step.id === 'noodle-out').dependsOn,
            sauce ? ['noodle-heat', 'sauce-heat'] : ['noodle-heat'], code);
    }
    assert.match(recipe('2328').steps[0].instruction, /ペンネ/);
    assert.ok(recipe('2318').steps.some(step => step.instruction.includes('半熟卵')));
});

test('doria, mixed grill and salad appear in that order while hot dishes start together', () => {
    const plan = scheduleKitchenItems([
        orderItem('2110', 'doria'),
        orderItem('2418', 'grill'),
        orderItem('1209', 'salad')
    ], { nowMs: NOW });
    assert.deepEqual(plan.items.map(item => item.itemId), ['doria', 'grill', 'salad']);
    assert.deepEqual(plan.items.map(item => item.scheduleStartSeconds), [0, 0, 147]);
    assert.deepEqual(plan.items.slice(0, 2).map(item => item.recipe.resource),
        ['OVEN_LOWER', 'OVEN_LOWER']);
});

test('five arrosticini remain one order line with five physical feeds', () => {
    const plan = scheduleKitchenItems([orderItem('1402', 'five', { qty: 5 })], { nowMs: NOW });
    assert.equal(plan.items.length, 1);
    assert.equal(plan.items[0].qty, 5);
    assert.equal(plan.items[0].ovenFeedEvents.length, 5);
    assert.deepEqual(plan.items[0].ovenFeedEvents.map(event => event.unit), [1, 2, 3, 4, 5]);
});
