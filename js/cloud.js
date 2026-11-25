// ==========================================
// cloud.js
// クラウド（Google Apps Script）とのやり取り。
// 読み込み・キャッシュ・自動保存・他端末の変更の反映・手動保存・画像アップロード。
// ==========================================

function applyFetchedData(data) {
    songs = data.songs || [];
    allUsersData = data.users || {};
    if (Object.keys(allUsersData).length === 0) allUsersData["Guest"] = emptyUser();
    for (let u in allUsersData) {
        if (!allUsersData[u].clearRecords) allUsersData[u].clearRecords = {};
        if (!allUsersData[u].scoreRecords) allUsersData[u].scoreRecords = {};
        if (!allUsersData[u].memoRecords) allUsersData[u].memoRecords = {};
        if (!allUsersData[u].historyRecords) allUsersData[u].historyRecords = {};
        if (!allUsersData[u].pokkuraRecords) allUsersData[u].pokkuraRecords = {};
        if (!allUsersData[u].goalRecords) allUsersData[u].goalRecords = {};
        if (!allUsersData[u].pokkuraFlagRecords) allUsersData[u].pokkuraFlagRecords = {};
        if (!allUsersData[u].recentRecords) allUsersData[u].recentRecords = {};
        if (!allUsersData[u].memoConfigRecords) allUsersData[u].memoConfigRecords = {};
        if (!allUsersData[u].attrConfigRecords) allUsersData[u].attrConfigRecords = {};
        if (!allUsersData[u].pokkuraHistRecords) allUsersData[u].pokkuraHistRecords = {};
        if (!allUsersData[u].badRecords) allUsersData[u].badRecords = {};
        if (!allUsersData[u].badReachRecords) allUsersData[u].badReachRecords = {};
        if (!allUsersData[u].oldMedalRecords) allUsersData[u].oldMedalRecords = {};
        if (!allUsersData[u].nextRecords) allUsersData[u].nextRecords = {};
        if (!allUsersData[u].knockRecords) allUsersData[u].knockRecords = {};
        if (!allUsersData[u].knockBannerRecords) allUsersData[u].knockBannerRecords = {};
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
            if (s.id) moveSongRecords(s.id, expectedId, { markDirty: false });
            s.id = expectedId;
        }
    });
    dataLoaded = true;
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
    try { return JSON.parse(storageGet(STORAGE_KEY_CACHE)); } catch (e) { return null; }
}
function saveCache(data) {
    if (!storageSet(STORAGE_KEY_CACHE, JSON.stringify(data))) storageRemove(STORAGE_KEY_CACHE); // 容量オーバー時
}

// ==========================================
// ★ 自動保存・他端末の変更の自動反映
// ==========================================
const SYNC_INTERVAL_MS = 10000;   // 他端末の変更を確認する間隔（10秒）
const AUTOSAVE_DELAY_MS = 800;    // 変更してから保存を始めるまでの時間（0.8秒）
// pokkuraRecords = ポックラ用の公式データ（旧曲の今作スコアなど。eagate-import.js）
// goalRecords = 目標（goals.js）、pokkuraFlagRecords = 旧筐体でつけたイージーの扱い（table.js）
const RECORD_TYPES = ['clearRecords', 'scoreRecords', 'memoRecords', 'historyRecords', 'pokkuraRecords', 'goalRecords', 'pokkuraFlagRecords', 'recentRecords', 'memoConfigRecords', 'attrConfigRecords', 'pokkuraHistRecords', 'badRecords', 'badReachRecords', 'oldMedalRecords', 'nextRecords', 'knockRecords', 'knockBannerRecords'];

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
    // 新しいデザインでは、上部バーの表示だけを変える（通知は出さない）
    if (typeof updateSaveChip === 'function') updateSaveChip(text, color);
    if (document.body.classList.contains('ui-new')) return;
    showToast('toast-save', text, color, hideAfterMs);
}

