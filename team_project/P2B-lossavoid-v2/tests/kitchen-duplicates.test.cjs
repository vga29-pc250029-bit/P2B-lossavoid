const assert = require('node:assert/strict');
const { test } = require('node:test');
const { findPossibleDuplicates } = require('../src/main/resources/static/js/kitchen-duplicates.js');

const dish = (id, overrides = {}) => ({
    id, code: '1402', name: 'アロスティチーニ', qty: 1,
    cookStatus: 'WAITING', workflowState: 'PENDING', ...overrides
});
const order = (id, items, overrides = {}) => ({
    id, table: '01', createdAt: `2026-11-06T11:0${id}:00+09:00`, items, ...overrides
});

test('five units in one ticket are an intentional quantity, not a duplicate warning', () => {
    assert.deepEqual(findPossibleDuplicates([order(1, [1, 2, 3, 4, 5].map(id => dish(id)))]), []);
});

test('same dish in another active ticket at the same table is flagged once with quantities', () => {
    const found = findPossibleDuplicates([
        order(1, [dish(1), dish(2)], { table: '1' }),
        order(2, [dish(3)])
    ]);
    assert.equal(found.length, 1);
    assert.equal(found[0].table, '01');
    assert.equal(found[0].totalQty, 3);
    assert.deepEqual(found[0].tickets.map(ticket => ticket.qty), [2, 1]);
    assert.deepEqual(found[0].tickets.map(ticket => ticket.itemIds), [['1', '2'], ['3']]);
});

test('another table, menu code, canceled or served item does not trigger a warning', () => {
    const base = order(1, [dish(1)]);
    assert.deepEqual(findPossibleDuplicates([base, order(2, [dish(2)], { table: '02' })]), []);
    assert.deepEqual(findPossibleDuplicates([base, order(2, [dish(2, { code: '1452' })])]), []);
    assert.deepEqual(findPossibleDuplicates([base, order(2, [dish(2, { cookStatus: 'CANCELED' })])]), []);
    assert.deepEqual(findPossibleDuplicates([base, order(2, [dish(2, { workflowState: 'FLOOR_PICKED' })])]), []);
});

test('one ready and one pending still warns, but two already ready do not', () => {
    const ready = order(1, [dish(1, { workflowState: 'KITCHEN_READY' })]);
    const pending = order(2, [dish(2, { note: '辛味なし' })]);
    const found = findPossibleDuplicates([ready, pending]);
    assert.equal(found.length, 1);
    assert.equal(found[0].tickets[0].readyQty, 1);
    assert.deepEqual(found[0].tickets[1].notes, ['辛味なし']);
    assert.deepEqual(findPossibleDuplicates([ready, order(2, [dish(2, { workflowState: 'KITCHEN_READY' })])]), []);
});

test('a newly added ticket or quantity creates a new acknowledgment key', () => {
    const first = order(1, [dish(1)]);
    const second = order(2, [dish(2)]);
    const original = findPossibleDuplicates([first, second])[0].key;
    assert.notEqual(findPossibleDuplicates([first, second, order(3, [dish(3)])])[0].key, original);
    assert.notEqual(findPossibleDuplicates([first, order(2, [dish(2), dish(4)])])[0].key, original);
});
