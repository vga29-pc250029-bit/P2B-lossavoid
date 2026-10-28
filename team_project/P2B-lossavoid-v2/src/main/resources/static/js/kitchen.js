const cookMap = {};
let latestOrders = [];
const PLAN_STORAGE_KEY = "lossavoid:kds:organized-plan:v3";
let organizedPlan = [];
let ordersRefreshing = false;
const actionInFlight = new Set();
const seenRawOrderIds = new Set();
const seenWorkflowKeys = new Set();

const orderContainer = document.getElementById("orderContainer");
const organizedOrders = document.getElementById("organizedOrders");
const servedModal = document.getElementById("served-modal");
const servedFilterTable = document.getElementById("served-filter-table");
const servedFilterDish = document.getElementById("served-filter-dish");
const pickupAlert = document.getElementById("pickup-alert");
const kdsMessage = document.getElementById("kds-message");

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function isKitchenTarget(cookInfo) {
    if (!cookInfo || cookInfo.kitchenCategory === "FLOOR") return false;
    return ["kitchen", "heat", "Flor"].includes(cookInfo.section);
}

async function loadCookList() {
    const menus = await window.oracleApi.getMenus();
    menus.forEach(data => {
        cookMap[String(data.code)] = {
            ...data,
            shortName: data.name,
            section: data.prepStation,
            cookTime: data.cookTime
        };
    });
}

function formatTableNo(table) {
    const value = String(table ?? "").trim()
        .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    const match = value.match(/^(\d{1,2})(?:-(\d))?$/);
    if (!match) return value || "--";
    const base = String(Number(match[1])).padStart(2, "0");
    return match[2] !== undefined ? `${base}-${match[2]}` : base;
}

function tableSortValue(table) {
    const formatted = formatTableNo(table);
    const match = formatted.match(/^(\d{2})(?:-(\d))?$/);
    if (!match) return Number.MAX_SAFE_INTEGER;
    return Number(match[1]) * 10 + Number(match[2] ?? 0);
}

function parseTimestamp(value) {
    if (!value) return null;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
}

function recipeFor(item) {
    const cookInfo = cookMap[String(item.code)] || {};
    return window.KitchenScheduler.resolveRecipe({
        code: item.code,
        name: cookInfo.shortName || item.name,
        cookTime: cookInfo.cookTime,
        menuCategory: cookInfo.category,
        station: cookInfo.section
    });
}

function normalizeOracleOrder(order) {
    const createdDate = new Date(order.createdAt);
    return {
        ...order,
        id: String(order.id),
        createdAt: {
            toDate: () => createdDate,
            toMillis: () => createdDate.getTime()
        },
        items: (order.items || []).map(item => {
            const cookStatus = String(item.cookStatus || "WAITING").toUpperCase();
            const kitchenReadyAtMs = parseTimestamp(item.kitchenReadyAt);
            const servedAtMs = parseTimestamp(item.servedAt);
            const served = !!item.served;
            const kitchenReady = !served &&
                (cookStatus === "KITCHEN_READY" || kitchenReadyAtMs !== null);
            return {
                ...item,
                cookStatus,
                hidden: served,
                hiddenAt: servedAtMs,
                kitchenReadyAtMs,
                workflowState: served ? "FLOOR_PICKED" : (kitchenReady ? "KITCHEN_READY" : "PENDING"),
                recipe: recipeFor(item)
            };
        })
    };
}

function getActiveItems() {
    const result = [];
    latestOrders.forEach(order => {
        order.items.forEach((item, itemIndex) => {
            if (item.hidden) return;
            const cookInfo = cookMap[String(item.code)];
            if (!isKitchenTarget(cookInfo)) return;
            result.push({ order, item, itemIndex, cookInfo });
        });
    });
    return result;
}

function formatClock(ms, seconds = true) {
    if (!ms) return "--:--";
    return new Date(ms).toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
        ...(seconds ? { second: "2-digit" } : {})
    });
}

function formatElapsed(totalSeconds) {
    if (!Number.isFinite(totalSeconds)) return "-";
    const seconds = Math.max(0, Math.round(totalSeconds));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return minutes > 0 ? `${minutes}分${String(rest).padStart(2, "0")}秒` : `${rest}秒`;
}

function formatStartOffset(seconds) {
    const rounded = Math.max(0, Math.round(Number(seconds) || 0));
    return rounded <= 5 ? "今すぐ" : `＋${formatElapsed(rounded)}`;
}

