// ==========================================
// filters.js（table.js から分けたもの）
// 絞り込み（チェックリスト・スコアの範囲・今の条件のチップ）・レベルの絞り込みとレベルボタンをそろえる・
// 「更新」「最近」のレベル（更新の見方・月）・フリーワード検索と候補。
// 読み込みの順番：knock-data.js → filters.js → table.js → stats-sheet.js → views.js → pokkura.js → knock.js（元は1つの table.js）
// ==========================================
// ==========================================
// ★ 絞り込み（チェックリスト）
//   何もチェックしていない項目は「すべて」。
//   同じ項目の中は「どれか」（OR）、違う項目どうしは「すべて」（AND）で絞り込む。
//   ほかに、スコアの範囲（#filter-score-min / max）。選択肢の横には、選ぶと出る曲の数を出す。
// ==========================================
// 並びは絞り込みの欄の並びと同じ（レベル・メダル・裏メダル・旧筐体・難易度・属性・バージョン・スコア・BAD・タグ・メモ・最後に更新した日）
const FILTER_IDS = ['filter-level', 'filter-medal', 'filter-extra', 'filter-diff', 'filter-attr', 'filter-version', 'filter-rank', 'filter-bad', 'filter-affinity', 'filter-updated'];

// 項目の短い名前（今の条件のチップに使う）
const FILTER_GROUP_NAMES = {
    'filter-bad': 'BAD', 'filter-level': 'レベル', 'filter-medal': 'メダル', 'filter-rank': 'ランク', 'filter-diff': '難易度', 'filter-updated': '更新',
    'filter-affinity': 'タグ', 'filter-attr': '属性', 'filter-version': 'バージョン', 'filter-extra': '裏メダル・旧筐体'
};

// 裏メダル・旧筐体のメダルが付いているか（表の左上・右上に印が出る曲）
const EXTRA_MEDAL_FILTER_ITEMS = [
    { value: 'ura', label: '裏メダルあり', test: s => !!getShownUraMedal(s.id) },
    { value: 'old', label: '旧筐体のメダルあり', test: s => !!getShownOldMedal(s.id) }
];

// メダルで絞るときに、表に出している裏メダル・旧筐体のメダルも見るか（メダルの項目の下のチェック）
function isMedalExtraIncluded() {
    const cb = document.getElementById('filter-medal-extra');
    return !!(cb && cb.checked);
}

// BAD の数（クリアしたときの一番少ない BAD。フルコンボ以上は 0：getSongBad）
const BAD_FILTER_ITEMS = [
    { value: 'b0', label: '0（フルコン）', test: n => n === 0 },
    { value: 'b1', label: '1〜9（一桁）', test: n => n !== null && n >= 1 && n <= 9 },
    { value: 'b10', label: '10〜20', test: n => n !== null && n >= 10 && n <= 20 },
    { value: 'b21', label: '21以上', test: n => n !== null && n >= 21 },
    { value: 'none', label: '記録なし', test: n => n === null }
];

// 最後に更新した日（更新履歴の一番新しい日から何日たったか）
const DAY_MS = 24 * 60 * 60 * 1000;
const UPDATED_FILTER_ITEMS = [
    { value: 'w1', label: '1週間以内', test: d => d !== null && d <= 7 },
    { value: 'm1', label: '1か月以内', test: d => d !== null && d <= 31 },
    { value: 'old1', label: '1か月以上前', test: d => d !== null && d > 31 },
    { value: 'old3', label: '3か月以上前', test: d => d !== null && d > 92 },
    { value: 'none', label: '更新なし', test: d => d === null }
];

// スコアランク（高い順）と、スコア未登録を表す値
const SCORE_RANK_KEYS = Object.keys(RANK_IMAGES);
const SCORE_RANK_NONE = 'none';

