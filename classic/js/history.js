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
    if (m && (m.imgUrl.startsWith('http') || m.imgUrl.startsWith('data:'))) {
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

// 履歴を1件消す（曲のメダル・スコアはそのまま）。消したことは自動保存でクラウドにも反映される
function deleteHistoryEntry(key) {
    const records = getHistoryRecords();
    if (!records[key]) return;
    if (!confirm('この履歴を削除しますか？\n（曲のメダル・スコアは変わりません）')) return;
    delete records[key];
    scheduleAutoSave();
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

    let html = '';
    let lastDay = '';
    list.slice(0, historyShowCount).forEach(({ key, e }) => {
        const d = new Date(e.t);
        const day = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}（${HISTORY_WEEKDAYS[d.getDay()]}）`;
        if (day !== lastDay) {
            html += `<div class="hist-day">${day}</div>`;
            lastDay = day;
        }
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
                    <button type="button" class="hist-delete" onclick="deleteHistoryEntry('${jsStringAttr(key)}')" title="この履歴を削除" aria-label="この履歴を削除">✕</button>
                </div>
                <div class="hist-body">${parts.join('')}</div>
            </div>`;
    });
    if (list.length > historyShowCount) {
        html += `<button class="hist-more" onclick="showMoreHistory()">さらに表示（残り ${list.length - historyShowCount}件）</button>`;
    }
    body.innerHTML = html;
}