function restoreOrganizedPlan() {
    try {
        const saved = JSON.parse(window.localStorage.getItem(PLAN_STORAGE_KEY) || "[]");
        organizedPlan = Array.isArray(saved)
            ? saved.filter(item => item && item.itemId != null)
            : [];
    } catch (error) {
        console.warn("保存済みの整理結果を復元できませんでした", error);
        organizedPlan = [];
    }
}

function persistOrganizedPlan() {
    try {
        window.localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(organizedPlan));
    } catch (error) {
        console.warn("整理結果を保存できませんでした", error);
    }
}

function stampScheduleItems(items, baseAtMs) {
    return items.map(item => ({
        ...item,
        scheduledStartAtMs: baseAtMs + Math.round((Number(item.scheduleStartSeconds) || 0) * 1000),
        scheduledFinishAtMs: baseAtMs + Math.round((Number(item.scheduleFinishSeconds) || 0) * 1000),
        ovenFeedEvents: Array.isArray(item.ovenFeedEvents)
            ? item.ovenFeedEvents.map(event => ({
                ...event,
                scheduledAtMs: baseAtMs + Math.round((Number(event.startSeconds) || 0) * 1000)
            }))
            : item.ovenFeedEvents
    }));
}

function buildLockedPlanConstraints(lockedItems, nowMs) {
    const fixedReservations = [];
    const resourceNotBeforeSeconds = {};
    const tableTargetFinishSeconds = {};
    const feedSecondsByResource = { OVEN_UPPER: 23, OVEN_LOWER: 43 };

    lockedItems.forEach(item => {
        const resource = item.recipe?.resource;
        const table = String(item.table ?? "--");
        tableTargetFinishSeconds[table] = Math.max(
            tableTargetFinishSeconds[table] || 0,
            (Number(item.scheduledFinishAtMs) - nowMs) / 1000 || 0
        );
        const feedSeconds = feedSecondsByResource[resource];
        const events = Array.isArray(item.ovenFeedEvents) ? item.ovenFeedEvents : [];

        if (feedSeconds && events.length) {
            events.forEach(event => {
                const eventAtMs = Number(event.scheduledAtMs);
                if (!Number.isFinite(eventAtMs)) return;
                const relativeSeconds = (eventAtMs - nowMs) / 1000;
                if (relativeSeconds >= 0) {
                    fixedReservations.push({
                        resource,
                        startSeconds: relativeSeconds,
                        trayUnits: Number(event.trayUnits) || 1
                    });
                } else {
                    resourceNotBeforeSeconds[resource] = Math.max(
                        resourceNotBeforeSeconds[resource] || 0,
                        relativeSeconds + feedSeconds
                    );
                }
            });
            return;
        }

        // Non-oven capacity is not yet measured. Keep the same resource blocked
        // until the locked item is expected to finish rather than double-book it.
        if (resource) {
            resourceNotBeforeSeconds[resource] = Math.max(
                resourceNotBeforeSeconds[resource] || 0,
                (Number(item.scheduledFinishAtMs) - nowMs) / 1000 || 0
            );
        }
    });

    Object.keys(resourceNotBeforeSeconds).forEach(resource => {
        resourceNotBeforeSeconds[resource] = Math.max(0, resourceNotBeforeSeconds[resource]);
    });
    Object.keys(tableTargetFinishSeconds).forEach(table => {
        tableTargetFinishSeconds[table] = Math.max(0, tableTargetFinishSeconds[table]);
    });
    return { fixedReservations, resourceNotBeforeSeconds, tableTargetFinishSeconds };
}

function planStartText(startAtMs, now = Date.now()) {
    if (!Number.isFinite(startAtMs)) return "時刻未設定";
    const remainingSeconds = Math.ceil((startAtMs - now) / 1000);
    if (remainingSeconds > 5) {
        return `${formatClock(startAtMs)}投入（あと${formatElapsed(remainingSeconds)}）`;
    }
    if (remainingSeconds >= 0) return "今すぐ投入";
    return `投入指示 ${formatClock(startAtMs)}`;
}

function showMessage(text, tone = "info") {
    if (!kdsMessage) return;
    kdsMessage.textContent = text;
    kdsMessage.dataset.tone = tone;
    kdsMessage.classList.remove("hidden");
    window.setTimeout(() => kdsMessage.classList.add("hidden"), 4500);
}

