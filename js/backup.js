// ==========================================
// backup.js
// データの守り：
//   ・この端末のバックアップ：クラウドから読み込めたら、1日1回、楽曲リストと全員の記録の控えをこの端末（IndexedDB）に残す（新しい7日分）
//   ・見張り：読み込んだデータが、この端末の一番新しい控えより「曲の数」「バナーのある曲」「今のユーザーのメダルの数」が大きく減っていたら知らせる
//   ・「前の状態に戻す」画面（#backup-restore-modal）：クラウドのバックアップ（GAS の popn_backups）とこの端末の控えから選び、
//     今との違いを見てから「消えたバナーだけ」「今のユーザーの記録だけ」「楽曲リスト＋今のユーザーの記録」を戻す
//   ・保存の記録：いつ・どの端末・どの版のアプリが何を保存したか（GAS の ?mode=log）
// ==========================================

const DEVICE_BACKUP_DB = 'popn_backups';
const DEVICE_BACKUP_STORE = 'snaps';
const DEVICE_BACKUP_KEEP = 7;

function openBackupDb() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error('IndexedDB が使えません')); return; }
        const req = indexedDB.open(DEVICE_BACKUP_DB, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(DEVICE_BACKUP_STORE, { keyPath: 'day' }); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function idbRequest(store, mode, fn) {
    return openBackupDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(DEVICE_BACKUP_STORE, mode);
        const r = fn(tx.objectStore(DEVICE_BACKUP_STORE));
        tx.oncomplete = () => { db.close(); resolve(r && 'result' in r ? r.result : undefined); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    }));
}

// 控えの一覧（新しい順、中身なし）
async function listDeviceBackups() {
    try {
        const all = await idbRequest(null, 'readonly', st => st.getAll());
        return (all || []).map(x => ({ day: x.day, t: x.t, songs: x.songs, banners: x.banners })).sort((a, b) => b.t - a.t);
    } catch (e) { return []; }
}

async function getDeviceBackup(day) {
    try { return await idbRequest(null, 'readonly', st => st.get(day)); } catch (e) { return null; }
}

// クラウドから読み込めたデータ（fresh）を、今日の控えとして残す（1日1回。古いものは消す）
async function saveDeviceBackup(fresh) {
    try {
        if (!fresh || !Array.isArray(fresh.songs) || fresh.songs.length === 0) return;
        const day = localDateKey(Date.now());
        const list = await listDeviceBackups();
        if (list.some(x => x.day === day)) return;
        const data = JSON.parse(JSON.stringify({ songs: fresh.songs, users: fresh.users || {} }));
        await idbRequest(null, 'readwrite', st => st.put({ day, t: Date.now(), songs: data.songs.length, banners: countSongBanners(data.songs), data }));
        const old = list.filter(x => x.day !== day).slice(DEVICE_BACKUP_KEEP - 1);
        for (const x of old) await idbRequest(null, 'readwrite', st => st.delete(x.day));
    } catch (e) { console.warn('この端末のバックアップに失敗', e); }
}

function countSongBanners(list) {
    return (list || []).filter(s => s && s.bannerUrl).length;
}

// 見張り：読み込んだデータが、この端末の一番新しい控え（今日より前）より大きく減っていたら知らせる
async function checkDataDrop(fresh) {
    try {
        const today = localDateKey(Date.now());
        const prev = (await listDeviceBackups()).find(x => x.day !== today);
        if (!prev || !fresh || !Array.isArray(fresh.songs)) return;
        const snap = await getDeviceBackup(prev.day);
        if (!snap || !snap.data) return;
        const msgs = [];
        const songsNow = fresh.songs.length, songsPrev = snap.data.songs.length;
        if (songsPrev > 20 && songsNow < songsPrev * 0.97) msgs.push(`曲の数 ${songsPrev} → ${songsNow}`);
        const bNow = countSongBanners(fresh.songs), bPrev = countSongBanners(snap.data.songs);
        if (bNow <= bPrev - 5) msgs.push(`バナーのある曲 ${bPrev} → ${bNow}`);
        const u = currentUser;
        const cNow = Object.keys(((fresh.users || {})[u] || {}).clearRecords || {}).length;
        const cPrev = Object.keys(((snap.data.users || {})[u] || {}).clearRecords || {}).length;
        if (cPrev > 20 && cNow < cPrev * 0.97) msgs.push(`[${u}] のメダルの記録 ${cPrev} → ${cNow}`);
        if (msgs.length === 0) return;
        if (confirm(`前の日（${prev.day}）より、データが大きく減っています。\n${msgs.join('\n')}\n\n「前の状態に戻す」画面を開きますか？`)) openBackupRestoreModal();
    } catch (e) { console.warn('見張りに失敗', e); }
}

