// 注文APIの情報をKDSへ描画し、整理済み計画とキッチン完成・フロア持出しを管理する。計画は端末内、実際の状態と時刻はAPI経由で保存する。
import "./kitchen-duplicates.js";

const cookMap = {};
let latestOrders = [];
const orderingMode = document.body.dataset.orderingMode === "arrival" ? "arrival" : "optimized";
const comparisonMode = document.body.dataset.comparisonMode === "true";
const comparisonTag = comparisonMode ? document.body.dataset.comparisonTag || "" : "";
const PLAN_STORAGE_KEY = comparisonMode || orderingMode === "arrival"
    ? `lossavoid:kds:organized-plan:v8:${orderingMode}${comparisonMode ? ":comparison" : ""}`
    : "lossavoid:kds:organized-plan:v8";
const DUPLICATE_SEEN_KEY = "lossavoid:kds:duplicate-ack:v1";
const SYSTEM_CHICKEN_CODE = "SYS_CHICKEN";
let organizedPlan = [];
let latestChickenSummary = null;
let comparisonFingerprint = null;
let possibleDuplicates = [];
let unseenDuplicates = [];
let dialogCandidates = [];
let duplicateItemIds = new Set();
let resumeOrganizeAfterReview = false;
let ordersRefreshing = false;
const actionInFlight = new Set();
const seenRawOrderIds = new Set();
const seenWorkflowKeys = new Set();
const openRecipeDetails = new Set();

const orderContainer = document.getElementById("orderContainer");
const organizedOrders = document.getElementById("organizedOrders");
const servedModal = document.getElementById("served-modal");
const servedFilterTable = document.getElementById("served-filter-table");
const servedFilterDish = document.getElementById("served-filter-dish");
const pickupAlert = document.getElementById("pickup-alert");
const kdsMessage = document.getElementById("kds-message");
const duplicateBanner = document.createElement("div");
duplicateBanner.className = "duplicate-warning-bar hidden";
duplicateBanner.setAttribute("role", "alert");
duplicateBanner.innerHTML = '<strong id="duplicate-summary"></strong><button id="duplicate-open" type="button">内容を確認</button>';
document.querySelector(".kds-header").after(duplicateBanner);

const duplicateModal = document.createElement("div");
duplicateModal.className = "duplicate-modal hidden";
duplicateModal.setAttribute("role", "dialog");
duplicateModal.setAttribute("aria-modal", "true");
duplicateModal.setAttribute("aria-labelledby", "duplicate-modal-title");
duplicateModal.innerHTML = `<div class="duplicate-dialog">
    <header><h2 id="duplicate-modal-title">重複注文の可能性</h2>
        <button id="duplicate-close" type="button" aria-label="閉じる">×</button></header>
    <div class="duplicate-list" id="duplicate-list"></div>
    <footer><button id="duplicate-back" type="button">確認しました</button></footer>
</div>`;
document.body.append(duplicateModal);

function restoreSeenDuplicates() {
    try {
        const saved = JSON.parse(window.sessionStorage.getItem(DUPLICATE_SEEN_KEY) || "[]");
        return new Set(Array.isArray(saved) ? saved : []);
    } catch {
        return new Set();
    }
}

const seenDuplicateKeys = restoreSeenDuplicates();

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function renderDuplicateDialog() {
    const signature = JSON.stringify(dialogCandidates);
    if (duplicateModal.dataset.signature === signature) return;
    duplicateModal.dataset.signature = signature;
    document.getElementById("duplicate-list").innerHTML = dialogCandidates.map(candidate => `
        <section class="duplicate-case">
            <h3>${escapeHtml(formatTableNo(candidate.table))}卓　${escapeHtml(candidate.name)} <span>${escapeHtml(candidate.totalQty)}個</span></h3>
            <p>${escapeHtml(candidate.tickets.length)}件の別伝票に同じ料理があります。調理前に数量を確認してください。</p>
            <ul>${candidate.tickets.map(ticket => `<li>
                <strong>伝票 ${escapeHtml(ticket.orderId)}</strong>
                <span>${escapeHtml(formatClock(ticket.createdAtMs, false))}・${escapeHtml(ticket.qty)}個</span>
                <span>未調理 ${escapeHtml(ticket.pendingQty)}個 / 完成待ち ${escapeHtml(ticket.readyQty)}個</span>
                ${ticket.notes.map(note => `<small>備考: ${escapeHtml(note)}</small>`).join("")}
            </li>`).join("")}</ul>
        </section>`).join("");
}

function closeDuplicateDialog() {
    duplicateModal.classList.add("hidden");
    resumeOrganizeAfterReview = false;
}

function openDuplicateDialog(continueOrganize = false) {
    dialogCandidates = continueOrganize ? [...unseenDuplicates] : [...possibleDuplicates];
    if (!dialogCandidates.length) return;
    resumeOrganizeAfterReview = continueOrganize;
    for (const candidate of dialogCandidates) seenDuplicateKeys.add(candidate.key);
    unseenDuplicates = possibleDuplicates.filter(candidate => !seenDuplicateKeys.has(candidate.key));
    try {
        window.sessionStorage.setItem(DUPLICATE_SEEN_KEY, JSON.stringify([...seenDuplicateKeys]));
    } catch (error) {
        console.warn("重複通知の記録を保存できませんでした", error);
    }
    renderDuplicateDialog();
    duplicateModal.classList.remove("hidden");
    document.getElementById("duplicate-close").focus();
}