function rawItemHtml(item, cookInfo) {
    const ready = item.workflowState === "KITCHEN_READY";
    const displayName = cookInfo.shortName || item.name;
    const stateHtml = ready
        ? `<span class="raw-state ready"><span class="wait-elapsed">カウンター待ち</span></span>`
        : `<span class="raw-state">未調理</span>`;
    return `
        <div class="raw-item-row ${ready ? "counter-waiting" : ""}"
             ${ready && item.kitchenReadyAtMs ? `data-ready-at="${item.kitchenReadyAtMs}"` : ""}>
            <span class="raw-item-name">${escapeHtml(item.qty)} ${escapeHtml(displayName)}</span>
            <span class="recipe-chip">${escapeHtml(item.recipe.resourceLabel)}</span>
            ${stateHtml}
        </div>`;
}

function renderRawOrders() {
    orderContainer.innerHTML = "";
    const displayOrders = [...latestOrders].sort((a, b) => {
        const aReady = a.items.some(item => item.workflowState === "KITCHEN_READY") ? 0 : 1;
        const bReady = b.items.some(item => item.workflowState === "KITCHEN_READY") ? 0 : 1;
        if (aReady !== bReady) return aReady - bReady;
        const timeDiff = a.createdAt.toMillis() - b.createdAt.toMillis();
        return timeDiff || Number(a.id) - Number(b.id);
    });

    const cards = [];
    displayOrders.forEach(order => {
        const itemsHtml = order.items.map(item => {
            if (item.hidden) return "";
            const cookInfo = cookMap[String(item.code)];
            if (!isKitchenTarget(cookInfo)) return "";
            return rawItemHtml(item, cookInfo);
        }).join("");
        if (!itemsHtml) return;
        const enterClass = seenRawOrderIds.has(String(order.id)) ? "" : " ticket-enter";
        cards.push(`
            <article class="order-card bg-blue-light p-3${enterClass}">
                <header class="ticket-header">
                    <span class="table-number">${escapeHtml(formatTableNo(order.table))}卓</span>
                    <span>${escapeHtml(formatClock(order.createdAt.toMillis(), false))}</span>
                </header>
                ${itemsHtml}
            </article>`);
        seenRawOrderIds.add(String(order.id));
    });

    orderContainer.innerHTML = cards.length
        ? cards.join("")
        : `<div class="empty-panel">未完了のキッチン伝票はありません</div>`;
}

function counterRowHtml(entry, animate = false) {
    const { order, item, cookInfo } = entry;
    const name = cookInfo.shortName || item.name;
    return `
        <article class="workflow-row counter-action-row counter-waiting${animate ? " workflow-enter" : ""}"
                 data-item-id="${escapeHtml(item.id)}"
                 data-ready-at="${escapeHtml(item.kitchenReadyAtMs || "")}">
            <button class="floor-pickup-button" type="button"
                    data-action="floor-picked" data-item-id="${escapeHtml(item.id)}">
                持出し <span class="wait-elapsed">0秒</span>
            </button>
            <div class="workflow-main">
                <div class="workflow-title">${escapeHtml(formatTableNo(order.table))}卓　${escapeHtml(item.qty)} ${escapeHtml(name)}</div>
                <div class="workflow-meta">${escapeHtml(item.recipe.resourceLabel)}・完成 ${escapeHtml(formatClock(item.kitchenReadyAtMs))}</div>
            </div>
            <button class="kitchen-ready-button is-done" type="button" disabled>完成済</button>
        </article>`;
}

