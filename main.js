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

// ==========================================
// ★ クリア率の表示形式（タップで切替）
//   'fixed1' : 小数点1桁 (例: 98.7)
//   'sig2'   : 有効数字2桁 (例: 99)
// ==========================================
let rateFormatMode = 'fixed1';
try { if (localStorage.getItem('popn_rate_format') === 'sig2') rateFormatMode = 'sig2'; } catch (e) {}

function formatRate(count, total) {
    if (!total) return '0';
    const x = (count / total) * 100;
    if (rateFormatMode === 'sig2') {
        if (x === 0) return '0';
        return String(Number(x.toPrecision(2)));
    }
    return x.toFixed(1);
}

function toggleRateFormat() {
    rateFormatMode = rateFormatMode === 'sig2' ? 'fixed1' : 'sig2';
    try { localStorage.setItem('popn_rate_format', rateFormatMode); } catch (e) {}
    renderTable();
}

let isAdminAuthenticated = false;

function checkAdminAuth() {
    if (isAdminAuthenticated) return true;
    const pwd = prompt("この操作には管理者用パスワードが必要です．パスワードを入力してください:");
    if (pwd === ADMIN_PASSWORD) {
        isAdminAuthenticated = true;
        return true;
    } else {
        alert("パスワードが違います．操作はキャンセルされました．");
        return false;
    }
}

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

function generatePieChartBase64(data, size = 240) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    let total = data.reduce((sum, d) => sum + d.count, 0);
    let currentAngle = -0.5 * Math.PI;
    
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2;

    if (total === 0) {
        ctx.fillStyle = '#e0e0e0';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();
        return canvas.toDataURL();
    }

    data.forEach(d => {
        let sliceAngle = (d.count / total) * 2 * Math.PI;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
        ctx.closePath();
        ctx.fill();
        currentAngle += sliceAngle;
    });

    return canvas.toDataURL();
}

// html2canvas は画像出力ボタンを使う時だけ必要なので、
// 初期表示をブロックしないよう使用直前に動的読み込みする
let html2canvasLoadPromise = null;
function ensureHtml2Canvas() {
    if (typeof html2canvas !== 'undefined') return Promise.resolve();
    if (html2canvasLoadPromise) return html2canvasLoadPromise;
    html2canvasLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
    return html2canvasLoadPromise;
}

let currentMedalEditId = null;
let currentSort = window.innerWidth <= 768 ? 'diff' : 'version';
let sortDesc = window.innerWidth <= 768 ? true : false;
let currentViewLevel = '48';
let lastDisplaySongs = []; // 現在テーブルに表示中の楽曲（難易度順画像で使用）

function showLoading(show, text = '通信中...') {
    document.getElementById('loading-text').innerText = text;
    document.getElementById('loading').style.display = show ? 'flex' : 'none';
}

const STORAGE_KEY_CACHE = 'popn_cloud_cache_v1';
let dataLoaded = false; // キャッシュかクラウドのどちらかを読めたか

const emptyUser = () => ({ clearRecords: {}, scoreRecords: {}, memoRecords: {} });

function applyFetchedData(data) {
    songs = data.songs || [];
    allUsersData = data.users || {};
    if (Object.keys(allUsersData).length === 0) allUsersData["Guest"] = emptyUser();
    for (let u in allUsersData) {
        if (!allUsersData[u].clearRecords) allUsersData[u].clearRecords = {};
        if (!allUsersData[u].scoreRecords) allUsersData[u].scoreRecords = {};
        if (!allUsersData[u].memoRecords) allUsersData[u].memoRecords = {};
    }
    if (!allUsersData[currentUser]) {
        currentUser = "Guest";
        if (!allUsersData["Guest"]) allUsersData["Guest"] = emptyUser();
    }
    clearRecords = allUsersData[currentUser].clearRecords;
    scoreRecords = allUsersData[currentUser].scoreRecords;
    memoRecords = allUsersData[currentUser].memoRecords;

    songs.forEach(s => {
        if (!s.level) s.level = '48';
        const p = parseDifficulty(s.diffRaw);
        s.diffClass = p.diffClass;
        s.diffIndex = p.diffIndex;
        const expectedId = s.genre + "_" + s.title + "_" + s.notes;
        if (s.id !== expectedId) {
            [clearRecords, scoreRecords, memoRecords].forEach(rec => {
                if (rec[s.id] !== undefined) { rec[expectedId] = rec[s.id]; delete rec[s.id]; }
            });
            s.id = expectedId;
        }
    });
    dataLoaded = true;
}

function refreshUI() {
    initUserSelector();
    updateCompareUserSelect();
    initFilters();
    renderTable();
}

async function fetchCloudData(retries = 2, timeoutMs = 20000) {
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(GAS_URL, { signal: AbortSignal.timeout(timeoutMs) });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (!data || !Array.isArray(data.songs)) throw new Error('データ形式が不正');
            return data;
        } catch (e) {
            if (i === retries) throw e;
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
}

function loadCache() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_CACHE)); } catch (e) { return null; }
}
function saveCache(data) {
    try { localStorage.setItem(STORAGE_KEY_CACHE, JSON.stringify(data)); }
    catch (e) { localStorage.removeItem(STORAGE_KEY_CACHE); } // 容量オーバー時
}

// ==========================================
// ★ 自動保存・他端末の変更の自動反映
// ==========================================
const SYNC_INTERVAL_MS = 10000;   // 他端末の変更を確認する間隔（10秒）
const AUTOSAVE_DELAY_MS = 800;    // 変更してから保存を始めるまでの時間（0.8秒）
const RECORD_TYPES = ['clearRecords', 'scoreRecords', 'memoRecords'];

let cloudReady = false;          // 最初のクラウド読み込みが成功したか
const dirtyUsers = new Set();    // 未保存の変更があるユーザー
let autoSaveTimer = null;
let autoSaving = false;
let localChangeSeq = 0;          // この端末で変更・保存があるたびに増える
let knownVersion;                // この端末が把握しているクラウドの版番号
let syncing = false;
let lastSyncAt = 0;
let syncedUsers = {};            // クラウドに保存済みと分かっている記録の写し

// 画面上部中央に出す通知
function showToast(id, text, color, hideAfterMs) {
    let box = document.getElementById('toast-box');
    if (!box) {
        box = document.createElement('div');
        box.id = 'toast-box';
        box.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:9500;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;width:max-content;max-width:90vw;';
        document.body.appendChild(box);
    }
    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement('div');
        el.id = id;
        el.style.cssText = 'padding:8px 16px;border-radius:20px;font-size:14px;font-weight:bold;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.35);text-align:center;';
        box.appendChild(el);
    }
    clearTimeout(el._hideTimer);
    el.textContent = text;
    el.style.background = color;
    el.style.display = text ? 'block' : 'none';
    if (text && hideAfterMs) el._hideTimer = setTimeout(() => { el.style.display = 'none'; }, hideAfterMs);
}

function setSaveStatus(text, color, hideAfterMs) {
    showToast('toast-save', text, color, hideAfterMs);
}

// ---------- 変更分の取り出し ----------
function markSynced(users) {
    syncedUsers = JSON.parse(JSON.stringify(users || {}));
}

// 保存済みの状態と比べて、変わった記録だけを取り出す（null は削除の意味）
function buildPatch(u) {
    const now = allUsersData[u] || {};
    const base = syncedUsers[u] || {};
    const patch = {};
    let count = 0;
    RECORD_TYPES.forEach(type => {
        const n = now[type] || {};
        const b = base[type] || {};
        const p = {};
        for (const id in n) {
            if (JSON.stringify(n[id]) !== JSON.stringify(b[id])) { p[id] = n[id]; count++; }
        }
        for (const id in b) {
            if (!(id in n)) { p[id] = null; count++; }
        }
        if (Object.keys(p).length > 0) patch[type] = p;
    });
    return count > 0 ? patch : null;
}

function applyPatchToSynced(u, patch) {
    if (!syncedUsers[u]) syncedUsers[u] = { clearRecords: {}, scoreRecords: {}, memoRecords: {} };
    RECORD_TYPES.forEach(type => {
        const p = patch[type];
        if (!p) return;
        if (!syncedUsers[u][type]) syncedUsers[u][type] = {};
        for (const id in p) {
            if (p[id] === null) delete syncedUsers[u][type][id];
            else syncedUsers[u][type][id] = JSON.parse(JSON.stringify(p[id]));
        }
    });
}

function patchRequest(u, patch) {
    const body = JSON.stringify({ type: 'patchRecords', targetUser: u, patch: patch });
    // keepalive を付けると、ページを閉じても送信が最後まで行われる（容量制限があるので小さいときだけ）
    return fetch(GAS_URL, { method: 'POST', body: body, keepalive: body.length < 20000 });
}

// ---------- 自動保存 ----------
function scheduleAutoSave() {
    localChangeSeq++;
    dirtyUsers.add(currentUser);
    setSaveStatus('● 未保存', '#ff9800');
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(runAutoSave, AUTOSAVE_DELAY_MS);
}

async function runAutoSave() {
    if (!cloudReady || autoSaving || dirtyUsers.size === 0) return;
    autoSaving = true;
    setSaveStatus('☁️ 保存中…', '#2196F3');
    const targets = [...dirtyUsers];
    dirtyUsers.clear();
    let failed = false;

    for (const u of targets) {
        const patch = buildPatch(u);
        if (!patch) continue;
        try {
            const res = await patchRequest(u, patch);
            const result = await res.json();
            if (result.status === 'error') throw new Error(result.message);
            if (!result.patched) throw new Error('GAS側が古いままです（再デプロイが必要）');
            applyPatchToSynced(u, patch);
            // 自分の保存だけで版が進んだ場合は、取り直さなくて済むよう版番号を進める
            if (result.version !== undefined && result.prevVersion === knownVersion) {
                knownVersion = result.version;
            }
        } catch (e) {
            console.error('自動保存エラー:', e);
            dirtyUsers.add(u);
            failed = true;
        }
    }

    autoSaving = false;
    localChangeSeq++;
    if (failed) {
        setSaveStatus('⚠ 保存失敗（自動で再試行します）', '#d32f2f');
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(runAutoSave, 10000);
    } else if (dirtyUsers.size > 0) {
        runAutoSave(); // 保存中に新しい変更があった場合
    } else {
        const c = loadCache();
        if (c) { c.users = allUsersData; saveCache(c); }
        setSaveStatus('✓ 保存しました', '#4caf50', 2000);
    }
}

// ★ 画面を離れる瞬間に、待たずにすぐ送信する
function flushOnLeave() {
    if (!cloudReady || dirtyUsers.size === 0) return;
    clearTimeout(autoSaveTimer);
    if (!autoSaving) { runAutoSave(); return; }
    // 保存の途中でさらに変更があった場合：残りを別便で送っておく
    for (const u of dirtyUsers) {
        const patch = buildPatch(u);
        if (patch) patchRequest(u, patch).catch(() => {});
    }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) flushOnLeave(); });
window.addEventListener('pagehide', flushOnLeave);

// 最初の読み込みに失敗していて送信できないときだけ、閉じる前に警告
window.addEventListener('beforeunload', (e) => {
    if (!cloudReady && dirtyUsers.size > 0) { e.preventDefault(); e.returnValue = ''; }
});

// ---------- 他端末の変更の反映 ----------
// キーの順番に左右されない比較用の文字列を作る
function stableStr(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stableStr).join(',') + ']';
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStr(v[k])).join(',') + '}';
}
function userRecordsStr(u) {
    u = u || {};
    return stableStr([u.clearRecords || {}, u.scoreRecords || {}, u.memoRecords || {}]);
}

// 版番号だけを取得する（とても軽い）
async function fetchCloudVersion() {
    const res = await fetch(GAS_URL + '?mode=version', { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return data.version;
}

async function checkRemoteChanges() {
    if (!cloudReady || syncing || document.hidden) return;
    // 管理者として編集中・未保存の変更がある間は上書きしない
    if (isAdminAuthenticated || autoSaving || dirtyUsers.size > 0) return;

    syncing = true;
    lastSyncAt = Date.now();
    const seq = localChangeSeq;
    try {
        const v = await fetchCloudVersion();
        if (v !== undefined && v !== knownVersion) {
            // 変更があったときだけ全データを取り直す
            const fresh = await fetchCloudData(0);
            const localChanged = seq !== localChangeSeq || autoSaving || dirtyUsers.size > 0 || isAdminAuthenticated;

            if (!localChanged) {
                knownVersion = fresh.version;
                fresh.users = fresh.users || {};
                const mineChanged = !!fresh.users[currentUser] &&
                    userRecordsStr(fresh.users[currentUser]) !== userRecordsStr(allUsersData[currentUser]);

                markSynced(fresh.users);

                // この端末で作ったばかりの未保存ユーザーは残す
                for (const u in allUsersData) {
                    if (!fresh.users[u]) fresh.users[u] = allUsersData[u];
                }

                saveCache(fresh);
                applyFetchedData(fresh);
                initUserSelector();
                updateCompareUserSelect();
                updateDynamicFilters();
                renderTable();

                if (mineChanged) {
                    showToast('toast-sync', '🔄 他の端末での変更を反映しました', '#7b1fa2', 5000);
                }
            }
        }
    } catch (e) {
        console.warn('同期チェック失敗', e);
    }
    syncing = false;
}

function startRemoteSync() {
    setInterval(checkRemoteChanges, SYNC_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && Date.now() - lastSyncAt > 5000) checkRemoteChanges();
    });
}

// 前回データ表示中に行った編集を、届いた最新データに重ねる
function mergeLocalEdits(fresh, before, now) {
    const users = fresh.users || (fresh.users = {});
    for (const u in now) {
        if (!users[u]) { users[u] = now[u]; continue; } // 新規追加ユーザー
        RECORD_TYPES.forEach(type => {
            const b = (before[u] && before[u][type]) || {};
            const n = now[u][type] || {};
            if (!users[u][type]) users[u][type] = {};
            for (const id in n) {
                if (JSON.stringify(n[id]) !== JSON.stringify(b[id])) users[u][type][id] = n[id];
            }
            for (const id in b) {
                if (!(id in n)) delete users[u][type][id];
            }
        });
    }
}

window.onload = async () => {
    initMedalGrid();

    // ① キャッシュがあれば即表示
    let snapshot = null;
    const cached = loadCache();
    if (cached && Array.isArray(cached.songs)) {
        applyFetchedData(cached);
        refreshUI();
        snapshot = JSON.stringify({ songs, allUsersData });
    } else {
        showLoading(true, 'データを取得中...');
    }

    // ② 最新データを取得（キャッシュ表示中は裏で）
    try {
        const fresh = await fetchCloudData();
        knownVersion = fresh.version;
        lastSyncAt = Date.now();
        markSynced(fresh.users);

        const before = snapshot ? JSON.parse(snapshot) : null;
        const songsEdited = before && JSON.stringify(songs) !== JSON.stringify(before.songs);
        if (!songsEdited) {
            if (before) mergeLocalEdits(fresh, before.allUsersData, allUsersData);
            applyFetchedData(fresh);
            refreshUI();
        }
        saveCache(fresh);
        cloudReady = true;
        runAutoSave();      // 待っている間の編集があれば保存
        startRemoteSync();  // 他端末の変更の確認を開始
    } catch (e) {
        console.warn('クラウド読み込み失敗', e);
        alert(cached
            ? '最新データの取得に失敗しました。前回のデータを表示しています。\n（自動保存は止まっています。再読み込みするか、手動で保存してください）'
            : 'データの読み込みに失敗しました。ページを再読み込みしてください。');
    }
    showLoading(false);
};

function updateCurrentUserLabel() {
    const label = document.getElementById('current-user-label');
    if (label) label.textContent = `👤 ユーザー: ${currentUser}`;
}

function initUserSelector() {
    updateCurrentUserLabel();
    const select = document.getElementById('current-user-select');
    select.innerHTML = "";
    const users = Object.keys(allUsersData);
    
    users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u;
        opt.text = u;
        if (u === currentUser) opt.selected = true;
        select.appendChild(opt);
    });
}

function updateCompareUserSelect() {
    const select = document.getElementById('compare-user-select');
    if (!select) return;
    const currentUserSelection = select.value;
    select.innerHTML = '<option value="">-- 対象を選択 --</option>';
    const users = Object.keys(allUsersData);
    users.forEach(u => {
        if (u !== currentUser) {
            const opt = document.createElement('option');
            opt.value = u;
            opt.text = u;
            if (u === currentUserSelection) opt.selected = true;
            select.appendChild(opt);
        }
    });
}

function switchUser() {
    currentUser = document.getElementById('current-user-select').value;
    localStorage.setItem('popn_current_user', currentUser);
    updateCurrentUserLabel();
    clearRecords = allUsersData[currentUser]?.clearRecords || {};
    scoreRecords = allUsersData[currentUser]?.scoreRecords || {};
    memoRecords = allUsersData[currentUser]?.memoRecords || {};
    updateCompareUserSelect();
    renderTable();
}

function addNewUser() {
    const name = prompt("新しいユーザー名を入力してください:\n（例: お名前、ライバルの名前など）");
    if (!name) return;
    if (allUsersData[name]) {
        alert("その名前は既に存在します。");
        return;
    }
    currentUser = name;
    allUsersData[name] = { clearRecords: {}, scoreRecords: {}, memoRecords: {} };
    localStorage.setItem('popn_current_user', name);
    initUserSelector();
    updateCompareUserSelect();
    switchUser();
}

// ==========================================
// ★ クラウド手動保存
// ==========================================
// 画面の最新状態を allUsersData へ反映させておく
function syncCurrentUserToAllUsers() {
    if (!allUsersData[currentUser]) allUsersData[currentUser] = emptyUser();
    allUsersData[currentUser].clearRecords = clearRecords;
    allUsersData[currentUser].scoreRecords = scoreRecords;
    allUsersData[currentUser].memoRecords = memoRecords;
}

