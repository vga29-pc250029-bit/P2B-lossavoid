

        const cookMap = {};
        let latestOrders = [];
        let organizedOrderIds = new Set();

        const organizeTicketCount = 3;

        const orderContainer =
            document.getElementById("orderContainer");

        const organizedOrders =
            document.getElementById("organizedOrders");

        const servedModal =
            document.getElementById("served-modal");

        const servedFilterTable =
            document.getElementById("served-filter-table");

        const servedFilterDish =
            document.getElementById("served-filter-dish");

        function getKitchenCategory(cookInfo) {

            if (cookInfo.kitchenCategory) {
                return cookInfo.kitchenCategory;
            }

            const cookTime =
                Number(cookInfo.cookTime);

            if (cookTime === 6) return "SIX";
            if (cookTime === 3) return "THREE";

            return "OTHER";
        }

        function isKitchenTarget(cookInfo) {

            if (!cookInfo) return false;

            if (cookInfo.kitchenCategory === "FLOOR") {
                return false;
            }

            return (
                cookInfo.section === "kitchen" ||
                cookInfo.section === "heat" ||
                cookInfo.section === "Flor"
            );
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
            console.log("Oracle MENUS読込完了", cookMap);
        }

        await loadCookList();

        function formatTableNo(table) {
            const value = String(table ?? "").trim().replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
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

        function normalizeOracleOrder(order) {
            const createdDate = new Date(order.createdAt);
            return {
                ...order,
                id: String(order.id),
                createdAt: {
                    toDate: () => createdDate,
                    toMillis: () => createdDate.getTime()
                },
                items: (order.items || []).map(item => ({
                    ...item,
                    hidden: !!item.served,
                    hiddenAt: item.servedAt ? new Date(item.servedAt).getTime() : null
                }))
            };
        }

        function renderOrders(orders) {

            orderContainer.innerHTML = "";
            latestOrders = orders.map(normalizeOracleOrder);

            const displayOrders = [...latestOrders].sort((a, b) => {
                const timeDiff = b.createdAt.toMillis() - a.createdAt.toMillis();
                return timeDiff || Number(b.id) - Number(a.id);
            });

            displayOrders.forEach(order => {

                const time =
                    order.createdAt?.toDate()
                        ?.toLocaleTimeString("ja-JP", {
                            hour: "2-digit",
                            minute: "2-digit"
                        }) || "--:--";

                let itemsHtml = "";

                order.items.forEach((item, itemIndex) => {

                    if (item.hidden) return;

                    const cookInfo =
                        cookMap[String(item.code)];

                    if (!isKitchenTarget(cookInfo)) return;

                    const cookTime =
                        cookInfo.cookTime ?? "-";

                    const displayName =
                        cookInfo.shortName || item.name;

                    itemsHtml += `
                        <div class="flex justify-between text-lg">
                            <span>
                                ${item.qty} ${displayName}
                            </span>

                            <span class="badge-red clickable"
                                data-order-id="${order.id}"
                                data-item-index="${itemIndex}"
                                title="クリックで非表示（注文データは保持されます）">
                                ${cookTime}
                            </span>
                        </div>
                    `;
                });

                if (itemsHtml === "") {
                    return;
                }

                orderContainer.innerHTML += `
                    <div class="order-card bg-blue-light p-3">

                        <div class="flex justify-between mb-2">

                            <span id="table-number" class="text-4xl font-bold">
                                ${formatTableNo(order.table)}卓
                            </span>

                            <span>
                                ${time}
                            </span>

                        </div>

                        ${itemsHtml}

                    </div>
                `;
            });

            // 「提供済み料理一覧」モーダルを開いている間は、リアルタイム更新に合わせて再描画する
            if (servedModal && !servedModal.classList.contains("hidden")) {
                renderServedTable();
            }
        }

        let ordersRefreshing = false;
        async function refreshOrders() {
            if (ordersRefreshing) return;
            ordersRefreshing = true;
            try {
                renderOrders(await window.oracleApi.getKitchenOrders());
            } catch (error) {
                console.error("Oracle注文データの取得に失敗しました", error);
                orderContainer.innerHTML = `<div class="bg-red-100 border border-red-500 p-4 font-bold text-red-800">注文データを取得できませんでした</div>`;
            } finally {
                ordersRefreshing = false;
            }
        }

        await refreshOrders();
        const kitchenEvents = new EventSource(window.oracleApi.kitchenStreamUrl);
        kitchenEvents.addEventListener("kitchen-update", () => refreshOrders());
        kitchenEvents.addEventListener("connected", () => refreshOrders());
        window.addEventListener("beforeunload", () => kitchenEvents.close());

        // SSEが一時的に切れた場合に備えた予備更新。
        setInterval(refreshOrders, 5000);

        // 「全消去」ボタン：注文データ自体は削除しない。
        // 右側の整理パネル表示のみをクリアする（左側のキッチン表示・注文データは維持）。
        document.getElementById('delete-btn').addEventListener('click', () => {

            if (!confirm("右側の整理パネルの表示を消去しますか？\n（左側の注文・データベースの注文履歴は削除されません）")) {
                return;
            }

            organizedOrders.innerHTML = "";
            organizedOrderIds.clear();

        });

        document.getElementById('organize-btn').addEventListener('click', () => {

            const pendingOrders =
                [...latestOrders]
                    .filter(order =>
                        !organizedOrderIds.has(order.id) &&
                        order.items.some(item => !item.hidden && isKitchenTarget(cookMap[String(item.code)]))
                    )
                    .sort((a, b) => {
                        const timeDiff = a.createdAt.toMillis() - b.createdAt.toMillis();
                        if (timeDiff) return timeDiff;
                        return Number(a.id) - Number(b.id);
                    });

            const oldestTable = pendingOrders[0]?.table;
            const targetOrders = pendingOrders
                    .sort((a, b) => {
                        if (a.table === oldestTable && b.table !== oldestTable) return -1;
                        if (b.table === oldestTable && a.table !== oldestTable) return 1;
                        return 0;
                    })
                    .slice(0, organizeTicketCount);

            if (targetOrders.length === 0) {
                alert("整理する新しい伝票がありません");
                return;
            }

            let groupItems = [];

            targetOrders.forEach(order => {

                order.items.forEach((item, itemIndex) => {

                    if (item.hidden) return;

                    const cookInfo =
                        cookMap[String(item.code)];

                    if (!isKitchenTarget(cookInfo)) return;

                    const category =
                        getKitchenCategory(cookInfo);

                    const cookTime =
                        Number(cookInfo.cookTime || 0);

                    const displayName =
                        cookInfo.shortName || item.name;

                    groupItems.push({
                        orderId: order.id,
                        itemIndex: itemIndex,
                        table: order.table,
                        createdAtMs: order.createdAt.toMillis(),
                        qty: item.qty,
                        name: displayName,
                        cookTime: cookTime,
                        category: category,
                        menuCategory: cookInfo.category,
                        station: cookInfo.section
                    });

                });
            });

            const schedule = window.KitchenScheduler.scheduleKitchenItems(groupItems);
            groupItems = schedule.items;
            console.info("KDS schedule", {
                exact: schedule.exact,
                score: schedule.score,
                evaluatedTransitions: schedule.evaluatedTransitions
            });

            groupItems.forEach(item => {

                organizedOrders.innerHTML += `
                    <div class="flex justify-between items-center text-xl border-b border-dotted border-orange-400 py-1">

                        <div class="flex items-center space-x-2">
                            <span class="badge-red clickable"
                                data-order-id="${item.orderId}"
                                data-item-index="${item.itemIndex}"
                                title="クリックでキッチン表示から非表示（注文データは保持されます）">
                                ${item.cookTime}
                            </span>

                            <span>
                                ${formatTableNo(item.table)}卓　
                                ${item.qty} ${item.name}
                            </span>
                        </div>

                    </div>
                `;
            });

            organizedOrders.innerHTML += `
                <div class="border-b-4 border-black my-3"></div>
            `;

            targetOrders.forEach(order => {
                organizedOrderIds.add(order.id);
            });
        });

        // 赤丸（調理時間バッジ）クリック時の共通処理
        // → 該当の料理を非表示にする（左側キッチン表示・右側整理パネルの両方から相互に非表示）。
        //   Oracleの注文データ自体は削除せず、提供済み状態と提供時刻を記録する。
        //   お客様側の注文履歴には影響しない。
        //   同時に「提供時間」として hiddenAt（クリック時刻）を記録する。
        async function hideItem(orderId, itemIndex) {

            try {

                const targetOrder =
                    latestOrders.find(order => String(order.id) === String(orderId));

                if (!targetOrder || !targetOrder.items || !targetOrder.items[itemIndex]) {
                    console.error("対象の注文データが見つかりませんでした", orderId, itemIndex);
                    return;
                }

                const targetItem = targetOrder.items[itemIndex];
                await window.oracleApi.updateKitchenItem(targetItem.id, "COMPLETED", true);
                await refreshOrders();

            } catch (error) {
                console.error("非表示処理に失敗しました", error);
            }
        }

        // ============================================================
        // 「提供済」ボタン：提供済み（赤丸クリック済み）の料理を
        // 卓番フィルター・料理フィルター付きの一覧テーブルで確認するモーダル
        // ============================================================

        function formatOrderTime(ts) {
            return ts?.toDate
                ? ts.toDate().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
                : "--:--";
        }

        function formatServedTime(ms) {
            if (!ms) return "--:--";
            return new Date(ms).toLocaleTimeString("ja-JP", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            });
        }

        // 注文方法の表示整形
        // ・"SELF"            → index.html（お客様セルフオーダー）からの注文
        // ・その他の値（使用者コード）→ admin.html（店舗管理端末）からの注文
        // ・未設定（古いデータ等）  → "-"
        function formatOrderMethod(orderMethod) {
            if (!orderMethod || orderMethod === "-") return "-";
            if (orderMethod === "SELF") return "🙋 SELF";
            return `👔 ${orderMethod}`;
        }

        // 「所定時間の±」列の表示整形
        // 所定所要時間(分) = Oracle MENUSのSTANDARD_COOK_TIME。
        // 所定提供予定時刻 = 注文時刻(createdAt) + cookTime分
        // ±差 = 実際の提供時刻(hiddenAt) - 所定提供予定時刻
        //   ・所定より遅い(提供が遅れた) → "+"（赤色）
        //   ・所定より早い(前倒しで提供できた) → "-"（青色）
        function formatTimeDiff(orderTime, cookTime, servedAt) {

            const orderMs = orderTime?.toMillis ? orderTime.toMillis() : null;

            if (orderMs === null || cookTime === null || cookTime === undefined || !servedAt) {
                return { text: "-", cls: "text-gray-400" };
            }

            const expectedMs = orderMs + (Number(cookTime) * 60 * 1000);
            const diffMs = servedAt - expectedMs;

            const sign = diffMs >= 0 ? "+" : "-";
            const absSec = Math.round(Math.abs(diffMs) / 1000);
            const min = Math.floor(absSec / 60);
            const sec = absSec % 60;

            const text = `${sign}${min}分${String(sec).padStart(2, "0")}秒`;
            const cls = diffMs > 0 ? "text-red-600 font-bold" : (diffMs < 0 ? "text-blue-600 font-bold" : "text-gray-600");

            return { text, cls };
        }

        // hidden:true（＝赤丸を押して提供済みにした）アイテムを一覧化
        function getServedItems() {

            const list = [];

            latestOrders.forEach(order => {

                (order.items || []).forEach(item => {

                    if (!item.hidden) return;

                    const price = Number(item.price) || 0;
                    const qty = Number(item.qty) || 0;

                    const cookInfo = cookMap[String(item.code)];
                    const cookTime = cookInfo?.cookTime ?? null;

                    list.push({
                        table: order.table,
                        orderTime: order.createdAt,
                        name: item.name || "(名称未設定)",
                        qty: qty,
                        amount: price * qty,
                        servedAt: item.hiddenAt,
                        orderMethod: order.orderMethod || "-",
                        cookTime: cookTime
                    });
                });
            });

            // 提供時間が新しい順に表示（未記録のものは末尾）
            list.sort((a, b) => (b.servedAt || 0) - (a.servedAt || 0));

            return list;
        }

        // フィルターの選択肢を最新データから再構築（選択中の値はできる限り維持）
        function populateServedFilters(items) {

            const currentTable = servedFilterTable.value;
            const currentDish = servedFilterDish.value;

            const tables =
                [...new Set(items.map(it => String(it.table)))]
                    .sort((a, b) => tableSortValue(a) - tableSortValue(b));

            const dishes =
                [...new Set(items.map(it => it.name))]
                    .sort((a, b) => a.localeCompare(b, "ja"));

            servedFilterTable.innerHTML =
                `<option value="">すべての卓番</option>` +
                tables.map(t => `<option value="${t}">${formatTableNo(t)}卓</option>`).join("");

            servedFilterDish.innerHTML =
                `<option value="">すべての料理</option>` +
                dishes.map(d => `<option value="${d}">${d}</option>`).join("");

            servedFilterTable.value = tables.includes(currentTable) ? currentTable : "";
            servedFilterDish.value = dishes.includes(currentDish) ? currentDish : "";
        }

        function renderServedTable() {

            const items = getServedItems();

            populateServedFilters(items);

            const tableFilter = servedFilterTable.value;
            const dishFilter = servedFilterDish.value;

            const filtered = items.filter(it =>
                (tableFilter === "" || String(it.table) === tableFilter) &&
                (dishFilter === "" || it.name === dishFilter)
            );

            const tbody = document.getElementById("served-table-body");

            tbody.innerHTML = filtered.length === 0
                ? `<tr><td colspan="9" class="text-center py-6 text-gray-500">該当する提供済み料理はありません</td></tr>`
                : filtered.map(it => {
                    const diff = formatTimeDiff(it.orderTime, it.cookTime, it.servedAt);
                    return `
                    <tr class="border-b border-gray-300">
                        <td class="border border-gray-300 px-2 py-1 text-center">${formatTableNo(it.table)}卓</td>
                        <td class="border border-gray-300 px-2 py-1 text-center">${formatOrderTime(it.orderTime)}</td>
                        <td class="border border-gray-300 px-2 py-1">${it.name}</td>
                        <td class="border border-gray-300 px-2 py-1 text-center">${it.qty}</td>
                        <td class="border border-gray-300 px-2 py-1 text-right">¥${it.amount.toLocaleString()}</td>
                        <td class="border border-gray-300 px-2 py-1 text-center">${formatServedTime(it.servedAt)}</td>
                        <td class="border border-gray-300 px-2 py-1 text-center ${diff.cls}">${diff.text}</td>
                        <td class="border border-gray-300 px-2 py-1 text-center font-bold">${formatOrderMethod(it.orderMethod)}</td>
                        <td class="border border-gray-300 px-2 py-1 text-center text-gray-400">-</td>
                    </tr>
                `;
                }).join("");

            document.getElementById("served-count").textContent = `${filtered.length} 件`;
        }

        document.getElementById("completed-btn").addEventListener("click", () => {
            servedModal.classList.remove("hidden");
            renderServedTable();
        });

        document.getElementById("served-modal-close").addEventListener("click", () => {
            servedModal.classList.add("hidden");
        });

        servedModal.addEventListener("click", (event) => {
            if (event.target === servedModal) {
                servedModal.classList.add("hidden");
            }
        });

        servedFilterTable.addEventListener("change", renderServedTable);
        servedFilterDish.addEventListener("change", renderServedTable);

        // 左側（キッチン表示）の赤丸クリック
        orderContainer.addEventListener('click', (event) => {

            const badge = event.target.closest('.badge-red.clickable');

            if (!badge) return;

            const orderId = badge.dataset.orderId;
            const itemIndex = Number(badge.dataset.itemIndex);

            if (!orderId || Number.isNaN(itemIndex)) return;

            hideItem(orderId, itemIndex);
        });

        // 右側（整理パネル）の赤丸クリック
        organizedOrders.addEventListener('click', (event) => {

            const badge = event.target.closest('.badge-red.clickable');

            if (!badge) return;

            const orderId = badge.dataset.orderId;
            const itemIndex = Number(badge.dataset.itemIndex);

            if (!orderId || Number.isNaN(itemIndex)) return;

            hideItem(orderId, itemIndex);

            // 整理パネル上の該当行も見た目上すぐ消す
            // （左側はOracle再取得で反映されるが、
            //   右側の整理パネルは一度作った静的な表示なので明示的に削除する）
            const row = badge.closest('.flex.justify-between.items-center');
            if (row) row.remove();
        });
    
if (window.orderAppRoute() === '/kitchen/served') { servedModal.classList.remove('hidden'); renderServedTable(); }
