// ==========================================
// menu.js
// メニューの開閉と、トップに戻るボタン。
// ==========================================

// ==========================================
// ★ トップに戻るボタンの制御
// ==========================================
window.addEventListener('scroll', () => {
    const topBtn = document.getElementById('back-to-top');
    if (topBtn) {
        // スマホでも確実にスクロール量を取得できるように修正
        const scrollAmount = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        
        // 上から300px以上スクロールしたらボタンを表示
        if (scrollAmount > 300) {
            topBtn.style.display = 'flex';
        } else {
            topBtn.style.display = 'none';
        }
    }
});



function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}
// ==========================================
// ★ メニューの開閉
// ==========================================
// メニュー最下部にバージョンを表示する
(function showAppVersion() {
    const el = document.getElementById('app-version');
    if (el) el.textContent = `Pop'n Clear Rate app  ver ${APP_VERSION}`;
})();

function toggleMenu(force) {
    const panel = document.getElementById('menu-panel');
    if (!panel) return;
    const open = (typeof force === 'boolean') ? force : !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    document.getElementById('menu-backdrop').classList.toggle('open', open);
    document.getElementById('menu-btn').textContent = open ? '✕' : '☰';
}

// Escキーでも閉じる
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') toggleMenu(false);
});