// スコア内訳の円グラフの色（S+・S は虹色。S は淡くして S+ と見分ける）
const SCORE_RANK_COLORS = {
    'S+': { gradient: ['#ff1744', '#ff9100', '#ffea00', '#00e676', '#2979ff', '#d500f9', '#ff1744'] },
    'S':  { gradient: ['#ffcdd2', '#ffe0b2', '#fff9c4', '#c8e6c9', '#bbdefb', '#e1bee7', '#ffcdd2'] },
    'AAA': '#b71c1c', 'AA+': '#d32f2f', 'AA': '#e53935', 'A+': '#ef5350', 'A': '#ef9a9a',
    'B+': '#ef6c00', 'B': '#ffa726',
    'C': '#43a047', 'D': '#1e88e5', 'E': '#8e24aa',
    [SCORE_RANK_NONE]: '#212121'
};

// 曲のスコアランク（スコア未登録なら ''）。クリアしていないと AA 以上にならない
function getSongScoreRank(song) {
    const medalInfo = MEDAL_TYPES[clearRecords[song.id] || ''];
    return getScoreRankInfo(scoreRecords[song.id], !!(medalInfo && medalInfo.isEasyClear)).rank;
}

// チェックされている値の一覧
function getFilterValues(id) {
    const box = document.getElementById(id);
    if (!box) return [];
    return Array.from(box.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
}

// 指定した値だけにチェックを付ける（空配列なら全部外す）
function setFilterValues(id, values) {
    const box = document.getElementById(id);
    if (!box) return;
    box.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = values.includes(cb.value); });
}

// 選択肢の表示名（チップに使う）
function getFilterValueLabel(id, value) {
    const box = document.getElementById(id);
    const cb = box && Array.from(box.querySelectorAll('input[type="checkbox"]')).find(c => c.value === value);
    return (cb && cb.dataset.label) || value;
}

// スコアの範囲（入っていなければ null）
function getScoreRange() {
    const read = id => {
        const el = document.getElementById(id);
        const v = el ? parseInt(el.value, 10) : NaN;
        return isNaN(v) ? null : v;
    };
    const min = read('filter-score-min'), max = read('filter-score-max');
    return min === null && max === null ? null : { min, max };
}

function setScoreRange(min, max) {
    const minEl = document.getElementById('filter-score-min');
    const maxEl = document.getElementById('filter-score-max');
    if (minEl) minEl.value = min === null || min === undefined ? '' : min;
    if (maxEl) maxEl.value = max === null || max === undefined ? '' : max;
}

function formatScoreRange(r) {
    if (r.min !== null && r.max !== null) return `${r.min}〜${r.max}`;
    return r.min !== null ? `${r.min}以上` : `${r.max}以下`;
}

let scoreRangeTimer = null;
function onScoreRangeInput() {
    clearTimeout(scoreRangeTimer);
    scoreRangeTimer = setTimeout(renderTable, 300);
}

// 全部の絞り込みを外す（検索はそのまま）
function clearAllFilters() {
    FILTER_IDS.forEach(id => setFilterValues(id, []));
    setScoreRange(null, null);
    const extra = document.getElementById('filter-medal-extra');
    if (extra) extra.checked = false;
}

// ---------- レベル（絞り込みの欄と、上のレベルボタンをそろえる） ----------
//   絞り込みを開くと、今表示しているレベルにチェックが付いている。チェックを変えると表示も変わる：
//   1つ → そのレベル、2つ以上 → 「すべて」にして選んだレベルで絞る、なし → 「すべて」。
//   検索中・「更新」「最近」のときは、上のレベルはそのままで、選んだレベルで絞るだけ。
//   今表示しているレベル1つだけのチェックは「絞り込み」には数えない（チップにも出さない）
function isRealViewLevel(level) {
    return level !== 'ALL' && !isSpecialViewLevel(level);
}

function isSearching() {
    const input = document.getElementById('search-input');
    return !!(input && input.value.trim());
}

