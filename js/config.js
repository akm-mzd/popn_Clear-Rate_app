// ==========================================
// config.js
// 設定値と、アプリ全体で共有する状態（データ・表示状態）。
// 他のすべてのファイルより先に読み込む。
// ==========================================

// ==========================================
// ★ アプリのバージョン（メニューの一番下に表示）
//   1桁目: サイトを大きく作り変えたとき / 小数第1位: 機能の追加
//   小数第2位: UI・操作感の変更 / 小数第3位: バグ修正
//   ※ 変更を加えるたびに必ず更新する（CLAUDE.md 参照）
// ==========================================
const APP_VERSION = '3.16.0.0';

// ==========================================
// ★ 端末の判定（スマホ表示に切り替える画面幅）
// ==========================================
const MOBILE_MAX_WIDTH = 768;

// 画面幅がスマホ表示の範囲か（レイアウトの切替に使う）
function isNarrowScreen() {
    return window.innerWidth <= MOBILE_MAX_WIDTH;
}

// スマホ・タブレット端末か（画像を「長押しで保存」させるかの判定に使う）
function isMobileDevice() {
    return isNarrowScreen() || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// ==========================================
// ★ ブラウザの保存領域（localStorage）
//   プライベートモードなどで使えないと例外になるため、必ずこの関数を通す
// ==========================================
function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}
function storageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
}
function storageRemove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* 何もしない */ }
}

// ==========================================
// ★クラウド同期設定（GAS）と管理者パスワード
// ==========================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyWlAKYVscjezHrqwpJ32ydFxsJSgMukfovhVN0clOAAwP7vaVMgE1tzBe9yD4flbmlLg/exec';

// ★ 楽曲リストの編集用パスワード
const ADMIN_PASSWORD = "1005"; 
// ==========================================

let songs = [];
let allUsersData = {}; 
let currentUser = storageGet('popn_current_user') || "Guest";
let clearRecords = {}; 
let scoreRecords = {}; 
let memoRecords = {}; 

const MEDAL_TYPES = {
    '':         { imgUrl: 'URLをペースト', label: '未プレイ', rank: 0, isKuroHishiClear: false, isKuroBoshiClear: false, isEasyClear: false, isNormalClear: false },
    '未解禁':   { imgUrl: '', label: '未解禁', rank: -1, isKuroHishiClear: false, isKuroBoshiClear: false, isEasyClear: false, isNormalClear: false, excludeFromRate: true },
    '黒丸':     { imgUrl: 'images/medal/groove_02.png', label: '黒丸', rank: 1, isKuroHishiClear: false, isKuroBoshiClear: false, isEasyClear: false, isNormalClear: false },
    '黒菱':     { imgUrl: 'images/medal/groove_01.png', label: '黒菱', rank: 2, isKuroHishiClear: true, isKuroBoshiClear: false, isEasyClear: false, isNormalClear: false },
    '黒星':     { imgUrl: 'images/medal/groove_00.png', label: '黒星', rank: 3, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: false, isNormalClear: false },
    'イージー': { imgUrl: 'images/medal/easy.png', label: 'イージー', rank: 4, isKuroHishiClear: false, isKuroBoshiClear: false, isEasyClear: true, isNormalClear: false },
    'ロングオフ': { imgUrl: 'images/medal/long_off.png', label: 'ロングオフ', rank: 5, isKuroHishiClear: false, isKuroBoshiClear: false, isEasyClear: true, isNormalClear: true },
    '銅丸':     { imgUrl: 'images/medal/bad_02.png', label: '銅丸', rank: 6, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: true, isNormalClear: true },
    '銅菱':     { imgUrl: 'images/medal/bad_01.png', label: '銅菱', rank: 7, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: true, isNormalClear: true },
    '銅星':     { imgUrl: 'images/medal/bad_00.png', label: '銅星', rank: 8, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: true, isNormalClear: true },
    '銀丸':     { imgUrl: 'images/medal/full_combo_02.png', label: '銀丸', rank: 9, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: true, isNormalClear: true },
    '銀菱':     { imgUrl: 'images/medal/full_combo_01.png', label: '銀菱', rank: 10, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: true, isNormalClear: true },
    '銀星':     { imgUrl: 'images/medal/full_combo_00.png', label: '銀星', rank: 11, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: true, isNormalClear: true },
    '金星':     { imgUrl: 'images/medal/perfect_00.png', label: '金星', rank: 12, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: true, isNormalClear: true }
};

const MEDAL_COLORS = {
    '': '#e0e0e0',
    '未解禁': '#212121',
    '黒丸': '#283593', 
    '黒菱': '#1a237e', 
    '黒星': '#000051', 
    'イージー': '#4caf50', 
    'ロングオフ': '#ff9800', 
    '銅丸': '#8d6e63', 
    '銅菱': '#795548', 
    '銅星': '#5d4037', 
    '銀丸': '#bdbdbd', 
    '銀菱': '#9e9e9e', 
    '銀星': '#757575', 
    '金星': '#ffd700'
};

let currentMedalEditId = null;
let currentSort = isNarrowScreen() ? 'diff' : 'version';
let sortDesc = isNarrowScreen();
let currentViewLevel = storageGet('popn_startup_level') || '48'; // 起動時のレベル（メニューで設定、この端末に保存）
let lastDisplaySongs = []; // 現在テーブルに表示中の楽曲（難易度順画像で使用）


const STORAGE_KEY_CACHE = 'popn_cloud_cache_v1';
let dataLoaded = false; // キャッシュかクラウドのどちらかを読めたか

const emptyUser = () => ({ clearRecords: {}, scoreRecords: {}, memoRecords: {}, historyRecords: {}, pokkuraRecords: {}, goalRecords: {}, pokkuraFlagRecords: {}, recentRecords: {}, memoConfigRecords: {} });

// メダル・ランクの画像はリポジトリの images/ に置いている（公式サイトの画像を使うと、公式が止まったときに出なくなるため）
// 画像として使える場所か（リポジトリの images/・http(s)・data:）。'URLをペースト' などの仮の値は使わない
function isImageSrc(url) {
    return typeof url === 'string' && /^(images\/|https?:\/\/|data:image\/)/.test(url);
}

const RANK_IMAGES = {
    'S+':  'images/rank/rank_big_s_plus.png',
    'S':   'images/rank/rank_big_s.png',
    'AAA': 'images/rank/rank_big_a3.png',
    'AA+': 'images/rank/rank_big_a2_plus.png',
    'AA':  'images/rank/rank_big_a2.png',
    'A+':  'images/rank/rank_big_a1_plus.png',
    'A':   'images/rank/rank_big_a1.png',
    'B+':  'images/rank/rank_big_b_plus.png',
    'B':   'images/rank/rank_big_b.png',
    'C':   'images/rank/rank_big_c.png',
    'D':   'images/rank/rank_big_d.png',
    'E':   'images/rank/rank_big_e.png'
};