function planRowHtml(planItem, current, animate = false) {
    const recipe = planItem.recipe || current.item.recipe;
    const feedEvents = Array.isArray(planItem.ovenFeedEvents) ? planItem.ovenFeedEvents : [];
    const ovenSlot = recipe.resource === "OVEN_UPPER" || recipe.resource === "OVEN_LOWER"
        ? (feedEvents.length > 1
            ? `${feedEvents.length}回の投入指示`
            : `第${planItem.batchNumber}投入・${planItem.lane === "左右" ? "左右2枚" : `レーン${planItem.lane}`}`)
        : `順番${planItem.batchNumber}`;
    const feedHtml = feedEvents.length > 1
        ? `<div class="workflow-feeds">${feedEvents.map(event => {
            const unitLabel = Number(current.item.qty) > 1 ? `${event.unit}枚目・` : "";
            const passLabel = Number(recipe.passes) > 1 ? `${event.pass}周目・` : "";
            const laneLabel = event.lane === "左右" ? "左右2枚" : `レーン${event.lane}`;
            return `<span>${escapeHtml(unitLabel + passLabel + laneLabel)} <strong class="plan-feed-label" data-feed-at="${escapeHtml(event.scheduledAtMs || "")}">${escapeHtml(planStartText(Number(event.scheduledAtMs)))}</strong></span>`;
        }).join("")}</div>`
        : "";
    return `
        <article class="workflow-row planned-row${animate ? " workflow-enter" : ""}" data-item-id="${escapeHtml(current.item.id)}"
                 data-plan-start-at="${escapeHtml(planItem.scheduledStartAtMs || "")}">
            <button class="floor-pickup-button" type="button" disabled>フロア待機</button>
            <div class="workflow-main">
                <div class="workflow-title"><span class="sequence-number">${escapeHtml(planItem.sequence)}</span>${escapeHtml(formatTableNo(current.order.table))}卓　${escapeHtml(current.item.qty)} ${escapeHtml(current.cookInfo.shortName || current.item.name)}</div>
                <div class="workflow-meta"><strong class="plan-start-label">${escapeHtml(planStartText(Number(planItem.scheduledStartAtMs)))}</strong>・${escapeHtml(recipe.resourceLabel)}・${escapeHtml(ovenSlot)}</div>
                <div class="workflow-instruction">${escapeHtml(recipe.instruction)}</div>
                ${feedHtml}
            </div>
            <button class="kitchen-ready-button" type="button"
                    data-action="kitchen-ready" data-item-id="${escapeHtml(current.item.id)}">
                調理完了
            </button>
        </article>`;
}

function renderOrganizedPanel() {
    const active = getActiveItems();
    const byItemId = new Map(active.map(entry => [String(entry.item.id), entry]));
    const beforePrune = organizedPlan.length;
    organizedPlan = organizedPlan.filter(planItem => {
        const current = byItemId.get(String(planItem.itemId));
        return current?.item.workflowState === "PENDING";
    });
    if (organizedPlan.length !== beforePrune) persistOrganizedPlan();
    const counterItems = active
        .filter(entry => entry.item.workflowState === "KITCHEN_READY")
        .sort((a, b) => (a.item.kitchenReadyAtMs || 0) - (b.item.kitchenReadyAtMs || 0));
    const pendingPlan = organizedPlan
        .map(planItem => ({ planItem, current: byItemId.get(String(planItem.itemId)) }))
        .filter(entry => entry.current?.item.workflowState === "PENDING");

    const pendingIds = new Set(pendingPlan.map(entry => String(entry.current.item.id)));
    const unscheduledCount = active.filter(entry =>
        entry.item.workflowState === "PENDING" && !pendingIds.has(String(entry.item.id))).length;

    let html = "";
    if (counterItems.length) {
        const counterHtml = counterItems.map(entry => {
            const key = `${entry.item.id}:KITCHEN_READY`;
            const animate = !seenWorkflowKeys.has(key);
            seenWorkflowKeys.add(key);
            return counterRowHtml(entry, animate);
        }).join("");
        html += `<section class="workflow-section"><h2>カウンター待ち <span>${counterItems.length}品</span></h2>${counterHtml}</section>`;
    }
    if (pendingPlan.length) {
        const pendingHtml = pendingPlan.map(entry => {
            const key = `${entry.current.item.id}:PENDING`;
            const animate = !seenWorkflowKeys.has(key);
            seenWorkflowKeys.add(key);
            return planRowHtml(entry.planItem, entry.current, animate);
        }).join("");
        html += `<section class="workflow-section"><h2>整理後の調理順 <span>${pendingPlan.length}品</span></h2>${pendingHtml}</section>`;
    }
    if (unscheduledCount > 0) {
        html += `<div class="organize-notice">未整理 ${unscheduledCount}品 — 「整理」を押して最新順序を作成</div>`;
    }
    if (!html) {
        html = `<div class="empty-panel strong">「整理」を押すと、上下オーブンの左右2枚と同時調理を考慮して作業順を表示します</div>`;
    }
    organizedOrders.innerHTML = html;
    updateWorkflowClocks();
}

function renderOrders(orders) {
    latestOrders = orders.map(normalizeOracleOrder);
    renderRawOrders();
    renderOrganizedPanel();
    if (servedModal && !servedModal.classList.contains("hidden")) renderServedTable();
}