function getActiveFilterValues(id) {
    const values = getFilterValues(id);
    if (id === 'filter-level' && values.length === 1 && values[0] === currentViewLevel) return [];
    return values;
}

// 表示しているレベルとチェックを合わせる（renderTable の最初に呼ぶ）
function syncLevelSelection() {
    if (isSearching() || isSpecialViewLevel(currentViewLevel)) return;
    const values = getFilterValues('filter-level');
    if (values.length === 0) {
        if (isRealViewLevel(currentViewLevel)) setFilterValues('filter-level', [currentViewLevel]);
        return;
    }
    const next = values.length === 1 ? values[0] : 'ALL';
    if (next !== currentViewLevel) {
        currentViewLevel = next;
        updateDynamicFilters(); // 上のレベルボタンの選択を付け替える
    }
}

function onLevelFilterChange() {
    if (!isSearching() && !isSpecialViewLevel(currentViewLevel) && getFilterValues('filter-level').length === 0) {
        currentViewLevel = 'ALL';
        updateDynamicFilters();
    }
    renderTable();
}

// 今かかっている条件を1つずつ（チップ用）。remove で外せる
function getActiveFilterItems() {
    const items = [];
    FILTER_IDS.forEach(id => {
        getActiveFilterValues(id).forEach(v => items.push({
            text: `${FILTER_GROUP_NAMES[id]}：${getFilterValueLabel(id, v)}`,
            remove: () => { setFilterValues(id, getFilterValues(id).filter(x => x !== v)); renderTable(); }
        }));
    });
    const range = getScoreRange();
    if (range) items.push({ text: `スコア：${formatScoreRange(range)}`, remove: () => { setScoreRange(null, null); renderTable(); } });
    if (isMedalExtraActive()) items.push({ text: 'メダル：裏・旧も含める', remove: () => { document.getElementById('filter-medal-extra').checked = false; renderTable(); } });
    return items;
}

// チェックリストの中身を作る（items: [{ value, label }]）。すでにチェックされていた値は残す
function buildFilterChecks(id, items) {
    const box = document.getElementById(id);
    if (!box) return;
    const checked = getFilterValues(id);
    box.innerHTML = '';
    items.forEach(({ value, label }) => {
        const lbl = document.createElement('label');
        lbl.className = 'check-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = value;
        cb.dataset.label = label;
        cb.checked = checked.includes(value);
        cb.onchange = () => renderTable();
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(' ' + label));
        box.appendChild(lbl);
    });
}

function countActiveFilters() {
    return FILTER_IDS.reduce((n, id) => n + getActiveFilterValues(id).length, 0) + (getScoreRange() ? 1 : 0) + (isMedalExtraActive() ? 1 : 0);
}

// 「裏メダル・旧筐体のメダルも含める」が効いているか（チェックが入っていて、メダルを選んでいるとき）
function isMedalExtraActive() {
    return isMedalExtraIncluded() && getActiveFilterValues('filter-medal').length > 0;
}

// 「さらに条件で絞り込む」と、各項目の見出しに、選んでいる数を出す（shown：今出ている曲数）
function updateFilterSummaryCount(shown) {
    const setCount = (elId, n) => {
        const el = document.getElementById(elId);
        if (el) el.textContent = n > 0 ? `（${n}）` : '';
    };
    setCount('filter-summary-count', countActiveFilters());
    FILTER_IDS.filter(id => id !== 'filter-rank').forEach(id => setCount(`${id}-count`, getActiveFilterValues(id).length));
    setCount('filter-score-count', getFilterValues('filter-rank').length + (getScoreRange() ? 1 : 0));
    const shownEl = document.getElementById('filter-summary-shown');
    if (shownEl) shownEl.textContent = typeof shown === 'number' ? ` ${shown}曲` : '';
}