// ---------- 曲の ID が変わったときの記録の引っ越し ----------
// 曲の ID は「ジャンル_曲名_ノーツ数」。ジャンル名・曲名・ノーツ数を変えると ID が変わるので、記録も新しい ID に移す
//   曲 ID がキーの記録（SONG_KEYED_RECORD_TYPES）は全ユーザー分を移す（新しい ID にもう値があれば上書きしない）。更新履歴は各記録の id を付け替える
//   markDirty（最初は true）：変わったユーザーを「保存が必要」にする。返す：変わったユーザーの一覧
const SONG_KEYED_RECORD_TYPES = ['clearRecords', 'scoreRecords', 'memoRecords', 'badRecords', 'badReachRecords', 'oldMedalRecords', 'nextRecords', 'pokkuraRecords', 'pokkuraFlagRecords'];
function moveSongRecords(oldId, newId, opts = {}) {
    const changed = [];
    if (!oldId || !newId || oldId === newId) return changed;
    for (const u in allUsersData) {
        const ud = allUsersData[u];
        let moved = false;
        SONG_KEYED_RECORD_TYPES.forEach(type => {
            const rec = ud[type];
            if (!rec || !Object.prototype.hasOwnProperty.call(rec, oldId)) return;
            if (rec[newId] === undefined) rec[newId] = rec[oldId];
            delete rec[oldId];
            moved = true;
        });
        Object.values(ud.historyRecords || {}).forEach(e => {
            if (e && e.id === oldId) { e.id = newId; moved = true; }
        });
        if (moved) changed.push(u);
    }
    if (changed.length === 0) return changed;
    if (allUsersData[currentUser]) {
        clearRecords = allUsersData[currentUser].clearRecords;
        scoreRecords = allUsersData[currentUser].scoreRecords;
        memoRecords = allUsersData[currentUser].memoRecords;
    }
    if (typeof clearHistoryMinBadCache === 'function') clearHistoryMinBadCache();
    if (opts.markDirty !== false) {
        changed.forEach(u => dirtyUsers.add(u));
        localChangeSeq++;
    }
    return changed;
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

// 保存のたびに送る「どの版のアプリ・どの端末か」（クラウド側の保存の記録に残る）
function getDeviceLabel() {
    let id = storageGet('popn_device_id');
    if (!id) { id = Math.random().toString(36).slice(2, 8); storageSet('popn_device_id', id); }
    const ua = navigator.userAgent || '';
    const kind = /iPhone|iPad|iPod/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : 'PC';
    return `${kind}-${id}`;
}
function clientInfo() {
    return { app: APP_VERSION, device: getDeviceLabel() };
}

function patchRequest(u, patch) {
    const body = JSON.stringify({ type: 'patchRecords', targetUser: u, patch: patch, ...clientInfo() });
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
    return stableStr(RECORD_TYPES.map(type => u[type] || {}));
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
    // 未保存の変更（記録・楽曲リスト）がある間は上書きしない。管理者でも、楽曲リストを変えていなければ取り込む
    if (autoSaving || dirtyUsers.size > 0 || hasLocalSongEdits()) return;

    syncing = true;
    lastSyncAt = Date.now();
    const seq = localChangeSeq;
    try {
        const v = await fetchCloudVersion();
        if (v !== undefined && v !== knownVersion) {
            // 変更があったときだけ全データを取り直す
            const fresh = await fetchCloudData(0);
            const localChanged = seq !== localChangeSeq || autoSaving || dirtyUsers.size > 0 || hasLocalSongEdits();

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
                markSongsSynced(songs);
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
    // 記録は丸ごと送らず、変わった所だけを今すぐ送る（ふだんの自動保存と同じ。古いデータで上書きしないため）
    showLoading(true, `クラウドに保存中... (${currentUser})`);
    const success = await saveUserRecordsNow(currentUser);
    showLoading(false);
    if (success) alert(`ユーザー [${currentUser}] の記録をクラウドに保存しました！`);
    else alert('保存できませんでした。通信を確かめて、もう一度押してください（自動でも続けて保存します）。');
}

// その人の記録の、まだ保存していない分（変わった所だけ）を今すぐ送る。送れたら true
async function saveUserRecordsNow(u) {
    for (let i = 0; i < 100 && autoSaving; i++) await new Promise(r => setTimeout(r, 200));
    if (!cloudReady) return false;
    if (!buildPatch(u)) { dirtyUsers.delete(u); return true; }
    dirtyUsers.add(u);
    clearTimeout(autoSaveTimer);
    await runAutoSave();
    return !dirtyUsers.has(u) && !buildPatch(u);
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

    // ① まず楽曲リストの変わった所を保存
    let success = await saveToCloud(true);
    if (!success) return; // 楽曲の保存に失敗した場合は安全のため中断

    // ② 続いて、登録されている全ユーザーの、まだ保存していない記録を送る（丸ごとは送らない）
    const users = Object.keys(allUsersData);
    for (let i = 0; i < users.length; i++) {
        const targetU = users[i];
        showLoading(true, `全ユーザーを保存中 (${i + 1}/${users.length}): [${targetU}]`);
        const res = await saveUserRecordsNow(targetU);
        showLoading(false);
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

// ---------- 楽曲リストの写し（最後にクラウドとそろえたときのもの） ----------
//   楽曲リストの保存は全部を送るので、保存の前にクラウドの最新を取り、この端末で変えた分（写しとの違い）だけを重ねる
let syncedSongs = null;

// applyFetchedData と同じ形にそろえた写しを作る
function normalizeSongsCopy(list) {
    return JSON.parse(JSON.stringify(list || [])).map(s => {
        if (!s.level) s.level = '48';
        const p = parseDifficulty(s.diffRaw);
        s.diffClass = p.diffClass;
        s.diffIndex = p.diffIndex;
        s.id = s.genre + '_' + s.title + '_' + s.notes;
        return s;
    });
}
function markSongsSynced(list) { syncedSongs = normalizeSongsCopy(list); }

// この端末に、まだクラウドに保存していない楽曲リストの変更があるか
function hasLocalSongEdits() {
    return !!syncedSongs && stableStr(songs) !== stableStr(syncedSongs);
}

// 最新の楽曲リスト（fresh）に、この端末で変えた分（base → local の違い）だけを重ねる
//   足した曲・消した曲・曲ごとに変えた項目。それ以外は最新のまま（ほかの端末で付けたバナーなどを消さない）
function mergeSongLists(fresh, base, local) {
    const baseMap = new Map(base.map(s => [s.id, s]));
    const localIds = new Set(local.map(s => s.id));
    const out = fresh.map(s => JSON.parse(JSON.stringify(s)));
    const outMap = new Map(out.map(s => [s.id, s]));
    local.forEach(l => {
        const b = baseMap.get(l.id);
        const copy = JSON.parse(JSON.stringify(l));
        if (!b) {
            // この端末で足した曲（最新にも同じ曲があれば、この端末のものにする）
            const i = out.findIndex(s => s.id === l.id);
            if (i >= 0) out[i] = copy; else out.push(copy);
            outMap.set(l.id, copy);
            return;
        }
        const keys = new Set([...Object.keys(b), ...Object.keys(l)]);
        const changed = [...keys].filter(k => stableStr(l[k]) !== stableStr(b[k]));
        if (changed.length === 0) return;
        let target = outMap.get(l.id);
        if (!target) { target = JSON.parse(JSON.stringify(b)); out.push(target); outMap.set(l.id, target); } // ほかの端末で消された曲を、この端末で直していた
        changed.forEach(k => { if (k in l) target[k] = copy[k]; else delete target[k]; });
    });
    // この端末で消した曲
    return out.filter(s => !(baseMap.has(s.id) && !localIds.has(s.id)));
}

// 全部を送る保存の前に、クラウドの最新を取り込む（記録はこの端末のまだ保存していない分を重ねる）
//   楽曲リストの保存なら、楽曲リストも最新にこの端末の変更を重ねる（replaceSongs のときはこの端末のものをそのまま使う）
//   最新を取れなければ false（古いデータで上書きしないよう、保存をやめる）
async function refreshBeforeFullSave(isSongUpdate, replaceSongs) {
    clearTimeout(autoSaveTimer);
    for (let i = 0; i < 100 && autoSaving; i++) await new Promise(r => setTimeout(r, 200));
    if (cloudReady && dirtyUsers.size > 0) await runAutoSave();
    let fresh;
    try {
        fresh = await fetchCloudData(1);
    } catch (e) {
        console.warn('保存前の読み込み失敗', e);
        return false;
    }
    const freshSongs = normalizeSongsCopy(fresh.songs);
    const localEdited = hasLocalSongEdits();
    let nextSongs;
    if (isSongUpdate) nextSongs = (replaceSongs || !syncedSongs) ? songs : mergeSongLists(freshSongs, syncedSongs, songs);
    else nextSongs = localEdited ? songs : freshSongs;

    const cloudUsers = JSON.parse(JSON.stringify(fresh.users || {}));
    fresh.users = fresh.users || {};
    mergeLocalEdits(fresh, syncedUsers, allUsersData);
    knownVersion = fresh.version;
    lastSyncAt = Date.now();
    markSynced(cloudUsers);
    // 楽曲リストの写しはクラウドの最新にする（この端末の変更は、保存できるまで違いとして残る）
    syncedSongs = freshSongs;
    fresh.songs = JSON.parse(JSON.stringify(nextSongs));
    applyFetchedData(fresh);
    for (const u in allUsersData) {
        if (userRecordsStr(allUsersData[u]) !== userRecordsStr(syncedUsers[u])) dirtyUsers.add(u);
    }
    cloudReady = true;
    const c = loadCache();
    saveCache(Object.assign({}, c || {}, { songs: freshSongs, users: cloudUsers, version: fresh.version }));
    if (typeof refreshUI === 'function') refreshUI();
    return true;
}

// ---------- 楽曲リストの「変わった所だけ」 ----------
//   写し（syncedSongs）と今の楽曲リストの違い：{ set: { 曲ID: { 項目: 値（null は消す） } }, add: [曲], remove: [曲ID] }。違いが無ければ null
function buildSongsPatch() {
    if (!syncedSongs) return null;
    const base = new Map(syncedSongs.map(s => [s.id, s]));
    const localIds = new Set(songs.map(s => s.id));
    const set = {}, add = [], remove = [];
    songs.forEach(l => {
        const b = base.get(l.id);
        if (!b) { add.push(JSON.parse(JSON.stringify(l))); return; }
        const keys = new Set([...Object.keys(b), ...Object.keys(l)]);
        keys.forEach(k => {
            if (stableStr(l[k]) === stableStr(b[k])) return;
            (set[l.id] = set[l.id] || {})[k] = (k in l && l[k] !== undefined) ? JSON.parse(JSON.stringify(l[k])) : null;
        });
    });
    syncedSongs.forEach(b => { if (!localIds.has(b.id)) remove.push(b.id); });
    return (Object.keys(set).length || add.length || remove.length) ? { set, add, remove } : null;
}

// 楽曲リストの変わった所だけを送る（クラウドが ver 2 より前なら、前のやり方＝最新に重ねて全部送る、に戻す）
async function saveSongsPatched(customLoadingText) {
    const patch = buildSongsPatch();
    if (!patch) return true;
    // 見張り：たくさん消す・バナーをたくさん消すときは確かめる
    const clearedBanners = Object.keys(patch.set).filter(id => 'bannerUrl' in patch.set[id] && !patch.set[id].bannerUrl
        && (syncedSongs.find(s => s.id === id) || {}).bannerUrl).length;
    if (patch.remove.length > 3 || clearedBanners > 3) {
        if (!confirm(`楽曲リストから ${patch.remove.length}曲を消し、${clearedBanners}曲のバナーを消します。\n本当に保存しますか？`)) return false;
    }
    showLoading(true, customLoadingText || 'クラウドに保存中... (楽曲リスト)');
    let result = null;
    try {
        const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ type: 'patchSongs', password: ADMIN_PASSWORD, patch, force: patch.remove.length > 3 || clearedBanners > 3, ...clientInfo() }) });
        result = await res.json();
    } catch (e) {
        console.error('楽曲リストの保存エラー:', e);
        showLoading(false);
        alert('通信エラーが発生しました。もう一度保存してください。');
        return false;
    }
    showLoading(false);
    if (result && result.status === 'success' && result.songsPatched) {
        markSongsSynced(songs);
        if (result.version !== undefined && result.prevVersion === knownVersion) knownVersion = result.version;
        return true;
    }
    // クラウドが前の版（patchSongs を知らない）なら、前のやり方で保存する
    if (result && !result.gasVersion) return saveToCloud(true, currentUser, customLoadingText, { legacy: true });
    alert(result && result.message ? result.message : '保存できませんでした。');
    return false;
}

async function saveToCloud(isSongUpdate = false, targetUserName = currentUser, customLoadingText = null, opts = {}) {
    if (!GAS_URL || GAS_URL.trim() === '') return false;
    if (!dataLoaded) { alert("データを読み込めていないため保存できません。再読み込みしてください。"); return false; } // ←追加
    // 記録は丸ごと送らない（変わった所だけ）。楽曲リストも、バックアップからの復元のほかは変わった所だけ
    if (!isSongUpdate) return saveUserRecordsNow(targetUserName);
    if (!opts.replaceSongs && !opts.legacy) return saveSongsPatched(customLoadingText);

    // 全部を送る保存なので、先にクラウドの最新を取り込む（古いデータで、ほかの端末の変更を上書きしないため）
    showLoading(true, '最新のデータを確認中...');
    if (!(await refreshBeforeFullSave(isSongUpdate, !!opts.replaceSongs))) {
        showLoading(false);
        alert('最新のデータを取れないので、保存をやめました（古いデータで上書きしないため）。\n通信を確かめて、もう一度保存してください。');
        return false;
    }

    // ローディング表示（カスタムテキストがあればそれを優先表示）
    const defaultText = `クラウドに保存中... (${isSongUpdate ? '楽曲リスト' : targetUserName})`;
    showLoading(true, customLoadingText || defaultText);
    let isSuccess = false;
    try {
        // 指定されたターゲットユーザーのデータをallUsersDataから安全に取得
        const targetClear = allUsersData[targetUserName]?.clearRecords || {};
        const targetScore = allUsersData[targetUserName]?.scoreRecords || {};
        const targetMemo = allUsersData[targetUserName]?.memoRecords || {};
        const targetHistory = allUsersData[targetUserName]?.historyRecords || {};
        const targetPokkura = allUsersData[targetUserName]?.pokkuraRecords || {};

        const payload = {
            type: isSongUpdate ? "updateSongs" : "updateClears",
            targetUser: targetUserName,
            force: !!opts.replaceSongs,
            ...clientInfo(),
            songs: isSongUpdate ? songs : [], 
            clearRecords: targetClear,
            scoreRecords: targetScore,
            memoRecords: targetMemo,
            historyRecords: targetHistory,
            pokkuraRecords: targetPokkura,
            goalRecords: allUsersData[targetUserName]?.goalRecords || {},
            pokkuraFlagRecords: allUsersData[targetUserName]?.pokkuraFlagRecords || {},
            recentRecords: allUsersData[targetUserName]?.recentRecords || {},
            memoConfigRecords: allUsersData[targetUserName]?.memoConfigRecords || {},
            attrConfigRecords: allUsersData[targetUserName]?.attrConfigRecords || {},
            pokkuraHistRecords: allUsersData[targetUserName]?.pokkuraHistRecords || {},
            badRecords: allUsersData[targetUserName]?.badRecords || {},
            badReachRecords: allUsersData[targetUserName]?.badReachRecords || {},
            oldMedalRecords: allUsersData[targetUserName]?.oldMedalRecords || {},
            nextRecords: allUsersData[targetUserName]?.nextRecords || {},
            knockRecords: allUsersData[targetUserName]?.knockRecords || {},
            knockBannerRecords: allUsersData[targetUserName]?.knockBannerRecords || {}
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
            // 送ったものがクラウドと同じになった
            if (isSongUpdate) markSongsSynced(songs);
            // 記録を全部送ったときだけ、その記録も保存済みにする（楽曲リストの保存の記録は、ふだんの自動保存で送る）
            if (!isSongUpdate && allUsersData[targetUserName]) {
                syncedUsers[targetUserName] = JSON.parse(JSON.stringify(allUsersData[targetUserName]));
                if (!buildPatch(targetUserName)) dirtyUsers.delete(targetUserName);
            }
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
    // 取り込んだ最新に重ねた、この端末のまだ保存していない記録は、ふだんの自動保存で送る
    if (dirtyUsers.size > 0) runAutoSave();
    return isSuccess;
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
                fileName: fileNameHint,
                ...clientInfo()
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