async function refreshOrders() {
    if (ordersRefreshing) return;
    ordersRefreshing = true;
    try {
        renderOrders(await window.oracleApi.getKitchenOrders());
    } catch (error) {
        console.error("Oracle注文データの取得に失敗しました", error);
        orderContainer.innerHTML = `<div class="error-panel">注文データを取得できませんでした</div>`;
    } finally {
        ordersRefreshing = false;
    }
}

function buildScheduleInput() {
    return getActiveItems()
        .filter(entry => entry.item.workflowState === "PENDING")
        .map(({ order, item, itemIndex, cookInfo }) => ({
            orderId: order.id,
            itemId: item.id,
            itemIndex,
            table: order.table,
            createdAtMs: order.createdAt.toMillis(),
            qty: item.qty,
            code: item.code,
            name: cookInfo.shortName || item.name,
            cookTime: cookInfo.cookTime,
            menuCategory: cookInfo.category,
            station: cookInfo.section
        }));
}

document.getElementById("organize-btn").addEventListener("click", () => {
    const input = buildScheduleInput();
    if (!input.length) {
        organizedPlan = [];
        persistOrganizedPlan();
        renderOrganizedPanel();
        showMessage("整理する未調理の料理はありません");
        return;
    }
    const now = Date.now();
    const pendingIds = new Set(input.map(item => String(item.itemId)));
    const existing = organizedPlan.filter(item => pendingIds.has(String(item.itemId)));
    const locked = existing.filter(item =>
        Number.isFinite(Number(item.scheduledStartAtMs)) && Number(item.scheduledStartAtMs) <= now + 5000);
    const lockedIds = new Set(locked.map(item => String(item.itemId)));
    const schedulable = input.filter(item => !lockedIds.has(String(item.itemId)));
    const constraints = buildLockedPlanConstraints(locked, now);
    const schedule = window.KitchenScheduler.scheduleKitchenItems(schedulable, {
        nowMs: now,
        fixedReservations: constraints.fixedReservations,
        resourceNotBeforeSeconds: constraints.resourceNotBeforeSeconds,
        tableTargetFinishSeconds: constraints.tableTargetFinishSeconds
    });
    organizedPlan = [...locked, ...stampScheduleItems(schedule.items, now)];
    const syncNote = schedule.exact === false
        ? `（同卓の完成差 最大${formatElapsed(schedule.syncSpreadSeconds || 0)}）`
        : "";
    showMessage((locked.length
        ? `投入済み${locked.length}品を固定し、残り${schedulable.length}品を再整理しました`
        : `${organizedPlan.length}品の作業順を更新しました`) + syncNote,
    schedule.exact === false ? "warning" : "info");
    organizedPlan.sort((a, b) =>
        (Number(a.scheduledStartAtMs) || 0) - (Number(b.scheduledStartAtMs) || 0) ||
        Number(a.itemId) - Number(b.itemId));
    organizedPlan = organizedPlan.map((item, index) => ({ ...item, sequence: index + 1 }));
    persistOrganizedPlan();
    renderOrganizedPanel();
    console.info("KDS resource schedule", schedule);
});

document.getElementById("delete-btn").addEventListener("click", () => {
    const now = Date.now();
    const protectedItems = organizedPlan.filter(item =>
        Number.isFinite(Number(item.scheduledStartAtMs)) && Number(item.scheduledStartAtMs) <= now + 5000);
    const message = protectedItems.length
        ? `未投入の整理結果だけを消去しますか？\n投入時刻に達した${protectedItems.length}品は、二重投入防止のため保持します。`
        : "右側の整理結果だけを消去しますか？\n（注文・完成時刻・持出し時刻は削除されません）";
    if (!confirm(message)) return;
    organizedPlan = protectedItems;
    persistOrganizedPlan();
    renderOrganizedPanel();
});

async function runWorkflowAction(itemId, action) {
    const key = `${itemId}:${action}`;
    if (actionInFlight.has(key)) return;
    actionInFlight.add(key);
    try {
        if (action === "kitchen-ready") {
            await window.oracleApi.markKitchenReady(itemId);
            showMessage("キッチン完成を記録しました。フロア持出し待ちです");
        } else if (action === "floor-picked") {
            await window.oracleApi.markFloorPicked(itemId);
            showMessage("フロア持出しを記録しました");
        }
        await refreshOrders();
    } catch (error) {
        console.error("KDS状態更新に失敗しました", error);
        showMessage("状態を更新できませんでした。画面を更新して再確認してください", "error");
    } finally {
        actionInFlight.delete(key);
    }
}