// 選択肢の横に「選ぶと出る曲の数」を出す（ほかの項目の条件はそのまま、その項目だけ入れ替えて数える）
//   今の表示レベル・検索の曲に1曲もない選択肢は出さない（選んでいるものは出す）。
//   出す選択肢がない項目は、項目ごと隠す
//   レベルだけは、表示しているレベルに関係なく数える（levelBaseSongs：検索・「更新」「最近」だけを当てた曲）
//   今の条件のチップもここで作り直す
function updateFilterOptionCounts(baseSongs, levelBaseSongs) {
    const ctx = makeFilterContext();
    FILTER_IDS.forEach(id => {
        const box = document.getElementById(id);
        if (!box) return;
        const base = id === 'filter-level' && levelBaseSongs ? levelBaseSongs : baseSongs;
        const pool = base.filter(makeSongFilter({ skip: id, ctx }));
        const test = FILTER_GROUP_TESTS[id];
        let visible = 0, checked = 0;
        box.querySelectorAll('label').forEach(lbl => {
            const cb = lbl.querySelector('input[type="checkbox"]');
            if (!cb) return;
            const n = pool.reduce((c, s) => c + (test(s, [cb.value], ctx) ? 1 : 0), 0);
            const exists = base.some(s => test(s, [cb.value], ctx));
            let span = lbl.querySelector('.fc-n');
            if (!span) { span = document.createElement('span'); span.className = 'fc-n'; lbl.appendChild(span); }
            span.textContent = n;
            lbl.classList.toggle('fc-zero', n === 0 && !cb.checked);
            lbl.classList.toggle('fc-none', !exists && !cb.checked);
            if (exists || cb.checked) visible++;
            if (cb.checked) checked++;
        });
        // スコアはランクのほかに点数の範囲もあるので、項目ごとは隠さない
        const group = box.closest('details.filter-group');
        if (group && id !== 'filter-rank') group.classList.toggle('fc-none', checked === 0 && visible === 0);
    });
    renderFilterActiveChips();
}

// 絞り込みの欄の上に、今の条件を1つずつ（× で外す）
function renderFilterActiveChips() {
    const box = document.getElementById('filter-active');
    if (!box) return;
    const items = getActiveFilterItems();
    box.hidden = items.length === 0;
    box.innerHTML = '';
    items.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'filter-active-chip';
        btn.setAttribute('aria-label', `${item.text} を外す`);
        btn.textContent = item.text;
        btn.insertAdjacentHTML('beforeend', '<span aria-hidden="true">×</span>');
        btn.onclick = item.remove;
        box.appendChild(btn);
    });
    if (items.length > 1) {
        const all = document.createElement('button');
        all.type = 'button';
        all.className = 'filter-active-clear';
        all.textContent = 'すべて外す';
        all.onclick = () => resetFilters();
        box.appendChild(all);
    }
}

function initFilters() {
    const medalItems = Object.keys(MEDAL_TYPES)
        .filter(k => k !== '')
        .sort((a, b) => MEDAL_TYPES[b].rank - MEDAL_TYPES[a].rank)
        .map(k => ({ value: k, label: MEDAL_TYPES[k].label }));
    medalItems.push({ value: 'unplayed', label: '未プレイ' });
    buildFilterChecks('filter-medal', medalItems);

    const rankItems = SCORE_RANK_KEYS.map(k => ({ value: k, label: k }));
    rankItems.push({ value: SCORE_RANK_NONE, label: 'スコアなし' });
    buildFilterChecks('filter-rank', rankItems);

    buildFilterChecks('filter-updated', UPDATED_FILTER_ITEMS.map(({ value, label }) => ({ value, label })));
    buildFilterChecks('filter-bad', BAD_FILTER_ITEMS.map(({ value, label }) => ({ value, label })));
    buildFilterChecks('filter-extra', EXTRA_MEDAL_FILTER_ITEMS.map(({ value, label }) => ({ value, label })));
    // 難易度は index.html に書いてあるので、表示名だけ付ける
    document.querySelectorAll('#filter-diff input[type="checkbox"]').forEach(cb => { cb.dataset.label = cb.value; });

    updateDynamicFilters();
}