function updateDuplicateWarnings() {
    const kitchenOrders = latestOrders.filter(order => order.table !== "System").map(order => ({
        ...order,
        items: order.items.filter(item => isKitchenTarget(cookMap[String(item.code)]))
    }));
    possibleDuplicates = window.KitchenDuplicates.findPossibleDuplicates(kitchenOrders);
    unseenDuplicates = possibleDuplicates.filter(candidate => !seenDuplicateKeys.has(candidate.key));
    duplicateItemIds = new Set(possibleDuplicates.flatMap(candidate =>
        candidate.tickets.flatMap(ticket => ticket.itemIds)));
    const first = possibleDuplicates[0];
    duplicateBanner.classList.toggle("hidden", !first);
    const summary = first
        ? `重複の可能性 ${possibleDuplicates.length}件：${formatTableNo(first.table)}卓 ${first.name}` : "";
    const summaryElement = document.getElementById("duplicate-summary");
    if (summaryElement.textContent !== summary) summaryElement.textContent = summary;
    if (!duplicateModal.classList.contains("hidden")) {
        dialogCandidates = dialogCandidates
            .map(candidate => possibleDuplicates.find(active => active.key === candidate.key))
            .filter(Boolean);
        if (dialogCandidates.length) renderDuplicateDialog();
        else closeDuplicateDialog();
    }
}

document.getElementById("duplicate-open").addEventListener("click", () => openDuplicateDialog());
document.getElementById("duplicate-close").addEventListener("click", closeDuplicateDialog);
document.getElementById("duplicate-back").addEventListener("click", () => {
    const shouldResume = resumeOrganizeAfterReview;
    closeDuplicateDialog();
    if (shouldResume) organizePendingItems();
});
duplicateModal.addEventListener("click", event => {
    if (event.target === duplicateModal) closeDuplicateDialog();
});
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !duplicateModal.classList.contains("hidden")) closeDuplicateDialog();
});

// 5秒ごとの再取得で工程の展開状態を閉じないよう、表示場所と明細IDで区別して保持する。
document.addEventListener("toggle", event => {
    const details = event.target;
    if (!details.matches?.("details[data-recipe-key]")) return;
    if (details.open) openRecipeDetails.add(details.dataset.recipeKey);
    else openRecipeDetails.delete(details.dataset.recipeKey);
}, true);

function recipeStepsHtml(recipe, itemId, location) {
    if (!Array.isArray(recipe.steps) || !recipe.steps.length) return "";
    const key = `${location}:${itemId}`;
    return `<details class="workflow-steps" data-recipe-key="${escapeHtml(key)}" ${openRecipeDetails.has(key) ? "open" : ""}>
        <summary>作業工程 <span>${recipe.steps.length}工程</span></summary>
        <ol>${recipe.steps.map(step => `<li data-step-id="${escapeHtml(step.id)}" data-phase="${escapeHtml(step.phase)}">
            <span class="step-phase">${escapeHtml(step.phaseLabel)}</span>
            ${escapeHtml(step.instruction)}
            ${step.durationSeconds === null ? "" : `<span class="step-duration">${escapeHtml(formatElapsed(step.durationSeconds))}</span>`}
        </li>`).join("")}</ol>
        ${recipe.hasUntimedManualSteps ? '<div class="workflow-time-note">手作業時間：未計測</div>' : ""}
    </details>`;
}

