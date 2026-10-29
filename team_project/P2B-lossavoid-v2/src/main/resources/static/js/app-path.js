// アプリの配置先をmetaタグから読み、画面遷移とAPIのURLへ共通のパスを補う。サーバー側のコンテキストパスを重複して付けない。
(() => {
    'use strict';
    const appRoot = document.querySelector('meta[name="app-root"]')?.content || '/';
    const contextPath = new URL(appRoot, location.origin).pathname.replace(/\/$/, '');

    window.orderAppPath = path => {
        if (!contextPath || path === contextPath || path.startsWith(contextPath + '/')) return path;
        return contextPath + (path.startsWith('/') ? path : '/' + path);
    };
    window.orderAppRoute = () => location.pathname.slice(contextPath.length) || '/';
})();