// タグ・メモの絞り込みの選択肢（タグはユーザーごとに変えられるので、描くたびに作り直す）
function buildMemoFilterChecks() {
    const items = getMemoTagNames().map(n => ({ value: n, label: n }));
    items.push({ value: MEMO_FILTER_STAR, label: '★練習したい' }, { value: MEMO_FILTER_COMMENT, label: 'コメントあり' }, { value: MEMO_FILTER_NONE, label: 'タグなし' });
    buildFilterChecks('filter-affinity', items);
}

function updateDynamicFilters() {
    const versions = [...new Set(songs.map(s => s.version))].filter(v => v)
        .sort((a, b) => getVersionSortValue(a) - getVersionSortValue(b));
    buildFilterChecks('filter-version', versions.map(v => ({ value: v, label: v })));
    buildMemoFilterChecks();
    buildFilterChecks('filter-attr', getAllSongAttrs().map(a => ({ value: a, label: a })));
    // レベル：小さいレベル → 大きいレベル（文字のレベルは後ろ）。レベルボタンと同じ並び
    const lvItems = getSortedLevels().slice().reverse().sort((a, b) => isNaN(parseInt(a, 10)) - isNaN(parseInt(b, 10)));
    buildFilterChecks('filter-level', lvItems.map(l => ({ value: String(l), label: isNaN(parseInt(l, 10)) ? String(l) : `Lv${l}` })));
    document.querySelectorAll('#filter-level input[type="checkbox"]').forEach(cb => { cb.onchange = onLevelFilterChange; });

    updateStartupSettingsUI();

    const viewLevelContainer = document.getElementById('view-level-buttons');
    if (viewLevelContainer) {
        viewLevelContainer.innerHTML = '';
        
        // 並び：小さいレベル → 大きいレベル（50 が右）→「すべて」→（少し空けて）「更新」「最近」
        const allBtn = document.createElement('button');
        allBtn.className = `level-btn level-btn-all ${currentViewLevel === 'ALL' ? 'active' : ''}`;
        allBtn.innerText = 'すべて';
        allBtn.onclick = () => changeViewLevel('ALL');
        
        const levels = getSortedLevels();
        
        // データにないレベルなら「すべて」にする（曲データが届く前の空の状態では戻さない）
        if (levels.length > 0 && currentViewLevel !== 'ALL' && !isSpecialViewLevel(currentViewLevel) && !levels.includes(currentViewLevel)) {
            currentViewLevel = 'ALL';
            allBtn.classList.add('active');
        }
        
        levels.slice().reverse().forEach(l => {
            const btn = document.createElement('button');
            btn.className = `level-btn ${isNaN(parseInt(l, 10)) ? 'level-btn-text' : ''} ${currentViewLevel === l ? 'active' : ''}`;
            btn.innerText = l;
            btn.title = isNaN(parseInt(l, 10)) ? l : `Lv${l}`;
            btn.onclick = () => changeViewLevel(l);
            viewLevelContainer.appendChild(btn);
        });
        viewLevelContainer.appendChild(allBtn);
        Object.keys(SPECIAL_VIEW_LEVELS).forEach(key => {
            const btn = document.createElement('button');
            btn.className = `level-btn level-btn-text level-btn-special${key === 'UPDATED' ? ' level-btn-special-first' : ''} ${currentViewLevel === key ? 'active' : ''}`;
            btn.innerText = SPECIAL_VIEW_LEVELS[key];
            btn.title = key === 'UPDATED' ? 'メダル・スコアを更新した曲（日付ごと）' : '最近プレーした曲（公式データ取り込みで読んだ20曲）';
            btn.onclick = () => changeViewLevel(key);
            viewLevelContainer.appendChild(btn);
        });
    }
}

