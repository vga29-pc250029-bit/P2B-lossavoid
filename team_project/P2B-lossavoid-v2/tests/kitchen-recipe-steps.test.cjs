// 指定された9商品の工程順と、未計測の手作業時間を加熱時間から区別できることを確認する。
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { resolveRecipe, scheduleKitchenItems } = require('../src/main/resources/static/kitchen-scheduler.js');

const SALADS = [['1202', '小エビ'], ['1205', 'わかめ'], ['1209', 'チキン']];
const DORIAS = ['2101', '2103', '2108', '2110', '2115'];

for (const [code, topping] of SALADS) {
    test(`${code} uses ${topping} and six dressing turns without a heating step`, () => {
        const recipe = resolveRecipe({ code, cookTime: 2, station: 'heat' });
        assert.equal(recipe.resource, 'COLD_PREP');
        assert.equal(recipe.durationSeconds, 120);
        assert.equal(recipe.durationSource, 'menu-master-estimate');
        assert.equal(recipe.provisional, true);
        assert.deepEqual(recipe.steps.map(step => step.phase), ['PREP', 'TOPPING', 'DRESSING', 'FINISH', 'SERVE']);
        assert.equal(recipe.steps[1].instruction, `${topping}をのせる`);
        assert.equal(recipe.steps[2].repetitions, 6);
        assert.match(recipe.steps[2].instruction, /6周/);
        assert.match(recipe.steps[3].instruction, /パプリカパウダー/);
        assert.ok(recipe.steps.every(step => step.durationSeconds === null));
        assert.equal(recipe.hasUntimedManualSteps, true);
    });
}

test('corn soup is portioned from an already-warm packet without adding another heating cycle', () => {
    const recipe = resolveRecipe({ code: '1301', cookTime: 1, station: 'heat' });
    assert.equal(recipe.resource, 'HOT_PLATING');
    assert.equal(recipe.durationSeconds, 60);
    assert.equal(recipe.durationSource, 'menu-master-estimate');
    assert.deepEqual(recipe.steps.map(step => step.phase), ['PREP', 'TOPPING', 'SERVE']);
    assert.match(recipe.steps[0].instruction, /温まっている個包装/);
    assert.match(recipe.steps[1].instruction, /皿に入れる/);
    assert.ok(recipe.steps.every(step => step.kind !== 'equipment'));
});

for (const code of DORIAS) {
    test(`${code} keeps IN, heating and OUT as separate ordered operations`, () => {
        const recipe = resolveRecipe({ code, cookTime: 6, station: 'kitchen' });
        const phases = recipe.steps.map(step => step.phase);
        assert.equal(recipe.resource, 'OVEN_LOWER');
        assert.equal(recipe.durationSeconds, 330);
        assert.equal(recipe.durationSource, 'equipment-only');
        assert.ok(phases.indexOf('IN') < phases.indexOf('HEAT'));
        assert.ok(phases.indexOf('HEAT') < phases.indexOf('OUT'));
        assert.equal(recipe.steps.find(step => step.phase === 'HEAT').durationSeconds, 330);
        assert.equal(recipe.steps.find(step => step.phase === 'IN').durationSeconds, null);
        assert.equal(recipe.steps.find(step => step.phase === 'OUT').durationSeconds, null);
        assert.equal(phases.at(-1), 'SERVE');
        assert.ok(recipe.hasUntimedManualSteps);
    });
}

test('soft egg is added only after taking the doria out of the oven', () => {
    const steps = resolveRecipe({ code: '2103' }).steps;
    assert.ok(steps.findIndex(step => step.id === 'soft-egg') > steps.findIndex(step => step.phase === 'OUT'));
    assert.equal(steps.at(-2).id, 'soft-egg');
    assert.equal(steps.at(-2).durationSeconds, null);
    assert.equal(steps.some(step => step.id === 'pizza-cheese'), false);
});

test('both cheeses are added before the baked-cheese doria enters the oven', () => {
    const steps = resolveRecipe({ code: '2108' }).steps;
    const inIndex = steps.findIndex(step => step.phase === 'IN');
    assert.ok(steps.findIndex(step => step.id === 'pizza-cheese') < inIndex);
    assert.ok(steps.findIndex(step => step.id === 'powdered-cheese') < inIndex);
    assert.equal(steps.some(step => step.id === 'soft-egg'), false);
});

test('tarako doria and gratin use their prepared dishes without inventing extra toppings', () => {
    for (const code of ['2110', '2115']) {
        const steps = resolveRecipe({ code }).steps;
        assert.deepEqual(steps.map(step => step.phase), ['PREP', 'IN', 'HEAT', 'OUT', 'SERVE']);
        assert.match(steps[0].instruction, /事前準備品/);
    }
});

test('each recipe has distinct step IDs and explicit predecessor dependencies', () => {
    for (const code of [...SALADS.map(([code]) => code), '1301', ...DORIAS]) {
        const steps = resolveRecipe({ code }).steps;
        assert.equal(new Set(steps.map(step => step.id)).size, steps.length);
        steps.forEach((step, index) => {
            assert.deepEqual(step.dependsOn, index ? [steps[index - 1].id] : []);
            assert.ok(step.phaseLabel);
        });
    }
});

test('step definitions are not shared mutable objects between orders', () => {
    const first = resolveRecipe({ code: '2103' });
    first.steps[0].instruction = 'changed';
    first.steps[1].dependsOn.push('changed');
    const second = resolveRecipe({ code: '2103' });
    assert.notEqual(second.steps[0].instruction, 'changed');
    assert.equal(second.steps[1].dependsOn.includes('changed'), false);
});

test('other recipes display their timetable preparation and equipment model', () => {
    const recipe = resolveRecipe({ code: '1401', cookTime: 6, station: 'kitchen' });
    assert.equal(recipe.resource, 'OVEN_LOWER');
    assert.match(recipe.instruction, /辛味チキン4個.*下段投入/);
    assert.deepEqual(recipe.steps.map(step => step.phase), ['PREP', 'IN', 'HEAT', 'OUT', 'SERVE']);
    assert.equal(recipe.steps[2].durationSeconds, 330);
});

test('scheduling retains existing estimates and exports untimed manual operations explicitly', () => {
    const now = Date.parse('2026-10-29T03:00:00Z');
    const input = [['2101', 6], ['1205', 2], ['1301', 1]].map(([code, cookTime]) => ({
        code, cookTime, station: code === '2101' ? 'kitchen' : 'heat',
        itemId: code, orderId: '1', table: '01', qty: 1, createdAtMs: now
    }));
    const result = scheduleKitchenItems(input, { nowMs: now });
    assert.equal(result.items.find(item => item.code === '2101').scheduleFinishSeconds, 330);
    assert.equal(result.assumptions.syncAlignment, 0.7);
    assert.ok(result.items.every(item => item.scheduleFinishSeconds <= 330));
    assert.equal(result.assumptions.hasUntimedManualSteps, true);
    const exported = JSON.parse(JSON.stringify(result));
    assert.ok(exported.items.every(item => item.recipe.steps.some(step => step.durationSeconds === null)));
    assert.equal(scheduleKitchenItems([]).assumptions.hasUntimedManualSteps, false);
});