// ---------- 「前の状態に戻す」画面 ----------
let backupRestoreState = null; // { cloud: [...], device: [...], cloudReady, selected: { label, data } }

async function openBackupRestoreModal() {
    if (typeof toggleMenu === 'function') toggleMenu(false);
    backupRestoreState = { cloud: null, device: [], cloudError: '', selected: null, log: null };
    document.getElementById('backup-restore-modal').style.display = 'flex';
    renderBackupRestore();
    backupRestoreState.device = await listDeviceBackups();
    renderBackupRestore();
    try {
        const res = await fetch(GAS_URL + '?mode=backups', { signal: AbortSignal.timeout(20000) });
        const json = await res.json();
        if (json && json.status === 'success' && Array.isArray(json.backups)) backupRestoreState.cloud = json.backups;
        else backupRestoreState.cloudError = 'クラウドのバックアップは、GAS を新しくすると使えます（gas/Code.gs）。';
    } catch (e) {
        backupRestoreState.cloudError = 'クラウドのバックアップの一覧を読めませんでした。';
    }
    renderBackupRestore();
}

function closeBackupRestoreModal() {
    document.getElementById('backup-restore-modal').style.display = 'none';
    backupRestoreState = null;
}

function formatBackupTime(t) {
    const d = new Date(t);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function renderBackupRestore() {
    const body = document.getElementById('backup-restore-body');
    const st = backupRestoreState;
    if (!body || !st) return;
    if (st.selected) { body.innerHTML = buildBackupDiffHtml(st.selected); return; }
    const cloudRows = st.cloud === null
        ? `<div class="br-note">${escapeHtml(st.cloudError || '読み込み中…')}</div>`
        : (st.cloud.length === 0 ? '<div class="br-note">まだありません</div>'
            : st.cloud.slice(0, 40).map(b => `<button type="button" class="br-item" onclick="selectCloudBackup('${jsStringAttr(b.id)}')">
                <span>${escapeHtml(formatBackupTime(b.t))}</span><small>${/_daily\.json$/.test(b.name) ? 'その日の最初' : '丸ごと保存の前'}・${Math.round((b.size || 0) / 1024)}KB</small></button>`).join(''));
    const deviceRows = st.device.length === 0 ? '<div class="br-note">まだありません（クラウドから読み込めた日に1日1回残します）</div>'
        : st.device.map(b => `<button type="button" class="br-item" onclick="selectDeviceBackup('${jsStringAttr(b.day)}')">
            <span>${escapeHtml(formatBackupTime(b.t))}</span><small>曲 ${b.songs}・バナー ${b.banners}</small></button>`).join('');
    const logHtml = st.log === null ? '' : buildSaveLogHtml(st.log);
    body.innerHTML = `
        <div class="br-sub">クラウドのバックアップ</div><div class="br-list">${cloudRows}</div>
        <div class="br-sub">この端末の控え</div><div class="br-list">${deviceRows}</div>
        <div class="br-sub">保存の記録</div>
        ${st.log === null ? '<button type="button" class="admin-btn" onclick="loadSaveLog()">保存の記録を見る</button>' : logHtml}`;
}

async function selectCloudBackup(id) {
    const st = backupRestoreState;
    if (!st) return;
    showLoading(true, 'バックアップを読み込み中...');
    try {
        const res = await fetch(GAS_URL + '?mode=backup&id=' + encodeURIComponent(id), { signal: AbortSignal.timeout(30000) });
        const json = await res.json();
        if (!json || json.status !== 'success') throw new Error(json && json.message || '読めません');
        const b = (st.cloud || []).find(x => x.id === id);
        st.selected = { label: 'クラウド ' + (b ? formatBackupTime(b.t) : ''), data: { songs: json.songs || [], users: json.users || {} } };
    } catch (e) {
        alert('バックアップを読み込めませんでした：' + e.message);
    }
    showLoading(false);
    renderBackupRestore();
}

async function selectDeviceBackup(day) {
    const st = backupRestoreState;
    if (!st) return;
    const snap = await getDeviceBackup(day);
    if (!snap || !snap.data) { alert('控えを読み込めませんでした。'); return; }
    st.selected = { label: 'この端末 ' + formatBackupTime(snap.t), data: snap.data };
    renderBackupRestore();
}

function backBackupRestoreList() {
    if (!backupRestoreState) return;
    backupRestoreState.selected = null;
    renderBackupRestore();
}

// 選んだバックアップと今との違い
function buildBackupDiffHtml(sel) {
    const d = sel.data;
    const keyOf = s => String(s.genre ?? '') + '_' + String(s.title ?? '') + '_' + String(s.notes ?? '');
    const bMap = new Map((d.songs || []).map(s => [keyOf(s), s]));
    const lostBanners = songs.filter(s => !safeUrl(s.bannerUrl, true) && bMap.has(keyOf(s)) && safeUrl(bMap.get(keyOf(s)).bannerUrl, true));
    const u = currentUser;
    const bu = (d.users || {})[u] || {};
    const count = (rec) => Object.keys(rec || {}).length;
    const nowU = allUsersData[u] || {};
    const row = (label, a, b) => `<tr><th>${label}</th><td>${b}</td><td>${a}</td></tr>`;
    return `
        <button type="button" class="br-back" onclick="backBackupRestoreList()">‹ 一覧に戻る</button>
        <div class="br-sub">${escapeHtml(sel.label)} と今のくらべ</div>
        <table class="br-table"><tr><th></th><th>バックアップ</th><th>今</th></tr>
            ${row('曲の数', songs.length, (d.songs || []).length)}
            ${row('バナーのある曲', countSongBanners(songs), countSongBanners(d.songs))}
            ${row(`[${escapeHtml(u)}] メダル`, count(nowU.clearRecords), count(bu.clearRecords))}
            ${row(`[${escapeHtml(u)}] スコア`, count(nowU.scoreRecords), count(bu.scoreRecords))}
            ${row(`[${escapeHtml(u)}] BAD`, count(nowU.badRecords), count(bu.badRecords))}
            ${row(`[${escapeHtml(u)}] 更新履歴`, count(nowU.historyRecords), count(bu.historyRecords))}
        </table>
        ${lostBanners.length ? `<div class="br-note">今は消えていて、バックアップにはあるバナー：${lostBanners.length}曲（${lostBanners.slice(0, 5).map(s => escapeHtml(s.title)).join('、')}${lostBanners.length > 5 ? ' など' : ''}）</div>` : ''}
        <div class="br-actions">
            <button type="button" class="admin-btn" onclick="restoreSelectedBackup('banners')"${lostBanners.length ? '' : ' disabled'}>消えたバナーだけ戻す</button>
            <button type="button" class="admin-btn" onclick="restoreSelectedBackup('records')">[${escapeHtml(u)}] の記録だけ戻す</button>
            <button type="button" class="admin-btn admin-btn-danger" onclick="restoreSelectedBackup('all')">楽曲リスト＋[${escapeHtml(u)}] の記録を戻す</button>
        </div>
        <div class="br-note">記録を戻すと、バックアップより後に付けた記録は消えます。戻したあとでも、ここからまた別のバックアップに戻せます。</div>`;
}

async function restoreSelectedBackup(kind) {
    const st = backupRestoreState;
    if (!st || !st.selected) return;
    const d = st.selected.data;
    if (kind === 'banners') {
        await restoreBannersFromSongs(d.songs || []);
        renderBackupRestore();
        return;
    }
    if (!checkAdminAuth()) return;
    const u = currentUser;
    const label = kind === 'all' ? `楽曲リスト（${(d.songs || []).length}曲）と [${u}] の記録` : `[${u}] の記録`;
    if (!confirm(`${st.selected.label} のバックアップから、${label}を戻します。\nバックアップより後の変更は消えます。よろしいですか？`)) return;
    // 記録：バックアップにある種類だけ置き換える（自動保存が、変わった所だけをクラウドに送る）
    const bu = (d.users || {})[u];
    if (bu) {
        if (!allUsersData[u]) allUsersData[u] = emptyUser();
        RECORD_TYPES.forEach(type => { if (bu[type] && typeof bu[type] === 'object') allUsersData[u][type] = JSON.parse(JSON.stringify(bu[type])); });
        clearRecords = allUsersData[u].clearRecords;
        scoreRecords = allUsersData[u].scoreRecords;
        memoRecords = allUsersData[u].memoRecords;
        if (typeof clearHistoryMinBadCache === 'function') clearHistoryMinBadCache();
        scheduleAutoSave();
    }
    let songsOk = true;
    if (kind === 'all' && Array.isArray(d.songs) && d.songs.length > 0) {
        songs = normalizeSongsCopy(d.songs).map((s, i) => Object.assign(s, { originalOrder: s.originalOrder !== undefined ? s.originalOrder : i }));
        songsOk = await saveToCloud(true, currentUser, null, { replaceSongs: true });
    }
    updateDynamicFilters();
    renderTable();
    alert(songsOk ? '戻しました。' : '記録は戻しました。楽曲リストの保存はできませんでした（もう一度試してください）。');
    closeBackupRestoreModal();
}

// ---------- 保存の記録 ----------
async function loadSaveLog() {
    const st = backupRestoreState;
    if (!st) return;
    try {
        const res = await fetch(GAS_URL + '?mode=log', { signal: AbortSignal.timeout(20000) });
        const json = await res.json();
        st.log = json && json.status === 'success' && Array.isArray(json.log) ? json.log : [];
        if (!(json && json.status === 'success')) st.logNote = '保存の記録は、GAS を新しくすると残るようになります（gas/Code.gs）。';
    } catch (e) {
        st.log = [];
        st.logNote = '保存の記録を読めませんでした。';
    }
    renderBackupRestore();
}

const SAVE_LOG_TYPE_LABELS = { patchRecords: '記録', patchSongs: '楽曲リスト（変わった所）', updateSongs: '楽曲リスト（全部）', updateClears: '記録（全部）' };

function buildSaveLogHtml(log) {
    const st = backupRestoreState;
    if (!log || log.length === 0) return `<div class="br-note">${escapeHtml((st && st.logNote) || 'まだありません')}</div>`;
    return `<div class="br-log">${log.slice().reverse().slice(0, 100).map(e => {
        const d = e.d || {};
        const detail = e.type === 'patchSongs' ? `変更 ${d.set || 0}・追加 ${d.add || 0}・削除 ${d.remove || 0}`
            : e.type === 'patchRecords' ? `${d.records || 0}件` : e.type === 'updateSongs' ? `${d.songs || 0}曲` : '';
        return `<div class="br-log-row"><span>${escapeHtml(formatBackupTime(e.t))}</span><span>${escapeHtml(SAVE_LOG_TYPE_LABELS[e.type] || e.type)}${e.user ? ` [${escapeHtml(e.user)}]` : ''}</span><small>${escapeHtml(detail)}・${escapeHtml(e.device || '?')}・ver ${escapeHtml(e.app || '?')}</small></div>`;
    }).join('')}</div>`;
}
