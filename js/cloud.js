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
