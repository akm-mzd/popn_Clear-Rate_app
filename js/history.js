// ==========================================
// history.js
// メダル・スコアの更新履歴。
// 自分で変えたとき（メダル・スコアの入力）と、公式データ取り込みで変わったときに記録する。
// 履歴はユーザーごとに historyRecords（{ キー: 1件 }）としてクラウドに保存する。
//   1件 = { t: 日時(ms), id: 曲ID, ti: 曲名, lv: レベル, src: 'm'(手動) / 'e'(公式) / 'p'(写真から取り込んだ過去の分),
//          om / nm: メダルの変更前・後（メダルが変わったときだけ）, os / ns: スコアの変更前・後（スコアが変わったときだけ。なしは null） }
// ==========================================

const HISTORY_MAX = 20000;     // これより多くなったら古いものから消す（写真から取り込んだ過去の分も入るので多めに）
const HISTORY_PAGE_SIZE = 200; // 画面に一度に出す件数

let historyShowCount = HISTORY_PAGE_SIZE;
let historyOpenDays = null; // 開いている日付（null = まだ決めていない → 一番新しい日だけ開く）

function getHistoryRecords(user = currentUser) {
    if (!allUsersData[user]) allUsersData[user] = emptyUser();
    if (!allUsersData[user].historyRecords) allUsersData[user].historyRecords = {};
    return allUsersData[user].historyRecords;
}

// 1曲分の変更を記録する。change は { medal: [前, 後] } / { score: [前, 後] } のどちらか・両方
let lastHistoryTime = 0;

function addHistoryEntry(song, change, src) {
    if (!song) return;
    // 同時に記録した分も順番が保てるよう、日時は必ず前の記録より後にする
    lastHistoryTime = Math.max(Date.now(), lastHistoryTime + 1);
    const entry = { t: lastHistoryTime, id: song.id, ti: song.title, lv: song.level, src: src === 'e' ? 'e' : 'm' };
    if (change.medal && change.medal[0] !== change.medal[1]) {
        entry.om = change.medal[0] || '';
        entry.nm = change.medal[1] || '';
    }
    if (change.score) {
        const toNum = v => (v === undefined || v === null || v === '' || isNaN(parseInt(v, 10))) ? null : parseInt(v, 10);
        const os = toNum(change.score[0]), ns = toNum(change.score[1]);
        if (os !== ns) { entry.os = os; entry.ns = ns; }
    }
    if (!('nm' in entry) && !('ns' in entry)) return;

    const records = getHistoryRecords();
    const key = entry.t.toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    records[key] = entry;

    // 多すぎたら古いものから消す
    const keys = Object.keys(records);
    if (keys.length > HISTORY_MAX) {
        keys.sort((a, b) => (records[a].t || 0) - (records[b].t || 0))
            .slice(0, keys.length - HISTORY_MAX)
            .forEach(k => delete records[k]);
    }
}

// ---------- 履歴を見る画面 ----------
function openHistoryModal() {
    toggleMenu(false);
    historyShowCount = HISTORY_PAGE_SIZE;
    historyOpenDays = null;
    renderHistoryModal();
    document.getElementById('history-modal').style.display = 'flex';
}

function closeHistoryModal() {
    document.getElementById('history-modal').style.display = 'none';
}

function showMoreHistory() {
    historyShowCount += HISTORY_PAGE_SIZE;
    renderHistoryModal();
}

function historyMedalHtml(key) {
    if (key === '') return '<span class="hist-medal-text">未プレイ</span>';
    if (key === '未解禁') return '<span class="hist-medal-text">🔒未解禁</span>';
    const m = MEDAL_TYPES[key];
    if (m && isImageSrc(m.imgUrl)) {
        return `<img class="hist-medal" src="${escapeHtml(m.imgUrl)}" alt="${escapeHtml(m.label)}" title="${escapeHtml(m.label)}">`;
    }
    return `<span class="hist-medal-text">${escapeHtml(m ? m.label : key)}</span>`;
}

function historyScoreHtml(os, ns) {
    if (ns === null) return `<span class="hist-score">${os} → <b>削除</b></span>`;
    if (os === null) return `<span class="hist-score">- → <b>${ns}</b></span>`;
    const diff = ns - os;
    const diffText = diff >= 0 ? `+${diff}` : `−${-diff}`;
    return `<span class="hist-score">${os} → <span class="hist-diff ${diff >= 0 ? 'up' : 'down'}">(${diffText})</span> <b>${ns}</b></span>`;
}

