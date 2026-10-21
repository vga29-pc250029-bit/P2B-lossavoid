const v2StaffKey = 'p2b-v2:staff-cart';
let v2StaffState;
try { v2StaffState = JSON.parse(sessionStorage.getItem(v2StaffKey) || '{}'); } catch { v2StaffState = {}; }
function saveStaffState() {
    try { sessionStorage.setItem(v2StaffKey, JSON.stringify({cart})); } catch {}
}
window.addEventListener('pagehide', saveStaffState);

    // ---- 卓番・人数 ----
    let staffCode = localStorage.getItem('staffCode') || localStorage.getItem('lastStaffCode') || '';
    let tableNumber = localStorage.getItem('staffTableNumber') || '';
    let guestCount = localStorage.getItem('guestCount') || '';

    if (document.getElementById('table-number-input')) document.getElementById('table-number-input').value = tableNumber;
    if (document.getElementById('guest-count-input')) document.getElementById('guest-count-input').value = guestCount;

    function setActiveStaffCode(code) {
        staffCode = String(code || '').trim();
        localStorage.setItem('staffCode', staffCode);
        if (staffCode) {
            localStorage.setItem('lastStaffCode', staffCode);
        } else {
            localStorage.removeItem('lastStaffCode');
        }

        const currentCard = document.getElementById('staff-current-card');
        if (currentCard) currentCard.textContent = staffCode || '未設定';
        updateTableChips();
    }

    function onStaffInfoChange() {
        tableNumber = document.getElementById('table-number-input').value.trim();
        guestCount = document.getElementById('guest-count-input').value.trim();
        localStorage.setItem('staffTableNumber', tableNumber);
        localStorage.setItem('guestCount', guestCount);
        updateTableChips();
    }

    function normalizeStaffTableNumber() {
        const input = document.getElementById('table-number-input');
        const value = input.value.trim();
        if (!value) {
            onStaffInfoChange();
            return '';
        }
        const normalized = normalizeTableNo(value);
        if (!normalized) {
            alert('卓番は01〜99、または01-1の形式で入力してください。');
            input.focus();
            input.select();
            return null;
        }
        input.value = normalized;
        onStaffInfoChange();
        return normalized;
    }

    function normalizeGuestCount() {
        const input = document.getElementById('guest-count-input');
        const value = input.value.trim();
        if (!value) {
            onStaffInfoChange();
            return '';
        }
        const count = Number(value);
        if (!Number.isInteger(count) || count < 1 || count > 99) {
            alert('人数は1〜99の範囲で入力してください。');
            input.focus();
            input.select();
            return null;
        }
        input.value = String(count);
        onStaffInfoChange();
        return count;
    }

    function updateTableChips() {
        const label = tableNumber ? `テーブル ${tableNumber}` : 'テーブル —';
        document.querySelectorAll('#table-chip, #table-chip2').forEach(el => {
            el.textContent = label;
        });
        if (document.getElementById('cart-staff-info')) document.getElementById('cart-staff-info').textContent =
            `卓番: ${tableNumber || '—'} / 人数: ${guestCount || '—'}名`;
    }
    setActiveStaffCode(staffCode);

    let currentQty = 1;
    let modalCode = null;
    let cart = Array.isArray(v2StaffState.cart) ? v2StaffState.cart : [];
    let orderedOrders = [];
    let orderedLoadSeq = 0;
    const cancelingItemIds = new Set();
    let currentCategory = 'all';
    let searchKeyword = '';

    // ---- メニューデータ（Firestore「CookList」コレクションから取得） ----
    let menuData = {};
    let menuList = [];

    // カテゴリ判定（メニュー番号の先頭から推定）
    function getCategory(code) {
        code = String(code);
        if (code.startsWith("1")) return "appetizer";
        if (code.startsWith("21")) return "doria";
        if (code.startsWith("22")) return "pizza";
        if (code.startsWith("23")) return "pasta";
        if (code.startsWith("24")) return "meat";
        if (code.startsWith("31")) return "rice";
        if (code.startsWith("32")) return "dessert";
        if (code.startsWith("5")) return "drink";
        return "other";
    }
    const categoryMeta = {
        all:       { label: "すべて",       icon: "🍽" },
        appetizer: { label: "前菜・サラダ", icon: "🥗" },
        doria:     { label: "ドリア",       icon: "🍚" },
        pizza:     { label: "ピザ",         icon: "🍕" },
        pasta:     { label: "パスタ",       icon: "🍝" },
        meat:      { label: "肉・グリル",   icon: "🥩" },
        rice:      { label: "ライス・パン", icon: "🍞" },
        dessert:   { label: "デザート",     icon: "🍰" },
        drink:     { label: "ドリンク",     icon: "🥤" },
        other:     { label: "その他",       icon: "🍴" },
    };

    const jokeMenuMeta = {
        '2101': { name: 'ミラノ風ドリア（熱々の本気）', badge: '焼き目、絶好調' },
        '2203': { name: 'マルゲリータ（モッツァレラ会議中）', badge: '窯の本気' },
        '2303': { name: 'ペペロンチーノ（にんにく強めの決意）', badge: '香り先行型' },
        '1401': { name: '辛味チキン（4本では止まらない）', badge: '手が止まらない部' },
        '3215': { name: 'コーヒーゼリー＆ジェラート（別皿同盟）', badge: '甘党作戦会議' }
    };

    function displayMenuName(item) {
        return jokeMenuMeta[String(item?.code)]?.name || item?.name || '(名称未設定)';
    }

    // 在庫切れ判定（品切れフラグまたは残数0）
    function isOutOfStock(item) {
        if (item.soldOut) return true;
        if (item.stockQty !== null && item.stockQty !== undefined && item.stockQty <= 0) return true;
        return false;
    }

    // ---- FirestoreのCookListコレクションからメニューを取得 ----
    async function loadMenuFromOracle() {
        const rows = await window.oracleApi.getMenus();
        menuList = rows.map(data => {
            const code = String(data.code);
            const category = Object.hasOwn(categoryMeta, data.category) ? data.category : getCategory(code);
            return {...data, code, docId:code, category, icon:categoryMeta[category]?.icon || '🍴', stockQty:data.stockQty ?? null};
        });
        menuData = Object.fromEntries(menuList.map(item => [item.code, item]));
    }

    // ---- カテゴリタブ描画 ----
    function renderCategoryTabs() {
        if (!document.getElementById('category-tabs')) return;
        const usedCats = ['all', ...new Set(menuList.map(m => m.category))];
        const wrap = document.getElementById('category-tabs');
        wrap.innerHTML = usedCats.map(cat => `
            <button class="cat-tab${cat === currentCategory ? ' active' : ''}" onclick="selectCategory('${cat}')">
                ${categoryMeta[cat].icon} ${categoryMeta[cat].label}
            </button>
        `).join('');
    }

    function selectCategory(cat) {
        currentCategory = cat;
        renderCategoryTabs();
        renderMenuGrid();
        document.getElementById('menu-scroll').scrollTop = 0;
    }

    function onSearchInput() {
        searchKeyword = document.getElementById('search-input').value.trim();
        renderMenuGrid();
    }

    // ---- メニューグリッド描画 ----
    function renderMenuGrid() {
        if (!document.getElementById('menu-grid')) return;
        let items = menuList;
        if (currentCategory !== 'all') items = items.filter(m => m.category === currentCategory);
        if (searchKeyword) items = items.filter(m => m.name.includes(searchKeyword) || m.code.includes(searchKeyword));

        const grid = document.getElementById('menu-grid');
        if (menuList.length === 0) {
            grid.innerHTML = `<div class="empty-result"><div style="font-size:40px;margin-bottom:8px;">📭</div>メニューが登録されていません<br><span style="font-size:12px;">(Firestoreの CookList コレクションをご確認ください)</span></div>`;
            return;
        }
        if (items.length === 0) {
            grid.innerHTML = `<div class="empty-result"><div style="font-size:40px;margin-bottom:8px;">🔍</div>該当するメニューが見つかりません</div>`;
            return;
        }
        grid.innerHTML = items.map(item => {
            const inCartQty = cart.filter(c => c.code === item.code).reduce((s, c) => s + c.qty, 0);
            const outOfStock = isOutOfStock(item);
            const lowStock = !outOfStock && item.stockQty !== null && item.stockQty <= 5;
            const hasAllergen = item.allergens && item.allergens.length > 0;
            const joke = jokeMenuMeta[item.code];
            return `
            <div class="menu-card${outOfStock ? ' sold-out' : ''}" onclick="${outOfStock ? `showToast('⚠️ ${item.name} は品切れ中です')` : `openQtyModal('${item.code}')`}">
                ${inCartQty > 0 && !outOfStock ? `<div class="in-cart-dot" style="display:flex;align-items:center;">×${inCartQty}</div>` : ''}
                ${outOfStock ? `<div class="sold-out-badge">品切れ</div>` : (lowStock ? `<div class="low-stock-badge">残${item.stockQty}点</div>` : '')}
                ${hasAllergen ? `<div class="allergen-badge" title="${item.allergens.join(',')}"><i class="fa-solid fa-triangle-exclamation"></i></div>` : ''}
                <div class="menu-media">
                    <img class="menu-image" src="${item.imageUrl}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">
                    <div class="menu-icon" hidden>${item.icon}</div>
                    ${joke ? `<span class="menu-joke-badge">${joke.badge}</span>` : ''}
                </div>
                <div class="menu-name">${displayMenuName(item)}</div>
                <div class="menu-bottom">
                    <div class="menu-price">${item.price}円</div>
                    <div class="qty-btn" style="width:2rem;height:2rem;font-size:1.1rem;${outOfStock ? 'opacity:.3;' : ''}">+</div>
                </div>
            </div>`;
        }).join('');
    }

    // ---- 数量選択モーダル ----
    function openQtyModal(code) {
        const item = menuData[code];
        if (!item || isOutOfStock(item)) {
            showToast('⚠️ この商品は品切れ中です');
            return;
        }
        modalCode = code;
        currentQty = 1;
        document.getElementById('modal-item-name').textContent = displayMenuName(item);
        document.getElementById('modal-item-price').textContent = item.price + '円';
        document.getElementById('modal-qty-display').textContent = currentQty;
        document.getElementById('qty-overlay').classList.add('show');
    }
    function closeQtyModal() {
        document.getElementById('qty-overlay').classList.remove('show');
        modalCode = null;
    }
    function changeModalQty(diff) {
        currentQty = Math.max(1, currentQty + diff);
        document.getElementById('modal-qty-display').textContent = currentQty;
    }
    function confirmAddToCart() {
        const item = menuData[modalCode];
        if (!item || isOutOfStock(item)) {
            showToast('⚠️ この商品は品切れ中です');
            closeQtyModal();
            renderMenuGrid();
            return;
        }
        const existing = cart.find(c => c.code === modalCode);
        if (existing) {
            existing.qty += currentQty;
        } else {
            cart.push({ code: modalCode, name: item.name, price: item.price, qty: currentQty });
        }
        updateCartBadge();
        renderMenuGrid();
        showToast(`${item.icon} ${item.name} を${currentQty}点 追加しました`);
        closeQtyModal();
    }

    // ---- カートバッジ ----
    function updateCartBadge() {
        if (!document.getElementById('cart-badge')) return;
        const badge = document.getElementById('cart-badge');
        const totalCount = cart.reduce((s, c) => s + c.qty, 0);
        if (totalCount > 0) {
            badge.textContent = totalCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    // ---- 画面切り替え ----
    const FOOTER_PAGES = ['view-menu', 'view-cart'];
    function showPage(pageId, initial = false) {
        const routes = {'view-home':'/admin','view-menu':'/admin/orders/new','view-cart':'/admin/orders/cart','view-staff':'/admin/staff','view-stock':'/admin/stock','view-allergy':'/admin/allergens','view-tablemove':'/admin/orders/edit','view-merge':'/admin/orders/merge'};
        if (pageId === 'view-staff' && authenticatedUser?.role !== 'SYSTEM_ADMIN') {
            showToast('システム管理者のみ利用できます');
            return;
        }
        if (!initial && routes[pageId] !== location.pathname) {
            saveStaffState();
            location.assign(routes[pageId]);
            return;
        }
        document.querySelectorAll('.page').forEach(p => p.classList.toggle('hidden', p.id !== pageId));
        document.getElementById('footer-nav')?.classList.toggle('hidden', !FOOTER_PAGES.includes(pageId));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        if (pageId === 'view-menu') document.getElementById('nav-add')?.classList.add('active');
        if (pageId === 'view-cart') { document.getElementById('nav-cart')?.classList.add('active'); renderCart(); loadOrderedCartItems(); }
        if (pageId === 'view-stock') renderStockList();
        if (pageId === 'view-allergy') renderAllergyList();
        if (pageId === 'view-staff') loadStaffList().then(() => {
            const code = new URLSearchParams(location.search).get('code');
            if (code && document.body.dataset.staffMode === 'update') editStaff(encodeURIComponent(code));
        });
        if (pageId === 'view-tablemove') resetTableMoveUI();
        if (pageId === 'view-merge') resetMergeUI();
    }

    // ---- カート画面描画 ----
    function renderCart() {
        if (!document.getElementById('cart-items-list')) return;
        updateTableChips();
        const list = document.getElementById('cart-items-list');
        if (cart.length === 0) {
            list.innerHTML = `<div class="text-center text-gray-400 mt-16">
                <div style="font-size:44px;margin-bottom:10px;">🛒</div>
                注文かごは空です
            </div>`;
            document.getElementById('submit-btn').disabled = true;
        } else {
            document.getElementById('submit-btn').disabled = false;
            list.innerHTML = cart.map((item, index) => {
                const icon = menuData[item.code]?.icon || '🍽';
                return `
                <div class="cart-row">
                    <div class="ci-icon">${icon}</div>
                    <div class="ci-info">
                        <div class="ci-name">${displayMenuName(item)}</div>
                        <div class="ci-sub">${item.price * item.qty}円</div>
                    </div>
                    <div class="qty-ctrl">
                        <button class="qty-btn" onclick="updateCartQty(${index}, -1)">−</button>
                        <div style="min-width:20px;text-align:center;font-weight:900;">${item.qty}</div>
                        <button class="qty-btn" onclick="updateCartQty(${index}, 1)">＋</button>
                    </div>
                </div>`;
            }).join('');
        }
        let totalP = 0, totalC = 0;
        cart.forEach(item => { totalP += item.price * item.qty; totalC += item.qty; });
        document.getElementById('cart-current-count').textContent = totalC + '点';
        document.getElementById('total-count').textContent = totalC + '点';
        document.getElementById('total-price').textContent = `合計 ${totalP}円 (税込)`;
    }

    function updateCartQty(index, diff) {
        cart[index].qty += diff;
        if (cart[index].qty <= 0) cart.splice(index, 1);
        updateCartBadge();
        renderCart();
        renderMenuGrid();
    }

    function formatOrderCreatedAt(order) {
        const createdAt = order.createdAt?.toDate?.() || new Date(order.createdAt);
        if (Number.isNaN(createdAt?.getTime?.())) return '--:--';
        return createdAt.toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function renderOrderedCartItems(message = '') {
        const wrap = document.getElementById('ordered-items-list');
        const count = document.getElementById('ordered-count');
        if (!wrap || !count) return;

        const visibleRows = orderedOrders.flatMap(order =>
            (order.items || []).map((item, itemIndex) => ({ order, item, itemIndex }))
        );
        count.textContent = visibleRows.reduce((sum, row) => sum + (Number(row.item.qty) || 0), 0) + '点';

        if (message) {
            wrap.innerHTML = `<div class="empty-note">${message}</div>`;
            return;
        }
        if (orderedOrders.length === 0 || visibleRows.length === 0) {
            wrap.innerHTML = `<div class="empty-note">この卓番の注文済み商品はありません</div>`;
            return;
        }

        wrap.innerHTML = orderedOrders.map(order => {
            const rows = (order.items || []).map((item, itemIndex) => {
                const icon = menuData[String(item.code)]?.icon || '🍽';
                const qty = Number(item.qty) || 0;
                const price = Number(item.price) || 0;
                const served = !!(item.served || item.hidden);
                return `
                    <div class="ordered-row${served ? ' served' : ''}">
                        <div class="ci-icon">${icon}</div>
                        <div class="ordered-info">
                            <div class="ordered-name">${displayMenuName(item)}</div>
                            <div class="ordered-sub">${qty}点 / ${price * qty}円${served ? ' / 提供済み' : ''}</div>
                        </div>
                        <button class="cancel-item-btn" onclick="cancelOrderedItem('${order.id}', ${itemIndex})">
                            1個取消
                        </button>
                    </div>`;
            }).join('');
            return `
                <div class="ordered-card">
                    <div class="ordered-head">
                        <span>${normalizeTableNo(order.table) || order.table}卓 / ${formatOrderCreatedAt(order)}</span>
                        <span>${order.orderMethod || '-'}</span>
                    </div>
                    ${rows}
                </div>`;
        }).join('');
    }

    async function loadOrderedCartItems() {
        const wrap = document.getElementById('ordered-items-list');
        const count = document.getElementById('ordered-count');
        if (!wrap || !count) return;

        const seq = ++orderedLoadSeq;
        orderedOrders = [];
        count.textContent = '確認中';

        const rawTable = String(tableNumber || '').trim();
        const normalizedTable = normalizeTableNo(rawTable);
        if (!normalizedTable) {
            renderOrderedCartItems('卓番を入力すると注文済み商品を確認できます');
            return;
        }

        wrap.innerHTML = `<div class="empty-note"><i class="fa-solid fa-spinner fa-spin"></i> 注文済み商品を確認中...</div>`;
        try {
            const tableKeys = [normalizedTable];
            if (rawTable && rawTable !== normalizedTable) tableKeys.push(rawTable);
            const byId = new Map();
            for (const key of tableKeys) {
                const orders = await fetchOrdersByTable(key);
                orders.forEach(order => byId.set(order.id, order));
            }
            if (seq !== orderedLoadSeq) return;
            orderedOrders = [...byId.values()].filter(order => Array.isArray(order.items) && order.items.length > 0);
            orderedOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            renderOrderedCartItems();
        } catch (e) {
            console.error(e);
            if (seq !== orderedLoadSeq) return;
            count.textContent = '-';
            wrap.innerHTML = `<div class="empty-note">注文済み商品の確認に失敗しました</div>`;
        }
    }

    async function cancelOrderedItem(orderId, itemIndex) {
        const order = orderedOrders.find(o => o.id === orderId);
        if (!order || !Array.isArray(order.items) || !order.items[itemIndex]) {
            showToast('⚠️ 対象の商品が見つかりません');
            await loadOrderedCartItems();
            return;
        }

        const item = order.items[itemIndex];
        if (cancelingItemIds.has(String(item.id))) return;
        const tableLabel = normalizeTableNo(order.table) || order.table;
        const servedNote = (item.served || item.hidden) ? '（提供済み）' : '';
        if (!confirm(`${tableLabel}卓の「${displayMenuName(item)}」${servedNote}を1個取消します。よろしいですか？`)) return;

        try {
            cancelingItemIds.add(String(item.id));
            await window.oracleApi.cancelOrderItem(orderId, item.id);
            showToast('✅ 商品を1個取消しました');
            await loadOrderedCartItems();
        } catch (e) {
            console.error(e);
            showToast('⚠️ 取消に失敗しました');
        } finally {
            cancelingItemIds.delete(String(item.id));
        }
    }

    // ---- 注文送信 ----
    // orderMethod は従業員端末からの注文を示す区分として保存する。
    async function submitOrder() {
        if (cart.length === 0) {
            showToast('注文かごが空です');
            return;
        }
        if (!tableNumber) {
            showToast('⚠️ 卓番を入力してください');
            showPage('view-menu');
            document.getElementById('table-number-input').focus();
            return;
        }
        const normalizedTable = normalizeStaffTableNumber();
        if (!normalizedTable) {
            showPage('view-menu');
            return;
        }
        const normalizedGuestCount = normalizeGuestCount();
        if (normalizedGuestCount === null) {
            showPage('view-menu');
            return;
        }
        const btn = document.getElementById('submit-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 送信中...';
        try {
            await window.oracleApi.createOrder({
                table: normalizedTable,
                guestCount: normalizedGuestCount || null,
                orderMethod: staffCode || 'STAFF',
                items: cart.map(item => ({ ...item }))
            });
            cart = [];
            updateCartBadge();
            renderMenuGrid();
            showToast(`🎉 ${normalizedTable}卓への注文を送信しました！`);
            showPage('view-menu');
        } catch (error) {
            console.error(error);
            showToast('⚠️ 送信に失敗しました。もう一度お試しください。');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> 注文する';
        }
    }

    // =====================================================================
    // 在庫管理
    // =====================================================================
    let stockEditState = {}; // docId -> {soldOut, stockQty}

    function renderStockList() {
        if (!document.getElementById('stock-list-card')) return;
        const kw = (document.getElementById('stock-search-input')?.value || '').trim();
        let items = menuList;
        if (kw) items = items.filter(m => m.name.includes(kw) || m.code.includes(kw));

        const card = document.getElementById('stock-list-card');
        if (items.length === 0) {
            card.innerHTML = `<div class="empty-note">該当する商品がありません</div>`;
            return;
        }
        card.innerHTML = items.map(item => {
            if (!(item.docId in stockEditState)) {
                stockEditState[item.docId] = { soldOut: item.soldOut, stockQty: item.stockQty };
            }
            const st = stockEditState[item.docId];
            return `
            <div class="stock-row">
                <div class="stock-name">${item.name} <span class="code">#${item.code}</span></div>
                <input type="number" class="stock-qty-input" placeholder="残数" value="${st.stockQty === null ? '' : st.stockQty}"
                    onchange="updateStockEditQty('${item.docId}', this.value)">
                <button class="soldout-toggle${st.soldOut ? ' on' : ''}" onclick="toggleStockSoldOut('${item.docId}')">
                    ${st.soldOut ? '品切れ中' : '在庫あり'}
                </button>
            </div>`;
        }).join('');
    }

    function updateStockEditQty(docId, val) {
        const n = val === '' ? null : Number(val);
        stockEditState[docId].stockQty = n;
    }
    function toggleStockSoldOut(docId) {
        stockEditState[docId].soldOut = !stockEditState[docId].soldOut;
        renderStockList();
    }

    async function saveAllStock() {
        const ids = Object.keys(stockEditState);
        if (ids.length === 0) {
            showToast('変更がありません');
            return;
        }
        showToast('保存中...');
        try {
            for (const docId of ids) {
                const st = stockEditState[docId];
                await window.oracleApi.updateStock(docId, st.stockQty ?? null, !!st.soldOut);
            }
            await loadMenuFromOracle();
            stockEditState = {};
            renderStockList();
            renderMenuGrid();
            showToast('✅ 在庫情報を保存しました');
        } catch (e) {
            console.error(e);
            showToast('⚠️ 保存に失敗しました');
        }
    }

    // テーブル変更
    // =====================================================================
    // 卓番は 01〜99、または 01-1 のような XX-X 形式に統一する。
    // =====================================================================
    function normalizeTableNo(raw) {
        const value = String(raw || '').trim().replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
        const m = value.match(/^(\d{1,2})(?:-(\d))?$/);
        if (!m) return null;
        const main = Number(m[1]);
        if (!Number.isInteger(main) || main < 1 || main > 99) return null;
        const base = String(main).padStart(2, '0');
        return m[2] !== undefined ? `${base}-${m[2]}` : base;
    }

    function normalizeTableInput(inputId, label) {
        const input = document.getElementById(inputId);
        const value = input.value.trim();
        if (!value) return '';
        const normalized = normalizeTableNo(value);
        if (!normalized) {
            alert(`${label}は01〜99、または01-1の形式で入力してください。`);
            input.focus();
            input.select();
            return null;
        }
        input.value = normalized;
        return normalized;
    }

    async function fetchOrdersByTable(table) {
        const rows = await window.oracleApi.getOrdersByTable(table);
        return rows.map(row => ({...row, id:String(row.id)}));
    }

    // =====================================================================
    // 卓番変更
    // =====================================================================
    let tmTickets = [];
    let lastTmAlertTable = '';

    function resetTableMoveUI() {
        document.getElementById('tm-from-table').value = normalizeTableNo(tableNumber) || '';
        document.getElementById('tm-tickets-wrap').innerHTML = '';
        document.getElementById('tm-preview').innerHTML = '<div class="operation-empty">変更前の卓番を入力すると、ここに移動内容が表示されます</div>';
        document.getElementById('tm-to-table').value = '';
        tmTickets = [];
        lastTmAlertTable = '';
        if (document.getElementById('tm-from-table').value) searchTableMoveTickets(false);
    }

    function onTableMoveTableInput() {
        const t = normalizeTableInput('tm-from-table', '変更前の卓番');
        if (!t) return;
        searchTableMoveTickets(true);
    }

    function onTableMoveTableKey(event) {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        onTableMoveTableInput();
    }

    function onTableMoveTargetInput() {
        normalizeTableInput('tm-to-table', '変更後の卓番');
        updateTableMovePreview();
    }

    function onTableMoveTargetKey(event) {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        onTableMoveTargetInput();
    }

    async function searchTableMoveTickets(showMissingAlert = false) {
        const t = normalizeTableInput('tm-from-table', '変更前の卓番');
        if (!t) return;
        const wrap = document.getElementById('tm-tickets-wrap');
        wrap.innerHTML = `<div class="empty-note"><i class="fa-solid fa-spinner fa-spin"></i> 確認中...</div>`;
        try {
            tmTickets = await fetchOrdersByTable(t);
            renderTableMoveTickets(showMissingAlert);
        } catch (e) {
            console.error(e);
            wrap.innerHTML = `<div class="empty-note">伝票の確認に失敗しました</div>`;
        }
    }

    function renderTableMoveTickets(showMissingAlert = false) {
        const wrap = document.getElementById('tm-tickets-wrap');
        const from = document.getElementById('tm-from-table').value.trim();
        if (tmTickets.length === 0) {
            wrap.innerHTML = `<div class="empty-note">この卓の伝票は見つかりませんでした</div>`;
            updateTableMovePreview();
            if (showMissingAlert && lastTmAlertTable !== from) {
                alert(`${from}卓の伝票は存在しません。`);
                lastTmAlertTable = from;
            }
            return;
        }
        lastTmAlertTable = '';
        wrap.innerHTML = tmTickets.map(t => ticketCardHtml(
            t, true, 'void(0)', `<div class="move-select-badge"><i class="fa-solid fa-right-left"></i> 移動対象</div>`
        )).join('');
        updateTableMovePreview();
    }

    function toggleTmSelect(id) {
        // 卓番は一意のため、伝票選択は行わない。
    }

    function updateTableMovePreview() {
        const from = document.getElementById('tm-from-table').value.trim() || '-';
        const toInput = document.getElementById('tm-to-table');
        const to = toInput ? (toInput.value.trim() || '未入力') : '未入力';
        const preview = document.getElementById('tm-preview');
        if (!preview) return;
        if (tmTickets.length === 0) {
            preview.innerHTML = '<div class="operation-empty">変更前の卓番を入力すると、ここに移動内容が表示されます</div>';
            return;
        }
        preview.innerHTML = `
            <div class="tm-box from">変更前<br>${from}卓</div>
            <div class="tm-arrow"><i class="fa-solid fa-arrow-right-long"></i></div>
            <div class="tm-box to">変更後<br>${to}${to !== '未入力' ? '卓' : ''}</div>`;
    }

    async function executeTableMove() {
        const to = normalizeTableInput('tm-to-table', '変更後の卓番');
        if (!to) return;
        if (tmTickets.length === 0) { alert('変更前の卓番に伝票が存在しません。'); return; }
        const from = document.getElementById('tm-from-table').value.trim() || '-';
        if (from === to) { alert('変更前と変更後の卓番が同じです。'); return; }
        const existsTo = await fetchOrdersByTable(to);
        if (existsTo.length > 0) { alert(`${to}卓はすでに使用されています。`); return; }
        if (!confirm(`変更前 ${from}卓 → 変更後 ${to}卓\n対象の伝票を移動します。よろしいですか？`)) return;
        try {
            for (const t of tmTickets) {
                await window.oracleApi.changeTable(t.id, to);
            }
            showToast(`✅ ${from}卓 → ${to}卓 へ伝票を移動しました`);
            resetTableMoveUI();
        } catch (e) {
            console.error(e);
            showToast('⚠️ 卓番変更に失敗しました');
        }
    }

    // =====================================================================
    // 合算
    // =====================================================================
    let mgTickets = [];
    let lastMgAlertKey = '';

    function resetMergeUI() {
        document.getElementById('mg-table').value = '';
        document.getElementById('mg-target-table').value = normalizeTableNo(tableNumber) || '';
        document.getElementById('mg-tickets-wrap').innerHTML = '';
        document.getElementById('mg-btn-wrap').classList.add('hidden');
        document.getElementById('mg-preview').innerHTML = '<div class="operation-empty">合算元と合算先の卓番を入力すると、ここに合算後の内容が表示されます</div>';
        mgTickets = [];
        lastMgAlertKey = '';
    }

    function onMergeTableInput() {
        const from = normalizeTableInput('mg-table', '合算元の卓番');
        const to = normalizeTableInput('mg-target-table', '合算先の卓番');
        if (!from || !to) return;
        searchMergeTickets(true);
    }

    function onMergeTableKey(event) {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        onMergeTableInput();
    }

    async function searchMergeTickets(showMissingAlert = false) {
        const from = normalizeTableInput('mg-table', '合算元の卓番');
        const to = normalizeTableInput('mg-target-table', '合算先の卓番');
        if (!from || !to) return;
        const wrap = document.getElementById('mg-tickets-wrap');
        if (from === to) {
            alert('合算元と合算先の卓番が同じです。');
            return;
        }
        wrap.innerHTML = `<div class="empty-note"><i class="fa-solid fa-spinner fa-spin"></i> 確認中...</div>`;
        try {
            const fromTickets = await fetchOrdersByTable(from);
            const toTickets = await fetchOrdersByTable(to);
            const missing = [];
            if (fromTickets.length === 0) missing.push(`${from}卓`);
            if (toTickets.length === 0) missing.push(`${to}卓`);
            if (missing.length > 0) {
                mgTickets = [];
                renderMergeTickets();
                const key = missing.join(',');
                if (showMissingAlert && lastMgAlertKey !== key) {
                    alert(`${missing.join('、')}の伝票は存在しません。`);
                    lastMgAlertKey = key;
                }
                return;
            }
            lastMgAlertKey = '';
            mgTickets = [fromTickets[0], toTickets[0]];
            renderMergeTickets();
        } catch (e) {
            console.error(e);
            wrap.innerHTML = `<div class="empty-note">伝票の確認に失敗しました</div>`;
        }
    }

    function renderMergeTickets() {
        const wrap = document.getElementById('mg-tickets-wrap');
        if (mgTickets.length < 2) {
            wrap.innerHTML = `<div class="empty-note">合算元と合算先の卓番を入力してください</div>`;
            document.getElementById('mg-btn-wrap').classList.add('hidden');
            renderMergePreview();
            return;
        }
        wrap.innerHTML = mgTickets.map((t, i) => ticketCardHtml(
            t, true, 'void(0)', `<div class="merge-select-badge">合算${i + 1}</div>`
        )).join('');
        document.getElementById('mg-btn-wrap').classList.remove('hidden');
        renderMergePreview();
    }

    function mgBadgeFor(id) {
        const idx = mgTickets.findIndex(t => t.id === id);
        if (idx === -1) return '';
        return `<div class="merge-select-badge">合算${idx + 1}</div>`;
    }

    function toggleMgSelect(id) {
        // 卓番は一意のため、伝票選択は行わない。
    }

    function renderMergePreview() {
        const preview = document.getElementById('mg-preview');
        if (mgTickets.length < 2) {
            preview.innerHTML = '<div class="operation-empty">合算元と合算先の卓番を入力すると、ここに合算後の内容が表示されます</div>';
            return;
        }
        let total = 0;
        preview.innerHTML = mgTickets.map((t, i) => {
            const sub = (t.items || []).reduce((s, it) => s + (it.price || 0) * (it.qty || 0), 0);
            total += sub;
            const names = (t.items || []).map(it => `${it.name}×${it.qty}`).join('、');
            return `<div class="mg-preview-row"><span class="mg-num">合算${i + 1}</span><span style="flex:1;min-width:0;">${t.table}卓：${names || '(商品なし)'}</span><span>${sub}円</span></div>`;
        }).join('');
        const targetTable = document.getElementById('mg-target-table').value.trim();
        preview.innerHTML += `<div class="mg-preview-total">合算後：${targetTable}卓 / 合計 ${total}円（2枚→1枚）</div>`;
    }

    async function executeMerge() {
        if (mgTickets.length < 2) { alert('合算元と合算先の伝票を確認してください。'); return; }
        const targetTable = normalizeTableInput('mg-target-table', '合算先の卓番');
        if (!targetTable) return;
        const orderMethod = mgTickets[1].orderMethod || mgTickets[0].orderMethod || staffCode || 'MERGE';
        if (!confirm(`${mgTickets[0].table}卓 と ${mgTickets[1].table}卓 の伝票を、${targetTable}卓の1枚に合算します。よろしいですか？`)) return;
        try {
            await window.oracleApi.mergeOrders(mgTickets.map(ticket => ticket.id), targetTable, orderMethod);
            showToast(`✅ ${mgTickets.length}枚の伝票を${targetTable}卓へ合算しました`);
            resetMergeUI();
        } catch (e) {
            console.error(e);
            showToast('⚠️ 合算に失敗しました');
        }
    }

    // ---- 伝票カードHTMLを共通化して表示を揃える ----
    // badgeHtml: 移動対象・合算順などを表示するHTML
    function ticketCardHtml(t, selected, onClickFn, badgeHtml) {
        const createdAt = t.createdAt?.toDate?.() || new Date(t.createdAt);
        const time = Number.isNaN(createdAt?.getTime?.())
            ? '--:--'
            : createdAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        let total = 0;
        const rows = (t.items || []).map(it => {
            total += (it.price || 0) * (it.qty || 0);
            return `${it.name} ×${it.qty}`;
        }).join('、 ');
        return `
        <div class="ticket-card${selected ? ' selected' : ''}" onclick="${onClickFn}">
            ${badgeHtml || ''}
            <div class="ticket-head">
                <span class="tnum"><i class="fa-solid ${selected ? 'fa-square-check' : 'fa-square'}"></i> ${t.table}卓 / ${time}</span>
                <span style="font-size:11px;color:#888;">${t.orderMethod || ''}</span>
            </div>
            <div class="ticket-items">${rows || '(商品なし)'}</div>
            <div class="ticket-total">合計 ${total}円</div>
        </div>`;
    }

    // =====================================================================
    // 担当者登録（Oracle STAFF_MASTER）
    // =====================================================================
    let staffList = [];
    let editingStaffCode = '';
    let authenticatedUser = null;

    function staffEscape(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    }

    async function loadStaffList() {
        const card = document.getElementById('staff-list-card');
        if (!card) return;
        card.innerHTML = `<div class="empty-note"><i class="fa-solid fa-spinner fa-spin"></i> 従業員を読み込み中...</div>`;
        try {
            staffList = await window.oracleApi.getStaff();
        } catch (error) {
            console.error(error);
            card.innerHTML = `<div class="empty-note" style="color:#b42318;">従業員データを取得できませんでした</div>`;
            return;
        }
        document.getElementById('staff-list-count').textContent = `${staffList.length}名`;
        if (staffList.length === 0) {
            card.innerHTML = `<div class="empty-note">登録済みメンバーはいません</div>`;
            return;
        }
        card.innerHTML = staffList.map(staff => {
            const encoded = encodeURIComponent(staff.code);
            const roleLabel = staff.role === 'SYSTEM_ADMIN' ? 'システム管理者' : '従業員';
            return `
                <div class="staff-list-row">
                    <div class="staff-list-main">
                        <div class="staff-list-name">${staffEscape(staff.name)}</div>
                        <div class="staff-list-meta"><b>${staffEscape(staff.code)}</b> ・ ${roleLabel} ・ <span class="staff-badge ${staff.enabled ? 'enabled' : 'disabled'}">${staff.enabled ? '有効' : '無効'}</span></div>
                    </div>
                    <div class="staff-list-actions">
                        <button type="button" class="staff-icon-btn" onclick="editStaff('${encoded}')" title="編集" aria-label="${staffEscape(staff.name)}を編集"><i class="fa-solid fa-pen"></i></button>
                        <button type="button" class="staff-icon-btn danger" onclick="removeStaff('${encoded}')" title="削除" aria-label="${staffEscape(staff.name)}を削除"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>`;
        }).join('');
    }

    async function saveStaff(event) {
        event.preventDefault();
        const codeInput = document.getElementById('staff-reg-code');
        const nameInput = document.getElementById('staff-reg-name');
        const passwordInput = document.getElementById('staff-reg-password');
        const code = codeInput.value.trim().toUpperCase();
        const name = nameInput.value.trim();
        const password = passwordInput.value;
        if (!/^[A-Z0-9_-]{1,20}$/.test(code)) {
            showToast('従業員コードは英数字・ハイフン・下線で入力してください');
            codeInput.focus();
            return;
        }
        if (!name) { showToast('氏名を入力してください'); nameInput.focus(); return; }
        if (!editingStaffCode && password.length < 4) {
            showToast('パスワードは4文字以上で入力してください');
            passwordInput.focus();
            return;
        }
        if (editingStaffCode && password && password.length < 4) {
            showToast('変更するパスワードは4文字以上で入力してください');
            passwordInput.focus();
            return;
        }

        const button = document.getElementById('staff-save-btn');
        button.disabled = true;
        try {
            const data = {
                code,
                name,
                password,
                role: document.getElementById('staff-reg-role').value,
                enabled: document.getElementById('staff-reg-enabled').checked
            };
            if (editingStaffCode) {
                await window.oracleApi.updateStaff(editingStaffCode, data);
                showToast('従業員情報を更新しました');
            } else {
                await window.oracleApi.createStaff(data);
                showToast('従業員を登録しました');
            }
            resetStaffForm();
            await loadStaffList();
        } catch (error) {
            console.error(error);
            showToast(editingStaffCode ? '更新できませんでした' : '登録できませんでした。コードの重複を確認してください');
        } finally {
            button.disabled = false;
        }
    }

    function editStaff(encodedCode) {
        if (document.body.dataset.staffMode !== 'update') { location.assign('/admin/staff/update?code=' + encodedCode); return; }
        const code = decodeURIComponent(encodedCode);
        const staff = staffList.find(item => item.code === code);
        if (!staff) return;
        editingStaffCode = code;
        document.getElementById('staff-reg-code').value = staff.code;
        document.getElementById('staff-reg-code').readOnly = true;
        document.getElementById('staff-reg-name').value = staff.name;
        document.getElementById('staff-reg-password').value = '';
        document.getElementById('staff-reg-role').value = staff.role === 'SYSTEM_ADMIN' ? 'SYSTEM_ADMIN' : 'EMPLOYEE';
        document.getElementById('staff-reg-enabled').checked = !!staff.enabled;
        document.getElementById('staff-form-title').textContent = '担当者情報を編集';
        document.getElementById('staff-password-help').textContent = '空欄のまま更新すると現在のパスワードを維持します';
        document.getElementById('staff-save-btn').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 更新する';
        document.getElementById('staff-save-btn').classList.remove('single');
        document.getElementById('staff-cancel-edit').classList.remove('hidden');
        document.getElementById('staff-reg-name').focus();
    }

    function resetStaffForm() {
        editingStaffCode = '';
        document.getElementById('staff-form').reset();
        document.getElementById('staff-reg-enabled').checked = true;
        document.getElementById('staff-reg-role').value = 'EMPLOYEE';
        document.getElementById('staff-reg-code').readOnly = false;
        document.getElementById('staff-form-title').textContent = '担当者を登録';
        document.getElementById('staff-password-help').textContent = '新規登録時は必須です';
        document.getElementById('staff-save-btn').innerHTML = '<i class="fa-solid fa-user-plus"></i> 登録する';
        document.getElementById('staff-save-btn').classList.add('single');
        document.getElementById('staff-cancel-edit').classList.add('hidden');
    }

    async function removeStaff(encodedCode) {
        const code = decodeURIComponent(encodedCode);
        const staff = staffList.find(item => item.code === code);
        if (!staff || !confirm(`${staff.name}（${staff.code}）を削除しますか？`)) return;
        try {
            await window.oracleApi.deleteStaff(code);
            if (staffCode === code) setActiveStaffCode('');
            if (editingStaffCode === code) resetStaffForm();
            await loadStaffList();
            showToast('従業員を削除しました');
        } catch (error) {
            console.error(error);
            showToast('従業員を削除できませんでした');
        }
    }

    // =====================================================================
    // アレルギー確認（参照専用）
    // =====================================================================
    function renderAllergyList() {
        if (!document.getElementById('allergy-list-card')) return;
        const kw = (document.getElementById('allergy-search-input')?.value || '').trim();
        let items = menuList;
        if (kw) items = items.filter(m => m.name.includes(kw) || m.code.includes(kw));
        const card = document.getElementById('allergy-list-card');
        if (items.length === 0) {
            card.innerHTML = `<div class="empty-note">該当する商品がありません</div>`;
            return;
        }
        card.innerHTML = items.map(item => `
            <div class="stock-row">
                <div class="stock-name">${item.icon} ${item.name} <span class="code">#${item.code}</span></div>
                <div style="text-align:right;max-width:55%;">
                    ${item.allergens && item.allergens.length > 0
                        ? item.allergens.map(a => `<span class="allergy-chip-btn on" style="margin:2px;">${a}</span>`).join('')
                        : `<span style="font-size:11px;color:#aaa;">記載なし</span>`}
                </div>
            </div>`).join('');
    }

    // =====================================================================
    // マスタ受信（キャッシュクリア＆アプリ更新）
    // =====================================================================
    async function masterRefresh() {
        if (!confirm('マスタ情報を再受信します。画面が更新されます。よろしいですか？')) return;
        showToast('🔄 マスタ受信中...');
        try {
            if (window.caches && caches.keys) {
                const keys = await caches.keys();
                await Promise.all(keys.map(k => caches.delete(k)));
            }
        } catch (e) {
            console.warn('キャッシュ削除に失敗', e);
        }
        setTimeout(() => {
            location.reload(true);
        }, 300);
    }

    // ---- トースト ----
    let toastTimer;
    function showToast(msg) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
    }

    // ---- 初期化 ----
    async function initializeAuthenticatedUser() {
        try {
            authenticatedUser = await window.oracleApi.getCurrentUser();
            setActiveStaffCode(authenticatedUser.username);
            const administrator = authenticatedUser.role === 'SYSTEM_ADMIN';
            document.getElementById('staff-management-tile')?.classList.toggle('hidden', !administrator);
            if (document.getElementById('order-tile-label')) document.getElementById('order-tile-label').textContent = administrator ? '注文修正' : '注文';
            if (document.getElementById('order-page-title')) document.getElementById('order-page-title').textContent = administrator ? '注文修正' : '注文';
        } catch (error) {
            console.error('ログイン情報を確認できませんでした', error);
            showToast('ログイン情報を確認できませんでした');
        }
    }

    async function logoutAdmin() {
        const button = document.querySelector('.logout-btn');
        if (button) button.disabled = true;
        try {
            await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' });
        } catch (error) {
            console.debug('認証情報の破棄処理', error);
        } finally {
            localStorage.removeItem('staffCode');
            localStorage.removeItem('lastStaffCode');
            window.location.replace(`${location.protocol}//${location.host}/staff/logout`);
        }
    }

    async function initializePage() {
        await initializeAuthenticatedUser();
        try { await loadMenuFromOracle(); renderCategoryTabs(); renderMenuGrid(); }
        catch (error) { console.error(error); showToast('メニューの取得に失敗しました'); }
        document.getElementById('loading-overlay').style.display = 'none';
        updateCartBadge();
        showPage(document.body.dataset.page || 'view-home', true);
    }
    initializePage();

    // グローバル公開（インラインonclick用）
    window.selectCategory = selectCategory;
    window.onSearchInput = onSearchInput;
    window.openQtyModal = openQtyModal;
    window.closeQtyModal = closeQtyModal;
    window.changeModalQty = changeModalQty;
    window.confirmAddToCart = confirmAddToCart;
    window.updateCartQty = updateCartQty;
    window.cancelOrderedItem = cancelOrderedItem;
    window.showPage = showPage;
    window.submitOrder = submitOrder;
    window.showToast = showToast;
    window.onStaffInfoChange = onStaffInfoChange;
    window.normalizeStaffTableNumber = normalizeStaffTableNumber;
    window.normalizeGuestCount = normalizeGuestCount;
    window.renderStockList = renderStockList;
    window.updateStockEditQty = updateStockEditQty;
    window.toggleStockSoldOut = toggleStockSoldOut;
    window.saveAllStock = saveAllStock;
    window.searchTableMoveTickets = searchTableMoveTickets;
    window.onTableMoveTableInput = onTableMoveTableInput;
    window.onTableMoveTableKey = onTableMoveTableKey;
    window.onTableMoveTargetInput = onTableMoveTargetInput;
    window.onTableMoveTargetKey = onTableMoveTargetKey;
    window.toggleTmSelect = toggleTmSelect;
    window.executeTableMove = executeTableMove;
    window.updateTableMovePreview = updateTableMovePreview;
    window.searchMergeTickets = searchMergeTickets;
    window.onMergeTableInput = onMergeTableInput;
    window.onMergeTableKey = onMergeTableKey;
    window.toggleMgSelect = toggleMgSelect;
    window.executeMerge = executeMerge;
    window.saveStaff = saveStaff;
    window.editStaff = editStaff;
    window.resetStaffForm = resetStaffForm;
    window.removeStaff = removeStaff;
    window.logoutAdmin = logoutAdmin;
    window.renderAllergyList = renderAllergyList;
    window.masterRefresh = masterRefresh;
