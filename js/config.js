// ==========================================
// config.js
// 設定値と、アプリ全体で共有する状態（データ・表示状態）。
// 他のすべてのファイルより先に読み込む。
// ==========================================

// ==========================================
// ★クラウド同期設定（GAS）と管理者パスワード
// ==========================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbz7aEE4z7w7KLxSVRU5Mm8xPiotV5hAdxu1BUYQ1---NtTSr2kUpCisX6g0x-0TXO0kqw/exec';

// ★ 楽曲リストの編集用パスワード
const ADMIN_PASSWORD = "1005"; 
// ==========================================

let songs = [];
let allUsersData = {}; 
let currentUser = localStorage.getItem('popn_current_user') || "Guest";
let clearRecords = {}; 
let scoreRecords = {}; 
let memoRecords = {}; 

const MEDAL_TYPES = {
    '':         { imgUrl: 'URLをペースト', label: '未プレイ', rank: 0, isKuroHishiClear: false, isKuroBoshiClear: false, isEasyClear: false, isNormalClear: false },
    '未解禁':   { imgUrl: '', label: '未解禁', rank: -1, isKuroHishiClear: false, isKuroBoshiClear: false, isEasyClear: false, isNormalClear: false, excludeFromRate: true },
    '黒丸':     { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/groove_02.png', label: '黒丸', rank: 1, isKuroHishiClear: false, isKuroBoshiClear: false, isEasyClear: false, isNormalClear: false },
    '黒菱':     { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/groove_01.png', label: '黒菱', rank: 2, isKuroHishiClear: true, isKuroBoshiClear: false, isEasyClear: false, isNormalClear: false },
    '黒星':     { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/groove_00.png', label: '黒星', rank: 3, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: false, isNormalClear: false },
    'イージー': { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/easy.png', label: 'イージー', rank: 4, isKuroHishiClear: false, isKuroBoshiClear: false, isEasyClear: true, isNormalClear: false },
    'ロングオフ': { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/long_off.png', label: 'ロングオフ', rank: 5, isKuroHishiClear: false, isKuroBoshiClear: false, isEasyClear: true, isNormalClear: true },
    '銅丸':     { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/bad_02.png', label: '銅丸', rank: 6, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: true, isNormalClear: true },
    '銅菱':     { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/bad_01.png', label: '銅菱', rank: 7, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: true, isNormalClear: true },
    '銅星':     { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/bad_00.png', label: '銅星', rank: 8, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: true, isNormalClear: true },
    '銀丸':     { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/full_combo_02.png', label: '銀丸', rank: 9, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: true, isNormalClear: true },
    '銀菱':     { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/full_combo_01.png', label: '銀菱', rank: 10, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: true, isNormalClear: true },
    '銀星':     { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/full_combo_00.png', label: '銀星', rank: 11, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: true, isNormalClear: true },
    '金星':     { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/perfect_00.png', label: '金星', rank: 12, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: true, isNormalClear: true }
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
let currentSort = window.innerWidth <= 768 ? 'diff' : 'version';
let sortDesc = window.innerWidth <= 768 ? true : false;
let currentViewLevel = '48';
let lastDisplaySongs = []; // 現在テーブルに表示中の楽曲（難易度順画像で使用）


const STORAGE_KEY_CACHE = 'popn_cloud_cache_v1';
let dataLoaded = false; // キャッシュかクラウドのどちらかを読めたか

const emptyUser = () => ({ clearRecords: {}, scoreRecords: {}, memoRecords: {} });

const RANK_IMAGES = {
    'S+':  'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_s_plus.png',
    'S':   'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_s.png',
    'AAA': 'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_a3.png',
    'AA+': 'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_a2_plus.png',
    'AA':  'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_a2.png',
    'A+':  'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_a1_plus.png',
    'A':   'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_a1.png',
    'B+':  'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_b_plus.png',
    'B':   'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_b.png',
    'C':   'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_c.png',
    'D':   'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_d.png',
    'E':   'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_e.png'
};