// 履歴を1件消す（管理者だけ）。消した変更は、なかったことにする：
//   その曲のそれより後の変更がなければ、メダル・スコアを変更前に戻す（例：銅丸 → 銅菱 を消すと銅丸に戻る）
//   後の変更があれば、今のメダル・スコアはそのままにして、次の履歴の「変更前」をこの履歴の変更前につなぎ直す
//   消したことは自動保存でクラウドにも反映される
function planHistoryUndo(records, key) {
    const e = records[key];
    const plan = { revert: {}, relink: [] };
    [['nm', 'om', 'medal'], ['ns', 'os', 'score']].forEach(([newKey, oldKey, field]) => {
        if (!(newKey in e)) return;
        // 同じ曲・同じ項目の、この履歴より後の変更で一番早いもの
        let next = null;
        Object.keys(records).forEach(k => {
            const x = records[k];
            if (k === key || !x || x.id !== e.id || !(newKey in x) || !(x.t > e.t)) return;
            if (!next || x.t < records[next].t) next = k;
        });
        if (next) plan.relink.push({ key: next, oldKey, newKey, value: e[oldKey] });
        else plan.revert[field] = { from: e[newKey], to: e[oldKey] };
    });
    return plan;
}

function deleteHistoryEntry(key) {
    const records = getHistoryRecords();
    const e = records[key];
    if (!e) return;
    if (!checkAdminAuth()) return;
    const song = songs.find(s => s.id === e.id);
    const plan = planHistoryUndo(records, key);
    const lines = [];
    const medalName = k => k === '' ? '未プレイ' : k;
    const scoreName = v => v === null || v === undefined ? 'なし' : String(v);
    if (song && plan.revert.medal) lines.push(`メダル：${medalName(plan.revert.medal.from)} → ${medalName(plan.revert.medal.to)} に戻します`);
    if (song && plan.revert.score) lines.push(`スコア：${scoreName(plan.revert.score.from)} → ${scoreName(plan.revert.score.to)} に戻します`);
    if (plan.relink.length > 0) lines.push('（この曲はあとでも更新しているので、その分は今のままです）');
    if (lines.length === 0) lines.push('（曲のメダル・スコアは変わりません）');
    if (!confirm(`この履歴を削除しますか？\n${e.ti}\n${lines.join('\n')}`)) return;

    // 変更前に戻す（今の値が履歴の「変更後」と違うときは、別の方法で変わっているので触らない）
    if (song && plan.revert.medal && (clearRecords[e.id] || '') === plan.revert.medal.from) {
        if (plan.revert.medal.to === '') delete clearRecords[e.id];
        else clearRecords[e.id] = plan.revert.medal.to;
    }
    if (song && plan.revert.score) {
        const cur = scoreRecords[e.id];
        const curNum = cur === undefined || cur === null || cur === '' ? null : parseInt(cur, 10);
        if (curNum === plan.revert.score.from) {
            if (plan.revert.score.to === null) delete scoreRecords[e.id];
            else scoreRecords[e.id] = plan.revert.score.to;
        }
    }
    // 後の履歴の「変更前」をつなぎ直す。変更前と変更後が同じになったら、その項目（全部なら履歴ごと）を消す
    plan.relink.forEach(({ key: k, oldKey, newKey, value }) => {
        const x = records[k];
        x[oldKey] = value;
        if (x[oldKey] === x[newKey]) { delete x[oldKey]; delete x[newKey]; }
        if (!('nm' in x) && !('ns' in x)) delete records[k];
    });
    delete records[key];
    scheduleAutoSave();
    renderTable();
    const body = document.getElementById('history-modal-body');
    const scrollTop = body.scrollTop;
    renderHistoryModal();
    body.scrollTop = scrollTop;
}

const HISTORY_WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const HISTORY_SRC = { m: ['manual', '手動'], e: ['eagate', '公式'], p: ['photo', '写真'] };