// ---------- 「更新」「最近」（レベルの代わりに選ぶ） ----------
//   更新：更新履歴のある曲を日付ごとに。月ごとに ‹ › で切り替える（最初は今月）
//   最近：公式データ取り込みで読んだ「最近プレーした曲」（recentRecords）
const SPECIAL_VIEW_LEVELS = { UPDATED: '更新', RECENT: '最近' };

function isSpecialViewLevel(level) {
    return Object.prototype.hasOwnProperty.call(SPECIAL_VIEW_LEVELS, level);
}

// 「更新」の見方：'day'＝日ごと（月ごとに、日付の行にその日に更新した曲）、'song'＝曲ごと（選んだレベルの曲を、最後に更新した日の順）
//   どれもこの端末に保存（popn_updated_mode / popn_updated_level / popn_updated_order）
function getUpdatedMode() { return storageGet('popn_updated_mode') === 'song' ? 'song' : 'day'; }
function getUpdatedSongLevel() { return storageGet('popn_updated_level') || '48'; }
function getUpdatedOrder() { return storageGet('popn_updated_order') === 'new' ? 'new' : 'old'; }
function setUpdatedMode(mode) { storageSet('popn_updated_mode', mode === 'song' ? 'song' : 'day'); renderTable(); }
function setUpdatedLevel(level) { storageSet('popn_updated_level', String(level)); renderTable(); }
function setUpdatedOrder(order) { storageSet('popn_updated_order', order === 'new' ? 'new' : 'old'); renderTable(); }

// 見ている月（月の数え方は 年×12＋月。null は今月）
let updatedMonthIndex = null;
const monthIndexOf = t => { const d = new Date(t); return d.getFullYear() * 12 + d.getMonth(); };

function getUpdatedMonthIndex() {
    return updatedMonthIndex === null ? monthIndexOf(Date.now()) : updatedMonthIndex;
}

// 更新履歴のある一番古い月（履歴が無ければ今月）
function getOldestUpdatedMonthIndex() {
    let oldest = monthIndexOf(Date.now());
    Object.values(getHistoryRecords()).forEach(e => { if (e && typeof e.t === 'number') oldest = Math.min(oldest, monthIndexOf(e.t)); });
    return oldest;
}

// 前の月（-1）・次の月（+1）へ。履歴のある一番古い月から今月までの間だけ
function moveUpdatedMonth(step) {
    setUpdatedMonth(getUpdatedMonthIndex() + step);
}

// 月を選ぶ（月の見出しのプルダウンから）
function setUpdatedMonth(index) {
    const next = parseInt(index, 10);
    if (isNaN(next) || next > monthIndexOf(Date.now()) || next < getOldestUpdatedMonthIndex()) return;
    updatedMonthIndex = next;
    renderTable();
}

// 月の見出しのプルダウン：更新履歴のある月（新しい順、今月はいつも）と、その月に更新した曲の数
function buildUpdatedMonthOptions(selected) {
    const songsByMonth = new Map();
    Object.values(getHistoryRecords()).forEach(e => {
        if (!e || typeof e.t !== 'number') return;
        const mi = monthIndexOf(e.t);
        if (!songsByMonth.has(mi)) songsByMonth.set(mi, new Set());
        songsByMonth.get(mi).add(e.id);
    });
    const now = monthIndexOf(Date.now());
    if (!songsByMonth.has(now)) songsByMonth.set(now, new Set());
    return [...songsByMonth.keys()].sort((a, b) => b - a).map(mi =>
        `<option value="${mi}"${mi === selected ? ' selected' : ''}>${Math.floor(mi / 12)}年${mi % 12 + 1}月（${songsByMonth.get(mi).size}曲）</option>`).join('');
}


// 見ている月の更新履歴（新しい順）
function getUpdatedHistoryList() {
    const records = getHistoryRecords();
    const mi = getUpdatedMonthIndex();
    const from = new Date(Math.floor(mi / 12), mi % 12, 1).getTime();
    const to = new Date(Math.floor(mi / 12), mi % 12 + 1, 1).getTime();
    return Object.values(records).filter(e => e && typeof e.t === 'number' && e.t >= from && e.t < to).sort((a, b) => b.t - a.t);
}