// 「保存」ボタン：現在開いているユーザーの記録（クリア・スコア・メモ）を保存
async function saveCurrentUserToCloud() {
    if (!GAS_URL || GAS_URL.trim() === '') {
        alert("クラウド保存先のURLが設定されていません。");
        return;
    }
    syncCurrentUserToAllUsers();
    const success = await saveToCloud(false, currentUser);
    if (success) {
        alert(`ユーザー [${currentUser}] の記録をクラウドに保存しました！`);
    }
}

// 「全体保存」ボタン（PC版のみ）：楽曲リスト ＋ 全ユーザーの記録を保存（管理者パスワード必須）
async function saveAllToCloud() {
    if (!GAS_URL || GAS_URL.trim() === '') {
        alert("クラウド保存先のURLが設定されていません。");
        return;
    }
    if (!confirm("楽曲リスト ＋ 全ユーザーの記録をクラウドに保存します。\n（※管理者パスワード必須）\n\nよろしいですか？")) return;

    syncCurrentUserToAllUsers();
    if (!checkAdminAuth()) return;

    // ① まず楽曲リスト全体を保存
    let success = await saveToCloud(true);
    if (!success) return; // 楽曲の保存に失敗した場合は安全のため中断

    // ② 続いて、登録されている全ユーザーを順番にクラウドへ保存
    const users = Object.keys(allUsersData);
    for (let i = 0; i < users.length; i++) {
        const targetU = users[i];
        const progressText = `全ユーザーを保存中 (${i + 1}/${users.length}): [${targetU}]`;
        const res = await saveToCloud(false, targetU, progressText);
        if (!res) {
            success = false;
            alert(`ユーザー [${targetU}] の保存中に通信エラーが発生しました。`);
            break;
        }
    }

    if (success) {
        alert("クラウドへの保存が完了しました！");
    }
}

async function saveToCloud(isSongUpdate = false, targetUserName = currentUser, customLoadingText = null) {
    if (!GAS_URL || GAS_URL.trim() === '') return false;
    if (!dataLoaded) { alert("データを読み込めていないため保存できません。再読み込みしてください。"); return false; } // ←追加

    // ローディング表示（カスタムテキストがあればそれを優先表示）
    const defaultText = `クラウドに保存中... (${isSongUpdate ? '楽曲リスト' : targetUserName})`;
    showLoading(true, customLoadingText || defaultText);
    let isSuccess = false;
    try {
        // 指定されたターゲットユーザーのデータをallUsersDataから安全に取得
        const targetClear = allUsersData[targetUserName]?.clearRecords || {};
        const targetScore = allUsersData[targetUserName]?.scoreRecords || {};
        const targetMemo = allUsersData[targetUserName]?.memoRecords || {};

        const payload = {
            type: isSongUpdate ? "updateSongs" : "updateClears",
            targetUser: targetUserName,
            songs: isSongUpdate ? songs : [], 
            clearRecords: targetClear,
            scoreRecords: targetScore,
            memoRecords: targetMemo
        };

        if (isSongUpdate) {
            payload.password = ADMIN_PASSWORD;
        }

        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        if (result.status === 'error') {
            alert(result.message);
        } else {
            // 現在のユーザーを保存した場合は、メモリ内のデータも最新として同期
            if (!isSongUpdate && targetUserName === currentUser) {
                if (!allUsersData[currentUser]) allUsersData[currentUser] = { clearRecords: {}, scoreRecords: {}, memoRecords: {} };
                allUsersData[currentUser].clearRecords = targetClear;
                allUsersData[currentUser].scoreRecords = targetScore;
                allUsersData[currentUser].memoRecords = targetMemo;
            }
            isSuccess = true;
        }
    } catch (e) {
        console.error("クラウド保存エラー:", e);
        alert("通信エラーが発生しました。サイトを 更新しない で、保存が完了するまで試してください。");
    }
    showLoading(false);
    return isSuccess;
}


function initFilters() {
    const medalSelect = document.getElementById('filter-medal');
    medalSelect.innerHTML = '<option value="ALL">すべて</option>';
    
    const sortedMedalKeys = Object.keys(MEDAL_TYPES)
        .filter(k => k !== '')
        .sort((a, b) => MEDAL_TYPES[b].rank - MEDAL_TYPES[a].rank);
        
    sortedMedalKeys.forEach(k => {
        const option = document.createElement('option');
        option.value = k;
        option.text = MEDAL_TYPES[k].label;
        medalSelect.appendChild(option);
    });
    const optionUnplayed = document.createElement('option');
    optionUnplayed.value = 'unplayed';
    optionUnplayed.text = '未プレイ';
    medalSelect.appendChild(optionUnplayed);
    
    updateDynamicFilters();
}

function updateDynamicFilters() {
    const versionSelect = document.getElementById('filter-version');
    if (versionSelect) {
        const currentVer = versionSelect.value;
        versionSelect.innerHTML = '<option value="ALL">すべて</option>';
        const versions = [...new Set(songs.map(s => s.version))].filter(v => v).sort((a, b) => getVersionSortValue(a) - getVersionSortValue(b));
        versions.forEach(v => {
            const option = document.createElement('option');
            option.value = v;
            option.text = v;
            versionSelect.appendChild(option);
        });
        if (versions.includes(currentVer)) {
            versionSelect.value = currentVer;
        }
    }

    const viewLevelContainer = document.getElementById('view-level-buttons');
    if (viewLevelContainer) {
        viewLevelContainer.innerHTML = '';
        
        // 「すべて」は一番右端に配置する
        const allBtn = document.createElement('button');
        allBtn.className = `level-btn level-btn-all ${currentViewLevel === 'ALL' ? 'active' : ''}`;
        allBtn.innerText = 'すべて';
        allBtn.onclick = () => changeViewLevel('ALL');
        
        const levels = [...new Set(songs.map(s => s.level))].filter(l => l);
        levels.sort((a, b) => {
            const numA = parseInt(a, 10);
            const numB = parseInt(b, 10);
            if (!isNaN(numA) && !isNaN(numB)) return numB - numA;
            if (isNaN(numA)) return 1;
            if (isNaN(numB)) return -1;
            return 0;
        });
        
        if (currentViewLevel !== 'ALL' && !levels.includes(currentViewLevel)) {
            currentViewLevel = 'ALL';
            allBtn.classList.add('active');
        }
        
        levels.forEach(l => {
            const btn = document.createElement('button');
            btn.className = `level-btn ${isNaN(parseInt(l, 10)) ? 'level-btn-text' : ''} ${currentViewLevel === l ? 'active' : ''}`;
            btn.innerText = l;
            btn.title = isNaN(parseInt(l, 10)) ? l : `Lv${l}`;
            btn.onclick = () => changeViewLevel(l);
            viewLevelContainer.appendChild(btn);
        });
        viewLevelContainer.appendChild(allBtn);
    }
}

function resetFilters() {
    document.getElementById('filter-clear').value = 'ALL';
    document.getElementById('filter-medal').value = 'ALL';
    document.getElementById('filter-version').value = 'ALL';
    document.getElementById('filter-diff').value = 'ALL';
    document.getElementById('filter-affinity').value = 'ALL';
    renderTable();
}

function setMedalFilter(filterVal) {
    const medalSelect = document.getElementById('filter-medal');
    if (medalSelect) {
        medalSelect.value = filterVal;
        
        // 「さらに条件で絞り込む」メニューが閉じていたら自動で開く
        const details = medalSelect.closest('details');
        if (details && !details.open) {
            details.open = true;
        }
        
        // 絞り込みを適用
        renderTable();
        
        // テーブルの少し上まで自動でスクロールする
        const tableElement = document.getElementById('song-table');
        if (tableElement) {
            const y = tableElement.getBoundingClientRect().top + window.pageYOffset - 120;
            window.scrollTo({top: y, behavior: 'smooth'});
        }
    }
}

function initMedalGrid() {
    const grid = document.getElementById('medal-grid');
    let html = '';
    
    const sortedMedalKeys = Object.keys(MEDAL_TYPES).sort((a, b) => MEDAL_TYPES[b].rank - MEDAL_TYPES[a].rank);
    
    sortedMedalKeys.forEach(k => {
        const m = MEDAL_TYPES[k];
        const isValidUrl = m.imgUrl.startsWith('http') || m.imgUrl.startsWith('data:');
        const display = isValidUrl 
            ? `<img src="${m.imgUrl}" alt="${m.label}">` 
            : `<div class="fallback-text">${m.label}</div>`;
        
        html += `
            <div class="medal-item" onclick="selectMedal('${k}')">
                ${display}
                <div style="font-size: 0.8em; color: #555; font-weight: bold;">${m.label}</div>
            </div>
        `;
    });
    grid.innerHTML = html;
}

function openMedalModal(id) {
    currentMedalEditId = id;
    document.getElementById('medal-modal').style.display = 'flex';
}

function closeMedalModal() {
    currentMedalEditId = null;
    document.getElementById('medal-modal').style.display = 'none';
}

async function selectMedal(medalKey) {
    if (currentMedalEditId) {
        if (medalKey === '') {
            delete clearRecords[currentMedalEditId];
        } else {
            clearRecords[currentMedalEditId] = medalKey;
        }
        if (!allUsersData[currentUser]) allUsersData[currentUser] = { clearRecords: {}, scoreRecords: {}, memoRecords: {} };
        allUsersData[currentUser].clearRecords = clearRecords;
        scheduleAutoSave();   // ←追加
        renderTable();
        closeMedalModal();
    }
}

function openScoreModal(id) {
    const song = songs.find(s => s.id === id);
    if (!song) return;
    document.getElementById('score-modal-id').value = id;
    document.getElementById('score-modal-title').innerText = `${song.title} - スコア`;
    document.getElementById('score-input-val').value = scoreRecords[id] || '';
    document.getElementById('score-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('score-input-val').focus(), 50);
}

function closeScoreModal() {
    document.getElementById('score-modal').style.display = 'none';
}

async function saveScoreModal() {
    const id = document.getElementById('score-modal-id').value;
    const val = document.getElementById('score-input-val').value.trim();
    
    if (val === '') {
        delete scoreRecords[id];
    } else {
        const num = parseInt(val, 10);
        if (isNaN(num) || num < 0 || num > 100000) {
            alert('スコアは0〜100000の間で入力してください。');
            return;
        }
        scoreRecords[id] = num;
    }
    
    if (!allUsersData[currentUser]) allUsersData[currentUser] = { clearRecords: {}, scoreRecords: {}, memoRecords: {} };
    allUsersData[currentUser].scoreRecords = scoreRecords;

    closeScoreModal();
    scheduleAutoSave();   // ←追加
    renderTable();
}

// --- メモ機能関連 ---
function openMemoModal(id) {
    const song = songs.find(s => s.id === id);
    if (!song) return;
    
    const memo = memoRecords[id] || {};
    
    document.getElementById('memo-modal-id').value = id;
    document.getElementById('memo-modal-title').innerText = `メモ: ${song.title}`;
    document.getElementById('memo-input-affinity').value = memo.affinity || '';
    document.getElementById('memo-input-sudden').value = memo.sudden || '';
    document.getElementById('memo-input-comment').value = memo.comment || '';
    
    document.getElementById('memo-modal').style.display = 'flex';
}

function closeMemoModal() {
    document.getElementById('memo-modal').style.display = 'none';
}

function clearMemo() {
    if(confirm('この楽曲のメモをすべてクリアしますか？')) {
        const id = document.getElementById('memo-modal-id').value;
        delete memoRecords[id];
        
        if (!allUsersData[currentUser]) allUsersData[currentUser] = { clearRecords: {}, scoreRecords: {}, memoRecords: {} };
        allUsersData[currentUser].memoRecords = memoRecords;

        closeMemoModal();
        scheduleAutoSave();   // ←追加
        renderTable();
    }
}

function saveMemoModal() {
    const id = document.getElementById('memo-modal-id').value;
    const affinity = document.getElementById('memo-input-affinity').value;
    const sudden = document.getElementById('memo-input-sudden').value.trim();
    const comment = document.getElementById('memo-input-comment').value.trim();

    if (affinity === '' && sudden === '' && comment === '') {
        delete memoRecords[id];
    } else {
        memoRecords[id] = { affinity, sudden, comment };
    }

    if (!allUsersData[currentUser]) allUsersData[currentUser] = { clearRecords: {}, scoreRecords: {}, memoRecords: {} };
    allUsersData[currentUser].memoRecords = memoRecords;

    closeMemoModal();
    scheduleAutoSave();   // ←追加
    renderTable();
}

// --- ランダム選曲機能関連 ---
function openRandomModal() {
    const levels = [...new Set(songs.map(s => s.level))].filter(l => l).sort((a,b)=>b-a);
    let levelHtml = '';
    levels.forEach(l => {
        levelHtml += `<label class="check-label"><input type="checkbox" class="rand-level" value="${l}"> Lv${l}</label>`;
    });
    document.getElementById('random-level-checkboxes').innerHTML = levelHtml;

    let medalHtml = `<label class="check-label"><input type="checkbox" class="rand-medal" value=""> (未プレイ)</label>`;
    
    const sortedMedalKeys = Object.keys(MEDAL_TYPES)
        .filter(k => k !== '' && k !== '未解禁')
        .sort((a, b) => MEDAL_TYPES[b].rank - MEDAL_TYPES[a].rank);
    
    sortedMedalKeys.forEach(k => {
        medalHtml += `<label class="check-label"><input type="checkbox" class="rand-medal" value="${k}"> ${MEDAL_TYPES[k].label}</label>`;
    });
    document.getElementById('random-medal-checkboxes').innerHTML = medalHtml;

    const diffs = ['危険', '別格', '詐称', '強', '中(+)', '中(-)', '弱', '逆詐称', '入門', '未分類'];
    let diffHtml = '';
    diffs.forEach(d => {
        diffHtml += `<label class="check-label"><input type="checkbox" class="rand-diff" value="${d}"> ${d}</label>`;
    });
    document.getElementById('random-diff-checkboxes').innerHTML = diffHtml;

    document.getElementById('random-result-area').style.display = 'none';
    document.getElementById('random-modal').style.display = 'flex';
}

function closeRandomModal() {
    document.getElementById('random-modal').style.display = 'none';
}

function executeRandomSelect() {
    const selectedLevels = Array.from(document.querySelectorAll('.rand-level:checked')).map(cb => cb.value);
    const selectedMedals = Array.from(document.querySelectorAll('.rand-medal:checked')).map(cb => cb.value);
    const selectedDiffs = Array.from(document.querySelectorAll('.rand-diff:checked')).map(cb => cb.value);

    const filtered = songs.filter(song => {
        if (selectedLevels.length > 0 && !selectedLevels.includes(song.level)) return false;

        const medalKey = clearRecords[song.id] || '';
        if (selectedMedals.length > 0 && !selectedMedals.includes(medalKey)) return false;

        let dClass = song.diffClass || '未分類';
        if (dClass === '中') {
            dClass = (song.diffIndex !== null && song.diffIndex < 0) ? '中(-)' : '中(+)';
        }
        if (selectedDiffs.length > 0 && !selectedDiffs.includes(dClass)) return false;

        return true;
    });

    const resultArea = document.getElementById('random-result-area');
    resultArea.style.display = 'block';

    if (filtered.length === 0) {
        resultArea.innerHTML = `<div style="color: #d32f2f; font-weight: bold; padding: 10px;">条件に合致する楽曲がありません。</div>`;
        return;
    }

    const randomIndex = Math.floor(Math.random() * filtered.length);
    const song = filtered[randomIndex];
    
    const medalKey = clearRecords[song.id] || '';
    const medalInfo = MEDAL_TYPES[medalKey] || MEDAL_TYPES[''];
    
    const bannerHtml = song.bannerUrl && song.bannerUrl.trim() !== ''
        ? `<img src="${song.bannerUrl}" style="max-width: 100%; height: auto; max-height: 60px; border-radius: 4px; margin-bottom: 10px;" />`
        : ``;

    let dClassStr = song.diffClass || '';
    let dIndexStr = song.diffRaw.replace(dClassStr, '').trim();
    if (!song.diffRaw.includes(dClassStr)) { dClassStr = song.diffRaw; dIndexStr = ''; }
    const styleObj = getDifficultyColor(song.diffClass, song.diffIndex);

    const medalDisplay = (medalInfo.imgUrl && (medalInfo.imgUrl.startsWith('http') || medalInfo.imgUrl.startsWith('data:')))
        ? `<img src="${medalInfo.imgUrl}" style="width:24px; height:24px; object-fit:contain; vertical-align:middle;">`
        : `<span style="font-size:0.9em; color:#555;">[${medalInfo.label}]</span>`;

    resultArea.innerHTML = `
        <div style="font-size: 0.9em; color: #666; margin-bottom: 10px;">🎵 抽選結果 (${filtered.length}曲中から)</div>
        ${bannerHtml}
        <div style="font-size: 0.85em; color: #666;">${song.genre}</div>
        <div style="font-size: 1.3em; font-weight: bold; margin: 8px 0; color: #333;">${song.title}</div>
        <div style="display: flex; justify-content: center; gap: 12px; margin-top: 10px; align-items: center;">
            <span class="level-badge" style="font-size: 1.1em; padding: 4px 10px;">Lv ${song.level}</span>
            <div style="color: ${styleObj.color}; text-shadow: ${styleObj.shadow}; font-weight: bold; font-size: 1.2em;">
                ${dClassStr}<span style="font-size: 0.6em; margin-left: 2px;">${dIndexStr}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px; font-weight: bold;">
                ${medalDisplay}
            </div>
        </div>
    `;
}

function parseDifficulty(rawStr) {
    if (!rawStr) return { diffClass: '未分類', diffIndex: null };
    let diffClass = '未分類';
    let diffIndex = null;
    let normalizedStr = rawStr
        .replace(/[＋]/g, '+')
        .replace(/[－]/g, '-')
        .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .replace(/．/g, '.');
    const match = normalizedStr.match(/([-+]?\d*\.?\d+)/);
    if (match) {
        diffIndex = parseFloat(match[1]);
    }
    if (rawStr.includes('危険')) diffClass = '危険';
    else if (rawStr.includes('別格')) diffClass = '別格';
    else if (rawStr.includes('逆詐称')) diffClass = '逆詐称';
    else if (rawStr.includes('詐称')) diffClass = '詐称';
    else if (rawStr.includes('入門')) diffClass = '入門';
    else if (rawStr.includes('強')) diffClass = '強';
    else if (rawStr.includes('中')) diffClass = '中';
    else if (rawStr.includes('弱')) diffClass = '弱';
    return { diffClass, diffIndex };
}

function downloadSongsAndClearsJson() {
    const exportData = { songs: songs, clearRecords: clearRecords, scoreRecords: scoreRecords, memoRecords: memoRecords };
    const dataStr = JSON.stringify(exportData, null, 2);
    triggerDownload(dataStr, `popn_data_${currentUser}.json`, 'クリア・スコア・メモを含めて');
}

function downloadSongsJsonOnly() {
    const dataStr = JSON.stringify(songs, null, 2);
    triggerDownload(dataStr, 'songs.json', '楽曲データのみで');
}

function triggerDownload(dataStr, filename, typeMessage) {
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    alert(`「${filename}」として${typeMessage}保存しました。`);
}

async function importFromClipboard() {
    if (!checkAdminAuth()) return;

    try {
        const text = await navigator.clipboard.readText();
        if (!text || text.trim() === '') {
            alert("クリップボードにデータがありません。\nWikiで「魔法のボタン」を押してから実行してください。");
            return;
        }
        const targetLevel = document.getElementById('import-level').value;
        await processImportText(text, targetLevel);
    } catch (err) {
        alert("クリップボードの読み取りが許可されなかったか、失敗しました。\n「手動でペーストして追加する場合はこちら」を開いて、手動で貼り付けてください。");
        console.error(err);
    }
}

async function importDataManual() {
    if (!checkAdminAuth()) return;

    const text = document.getElementById('import-text').value;
    if (!text.trim()) {
        alert("テキストエリアが空です。");
        return;
    }
    const targetLevel = document.getElementById('import-level').value;
    await processImportText(text, targetLevel);
    document.getElementById('import-text').value = '';
}

async function processImportText(text, targetLevel) {
    const lines = text.split('\n');
    let newSongsAdded = 0;
    let songsUpdated = 0;

    lines.forEach(line => {
        let cleanLine = line.replace(/<[^>]*>?/gm, '');
        cleanLine = cleanLine.replace(/\[\[[^\]]*?\|([^\]]*?)\]\]/g, '$1');
        cleanLine = cleanLine.replace(/\[\[(.*?)\]\]/g, '$1');

        let p = cleanLine.replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim());
        if (p.length < 5) return; 

        let notesIndex = -1;
        for (let i = p.length - 1; i >= 2; i--) {
            if (/^\d+$/.test(p[i]) && parseInt(p[i], 10) > 50) {
                notesIndex = i;
                break;
            }
        }

        if (notesIndex === -1) return;

        const notes = parseInt(p[notesIndex], 10);
        const diffRaw = p[notesIndex + 1] || "";

        let bpmIndex = notesIndex - 1;
        if (p[bpmIndex] !== undefined && (p[bpmIndex].includes(':') || p[bpmIndex] === "")) {
            bpmIndex = notesIndex - 2;
        }

        const bpm = p[bpmIndex] || "";
        const title = p[bpmIndex - 1] || "";
        const genre = p[bpmIndex - 2] || "";
        
        const versionRaw = p[0] || "";
        const version = versionRaw.replace(/\[|\]/g, '').trim();

        const parsed = parseDifficulty(diffRaw);
        const diffClass = parsed.diffClass;
        const diffIndex = parsed.diffIndex;

        const id = genre + "_" + title + "_" + notes;
        const existingIndex = songs.findIndex(s => s.id === id);

        if (existingIndex === -1) {
            songs.push({ 
                id, level: targetLevel, version, genre, title, bpm, notes, diffClass, diffIndex, diffRaw, bannerUrl: "", originalOrder: songs.length 
            });
            newSongsAdded++;
        } else {
            let hasChanged = false;
            const song = songs[existingIndex];

            if (song.level !== targetLevel) {
                song.level = targetLevel;
                hasChanged = true;
            }
            
            if (song.diffRaw !== diffRaw || song.diffClass !== diffClass || song.diffIndex !== diffIndex) {
                song.diffRaw = diffRaw;
                song.diffClass = diffClass;
                song.diffIndex = diffIndex;
                hasChanged = true;
            }

            if (hasChanged) {
                songsUpdated++;
            }
        }
    });
    
    currentViewLevel = targetLevel;
    updateDynamicFilters();
    document.getElementById('search-input').value = '';
    renderTable();
    
    alert(`レベル${targetLevel}として、${newSongsAdded}件を新規追加、${songsUpdated}件を更新しました。`);
}