function renderHistoryModal() {
    const records = getHistoryRecords();
    const list = Object.keys(records).map(k => ({ key: k, e: records[k] }))
        .filter(x => x.e && typeof x.e.t === 'number')
        .sort((a, b) => b.e.t - a.e.t);
    document.getElementById('history-modal-title').textContent = `📜 ${currentUser} さんの更新履歴（${list.length}件）`;

    const body = document.getElementById('history-modal-body');
    if (list.length === 0) {
        body.innerHTML = '<div class="hist-empty">まだ履歴がありません。メダルやスコアを変えると、ここに記録されます。</div>';
        return;
    }

    // 日付ごとにまとめる（新しい日が上）
    const days = [];
    list.slice(0, historyShowCount).forEach(({ key, e }) => {
        const d = new Date(e.t);
        const day = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}（${HISTORY_WEEKDAYS[d.getDay()]}）`;
        if (days.length === 0 || days[days.length - 1].day !== day) days.push({ day, items: [] });
        days[days.length - 1].items.push({ key, e, d });
    });
    // 最初は一番新しい日だけ開く。そのあとは開いた・閉じた状態を画面を閉じるまで覚えておく
    if (historyOpenDays === null) historyOpenDays = new Set(days.length > 0 ? [days[0].day] : []);

    let html = '';
    days.forEach(({ day, items }) => {
        html += `<details class="hist-day-group" data-day="${escapeHtml(day)}"${historyOpenDays.has(day) ? ' open' : ''} ontoggle="onHistoryDayToggle(this)">
            <summary class="hist-day"><span>${day}</span><span class="hist-day-count">${items.length}件</span></summary>`;
        items.forEach(({ key, e, d }) => {
            const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
            const parts = [];
            if ('nm' in e) parts.push(`<span class="hist-change">${historyMedalHtml(e.om)}<span class="hist-arrow">→</span>${historyMedalHtml(e.nm)}</span>`);
            if ('ns' in e) parts.push(historyScoreHtml(e.os, e.ns));
            html += `
            <div class="hist-item">
                <div class="hist-head">
                    <span class="hist-time">${time}</span>
                    <span class="hist-src ${HISTORY_SRC[e.src] ? HISTORY_SRC[e.src][0] : 'manual'}">${HISTORY_SRC[e.src] ? HISTORY_SRC[e.src][1] : '手動'}</span>
                    <span class="level-badge">${escapeHtml(e.lv)}</span>
                    <span class="hist-title">${escapeHtml(e.ti)}</span>
                    <button type="button" class="hist-delete" onclick="deleteHistoryEntry('${jsStringAttr(key)}')" title="この履歴を削除（管理者のみ）" aria-label="この履歴を削除（管理者のみ）">✕</button>
                </div>
                <div class="hist-body">${parts.join('')}</div>
            </div>`;
        });
        html += `</details>`;
    });
    if (list.length > historyShowCount) {
        html += `<button class="hist-more" onclick="showMoreHistory()">さらに表示（残り ${list.length - historyShowCount}件）</button>`;
    }
    body.innerHTML = html;
}

function onHistoryDayToggle(el) {
    if (!historyOpenDays) historyOpenDays = new Set();
    if (el.open) historyOpenDays.add(el.dataset.day); else historyOpenDays.delete(el.dataset.day);
}

// ---------- 過去の更新履歴の取り込み（昔の公式サイトの写真から作ったファイル） ----------
//   ファイルの形：{ type: 'popn-history-import', v: 1, entries: [{ t: 日時(ms) か 'YYYY-MM-DD', ti: 曲名, g?: ジャンル, lv: レベル, om?/nm?: メダル, os?/ns?: スコア }] }
//   アプリの曲とは、曲名とレベルで合わせる（同じ曲名が複数あればジャンル・UPPER で絞る）。
//   今の履歴と食い違わないよう、その曲の今ある一番古い履歴（写真以外）より後の日付のものは飛ばす。同じものがすでにあれば飛ばす
const HISTORY_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
let pendingHistoryImport = null;

async function importHistoryFromFile(event) {
    const input = event.target;
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    if (file.size > HISTORY_IMPORT_MAX_BYTES) { alert('ファイルが大きすぎます。'); return; }
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { data = null; }
    if (!data || data.type !== 'popn-history-import' || !Array.isArray(data.entries)) {
        alert('過去の更新履歴のファイルではありません。');
        return;
    }
    openHistoryImportPreview(data.entries);
}

function parseHistoryImportTime(t) {
    if (typeof t === 'number' && isFinite(t)) return t;
    const m = typeof t === 'string' && t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0).getTime() : null;
}

function matchHistoryImportSong(e) {
    const title = normalizeSongText(e.ti);
    let cands = title ? songs.filter(s => normalizeSongText(s.title) === title && String(s.level) === String(e.lv)) : [];
    if (cands.length > 1 && e.g) {
        const g = cands.filter(s => normalizeSongText(s.genre) === normalizeSongText(e.g));
        if (g.length > 0) cands = g;
    }
    if (cands.length > 1) {
        const upper = isUpperText(e.ti) || isUpperText(e.g);
        const u = cands.filter(s => songSaysUpper(s) === upper);
        if (u.length > 0) cands = u;
    }
    return cands.length === 1 ? cands[0] : null;
}

function openHistoryImportPreview(rawEntries) {
    const records = getHistoryRecords();
    const existing = Object.values(records).filter(e => e && typeof e.t === 'number');
    // 曲ごとの、今ある一番古い履歴（写真以外）の日時
    const earliest = {};
    existing.forEach(e => { if (e.src !== 'p' && !(earliest[e.id] <= e.t)) earliest[e.id] = e.t; });
    const sameKey = e => [e.id, e.t, e.nm ?? '', e.ns ?? ''].join('|');
    const have = new Set(existing.map(sameKey));
    const toNum = v => (v === undefined || v === null || v === '' || isNaN(parseInt(v, 10))) ? null : parseInt(v, 10);

    const add = [], unmatched = [];
    let newer = 0, dup = 0, bad = 0;
    rawEntries.forEach(r => {
        const t = r ? parseHistoryImportTime(r.t) : null;
        if (!r || t === null || typeof r.ti !== 'string') { bad++; return; }
        const song = matchHistoryImportSong(r);
        if (!song) { unmatched.push(r); return; }
        const e = { t, id: song.id, ti: song.title, lv: song.level, src: 'p' };
        if (typeof r.nm === 'string' && (r.nm === '' || MEDAL_TYPES[r.nm]) && (r.om || '') !== r.nm) { e.om = MEDAL_TYPES[r.om] ? r.om : ''; e.nm = r.nm; }
        if ('ns' in r && toNum(r.ns) !== toNum(r.os)) { e.os = toNum(r.os); e.ns = toNum(r.ns); }
        if (!('nm' in e) && !('ns' in e)) { bad++; return; }
        if (earliest[song.id] !== undefined && t >= earliest[song.id]) { newer++; return; }
        if (have.has(sameKey(e))) { dup++; return; }
        have.add(sameKey(e));
        add.push(e);
    });
    pendingHistoryImport = { user: currentUser, add };

    // 日付ごとの件数
    const byDay = {};
    add.forEach(e => { const k = localDateKey(e.t); byDay[k] = (byDay[k] || 0) + 1; });
    const days = Object.keys(byDay).sort();
    const over = existing.length + add.length > HISTORY_MAX;
    const unmatchedNames = [...new Set(unmatched.map(r => `Lv${r.lv} ${r.ti}`))];
    document.getElementById('history-import-body').innerHTML = `
        <div class="eagate-summary">
            <div>${escapeHtml(currentUser)} さんの更新履歴に <b>${add.length}</b> 件を足します</div>
            ${newer ? `<div class="hi-note">今の履歴より新しい日付の ${newer} 件は飛ばします</div>` : ''}
            ${dup ? `<div class="hi-note">すでに取り込んでいる ${dup} 件は飛ばします</div>` : ''}
            ${bad ? `<div class="hi-note">読めなかった ${bad} 件は飛ばします</div>` : ''}
            ${over ? `<div class="hi-warn">履歴が ${HISTORY_MAX} 件を超えるため、古いものから消えます</div>` : ''}
        </div>
        ${days.length ? `<div class="hi-days">${days.map(k => `<div><span>${escapeHtml(k.replace(/-/g, '/'))}</span><b>${byDay[k]}件</b></div>`).join('')}</div>` : ''}
        ${unmatchedNames.length ? `<details class="eagate-unmatched"><summary>アプリの曲と合わなかった曲（${unmatchedNames.length}曲）</summary><ul>${unmatchedNames.slice(0, 300).map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul></details>` : ''}`;
    document.getElementById('history-import-apply').disabled = add.length === 0;
    document.getElementById('history-import-modal').style.display = 'flex';
}

function closeHistoryImport() {
    pendingHistoryImport = null;
    document.getElementById('history-import-modal').style.display = 'none';
}

function applyHistoryImport() {
    const pending = pendingHistoryImport;
    if (!pending) return;
    if (pending.user !== currentUser) { alert('ユーザーが切り替わったので、取り込みをやめました。'); closeHistoryImport(); return; }
    const records = getHistoryRecords();
    pending.add.forEach(e => { records[e.t.toString(36) + '_p' + Math.random().toString(36).slice(2, 7)] = e; });
    const keys = Object.keys(records);
    if (keys.length > HISTORY_MAX) {
        keys.sort((a, b) => (records[a].t || 0) - (records[b].t || 0)).slice(0, keys.length - HISTORY_MAX).forEach(k => delete records[k]);
    }
    closeHistoryImport();
    scheduleAutoSave();
    renderTable();
    showToast('toast-eagate', `過去の更新履歴を取り込みました（${pending.add.length}件）`, '#4caf50', 3000);
}
