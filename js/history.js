// ==========================================
// history.js
// メダル・スコアの更新履歴。
// 自分で変えたとき（メダル・スコアの入力）と、公式データ取り込みで変わったときに記録する。
// 履歴はユーザーごとに historyRecords（{ キー: 1件 }）としてクラウドに保存する。
//   1件 = { t: 日時(ms), id: 曲ID, ti: 曲名, lv: レベル, src: 'm'(手動) / 'e'(公式) / 'p'(写真から取り込んだ過去の分),
//          om / nm: メダルの変更前・後（メダルが変わったときだけ）, os / ns: スコアの変更前・後（スコアが変わったときだけ。なしは null）,
//          ob / nb: BAD の数の変更前・後（クリアしたときの一番少ない BAD。変わったときだけ。なしは null） }
// ==========================================

const HISTORY_MAX = 20000;     // これより多くなったら古いものから消す（写真から取り込んだ過去の分も入るので多めに）
const HISTORY_PAGE_SIZE = 200; // 画面に一度に出す件数

let historyShowCount = HISTORY_PAGE_SIZE;
let historyOpenDays = null; // 開いている日付（null = まだ決めていない → 一番新しい日だけ開く）

// ---------- BAD の数（クリアしたときの一番少ない BAD）：ユーザーごとに badRecords { 曲ID: 数 } ----------
function getBadRecords(user = currentUser) {
    if (!allUsersData[user]) allUsersData[user] = emptyUser();
    if (!allUsersData[user].badRecords) allUsersData[user].badRecords = {};
    return allUsersData[user].badRecords;
}

const toBadNum = v => (v === undefined || v === null || v === '' || isNaN(parseInt(v, 10)) || parseInt(v, 10) < 0) ? null : parseInt(v, 10);

// 曲の BAD の数：記録があればその数、なければフルコンボ以上（銀丸以上）なら 0、どちらでもなければ null
function getSongBad(id) {
    const n = toBadNum(getBadRecords()[id]);
    if (n !== null) return n;
    const m = MEDAL_TYPES[clearRecords[id] || ''];
    return m && m.rank >= MEDAL_TYPES['銀丸'].rank ? 0 : null;
}

// BAD の数を変える（null で消す）。変わったら履歴にも残す
function setSongBad(id, value, src) {
    const recs = getBadRecords();
    const old = toBadNum(recs[id]);
    const n = toBadNum(value);
    if (old === n) return false;
    addHistoryEntry(songs.find(s => s.id === id), { bad: [old, n] }, src);
    if (n === null) delete recs[id]; else recs[id] = n;
    return true;
}

