(() => {
    "use strict";

    const COOKIE_NAME = "kds_schedule_sim_v1";
    const COOKIE_MAX_BYTES = 3600;
    const MAX_RECORDS = 25;
    const COOKIE_DAYS = 180;
    const list = document.getElementById("scenario-list");
    const saveButton = document.getElementById("save-order");
    const exportButton = document.getElementById("export-json");
    const savedMessage = document.getElementById("saved-message");
    let menuItems = [];
    let menuByCode = new Map();
    let scenario = [];
    let initialOrder = [];
    let questionCount = 4;
    let startedAt = Date.now();
    let saved = false;
    let draggedCode = null;

    function readRecords() {
        const prefix = `${COOKIE_NAME}=`;
        const value = document.cookie.split("; ").find(part => part.startsWith(prefix));
        if (!value) return [];
        try {
            const parsed = JSON.parse(decodeURIComponent(value.slice(prefix.length)));
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function writeRecords(records) {
        const expires = new Date(Date.now() + COOKIE_DAYS * 86400000).toUTCString();
        const compact = records.slice(-MAX_RECORDS);
        let encoded = encodeURIComponent(JSON.stringify(compact));
        while (encoded.length > COOKIE_MAX_BYTES && compact.length > 1) {
            compact.shift();
            encoded = encodeURIComponent(JSON.stringify(compact));
        }
        document.cookie = `${COOKIE_NAME}=${encoded}; expires=${expires}; path=/; SameSite=Lax`;
        return compact;
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function shuffle(values) {
        const result = [...values];
        for (let index = result.length - 1; index > 0; index -= 1) {
            const target = Math.floor(Math.random() * (index + 1));
            [result[index], result[target]] = [result[target], result[index]];
        }
        return result;
    }

    function eligibleMenus(menus) {
        return menus.filter(menu => {
            const station = String(menu.prepStation || "").toLowerCase();
            const category = String(menu.category || "").toLowerCase();
            return Number(menu.cookTime) > 0 &&
                station !== "no" &&
                category !== "drink" &&
                category !== "dessert";
        });
    }

    function renderScenario() {
        list.innerHTML = scenario.map((item, index) => `
            <article class="dish" draggable="true" data-code="${escapeHtml(item.code)}">
                <span class="rank">${index + 1}</span>
                <img src="${escapeHtml(item.imageUrl || "")}" alt="" onerror="this.style.visibility='hidden'">
                <div>
                    <p class="dish-name">${escapeHtml(item.name)}</p>
                    <div class="dish-meta">${escapeHtml(item.category || "その他")} ・ ${Number(item.cookTime) || 0}分 ・ ${escapeHtml(item.prepStation || "-")}</div>
                </div>
                <button type="button" class="move" data-move="up" data-index="${index}" aria-label="${escapeHtml(item.name)}を上へ" title="上へ" ${index === 0 ? "disabled" : ""}>↑</button>
                <button type="button" class="move" data-move="down" data-index="${index}" aria-label="${escapeHtml(item.name)}を下へ" title="下へ" ${index === scenario.length - 1 ? "disabled" : ""}>↓</button>
            </article>
        `).join("");
    }

    function beginScenario() {
        scenario = shuffle(menuItems).slice(0, questionCount);
        initialOrder = scenario.map(item => item.code);
        startedAt = Date.now();
        saved = false;
        savedMessage.classList.add("hidden");
        saveButton.disabled = scenario.length === 0;
        renderScenario();
    }

    function moveItem(index, offset) {
        const target = index + offset;
        if (target < 0 || target >= scenario.length) return;
        [scenario[index], scenario[target]] = [scenario[target], scenario[index]];
        saved = false;
        savedMessage.classList.add("hidden");
        renderScenario();
    }

    function menuSnapshot(code) {
        const item = menuByCode.get(String(code));
        return item ? {
            code: item.code,
            name: item.name,
            category: item.category,
            prepStation: item.prepStation,
            cookTime: Number(item.cookTime) || 0
        } : { code: String(code), name: "不明な商品" };
    }

    function expandedRecord(record) {
        return {
            recordedAt: new Date(record.t).toISOString(),
            elapsedSeconds: record.e,
            initialOrder: record.q.map(menuSnapshot),
            selectedStartOrder: record.a.map(menuSnapshot)
        };
    }

    function renderRecords() {
        const records = readRecords();
        document.getElementById("record-count").textContent = records.length;
        document.getElementById("total-runs").textContent = records.length;
        const average = records.length
            ? Math.round(records.reduce((sum, record) => sum + Number(record.e || 0), 0) / records.length)
            : null;
        document.getElementById("average-time").textContent = average === null ? "--" : `${average}秒`;
        exportButton.disabled = records.length === 0;

        document.getElementById("history").innerHTML = records.length
            ? [...records].reverse().slice(0, 8).map(record => {
                const names = record.a.map(code => menuByCode.get(String(code))?.name || code);
                return `<div class="history-item">
                    <div class="history-time">${new Date(record.t).toLocaleString("ja-JP")} ・ ${record.e}秒</div>
                    <div class="history-order">${names.map(escapeHtml).join(" → ")}</div>
                </div>`;
            }).join("")
            : '<div class="empty">まだ回答記録がありません</div>';
    }

    function saveRecord() {
        if (saved || scenario.length === 0) return;
        const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const records = readRecords();
        records.push({
            t: Date.now(),
            e: elapsedSeconds,
            q: initialOrder,
            a: scenario.map(item => item.code)
        });
        writeRecords(records);
        saved = true;
        saveButton.disabled = true;
        savedMessage.classList.remove("hidden");
        renderRecords();
    }

    function exportRecords() {
        const records = readRecords();
        if (!records.length) return;
        const data = {
            format: "kds-scheduling-simulation-v1",
            exportedAt: new Date().toISOString(),
            assumptions: {
                sequenceMeaning: "cooking-start-order",
                parallelCooking: true,
                storage: "browser-cookie"
            },
            records: records.map(expandedRecord)
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const link = document.createElement("a");
        const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
        link.href = URL.createObjectURL(blob);
        link.download = `kds-scheduling-records-${stamp}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    list.addEventListener("click", event => {
        const button = event.target.closest("[data-move]");
        if (!button) return;
        moveItem(Number(button.dataset.index), button.dataset.move === "up" ? -1 : 1);
    });

    list.addEventListener("dragstart", event => {
        const dish = event.target.closest(".dish");
        if (!dish) return;
        draggedCode = dish.dataset.code;
        dish.classList.add("dragging");
    });
    list.addEventListener("dragend", event => {
        event.target.closest(".dish")?.classList.remove("dragging");
        draggedCode = null;
    });
    list.addEventListener("dragover", event => event.preventDefault());
    list.addEventListener("drop", event => {
        event.preventDefault();
        const targetCode = event.target.closest(".dish")?.dataset.code;
        if (!draggedCode || !targetCode || draggedCode === targetCode) return;
        const from = scenario.findIndex(item => String(item.code) === draggedCode);
        const to = scenario.findIndex(item => String(item.code) === targetCode);
        const [moved] = scenario.splice(from, 1);
        scenario.splice(to, 0, moved);
        saved = false;
        savedMessage.classList.add("hidden");
        renderScenario();
    });

    document.querySelectorAll("[data-count]").forEach(button => {
        button.addEventListener("click", () => {
            questionCount = Number(button.dataset.count);
            document.querySelectorAll("[data-count]").forEach(item => item.classList.toggle("active", item === button));
            beginScenario();
        });
    });
    document.getElementById("new-scenario").addEventListener("click", beginScenario);
    document.getElementById("shuffle-order").addEventListener("click", () => {
        scenario = shuffle(scenario);
        saved = false;
        saveButton.disabled = false;
        savedMessage.classList.add("hidden");
        renderScenario();
    });
    saveButton.addEventListener("click", saveRecord);
    exportButton.addEventListener("click", exportRecords);

    setInterval(() => {
        const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        document.getElementById("timer").textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    }, 250);

    (async () => {
        try {
            menuItems = eligibleMenus(await window.oracleApi.getMenus());
            menuByCode = new Map(menuItems.map(item => [String(item.code), item]));
            beginScenario();
            renderRecords();
        } catch (error) {
            console.error("シミュレーターのメニュー取得に失敗しました", error);
            list.innerHTML = '<div class="loading">メニューを取得できませんでした</div>';
        }
    })();
})();
