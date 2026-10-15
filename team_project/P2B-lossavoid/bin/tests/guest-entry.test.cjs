const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..', 'src', 'main', 'resources', 'static');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const menu = [{ code: '2201', name: 'Test pizza', price: 500, stockQty: null, soldOut: false, allergens: [] }];

class LocalResources extends ResourceLoader {
    fetch(url) {
        const name = new URL(url).pathname.split('/').pop();
        if (['oracle-spring-api-client.js', 'guest-entry.css'].includes(name)) {
            return Promise.resolve(Buffer.from(readFileSync(path.join(root, name))));
        }
        return null;
    }
}

async function page(t, options = {}) {
    const calls = [];
    const errors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', error => errors.push(error));
    const dom = new JSDOM(html, {
        url: options.url || `http://localhost:5500/index.html${options.hash ?? '#01'}`,
        runScripts: 'dangerously',
        resources: new LocalResources(),
        virtualConsole,
        beforeParse(window) {
            window.AbortController = AbortController;
            if (options.apiBase) window.ORDER_API_BASE_URL = options.apiBase;
            if (options.storageUnavailable) {
                Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Storage blocked'); } });
            } else {
                for (const [key, value] of Object.entries(options.storage || {})) window.sessionStorage.setItem(key, value);
            }
            window.fetch = async (url, request = {}) => {
                calls.push({ url, request });
                if (options.fetch) return options.fetch(url, request, calls);
                return json(url.endsWith('/menus') ? (options.menu || menu) : []);
            };
        }
    });
    t.after(() => {
        dom.window.close();
        assert.deepEqual(errors, [], 'no DOM or script errors');
    });
    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    const window = dom.window;
    const document = window.document;
    const app = {
        window,
        document,
        calls,
        get(id) { return document.getElementById(id); },
        visible(id) { return !this.get(id).classList.contains('hidden'); },
        fill(id, value) {
            this.get(id).value = value;
            this.get(id).dispatchEvent(new window.Event('input', { bubbles: true }));
        },
        confirm(count) {
            if (count !== undefined) this.fill('guest-count', String(count));
            this.get('guest-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
        },
        async addItem() {
            await window.refreshMenu();
            document.querySelector('[data-menu-code]').click();
            window.confirmAddToCart();
            window.showPage('view-cart');
        }
    };
    return app;
}

function json(data, status = 200) {
    return { ok: status < 400, status, json: async () => data };
}

test('entry is available while the menu request is pending', async t => {
    const app = await page(t, { hash: '#1', fetch: () => new Promise(() => {}) });
    assert.equal(app.get('guest-table-display').textContent, '01');
    assert.ok(app.visible('view-guests'));
    assert.ok(!app.visible('order-navigation'));
    app.confirm(2);
    assert.ok(app.visible('view-menu'));
    assert.match(app.get('menu-grid').textContent, /読み込み/);
});

test('cannot bypass entry using navigation or submitOrder', async t => {
    const app = await page(t);
    app.window.showPage('view-cart');
    await app.window.submitOrder();
    assert.ok(app.visible('view-guests'));
    assert.equal(app.calls.filter(call => call.request.method === 'POST').length, 0);
});

test('preset and stepper controls respect both bounds', async t => {
    const app = await page(t);
    app.document.querySelector('[data-guest-count="2"]').click();
    assert.equal(app.get('guest-count').value, '2');
    assert.equal(app.document.querySelector('[data-guest-count="2"]').getAttribute('aria-pressed'), 'true');
    app.get('guest-minus').click();
    assert.equal(app.get('guest-count').value, '1');
    assert.ok(app.get('guest-minus').disabled);
    app.fill('guest-count', '98');
    app.get('guest-plus').click();
    assert.equal(app.get('guest-count').value, '99');
    assert.ok(app.get('guest-plus').disabled);
});

test('invalid counts remain on the entry screen with an inline error', async t => {
    const app = await page(t);
    for (const value of ['', '0', '00', '100', '-1', '1.5', '1e1', 'abc']) {
        app.confirm(value);
        assert.ok(app.visible('view-guests'), value);
        assert.equal(app.get('guest-count').getAttribute('aria-invalid'), 'true', value);
        assert.ok(app.get('guest-count-error').textContent.length > 0, value);
    }
});

test('1, 99 and full-width numeric input are accepted', async t => {
    const app = await page(t);
    for (const [value, count] of [['1', 1], ['99', 99], ['４', 4]]) {
        app.window.openGuestEntry();
        app.confirm(value);
        assert.ok(app.visible('view-menu'));
        assert.match(app.get('table-chip').textContent, new RegExp(`${count}名`));
    }
});

test('a missing table requires valid input and preserves the branch suffix', async t => {
    const app = await page(t, { hash: '' });
    assert.ok(app.visible('guest-table-field'));
    app.confirm(2);
    assert.ok(app.visible('view-guests'));
    assert.equal(app.get('guest-table-input').getAttribute('aria-invalid'), 'true');
    app.fill('guest-table-input', '3-0');
    app.confirm(2);
    assert.equal(app.window.location.hash, '#03-0');
    assert.match(app.get('table-chip').textContent, /03-0/);
});

test('invalid tables are never converted to table 00 or an arbitrary default', async t => {
    const app = await page(t, { hash: '#%E0%A4%A' });
    for (const value of ['', '0', '00', '100', '01-10', 'aa']) {
        app.fill('guest-table-input', value);
        app.confirm(2);
        assert.ok(app.visible('view-guests'), value);
        assert.equal(app.get('guest-table-input').getAttribute('aria-invalid'), 'true', value);
    }
});

test('the QR table is not editable and is normalized to two digits', async t => {
    const app = await page(t, { hash: '#9-2' });
    assert.ok(!app.visible('guest-table-field'));
    app.confirm(3);
    assert.equal(app.window.location.hash, '#09-2');
    assert.match(app.get('table-chip').textContent, /09-2.*3名/);
});

test('editing or canceling the guest count retains the basket', async t => {
    const app = await page(t);
    app.confirm(2);
    await app.addItem();
    app.window.openGuestEntry();
    app.fill('guest-count', '6');
    app.get('guest-cancel').click();
    assert.ok(app.visible('view-cart'));
    assert.match(app.get('table-chip2').textContent, /2名/);
    assert.match(app.get('cart-items-list').textContent, /Test pizza/);
    app.window.openGuestEntry();
    app.confirm(4);
    assert.ok(app.visible('view-cart'));
    assert.match(app.get('table-chip2').textContent, /4名/);
    assert.equal(app.get('total-count').textContent, '1点');
});

test('an order sends the latest guest count and table through Spring only', async t => {
    let saved;
    const app = await page(t, {
        hash: '#01-1',
        fetch: async (url, request) => {
            if (url.endsWith('/menus')) return json(menu);
            if (request.method === 'POST') {
                saved = { ...JSON.parse(request.body), id: 1, createdAt: '2026-08-31T12:34:00' };
                return json(saved);
            }
            return json(saved ? [saved] : []);
        }
    });
    app.confirm(2);
    await app.addItem();
    app.window.openGuestEntry();
    app.confirm(5);
    await app.window.submitOrder();
    assert.equal(saved.guestCount, 5);
    assert.equal(saved.table, '01-1');
    assert.equal(saved.orderMethod, 'SELF');
    assert.equal(saved.items.length, 1);
    assert.ok(app.calls.every(call => call.url.startsWith('http://localhost:8080/api/')));
    assert.ok(app.visible('view-history'));
    await app.window.renderHistory();
    assert.match(app.get('orderContainer').textContent, /5名/);
    assert.ok(app.get('cart-badge').classList.contains('hidden'));
});

test('failed submissions retain both guest count and basket for retry', async t => {
    const app = await page(t, { fetch: async (url, request) => request.method === 'POST' ? json({}, 503) : json(menu) });
    app.confirm(3);
    await app.addItem();
    await app.window.submitOrder();
    assert.equal(app.get('total-count').textContent, '1点');
    assert.match(app.get('table-chip2').textContent, /3名/);
    assert.ok(!app.get('submit-btn').disabled);
});

test('double submission is prevented while a request is pending', async t => {
    let finishOrder;
    const app = await page(t, {
        fetch: (url, request) => request.method === 'POST'
            ? new Promise(resolve => { finishOrder = resolve; })
            : Promise.resolve(json(url.endsWith('/menus') ? menu : []))
    });
    app.confirm(2);
    await app.addItem();
    const first = app.window.submitOrder();
    await app.window.submitOrder();
    app.window.openGuestEntry();
    assert.ok(app.visible('view-cart'));
    assert.equal(app.calls.filter(call => call.request.method === 'POST').length, 1);
    finishOrder(json({ id: 1 }));
    await first;
});

test('menu errors have a retry action and do not block the guest form', async t => {
    let available = false;
    const app = await page(t, { fetch: async () => available ? json(menu) : json({}, 503) });
    await app.window.refreshMenu();
    assert.ok(app.visible('view-guests'));
    app.confirm(2);
    assert.ok(app.document.querySelector('.menu-retry'));
    available = true;
    await app.window.refreshMenu();
    assert.ok(app.document.querySelector('[data-menu-code]'));
});

test('only the current table draft is restored and must be confirmed again', async t => {
    const app = await page(t, { storage: { 'oracle-order:guests:01': '3', 'oracle-order:guests:02': '9', guestCount: '7' } });
    assert.equal(app.get('guest-count').value, '3');
    assert.ok(app.visible('view-guests'));
    app.window.showPage('view-menu');
    assert.ok(app.visible('view-guests'));
    app.confirm();
    assert.match(app.get('table-chip').textContent, /3名/);
});

test('other table drafts and corrupt drafts are ignored', async t => {
    const app = await page(t, { storage: { 'oracle-order:guests:01': '100', 'oracle-order:guests:02': '4' } });
    assert.equal(app.get('guest-count').value, '');
});

test('blocked sessionStorage does not prevent entry or ordering', async t => {
    const app = await page(t, { storageUnavailable: true });
    app.confirm(4);
    assert.ok(app.visible('view-menu'));
    assert.match(app.get('table-chip').textContent, /4名/);
});

test('menu names containing markup or quotes are rendered as text', async t => {
    const name = 'Chef\'s <img src=x onerror=alert(1)> pizza';
    const app = await page(t, { menu: [{ ...menu[0], name }] });
    app.confirm(2);
    await app.addItem();
    assert.equal(app.document.querySelector('.menu-name').textContent, name);
    assert.equal(app.document.querySelector('.ci-name').textContent, name);
    assert.equal(app.document.querySelectorAll('.menu-name img, .ci-name img').length, 0);
});

test('a phone uses the serving host instead of its own localhost', async t => {
    const app = await page(t, { url: 'http://192.0.2.10:5500/index.html#01' });
    assert.ok(app.calls.every(call => call.url.startsWith('http://192.0.2.10:8080/api/')));
});

test('an explicitly configured Spring API URL is respected', async t => {
    const app = await page(t, { apiBase: 'https://orders.example.test/api' });
    assert.ok(app.calls.every(call => call.url.startsWith('https://orders.example.test/api/')));
});

test('the customer page does not load Firebase or contain duplicate element IDs', async t => {
    const app = await page(t);
    const ids = [...app.document.querySelectorAll('[id]')].map(element => element.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.doesNotMatch(html, /firebase|fbAddDoc|fbGetDocs/);
    for (const button of app.document.querySelectorAll('.guest-step-button')) {
        assert.ok(button.getAttribute('aria-label'));
        assert.equal(button.type, 'button');
    }
});