function historyBadHtml(ob, nb) {
    const v = x => (x === null || x === undefined ? '-' : x);
    return `<span class="hist-bad">BAD ${v(ob)} → <b>${nb === null || nb === undefined ? '削除' : nb}</b></span>`;
}

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
    if (change.bad) {
        const ob = toBadNum(change.bad[0]), nb = toBadNum(change.bad[1]);
        if (ob !== nb) { entry.ob = ob; entry.nb = nb; }
    }
    if (!('nm' in entry) && !('ns' in entry) && !('nb' in entry)) return;

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
    [['nm', 'om', 'medal'], ['ns', 'os', 'score'], ['nb', 'ob', 'bad']].forEach(([newKey, oldKey, field]) => {
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
    if (song && plan.revert.bad) lines.push(`BAD：${scoreName(plan.revert.bad.from)} → ${scoreName(plan.revert.bad.to)} に戻します`);
    if (plan.relink.length > 0) lines.push('（この曲はあとでも更新しているので、その分は今のままです）');
    if (lines.length === 0) lines.push('（曲のメダル・スコア・BAD は変わりません）');
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
    if (song && plan.revert.bad) {
        const recs = getBadRecords();
        if (toBadNum(recs[e.id]) === plan.revert.bad.from) {
            if (plan.revert.bad.to === null) delete recs[e.id]; else recs[e.id] = plan.revert.bad.to;
        }
    }
    // 後の履歴の「変更前」をつなぎ直す。変更前と変更後が同じになったら、その項目（全部なら履歴ごと）を消す
    plan.relink.forEach(({ key: k, oldKey, newKey, value }) => {
        const x = records[k];
        x[oldKey] = value;
        if (x[oldKey] === x[newKey]) { delete x[oldKey]; delete x[newKey]; }
        if (!('nm' in x) && !('ns' in x) && !('nb' in x)) delete records[k];
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
            if ('nb' in e) parts.push(historyBadHtml(e.ob, e.nb));
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
//   ファイルの形：{ type: 'popn-history-import', entries: [{ t: 日時(ms) か 'YYYY-MM-DD', ti: 曲名, g?: ジャンル, lv: レベル,
//                    om?/nm?: メダル, os?/ns?: スコア, ob?/nb?: BAD, k?: 曲の鍵 }],
//                  bads?: [{ ti, g?, lv, n, k? }], songs?: [{ k, ti, g?, lv, q?: 曲名に自信がない, bn?: 写真のバナー(64×16 の data URI) }] }
//   アプリの曲とは、曲名とレベルで合わせる（同じ曲名が複数あればジャンル・UPPER で絞る）。
//   合わなかった曲は、写真のバナーを同じレベルの曲のバナーと比べて、似ている順に候補を出す（一番似ている曲を選んでおく）。
//   その曲の今ある一番古い履歴（写真以外）より後の日付のものは、今の履歴と同じ更新（前後3日・メダルかスコアが同じ）なら
//   今の履歴に BAD だけ書き足し、それ以外は飛ばす。同じものがすでにあれば飛ばす。今ある履歴・今のメダル・スコアは消さない
const HISTORY_IMPORT_MAX_BYTES = 20 * 1024 * 1024;
const HISTORY_MERGE_DAYS = 3;
const BANNER_W = 64, BANNER_H = 16;
const BANNER_PICK_MIN = 0.5;       // これより似ていなければ、最初は「入れない」にしておく
const BANNER_LOAD_CONCURRENCY = 6;
let pendingHistoryImport = null;
const bannerVectorCache = new Map(); // 曲ID → 正規化したバナーの色（読めなければ null）

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
    openHistoryImportPreview(data.entries, Array.isArray(data.bads) ? data.bads : [], Array.isArray(data.songs) ? data.songs : []);
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

function openHistoryImportPreview(rawEntries, rawBads = [], rawSongs = []) {
    const fileSongs = {};
    rawSongs.forEach(s => { if (s && typeof s.k === 'string' && typeof s.ti === 'string') fileSongs[s.k] = s; });
    // 曲名とレベルで合わなかった曲のうち、写真のバナーがあるもの（バナーで探す）
    const pickKeys = Object.keys(fileSongs).filter(k => !matchHistoryImportSong(fileSongs[k]) && /^data:image\//.test(fileSongs[k].bn || ''));
    const state = { user: currentUser, rawEntries, rawBads, fileSongs, pickKeys, choice: {}, cands: {}, progress: pickKeys.length ? { done: 0, total: 0 } : null };
    pendingHistoryImport = state;
    renderHistoryImport();
    document.getElementById('history-import-modal').style.display = 'flex';
    if (pickKeys.length) compareHistoryImportBanners(state);
}

// 1件の曲（entries・bads の1件）を、アプリの曲に（バナーで選んだ曲も含めて）
function resolveHistoryImportSong(state, r) {
    const fs = r.k && state.fileSongs[r.k];
    if (fs) {
        const m = matchHistoryImportSong(fs);
        if (m) return m;
        const id = state.choice[r.k];
        return id ? songs.find(s => s.id === id) || null : null;
    }
    return matchHistoryImportSong(r);
}

// 取り込む中身を計算する（バナーの選び直しのたびに呼ぶ）
function calcHistoryImport(state) {
    const records = getHistoryRecords();
    const existing = Object.entries(records).filter(([, e]) => e && typeof e.t === 'number');
    // 曲ごとの、今ある一番古い履歴（写真以外）の日時と、写真以外の履歴
    const earliest = {}, ownById = {};
    existing.forEach(([key, e]) => {
        if (e.src === 'p') return;
        if (!(earliest[e.id] <= e.t)) earliest[e.id] = e.t;
        (ownById[e.id] || (ownById[e.id] = [])).push({ key, e });
    });
    const sameKey = e => [e.id, e.t, e.nm ?? '', e.ns ?? '', e.nb ?? ''].join('|');
    const have = new Set(existing.map(([, e]) => sameKey(e)));
    const toNum = v => (v === undefined || v === null || v === '' || isNaN(parseInt(v, 10))) ? null : parseInt(v, 10);

    const add = [], merges = [], unmatched = [];
    let newer = 0, dup = 0, bad = 0, same = 0;
    const mergedKeys = new Set();
    // ファイルの中に同じ曲の更新がいくつかあれば、日付の古い順に並べてつなぐ：
    //   2件目からの「変更前」は、ファイルの中のその曲の1つ前の「変更後」にする（変わっていなければその項目は外す）
    const timed = state.rawEntries.map((r, i) => ({ r, i, t: r ? parseHistoryImportTime(r.t) : null }));
    timed.sort((a, b) => (a.t === null) - (b.t === null) || (a.t - b.t) || (a.i - b.i));
    const prev = {}; // 曲ID → { m, s, b }（ファイルの中で1つ前の変更後）
    timed.forEach(({ r, t }) => {
        if (!r || t === null || typeof r.ti !== 'string') { bad++; return; }
        const song = resolveHistoryImportSong(state, r);
        if (!song) { if (!(r.k && state.pickKeys.includes(r.k))) unmatched.push(r); return; }
        const p = prev[song.id] || (prev[song.id] = {});
        const e = { t, id: song.id, ti: song.title, lv: song.level, src: 'p' };
        if (typeof r.nm === 'string' && (r.nm === '' || MEDAL_TYPES[r.nm])) {
            const om = 'm' in p ? p.m : (MEDAL_TYPES[r.om] ? r.om : '');
            if (om !== r.nm) { e.om = om; e.nm = r.nm; }
            p.m = r.nm;
        }
        if ('ns' in r) {
            const os = 's' in p ? p.s : toNum(r.os);
            const ns = toNum(r.ns);
            if (os !== ns) { e.os = os; e.ns = ns; }
            p.s = ns;
        }
        if ('nb' in r) {
            const ob = 'b' in p ? p.b : toBadNum(r.ob);
            const nb = toBadNum(r.nb);
            if (ob !== nb) { e.ob = ob; e.nb = nb; }
            p.b = nb;
        }
        if (!('nm' in e) && !('ns' in e) && !('nb' in e)) { bad++; return; }
        if (earliest[song.id] !== undefined && t >= earliest[song.id]) {
            // 今の履歴と同じ更新（前後3日・メダルかスコアが同じ）なら、今の履歴に BAD だけ書き足す
            const hit = (ownById[song.id] || []).find(({ e: x }) => Math.abs(x.t - t) <= HISTORY_MERGE_DAYS * DAY_MS
                && (('nm' in e && 'nm' in x && x.nm === e.nm) || ('ns' in e && 'ns' in x && x.ns === e.ns)));
            if (hit) {
                same++;
                if ('nb' in e && !('nb' in hit.e) && !mergedKeys.has(hit.key)) { mergedKeys.add(hit.key); merges.push({ key: hit.key, ob: e.ob, nb: e.nb }); }
            } else newer++;
            return;
        }
        if (have.has(sameKey(e))) { dup++; return; }
        have.add(sameKey(e));
        add.push(e);
    });
    // BAD の数（今の記録が無いか、今より少ないものだけ）
    const badRecs = getBadRecords();
    const badSet = {};
    state.rawBads.forEach(r => {
        const n = r ? toBadNum(r.n) : null;
        if (n === null || typeof r.ti !== 'string') return;
        const song = resolveHistoryImportSong(state, r);
        if (!song) return;
        const cur = toBadNum(badRecs[song.id]);
        if ((cur === null || n < cur) && !(badSet[song.id] <= n)) badSet[song.id] = n;
    });
    return { add, merges, badSet, unmatched, newer, dup, bad, same, existingCount: existing.length };
}

function renderHistoryImport() {
    const state = pendingHistoryImport;
    if (!state) return;
    const c = calcHistoryImport(state);
    state.calc = c;
    const badCount = Object.keys(c.badSet).length;
    const byDay = {};
    c.add.forEach(e => { const k = localDateKey(e.t); byDay[k] = (byDay[k] || 0) + 1; });
    const days = Object.keys(byDay).sort();
    const over = c.existingCount + c.add.length > HISTORY_MAX;
    const unmatchedNames = [...new Set(c.unmatched.map(r => `Lv${r.lv} ${r.ti}`))];
    const body = document.getElementById('history-import-body');
    const scrollTop = body.scrollTop;
    body.innerHTML = `
        <div class="eagate-summary">
            <div>${escapeHtml(currentUser)} さんの更新履歴に <b>${c.add.length}</b> 件を足します</div>
            ${c.same ? `<div class="hi-note">今の履歴と同じ更新 ${c.same} 件は、今の履歴を残します${c.merges.length ? `（BAD を ${c.merges.length} 件に書き足します）` : ''}</div>` : ''}
            ${c.newer ? `<div class="hi-note">今の履歴より新しい日付の ${c.newer} 件は飛ばします</div>` : ''}
            ${c.dup ? `<div class="hi-note">すでに取り込んでいる ${c.dup} 件は飛ばします</div>` : ''}
            ${c.bad ? `<div class="hi-note">読めなかった ${c.bad} 件は飛ばします</div>` : ''}
            ${over ? `<div class="hi-warn">履歴が ${HISTORY_MAX} 件を超えるため、古いものから消えます</div>` : ''}
            ${badCount ? `<div>BAD の数を <b>${badCount}</b> 曲に入れます（今の記録が無いか、今より少ない曲）</div>` : ''}
        </div>
        ${buildHistoryImportPickHtml(state)}
        ${days.length ? `<details class="hi-days-wrap"><summary>日付ごとの件数（${days.length}日）</summary><div class="hi-days">${days.map(k => `<div><span>${escapeHtml(k.replace(/-/g, '/'))}</span><b>${byDay[k]}件</b></div>`).join('')}</div></details>` : ''}
        ${unmatchedNames.length ? `<details class="eagate-unmatched"><summary>アプリの曲と合わなかった曲（${unmatchedNames.length}曲）</summary><ul>${unmatchedNames.slice(0, 300).map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul></details>` : ''}`;
    body.scrollTop = scrollTop;
    document.getElementById('history-import-apply').disabled = (c.add.length === 0 && badCount === 0 && c.merges.length === 0) || !!(state.progress && state.progress.done < state.progress.total);
}

// 曲名で合わなかった曲：写真のバナーと、似ている順の候補（押して選ぶ）
function buildHistoryImportPickHtml(state) {
    if (state.pickKeys.length === 0) return '';
    const pr = state.progress;
    if (pr && (pr.total === 0 || pr.done < pr.total)) {
        return `<div class="hi-pick-wrap"><div class="hi-pick-title">曲名で合わなかった曲（${state.pickKeys.length}曲）</div>
            <div class="hi-note">バナーを比べています…（${pr.done} / ${pr.total || '?'}）</div></div>`;
    }
    const banner = (src, alt) => src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy">` : '<span class="hi-nobanner">バナーなし</span>';
    const rows = state.pickKeys.map(k => {
        const fs = state.fileSongs[k];
        const chosen = state.choice[k] || '';
        const cands = (state.cands[k] || []).map(c => {
            const song = songs.find(s => s.id === c.id);
            if (!song) return '';
            return `<button type="button" class="hi-cand${chosen === song.id ? ' active' : ''}" onclick="pickHistoryImportSong('${jsStringAttr(k)}', '${jsStringAttr(song.id)}')">
                ${banner(safeUrl(song.bannerUrl, true), song.title)}<span class="hi-cand-title">${escapeHtml(song.title)}</span><span class="hi-cand-sim">${Math.round(Math.max(0, c.sim) * 100)}%</span></button>`;
        }).join('');
        return `<div class="hi-pick">
            <div class="hi-pick-head">${banner(fs.bn, '写真のバナー')}<span><span class="level-badge">${escapeHtml(fs.lv)}</span> ${escapeHtml(fs.ti)}</span></div>
            <div class="hi-cands">${cands || '<span class="hi-note">同じレベルにバナーのある曲がありません</span>'}
                <button type="button" class="hi-cand hi-cand-none${chosen === '' ? ' active' : ''}" onclick="pickHistoryImportSong('${jsStringAttr(k)}', '')">入れない</button></div>
        </div>`;
    }).join('');
    const picked = state.pickKeys.filter(k => state.choice[k]).length;
    return `<div class="hi-pick-wrap"><div class="hi-pick-title">曲名で合わなかった曲（${state.pickKeys.length}曲・${picked}曲を選択中）</div>
        <div class="hi-note">写真のバナー（左）に似ている順に、同じレベルの曲を出しています。押して選び直せます。</div>${rows}</div>`;
}

function pickHistoryImportSong(k, id) {
    const state = pendingHistoryImport;
    if (!state) return;
    state.choice[k] = id;
    renderHistoryImport();
}

// バナーの色を、64×16 に縮めて明るさをそろえた数の並びにする（読めなければ null）
function loadBannerVector(src) {
    return new Promise(resolve => {
        const img = new Image();
        if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous';
        const timer = setTimeout(() => { img.src = ''; resolve(null); }, 15000);
        img.onload = () => {
            clearTimeout(timer);
            try {
                const cv = document.createElement('canvas');
                cv.width = BANNER_W; cv.height = BANNER_H;
                const ctx = cv.getContext('2d');
                ctx.drawImage(img, 0, 0, BANNER_W, BANNER_H);
                const d = ctx.getImageData(0, 0, BANNER_W, BANNER_H).data;
                const v = new Float32Array(BANNER_W * BANNER_H * 3);
                let sum = 0;
                for (let i = 0, j = 0; i < d.length; i += 4) { v[j++] = d[i]; v[j++] = d[i + 1]; v[j++] = d[i + 2]; }
                v.forEach(x => { sum += x; });
                const mean = sum / v.length;
                let sq = 0;
                for (let i = 0; i < v.length; i++) { v[i] -= mean; sq += v[i] * v[i]; }
                const norm = Math.sqrt(sq) || 1;
                for (let i = 0; i < v.length; i++) v[i] /= norm;
                resolve(v);
            } catch (e) { resolve(null); }
        };
        img.onerror = () => { clearTimeout(timer); resolve(null); };
        img.src = src;
    });
}

function bannerSimilarity(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
}

async function compareHistoryImportBanners(state) {
    const levels = new Set(state.pickKeys.map(k => String(state.fileSongs[k].lv)));
    const targets = songs.filter(s => levels.has(String(s.level)) && isImageSrc(s.bannerUrl) && !bannerVectorCache.has(s.id));
    state.progress = { done: 0, total: targets.length + state.pickKeys.length };
    renderHistoryImport();
    let next = 0;
    const tick = () => { state.progress.done++; if (state.progress.done % 10 === 0 && pendingHistoryImport === state) renderHistoryImport(); };
    const worker = async () => {
        while (next < targets.length && pendingHistoryImport === state) {
            const s = targets[next++];
            const src = s.bannerUrl.startsWith('data:') ? s.bannerUrl : toImageProxyUrl(s.bannerUrl);
            bannerVectorCache.set(s.id, await loadBannerVector(src));
            tick();
        }
    };
    await Promise.all(Array.from({ length: BANNER_LOAD_CONCURRENCY }, worker));
    for (const k of state.pickKeys) {
        if (pendingHistoryImport !== state) return;
        const fs = state.fileSongs[k];
        const v = await loadBannerVector(fs.bn);
        const list = [];
        if (v) {
            songs.forEach(s => {
                if (String(s.level) !== String(fs.lv)) return;
                const w = bannerVectorCache.get(s.id);
                if (w) list.push({ id: s.id, sim: bannerSimilarity(v, w) });
            });
        }
        list.sort((a, b) => b.sim - a.sim);
        state.cands[k] = list.slice(0, 3);
        state.choice[k] = list.length && list[0].sim >= BANNER_PICK_MIN ? list[0].id : '';
        tick();
    }
    if (pendingHistoryImport === state) renderHistoryImport();
}

function closeHistoryImport() {
    pendingHistoryImport = null;
    document.getElementById('history-import-modal').style.display = 'none';
}

function applyHistoryImport() {
    const state = pendingHistoryImport;
    if (!state || !state.calc) return;
    if (state.user !== currentUser) { alert('ユーザーが切り替わったので、取り込みをやめました。'); closeHistoryImport(); return; }
    const c = calcHistoryImport(state);
    const records = getHistoryRecords();
    c.add.forEach(e => { records[e.t.toString(36) + '_p' + Math.random().toString(36).slice(2, 7)] = e; });
    // 今の履歴と同じ更新：今の履歴は残し、BAD だけ書き足す
    c.merges.forEach(m => { const x = records[m.key]; if (x && !('nb' in x)) { x.ob = m.ob; x.nb = m.nb; } });
    const badRecs = getBadRecords();
    Object.keys(c.badSet).forEach(id => { badRecs[id] = c.badSet[id]; });
    const keys = Object.keys(records);
    if (keys.length > HISTORY_MAX) {
        keys.sort((a, b) => (records[a].t || 0) - (records[b].t || 0)).slice(0, keys.length - HISTORY_MAX).forEach(k => delete records[k]);
    }
    closeHistoryImport();
    scheduleAutoSave();
    renderTable();
    const nBad = Object.keys(c.badSet).length;
    showToast('toast-eagate', `過去の更新履歴を取り込みました（${c.add.length}件${c.merges.length ? `・BAD 書き足し ${c.merges.length}件` : ''}${nBad ? `・BAD ${nBad}曲` : ''}）`, '#4caf50', 3000);
}
