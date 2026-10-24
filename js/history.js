// ==========================================
// history.js
// メダル・スコアの更新履歴。
// 自分で変えたとき（メダル・スコアの入力）と、公式データ取り込みで変わったときに記録する。
// 履歴はユーザーごとに historyRecords（{ キー: 1件 }）としてクラウドに保存する。
//   1件 = { t: 日時(ms), id: 曲ID, ti: 曲名, lv: レベル, src: 'm'(手動) / 'e'(公式),
//          om / nm: メダルの変更前・後（メダルが変わったときだけ）, os / ns: スコアの変更前・後（スコアが変わったときだけ。なしは null） }
// ==========================================

const HISTORY_MAX = 5000;      // これより多くなったら古いものから消す
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
                    <span class="hist-src ${e.src === 'e' ? 'eagate' : 'manual'}">${e.src === 'e' ? '公式' : '手動'}</span>
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