async function updateBannerFromClipboard(id) {
    if (window.innerWidth <= 768) return;

    if (!checkAdminAuth()) return;

    try {
        const text = await navigator.clipboard.readText();
        if (!text || text.trim() === '') {
            alert("クリップボードに画像のURLがありません。\n画像のURLをコピーしてから再度クリックしてください。");
            return;
        }
        const songIndex = songs.findIndex(s => s.id === id);
        if (songIndex === -1) return;

        songs[songIndex].bannerUrl = text.trim();
        renderTable();
    } catch (err) {
        const songIndex = songs.findIndex(s => s.id === id);
        if (songIndex === -1) return;
        const currentUrl = songs[songIndex].bannerUrl || "";
        const newUrl = prompt(`【自動取得ブロック】\nブラウザの設定でクリップボードの自動読み取りがブロックされています。\nここにバナー画像のアドレス（URL）を手動で貼り付けてください:`, currentUrl);
        
        if (newUrl !== null) { 
            songs[songIndex].bannerUrl = newUrl.trim();
            renderTable(); 
        }
    }
}

function handleSearch() { renderTable(); }
function clearSearch() { document.getElementById('search-input').value = ''; renderTable(); }

// ==========================================
// 全体統計（一覧）画像出力機能
// ==========================================
async function generateOverviewImage() {
    const btn = document.getElementById('btn-overview-image');
    const originalText = btn.innerText;
    btn.innerText = "準備中... (ライブラリ読込)";
    await ensureHtml2Canvas();
    btn.innerText = "生成中... (画像読込待機)";

    const exportContainer = document.createElement('div');
    exportContainer.style.position = 'absolute';
    exportContainer.style.left = '-9999px';
    exportContainer.style.top = '0';
    exportContainer.style.backgroundColor = '#fff';
    exportContainer.style.padding = '20px';
    exportContainer.style.width = 'max-content';
    exportContainer.style.fontFamily = 'sans-serif';
    document.body.appendChild(exportContainer);

    const sortedMedalKeys = Object.keys(MEDAL_TYPES)
        .sort((a, b) => MEDAL_TYPES[b].rank - MEDAL_TYPES[a].rank);

    const headerFlex = document.createElement('div');
    headerFlex.style.display = 'flex';
    headerFlex.style.justifyContent = 'space-between';
    headerFlex.style.alignItems = 'flex-start';
    headerFlex.style.marginBottom = '15px';

    const title = document.createElement('h2');
    title.innerText = `全体クリア・メダル状況 (User: ${currentUser})`;
    title.style.margin = '0';
    title.style.color = '#333';
    headerFlex.appendChild(title);

    // 凡例エリア (2行対応)
    const legendContainer = document.createElement('div');
    legendContainer.style.display = 'flex';
    legendContainer.style.flexDirection = 'column';
    legendContainer.style.alignItems = 'flex-end';
    legendContainer.style.gap = '4px';
    legendContainer.style.fontSize = '12px';

    const row1 = document.createElement('div');
    row1.style.display = 'flex';
    row1.style.gap = '8px';

    const row2 = document.createElement('div');
    row2.style.display = 'flex';
    row2.style.gap = '8px';

    let currentRow = row1;

    sortedMedalKeys.forEach(k => {
        const color = MEDAL_COLORS[k] || '#ccc';
        const label = MEDAL_TYPES[k].label;
        
        if (label === '黒星') {
            currentRow = row2;
        }
        
        const legendItem = document.createElement('div');
        legendItem.style.display = 'flex';
        legendItem.style.alignItems = 'center';
        
        const colorBox = document.createElement('span');
        colorBox.style.display = 'inline-block';
        colorBox.style.width = '12px';
        colorBox.style.height = '12px';
        colorBox.style.backgroundColor = color;
        colorBox.style.border = '1px solid #aaa';
        colorBox.style.marginRight = '4px';
        
        const textSpan = document.createElement('span');
        textSpan.innerText = label;
        
        legendItem.appendChild(colorBox);
        legendItem.appendChild(textSpan);
        currentRow.appendChild(legendItem);
    });

    legendContainer.appendChild(row1);
    legendContainer.appendChild(row2);
    headerFlex.appendChild(legendContainer);
    exportContainer.appendChild(headerFlex);

    const targetLevels = ['50', '49', '48', '47', '46'];

    const table = document.createElement('table');
    table.style.borderCollapse = 'collapse';
    table.style.width = '100%';
    table.style.border = '2px solid #333';

    // ★ ここでヘッダーを「クリア数/曲数」に設定 ★
    let theadHtml = `<tr style="background-color: #f2f2f2;">
        <th style="border: 1px solid #ccc; padding: 8px; width: 60px;">Lv</th>
        <th style="border: 1px solid #ccc; padding: 8px; width: 100px; font-size: 0.9em;">クリア数<br>/ 曲数</th>`;
    
    sortedMedalKeys.forEach(k => {
        const m = MEDAL_TYPES[k];
        const isValidUrl = m.imgUrl.startsWith('http') || m.imgUrl.startsWith('data:');
        let iconHtml = `<span style="font-size:12px;">${m.label}</span>`;
        
        if (isValidUrl) {
            let proxyUrl = m.imgUrl;
            if (proxyUrl.startsWith('http') && !proxyUrl.includes('wsrv.nl')) {
                proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(proxyUrl)}`;
            }
            iconHtml = `<img src="${proxyUrl}" crossorigin="anonymous" style="height:32px; width:auto; vertical-align:middle;">`;
        }
        theadHtml += `<th style="border: 1px solid #ccc; padding: 8px; min-width: 50px; text-align: center;">${iconHtml}</th>`;
    });
    theadHtml += `</tr>`;
    table.innerHTML = `<thead>${theadHtml}</thead>`;

    const tbody = document.createElement('tbody');

    targetLevels.forEach(lv => {
        const lvSongs = songs.filter(s => s.level === lv);
        if (lvSongs.length === 0) return;

        let counts = {};
        sortedMedalKeys.forEach(k => counts[k] = 0);
        
        // ★ クリア数をカウントする処理（イージークリアは含まない：ノーマル以上のみ） ★
        let clearedCount = 0;

        lvSongs.forEach(s => {
            const medalKey = clearRecords[s.id] || '';
            if (counts[medalKey] !== undefined) {
                counts[medalKey]++;
            }
            if (MEDAL_TYPES[medalKey] && MEDAL_TYPES[medalKey].isNormalClear) {
                clearedCount++;
            }
        });

        const absTotal = lvSongs.length;

        // ★ 統計行 (縦軸：レベル) の出力処理を変更 ★
        let trStats = `<tr>
            <td style="border: 1px solid #ccc; padding: 8px; font-weight: bold; font-size: 1.4em; text-align: center; background-color: #e3f2fd; color: #0056b3;">${lv}</td>
            <td style="border: 1px solid #ccc; padding: 8px; font-weight: bold; text-align: center; line-height: 1.2;">
                <span style="font-size: 1.2em; color: #d32f2f;">${clearedCount}</span><br>
                <span style="font-size: 0.85em; color: #666;">/ ${absTotal}</span>
            </td>`;
        
        sortedMedalKeys.forEach(k => {
            const count = counts[k];
            const perc = absTotal > 0 ? ((count / absTotal) * 100).toFixed(1) : 0;
            const opacity = count === 0 ? 'opacity: 0.2;' : '';
            trStats += `<td style="border: 1px solid #ccc; padding: 6px; text-align: center; ${opacity}">
                <div style="font-weight: bold; font-size: 1.2em; color: #333;">${count}</div>
                <div style="font-size: 0.85em; color: #666;">${perc}%</div>
            </td>`;
        });
        trStats += `</tr>`;

        // バーグラフ行
        let trBar = `<tr><td colspan="${2 + sortedMedalKeys.length}" style="border: 1px solid #ccc; padding: 6px 10px; background-color: #fafafa;">
            <div style="display: flex; width: 100%; height: 20px; border-radius: 4px; overflow: hidden; background: #eee; box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);">`;
        
        sortedMedalKeys.forEach(k => {
            if (counts[k] > 0) {
                const w = (counts[k] / absTotal) * 100;
                trBar += `<div style="width: ${w}%; background-color: ${MEDAL_COLORS[k] || '#ccc'};" title="${MEDAL_TYPES[k].label}: ${counts[k]}"></div>`;
            }
        });
        trBar += `</div></td></tr>`;

        tbody.innerHTML += trStats + trBar;
    });

    table.appendChild(tbody);
    exportContainer.appendChild(table);

    // 画像の読み込み完了を確実に待機
    const images = Array.from(exportContainer.querySelectorAll('img'));
    await Promise.all(images.map(img => {
        return new Promise(res => {
            if (img.complete) {
                res();
            } else {
                img.onload = res;
                img.onerror = () => { console.warn("Image proxy failed:", img.src); res(); };
            }
        });
    }));

    btn.innerText = "生成中... (描画中)";

    try {
        const canvas = await html2canvas(exportContainer, { backgroundColor: '#fff', scale: 2, useCORS: true });
        const dataUrl = canvas.toDataURL("image/png");
        
        const isMobile = window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isMobile) {
            document.getElementById('generated-image-preview').src = dataUrl;
            document.getElementById('image-result-modal').style.display = 'flex';
        } else {
            const link = document.createElement('a');
            const date = new Date().toISOString().slice(0, 10);
            link.download = `popn_overview_${currentUser}_${date}.png`;
            link.href = dataUrl;
            link.click();
        }
    } catch (e) {
        alert("画像の生成に失敗しました。");
        console.error(e);
    } finally {
        document.body.removeChild(exportContainer);
        btn.innerText = originalText;
    }
}

// ==========================================
// ★ 難易度順画像（指数ごとにバナーとクリアメダルを並べた画像）
// ==========================================
function toImageProxyUrl(url) {
    if (url && url.startsWith('http') && !url.includes('wsrv.nl')) {
        return `https://wsrv.nl/?url=${encodeURIComponent(url)}`;
    }
    return url;
}

function escapeHtmlText(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const DIFF_TABLE_COLORS = {
    '危険': '#212121',
    '別格': '#e53935',
    '詐称': '#f4511e',
    '強': '#fb8c00',
    '中': '#7cb342',
    '弱': '#42a5f5',
    '逆詐称': '#1e88e5',
    '入門': '#26a69a',
    '未定': '#9e9e9e'
};

// 楽曲を「難易度の種類＋指数(小数第1位)」ごとにまとめ、指数の大きい順に並べる
function buildDiffTableGroups(targetSongs) {
    const groupMap = {};
    targetSongs.forEach(song => {
        let cls = song.diffClass || '未分類';
        const idx = song.diffIndex;
        let key, label, sortVal;
        if (cls === '未分類' || idx === null || idx === undefined || isNaN(idx)) {
            cls = '未定';
            key = '未定';
            label = '';
            sortVal = -Infinity;
        } else {
            const r = Math.round(idx * 10) / 10;
            if (r === 0) {
                label = idx < 0 ? '-0' : '+0';
                sortVal = idx < 0 ? -0.0001 : 0;
            } else {
                label = (r > 0 ? '+' : '') + r.toFixed(1);
                sortVal = r;
            }
            key = `${cls}|${label}`;
        }
        if (!groupMap[key]) groupMap[key] = { cls, label, sortVal, songs: [] };
        groupMap[key].songs.push(song);
    });
    const groups = Object.values(groupMap);
    groups.sort((a, b) => b.sortVal - a.sortVal);
    groups.forEach(g => g.songs.sort((a, b) => a.title.localeCompare(b.title, 'ja')));
    return groups;
}

function buildDiffTableMedalHtml(medalKey) {
    const m = MEDAL_TYPES[medalKey];
    const boxStyle = 'width: 34px; height: 34px; flex-shrink: 0; border-radius: 6px; display: flex; align-items: center; justify-content: center; box-sizing: border-box;';
    if (m && m.imgUrl && (m.imgUrl.startsWith('http') || m.imgUrl.startsWith('data:'))) {
        return `<div style="${boxStyle} background: #fff; border: 2px solid #90a4ae;"><img src="${toImageProxyUrl(m.imgUrl)}" crossorigin="anonymous" style="width: 28px; height: 28px; object-fit: contain;"></div>`;
    }
    if (medalKey === '未解禁') {
        return `<div style="${boxStyle} background: #424242; border: 2px solid #212121; color: #fff; font-size: 14px;">🔒</div>`;
    }
    return `<div style="${boxStyle} background: #fff; border: 2px solid #90a4ae;"></div>`;
}

function buildDiffTableBannerHtml(song) {
    const bannerStyle = 'width: 168px; height: 42px; flex-shrink: 0; border-radius: 3px; box-sizing: border-box;';
    if (song.bannerUrl && song.bannerUrl.trim() !== '') {
        return `<img src="${toImageProxyUrl(song.bannerUrl)}" crossorigin="anonymous" style="${bannerStyle} object-fit: cover; display: block; background: #eee;">`;
    }
    return `<div style="${bannerStyle} background: #37474f; color: #fff; font-size: 11px; font-weight: bold; padding: 2px 6px; display: flex; align-items: center; justify-content: center; text-align: center; line-height: 1.15; overflow: hidden;">${escapeHtmlText(song.title)}</div>`;
}

async function generateDiffTableImage() {
    const btn = document.getElementById('btn-diff-image');
    const originalText = btn.innerText;

    const targetSongs = lastDisplaySongs.slice();
    if (targetSongs.length === 0) {
        alert("表示中の楽曲がありません。");
        return;
    }

    btn.innerText = "準備中... (ライブラリ読込)";
    try {
        await ensureHtml2Canvas();
    } catch (e) {
        alert("画像生成ライブラリの読み込みに失敗しました。");
        btn.innerText = originalText;
        return;
    }
    btn.innerText = "生成中... (画像読込待機)";

    const COLS = 5;
    const exportContainer = document.createElement('div');
    exportContainer.style.position = 'absolute';
    exportContainer.style.left = '-9999px';
    exportContainer.style.top = '0';
    exportContainer.style.backgroundColor = '#f5f1e6';
    exportContainer.style.padding = '16px 20px 20px';
    exportContainer.style.width = 'max-content';
    exportContainer.style.fontFamily = 'sans-serif';
    document.body.appendChild(exportContainer);

    // ヘッダー
    const searchInput = document.getElementById('search-input');
    const isSearching = searchInput && searchInput.value.trim() !== '';
    let levelText = currentViewLevel === 'ALL' ? 'ALL' : currentViewLevel;
    if (isSearching) levelText = '検索';
    const now = new Date();
    const dateText = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;

    let html = `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 12px;">
            <div style="background: #fff; border: 3px solid #3949ab; border-radius: 12px; padding: 6px 18px; text-align: center; min-width: 90px;">
                <div style="font-size: 16px; font-weight: bold; color: #3949ab; letter-spacing: 1px;">LEVEL</div>
                <div style="font-size: ${levelText.length > 2 ? 26 : 44}px; font-weight: bold; color: #3949ab; line-height: 1.1;">${escapeHtmlText(levelText)}</div>
            </div>
            <div style="flex: 1; text-align: center; font-size: 28px; font-weight: bold; color: #3949ab;">pop'n music 難易度表</div>
            <div style="text-align: right; color: #555; font-size: 14px; line-height: 1.5;">
                <div>作成日 ${dateText}</div>
                <div style="font-weight: bold;">User: ${escapeHtmlText(currentUser)}</div>
            </div>
        </div>`;

    // メダル集計の帯
    const counts = {};
    targetSongs.forEach(s => {
        const k = clearRecords[s.id] || '';
        counts[k] = (counts[k] || 0) + 1;
    });
    const summaryKeys = Object.keys(MEDAL_TYPES)
        .filter(k => k !== '' && (k !== '未解禁' || counts[k]))
        .sort((a, b) => MEDAL_TYPES[b].rank - MEDAL_TYPES[a].rank);
    html += `<div style="display: flex; justify-content: flex-end; margin-bottom: 14px;">
        <div style="display: flex; align-items: center; gap: 4px; background: #fff; border: 2px solid #90a4ae; border-radius: 8px; padding: 4px 10px;">`;
    summaryKeys.forEach(k => {
        const m = MEDAL_TYPES[k];
        const icon = m.imgUrl && m.imgUrl.startsWith('http')
            ? `<img src="${toImageProxyUrl(m.imgUrl)}" crossorigin="anonymous" style="width: 24px; height: 24px; object-fit: contain;">`
            : `<span style="font-size: 11px; color: #555;">${escapeHtmlText(m.label)}</span>`;
        html += `<div style="display: flex; align-items: center; gap: 4px; padding: 0 6px; border-right: 1px solid #ddd;">
            ${icon}<span style="font-size: 15px; font-weight: bold; color: #333; min-width: 18px; text-align: right;">${counts[k] || 0}</span>
        </div>`;
    });
    html += `<div style="font-size: 15px; font-weight: bold; color: #333; padding-left: 6px;">/ ${targetSongs.length}</div></div></div>`;

    // 難易度ごとの行
    const groups = buildDiffTableGroups(targetSongs);
    html += `<div style="display: flex; flex-direction: column; gap: 8px;">`;
    groups.forEach(g => {
        const color = DIFF_TABLE_COLORS[g.cls] || DIFF_TABLE_COLORS['未定'];
        const labelHtml = g.cls === '未定'
            ? `<div style="font-size: 13px;">未定</div>`
            : `<div style="font-size: 12px;">${escapeHtmlText(g.cls)}</div><div style="font-size: 17px;">${escapeHtmlText(g.label)}</div>`;
        html += `<div style="display: flex; gap: 10px; align-items: stretch;">
            <div style="width: 58px; flex-shrink: 0; background: ${color}; color: #fff; font-weight: bold; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; line-height: 1.2; padding: 4px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.25);">${labelHtml}</div>
            <div style="display: grid; grid-template-columns: repeat(${COLS}, 220px); gap: 8px 12px; align-content: center;">`;
        g.songs.forEach(song => {
            const medalKey = clearRecords[song.id] || '';
            html += `<div style="display: flex; align-items: center; gap: 6px;">
                ${buildDiffTableMedalHtml(medalKey)}${buildDiffTableBannerHtml(song)}
            </div>`;
        });
        html += `</div></div>`;
    });
    html += `</div>`;

    exportContainer.innerHTML = html;

    // 画像の読み込み完了を待機
    const images = Array.from(exportContainer.querySelectorAll('img'));
    await Promise.all(images.map(img => new Promise(res => {
        if (img.complete) {
            res();
        } else {
            img.onload = res;
            img.onerror = () => { console.warn("Image proxy failed:", img.src); res(); };
        }
    })));

    btn.innerText = "生成中... (描画中)";

    try {
        const canvas = await html2canvas(exportContainer, { backgroundColor: '#f5f1e6', scale: 2, useCORS: true });
        const dataUrl = canvas.toDataURL("image/png");

        const isMobile = window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isMobile) {
            document.getElementById('generated-image-preview').src = dataUrl;
            document.getElementById('image-result-modal').style.display = 'flex';
        } else {
            const link = document.createElement('a');
            const date = new Date().toISOString().slice(0, 10);
            link.download = `popn_difftable_${currentUser}_Lv${isSearching ? 'Search' : currentViewLevel}_${date}.png`;
            link.href = dataUrl;
            link.click();
        }
    } catch (e) {
        alert("画像の生成に失敗しました。");
        console.error(e);
    } finally {
        document.body.removeChild(exportContainer);
        btn.innerText = originalText;
    }
}

async function exportAsImage(event) {
    const exportBtn = event.currentTarget; 
    const originalText = exportBtn.innerText;
    
    const activeCheckboxes = Array.from(document.querySelectorAll('.export-col-toggle'));
    const activeIndices = activeCheckboxes.filter(cb => cb.checked).map(cb => parseInt(cb.value));

    if (activeIndices.length === 0) {
        alert("画像に出力する項目を1つ以上選択してください。");
        return;
    }

    exportBtn.innerText = "準備中... (ライブラリ読込)";
    await ensureHtml2Canvas();
    exportBtn.innerText = originalText;

    exportBtn.innerText = "生成中... (画像読込待機)";
    
    const exportContainer = document.createElement('div');
    exportContainer.style.position = 'absolute';
    exportContainer.style.left = '-9999px';
    exportContainer.style.top = '0';
    exportContainer.style.backgroundColor = '#f9f9f9';
    exportContainer.style.padding = '20px';
    exportContainer.style.width = 'max-content';
    exportContainer.style.fontFamily = 'sans-serif';
    document.body.appendChild(exportContainer);

    const userHeader = document.createElement('h2');
    userHeader.style.margin = '0 0 10px 0';
    userHeader.style.color = '#333';
    userHeader.innerText = `User: ${currentUser}`;
    exportContainer.appendChild(userHeader);

    const statsClone = document.getElementById('stats-display').cloneNode(true);
    statsClone.style.marginBottom = '20px';
    statsClone.style.fontSize = '1.3em';
    statsClone.style.padding = '20px'; 

    const statGroups = statsClone.querySelectorAll('.stats-group');
    statGroups.forEach(group => { group.style.gap = '15px'; });
    const statTitles = statsClone.querySelectorAll('.stats-title');
    statTitles.forEach(title => { title.style.fontSize = '1.1em'; });
    const statFractions = statsClone.querySelectorAll('.stats-fraction');
    statFractions.forEach(frac => { frac.style.fontSize = '1.3em'; });
    const statRemains = statsClone.querySelectorAll('.stats-remain');
    statRemains.forEach(rem => { rem.style.fontSize = '0.9em'; });
    
    const khPercs = statsClone.querySelectorAll('.stats-kurohishipercentage');
    khPercs.forEach(perc => { perc.style.fontSize = '2.3em'; });
    const kbPercs = statsClone.querySelectorAll('.stats-kuroboshipercentage');
    kbPercs.forEach(perc => { perc.style.fontSize = '2.3em'; });
    const easyPercs = statsClone.querySelectorAll('.stats-easypercentage');
    easyPercs.forEach(perc => { perc.style.fontSize = '2.3em'; });
    const percs = statsClone.querySelectorAll('.stats-percentage');
    percs.forEach(perc => { perc.style.fontSize = '2.3em'; });
    
    const levelBadges = statsClone.querySelectorAll('.stats-level');
    levelBadges.forEach(badge => {
        badge.style.fontSize = '1.9em';
        badge.style.padding = '10px 25px'; 
    });
    
    const statsImages = Array.from(statsClone.querySelectorAll('img'));
    statsImages.forEach(img => {
        const originalSrc = img.getAttribute('src');
        if (originalSrc && originalSrc.startsWith('http') && !originalSrc.includes('wsrv.nl')) {
            img.setAttribute('crossOrigin', 'anonymous');
            img.src = `https://wsrv.nl/?url=${encodeURIComponent(originalSrc)}`;
        }
    });

    exportContainer.appendChild(statsClone);

    const tablesWrapper = document.createElement('div');
    tablesWrapper.style.display = 'flex';
    tablesWrapper.style.gap = '20px';
    tablesWrapper.style.alignItems = 'flex-start';
    exportContainer.appendChild(tablesWrapper);

    const originalRows = Array.from(document.querySelectorAll('#song-list tr'));
    const chunkSize = 30;

    const colWidths = [8, 10, 10, 5, 5, 12, 20, 6, 6, 13];
    let totalPct = 0;
    activeIndices.forEach(idx => totalPct += colWidths[idx]);
    const totalWidth = totalPct * 10; 

    const colProps = [
        { id: 0, html: `<th style="width: ${colWidths[0]}%; text-align: center; border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">メダル</th>` },
        { id: 1, html: `<th style="width: ${colWidths[1]}%; text-align: center; border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">スコア</th>` },
        { id: 2, html: `<th style="width: ${colWidths[2]}%; text-align: center; border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">比較</th>` },
        { id: 3, html: `<th style="width: ${colWidths[3]}%; text-align: center; border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">Lv</th>` },
        { id: 4, html: `<th style="width: ${colWidths[4]}%; text-align: center; border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">Ver</th>` },
        { id: 5, html: `<th style="width: ${colWidths[5]}%; text-align: center; border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">バナー</th>` },
        { id: 6, html: `<th style="width: ${colWidths[6]}%; border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; text-align: left;">ジャンル / 曲名 (+メモ)</th>` },
        { id: 7, html: `<th style="width: ${colWidths[7]}%; text-align: right; border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">BPM</th>` },
        { id: 8, html: `<th style="width: ${colWidths[8]}%; text-align: right; border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">ノーツ</th>` },
        { id: 9, html: `<th style="width: ${colWidths[9]}%; border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; text-align: center;">難易度 (指数)</th>` }
    ];

    for (let i = 0; i < originalRows.length; i += chunkSize) {
        const chunk = originalRows.slice(i, i + chunkSize);

        const table = document.createElement('table');
        table.style.borderCollapse = 'collapse';
        table.style.backgroundColor = '#fff';
        table.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        table.style.width = `${totalWidth}px`;

        const thead = document.createElement('thead');
        let theadHtml = '<tr>';
        colProps.forEach(prop => {
            if (activeIndices.includes(prop.id)) {
                theadHtml += prop.html;
            }
        });
        theadHtml += '</tr>';
        thead.innerHTML = theadHtml;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        chunk.forEach(row => {
            const clonedRow = row.cloneNode(true);
            if (clonedRow.lastElementChild) { clonedRow.removeChild(clonedRow.lastElementChild); }
            const cells = Array.from(clonedRow.children);
            cells.forEach((cell, index) => {
                cell.style.border = '1px solid #ddd';
                cell.style.padding = '8px';
                cell.style.verticalAlign = 'middle';
                if (index === 0 || index === 5) {
                    const img = cell.querySelector('img');
                    if (img) {
                        const originalSrc = img.getAttribute('src');
                        if (originalSrc && originalSrc.startsWith('http') && !originalSrc.includes('wsrv.nl')) {
                            img.setAttribute('crossOrigin', 'anonymous');
                            img.src = `https://wsrv.nl/?url=${encodeURIComponent(originalSrc)}`;
                        }
                    }
                }
            });

            for (let c = cells.length - 1; c >= 0; c--) {
                if (!activeIndices.includes(c)) {
                    clonedRow.removeChild(cells[c]);
                } else {
                    cells[c].style.display = ''; 
                }
            }
            tbody.appendChild(clonedRow);
        });
        
        table.appendChild(tbody);
        tablesWrapper.appendChild(table);
    }

    const exportImages = Array.from(exportContainer.querySelectorAll('img'));
    await Promise.all(exportImages.map(img => {
        return new Promise(resolve => {
            if (img.complete) {
                resolve();
            } else {
                img.onload = resolve;
                img.onerror = resolve; 
            }
        });
    }));

    exportBtn.innerText = "生成中... (描画中)";

    const searchInput = document.getElementById('search-input');
    const isSearching = searchInput && searchInput.value.trim() !== '';
    const fileNameLevel = isSearching ? 'Search' : currentViewLevel;

    try {
        const canvas = await html2canvas(exportContainer, {
            backgroundColor: "#f9f9f9",
            useCORS: true,
            scale: 2 
        });
        const dataUrl = canvas.toDataURL("image/png");
        
        const isMobile = window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isMobile) {
            document.getElementById('generated-image-preview').src = dataUrl;
            document.getElementById('image-result-modal').style.display = 'flex';
        } else {
            const link = document.createElement('a');
            const date = new Date().toISOString().slice(0,10);
            link.download = `popn_clearrate_${currentUser}_Lv${fileNameLevel}_${date}.png`;
            link.href = dataUrl;
            link.click();
        }
    } catch (err) {
        alert("画像の生成に失敗しました。（一部の画像URLがセキュリティ制限に引っかかっている可能性があります）");
        console.error(err);
    } finally {
        document.body.removeChild(exportContainer);
        exportBtn.innerText = originalText;
    }
}

async function deleteLevelData() {
    if (!checkAdminAuth()) return;

    const targetLevel = document.getElementById('delete-level').value;
    const songsToDelete = songs.filter(s => s.level === targetLevel);
    
    if (songsToDelete.length === 0) {
        alert(`レベル${targetLevel}の楽曲データはありません。`);
        return;
    }

    if(confirm(`【警告】レベル${targetLevel}の楽曲データ（${songsToDelete.length}件）をすべて削除しますか？\n（クリア記録も削除されます。この操作は元に戻せません）`)) {
        const deleteIds = songsToDelete.map(s => s.id);
        songs = songs.filter(s => s.level !== targetLevel);
        
        for(let u in allUsersData) {
            deleteIds.forEach(id => {
                delete allUsersData[u].clearRecords[id];
                if (allUsersData[u].scoreRecords) delete allUsersData[u].scoreRecords[id];
                if (allUsersData[u].memoRecords) delete allUsersData[u].memoRecords[id];
            });
        }
        clearRecords = allUsersData[currentUser].clearRecords;
        scoreRecords = allUsersData[currentUser].scoreRecords;
        memoRecords = allUsersData[currentUser].memoRecords;
        
        updateDynamicFilters();
        renderTable();
        alert(`レベル${targetLevel}の楽曲データと全ユーザーの記録を削除しました。`);
    }
}

function openAddModal() {
    if (!checkAdminAuth()) return;

    document.getElementById('edit-modal-title').innerText = "楽曲データの新規追加";
    document.getElementById('edit-delete-btn').style.display = 'none';

    document.getElementById('edit-original-id').value = "";
    document.getElementById('edit-genre').value = "";
    document.getElementById('edit-title').value = "";
    document.getElementById('edit-level').value = document.getElementById('import-level').value || "48";
    document.getElementById('edit-version').value = "";
    document.getElementById('edit-bpm').value = "";
    document.getElementById('edit-notes').value = "";
    document.getElementById('edit-diff').value = "";
    document.getElementById('edit-wiki-url').value = "";
    document.getElementById('edit-banner-url').value = "";

    document.getElementById('edit-modal').style.display = 'flex';
}

function openEditModal(id) {
    if (!checkAdminAuth()) return;

    const song = songs.find(s => s.id === id);
    if (!song) return;

    document.getElementById('edit-modal-title').innerText = "楽曲データの編集";
    document.getElementById('edit-delete-btn').style.display = '';

    document.getElementById('edit-original-id').value = song.id;
    document.getElementById('edit-genre').value = song.genre;
    document.getElementById('edit-title').value = song.title;
    document.getElementById('edit-level').value = song.level || "";
    document.getElementById('edit-version').value = song.version || "";
    document.getElementById('edit-bpm').value = song.bpm || "";
    document.getElementById('edit-notes').value = song.notes || 0;
    document.getElementById('edit-diff').value = song.diffRaw || "";
    document.getElementById('edit-banner-url').value = song.bannerUrl || "";
    document.getElementById('edit-wiki-url').value = song.wikiUrl || "";

    document.getElementById('edit-modal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
}

async function deleteSong() {
    if (!checkAdminAuth()) return;

    if(confirm("この楽曲をリストから削除しますか？\n（全ユーザーの記録も同時に削除されます）")) {
        const originalId = document.getElementById('edit-original-id').value;
        songs = songs.filter(s => s.id !== originalId);
        
        for(let u in allUsersData) {
            delete allUsersData[u].clearRecords[originalId];
            if (allUsersData[u].scoreRecords) delete allUsersData[u].scoreRecords[originalId];
            if (allUsersData[u].memoRecords) delete allUsersData[u].memoRecords[originalId];
        }
        clearRecords = allUsersData[currentUser].clearRecords;
        scoreRecords = allUsersData[currentUser].scoreRecords;
        memoRecords = allUsersData[currentUser].memoRecords;
        
        updateDynamicFilters();
        renderTable();
        closeEditModal();
    }
}

async function saveEditModal() {
    if (!checkAdminAuth()) return;

    const originalId = document.getElementById('edit-original-id').value;
    const isNew = (originalId === ""); 

    const newGenre = document.getElementById('edit-genre').value.trim();
    const newTitle = document.getElementById('edit-title').value.trim();
    const newNotes = parseInt(document.getElementById('edit-notes').value, 10) || 0;
    
    if (!newGenre && !newTitle) {
        alert("ジャンル名または曲名を入力してください。");
        return;
    }

    const newId = newGenre + "_" + newTitle + "_" + newNotes;
    const newLevel = document.getElementById('edit-level').value.trim();
    const newVersion = document.getElementById('edit-version').value.trim();
    const newBpm = document.getElementById('edit-bpm').value.trim();
    const newBannerUrl = document.getElementById('edit-banner-url').value.trim();
    const newWikiUrl = document.getElementById('edit-wiki-url').value.trim();
    const newDiffRaw = document.getElementById('edit-diff').value.trim();
    const parsed = parseDifficulty(newDiffRaw);

    if (isNew) {
        if (songs.some(s => s.id === newId)) {
            alert("同じジャンル・曲名・ノーツ数の楽曲が既に存在します。");
            return;
        }
        songs.push({
            id: newId,
            genre: newGenre,
            title: newTitle,
            level: newLevel,
            version: newVersion,
            bpm: newBpm,
            notes: newNotes,
            diffRaw: newDiffRaw,
            diffClass: parsed.diffClass,
            diffIndex: parsed.diffIndex,
            bannerUrl: newBannerUrl,
            wikiUrl: newWikiUrl,
            originalOrder: songs.length
        });
        alert("楽曲を新規追加しました！");
    } else {
        const songIndex = songs.findIndex(s => s.id === originalId);
        if (songIndex === -1) return;

        if (newId !== originalId) {
            for(let u in allUsersData) {
                if (allUsersData[u].clearRecords[originalId] !== undefined) {
                    allUsersData[u].clearRecords[newId] = allUsersData[u].clearRecords[originalId];
                    delete allUsersData[u].clearRecords[originalId];
                }
                if (allUsersData[u].scoreRecords && allUsersData[u].scoreRecords[originalId] !== undefined) {
                    allUsersData[u].scoreRecords[newId] = allUsersData[u].scoreRecords[originalId];
                    delete allUsersData[u].scoreRecords[originalId];
                }
                if (allUsersData[u].memoRecords && allUsersData[u].memoRecords[originalId] !== undefined) {
                    allUsersData[u].memoRecords[newId] = allUsersData[u].memoRecords[originalId];
                    delete allUsersData[u].memoRecords[originalId];
                }
            }
            clearRecords = allUsersData[currentUser].clearRecords;
            scoreRecords = allUsersData[currentUser].scoreRecords;
            memoRecords = allUsersData[currentUser].memoRecords;
            songs[songIndex].id = newId;
        }

        songs[songIndex].genre = newGenre;
        songs[songIndex].title = newTitle;
        songs[songIndex].level = newLevel;
        songs[songIndex].version = newVersion;
        songs[songIndex].bpm = newBpm;
        songs[songIndex].notes = newNotes;
        songs[songIndex].bannerUrl = newBannerUrl;
        songs[songIndex].wikiUrl = newWikiUrl;
        songs[songIndex].diffRaw = newDiffRaw;
        songs[songIndex].diffClass = parsed.diffClass;
        songs[songIndex].diffIndex = parsed.diffIndex;
    }

    updateDynamicFilters();
    renderTable();
    closeEditModal();
}

// ★追加：Base64のDataURLをGAS経由でDriveにアップロードし、公開URLを取得する
// 失敗した場合はnullを返す（呼び出し側でBase64のままフォールバックする）
async function uploadImageToCloud(dataUrl, fileNameHint = 'banner') {
    if (!GAS_URL || GAS_URL.trim() === '') return null;
    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({
                type: 'uploadBanner',
                imageData: dataUrl,
                fileName: fileNameHint
            })
        });
        const result = await response.json();
        if (result.status === 'success' && result.url) {
            return result.url;
        }
        console.warn('画像アップロード失敗:', result.message);
        return null;
    } catch (err) {
        console.error('画像アップロード通信エラー:', err);
        return null;
    }
}

function handleBannerFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = async function() {
            const MAX_WIDTH = 250;
            let width = img.width;
            let height = img.height;

            if (width > MAX_WIDTH) {
                height = Math.round(height * (MAX_WIDTH / width));
                width = MAX_WIDTH;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const dataUrl = canvas.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png');

            // ★変更：Base64のまま埋め込まず、クラウドにアップロードしてURL化する
            showLoading(true, '画像をアップロード中...');
            const uploadedUrl = await uploadImageToCloud(dataUrl, 'banner');
            showLoading(false);

            if (uploadedUrl) {
                document.getElementById('edit-banner-url').value = uploadedUrl;
            } else {
                document.getElementById('edit-banner-url').value = dataUrl;
                alert('クラウドへの画像アップロードに失敗したため、一時的にローカル画像（Base64）として保存します。\n通信環境を確認のうえ、後でもう一度アップロードし直すことをおすすめします。');
            }

            event.target.value = '';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

async function clearRecordsOnly() {
    if(confirm(`ユーザー [${currentUser}] のすべての記録（クリア・スコア・メモ）をリセットしますか？\n（楽曲リストは保持されます）`)) {
        allUsersData[currentUser].clearRecords = {};
        allUsersData[currentUser].scoreRecords = {};
        allUsersData[currentUser].memoRecords = {};
        clearRecords = allUsersData[currentUser].clearRecords;
        scoreRecords = allUsersData[currentUser].scoreRecords;
        memoRecords = allUsersData[currentUser].memoRecords;
        scheduleAutoSave();   // ←追加
        renderTable();
    }
}

function changeViewLevel(level) {
    document.getElementById('search-input').value = '';
    currentViewLevel = level;
    updateDynamicFilters();
    renderTable();
}

function sortBy(key) {
    if (currentSort === key) {
        sortDesc = !sortDesc;
    } else {
        currentSort = key;
        sortDesc = (key === 'notes' || key === 'diff' || key === 'bpm' || key === 'level' || key === 'clear' || key === 'score') ? true : false;
    }
    renderTable();
}

function updateSortHeaders() {
    const headers = {
        'clear': 'メダル',
        'score': 'スコア',
        'level': 'Lv',
        'version': 'Ver',
        'title': 'ジャンル / 曲名 <span style="font-size: 0.8em; font-weight: normal; color: #555;">(メモ)</span>',
        'bpm': 'BPM',
        'notes': 'ノーツ',
        'diff': '難易度<span class="sp-br"></span><span class="diff-header-sub">(指数)</span>'
    };
    for (const [key, label] of Object.entries(headers)) {
        const th = document.getElementById(`th-${key}`);
        if (th) {
            if (currentSort === key) {
                th.innerHTML = `${label} <span style="font-size:0.8em; color:#2196F3; margin-left:4px;">${sortDesc ? '▼' : '▲'}</span>`;
            } else {
                th.innerHTML = label;
            }
        }
    }
}

function getDifficultyColor(diffClass, index) {
    let effIndex = index;
    if (index === null || isNaN(index)) {
        if (diffClass === '危険') effIndex = 2.5; 
        else if (diffClass === '別格') effIndex = 2.0;
        else if (diffClass === '強' || diffClass === '詐称') effIndex = 1.0;
        else if (diffClass === '弱' || diffClass === '逆詐称') effIndex = -1.0;
        else if (diffClass === '入門') effIndex = -2.0; 
        else effIndex = 0.0;
    }

    const absIndex = Math.abs(effIndex);
    const alpha = 0.3 + Math.min(1.0, absIndex) * 0.7;

    if (diffClass === '危険') {
        return { 
            color: '#FFD700', 
            shadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000' 
        };
    }
    if (diffClass === '入門') { return { color: `rgba(0, 128, 0, ${alpha})`, shadow: 'none' }; }
    if (diffClass === '別格') { return { color: `rgba(128, 0, 128, ${alpha})`, shadow: 'none' }; }
    if (diffClass === '強' || diffClass === '詐称') { return { color: `rgba(255, 0, 0, ${alpha})`, shadow: 'none' }; }
    if (diffClass === '弱' || diffClass === '逆詐称') { return { color: `rgba(0, 0, 255, ${alpha})`, shadow: 'none' }; }
    
    return { color: `rgba(0, 0, 0, 1.0)`, shadow: 'none' };
}

function getVersionSortValue(ver) {
    if (!ver) return 9999;
    let v = ver.toLowerCase();
    if (!isNaN(v)) return parseInt(v, 10);
    const acOrder = { 'sp': 21, 'lt': 22, 'écl': 23, 'うさ': 24, 'pe': 25, '解': 26, 'ul': 27, 'jf': 28 };
    if (acOrder[v] !== undefined) return acOrder[v];
    if (v.startsWith('cs')) return 100 + parseInt(v.replace('cs', ''), 10) || 199;
    if (v.startsWith('pmp')) return 200 + parseInt(v.replace('pmp', ''), 10) || 299;
    if (v === 'ee') return 300;
    if (v === 'hc') return 400;
    return 999; 
}

function getTitleSortCategory(title) {
    // 曲名の先頭文字から並び替えカテゴリを判定する
    // 0: 数字, 1: 英単語（英字）, 2: 日本語・その他
    const ch = (title || "").charAt(0);
    if (/[0-9]/.test(ch)) return 0;
    if (/[a-zA-Z]/.test(ch)) return 1;
    return 2;
}

function getBpmSortValue(bpmStr) {
    if (!bpmStr || bpmStr === '-') return 0;
    const matches = bpmStr.match(/\d+/g);
    if (matches) { return Math.max(...matches.map(Number)); }
    return 0;
}

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

function getScoreRankInfo(score, isCleared) {
    if (score === undefined || score === null || score === '') return { rank: '', isImage: false, color: '#999' };
    const s = parseInt(score, 10);
    if (isNaN(s)) return { rank: '', isImage: false, color: '#999' };

    let rankKey = 'E';
    if (s >= 99000 && isCleared) rankKey = 'S+';
    else if (s >= 98000 && isCleared) rankKey = 'S';
    else if (s >= 95000 && isCleared) rankKey = 'AAA';
    else if (s >= 93000 && isCleared) rankKey = 'AA+';
    else if (s >= 90000 && isCleared) rankKey = 'AA';
    else if (s >= 86000 && isCleared) rankKey = 'A+';
    else if (s >= 82000) rankKey = 'A';
    else if (s >= 77000) rankKey = 'B+';
    else if (s >= 72000) rankKey = 'B';
    else if (s >= 62000) rankKey = 'C';
    else if (s >= 50000) rankKey = 'D';

    return { 
        rank: rankKey, 
        isImage: true, 
        imgUrl: RANK_IMAGES[rankKey] 
    };
}

function handleScoreToggle() {
    const showScore = document.getElementById('show-score-col').checked;
    if (showScore) {
        currentSort = 'score';
        sortDesc = true; 
    }
    renderTable();
}

function renderTable() {
    const searchInput = document.getElementById('search-input');
    const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : "";

    const filterClear = document.getElementById('filter-clear') ? document.getElementById('filter-clear').value : 'ALL';
    const filterMedal = document.getElementById('filter-medal') ? document.getElementById('filter-medal').value : 'ALL';
    const filterVersion = document.getElementById('filter-version') ? document.getElementById('filter-version').value : 'ALL';
    const filterDiff = document.getElementById('filter-diff') ? document.getElementById('filter-diff').value : 'ALL';
    const filterAffinity = document.getElementById('filter-affinity') ? document.getElementById('filter-affinity').value : 'ALL';

    const showUnreleased = document.getElementById('show-unreleased') ? document.getElementById('show-unreleased').checked : false;
    
    const showScore = document.getElementById('show-score-col').checked;
    const showCompare = document.getElementById('enable-compare').checked;
    
    document.getElementById('th-score').style.display = showScore ? '' : 'none';
    document.getElementById('th-compare').style.display = showCompare ? '' : 'none';

    const table = document.getElementById('song-table');
    if (showScore || showCompare) {
        table.classList.add('mobile-hide-diff');
    } else {
        table.classList.remove('mobile-hide-diff');
    }
    if (showScore) table.classList.add('has-score'); else table.classList.remove('has-score');
    if (showCompare) table.classList.add('has-compare'); else table.classList.remove('has-compare');

    // 1. 統計の計算に使うベース楽曲（レベル・検索キーワードのみ適用）
    let baseSongs = songs.filter(s => {
        if (currentViewLevel !== 'ALL' && s.level !== currentViewLevel) return false;
        if (searchQuery && !(s.genre.toLowerCase().includes(searchQuery) || s.title.toLowerCase().includes(searchQuery))) return false;
        return true;
    });

    // 2. 実際にテーブルに表示する楽曲（すべての絞り込みを適用）
    let displaySongs = baseSongs.filter(s => {
        const medalKey = clearRecords[s.id] || '';
        const medalInfo = MEDAL_TYPES[medalKey];

        if (filterClear === 'uncleared' && medalInfo && medalInfo.isEasyClear) return false;
        if (filterClear === 'kurohishi_cleared' && (!medalInfo || !medalInfo.isKuroHishiClear)) return false;
        if (filterClear === 'kuroboshi_cleared' && (!medalInfo || !medalInfo.isKuroBoshiClear)) return false;
        if (filterClear === 'cleared' && (!medalInfo || !medalInfo.isEasyClear)) return false;
        if (filterClear === 'normal_cleared' && (!medalInfo || !medalInfo.isNormalClear)) return false;

        if (filterMedal !== 'ALL') {
            if (filterMedal === 'unplayed' && medalKey !== '') return false;
            if (filterMedal !== 'unplayed' && medalKey !== filterMedal) return false;
        }
        if (filterVersion !== 'ALL' && s.version !== filterVersion) return false;

        if (filterDiff !== 'ALL') {
            let dClass = s.diffClass || '未分類';
            if (dClass === '中') {
                dClass = (s.diffIndex !== null && s.diffIndex < 0) ? '中(-)' : '中(+)';
            }
            if (filterDiff === '中(全体)') {
                if (!dClass.startsWith('中')) return false;
            } else {
                if (dClass !== filterDiff) return false;
            }
        }

        if (filterAffinity !== 'ALL') {
            const memo = memoRecords[s.id] || {};
            const aff = memo.affinity || '';
            if (filterAffinity === '未設定') {
                if (aff !== '') return false;
            } else {
                if (aff !== filterAffinity) return false;
            }
        }
        return true;
    });
    if (currentSort === 'clear') {
        displaySongs.sort((a, b) => {
            let valA = MEDAL_TYPES[clearRecords[a.id] || ''].rank;
            let valB = MEDAL_TYPES[clearRecords[b.id] || ''].rank;
            if (valA === valB) return a.originalOrder - b.originalOrder;
            return sortDesc ? valB - valA : valA - valB;
        });
    } else if (currentSort === 'title') {
        displaySongs.sort((a, b) => {
            let titleA = a.title || "";
            let titleB = b.title || "";
            let catA = getTitleSortCategory(titleA);
            let catB = getTitleSortCategory(titleB);
            // まず「数字→英単語→日本語」の順でカテゴリ分けし、
            // 同じカテゴリ内では従来通り文字列で比較する
            if (catA !== catB) {
                return sortDesc ? catB - catA : catA - catB;
            }
            let valA = titleA.toLowerCase();
            let valB = titleB.toLowerCase();
            if (valA === valB) return a.originalOrder - b.originalOrder;
            if (valA < valB) return sortDesc ? 1 : -1;
            if (valA > valB) return sortDesc ? -1 : 1;
            return 0;
        });
    } else if (currentSort === 'notes') {
        displaySongs.sort((a, b) => sortDesc ? b.notes - a.notes : a.notes - b.notes);
    } else if (currentSort === 'diff') {
        displaySongs.sort((a, b) => {
            const getVal = (song) => {
                if (song.diffIndex !== null && !isNaN(song.diffIndex)) return parseFloat(song.diffIndex);
                if (song.diffClass === '危険') return 2.5; 
                if (song.diffClass === '別格') return 2.0;
                if (song.diffClass === '詐称') return 1.5;
                if (song.diffClass === '強') return 1.0;
                if (song.diffClass === '中') return 0.0;
                if (song.diffClass === '弱') return -1.0;
                if (song.diffClass === '逆詐称') return -1.5;
                if (song.diffClass === '入門') return -2.0; 
                return -999;
            };
            let valA = getVal(a);
            let valB = getVal(b);
            if (valA === valB) return a.originalOrder - b.originalOrder;
            return sortDesc ? valB - valA : valA - valB;
        });
    } else if (currentSort === 'bpm') {
        displaySongs.sort((a, b) => {
            let valA = getBpmSortValue(a.bpm);
            let valB = getBpmSortValue(b.bpm);
            return sortDesc ? valB - valA : valA - valB;
        });
    } else if (currentSort === 'version') {
        displaySongs.sort((a, b) => {
            let valA = getVersionSortValue(a.version);
            let valB = getVersionSortValue(b.version);
            if (valA === valB) return a.originalOrder - b.originalOrder;
            return sortDesc ? valB - valA : valA - valB;
        });
    } else if (currentSort === 'level') {
        displaySongs.sort((a, b) => {
            let valA = parseInt(a.level, 10) || 0;
            let valB = parseInt(b.level, 10) || 0;
            if (valA === valB) return a.originalOrder - b.originalOrder;
            return sortDesc ? valB - valA : valA - valB;
        });
    } else if (currentSort === 'score') {
        displaySongs.sort((a, b) => {
            let valA = parseInt(scoreRecords[a.id]) || -1;
            let valB = parseInt(scoreRecords[b.id]) || -1;
            if (valA === valB) return a.originalOrder - b.originalOrder;
            return sortDesc ? valB - valA : valA - valB;
        });
    }

    const tbody = document.getElementById('song-list');
    tbody.innerHTML = '';

    let kuroHishiClearCount = 0;
    let kuroBoshiClearCount = 0;
    let easyClearCount = 0; 
    let normalClearCount = 0; 
    let rateTotal = 0; 
    
    let medalCounts = {};
    Object.keys(MEDAL_TYPES).forEach(k => {
        medalCounts[k] = 0;
    });

    let diffStats = {
        '危険': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '別格': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '詐称': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '強': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '中(+)': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '中(-)': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '弱': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '逆詐称': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '入門': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '未分類': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 }
    };

    const isMobile = window.innerWidth <= 768;

    // ★ 統計の計算は「絞り込み前」の baseSongs で行う
    baseSongs.forEach(song => {
        const medalKey = clearRecords[song.id] || '';
        const medalInfo = MEDAL_TYPES[medalKey];
        
        medalCounts[medalKey]++;
        
        let dClass = song.diffClass || '未分類';
        if (dClass === '中') {
            if (song.diffIndex !== null && song.diffIndex < 0) { dClass = '中(-)'; } else { dClass = '中(+)'; }
        }
        
        if (!diffStats[dClass]) dClass = '未分類';
        
        if (medalInfo.excludeFromRate && !showUnreleased) {
            // 除外
        } else {
            rateTotal++;
            diffStats[dClass].total++;
            
            if (medalInfo.isKuroHishiClear) {
                kuroHishiClearCount++;
                diffStats[dClass].kuroHishi++;
            }
            if (medalInfo.isKuroBoshiClear) {
                kuroBoshiClearCount++;
                diffStats[dClass].kuroBoshi++;
            }
            if (medalInfo.isEasyClear) {
                easyClearCount++;
                diffStats[dClass].easy++;
            }
            if (medalInfo.isNormalClear) {
                normalClearCount++;
                diffStats[dClass].normal++;
            }
        }
    });

    // ★ テーブルの描画は「絞り込み後」の displaySongs で行う
    displaySongs.forEach(song => {
        const medalKey = clearRecords[song.id] || '';
        const medalInfo = MEDAL_TYPES[medalKey];

        const tr = document.createElement('tr');
        if (song.notes >= 1537) tr.classList.add('spicy-gauge');
        if (medalInfo.isEasyClear) tr.classList.add('cleared-row');

        const styleObj = getDifficultyColor(song.diffClass, song.diffIndex);
        let dClassStr = song.diffClass || '';
        let dIndexStr = song.diffRaw.replace(dClassStr, '').trim();
        if (!song.diffRaw.includes(dClassStr)) { dClassStr = song.diffRaw; dIndexStr = ''; }
        
        const diffHtml = `
            <div class="diff-wrapper" style="color: ${styleObj.color}; text-shadow: ${styleObj.shadow}; font-weight: bold;">
                <span class="diff-main">${dClassStr}</span><span class="diff-sub">${dIndexStr}</span>
            </div>
        `;
        
        const safeId = song.id.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;");

        const isValidMedalUrl = medalInfo.imgUrl.startsWith('http') || medalInfo.imgUrl.startsWith('data:');
        const medalDisplayHtml = isValidMedalUrl
            ? `<img src="${medalInfo.imgUrl}" loading="lazy" style="width: 32px; height: 32px; object-fit: contain; cursor: pointer; display: block; margin: 0 auto;" onclick="openMedalModal('${safeId}')" title="${medalInfo.label}">`
            : `<div onclick="openMedalModal('${safeId}')" style="cursor: pointer; font-weight: bold; padding: 4px; border: 1px solid #ccc; border-radius: 4px; background: #fff; font-size: 0.8em; color: #555; white-space: nowrap;" title="クリックして変更">${medalInfo.label}</div>`;

        const bannerAction = isMobile ? '' : `onclick="updateBannerFromClipboard('${safeId}')"`;
        const cursorStyle = isMobile ? 'default' : 'pointer';
        const bannerTitle = isMobile ? '' : 'title="クリックしてコピーしたURLで上書き"';
        const noImageTitle = isMobile ? '' : 'title="クリックしてコピーしたURLを自動ペースト"';
        const noImageDeco = isMobile ? 'none' : 'underline';

        const bannerHtml = song.bannerUrl && song.bannerUrl.trim() !== ''
            ? `<img src="${song.bannerUrl}" style="max-width: 100%; height: auto; max-height: 50px; border-radius: 4px; cursor: ${cursorStyle};" ${bannerAction} ${bannerTitle} onerror="this.style.display='none'" />`
            : `<span style="color: #aaa; font-size: 0.85em; font-weight: bold; text-decoration: ${noImageDeco}; cursor: ${cursorStyle};" ${bannerAction} ${noImageTitle}>No Image</span>`;

        const myScore = scoreRecords[song.id];
        const isCleared = medalInfo && medalInfo.isEasyClear;
        const rankInfo = getScoreRankInfo(myScore, isCleared);

        let scoreDisplayHtml = `<div style="color: #ccc; font-size: 0.8em; font-weight: normal;">未登録</div>`;
        if (myScore !== undefined && myScore !== '') {
            const rankMark = rankInfo.isImage 
                ? `<img src="${rankInfo.imgUrl}" alt="${rankInfo.rank}" style="height: 40px; width: auto; vertical-align: middle; margin-top: 2px;">` 
                : `<div style="font-weight: bold; font-size: 0.9em; color: ${rankInfo.color};">${rankInfo.rank}</div>`;
            
            scoreDisplayHtml = `
                <div style="font-weight: bold; font-size: 1.1em; color: #333;">${myScore}</div>
                ${rankMark}
            `;
        }

        let compareHtml = '';
        if (showCompare) {
            const targetUser = document.getElementById('compare-user-select').value;
            let targetScore = undefined;
            if (targetUser && allUsersData[targetUser] && allUsersData[targetUser].scoreRecords) {
                targetScore = allUsersData[targetUser].scoreRecords[song.id];
            }
            
            if (!targetUser) {
                compareHtml = `<div style="color: #ccc; font-size: 0.7em;">ユーザーを選択</div>`;
            } else if (targetScore === undefined || targetScore === '') {
                compareHtml = `<div style="color: #ccc; font-size: 0.8em;">未登録</div>`;
            } else {
                const tMedal = allUsersData[targetUser].clearRecords[song.id];
                const tIsCleared = tMedal ? MEDAL_TYPES[tMedal].isEasyClear : false;
                const tRankInfo = getScoreRankInfo(targetScore, tIsCleared);
                
                const tRankMark = tRankInfo.isImage 
                    ? `<img src="${tRankInfo.imgUrl}" alt="${tRankInfo.rank}" style="height: 40px; width: auto; vertical-align: middle; margin-top: 1px;">` 
                    : `<div style="font-size: 0.8em; color: ${tRankInfo.color}; font-weight: bold;">${tRankInfo.rank}</div>`;

                let diff = '';
                if (myScore !== undefined && myScore !== '') {
                    const d = parseInt(myScore, 10) - parseInt(targetScore, 10);
                    if (d > 0) diff = `<span style="color: #2cbc21; font-weight: bold; font-size: 0.85em;">(+${d})</span>`;
                    else if (d < 0) diff = `<span style="color: #d32f2f; font-weight: bold; font-size: 0.85em;">(${d})</span>`;
                    else diff = `<span style="color: #999; font-weight: bold; font-size: 0.85em;">(±0)</span>`;
                }
                
                compareHtml = `
                    <div style="font-size: 0.95em; color: #555; font-weight: bold;">${targetScore}</div>
                    ${tRankMark}
                    <div style="margin-top: 2px;">${diff}</div>
                `;
            }
        }

        const scoreDisplay = showScore ? '' : 'display: none;';
        const compareDisplay = showCompare ? '' : 'display: none;';

        const searchKey = (song.genre && song.genre.trim() !== '') ? song.genre : song.title;
        const autoWikiUrl = `https://popn.wiki/search?q=${encodeURIComponent(searchKey)}`;
        const finalWikiUrl = (song.wikiUrl && song.wikiUrl !== '') ? song.wikiUrl : autoWikiUrl;

        const memo = memoRecords[song.id] || {};
        const hasMemo = memo.comment || memo.sudden || memo.affinity;
        let tooltipLines = [];
        if (memo.affinity) tooltipLines.push(`相性: ${memo.affinity}`);
        if (memo.sudden) tooltipLines.push(`SUDDEN+: ${memo.sudden}`);
        if (memo.comment) tooltipLines.push(`コメント:\n${memo.comment}`);
        const memoTooltip = tooltipLines.length > 0 ? tooltipLines.join('\n') : 'メモを追加・編集';

        let affinityBadge = '';
        if (memo.affinity) {
            affinityBadge = `<span class="memo-badge-${memo.affinity}" style="font-size: 0.8em; margin-left: 2px;">[${memo.affinity.substring(0, 2)}]</span>`;
        }

        tr.innerHTML = `
            <td class="col-medal" style="text-align: center; vertical-align: middle;">${medalDisplayHtml}</td>
            <td class="col-score" style="text-align: center; cursor: pointer; background-color: #fafafa; ${scoreDisplay}" onclick="openScoreModal('${safeId}')" title="クリックしてスコア入力">${scoreDisplayHtml}</td>
            <td class="col-compare" style="text-align: center; background-color: #f0f8ff; ${compareDisplay}">${compareHtml}</td>
            <td class="col-level" style="text-align: center;"><span class="level-badge">${song.level || '-'}</span></td>
            <td class="col-version" style="text-align: center;"><span class="ver-badge">${song.version || '-'}</span></td>
            <td class="col-banner" style="text-align: center; transition: background-color 0.2s;" ondragover="event.preventDefault(); this.style.backgroundColor='#e3f2fd';" ondragleave="event.preventDefault(); this.style.backgroundColor='';" ondrop="handleSingleBannerDrop(event, '${safeId}', this)">${bannerHtml}</td>
            <td class="col-title">
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 0.85em; color: #666; display: flex; align-items: center; flex-wrap: wrap;">
                        <span>${song.genre}</span>
                        <span onclick="openMemoModal('${safeId}')" style="cursor: pointer; font-size: 1.2em; margin-left: 4px; padding: 2px; ${hasMemo ? '' : 'opacity: 0.4;'}" title="${memoTooltip}">
                            📝${affinityBadge}
                        </span>
                    </div>
                    <div style="font-weight: bold; word-break: break-all; margin-top: 2px;">
                        <a href="${finalWikiUrl}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">
                            ${song.title} <span style="font-size: 0.8em; color: #2196F3;">🔗</span>
                        </a>
                    </div>
                </div>
            </td>
            <td class="col-bpm" style="text-align: right;"><span>${song.bpm || '-'}</span></td>
            <td class="col-notes" style="text-align: right;"><span>${song.notes}</span></td>
            <td class="col-diff" style="text-align: center;">${diffHtml}</td>
            <td class="col-action no-export" style="text-align: center;">
                <button class="edit-btn" onclick="openEditModal('${safeId}')">✏️編集</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    lastDisplaySongs = displaySongs;
    updateSortHeaders();

    const kuroHishiPerc = formatRate(kuroHishiClearCount, rateTotal);
    const kuroBoshiPerc = formatRate(kuroBoshiClearCount, rateTotal);
    const easyPerc = formatRate(easyClearCount, rateTotal);
    const normalPerc = formatRate(normalClearCount, rateTotal);
    
    const kuroHishiRemain = rateTotal - kuroHishiClearCount;
    const kuroBoshiRemain = rateTotal - kuroBoshiClearCount;
    const easyRemain = rateTotal - easyClearCount;
    const normalRemain = rateTotal - normalClearCount;

    let levelLabel = currentViewLevel === 'ALL' ? '全体' : `Lv${currentViewLevel}`;
    if (searchQuery) levelLabel = `検索結果 ("${searchQuery}")`;
    if (filterClear !== 'ALL' || filterMedal !== 'ALL' || filterVersion !== 'ALL' || filterDiff !== 'ALL' || filterAffinity !== 'ALL') {
        levelLabel += ' (絞り込み中)';
    }
    
    const showKuroHishiRate = document.getElementById('show-kurohishi-rate') ? document.getElementById('show-kurohishi-rate').checked : false;
    const showKuroBoshiRate = document.getElementById('show-kuroboshi-rate') ? document.getElementById('show-kuroboshi-rate').checked : false;
    const showEasyRate = document.getElementById('show-easy-rate') ? document.getElementById('show-easy-rate').checked : false;
    const showNormalRate = document.getElementById('show-normal-rate') ? document.getElementById('show-normal-rate').checked : true;
    const showMedalStats = document.getElementById('show-medal-stats') ? document.getElementById('show-medal-stats').checked : false;
    const showDiffStats = document.getElementById('show-diff-stats') ? document.getElementById('show-diff-stats').checked : false;

    let statsHtml = `<div style="display: flex; flex-wrap: wrap; gap: 15px; width: 100%; justify-content: flex-end; align-items: baseline;">
        <div class="stats-level">【${levelLabel}】</div>`;

    if (showKuroHishiRate) {
        statsHtml += `
            <div class="stats-group">
                <span class="stats-title">黒菱クリア以上:</span>
                <span class="stats-fraction">${kuroHishiClearCount} / ${rateTotal} <span class="stats-remain">(未クリア: ${kuroHishiRemain})</span></span>
                <span class="stats-kurohishipercentage rate-toggle" onclick="toggleRateFormat()" title="タップで表示形式を切替 (小数点1桁 / 有効数字2桁)">${kuroHishiPerc}%</span>
            </div>`;
    }
    if (showKuroBoshiRate) {
        statsHtml += `
            <div class="stats-group">
                <span class="stats-title">黒星クリア以上:</span>
                <span class="stats-fraction">${kuroBoshiClearCount} / ${rateTotal} <span class="stats-remain">(未クリア: ${kuroBoshiRemain})</span></span>
                <span class="stats-kuroboshipercentage rate-toggle" onclick="toggleRateFormat()" title="タップで表示形式を切替 (小数点1桁 / 有効数字2桁)">${kuroBoshiPerc}%</span>
            </div>`;
    }
    if (showEasyRate) {
        statsHtml += `
            <div class="stats-group">
                <span class="stats-title">イージークリア以上:</span>
                <span class="stats-fraction">${easyClearCount} / ${rateTotal} <span class="stats-remain">(未クリア: ${easyRemain})</span></span>
                <span class="stats-easypercentage rate-toggle" onclick="toggleRateFormat()" title="タップで表示形式を切替 (小数点1桁 / 有効数字2桁)">${easyPerc}%</span>
            </div>`;
    }
    if (showNormalRate) {
        statsHtml += `
            <div class="stats-group">
                <span class="stats-title">ノーマルクリア以上:</span>
                <span class="stats-fraction">${normalClearCount} / ${rateTotal} <span class="stats-remain">(未クリア: ${normalRemain})</span></span>
                <span class="stats-percentage rate-toggle" onclick="toggleRateFormat()" title="タップで表示形式を切替 (小数点1桁 / 有効数字2桁)">${normalPerc}%</span>
            </div>`;
    }
    statsHtml += `</div>`;

    let extendedStatsHtml = '';

    if (showMedalStats || showDiffStats) {
        extendedStatsHtml += `<div style="width: 100%; padding: 15px; background: #f1f8ff; border-radius: 6px; border: 1px solid #e3f2fd; box-sizing: border-box;">`;
        
        if (showMedalStats) {
            let chartData = [];
            let totalForChart = 0;
            
            const sortedMedalKeys = Object.keys(MEDAL_TYPES).sort((a, b) => MEDAL_TYPES[b].rank - MEDAL_TYPES[a].rank);

            sortedMedalKeys.forEach(k => {
                const m = MEDAL_TYPES[k];
                const count = medalCounts[k];
                
                if (m.excludeFromRate && !showUnreleased) return; 
                
                if (count > 0) {
                    chartData.push({ key: k, label: m.label, count: count, color: MEDAL_COLORS[k] || '#ccc', rank: m.rank });
                    totalForChart += count;
                }
            });

            let legendHtml = '';
            chartData.forEach(d => {
                let perc = totalForChart === 0 ? 0 : (d.count / totalForChart) * 100;
                let safeLabel = d.label.replace('🔒', '');
                legendHtml += `
                    <div style="display: flex; align-items: center; font-size: 0.85em; white-space: nowrap;">
                        <span style="display: inline-block; width: 12px; height: 12px; background: ${d.color}; border: 1px solid #aaa; margin-right: 4px; border-radius: 2px;"></span>
                        <span style="color: #333;">${safeLabel}: <span style="font-weight:bold;">${perc.toFixed(1)}%</span></span>
                    </div>
                `;
            });

            const pieChartUrl = generatePieChartBase64(chartData, 200);

            extendedStatsHtml += `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <div style="font-weight: bold; color: #555; font-size: 0.9em;">🏅 メダル別内訳</div>
                    ${filterMedal !== 'ALL' ? `<button onclick="setMedalFilter('ALL')" style="padding: 4px 10px; font-size: 0.85em; cursor: pointer; border: 1px solid #ffcdd2; background: #ffebee; color: #d32f2f; border-radius: 4px; font-weight: bold; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">✖ メダル絞り込み解除</button>` : ''}
                </div>
                
                <div style="display: flex; flex-wrap: wrap; gap: 15px; align-items: center; margin-bottom: 15px; padding: 15px; background: #fff; border-radius: 6px; border: 1px solid #e0e0e0; box-shadow: 0 1px 2px rgba(0,0,0,0.05); flex-shrink: 0;" alt="円グラフ">
                    <img src="${pieChartUrl}" style="width: 120px; height: 120px; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.1); flex-shrink: 0;" alt="円グラフ">
                    <div style="flex: 1; display: flex; flex-wrap: wrap; gap: 8px 12px; align-content: center;">
                        ${legendHtml}
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(55px, 1fr)); gap: 6px; margin-bottom: ${showDiffStats ? '15px' : '0'};">
            `;
            sortedMedalKeys.forEach(k => {
                const m = MEDAL_TYPES[k];
                const count = medalCounts[k];
                const isValidMedalUrl = m.imgUrl.startsWith('http') || m.imgUrl.startsWith('data:');
                const iconHtml = isValidMedalUrl 
                    ? `<img src="${m.imgUrl}" style="width: 26px; height: 26px; object-fit: contain; margin-bottom: 2px;">` 
                    : `<div style="font-weight: bold; color: #555; font-size: 0.7em;">${m.label}</div>`;

                // 未プレイ(空文字)の処理に対応
                const filterKey = k === '' ? 'unplayed' : k;

                extendedStatsHtml += `
                    <div onclick="setMedalFilter('${filterKey}')" title="クリックしてこのメダルで絞り込む" style="cursor: pointer; background: #fff; padding: 6px 2px; border-radius: 4px; border: 1px solid #ddd; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: 0.2s;" onmouseover="this.style.background='#f0f8ff'; this.style.borderColor='#2196F3'" onmouseout="this.style.background='#fff'; this.style.borderColor='#ddd'">
                    ${iconHtml}
                    <span style="color: #333; font-weight: bold; font-size: 1.1em; line-height: 1;">${count}</span>
                    </div>
                `;
            });
            extendedStatsHtml += `</div>`;
        }

        if (showDiffStats) {
            extendedStatsHtml += `
                <div style="font-weight: bold; color: #555; margin-bottom: 6px; font-size: 0.9em; ${showMedalStats ? 'border-top: 1px dashed #ccc; padding-top: 10px;' : ''}">🎯 難易度（指数）別クリア率</div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px;">
            `;
            const diffOrder = ['危険', '別格', '詐称', '強', '中(+)', '中(-)', '弱', '逆詐称', '入門', '未分類'];
            diffOrder.forEach(dKey => {
                const stat = diffStats[dKey];
                if (stat.total === 0) return; 
                
                const khPerc = formatRate(stat.kuroHishi, stat.total);
                const kbPerc = formatRate(stat.kuroBoshi, stat.total);
                const ePerc = formatRate(stat.easy, stat.total);
                const nPerc = formatRate(stat.normal, stat.total);
                
                let baseClass = dKey.startsWith('中') ? '中' : dKey;
                let baseIndex = dKey === '中(+)' ? 0.5 : (dKey === '中(-)' ? -0.5 : 0);
                
                const styleObj = getDifficultyColor(baseClass, baseIndex);
                let borderColor = styleObj.color.replace('0.3', '0.8').replace('1.0', '0.8');
                if (dKey === '危険') borderColor = '#333';
                
                extendedStatsHtml += `
                    <div style="background: #fff; padding: 8px; border-radius: 4px; border: 1px solid #ddd; border-left: 4px solid ${borderColor}; box-shadow: 0 1px 2px rgba(0,0,0,0.05); font-size: 0.85em;">
                        <div style="display: flex; justify-content: space-between; border-bottom: 1px dotted #eee; padding-bottom: 4px; margin-bottom: 4px;">
                            <span style="font-weight: bold; color: ${dKey === '危険' ? '#FFD700' : '#333'}; text-shadow: ${dKey === '危険' ? styleObj.shadow : 'none'};">${dKey}</span>
                            <span style="color: #666;">対象${stat.total}曲</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                            <span style="color: #1a237e; font-weight: bold;">黒菱以上 <span style="color: #333;">${stat.kuroHishi}/${stat.total}</span></span>
                            <span class="rate-toggle" onclick="toggleRateFormat()" title="タップで表示形式を切替" style="color: #666;">${khPerc}%</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                            <span style="color: #000051; font-weight: bold;">黒星以上 <span style="color: #333;">${stat.kuroBoshi}/${stat.total}</span></span>
                            <span class="rate-toggle" onclick="toggleRateFormat()" title="タップで表示形式を切替" style="color: #666;">${kbPerc}%</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                            <span style="color: #2cbc21; font-weight: bold;">イージー以上 <span style="color: #333;">${stat.easy}/${stat.total}</span></span>
                            <span class="rate-toggle" onclick="toggleRateFormat()" title="タップで表示形式を切替" style="color: #666;">${ePerc}%</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #d32f2f; font-weight: bold;">ノーマル以上 <span style="color: #333;">${stat.normal}/${stat.total}</span></span>
                            <span class="rate-toggle" onclick="toggleRateFormat()" title="タップで表示形式を切替" style="color: #666;">${nPerc}%</span>
                        </div>
                    </div>
                `;
            });
            extendedStatsHtml += `</div>`;
        }
        extendedStatsHtml += `</div>`;
    }
    
    document.getElementById('stats-display').innerHTML = statsHtml;
    document.getElementById('extended-stats-display').innerHTML = extendedStatsHtml;
}

// ==========================================
// ★ バナー画像の一括ドロップ（ドラッグ＆ドロップ）機能
// ==========================================
const dropZone = document.getElementById('banner-drop-zone');

if (dropZone) {
    // ドラッグ中の見た目変更
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = '#e3f2fd';
        dropZone.style.borderColor = '#2196F3';
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = '#fdfdfd';
        dropZone.style.borderColor = '#999';
    });

    // ドロップ時の処理
    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = '#fdfdfd';
        dropZone.style.borderColor = '#999';

        const files = e.dataTransfer.files;
        if (!files || files.length === 0) return;

        // ★ 管理者パスワードの確認（キャンセル・失敗時は処理ストップ）
        if (!checkAdminAuth()) return;

        showLoading(true, '画像を処理・反映中...');
        let updatedCount = 0;
        let notFoundFiles = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file.type.startsWith('image/')) continue;

            // 拡張子を除外してファイル名を取得 (例: "neu.png" -> "neu")
            const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");

            // 1. まず「現在表示しているレベル」の中から曲名が一致するものを探す
            // 2. 見つからなければ、全楽曲から探す
            let targetSong = songs.find(s => s.title === fileNameWithoutExt && (currentViewLevel === 'ALL' || s.level === currentViewLevel));
            if (!targetSong) {
                targetSong = songs.find(s => s.title === fileNameWithoutExt);
            }

            if (targetSong) {
                // 画像をリサイズしてクラウドにアップロード（失敗時はBase64のままフォールバック）
                showLoading(true, `画像を処理・反映中... (${i + 1}/${files.length})`);
                const bannerUrl = await processImageFileAndUpload(file, fileNameWithoutExt);
                targetSong.bannerUrl = bannerUrl;
                updatedCount++;
            } else {
                notFoundFiles.push(file.name);
            }
        }

        showLoading(false);
        renderTable(); // テーブルを再描画して画像を反映

        // 結果のフィードバック
        if (updatedCount > 0) {
            alert(`${updatedCount}件のバナー画像を更新しました！\n（※クラウドに保存するには、上部の「☁️ 変更をクラウドに保存」から楽曲データを保存してください）`);
        }
        if (notFoundFiles.length > 0) {
            alert(`以下のファイル名に一致する楽曲が見つかりませんでした:\n${notFoundFiles.join('\n')}`);
        }
    });
}

// ★追加：画像ファイルをリサイズ→クラウドにアップロードしてURLを返す。失敗時はBase64にフォールバック
async function processImageFileAndUpload(file, fileNameHint) {
    const dataUrl = await processImageFileToDataURL(file);
    const uploadedUrl = await uploadImageToCloud(dataUrl, fileNameHint || file.name.replace(/\.[^/.]+$/, ""));
    return uploadedUrl || dataUrl;
}

// 画像ファイルをリサイズしてDataURL(Base64)に変換するヘルパー関数
function processImageFileToDataURL(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const MAX_WIDTH = 250;
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height = Math.round(height * (MAX_WIDTH / width));
                    width = MAX_WIDTH;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                resolve(canvas.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ==========================================
// ★ 既存のBase64バナー画像をクラウドURLへ一括移行
// ==========================================
async function migrateBannersToCloud() {
    if (!checkAdminAuth()) return;
    if (!GAS_URL || GAS_URL.trim() === '') {
        alert("GAS_URLが設定されていません。");
        return;
    }

    const targets = songs.filter(s => s.bannerUrl && s.bannerUrl.startsWith('data:image'));
    if (targets.length === 0) {
        alert("移行対象のBase64画像はありませんでした。（すでに全てURL方式です）");
        return;
    }

    if (!confirm(`${targets.length}件のBase64バナー画像をクラウド上のURLに移行します。\n移行後、楽曲リストをクラウドに保存する必要があります（続けて確認が出ます）。\n\n実行しますか？`)) return;

    let successCount = 0;
    let failCount = 0;
    const failedTitles = [];

    for (let i = 0; i < targets.length; i++) {
        const song = targets[i];
        showLoading(true, `画像を移行中... (${i + 1}/${targets.length}) ${song.title}`);
        const uploadedUrl = await uploadImageToCloud(song.bannerUrl, song.title);
        if (uploadedUrl) {
            song.bannerUrl = uploadedUrl;
            successCount++;
        } else {
            failCount++;
            failedTitles.push(song.title);
        }
    }

    showLoading(false);
    renderTable();

    let msg = `移行完了：成功 ${successCount}件`;
    if (failCount > 0) {
        msg += ` / 失敗 ${failCount}件\n失敗した曲:\n${failedTitles.join('\n')}\n（失敗分はBase64のまま残っているので、後でもう一度このボタンを押せば再試行されます）`;
    }
    alert(msg);

    if (successCount > 0) {
        if (confirm("続けて、更新された楽曲リストをクラウドに保存しますか？\n（保存しないと、次回読み込み時にまたBase64の状態に戻ってしまいます）")) {
            await saveToCloud(true);
        }
    }
}

// ==========================================
// ★ 個別バナー画像の直接ドロップ処理
// ==========================================
async function handleSingleBannerDrop(event, songId, element) {
    // ブラウザの標準動作をキャンセルして、背景色を元に戻す
    event.preventDefault();
    element.style.backgroundColor = ''; 

    const files = event.dataTransfer.files;
    if (!files || files.length === 0) return;

    const file = files[0]; // 複数ドロップされても最初の1枚だけ使う
    if (!file.type.startsWith('image/')) {
        alert('画像ファイルをドロップしてください。');
        return;
    }

    // ★ 管理者パスワードの確認
    if (!checkAdminAuth()) return;

    showLoading(true, 'バナー画像を更新中...');
    try {
        // ドロップされた行の楽曲データをIDから探し出して更新
        const songIndex = songs.findIndex(s => s.id === songId);
        if (songIndex !== -1) {
            const bannerUrl = await processImageFileAndUpload(file, songs[songIndex].title); // リサイズ＋クラウドアップロード
            songs[songIndex].bannerUrl = bannerUrl;
            renderTable(); // テーブルを再描画して反映
        }
    } catch (err) {
        console.error(err);
        alert('画像の処理に失敗しました。');
    }
    showLoading(false);
}

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
// ★ バックアップJSONからの復元機能
// ==========================================
async function restoreFromJson(event) {
    const input = event.target;
    const file = input.files[0];
    if (!file) return;

    try {
        if (!cloudReady) {
            alert('クラウドの最新データを読み込めていないため、復元できません。\nページを再読み込みしてからやり直してください。');
            return;
        }

        const data = JSON.parse(await file.text());
        if (!data || typeof data !== 'object') { alert('対応していないファイル形式です。'); return; }

        const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
        const fileSongs = Array.isArray(data) ? data : data.songs;   // 「楽曲のみ」のバックアップは配列
        const hasSongs = Array.isArray(fileSongs) && fileSongs.length > 0 &&
            fileSongs.every(s => isObj(s) && 'title' in s && 'notes' in s);
        const hasRecords = isObj(data) &&
            (isObj(data.clearRecords) || isObj(data.scoreRecords) || isObj(data.memoRecords));

        if (!hasSongs && !hasRecords) { alert('対応していないファイル形式です。'); return; }

        // 何を復元するか
        let restoreSongs = hasSongs;
        let restoreRecords = hasRecords;
        if (hasSongs && hasRecords) {
            const mode = prompt(`「${file.name}」から何を復元しますか？\n\n1 : 記録（クリア・スコア・メモ）だけ\n2 : 楽曲リスト ＋ 記録（※管理者パスワード必須）\n\n半角数字の 1, 2 のいずれかを入力してください。`, '1');
            if (mode !== '1' && mode !== '2') return;
            restoreSongs = (mode === '2');
        }
        if (restoreSongs && !checkAdminAuth()) return;

        // 確認（ファイル名のユーザーと選択中のユーザーが違えば注意を出す）
        const nameMatch = file.name.match(/^popn_data_(.+?)(?: \(\d+\))?\.json$/);
        const fileUser = nameMatch ? nameMatch[1] : null;
        let msg = `「${file.name}」の内容で復元します。\n`;
        if (restoreRecords) {
            msg += `\n・ユーザー [${currentUser}] の記録を、ファイルの内容に置き換えます`;
            if (fileUser && fileUser !== currentUser) {
                msg += `\n  ⚠ このファイルは [${fileUser}] のバックアップのようです。ユーザーが違っていないか確認してください`;
            }
        }
        if (restoreSongs) msg += `\n・楽曲リスト全体を、ファイルの ${fileSongs.length} 曲に置き換えます（全ユーザーに影響）`;
        msg += `\n\nクラウドにも反映され、元に戻せません。よろしいですか？`;
        if (!confirm(msg)) return;

        // 楽曲リストの復元
        if (restoreSongs) {
            songs = fileSongs.map((s, i) => {
                const p = parseDifficulty(s.diffRaw);
                return Object.assign({}, s, {
                    id: s.id || (s.genre + '_' + s.title + '_' + s.notes),
                    level: s.level || '48',
                    diffRaw: s.diffRaw || '',
                    diffClass: p.diffClass,
                    diffIndex: p.diffIndex,
                    originalOrder: s.originalOrder !== undefined ? s.originalOrder : i
                });
            });
        }

        // 記録の復元（ファイルに入っている種類だけ置き換える）
        let skippedMedals = 0;
        let orphanCount = 0;
        if (restoreRecords) {
            if (!allUsersData[currentUser]) allUsersData[currentUser] = emptyUser();
            const user = allUsersData[currentUser];

            if (isObj(data.clearRecords)) {
                const clears = {};
                for (const id in data.clearRecords) {
                    const medal = data.clearRecords[id];
                    // アプリが知らないメダル名は取り込まない（画面が壊れるのを防ぐ）
                    if (medal !== '' && MEDAL_TYPES[medal]) clears[id] = medal; else skippedMedals++;
                }
                user.clearRecords = clears;
            }
            if (isObj(data.scoreRecords)) user.scoreRecords = data.scoreRecords;
            if (isObj(data.memoRecords)) user.memoRecords = data.memoRecords;

            clearRecords = user.clearRecords;
            scoreRecords = user.scoreRecords;
            memoRecords = user.memoRecords;

            const songIds = new Set(songs.map(s => s.id));
            orphanCount = Object.keys(clearRecords).filter(id => !songIds.has(id)).length;
        }

        updateDynamicFilters();
        renderTable();

        // クラウドへ反映（楽曲リストはその場で保存、記録は自動保存に任せる）
        let songsSaved = true;
        if (restoreSongs) songsSaved = await saveToCloud(true);
        if (restoreRecords) scheduleAutoSave();

        let done = '復元が完了しました。';
        if (restoreRecords) {
            done += `\n・記録：クリア ${Object.keys(clearRecords).length}件 / スコア ${Object.keys(scoreRecords).length}件 / メモ ${Object.keys(memoRecords).length}件（自動でクラウドに保存されます）`;
            if (orphanCount > 0) done += `\n・うち ${orphanCount}件は、今の楽曲リストに無い曲の記録です（表示されません）`;
            if (skippedMedals > 0) done += `\n・不明なメダル ${skippedMedals}件は取り込みませんでした`;
        }
        if (restoreSongs) {
            done += songsSaved
                ? '\n・楽曲リスト：クラウドに保存しました'
                : '\n・楽曲リスト：クラウド保存に失敗しました。「☁️ 変更をクラウドに保存」からやり直してください';
        }
        alert(done);

    } catch (err) {
        console.error(err);
        alert('ファイルの読み込みに失敗しました。JSONファイルが壊れている可能性があります。');
    } finally {
        input.value = ''; // 次回も同じファイルを選択できるようにリセット
    }
}
// ==========================================
// ★ メニューの開閉
// ==========================================
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

// ランダムセレクトを開くときは、結果が隠れないようメニューを閉じる
const openRandomModalOriginal = openRandomModal;
openRandomModal = function () {
    toggleMenu(false);
    openRandomModalOriginal();
};

// レベルを選んだらメニューを閉じる
const changeViewLevelOriginal = changeViewLevel;
changeViewLevel = function (level) {
    toggleMenu(false);
    changeViewLevelOriginal(level);
};

// ==========================================
// ★ 難易度・指数の一括割り当て
// ==========================================
const BULK_CLS = '危険|別格|逆詐称|詐称|入門|強|中|弱';
const BULK_NUM = '[+\\-±]?\\d+(?:\\.\\d+)?';
const BULK_SIGNED = '[+\\-±]\\d+(?:\\.\\d+)?';
const BULK_ERR = '(?:\\s*±\\s*\\d+(?:\\.\\d+)?)?'; // 指数の後ろの誤差（例: ±0.5）
const BULK_DECO = '[■□◆◇●○★☆▼▽▶▷【】《》「」『』<>:#*・=、,\\[\\]]+';
const BULK_RE_DECO_START = new RegExp('^' + BULK_DECO);
const BULK_RE_DECO_END = new RegExp(BULK_DECO + '$');
const BULK_RE_STRICT = new RegExp('^(' + BULK_CLS + ')?(?:([(\\[])?(' + BULK_NUM + ')(' + BULK_ERR + ')[)\\]]?)?$');
const BULK_RE_FREE_CLS = new RegExp('(' + BULK_CLS + ')\\s*(?:[(\\[]\\s*(' + BULK_NUM + ')(' + BULK_ERR + ')\\s*[)\\]]|(' + BULK_SIGNED + ')(' + BULK_ERR + '))?', 'g');
const BULK_RE_FREE_NUM = new RegExp('[(\\[]\\s*(' + BULK_SIGNED + ')(' + BULK_ERR + ')\\s*[)\\]]|(?:^|\\s)(' + BULK_SIGNED + ')(' + BULK_ERR + ')(?=\\s|$)');
const BULK_RE_CHART_SUFFIX = /\((?:ex|h|n|e)\)$/; // ジャンル名の末尾の譜面表記

let bulkDiffResults = [];

function bulkEsc(s) {
    return String(s === undefined || s === null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 表記ゆれを吸収する（全角/半角・大文字/小文字・ハイフンや波ダッシュの違い・ⓊとUPPER）
function bulkNormText(s) {
    return String(s || '')
        .replace(/[\u24CA\u24E4]/g, '(UPPER)')   // Ⓤ → (UPPER)
        .replace(/[\u2212\u2010-\u2015]/g, '-')
        .replace(/[\u301C\u223C]/g, '~')
        .replace(/[\u2018\u2019\u0060\u00B4]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[(\[]\s*upper\s*[)\]]/g, '(upper)'); // （UPPER）や [UPPER] も同じ扱いに
}
function bulkKey(s) { return bulkNormText(s).replace(/\s+/g, ''); }
function bulkIdxOk(idx) { return Math.abs(parseFloat(idx.replace('±', ''))) <= 10; }
function bulkCleanErr(s) { return (s || '').replace(/\s+/g, ''); }

// 文字列全体が「強(+0.5)」「中(+0.213±0.5)」「詐称」「+1.5」のような難易度表記かどうか
function bulkParseStrict(part) {
    const t = part.replace(/\s+/g, '').replace(BULK_RE_DECO_START, '').replace(BULK_RE_DECO_END, '');
    if (!t) return null;
    const m = t.match(BULK_RE_STRICT);
    if (!m || (!m[1] && !m[3])) return null;
    if (m[3] && !bulkIdxOk(m[3])) return null;
    // 区分なしの数字だけの場合は、符号かカッコが無ければ無視（BPMやノーツ数との混同防止）
    if (!m[1] && !m[2] && !/^[+\-±]/.test(m[3])) return null;
    return { cls: m[1] || null, idx: m[3] || null, err: bulkCleanErr(m[4]) };
}

// 曲名以外の部分から難易度表記を探す
function bulkExtractDiff(parts) {
    for (let i = parts.length - 1; i >= 0; i--) {
        let d = bulkParseStrict(parts[i]);
        if (d) return d;
        const tokens = parts[i].split(/\s+/);
        for (let j = tokens.length - 1; j >= 0; j--) {
            d = bulkParseStrict(tokens[j]);
            if (d) return d;
        }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
        let best = null;
        for (const m of parts[i].matchAll(BULK_RE_FREE_CLS)) {
            const idx = m[2] || m[4] || null;
            const err = idx ? bulkCleanErr(m[2] ? m[3] : m[5]) : '';
            if (!idx && m[1].length === 1) continue; // 「強」「中」「弱」単独は誤検出しやすいので無視
            if (idx && !bulkIdxOk(idx)) continue;
            if (!best || (idx && !best.idx)) best = { cls: m[1], idx: idx, err: err };
        }
        if (best) return best;
    }
    for (let i = parts.length - 1; i >= 0; i--) {
        const m = parts[i].match(BULK_RE_FREE_NUM);
        if (m) {
            const idx = m[1] || m[3];
            const err = bulkCleanErr(m[1] ? m[2] : m[4]);
            if (bulkIdxOk(idx)) return { cls: null, idx: idx, err: err };
        }
    }
    return null;
}

// 保存する難易度の文字列を作る（例: 強(+0.5) / 中(+0.213±0.5)）
function bulkBuildDiff(d, song) {
    let idx = d.idx;
    if (idx && /^\d/.test(idx) && parseFloat(idx) > 0) idx = '+' + idx;
    let cls = d.cls;
    let keptClass = false;
    if (!cls && song.diffClass && song.diffClass !== '未分類') { cls = song.diffClass; keptClass = true; }
    return { raw: (cls || '') + (idx ? '(' + idx + (d.err || '') + ')' : ''), keptClass: keptClass };
}

// 曲名・ジャンル名から曲を引くための索引
function bulkBuildNameIndex(targetSongs) {
    const map = new Map();
    const add = (name, song, kind) => {
        const key = bulkKey(name);
        if (!key) return;
        if (!map.has(key)) map.set(key, { key: key, len: key.length, entries: [], re: null });
        map.get(key).entries.push({ song: song, kind: kind });
    };
    targetSongs.forEach(s => {
        add(s.title, s, 'title');
        add(s.genre, s, 'genre');
        const g = bulkKey(s.genre);
        const loose = g.replace(BULK_RE_CHART_SUFFIX, '');
        if (loose && loose !== g) add(loose, s, 'genre'); // (EX) などを外した名前でも引けるように
    });

    map.forEach(e => {
        if (e.len < 2) return; // 1文字の名前は完全一致のみ
        let src = Array.from(e.key).map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
        // 英数字の名前は単語の途中に一致させない（例: "neu" が "neutral" に一致しないように）
        if (/^[a-z0-9]/.test(e.key)) src = '(?<![a-z0-9])' + src;
        if (/[a-z0-9]$/.test(e.key)) src = src + '(?![a-z0-9])';
        try { e.re = new RegExp(src, 'g'); } catch (err) { e.re = null; }
    });

    const list = [...map.values()].sort((a, b) => b.len - a.len); // 長い名前を優先
    return { map: map, list: list };
}

function openBulkDiffModal() {
    if (!checkAdminAuth()) return;

    const select = document.getElementById('bulk-diff-level');
    const levels = [...new Set(songs.map(s => s.level))].filter(l => l);
    levels.sort((a, b) => {
        const na = parseInt(a, 10), nb = parseInt(b, 10);
        if (!isNaN(na) && !isNaN(nb)) return nb - na;
        if (isNaN(na)) return 1;
        if (isNaN(nb)) return -1;
        return 0;
    });
    select.innerHTML = '';
    levels.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l;
        opt.text = isNaN(parseInt(l, 10)) ? l : `Lv ${l}`;
        select.appendChild(opt);
    });
    const optAll = document.createElement('option');
    optAll.value = 'ALL';
    optAll.text = 'すべてのレベル';
    select.appendChild(optAll);
    select.value = levels.includes(currentViewLevel) ? currentViewLevel : 'ALL';

    bulkDiffResults = [];
    document.getElementById('bulk-diff-preview').innerHTML = '';
    document.getElementById('bulk-diff-apply-btn').style.display = 'none';
    document.getElementById('bulk-diff-modal').style.display = 'flex';
}

function closeBulkDiffModal() {
    document.getElementById('bulk-diff-modal').style.display = 'none';
}

function analyzeBulkDiff() {
    const level = document.getElementById('bulk-diff-level').value;
    const text = document.getElementById('bulk-diff-text').value;
    const usePartial = document.getElementById('bulk-diff-partial').checked;

    if (!text.trim()) { alert('テキストが空です。'); return; }

    const targetSongs = songs.filter(s => level === 'ALL' || s.level === level);
    if (targetSongs.length === 0) { alert('対象レベルの楽曲がありません。'); return; }

    const index = bulkBuildNameIndex(targetSongs);
    const found = new Map();     // 曲ID -> 割り当て結果
    const noSongLines = [];      // 曲が見つからなかった行
    const noDiffLines = [];      // 曲はあったが難易度が読み取れなかった行
    let header = { cls: null, idx: null, err: '' }; // 直前の見出し（例: ■強(+1.0)）

    text.split(/\r?\n/).forEach(rawLine => {
        const line = rawLine
            .replace(/<[^>]+>/g, '')
            .replace(/\[\[[^\]]*?\|([^\]]*?)\]\]/g, '$1')
            .replace(/\[\[(.*?)\]\]/g, '$1');
        const lineN = bulkNormText(line).trim();
        if (!lineN) return;

        const cells = lineN.split(/[\t|]/).map(c => c.trim()).filter(c => c);
        if (cells.length === 0) return;

        const hits = new Map(); // song -> { title, genre, partial, ambiguous }
        const groups = [];
        let rest = [];
        const hit = (entry, partial) => {
            groups.push(entry);
            entry.entries.forEach(x => {
                const h = hits.get(x.song) || { title: false, genre: false, partial: partial, ambiguous: false };
                h[x.kind] = true;
                hits.set(x.song, h);
            });
        };

        // ① セル単位の完全一致
        cells.forEach(c => {
            const k = bulkKey(c);
            const e = index.map.get(k) || index.map.get(k.replace(BULK_RE_CHART_SUFFIX, ''));
            if (e) hit(e, false); else rest.push(c);
        });

        // ② 見つからなければ、行の中に曲名・ジャンル名が含まれているか探す
        if (hits.size === 0 && usePartial) {
            let work = cells.join(' \t ');
            index.list.forEach(e => {
                if (!e.re) return;
                e.re.lastIndex = 0;
                if (e.re.test(work)) {
                    e.re.lastIndex = 0;
                    work = work.replace(e.re, ' \u0001 '); // 一致した部分を伏せて、短い名前の重複一致を防ぐ
                    hit(e, true);
                }
            });
            if (hits.size > 0) {
                rest = work.split('\t').map(p => p.replace(/\u0001/g, ' ').trim()).filter(p => p);
            }
        }

        // 曲が無い行：難易度だけの行なら「見出し」として覚える
        if (hits.size === 0) {
            const h = cells.length === 1 ? bulkParseStrict(cells[0]) : null;
            if (h) header = h.cls ? h : { cls: header.cls, idx: h.idx, err: h.err };
            else noSongLines.push(rawLine.trim());
            return;
        }

        // 同じ名前の曲が複数ある場合：ジャンルと曲名の両方が一致した曲を優先
        groups.forEach(e => {
            const ss = [...new Set(e.entries.map(x => x.song))];
            if (ss.length < 2) return;
            const both = ss.filter(s => hits.get(s) && hits.get(s).title && hits.get(s).genre);
            if (both.length > 0) {
                ss.forEach(s => { if (!both.includes(s)) hits.delete(s); });
            } else {
                ss.forEach(s => { const h = hits.get(s); if (h) h.ambiguous = true; });
            }
        });

        // 難易度の読み取り（行内に無ければ見出しを使う）
        let d = bulkExtractDiff(rest);
        let fromHeader = false;
        if (d && !d.cls && header.cls) d = { cls: header.cls, idx: d.idx, err: d.err };
        if (!d && (header.cls || header.idx)) { d = header; fromHeader = true; }
        if (!d) { noDiffLines.push(rawLine.trim()); return; }

        hits.forEach((h, song) => {
            const built = bulkBuildDiff(d, song);
            if (!built.raw) return;
            const notes = [];
            if (h.partial) notes.push('部分一致');
            if (h.ambiguous) notes.push('同名の曲あり');
            if (fromHeader) notes.push('見出しから');
            if (built.keptClass) notes.push('区分は現状維持');
            const prev = found.get(song.id);
            if (prev && prev.newRaw !== built.raw) notes.push('複数行に登場(後の行を採用)');
            found.set(song.id, { id: song.id, song: song, newRaw: built.raw, notes: notes, ambiguous: h.ambiguous });
        });
    });

    const all = [...found.values()];
    bulkDiffResults = all.filter(r => (r.song.diffRaw || '') !== r.newRaw);
    const unchangedCount = all.length - bulkDiffResults.length;
    const unmatchedSongs = targetSongs.filter(s => !found.has(s.id));

    let html = `<div style="font-weight: bold; margin-bottom: 8px;">一致 ${all.length}曲（変更あり <span style="color:#d32f2f;">${bulkDiffResults.length}</span> / 変更なし ${unchangedCount}） ・ 対象レベルの未一致 ${unmatchedSongs.length}曲</div>`;

    if (bulkDiffResults.length > 0) {
        html += `<div style="max-height: 40vh; overflow-y: auto; border: 1px solid #ddd;">
            <table style="font-size: 0.85em; box-shadow: none;">
                <thead><tr>
                    <th style="width: 30px; text-align: center;"><input type="checkbox" checked onchange="document.querySelectorAll('.bulk-diff-check').forEach(c => c.checked = this.checked)"></th>
                    <th>ジャンル / 曲名</th><th>現在</th><th>変更後</th><th>備考</th>
                </tr></thead><tbody>`;
        bulkDiffResults.forEach((r, i) => {
            const p = parseDifficulty(r.newRaw);
            const st = getDifficultyColor(p.diffClass, p.diffIndex);
            html += `<tr>
                <td style="text-align: center;"><input type="checkbox" class="bulk-diff-check" value="${i}" ${r.ambiguous ? '' : 'checked'}></td>
                <td><div style="font-size: 0.85em; color: #666;">${bulkEsc(r.song.genre)}</div><b>${bulkEsc(r.song.title)}</b>${level === 'ALL' ? ` <span class="level-badge">${bulkEsc(r.song.level)}</span>` : ''}</td>
                <td style="color: #888;">${bulkEsc(r.song.diffRaw) || '（なし）'}</td>
                <td style="font-weight: bold; color: ${st.color}; text-shadow: ${st.shadow};">${bulkEsc(r.newRaw)}</td>
                <td style="font-size: 0.85em; color: #e65100;">${bulkEsc(r.notes.join(' / '))}</td>
            </tr>`;
        });
        html += `</tbody></table></div>`;
    } else {
        html += `<div style="color: #d32f2f; font-weight: bold; padding: 8px 0;">変更が必要な曲は見つかりませんでした。</div>`;
    }

    const listBlock = (title, items) => items.length === 0 ? '' : `
        <details style="margin-top: 8px; background: #f5f5f5; padding: 8px; border-radius: 4px;">
            <summary style="cursor: pointer; font-size: 0.85em; font-weight: bold; color: #555;">${title} (${items.length})</summary>
            <div style="max-height: 150px; overflow-y: auto; font-size: 0.8em; margin-top: 6px; white-space: pre-wrap; word-break: break-all;">${items.map(bulkEsc).join('\n')}</div>
        </details>`;

    html += listBlock('⚠ 曲は見つかったが難易度を読み取れなかった行', noDiffLines);
    html += listBlock('対象レベルで割り当てが無かった曲', unmatchedSongs.map(s => (s.genre && s.genre !== s.title ? s.genre + ' / ' : '') + s.title));
    html += listBlock('曲が見つからなかった行', noSongLines);

    document.getElementById('bulk-diff-preview').innerHTML = html;
    document.getElementById('bulk-diff-apply-btn').style.display = bulkDiffResults.length > 0 ? '' : 'none';
}

async function applyBulkDiff() {
    if (!checkAdminAuth()) return;

    const picked = [...document.querySelectorAll('.bulk-diff-check:checked')].map(cb => bulkDiffResults[parseInt(cb.value, 10)]);
    if (picked.length === 0) { alert('適用する曲が選択されていません。'); return; }

    let applied = 0;
    picked.forEach(r => {
        const song = songs.find(s => s.id === r.id);
        if (!song) return;
        const p = parseDifficulty(r.newRaw);
        song.diffRaw = r.newRaw;
        song.diffClass = p.diffClass;
        song.diffIndex = p.diffIndex;
        applied++;
    });

    bulkDiffResults = [];
    closeBulkDiffModal();
    renderTable();

    if (confirm(`${applied}曲に難易度を割り当てました。\n続けて楽曲リストをクラウドに保存しますか？\n（保存しないと、再読み込みしたときに元に戻ります）`)) {
        const ok = await saveToCloud(true);
        if (ok) alert('楽曲リストをクラウドに保存しました！');
    }
}

// ==========================================
// ★ 表示レベルボタンの配置（メイン画面 / メニュー内）
// ==========================================
function applyLevelButtonPlacement(onMain) {
    const buttons = document.getElementById('view-level-buttons');
    const slot = document.getElementById(onMain ? 'main-level-slot' : 'menu-level-slot');
    if (buttons && slot && buttons.parentElement !== slot) slot.appendChild(buttons);
    const checkbox = document.getElementById('level-btn-on-main');
    if (checkbox) checkbox.checked = onMain;
}

function setLevelButtonPlacement(onMain) {
    try { localStorage.setItem('popn_level_btn_main', onMain ? '1' : '0'); } catch (e) {}
    applyLevelButtonPlacement(onMain);
}

(function initLevelButtonPlacement() {
    let onMain = true;
    try { onMain = localStorage.getItem('popn_level_btn_main') !== '0'; } catch (e) {}
    applyLevelButtonPlacement(onMain);
})();