organizedOrders.addEventListener("click", event => {
    const button = event.target.closest("[data-action][data-item-id]");
    if (!button || button.disabled) return;
    button.disabled = true;
    runWorkflowAction(button.dataset.itemId, button.dataset.action);
});

function updateCounterWaitingClocks() {
    const now = Date.now();
    let overdueCount = 0;
    document.querySelectorAll(".counter-waiting[data-ready-at]").forEach(row => {
        const readyAt = Number(row.dataset.readyAt);
        if (!Number.isFinite(readyAt) || readyAt <= 0) return;
        const elapsedSeconds = Math.max(0, Math.floor((now - readyAt) / 1000));
        const overdue = elapsedSeconds >= 30;
        row.classList.toggle("pickup-overdue", overdue);
        row.querySelectorAll(".wait-elapsed").forEach(label => {
            label.textContent = overdue
                ? `至急 ${formatElapsed(elapsedSeconds)}`
                : `待ち ${formatElapsed(elapsedSeconds)}`;
        });
        const pickupButton = row.querySelector(".floor-pickup-button:not([disabled])");
        if (pickupButton) {
            pickupButton.setAttribute("aria-label", `${overdue ? "至急 " : ""}フロア持出し、待ち${formatElapsed(elapsedSeconds)}`);
            if (overdue) overdueCount += 1;
        }
    });
    if (pickupAlert) {
        pickupAlert.classList.toggle("hidden", overdueCount === 0);
        pickupAlert.textContent = overdueCount ? `⚠ 持出し急ぎ ${overdueCount}品` : "";
    }
}

function updatePlannedStartClocks() {
    const now = Date.now();
    document.querySelectorAll(".planned-row[data-plan-start-at]").forEach(row => {
        const startAt = Number(row.dataset.planStartAt);
        if (!Number.isFinite(startAt) || startAt <= 0) return;
        row.classList.toggle("plan-start-due", startAt <= now + 5000);
        const label = row.querySelector(".plan-start-label");
        if (label) label.textContent = planStartText(startAt, now);
        row.querySelectorAll(".plan-feed-label[data-feed-at]").forEach(feedLabel => {
            const feedAt = Number(feedLabel.dataset.feedAt);
            if (Number.isFinite(feedAt) && feedAt > 0) {
                feedLabel.textContent = planStartText(feedAt, now);
            }
        });
    });
}

function updateWorkflowClocks() {
    updateCounterWaitingClocks();
    updatePlannedStartClocks();
}

function formatOrderTime(ts) {
    return ts?.toDate ? formatClock(ts.toMillis(), false) : "--:--";
}

function formatOrderMethod(orderMethod) {
    if (!orderMethod || orderMethod === "-") return "-";
    if (orderMethod === "SELF") return "🙋 SELF";
    return `👔 ${orderMethod}`;
}

function formatLatency(startMs, endMs, targetSeconds) {
    if (!startMs || !endMs) return { text: "-", cls: "metric-missing" };
    const actualSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));
    const diffSeconds = actualSeconds - targetSeconds;
    const sign = diffSeconds >= 0 ? "+" : "-";
    const diffText = `${sign}${formatElapsed(Math.abs(diffSeconds))}`;
    return {
        text: `${formatElapsed(actualSeconds)} / ${diffText}`,
        cls: diffSeconds > 0 ? "metric-late" : (diffSeconds < 0 ? "metric-early" : "metric-on-time")
    };
}

function getServedItems() {
    const list = [];
    latestOrders.forEach(order => {
        order.items.forEach(item => {
            if (!item.hidden) return;
            const status = String(item.cookStatus || "").toUpperCase();
            const legacy = status !== "FLOOR_PICKED";
            const kitchenReadyAt = item.kitchenReadyAtMs || item.hiddenAt;
            const floorPickedAt = legacy ? null : item.hiddenAt;
            list.push({
                table: order.table,
                orderTime: order.createdAt,
                name: item.name || "(名称未設定)",
                qty: Number(item.qty) || 0,
                amount: (Number(item.price) || 0) * (Number(item.qty) || 0),
                kitchenReadyAt,
                floorPickedAt,
                orderMethod: order.orderMethod || "-",
                targetCookSeconds: item.recipe.durationSeconds,
                legacy
            });
        });
    });
    list.sort((a, b) =>
        (b.floorPickedAt || b.kitchenReadyAt || 0) - (a.floorPickedAt || a.kitchenReadyAt || 0));
    return list;
}