// レベルの代わりに「更新」「最近」を選んだときの曲
function getSpecialViewSongIds(level) {
    const ids = new Set();
    if (level === 'UPDATED' && getUpdatedMode() === 'song') {
        // 曲ごと：選んだレベルの曲全部（更新したことのない曲も）
        const lv = getUpdatedSongLevel();
        songs.forEach(s => { if (lv === 'ALL' || String(s.level) === lv) ids.add(s.id); });
    } else if (level === 'UPDATED') getUpdatedHistoryList().forEach(e => ids.add(e.id));
    if (level === 'RECENT') {
        const recent = typeof loadRecentRecords === 'function' ? loadRecentRecords() : null;
        if (recent) matchRecentSongs(recent.list).forEach(r => r.songs.forEach(s => ids.add(s.id)));
    }
    return ids;
}

function resetFilters() {
    clearAllFilters();
    renderTable();
}

// メダル内訳のタイルから呼ばれる：そのメダルだけで絞り込む（'ALL' で解除）
function setMedalFilter(filterVal) {
    const medalBox = document.getElementById('filter-medal');
    if (medalBox) {
        setFilterValues('filter-medal', filterVal === 'ALL' ? [] : [filterVal]);
        
        // 「さらに条件で絞り込む」メニューが閉じていたら自動で開く
        const details = medalBox.closest('details');
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

// スコア内訳のタイルから呼ばれる：そのランクだけで絞り込む（'ALL' で解除）
function setRankFilter(filterVal) {
    const box = document.getElementById('filter-rank');
    if (!box) return;
    setFilterValues('filter-rank', filterVal === 'ALL' ? [] : [filterVal]);
    // 絞り込みの欄と、スコアランクの折りたたみを開く
    let d = box.closest('details');
    while (d) { d.open = true; d = d.parentElement ? d.parentElement.closest('details') : null; }
    renderTable();
    const tableElement = document.getElementById(viewMode === 'list' ? 'song-table' : 'diff-grid-view');
    if (tableElement) {
        const y = tableElement.getBoundingClientRect().top + window.pageYOffset - 120;
        window.scrollTo({ top: y, behavior: 'smooth' });
    }
}

// ---------- フリーワード検索 ----------
//   空白で区切ると、全部を含む曲（AND）。ひらがな/カタカナ・全角/半角・大文字/小文字・記号や空白の違いは無視する。
//   探す場所：曲名・ジャンル・メモ・属性・バージョン。「50」「Lv50」はレベルとも合わせる。
const searchNormCache = new Map();
function normalizeSearchText(text) {
    const key = String(text || '');
    let v = searchNormCache.get(key);
    if (v === undefined) {
        v = key.normalize('NFKC').toLowerCase()
            .replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)) // カタカナ → ひらがな
            .replace(/[^\p{L}\p{N}]/gu, '');
        if (searchNormCache.size > 20000) searchNormCache.clear();
        searchNormCache.set(key, v);
    }
    return v;
}

function getSearchTerms(query) {
    return String(query || '').split(/[\s\u3000]+/).map(normalizeSearchText).filter(Boolean);
}

function songMatchesSearch(song, terms) {
    if (terms.length === 0) return true;
    const fields = [song.title, song.genre, getMemoSearchText(getMemo(song.id)), getSongAttrs(song).join(' '), song.version].map(normalizeSearchText);
    const lv = normalizeSearchText(song.level);
    return terms.every(t => t === lv || t === 'lv' + lv || fields.some(f => f.includes(t)));
}

