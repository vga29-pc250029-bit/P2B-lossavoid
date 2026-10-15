const assert = require('node:assert/strict');
const { test } = require('node:test');
const { scheduleKitchenItems } = require('../src/main/resources/static/kitchen-scheduler.js');

const NOW = Date.parse('2026-09-08T03:00:00Z');

function item(overrides) {
    return {
        orderId: '1',
        itemIndex: 0,
        table: '01',
        createdAtMs: NOW - 5 * 60000,
        qty: 1,
        name: '料理',
        cookTime: 3,
        menuCategory: 'pasta',
        station: 'heat',
        ...overrides
    };
}

test('keeps dishes for the same table together when urgency is comparable', () => {
    const input = [
        item({ name: 'A-long', table: '01', cookTime: 6 }),
        item({ name: 'B', table: '02', cookTime: 3 }),
        item({ name: 'A-short', table: '01', cookTime: 2 })
    ];
    const result = scheduleKitchenItems(input, { nowMs: NOW });
    const tables = result.items.map(value => value.table);
    assert.ok(tables.join(',') === '01,01,02' || tables.join(',') === '02,01,01');
    assert.equal(result.exact, true);
});

test('starts a long dish before a short hot dish for synchronized serving', () => {
    const input = [
        item({ name: 'short pasta', cookTime: 2 }),
        item({ name: 'long grill', cookTime: 6, menuCategory: 'meat' })
    ];
    const result = scheduleKitchenItems(input, { nowMs: NOW });
    assert.equal(result.items[0].name, 'long grill');
});

test('keeps longest preparation first inside a larger same-table set', () => {
    const input = [
        item({ name: 'short pasta', cookTime: 2, menuCategory: 'pasta' }),
        item({ name: 'medium pizza', cookTime: 3, menuCategory: 'pizza' }),
        item({ name: 'long grill', cookTime: 6, menuCategory: 'meat' })
    ];
    const result = scheduleKitchenItems(input, { nowMs: NOW });
    assert.deepEqual(result.items.map(value => value.name), [
        'long grill',
        'medium pizza',
        'short pasta'
    ]);
});

test('moves an overdue table ahead of a newly ordered table', () => {
    const input = [
        item({ name: 'new', table: '02', createdAtMs: NOW - 60000 }),
        item({ name: 'overdue', table: '01', createdAtMs: NOW - 20 * 60000 })
    ];
    const result = scheduleKitchenItems(input, { nowMs: NOW });
    assert.equal(result.items[0].name, 'overdue');
});

test('starts a longer hot dish before preparing a stable appetizer in parallel', () => {
    const input = [
        item({ name: 'pasta', cookTime: 3, menuCategory: 'pasta' }),
        item({ name: 'cold appetizer', cookTime: 2, menuCategory: 'appetizer', station: 'heat' })
    ];
    const result = scheduleKitchenItems(input, { nowMs: NOW });
    assert.equal(result.items[0].name, 'pasta');
    assert.equal(result.items[1].name, 'cold appetizer');
});

test('starts both doria dishes before wakame salad for parallel preparation', () => {
    const input = [
        item({ name: 'わかめのサラダ', cookTime: 2, menuCategory: 'appetizer', station: 'heat' }),
        item({ name: 'ミラノ風ドリア', cookTime: 6, menuCategory: 'doria', station: 'kitchen' }),
        item({ name: 'タラコとポップコーンシュリンプのドリア', cookTime: 6, menuCategory: 'doria', station: 'kitchen' })
    ];
    const result = scheduleKitchenItems(input, { nowMs: NOW });
    assert.deepEqual(new Set(result.items.slice(0, 2).map(value => value.name)), new Set([
        'ミラノ風ドリア',
        'タラコとポップコーンシュリンプのドリア'
    ]));
    assert.equal(result.items[2].name, 'わかめのサラダ');
});

test('uses bounded fallback scheduling beyond the bit-mask limit', () => {
    const input = Array.from({ length: 33 }, (_, index) => item({
        orderId: String(index),
        itemIndex: index,
        table: String((index % 4) + 1).padStart(2, '0'),
        name: `dish-${index}`,
        cookTime: (index % 6) + 1
    }));
    const result = scheduleKitchenItems(input, { nowMs: NOW });
    assert.equal(result.items.length, input.length);
    assert.equal(new Set(result.items.map(value => value.name)).size, input.length);
    assert.equal(result.exact, false);
});
