// KDSの重複可能性は伝票をまたいだ同卓・同商品だけで判定する。注文の取消や変更は行わない。
(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.KitchenDuplicates = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
    "use strict";

    function tableNo(value) {
        const normalized = String(value ?? "").trim()
            .replace(/[０-９]/g, digit => String.fromCharCode(digit.charCodeAt(0) - 0xFEE0));
        const match = normalized.match(/^(\d{1,2})(?:-(\d))?$/);
        if (!match) return normalized;
        const base = String(Number(match[1])).padStart(2, "0");
        return match[2] === undefined ? base : `${base}-${match[2]}`;
    }

    function orderTime(order) {
        const value = order.createdAt?.toMillis?.() ?? order.createdAt;
        const time = typeof value === "number" ? value : Date.parse(value);
        return Number.isFinite(time) ? time : 0;
    }

    function findPossibleDuplicates(orders) {
        const byDish = new Map();
        for (const order of orders) {
            const table = tableNo(order.table);
            const orderId = String(order.id);
            for (const item of order.items || []) {
                const code = String(item.code ?? "").trim();
                const qty = Number(item.qty);
                const status = String(item.cookStatus ?? "").toUpperCase();
                const state = item.workflowState ||
                    (item.served ? "FLOOR_PICKED" : (status === "KITCHEN_READY" ? "KITCHEN_READY" : "PENDING"));
                if (!table || !code || !Number.isFinite(qty) || qty <= 0 ||
                    item.hidden || status === "CANCELED" || state === "FLOOR_PICKED") continue;

                const dishKey = JSON.stringify([table, code]);
                if (!byDish.has(dishKey)) byDish.set(dishKey, { table, code, name: item.name || code, tickets: new Map() });
                const dish = byDish.get(dishKey);
                if (!dish.tickets.has(orderId)) {
                    dish.tickets.set(orderId, {
                        orderId, createdAtMs: orderTime(order), qty: 0, pendingQty: 0,
                        readyQty: 0, itemIds: [], notes: new Set()
                    });
                }
                const ticket = dish.tickets.get(orderId);
                ticket.qty += qty;
                if (state === "KITCHEN_READY") ticket.readyQty += qty;
                else ticket.pendingQty += qty;
                ticket.itemIds.push(String(item.id));
                if (String(item.note ?? "").trim()) ticket.notes.add(String(item.note).trim());
            }
        }

        return [...byDish.values()].flatMap(dish => {
            const tickets = [...dish.tickets.values()]
                .sort((a, b) => a.createdAtMs - b.createdAtMs || a.orderId.localeCompare(b.orderId, "ja", { numeric: true }))
                .map(ticket => ({ ...ticket, notes: [...ticket.notes] }));
            if (tickets.length < 2 || !tickets.some(ticket => ticket.pendingQty > 0)) return [];
            return [{
                table: dish.table,
                code: dish.code,
                name: dish.name,
                tickets,
                totalQty: tickets.reduce((sum, ticket) => sum + ticket.qty, 0),
                lastAtMs: Math.max(...tickets.map(ticket => ticket.createdAtMs)),
                key: JSON.stringify([dish.table, dish.code, ...tickets.map(ticket => [ticket.orderId, ticket.qty])])
            }];
        }).sort((a, b) => b.lastAtMs - a.lastAtMs || a.key.localeCompare(b.key));
    }

    return { findPossibleDuplicates };
});
