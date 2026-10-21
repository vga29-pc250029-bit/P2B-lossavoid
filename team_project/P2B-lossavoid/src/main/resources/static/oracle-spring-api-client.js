const SPRING_API_BASE_URL = window.ORDER_API_BASE_URL || (() => {
    const url = new URL(location.protocol === "file:" ? "http://localhost:9999" : location.origin);
    url.pathname = "/api";
    return url.href.replace(/\/$/, "");
})();

async function springApi(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
        const response = await fetch(`${SPRING_API_BASE_URL}${path}`, {
            ...options,
            signal: controller.signal,
            headers: {
                Accept: "application/json",
                ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
                ...(options.headers || {})
            }
        });
        if (!response.ok) {
            throw new Error(`Spring API error: ${response.status}`);
        }
        if (response.status === 204) return null;
        return await response.json();
    } finally {
        clearTimeout(timeout);
    }
}

window.oracleApi = {
    kitchenStreamUrl: `${SPRING_API_BASE_URL}/kitchen/stream`,
    getCurrentUser() {
        return springApi("/auth/me");
    },
    getMenus() {
        return springApi("/menus");
    },
    getAllergens() {
        return springApi("/allergens");
    },
    getStaff() {
        return springApi("/staff");
    },
    createStaff(staff) {
        return springApi("/staff", {
            method: "POST",
            body: JSON.stringify(staff)
        });
    },
    updateStaff(code, staff) {
        return springApi(`/staff/${encodeURIComponent(code)}`, {
            method: "PUT",
            body: JSON.stringify(staff)
        });
    },
    deleteStaff(code) {
        return springApi(`/staff/${encodeURIComponent(code)}`, {
            method: "DELETE"
        });
    },
    createOrder(order) {
        return springApi("/orders", {
            method: "POST",
            body: JSON.stringify(order)
        });
    },
    getOrdersByTable(tableNo) {
        return springApi(`/orders?tableNo=${encodeURIComponent(tableNo)}`);
    },
    changeTable(orderId, table) {
        return springApi(`/orders/${orderId}/table`, {
            method: "PATCH",
            body: JSON.stringify({ table })
        });
    },
    mergeOrders(orderIds, table, orderMethod) {
        return springApi("/orders/merge", {
            method: "POST",
            body: JSON.stringify({ orderIds, table, orderMethod })
        });
    },
    cancelOrder(orderId) {
        return springApi(`/orders/${orderId}/cancel`, {
            method: "PATCH"
        });
    },
    cancelOrderItem(orderId, orderItemId) {
        return springApi(`/orders/${orderId}/items/${orderItemId}/cancel-one`, {
            method: "PATCH"
        });
    },
    getKitchenOrders() {
        return springApi("/kitchen/orders");
    },
    updateKitchenItem(orderItemId, status, served) {
        return springApi(`/kitchen/order-items/${orderItemId}`, {
            method: "PATCH",
            body: JSON.stringify({ status, served })
        });
    },
    updateStock(menuCode, stockQty, soldOut) {
        return springApi(`/menus/${encodeURIComponent(menuCode)}/stock`, {
            method: "PATCH",
            body: JSON.stringify({ stockQty, soldOut })
        });
    }
};
