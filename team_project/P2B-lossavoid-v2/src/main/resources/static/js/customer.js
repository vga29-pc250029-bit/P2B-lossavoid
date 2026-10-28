const v2CustomerKey = 'p2b-v2:customer';
let v2CustomerState;
try { v2CustomerState = JSON.parse(sessionStorage.getItem(v2CustomerKey) || '{}'); } catch { v2CustomerState = {}; }
if (tableFromHash() && tableFromHash() !== v2CustomerState.tableNumber) v2CustomerState = {};
function saveCustomerState() {
    try { sessionStorage.setItem(v2CustomerKey, JSON.stringify({tableNumber, guestCount, visitConfirmed, cart, guestReturnPage})); } catch {}
}
window.addEventListener('pagehide', saveCustomerState);

    let tableNumber = tableFromHash() || normalizeTableNo(v2CustomerState.tableNumber) || '';
    let guestCount = parseGuestCount(v2CustomerState.guestCount);
    let visitConfirmed = Boolean(v2CustomerState.visitConfirmed && tableNumber && guestCount !== null);
    let currentPage = 'view-guests';
    let guestReturnPage = v2CustomerState.guestReturnPage || 'view-menu';
    let isSubmittingOrder = false;

    let currentQty = 1;
    let modalCode = null;
    let cart = Array.isArray(v2CustomerState.cart) ? v2CustomerState.cart : [];
    let currentCategory = 'all';
    let searchKeyword = '';

    // ---- Spring API経由でOracleの商品マスタを取得 ----
    let menuData = {};
    let menuList = [];
    let menuLoadState = 'loading';
    let menuLoadPromise = null;
    let officialAllergyList = [];
    let officialAllergyPromise = null;
    let infoModalCode = null;

    function halfWidthDigits(value) {
        return String(value ?? '').trim().replace(/[０-９]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
    }

    function normalizeTableNo(value) {
        const match = halfWidthDigits(value).match(/^(\d{1,2})(?:-(\d))?$/);
        if (!match || Number(match[1]) < 1 || Number(match[1]) > 99) return '';
        return match[1].padStart(2, '0') + (match[2] === undefined ? '' : `-${match[2]}`);
    }

    function tableFromHash() {
        try {
            return normalizeTableNo(decodeURIComponent(location.hash.slice(1)));
        } catch {
            return '';
        }
    }

    function parseGuestCount(value) {
        const text = halfWidthDigits(value);
        if (!/^\d{1,2}$/.test(text)) return null;
        const count = Number(text);
        return count >= 1 && count <= 99 ? count : null;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    }

    function normalizeMenuName(value) {
        return String(value || '').normalize('NFKC').toLowerCase()
            .replace(/[\s　]/g, '')
            .replace(/[・･.,，、。!！?？'"“”‘’()（）\[\]【】「」『』]/g, '');
    }

    const officialMenuAliases = new Map(Object.entries({
        'アロスティチーニ': 'アロスティチーニ（ラムの串焼き）',
        'アロスティチーニ（Ｗサイズ）': 'アロスティチーニ（ラムの串焼き）',
        'キャロットラペ': 'キャロットラぺ',
        'チョリソー': 'チョリソー（辛味ソーセージ）',
        'ポテトのグリル': 'ポテトのグリル（ハッシュドポテト）',
        'ハモン・セラーヌ': '生ハム',
        '生ハムとモッツァレラの盛合せ': '生ハムとバッファローモッツァレラの盛合せ',
        '半熟卵のペペロンチーノ': '半熟卵のぺペロンチーノ',
        'ラム（仔羊）のランプステーキ': 'ラムのランプステーキ',
        'ラージライス': 'ライス',
        'スモールライス': 'ライス',
        'セットドリンクバー': 'ドリンクバー'
    }).map(([localName, officialName]) => [normalizeMenuName(localName), officialName]));

    async function loadOfficialAllergyData() {
        if (officialAllergyList.length > 0) return officialAllergyList;
        if (officialAllergyPromise) return officialAllergyPromise;
        officialAllergyPromise = window.oracleApi.getAllergens()
            .then(items => {
                if (!Array.isArray(items)) throw new Error('Invalid allergy response');
                officialAllergyList = items.filter(item => item && item.name);
                return officialAllergyList;
            })
            .finally(() => { officialAllergyPromise = null; });
        return officialAllergyPromise;
    }

    function findOfficialAllergyMenu(menuName) {
        const target = normalizeMenuName(menuName);
        const exact = officialAllergyList.find(item => normalizeMenuName(item.name) === target);
        if (exact) return { item: exact, exact: true };
        const officialName = officialMenuAliases.get(target);
        if (!officialName) return null;
        const aliasMatch = officialAllergyList.find(item => normalizeMenuName(item.name) === normalizeMenuName(officialName));
        return aliasMatch ? { item: aliasMatch, exact: false } : null;
    }

    function getOfficialAllergenNames(item) {
        if (!item || !Array.isArray(item.allergies)) return [];
        return item.allergies
            .filter(allergy => allergy && (allergy.isExist === true || allergy.isExist === 1 || allergy.isExist === '1'))
            .map(allergy => String(allergy.name || '').trim())
            .filter(Boolean);
    }

    function updateGuestButtons() {
        const count = parseGuestCount(document.getElementById('guest-count').value);
        document.getElementById('guest-minus').disabled = count === 1;
        document.getElementById('guest-plus').disabled = count === 99;
        document.querySelectorAll('[data-guest-count]').forEach(button => {
            button.setAttribute('aria-pressed', String(Number(button.dataset.guestCount) === count));
        });
    }

    function setGuestInput(value) {
        const input = document.getElementById('guest-count');
        input.value = value;
        input.removeAttribute('aria-invalid');
        document.getElementById('guest-count-error').textContent = '';
        updateGuestButtons();
    }

    function prepareGuestEntry() {
        if (!document.getElementById('guest-form')) return;
        let draft = '';
        // The tab-local draft is only a prefill; every reload requires confirmation.
        try {
            if (tableNumber) draft = sessionStorage.getItem(`oracle-order:guests:${tableNumber}`) || '';
        } catch { /* Ordering also works when browser storage is unavailable. */ }
        setGuestInput(guestCount ?? parseGuestCount(draft) ?? '');
        document.getElementById('guest-table-display').textContent = tableNumber || '未設定';
        document.getElementById('guest-table-field').classList.toggle('hidden', Boolean(tableNumber));
        document.getElementById('guest-table-input').value = tableNumber;
        document.getElementById('guest-table-input').removeAttribute('aria-invalid');
        document.getElementById('guest-table-error').textContent = '';
        document.getElementById('guest-heading').textContent = visitConfirmed ? 'ご利用人数の変更' : '何名様でご利用ですか？';
        document.getElementById('guest-confirm-label').textContent = visitConfirmed ? '人数を変更する' : '注文をはじめる';
        document.getElementById('guest-cancel').classList.toggle('hidden', !visitConfirmed);
    }

    function openGuestEntry() {
        if (isSubmittingOrder) return;
        guestReturnPage = currentPage === 'view-guests' ? 'view-menu' : currentPage;
        showPage('view-guests');
    }

    function confirmGuestEntry(event) {
        event.preventDefault();
        const tableInput = document.getElementById('guest-table-input');
        const countInput = document.getElementById('guest-count');
        const nextTable = tableNumber || normalizeTableNo(tableInput.value);
        const nextCount = parseGuestCount(countInput.value);
        document.getElementById('guest-table-error').textContent = nextTable ? '' : '卓番を01〜99、または01-1の形式で入力してください。';
        document.getElementById('guest-count-error').textContent = nextCount === null ? '人数は1〜99名の整数で入力してください。' : '';
        tableInput.setAttribute('aria-invalid', String(!nextTable));
        countInput.setAttribute('aria-invalid', String(nextCount === null));
        if (!nextTable || nextCount === null) {
            (!nextTable ? tableInput : countInput).focus();
            return;
        }
        tableNumber = nextTable;
        guestCount = nextCount;
        visitConfirmed = true;
        try {
            sessionStorage.setItem(`oracle-order:guests:${tableNumber}`, String(guestCount));
        } catch { /* The confirmed count remains available in memory. */ }
        if (location.hash !== `#${tableNumber}`) {
            try { history.replaceState(null, '', `#${tableNumber}`); } catch { /* file:// may restrict history updates. */ }
        }
        document.querySelectorAll('#table-chip, #table-chip2, #table-chip3').forEach(el => {
            el.textContent = `卓番 ${tableNumber}・${guestCount}名`;
            el.parentElement.setAttribute('aria-label', `卓番 ${tableNumber}、${guestCount}名。人数を変更`);
        });
        showPage(guestReturnPage);
    }

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

    async function loadMenuFromOracle() {
        const menus = await window.oracleApi.getMenus();
        if (!Array.isArray(menus)) throw new Error('Invalid menu response');
        const list = [];
        menus.forEach(data => {
            const code = String(data.code);
            const category = Object.hasOwn(categoryMeta, data.category) ? data.category : getCategory(code);
            const stockQty = (data.stockQty === null || data.stockQty === undefined || data.stockQty === '') ? null : Number(data.stockQty);
            list.push({
                code,
                name: data.name || data.shortName || '(名称未設定)',
                price: Number(data.price) || 0,
                category,
                icon: categoryMeta[category]?.icon || '🍴',
                prepStation: data.prepStation || '',
                cookTime: Number(data.cookTime) || 0,
                imageUrl: data.imageUrl || window.orderAppPath(`/images/${encodeURIComponent(data.name || data.shortName || '(名称未設定)')}.png`),
                soldOut: !!data.soldOut,
                stockQty: stockQty,
                allergens: Array.isArray(data.allergens) ? data.allergens : []
            });
        });
        list.sort((a, b) => a.code.localeCompare(b.code));
        menuList = list;
        menuData = {};
        list.forEach(item => { menuData[item.code] = item; });
    }

    // 在庫切れ判定（品切れフレガーまたは残数0）
    function isOutOfStock(item) {
        if (item.soldOut) return true;
        if (item.stockQty !== null && item.stockQty <= 0) return true;
        return false;
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
        if (menuLoadState === 'loading') {
            grid.innerHTML = '<div class="empty-result" role="status"><div class="spinner" aria-hidden="true"></div>メニューを読み込み中...</div>';
            return;
        }
        if (menuLoadState === 'error') {
            grid.innerHTML = '<div class="empty-result" role="alert">メニューを取得できませんでした。<button type="button" class="menu-retry" onclick="refreshMenu()"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> 再読み込み</button></div>';
            return;
        }
        if (menuList.length === 0) {
            grid.innerHTML = '<div class="empty-result">現在ご注文いただけるメニューがありません。<button type="button" class="menu-retry" onclick="refreshMenu()"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> 再読み込み</button></div>';
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
            return `
            <article class="menu-card${outOfStock ? ' sold-out' : ''}" data-menu-code="${escapeHtml(item.code)}" role="button" tabindex="${outOfStock ? '-1' : '0'}" aria-disabled="${outOfStock}">
                <button type="button" class="info-btn" data-info-code="${escapeHtml(item.code)}" aria-label="${escapeHtml(item.name)}のアレルギー情報" title="商品情報"><i class="fa-solid fa-circle-info" aria-hidden="true"></i></button>
                ${inCartQty > 0 && !outOfStock ? `<div class="in-cart-dot" style="display:flex;align-items:center;">×${inCartQty}</div>` : ''}
                ${outOfStock ? `<div class="sold-out-badge">品切れ</div>` : (lowStock ? `<div class="low-stock-badge">残${item.stockQty}点</div>` : '')}
                <div class="menu-media">
                    <img class="menu-image" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">
                    <div class="menu-icon" hidden>${item.icon}</div>
                </div>
                <div class="menu-name">${escapeHtml(item.name)}</div>
                <div class="menu-bottom">
                    <div class="menu-price">${item.price}円</div>
                    <div class="qty-btn" style="width:2rem;height:2rem;font-size:1.1rem;${outOfStock ? 'opacity:.3;' : ''}">+</div>
                </div>
            </article>`;
        }).join('');
    }

    // ---- 商品・アレルギー情報 ----
    async function openInfoModal(code) {
        const item = menuData[code];
        if (!item) return;
        infoModalCode = code;
        document.getElementById('info-item-name').textContent = item.name;
        document.getElementById('info-item-allergens').textContent = '公式情報を取得中...';
        document.getElementById('info-match-note').textContent = '';

        const photo = document.getElementById('info-item-photo');
        photo.replaceChildren();
        const image = document.createElement('img');
        image.src = item.imageUrl;
        image.alt = item.name;
        image.onerror = () => { photo.textContent = item.icon || '🍴'; };
        photo.appendChild(image);
        document.getElementById('info-overlay').classList.add('show');

        try {
            await loadOfficialAllergyData();
            if (infoModalCode !== code) return;
            const match = findOfficialAllergyMenu(item.name);
            if (!match) {
                document.getElementById('info-item-allergens').textContent = '公式サイトで一致する商品を確認できませんでした';
                document.getElementById('info-match-note').textContent = '誤表示を避けるため、アレルゲンの自動推測は行っていません。';
                return;
            }
            const allergens = getOfficialAllergenNames(match.item);
            document.getElementById('info-item-allergens').textContent = allergens.length ? allergens.join('・') : '主要アレルゲン該当なし';
            document.getElementById('info-match-note').textContent = match.exact
                ? 'サイゼリヤ公式サイトの商品情報'
                : `公式サイト上の商品名：${match.item.name}`;
        } catch (error) {
            if (infoModalCode !== code) return;
            const fallback = Array.isArray(item.allergens) ? item.allergens.filter(Boolean) : [];
            document.getElementById('info-item-allergens').textContent = fallback.length
                ? fallback.join('・')
                : '公式情報を取得できませんでした';
            document.getElementById('info-match-note').textContent = fallback.length
                ? 'Oracleの商品マスタに登録された予備情報を表示しています。'
                : '通信状況を確認するか、店舗スタッフへお問い合わせください。';
        }
    }

    function closeInfoModal() {
        if (!document.getElementById('info-overlay')) return;
        document.getElementById('info-overlay').classList.remove('show');
        infoModalCode = null;
    }

    // ---- 数量選択モーダル ----
    function openQtyModal(code) {
        if (!document.body.dataset.menuCode) { saveCustomerState(); location.assign(window.orderAppPath('/customer/menu/' + encodeURIComponent(code) + '/quantity') + (tableNumber ? '#' + tableNumber : '')); return; }
        if (!visitConfirmed || isSubmittingOrder) return;
        const item = menuData[code];
        if (!item || isOutOfStock(item)) {
            showToast('⚠️ この商品は品切れ中です');
            return;
        }
        modalCode = code;
        currentQty = 1;
        document.getElementById('modal-item-name').textContent = item.name;
        document.getElementById('modal-item-price').textContent = item.price + '円';
        document.getElementById('modal-qty-display').textContent = currentQty;
        document.getElementById('qty-overlay').classList.add('show');
    }
    function closeQtyModal() {
        if (!document.getElementById('qty-overlay')) return;
        document.getElementById('qty-overlay').classList.remove('show');
        modalCode = null;
    }
    function changeModalQty(diff) {
        currentQty = Math.max(1, currentQty + diff);
        document.getElementById('modal-qty-display').textContent = currentQty;
    }
    function confirmAddToCart() {
        if (!visitConfirmed || isSubmittingOrder) return;
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
        if (document.body.dataset.menuCode) showPage('view-menu');
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
    function showPage(pageId, initial = false) {
        if (isSubmittingOrder) return;
        if (pageId !== 'view-guests' && !visitConfirmed) pageId = 'view-guests';
        const routes = {'view-guests':'/customer/table','view-menu':'/customer/menu','view-cart':'/customer/cart','view-history':'/customer/history'};
        if ((!initial && routes[pageId] !== window.orderAppRoute()) || !document.getElementById(pageId)) {
            saveCustomerState();
            location.assign(window.orderAppPath(routes[pageId]) + (tableNumber ? '#' + tableNumber : ''));
            return;
        }
        currentPage = pageId;
        document.querySelectorAll('.page').forEach(p => p.classList.toggle('hidden', p.id !== pageId));
        document.getElementById('order-navigation')?.classList.toggle('hidden', pageId === 'view-guests');
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        if (pageId === 'view-guests') prepareGuestEntry();
        if (pageId === 'view-menu') document.getElementById('nav-add')?.classList.add('active');
        if (pageId === 'view-cart') { document.getElementById('nav-cart')?.classList.add('active'); renderCart(); }
        if (pageId === 'view-history') { document.getElementById('nav-history')?.classList.add('active'); renderHistory(); }
    }

    // ---- カート画面描画 ----
    function renderCart() {
        if (!document.getElementById('cart-items-list')) return;
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
                const menuItem = menuData[item.code] || item;
                const icon = menuItem.icon || '🍽';
                const imageUrl = menuItem.imageUrl || item.imageUrl || '';
                return `
                <div class="cart-row">
                    <div class="ci-media">
                        ${imageUrl ? `<img class="ci-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">` : ''}
                        <div class="ci-icon" ${imageUrl ? 'hidden' : ''}>${icon}</div>
                    </div>
                    <div class="ci-info">
                        <div class="ci-name">${escapeHtml(item.name)}</div>
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
        document.getElementById('total-count').textContent = totalC + '点';
        document.getElementById('total-price').textContent = `合計 ${totalP}円 (税込)`;
    }

    function updateCartQty(index, diff) {
        if (isSubmittingOrder) return;
        cart[index].qty += diff;
        if (cart[index].qty <= 0) cart.splice(index, 1);
        updateCartBadge();
        renderCart();
        renderMenuGrid();
    }

    // ---- 注文履歴 ----
    async function renderHistory() {
        if (!document.getElementById('orderContainer')) return;
        const container = document.getElementById('orderContainer');
        const emptyMsg = document.getElementById('history-empty');
        container.innerHTML = '<div class="empty-result" role="status">注文履歴を読み込み中...</div>';
        emptyMsg.classList.add('hidden');
        const requestedTable = tableNumber;

        try {
            const orders = await window.oracleApi.getOrdersByTable(requestedTable);
            if (requestedTable !== tableNumber) return;
            if (!Array.isArray(orders)) throw new Error('Invalid order history response');
            container.innerHTML = '';
            if (orders.length === 0) {
                emptyMsg.classList.remove('hidden');
                return;
            }
            orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            orders.forEach(order => {
                const createdAt = new Date(order.createdAt);
                const time = Number.isNaN(createdAt.getTime()) ? '--:--' : createdAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                const count = parseGuestCount(order.guestCount);
                let total = 0;
                const rows = (order.items || []).map(item => {
                    total += item.price * item.qty;
                    return `<div class="history-item-row"><span>${escapeHtml(item.name)} × ${Number(item.qty)}</span><span>${item.price * item.qty}円</span></div>`;
                }).join('');
                container.innerHTML += `
                <div class="history-card">
                    <div class="h-time"><i class="fa-regular fa-clock"></i> ${time}${count === null ? '' : ` ・ ${count}名`}</div>
                    ${rows}
                    <div class="text-right font-bold mt-2" style="color:#b71c1c;">合計 ${total}円</div>
                </div>`;
            });
        } catch (e) {
            if (requestedTable !== tableNumber) return;
            console.error(e);
            container.innerHTML = '<div class="empty-result" role="alert">履歴の取得に失敗しました<button type="button" class="menu-retry" onclick="renderHistory()"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> 再読み込み</button></div>';
        }
    }

    // ---- 注文送信 ----
    async function submitOrder() {
        if (isSubmittingOrder) return;
        if (!visitConfirmed || !normalizeTableNo(tableNumber) || parseGuestCount(guestCount) === null) {
            openGuestEntry();
            return;
        }
        if (cart.length === 0) {
            showToast('注文かごが空です');
            return;
        }
        const btn = document.getElementById('submit-btn');
        isSubmittingOrder = true;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 送信中...';
        try {
            await window.oracleApi.createOrder({
                table: tableNumber,
                guestCount,
                orderMethod: 'SELF',
                items: cart.map(item => ({ ...item }))
            });
            cart = [];
            updateCartBadge();
            renderMenuGrid();
            showToast('🎉 注文が送信されました！');
            isSubmittingOrder = false;
            showPage('view-history');
        } catch (error) {
            console.error(error);
            showToast('⚠️ 送信に失敗しました。もう一度お試しください。');
        } finally {
            isSubmittingOrder = false;
            btn.disabled = cart.length === 0;
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> 注文する';
        }
    }

    // ---- 店員呼出 ----
    function callStaff() {
        showToast('🔔 店員をお呼びしました。少々お待ちください。');
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

    function refreshMenu() {
        if (menuLoadPromise) return menuLoadPromise;
        menuLoadState = 'loading';
        renderMenuGrid();
        menuLoadPromise = (async () => {
            try {
                await loadMenuFromOracle();
                menuLoadState = 'ready';
            } catch (error) {
                menuLoadState = 'error';
                console.error('メニューの取得に失敗しました', error);
            } finally {
                renderCategoryTabs();
                renderMenuGrid();
                menuLoadPromise = null;
            }
        })();
        return menuLoadPromise;
    }

    document.getElementById('guest-form')?.addEventListener('submit', confirmGuestEntry);
    document.getElementById('guest-count')?.addEventListener('input', () => {
        document.getElementById('guest-count').removeAttribute('aria-invalid');
        document.getElementById('guest-count-error').textContent = '';
        updateGuestButtons();
    });
    document.querySelectorAll('[data-guest-count]').forEach(button => {
        button.addEventListener('click', () => setGuestInput(button.dataset.guestCount));
    });
    document.getElementById('guest-minus')?.addEventListener('click', () => {
        setGuestInput(Math.max(1, (parseGuestCount(document.getElementById('guest-count').value) ?? 2) - 1));
    });
    document.getElementById('guest-plus')?.addEventListener('click', () => {
        setGuestInput(Math.min(99, (parseGuestCount(document.getElementById('guest-count').value) ?? 0) + 1));
    });
    document.getElementById('guest-cancel')?.addEventListener('click', () => showPage(guestReturnPage));
    document.getElementById('menu-grid')?.addEventListener('click', event => {
        const infoButton = event.target.closest('[data-info-code]');
        if (infoButton) {
            event.stopPropagation();
            openInfoModal(infoButton.dataset.infoCode);
            return;
        }
        const card = event.target.closest('[data-menu-code]');
        if (card) openQtyModal(card.dataset.menuCode);
    });
    document.getElementById('menu-grid')?.addEventListener('keydown', event => {
        if (event.target.matches('[data-menu-code]') && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            openQtyModal(event.target.dataset.menuCode);
        }
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeInfoModal();
    });
    window.addEventListener('hashchange', () => {
        if (tableFromHash() !== tableNumber) location.reload();
    });

    document.querySelectorAll('#table-chip, #table-chip2, #table-chip3').forEach(el => el.textContent = `卓番 ${tableNumber || '未設定'}・${guestCount ?? '-'}名`);
    updateCartBadge();
    showPage(document.body.dataset.page || 'view-guests', true);
    refreshMenu().then(() => {
        if (currentPage === 'view-cart') renderCart();
        const code = document.body.dataset.menuCode;
        if (code && menuData[code]) {
            if (document.body.dataset.quantityMode === 'true') openQtyModal(code);
            else openInfoModal(code);
        }
    });
    window.openGuestEntry = openGuestEntry;
    window.refreshMenu = refreshMenu;

    // グローバル公開（インラインonclick用）
    window.selectCategory = selectCategory;
    window.onSearchInput = onSearchInput;
    window.openInfoModal = openInfoModal;
    window.closeInfoModal = closeInfoModal;
    window.openQtyModal = openQtyModal;
    window.closeQtyModal = closeQtyModal;
    window.changeModalQty = changeModalQty;
    window.confirmAddToCart = confirmAddToCart;
    window.updateCartQty = updateCartQty;
    window.showPage = showPage;
    window.submitOrder = submitOrder;
    window.callStaff = callStaff;
    window.showToast = showToast;
