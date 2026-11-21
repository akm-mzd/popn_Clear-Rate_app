// ==========================================
// readonly-pre.js（以前のページ ver 2.101 を「見るだけ」にするための部品。ほかのファイルより先に読み込む）
//   このページ（classic/）は ver 2.101 のまま変えない。ここと readonly.js だけで「見るだけ」にする。
//   ・クラウドへの保存（POST）はしない（今のアプリの記録を古いデータで上書きしないため）
//   ・この端末の保存（localStorage）にも書かない（今のアプリの控え・設定を変えないため）。読むだけ
// ==========================================
(function () {
    try {
        const noop = function () {};
        Storage.prototype.setItem = noop;
        Storage.prototype.removeItem = noop;
        Storage.prototype.clear = noop;
    } catch (e) { /* 何もしない */ }
    const realFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
        const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        if (method !== 'GET' && method !== 'HEAD') {
            return Promise.resolve(new Response(JSON.stringify({ status: 'error', message: '以前のページは見るだけです（保存はしません）' }), { headers: { 'Content-Type': 'application/json' } }));
        }
        return realFetch(input, init);
    };
})();