function populateServedFilters(items) {
    const currentTable = servedFilterTable.value;
    const currentDish = servedFilterDish.value;
    const tables = [...new Set(items.map(item => String(item.table)))]
        .sort((a, b) => tableSortValue(a) - tableSortValue(b));
    const dishes = [...new Set(items.map(item => item.name))]
        .sort((a, b) => a.localeCompare(b, "ja"));
    servedFilterTable.innerHTML = `<option value="">すべての卓番</option>` +
        tables.map(table => `<option value="${escapeHtml(table)}">${escapeHtml(formatTableNo(table))}卓</option>`).join("");
    servedFilterDish.innerHTML = `<option value="">すべての料理</option>` +
        dishes.map(dish => `<option value="${escapeHtml(dish)}">${escapeHtml(dish)}</option>`).join("");
    servedFilterTable.value = tables.includes(currentTable) ? currentTable : "";
    servedFilterDish.value = dishes.includes(currentDish) ? currentDish : "";
}

function renderServedTable() {
    const items = getServedItems();
    populateServedFilters(items);
    const tableFilter = servedFilterTable.value;
    const dishFilter = servedFilterDish.value;
    const filtered = items.filter(item =>
        (!tableFilter || String(item.table) === tableFilter) &&
        (!dishFilter || item.name === dishFilter));
    const tbody = document.getElementById("served-table-body");

    tbody.innerHTML = filtered.length === 0
        ? `<tr><td colspan="11" class="text-center py-6 text-gray-500">該当する提供済み料理はありません</td></tr>`
        : filtered.map(item => {
            const orderToKitchen = formatLatency(
                item.orderTime.toMillis(), item.kitchenReadyAt, item.targetCookSeconds);
            const kitchenToFloor = formatLatency(item.kitchenReadyAt, item.floorPickedAt, 30);
            const note = item.legacy ? "旧方式：フロア持出し時刻は未記録" : "-";
            return `
                <tr class="border-b border-gray-300">
                    <td>${escapeHtml(formatTableNo(item.table))}卓</td>
                    <td>${escapeHtml(formatOrderTime(item.orderTime))}</td>
                    <td class="served-name">${escapeHtml(item.name)}</td>
                    <td>${escapeHtml(item.qty)}</td>
                    <td class="money">¥${escapeHtml(item.amount.toLocaleString())}</td>
                    <td>${escapeHtml(formatClock(item.kitchenReadyAt))}</td>
                    <td class="${orderToKitchen.cls}">${escapeHtml(orderToKitchen.text)}</td>
                    <td>${escapeHtml(formatClock(item.floorPickedAt))}</td>
                    <td class="${kitchenToFloor.cls}">${escapeHtml(kitchenToFloor.text)}</td>
                    <td class="font-bold">${escapeHtml(formatOrderMethod(item.orderMethod))}</td>
                    <td class="history-note">${escapeHtml(note)}</td>
                </tr>`;
        }).join("");
    document.getElementById("served-count").textContent = `${filtered.length} 件`;
}

document.getElementById("completed-btn").addEventListener("click", () => {
    servedModal.classList.remove("hidden");
    renderServedTable();
});
document.getElementById("served-modal-close").addEventListener("click", () => servedModal.classList.add("hidden"));
servedModal.addEventListener("click", event => {
    if (event.target === servedModal) servedModal.classList.add("hidden");
});
servedFilterTable.addEventListener("change", renderServedTable);
servedFilterDish.addEventListener("change", renderServedTable);

restoreOrganizedPlan();
await loadCookList();
await refreshOrders();

const kitchenEvents = new EventSource(window.oracleApi.kitchenStreamUrl);
kitchenEvents.addEventListener("kitchen-update", refreshOrders);
kitchenEvents.addEventListener("connected", refreshOrders);
window.addEventListener("beforeunload", () => kitchenEvents.close());
window.setInterval(refreshOrders, 5000);
window.setInterval(updateWorkflowClocks, 1000);

if (window.orderAppRoute() === "/kitchen/served") {
    servedModal.classList.remove("hidden");
    renderServedTable();
}