function handleSearch() {
    renderTable();
    updateSearchSuggest();
}
function clearSearch() {
    document.getElementById('search-input').value = '';
    // 検索中に選んだレベルは外して、表示しているレベルに戻す
    setFilterValues('filter-level', isRealViewLevel(currentViewLevel) ? [currentViewLevel] : []);
    hideSearchSuggest();
    renderTable();
}

// 候補：打っている間、当てはまる曲を下に8曲まで出す。押すとその曲（メダル・メモの画面）を開く
const SEARCH_SUGGEST_MAX = 8;
let searchSuggestIds = [];
let searchSuggestIndex = -1;

function updateSearchSuggest() {
    const input = document.getElementById('search-input');
    const box = document.getElementById('search-suggest');
    if (!input || !box) return;
    const terms = getSearchTerms(input.value);
    if (terms.length === 0 || document.activeElement !== input) { hideSearchSuggest(); return; }
    const hits = songs.filter(s => songMatchesSearch(s, terms))
        .sort((a, b) => (parseInt(b.level, 10) || 0) - (parseInt(a.level, 10) || 0) || String(a.title).localeCompare(String(b.title), 'ja'));
    searchSuggestIds = hits.slice(0, SEARCH_SUGGEST_MAX).map(s => s.id);
    searchSuggestIndex = -1;
    if (hits.length === 0) {
        box.innerHTML = '<div class="search-suggest-none">見つかりません</div>';
    } else {
        box.innerHTML = hits.slice(0, SEARCH_SUGGEST_MAX).map((s, i) => `
            <button type="button" class="search-suggest-item" role="option" id="search-suggest-${i}" onmousedown="event.preventDefault()" onclick="pickSearchSuggest('${jsStringAttr(s.id)}')">
                <span class="level-badge">${escapeHtml(s.level)}</span>
                <span class="ss-text"><span class="ss-title">${escapeHtml(s.title)}</span><span class="ss-genre">${escapeHtml(s.genre)}</span></span>
                ${buildMedalIconHtml(clearRecords[s.id] || '', 22)}
            </button>`).join('') +
            (hits.length > SEARCH_SUGGEST_MAX ? `<div class="search-suggest-more">ほか ${hits.length - SEARCH_SUGGEST_MAX}曲（一覧に出ています）</div>` : '');
    }
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
}

function hideSearchSuggest() {
    const box = document.getElementById('search-suggest');
    const input = document.getElementById('search-input');
    if (box) { box.hidden = true; box.innerHTML = ''; }
    if (input) { input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
    searchSuggestIds = [];
    searchSuggestIndex = -1;
}

function hideSearchSuggestSoon() {
    setTimeout(() => { if (document.activeElement !== document.getElementById('search-input')) hideSearchSuggest(); }, 150);
}

function onSearchKeydown(e) {
    const input = e.target;
    if (e.key === 'Escape') { hideSearchSuggest(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (searchSuggestIds.length === 0) return;
        e.preventDefault();
        const n = searchSuggestIds.length;
        searchSuggestIndex = e.key === 'ArrowDown' ? (searchSuggestIndex + 1) % n : (searchSuggestIndex - 1 + n) % n;
        document.querySelectorAll('#search-suggest .search-suggest-item').forEach((el, i) => el.classList.toggle('active', i === searchSuggestIndex));
        input.setAttribute('aria-activedescendant', `search-suggest-${searchSuggestIndex}`);
        return;
    }
    if (e.key === 'Enter') {
        e.preventDefault();
        if (searchSuggestIndex >= 0 && searchSuggestIds[searchSuggestIndex]) pickSearchSuggest(searchSuggestIds[searchSuggestIndex]);
        else { hideSearchSuggest(); input.blur(); }
    }
}

function pickSearchSuggest(id) {
    const song = songs.find(s => s.id === id);
    if (!song) return;
    const input = document.getElementById('search-input');
    input.value = song.title;
    hideSearchSuggest();
    input.blur();
    toggleMenu(false);
    renderTable();
    openMedalModal(id);
}