function isKitchenTarget(cookInfo) {
    if (String(cookInfo?.code) === "3214") return true;
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
    cookMap[SYSTEM_CHICKEN_CODE] = {
        code: SYSTEM_CHICKEN_CODE,
        name: "焼成チキン",
        shortName: "焼成チキン",
        prepStation: "kitchen",
        section: "kitchen",
        cookTime: 9,
        category: "meat",
        systemChicken: true
    };
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

// Oracleの応答を画面側の時刻形式と3段階の作業状態へ変換する。完成済み・未持出しを提供済みと混同しない。
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

// 画面上だけ同じ伝票・商品・状態を束ねる。DBの明細IDは各1個のまま保持する。
function groupMenuEntries(entries) {
    const groups = new Map();
    entries.forEach(entry => {
        const { order, item } = entry.current || entry;
        const key = JSON.stringify([
            order.id, item.code, item.name, item.note || "", item.price, item.workflowState,
            Number(item.qty) === 1 ? "unit" : `legacy-${item.id}`
        ]);
        if (!groups.has(key)) groups.set(key, { entries: [], qty: 0 });
        const group = groups.get(key);
        group.entries.push(entry);
        group.qty += Math.max(1, Number(item.qty) || 1);
    });
    return [...groups.values()];
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

function updateChickenBakeTimers() {
    const now = Date.now();
    document.querySelectorAll(".chicken-bake-timer").forEach(label => {
        const readyAt = Number(label.dataset.readyAt);
        if (!Number.isFinite(readyAt) || readyAt <= 0) return;
        label.textContent = now < readyAt ?
            `完了予定 ${formatClock(readyAt, false)}（残り${formatElapsed((readyAt - now) / 1000)}）` :
            "焼成時間経過・完了を登録してください";
    });
    document.querySelectorAll('button[data-action="chicken-ready"]').forEach(button => {
        button.disabled = actionInFlight.has(`${button.dataset.itemId}:chicken-ready`) ||
            Number(button.dataset.readyAt) > now;
    });
}

function chickenPrepOrders(summary) {
    if (comparisonMode || !summary) return [];
    const bakeMinutes = Number(summary.bakeMinutes) || 9;
    return (summary.batches || [])
        .filter(batch => ["REQUESTED", "COOKING"].includes(String(batch.status)))
        .map(batch => {
            const status = String(batch.status);
            const startedAtMs = parseTimestamp(batch.startedAt);
            return {
                id: `SYSTEM-CHICKEN-${batch.id}`,
                table: "System",
                orderMethod: "SYSTEM_CHICKEN",
                createdAt: batch.requestedAt || summary.checkedAt || new Date().toISOString(),
                items: [{
                    id: `chicken-prep-${batch.id}`,
                    code: SYSTEM_CHICKEN_CODE,
                    name: "焼成チキン",
                    qty: Math.max(1, Number(batch.requestedQty) || 1),
                    price: 0,
                    cookStatus: "WAITING",
                    chickenBatchId: String(batch.id),
                    chickenStatus: status,
                    chickenStartedAtMs: startedAtMs,
                    chickenReadyAtMs: startedAtMs ? startedAtMs + bakeMinutes * 60_000 : null,
                    bakeMinutes
                }]
            };
        });
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

// 投入済みの設備枠は固定し、完成予定の同期は同じ伝票へだけ引き継ぐ。
function buildLockedPlanConstraints(lockedItems, nowMs) {
    const fixedReservations = [];
    const resourceNotBeforeSeconds = {};
    const episodeTargetFinishSeconds = {};
    const episodeCriticalSeconds = {};
    const feedSecondsByResource = { OVEN_UPPER: 23, OVEN_LOWER: 43 };

    lockedItems.forEach(item => {
        const resource = item.recipe?.resource;
        if (item.orderId != null) {
            const episode = window.KitchenScheduler.episodeKey(item);
            const remainingSeconds = (Number(item.scheduledFinishAtMs) - nowMs) / 1000;
            if (Number.isFinite(remainingSeconds) && remainingSeconds > 0) {
                episodeTargetFinishSeconds[episode] = Math.max(
                    episodeTargetFinishSeconds[episode] || 0, remainingSeconds);
                episodeCriticalSeconds[episode] = Math.max(
                    episodeCriticalSeconds[episode] || 0, Number(item.recipe?.durationSeconds) || 0);
            }
        }
        const events = Array.isArray(item.ovenFeedEvents) ? item.ovenFeedEvents : [];

        if (events.some(event => feedSecondsByResource[event.resource || resource])) {
            events.forEach(event => {
                const eventResource = event.resource || resource;
                const feedSeconds = feedSecondsByResource[eventResource];
                if (!feedSeconds) return;
                const eventAtMs = Number(event.scheduledAtMs);
                if (!Number.isFinite(eventAtMs)) return;
                const relativeSeconds = (eventAtMs - nowMs) / 1000;
                if (relativeSeconds >= 0) {
                    fixedReservations.push({
                        resource: eventResource,
                        startSeconds: relativeSeconds,
                        trayUnits: Number(event.trayUnits) || 1
                    });
                } else {
                    resourceNotBeforeSeconds[eventResource] = Math.max(
                        resourceNotBeforeSeconds[eventResource] || 0,
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
    Object.keys(episodeTargetFinishSeconds).forEach(episode => {
        episodeTargetFinishSeconds[episode] = Math.max(0, episodeTargetFinishSeconds[episode]);
    });
    return { fixedReservations, resourceNotBeforeSeconds, episodeTargetFinishSeconds, episodeCriticalSeconds };
}

function planStartText(startAtMs, now = Date.now()) {
    if (!Number.isFinite(startAtMs)) return "時刻未設定";
    const remainingSeconds = Math.ceil((startAtMs - now) / 1000);
    if (remainingSeconds > 5) {
        return `${formatClock(startAtMs)}投入（あと${formatElapsed(remainingSeconds)}）`;
    }
    if (remainingSeconds >= 0) return "今すぐ投入";
    return `${formatClock(startAtMs)}投入後（${formatElapsed(-remainingSeconds)}経過）`;
}

function showMessage(text, tone = "info") {
    if (!kdsMessage) return;
    kdsMessage.textContent = text;
    kdsMessage.dataset.tone = tone;
    kdsMessage.classList.remove("hidden");
    window.setTimeout(() => kdsMessage.classList.add("hidden"), 4500);
}

function rawItemHtml(group) {
    const { item, cookInfo } = group.entries[0];
    const ready = item.workflowState === "KITCHEN_READY";
    const systemChicken = Boolean(item.chickenBatchId);
    const chickenCooking = systemChicken && item.chickenStatus === "COOKING";
    const suspect = group.entries.some(entry => duplicateItemIds.has(String(entry.item.id)));
    const readyAt = ready ? Math.min(...group.entries.map(entry => entry.item.kitchenReadyAtMs || Date.now())) : null;
    const displayName = cookInfo.shortName || item.name;
    const stateHtml = chickenCooking
        ? `<span class="raw-state cooking">焼成中 <span class="chicken-bake-timer" data-ready-at="${escapeHtml(item.chickenReadyAtMs || "")}"></span></span>`
        : systemChicken
            ? `<span class="raw-state system-request">焼成待ち</span>`
            : ready
        ? `<span class="raw-state ready"><span class="wait-elapsed">カウンター待ち</span></span>`
        : `<span class="raw-state">未調理</span>`;
    return `
        <div class="raw-item-row ${ready ? "counter-waiting" : ""} ${suspect ? "duplicate-suspect" : ""}"
             ${ready ? `data-ready-at="${readyAt}"` : ""}>
            <span class="raw-item-name">${escapeHtml(group.qty)} ${escapeHtml(displayName)}</span>
            <span class="recipe-chip">${escapeHtml(item.recipe.resourceLabel)}</span>
            ${stateHtml}
            ${recipeStepsHtml(item.recipe, item.id, "raw")}
        </div>`;
}

function renderRawOrders() {
    orderContainer.innerHTML = "";
    const displayOrders = [...latestOrders].sort((a, b) => {
        const aReady = a.items.some(item => item.workflowState === "KITCHEN_READY") ? 0 : 1;
        const bReady = b.items.some(item => item.workflowState === "KITCHEN_READY") ? 0 : 1;
        if (aReady !== bReady) return aReady - bReady;
        const timeDiff = a.createdAt.toMillis() - b.createdAt.toMillis();
        return timeDiff || String(a.id).localeCompare(String(b.id), "ja", { numeric: true });
    });

    const cards = [];
    displayOrders.forEach(order => {
        const entries = order.items.flatMap(item => {
            if (item.hidden) return [];
            const cookInfo = cookMap[String(item.code)];
            return isKitchenTarget(cookInfo) ? [{ order, item, cookInfo }] : [];
        });
        const itemsHtml = groupMenuEntries(entries).map(rawItemHtml).join("");
        if (!itemsHtml) return;
        const enterClass = seenRawOrderIds.has(String(order.id)) ? "" : " ticket-enter";
        cards.push(`
            <article class="order-card bg-blue-light p-3${order.table === "System" ? " system-order-card" : ""}${enterClass}">
                <header class="ticket-header">
                    <span class="table-number">${escapeHtml(formatTableNo(order.table))}</span>
                    <span>${escapeHtml(formatClock(order.createdAt.toMillis(), false))}</span>
                </header>
                ${itemsHtml}
            </article>`);
        seenRawOrderIds.add(String(order.id));
    });

    // 注文がないときは元画面と同じ空の伝票領域にする。取得失敗はrefreshOrdersで別表示する。
    orderContainer.innerHTML = cards.join("");
}

function counterRowHtml(group, animate = false) {
    const { order, item, cookInfo } = group.entries[0];
    const suspect = group.entries.some(entry => duplicateItemIds.has(String(entry.item.id)));
    const name = cookInfo.shortName || item.name;
    const readyAt = Math.min(...group.entries.map(entry => entry.item.kitchenReadyAtMs || Date.now()));
    return `
        <article class="workflow-row counter-action-row counter-waiting${suspect ? " duplicate-suspect" : ""}${animate ? " workflow-enter" : ""}"
                 data-item-id="${escapeHtml(item.id)}"
                 data-ready-at="${escapeHtml(readyAt)}" data-qty="${escapeHtml(group.qty)}"
                 data-unit-actions="${group.entries.length > 1}">
            <button class="floor-pickup-button" type="button"
                    data-action="floor-picked" data-item-id="${escapeHtml(item.id)}">
                ${group.entries.length > 1 ? "1個持出し" : "持出し"} <span class="wait-elapsed">0秒</span>
            </button>
            <div class="workflow-main">
                <div class="workflow-title">${escapeHtml(formatTableNo(order.table))}　${escapeHtml(group.qty)} ${escapeHtml(name)}</div>
                <div class="workflow-meta">${escapeHtml(item.recipe.resourceLabel)}・最初の完成 ${escapeHtml(formatClock(readyAt))}</div>
                ${recipeStepsHtml(item.recipe, item.id, "counter")}
            </div>
            <button class="kitchen-ready-button is-done" type="button" disabled>完成済</button>
        </article>`;
}

function planRowHtml(group, sequence, animate = false) {
    const { current, planItem: firstPlan } = group.entries[0];
    const suspect = group.entries.some(entry => duplicateItemIds.has(String(entry.current.item.id)));
    let unitOffset = 0;
    const allFeedEvents = group.entries.flatMap(entry => {
        const events = (entry.planItem.ovenFeedEvents || []).map(event => ({
            ...event,
            unit: unitOffset + (Number(event.unit) || 1)
        }));
        unitOffset += Math.max(1, Number(entry.current.item.qty) || 1);
        return events;
    }).sort((a, b) => Number(a.scheduledAtMs) - Number(b.scheduledAtMs));
    const planItem = {
        ...firstPlan,
        sequence,
        scheduledStartAtMs: Math.min(...group.entries.map(entry => Number(entry.planItem.scheduledStartAtMs))),
        ovenFeedEvents: allFeedEvents
    };
    // 保存済みの古い整理結果にも、最新の工程定義を表示する。予定時刻そのものは変えない。
    const recipe = current.item.recipe.steps ? current.item.recipe : (planItem.recipe || current.item.recipe);
    const feedEvents = Array.isArray(planItem.ovenFeedEvents) ? planItem.ovenFeedEvents : [];
    const ovenSlot = ["OVEN_UPPER", "OVEN_LOWER", "OVEN_CHAIN"].includes(recipe.resource)
        ? (feedEvents.length > 1
            ? `${feedEvents.length}回の投入指示`
            : `第${planItem.batchNumber}投入・${planItem.lane === "左右" ? "左右2枚" : `レーン${planItem.lane}`}`)
        : `順番${planItem.batchNumber}`;
    const feedHtml = feedEvents.length > 1
        ? `<div class="workflow-feeds">${feedEvents.map(event => {
            const unitLabel = group.entries.length > 1 ? `${event.unit}品目・` :
                (Number(current.item.qty) > 1 ? `${event.unit}枚目・` : "");
            const passLabel = Number(recipe.passes) > 1 ? `${event.pass}周目・` : "";
            const ovenLabel = event.resource === "OVEN_LOWER" ? "下段・" :
                (event.resource === "OVEN_UPPER" ? "上段・" : "");
            const laneLabel = event.lane === "左右" ? "左右2枚" : `レーン${event.lane}`;
            return `<span>${escapeHtml(unitLabel + passLabel + ovenLabel + laneLabel)} <strong class="plan-feed-label" data-feed-at="${escapeHtml(event.scheduledAtMs || "")}">${escapeHtml(planStartText(Number(event.scheduledAtMs)))}</strong></span>`;
        }).join("")}</div>`
        : "";
    const earlySnackNote = planItem.earlySnack ? "・先出し候補（初品6分目安）" : "";
    const stage = planItem.cookingStage || { sequence: planItem.workPriority || 9, label: "その他" };
    const wave = planItem.cookingWave || window.KitchenScheduler.cookingWave(current.item, recipe);
    const workGroupNumber = Number(planItem.workGroupNumber) || 1;
    const workGroupTotal = Number(planItem.workGroupTotal) || 1;
    const workGroupTicketCount = Number(planItem.workGroupTicketCount) || 1;
    const handlingHtml = recipe.handlingInstruction ?
        `<div class="oven-handling-note">${escapeHtml(recipe.handlingInstruction)}</div>` : "";
    const systemChicken = Boolean(current.item.chickenBatchId);
    const chickenCooking = systemChicken && current.item.chickenStatus === "COOKING";
    const chickenAction = chickenCooking ? "chicken-ready" : "chicken-start";
    const chickenReadyAt = Number(current.item.chickenReadyAtMs) || 0;
    const chickenStartAt = Number(planItem.scheduledStartAtMs) || 0;
    const chickenTimer = chickenCooking
        ? `<span class="chicken-bake-timer" data-ready-at="${escapeHtml(chickenReadyAt)}"></span>`
        : `準備待機 ${escapeHtml(planItem.preparationLeadSeconds || 10)}秒`;
    const chickenStockReadyAt = Number(planItem.chickenStockReadyAtMs) || 0;
    const chickenStockWait = !systemChicken && planItem.chickenStockWait && chickenStockReadyAt > Date.now();
    const actionDisabled = (systemChicken && (chickenCooking ? chickenReadyAt > Date.now() : chickenStartAt > Date.now())) ||
        chickenStockWait;
    const chickenStockNote = chickenStockWait ?
        `・焼成チキン完成待ち ${formatClock(chickenStockReadyAt, false)}以降` : "";
    const dishName = current.cookInfo.shortName || current.item.name;
    const titleHtml = systemChicken
        ? `Sys @ 焼成チキン <span class="workflow-qty">${escapeHtml(group.qty)}枚</span>`
        : `${escapeHtml(group.qty)} ${escapeHtml(dishName)}`;
    return `
        <article class="workflow-row planned-row${systemChicken ? " system-order-row" : ""}${suspect ? " duplicate-suspect" : ""}${animate ? " workflow-enter" : ""}" data-item-id="${escapeHtml(current.item.id)}"
                 data-plan-start-at="${escapeHtml(planItem.scheduledStartAtMs || "")}" data-work-group="${escapeHtml(workGroupNumber)}"
                 data-cooking-wave="${escapeHtml(wave.sequence)}">
            <button class="floor-pickup-button" type="button" disabled>${systemChicken ? "System指示" : "フロア待機"}</button>
            <div class="workflow-main">
                <div class="workflow-order-context">
                    <span class="work-group-badge">作業組 ${escapeHtml(workGroupNumber)}/${escapeHtml(workGroupTotal)}・${escapeHtml(workGroupTicketCount)}伝票</span>
                    <span class="cooking-stage-badge${wave.parallel ? " is-parallel" : ""}"
                          title="分類 ${escapeHtml(stage.sequence)} ${escapeHtml(stage.label)}">${wave.parallel ? "並行" : `投入 ${escapeHtml(wave.sequence)}/6`}　${escapeHtml(wave.label)}</span>
                </div>
                <div class="workflow-title"><span class="sequence-number">${escapeHtml(planItem.sequence)}</span>${titleHtml}</div>
                <div class="workflow-meta"><strong class="plan-start-label">${escapeHtml(planStartText(Number(planItem.scheduledStartAtMs)))}</strong>・${escapeHtml(recipe.resourceLabel)}・${escapeHtml(ovenSlot)}${earlySnackNote}${systemChicken ? `・${chickenTimer}` : ""}${chickenStockNote}</div>
                ${handlingHtml}
                ${recipe.steps ? recipeStepsHtml(recipe, current.item.id, "plan") : `<div class="workflow-instruction">${escapeHtml(recipe.instruction)}</div>`}
                ${feedHtml}
            </div>
            <button class="kitchen-ready-button" type="button"
                    data-action="${systemChicken ? chickenAction : "kitchen-ready"}" data-item-id="${escapeHtml(current.item.id)}"
                    ${systemChicken ? `data-batch-id="${escapeHtml(current.item.chickenBatchId)}" data-ready-at="${escapeHtml(chickenReadyAt)}" data-start-at="${escapeHtml(chickenStartAt)}"` : ""}${chickenStockWait ? ` data-stock-ready-at="${escapeHtml(chickenStockReadyAt)}"` : ""}${actionDisabled ? " disabled" : ""}>
                ${systemChicken && !chickenCooking ? "焼成開始" : (group.entries.length > 1 ? "1個完了" : "調理完了")}
            </button>
        </article>`;
}

function comparePlanGroups(a, b) {
    // 実際の投入予定順を先に見せ、同時刻だけ料理の優先度で並べる。
    const first = group => group.entries[0];
    if (orderingMode === "arrival") {
        return Number(first(a).planItem.sequence) - Number(first(b).planItem.sequence);
    }
    const startDiff = Number(first(a).planItem.scheduledStartAtMs) -
        Number(first(b).planItem.scheduledStartAtMs);
    if (startDiff) return startDiff;
    const priority = group => window.KitchenScheduler.workPriority(first(group).current.item);
    const priorityDiff = priority(a) - priority(b);
    if (priorityDiff) return priorityDiff;
    const resourceRank = { OVEN_LOWER: 0, OVEN_UPPER: 1, PASTA: 2, COLD_PREP: 3 };
    const resourceDiff = (resourceRank[first(a).current.item.recipe.resource] ?? 4) -
        (resourceRank[first(b).current.item.recipe.resource] ?? 4);
    if (resourceDiff) return resourceDiff;
    return String(first(a).current.item.id).localeCompare(String(first(b).current.item.id), "ja", { numeric: true });
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
    const counterGroups = groupMenuEntries(counterItems);
    const pendingPlan = organizedPlan
        .map(planItem => ({ planItem, current: byItemId.get(String(planItem.itemId)) }))
        .filter(entry => entry.current?.item.workflowState === "PENDING");
    const pendingGroups = groupMenuEntries(pendingPlan).sort(comparePlanGroups);

    const pendingIds = new Set(pendingPlan.map(entry => String(entry.current.item.id)));
    const unscheduledCount = active.filter(entry =>
        entry.item.workflowState === "PENDING" && !pendingIds.has(String(entry.item.id)))
        .reduce((sum, entry) => sum + Math.max(1, Number(entry.item.qty) || 1), 0);

    let html = "";
    if (counterGroups.length) {
        const counterHtml = counterGroups.map(group => {
            const key = `${group.entries[0].item.id}:KITCHEN_READY`;
            const animate = !seenWorkflowKeys.has(key);
            seenWorkflowKeys.add(key);
            return counterRowHtml(group, animate);
        }).join("");
        html += `<section class="workflow-section"><h2>カウンター待ち <span>${counterGroups.reduce((sum, group) => sum + group.qty, 0)}品</span></h2>${counterHtml}</section>`;
    }
    if (pendingGroups.length) {
        const pendingHtml = pendingGroups.map((group, index) => {
            const key = `${group.entries[0].current.item.id}:PENDING`;
            const animate = !seenWorkflowKeys.has(key);
            seenWorkflowKeys.add(key);
            return planRowHtml(group, index + 1, animate);
        }).join("");
        html += `<section class="workflow-section"><h2>整理後の調理順 <span>${pendingGroups.reduce((sum, group) => sum + group.qty, 0)}品</span></h2>${pendingHtml}</section>`;
    }
    if (unscheduledCount > 0) {
        html += `<div class="organize-notice">未整理 ${unscheduledCount}品</div>`;
    }
    organizedOrders.innerHTML = html;
    updateWorkflowClocks();
}

function renderOrders(orders, chickenSummary = null) {
    latestChickenSummary = chickenSummary;
    const customerOrders = comparisonTag ? orders.filter(order => order.orderMethod === comparisonTag) : orders;
    latestOrders = [...customerOrders, ...chickenPrepOrders(chickenSummary)].map(normalizeOracleOrder);
    updateDuplicateWarnings();
    renderRawOrders();
    const fingerprint = getActiveItems()
        .map(({ item }) => `${item.id}:${item.workflowState}:${item.qty}`)
        .sort().join("|");
    if (comparisonMode && fingerprint !== comparisonFingerprint) {
        comparisonFingerprint = fingerprint;
        organizePendingItems();
    } else {
        renderOrganizedPanel();
    }
    if (servedModal && !servedModal.classList.contains("hidden")) renderServedTable();
}

async function refreshOrders() {
    if (ordersRefreshing) return;
    ordersRefreshing = true;
    try {
        const [orders, chickenSummary] = await Promise.all([
            window.oracleApi.getKitchenOrders(),
            comparisonMode ? Promise.resolve(null) : window.oracleApi.getChickenPrep()
        ]);
        renderOrders(orders, chickenSummary);
    } catch (error) {
        console.error("注文・焼成チキンデータの取得に失敗しました", error);
        orderContainer.innerHTML = `<div class="error-panel">注文データを取得できませんでした</div>`;
    } finally {
        ordersRefreshing = false;
    }
}

function buildScheduleInput() {
    const now = Date.now();
    const bakeMinutes = Number(latestChickenSummary?.bakeMinutes) || 9;
    let readyChicken = Math.max(0, Number(latestChickenSummary?.readyQty) || 0);
    const pendingChickenReadyTimes = (latestChickenSummary?.batches || [])
        .filter(batch => ["REQUESTED", "COOKING"].includes(String(batch.status)))
        .flatMap(batch => {
            const startedAtMs = parseTimestamp(batch.startedAt);
            const readyAtMs = startedAtMs ? startedAtMs + bakeMinutes * 60_000 : now + bakeMinutes * 60_000 + 20_000;
            return Array.from({ length: Math.max(0, Number(batch.requestedQty) || 0) }, () => readyAtMs);
        })
        .sort((a, b) => a - b);
    const fallbackReadyAtMs = now + bakeMinutes * 60_000 + 20_000;
    const chickenReadyByItem = new Map();
    getActiveItems()
        .filter(({ item }) => ["2402", "2404"].includes(String(item.code)) && item.workflowState === "PENDING")
        .sort((a, b) => a.order.createdAt.toMillis() - b.order.createdAt.toMillis() || a.itemIndex - b.itemIndex)
        .forEach(({ item }) => {
            let itemReadyAtMs = now;
            const quantity = Math.max(1, Number(item.qty) || 1);
            for (let unit = 0; unit < quantity; unit += 1) {
                if (readyChicken > 0) readyChicken -= 1;
                else itemReadyAtMs = Math.max(itemReadyAtMs, pendingChickenReadyTimes.shift() || fallbackReadyAtMs);
            }
            chickenReadyByItem.set(String(item.id), itemReadyAtMs);
        });

    return getActiveItems()
        .filter(entry => entry.item.workflowState === "PENDING")
        .map(({ order, item, itemIndex, cookInfo }) => {
            const chickenStockReadyAtMs = chickenReadyByItem.get(String(item.id)) || 0;
            return {
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
                station: cookInfo.section,
                chickenStockWait: chickenStockReadyAtMs > now,
                chickenStockReadyAtMs,
                notBeforeSeconds: chickenStockReadyAtMs > now ? (chickenStockReadyAtMs - now) / 1000 : 0
            };
        });
}

// 投入時刻に達した項目は固定し、残りだけを計算し直す。整理結果は端末内に保存し、注文状態そのものは変えない。
function organizePendingItems() {
    const input = buildScheduleInput();
    if (!input.length) {
        organizedPlan = [];
        persistOrganizedPlan();
        renderOrganizedPanel();
        if (comparisonMode) document.getElementById("kds-comparison-metrics").textContent = "未調理の注文はありません";
        showMessage("整理する未調理の料理はありません");
        return;
    }
    const now = comparisonMode && latestOrders.length
        ? Math.max(...latestOrders.map(order => order.createdAt.toMillis()))
        : Date.now();
    const pendingIds = new Set(input.map(item => String(item.itemId)));
    const existing = comparisonMode ? [] : organizedPlan.filter(item => pendingIds.has(String(item.itemId)));
    const locked = existing.filter(item =>
        Number.isFinite(Number(item.scheduledStartAtMs)) && Number(item.scheduledStartAtMs) <= now + 5000);
    const lockedIds = new Set(locked.map(item => String(item.itemId)));
    const schedulable = input.filter(item => !lockedIds.has(String(item.itemId)));
    const constraints = buildLockedPlanConstraints(locked, now);
    const schedule = window.KitchenScheduler.scheduleKitchenItems(schedulable, {
        nowMs: now,
        orderingStrategy: orderingMode,
        priorityStrategy: orderingMode === "arrival" ? "legacy" : "adaptive",
        fixedReservations: constraints.fixedReservations,
        resourceNotBeforeSeconds: constraints.resourceNotBeforeSeconds,
        episodeTargetFinishSeconds: constraints.episodeTargetFinishSeconds,
        episodeCriticalSeconds: constraints.episodeCriticalSeconds
    });
    organizedPlan = [...locked, ...stampScheduleItems(schedule.items, now)];
    const hasUntimedManualSteps = getActiveItems().some(({ item }) =>
        item.workflowState === "PENDING" && item.recipe.hasUntimedManualSteps);
    const timingNote = hasUntimedManualSteps ? "（手作業時間は未計測）" : "";
    const firstDishByOrder = new Map();
    const lastDishByOrder = new Map();
    for (const item of organizedPlan) {
        const elapsedSeconds = (Number(item.scheduledFinishAtMs) - Number(item.createdAtMs)) / 1000;
        if (!Number.isFinite(elapsedSeconds)) continue;
        const orderId = String(item.orderId);
        firstDishByOrder.set(orderId, Math.min(firstDishByOrder.get(orderId) ?? Infinity, elapsedSeconds));
        lastDishByOrder.set(orderId, Math.max(lastDishByOrder.get(orderId) ?? 0, elapsedSeconds));
    }
    const stageNote = firstDishByOrder.size
        ? `（初品最短${formatElapsed(Math.min(...firstDishByOrder.values()))}・全品最長${formatElapsed(Math.max(...lastDishByOrder.values()))}）`
        : "";
    const firstDishLateCount = [...firstDishByOrder.values()]
        .filter(seconds => seconds > schedule.assumptions.firstBiteTargetMinutes * 60).length;
    if (comparisonMode) {
        const metrics = document.getElementById("kds-comparison-metrics");
        const count = firstDishByOrder.size;
        const firstMean = count ? [...firstDishByOrder.values()].reduce((sum, value) => sum + value, 0) / count : 0;
        const lastMean = count ? [...lastDishByOrder.values()].reduce((sum, value) => sum + value, 0) / count : 0;
        metrics.textContent = `計画基準 ${formatClock(now, false)}｜${count}伝票・${schedulable.length}品｜推定初品平均 ${formatElapsed(firstMean)}・6分以内 ${count - firstDishLateCount}/${count}｜推定全品平均 ${formatElapsed(lastMean)}・12分以内 ${[...lastDishByOrder.values()].filter(seconds => seconds <= 720).length}/${count}`;
    }
    const firstDishNote = firstDishLateCount ? `（初品6分以降の見込み ${firstDishLateCount}伝票）` : "";
    showMessage((locked.length
        ? `投入済み${locked.length}品を固定し、残り${schedulable.length}品を再整理しました`
        : `${organizedPlan.length}品の作業順を更新しました`) + stageNote + firstDishNote + timingNote,
    schedule.exact === false || hasUntimedManualSteps || firstDishLateCount ? "warning" : "info");
    if (orderingMode !== "arrival") {
        organizedPlan.sort((a, b) =>
            (Number(a.scheduledStartAtMs) || 0) - (Number(b.scheduledStartAtMs) || 0) ||
            Number(a.itemId) - Number(b.itemId));
    }
    organizedPlan = organizedPlan.map((item, index) => ({ ...item, sequence: index + 1 }));
    persistOrganizedPlan();
    renderOrganizedPanel();
    console.info("KDS resource schedule", schedule);
}

document.getElementById("organize-btn").addEventListener("click", () => {
    if (unseenDuplicates.length) {
        openDuplicateDialog(true);
        return;
    }
    organizePendingItems();
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

// 同じ明細・操作の多重送信を抑え、成功後に注文情報を再取得する。完成と持出しの時刻はサーバーで記録する。
async function runWorkflowAction(itemId, action, batchId = null) {
    const key = `${itemId}:${action}`;
    if (actionInFlight.has(key)) return;
    actionInFlight.add(key);
    try {
        if (action === "chicken-start" || action === "chicken-ready") {
            await window.oracleApi.updateChickenPrep(batchId, action === "chicken-start" ? "start" : "ready");
            showMessage(action === "chicken-start"
                ? "System卓の焼成チキンを開始しました"
                : "焼成チキンの調理完了を記録しました。System卓から消去します");
        } else if (action === "kitchen-ready") {
            await window.oracleApi.markKitchenReady(itemId);
            showMessage("キッチン完成を記録しました。フロア持出し待ちです");
        } else if (action === "floor-picked") {
            await window.oracleApi.markFloorPicked(itemId);
            showMessage("フロア持出しを記録しました");
        }
        await refreshOrders();
    } catch (error) {
        console.error("KDS状態更新に失敗しました", error);
        showMessage(action === "chicken-ready"
            ? "焼成開始から9分経過後に調理完了を登録してください"
            : "状態を更新できませんでした。画面を更新して再確認してください", "error");
    } finally {
        actionInFlight.delete(key);
    }
}

organizedOrders.addEventListener("click", event => {
    const button = event.target.closest("[data-action][data-item-id]");
    if (!button || button.disabled) return;
    button.disabled = true;
    runWorkflowAction(button.dataset.itemId, button.dataset.action, button.dataset.batchId);
});

// 完成から30秒以上持出しを待つ料理を目立たせる。表示の更新だけでDBの時刻は書き換えない。
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
            pickupButton.setAttribute("aria-label", `${overdue ? "至急 " : ""}${row.dataset.unitActions === "true" ? "1個を" : ""}フロア持出し、待ち${formatElapsed(elapsedSeconds)}`);
            if (overdue) overdueCount += Number(row.dataset.qty) || 1;
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
    document.querySelectorAll('button[data-action="chicken-start"]').forEach(button => {
        button.disabled = actionInFlight.has(`${button.dataset.itemId}:chicken-start`) ||
            Number(button.dataset.startAt) > now;
    });
}

function updateWorkflowClocks() {
    updateCounterWaitingClocks();
    updatePlannedStartClocks();
    updateChickenBakeTimers();
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

// SSE通知で即時に再取得し、5秒間隔の取得も併用する。画面の経過時間表示は1秒間隔で更新する。
const kitchenEvents = new EventSource(window.oracleApi.kitchenStreamUrl);
const refreshKitchen = () => refreshOrders();
kitchenEvents.addEventListener("kitchen-update", refreshKitchen);
kitchenEvents.addEventListener("connected", refreshKitchen);
window.addEventListener("beforeunload", () => kitchenEvents.close());
window.setInterval(refreshKitchen, comparisonMode ? 1000 : 5000);
window.setInterval(updateWorkflowClocks, 1000);

if (window.orderAppRoute() === "/kitchen/served") {
    servedModal.classList.remove("hidden");
    renderServedTable();
}
