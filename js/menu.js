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
    // 以前の見た目では、メニューを開くと目標の欄（今日の練習）も見えるので描き直す
    if (open && typeof renderPracticeBox === 'function' && !(typeof isNewUi === 'function' && isNewUi())) renderPracticeBox();
    document.getElementById('menu-backdrop').classList.toggle('open', open);
    document.getElementById('menu-btn').textContent = open ? '✕' : '☰';
    if (!open && typeof onMenuClosed === 'function') onMenuClosed();
}

// Escキーでも閉じる
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') toggleMenu(false);
});

// ==========================================
// ★ 画面（.modal-overlay）は、枠の外（暗い背景）を押しても閉じる
//   閉じる関数は overlay の data-close（関数の名前）。data-close-confirm があれば、閉じる前に確かめる（入れかけのものが消える画面）
//   押し始めと離した所が両方とも背景のときだけ閉じる（枠の中で文字を選んで外で離したときは閉じない）。重なった画面は、押した背景の画面だけ
// ==========================================
let modalPressTarget = null;
document.addEventListener('pointerdown', (e) => {
    modalPressTarget = (e.target instanceof Element && e.target.classList.contains('modal-overlay')) ? e.target : null;
}, true);
document.addEventListener('click', (e) => {
    const overlay = e.target;
    const pressed = modalPressTarget;
    modalPressTarget = null;
    if (!(overlay instanceof Element) || !overlay.classList.contains('modal-overlay') || pressed !== overlay) return;
    const fnName = overlay.dataset.close;
    const fn = fnName && /^close\w+$/.test(fnName) ? window[fnName] : null;
    if (typeof fn !== 'function') return;
    const ask = overlay.dataset.closeConfirm;
    if (ask && !confirm(ask)) return;
    fn();
});
