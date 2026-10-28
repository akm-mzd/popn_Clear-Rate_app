// ==========================================
// table.js
// 楽曲一覧の表示。
// 絞り込み・並び替え・統計の計算・表の描画・表示レベルボタン。
// ==========================================

// ==========================================
// ★ 絞り込み（チェックリスト）
//   何もチェックしていない項目は「すべて」。
//   同じ項目の中は「どれか」（OR）、違う項目どうしは「すべて」（AND）で絞り込む。
//   ほかに、スコアの範囲（#filter-score-min / max）。選択肢の横には、選ぶと出る曲の数を出す。
// ==========================================
// 並びは絞り込みの欄の並びと同じ（レベル・メダル・難易度・属性・バージョン・スコア・タグ・メモ・最後に更新した日）
const FILTER_IDS = ['filter-level', 'filter-medal', 'filter-diff', 'filter-attr', 'filter-version', 'filter-rank', 'filter-affinity', 'filter-updated'];

// 項目の短い名前（今の条件のチップに使う）
const FILTER_GROUP_NAMES = {
    'filter-level': 'レベル', 'filter-medal': 'メダル', 'filter-rank': 'ランク', 'filter-diff': '難易度', 'filter-updated': '更新',
    'filter-affinity': 'タグ', 'filter-attr': '属性', 'filter-version': 'バージョン'
};

// 最後に更新した日（更新履歴の一番新しい日から何日たったか）
const DAY_MS = 24 * 60 * 60 * 1000;
const UPDATED_FILTER_ITEMS = [
    { value: 'w1', label: '1週間以内', test: d => d !== null && d <= 7 },
    { value: 'm1', label: '1か月以内', test: d => d !== null && d <= 31 },
    { value: 'old1', label: '1か月以上前', test: d => d !== null && d > 31 },
    { value: 'old3', label: '3か月以上前', test: d => d !== null && d > 92 },
    { value: 'none', label: '更新なし', test: d => d === null }
];

// よく使う条件（押すとその項目をこの値にする。もう一度押すと外す）
const FILTER_PRESETS = [
    { label: '未クリア', set: { 'filter-medal': ['unplayed', '黒丸', '黒菱', '黒星', 'イージー'] } },
    { label: 'フルコンまだ', set: { 'filter-medal': ['unplayed', '黒丸', '黒菱', '黒星', 'イージー', 'ロングオフ', '銅丸', '銅菱', '銅星'] } },
    { label: '未プレイ', set: { 'filter-medal': ['unplayed'] } },
    { label: 'スコアなし', set: { 'filter-rank': ['none'] } },
    { label: '★練習したい', set: { 'filter-affinity': ['★'] } },
    { label: '1週間以内に更新', set: { 'filter-updated': ['w1'] } },
    { label: '1か月以上更新なし', set: { 'filter-updated': ['old1', 'none'] } }
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
}

// 条件の組み合わせ { s: { 項目: [値] }, r: スコアの範囲 or null }（値は並べ替えておく。空の項目は入れない）
function getCurrentFilterCombo() {
    const set = {};
    FILTER_IDS.forEach(id => {
        const values = getFilterValues(id);
        if (values.length > 0) set[id] = values.slice().sort();
    });
    return { s: set, r: getScoreRange() };
}

function filterComboKey(combo) {
    const r = combo.r ? [combo.r.min, combo.r.max] : null;
    return JSON.stringify([FILTER_IDS.map(id => (combo.s[id] || []).slice().sort()), r]);
}

function isFilterComboEmpty(combo) {
    return Object.keys(combo.s).length === 0 && !combo.r;
}

// 組み合わせを、1つずつの条件に分ける（よく使う条件そのままのものは1つにまとめる）。
//   チップと、覚えた組み合わせの名前に使う。返り値 [{ text, ids: 外すときの項目, value: 1つだけ外すときの値 }]
function describeFilterCombo(combo) {
    const parts = [];
    const covered = new Set();
    const same = (a, b) => a.length === b.length && a.every(v => b.includes(v));
    FILTER_PRESETS.forEach(p => {
        const ids = Object.keys(p.set);
        if (ids.some(id => covered.has(id)) || !ids.every(id => same(combo.s[id] || [], p.set[id]))) return;
        ids.forEach(id => covered.add(id));
        parts.push({ text: p.label, ids });
    });
    FILTER_IDS.filter(id => !covered.has(id)).forEach(id => {
        (combo.s[id] || []).forEach(v => parts.push({ text: `${FILTER_GROUP_NAMES[id]}：${getFilterValueLabel(id, v)}`, ids: [id], value: v }));
    });
    if (combo.r) parts.push({ text: `スコア：${formatScoreRange(combo.r)}`, range: true });
    return parts;
}

// 今かかっている条件を1つずつ（チップ用）。remove で外せる
function getActiveFilterItems() {
    return describeFilterCombo(getCurrentFilterCombo()).map(part => ({
        text: part.text,
        remove: () => {
            if (part.range) setScoreRange(null, null);
            else if (part.value !== undefined) setFilterValues(part.ids[0], getFilterValues(part.ids[0]).filter(x => x !== part.value));
            else part.ids.forEach(id => setFilterValues(id, []));
            renderTable();
        }
    }));
}

// ---------- よく使う条件：使った組み合わせを覚える（この端末に、ユーザーごと） ----------
//   絞り込みのシートを閉じたときの条件を「使った」として数える（同じ条件のまま閉じ直しても数えない）。
//   2回以上使った組み合わせを、回数の多い順に「よく使う条件」の前の方に出す
const FILTER_USAGE_MAX = 30;
const FILTER_USAGE_MIN_COUNT = 2;
const FILTER_QUICK_MAX = 7;
let lastCountedFilterKey = null;

function filterUsageStorageKey() {
    return 'popn_filter_usage_' + currentUser;
}

function loadFilterUsage() {
    let list;
    try { list = JSON.parse(storageGet(filterUsageStorageKey()) || '[]'); } catch (e) { list = []; }
    if (!Array.isArray(list)) return [];
    return list.filter(e => e && e.s && typeof e.s === 'object' && typeof e.n === 'number').map(e => {
        const set = {};
        FILTER_IDS.forEach(id => { if (Array.isArray(e.s[id]) && e.s[id].length > 0) set[id] = e.s[id].filter(v => typeof v === 'string').sort(); });
        const r = e.r && typeof e.r === 'object' ? { min: Number.isFinite(e.r.min) ? e.r.min : null, max: Number.isFinite(e.r.max) ? e.r.max : null } : null;
        return { s: set, r: r && (r.min !== null || r.max !== null) ? r : null, n: e.n, t: typeof e.t === 'number' ? e.t : 0 };
    }).filter(e => !isFilterComboEmpty(e));
}

function saveFilterUsage(list) {
    storageSet(filterUsageStorageKey(), JSON.stringify(list));
}

function recordFilterUsage() {
    const combo = getCurrentFilterCombo();
    if (isFilterComboEmpty(combo)) { lastCountedFilterKey = null; return; }
    const key = filterComboKey(combo);
    if (key === lastCountedFilterKey) return;
    lastCountedFilterKey = key;
    const list = loadFilterUsage();
    const hit = list.find(e => filterComboKey(e) === key);
    if (hit) { hit.n++; hit.t = Date.now(); }
    else list.push({ s: combo.s, r: combo.r, n: 1, t: Date.now() });
    list.sort((a, b) => (b.n - a.n) || (b.t - a.t));
    saveFilterUsage(list.slice(0, FILTER_USAGE_MAX));
}

function clearFilterUsage() {
    if (!confirm('この端末で覚えた「よく使う条件」を消して、最初の並びに戻しますか？')) return;
    storageRemove(filterUsageStorageKey());
    lastCountedFilterKey = null;
    renderTable();
}

// 組み合わせにする（今と全く同じなら全部外す）
function applyFilterCombo(combo) {
    const same = filterComboKey(combo) === filterComboKey(getCurrentFilterCombo());
    clearAllFilters();
    if (!same) {
        Object.keys(combo.s).forEach(id => setFilterValues(id, combo.s[id]));
        if (combo.r) setScoreRange(combo.r.min, combo.r.max);
    }
    renderTable();
}

// 「よく使う条件」に出すもの：覚えた組み合わせ（2回以上）→ 決まった条件 で、最大7つ
function getQuickFilterEntries() {
    const entries = [];
    const keys = new Set();
    loadFilterUsage().filter(e => e.n >= FILTER_USAGE_MIN_COUNT).forEach(e => {
        if (entries.length >= FILTER_QUICK_MAX) return;
        const key = filterComboKey(e);
        keys.add(key);
        const label = describeFilterCombo(e).map(p => p.text).join('＋');
        entries.push({ kind: 'learned', combo: e, label, count: e.n });
    });
    FILTER_PRESETS.forEach((p, i) => {
        if (entries.length >= FILTER_QUICK_MAX) return;
        if (keys.has(filterComboKey({ s: p.set, r: null }))) return;
        entries.push({ kind: 'preset', index: i, label: p.label });
    });
    return entries;
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
    return FILTER_IDS.reduce((n, id) => n + getFilterValues(id).length, 0) + (getScoreRange() ? 1 : 0);
}

// 「さらに条件で絞り込む」と、各項目の見出しに、選んでいる数を出す（shown：今出ている曲数）
function updateFilterSummaryCount(shown) {
    const setCount = (elId, n) => {
        const el = document.getElementById(elId);
        if (el) el.textContent = n > 0 ? `（${n}）` : '';
    };
    setCount('filter-summary-count', countActiveFilters());
    FILTER_IDS.filter(id => id !== 'filter-rank').forEach(id => setCount(`${id}-count`, getFilterValues(id).length));
    setCount('filter-score-count', getFilterValues('filter-rank').length + (getScoreRange() ? 1 : 0));
    const shownEl = document.getElementById('filter-summary-shown');
    if (shownEl) shownEl.textContent = typeof shown === 'number' ? ` ${shown}曲` : '';
}

// 選択肢の横に「選ぶと出る曲の数」を出す（ほかの項目の条件はそのまま、その項目だけ入れ替えて数える）
//   今の表示レベル・検索の曲に1曲もない選択肢は出さない（選んでいるものは出す）。
//   出す選択肢がない項目は、項目ごと隠す（レベルは1つしかないときも隠す）
//   よく使う条件のボタンと、今の条件のチップもここで作り直す
function updateFilterOptionCounts(baseSongs) {
    const ctx = makeFilterContext();
    FILTER_IDS.forEach(id => {
        const box = document.getElementById(id);
        if (!box) return;
        const pool = baseSongs.filter(makeSongFilter({ skip: id, ctx }));
        const test = FILTER_GROUP_TESTS[id];
        let visible = 0, checked = 0;
        box.querySelectorAll('label').forEach(lbl => {
            const cb = lbl.querySelector('input[type="checkbox"]');
            if (!cb) return;
            const n = pool.reduce((c, s) => c + (test(s, [cb.value], ctx) ? 1 : 0), 0);
            const exists = baseSongs.some(s => test(s, [cb.value], ctx));
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
        if (group && id !== 'filter-rank') group.classList.toggle('fc-none', checked === 0 && visible <= (id === 'filter-level' ? 1 : 0));
    });
    renderFilterPresets(baseSongs, ctx);
    renderFilterActiveChips();
}

function isPresetActive(preset) {
    return Object.keys(preset.set).every(id => {
        const cur = getFilterValues(id);
        return cur.length === preset.set[id].length && preset.set[id].every(v => cur.includes(v));
    });
}

let quickFilterEntries = [];

function renderFilterPresets(baseSongs, ctx) {
    const box = document.getElementById('filter-presets');
    if (!box) return;
    // 一覧で条件を全部外したら、次に同じ条件を使ったときにまた数える
    const current = getCurrentFilterCombo();
    if (isFilterComboEmpty(current)) lastCountedFilterKey = null;
    const currentKey = filterComboKey(current);
    quickFilterEntries = getQuickFilterEntries();
    box.innerHTML = quickFilterEntries.map((e, i) => {
        let active, n;
        if (e.kind === 'learned') {
            active = filterComboKey(e.combo) === currentKey;
            const override = {};
            FILTER_IDS.forEach(id => { override[id] = e.combo.s[id] || []; });
            n = baseSongs.filter(makeSongFilter({ override, range: e.combo.r, ctx })).length;
        } else {
            const p = FILTER_PRESETS[e.index];
            active = isPresetActive(p);
            n = baseSongs.filter(makeSongFilter({ override: p.set, ctx })).length;
        }
        const title = e.kind === 'learned' ? ` title="${escapeHtml(e.label)}（${e.count}回使用）"` : '';
        return `<button type="button" class="filter-preset${e.kind === 'learned' ? ' learned' : ''}${active ? ' active' : ''}" aria-pressed="${active}"${title} onclick="toggleQuickFilter(${i})"><span class="fp-label">${escapeHtml(e.label)}</span><span class="fc-n">${n}</span></button>`;
    }).join('');
    const clearBtn = document.getElementById('filter-usage-clear');
    if (clearBtn) clearBtn.hidden = loadFilterUsage().length === 0;
}

function toggleQuickFilter(i) {
    const e = quickFilterEntries[i];
    if (!e) return;
    if (e.kind === 'learned') applyFilterCombo(e.combo);
    else toggleFilterPreset(e.index);
}

function toggleFilterPreset(i) {
    const preset = FILTER_PRESETS[i];
    if (!preset) return;
    const active = isPresetActive(preset);
    Object.keys(preset.set).forEach(id => setFilterValues(id, active ? [] : preset.set[id]));
    renderTable();
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
//   更新：更新履歴のある曲を日付ごとに。期間は 1か月 / 全部（この端末に popn_updated_range で保存）
//   最近：公式データ取り込みで読んだ「最近プレーした曲」（recentRecords）
const SPECIAL_VIEW_LEVELS = { UPDATED: '更新', RECENT: '最近' };
const UPDATED_RANGE_DAYS = 31;

function isSpecialViewLevel(level) {
    return Object.prototype.hasOwnProperty.call(SPECIAL_VIEW_LEVELS, level);
}

function getUpdatedRange() {
    return storageGet('popn_updated_range') === 'all' ? 'all' : 'month';
}

function setUpdatedRange(range) {
    storageSet('popn_updated_range', range === 'all' ? 'all' : 'month');
    renderTable();
}

// 期間内の更新履歴（新しい順）
function getUpdatedHistoryList() {
    const records = getHistoryRecords();
    const since = getUpdatedRange() === 'all' ? 0 : Date.now() - UPDATED_RANGE_DAYS * 24 * 60 * 60 * 1000;
    return Object.values(records).filter(e => e && typeof e.t === 'number' && e.t >= since).sort((a, b) => b.t - a.t);
}

// レベルの代わりに「更新」「最近」を選んだときの曲
function getSpecialViewSongIds(level) {
    const ids = new Set();
    if (level === 'UPDATED') getUpdatedHistoryList().forEach(e => ids.add(e.id));
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


function changeViewLevel(level, keepMenu = false) {
    if (!keepMenu) toggleMenu(false); // レベルを選んだらメニューを閉じる（統計シートのスライドからは閉じない）
    // ポックラはレベルに関係なく全体を出すので、レベルを選んだら難易度表に切り替える
    //   「更新」「最近」は難易度表の形で見るものなので、いつも難易度表にする
    if (viewMode === 'pokkura' || isSpecialViewLevel(level)) viewMode = 'grid';
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

// バージョンの並び順を数値にする（小さいほど上）
//   AC(1〜20) → sp〜jf → HC → 未登録の新しいバージョン → 家庭用 CS・PMP・EE（一番下に固定）
const VERSION_ORDER_AC_NAMED = { 'sp': 21, 'lt': 22, 'écl': 23, 'うさ': 24, 'pe': 25, '解': 26, 'ul': 27, 'jf': 28 };
const VERSION_ORDER_HC = 400;
const VERSION_ORDER_NEW = 500;     // 上の表にない新しいバージョンは HC の下
const VERSION_ORDER_CS = 1000;     // CS・PMP・EE はこれ以降（常に一番下）
const VERSION_ORDER_EMPTY = 9999;  // バージョン未入力

function getVersionSortValue(ver) {
    if (!ver) return VERSION_ORDER_EMPTY;
    const v = String(ver).trim().toLowerCase();
    if (v !== '' && !isNaN(v)) return parseInt(v, 10);
    if (VERSION_ORDER_AC_NAMED[v] !== undefined) return VERSION_ORDER_AC_NAMED[v];
    if (v === 'hc') return VERSION_ORDER_HC;

    // 家庭用（CS系。例: CSBest, CS4, CS14, PMP2, ee, ee2）は番号順に一番下へ。
    //   ポックラの新曲枠（AC の最新版）にもならない。曲データの「SC6」は CS6 の書き間違いとして扱う
    const consumer = v.match(/^(cs|sc|pmp|ee)\s*(best|\d*)$/);
    if (consumer) {
        const groupBase = { cs: 0, sc: 0, pmp: 100, ee: 200 }[consumer[1]];
        const num = consumer[2] === '' ? 0 : (consumer[2] === 'best' ? 1 : parseInt(consumer[2], 10));
        return VERSION_ORDER_CS + groupBase + num;
    }
    return VERSION_ORDER_NEW;
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

function getScoreRankInfo(score, isCleared) {
    if (score === undefined || score === null || score === '') return { rank: '', isImage: false, color: '#999' };
    const s = parseInt(score, 10);
    if (isNaN(s) || s <= 0) return { rank: '', isImage: false, color: '#999' }; // 0 は「なし」

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

// 難易度の強さを数にする（指数があれば指数、なければ難易度の種類から。不明は -999）
function getDiffSortValue(song) {
    if (song.diffIndex !== null && song.diffIndex !== undefined && !isNaN(song.diffIndex)) return parseFloat(song.diffIndex);
    if (song.diffClass === '危険') return 2.5;
    if (song.diffClass === '別格') return 2.0;
    if (song.diffClass === '詐称') return 1.5;
    if (song.diffClass === '強') return 1.0;
    if (song.diffClass === '中') return 0.0;
    if (song.diffClass === '弱') return -1.0;
    if (song.diffClass === '逆詐称') return -1.5;
    if (song.diffClass === '入門') return -2.0;
    return -999;
}

// 絞り込みの1項目ずつの判定（values のどれかに当てはまるか）。ctx は makeFilterContext() の結果
function getSongDiffFilterClass(s) {
    let dClass = s.diffClass || '未分類';
    if (dClass === '中') dClass = (s.diffIndex !== null && s.diffIndex < 0) ? '中(-)' : '中(+)';
    return dClass;
}

const FILTER_GROUP_TESTS = {
    'filter-level': (s, values) => values.includes(String(s.level)),
    'filter-medal': (s, values) => {
        const medalKey = clearRecords[s.id] || '';
        return values.includes(medalKey === '' ? 'unplayed' : medalKey);
    },
    'filter-version': (s, values) => values.includes(s.version),
    'filter-diff': (s, values) => values.includes(getSongDiffFilterClass(s)),
    // タグ・メモ：タグ・★練習したい・コメントあり・タグなし
    'filter-affinity': (s, values) => {
        const memo = getMemo(s.id);
        const tags = getMemoTags(memo);
        return values.some(v =>
            v === MEMO_FILTER_STAR ? !!memo.star
            : v === MEMO_FILTER_COMMENT ? !!memo.comment
            : v === MEMO_FILTER_NONE ? tags.length === 0
            : tags.includes(v));
    },
    'filter-rank': (s, values) => values.includes(getSongScoreRank(s) || SCORE_RANK_NONE),
    // 属性（攻略wiki）：選んだもののどれかを持つ曲
    'filter-attr': (s, values) => getSongAttrs(s).some(a => values.includes(a)),
    'filter-updated': (s, values, ctx) => {
        const t = ctx.lastUpdate.get(s.id);
        const days = t === undefined ? null : (ctx.now - t) / DAY_MS;
        return values.some(v => { const item = UPDATED_FILTER_ITEMS.find(x => x.value === v); return !!item && item.test(days); });
    }
};

// 絞り込みに使う、曲ごとの値（最後に更新した日時）
function makeFilterContext() {
    const lastUpdate = new Map();
    Object.values(getHistoryRecords()).forEach(e => {
        if (e && typeof e.t === 'number' && !(lastUpdate.get(e.id) >= e.t)) lastUpdate.set(e.id, e.t);
    });
    return { lastUpdate, now: Date.now() };
}

// 絞り込み（メダル・バージョン・難易度・タグ・属性・スコアランク・更新日・スコアの範囲）を当てる関数。何も選んでいない項目は「すべて」
//   skip：その項目は当てない（選択肢の曲数を数えるとき）／ override：{ 項目: 値 } でその項目の値を入れ替える／ range：スコアの範囲を入れ替える（null で外す）
function makeSongFilter(opts = {}) {
    const ctx = opts.ctx || makeFilterContext();
    const groups = FILTER_IDS.filter(id => id !== opts.skip).map(id => {
        const values = opts.override && opts.override[id] ? opts.override[id] : getFilterValues(id);
        return values.length > 0 ? [FILTER_GROUP_TESTS[id], values] : null;
    }).filter(Boolean);
    const range = opts.range !== undefined ? opts.range : getScoreRange();
    return s => {
        for (const [test, values] of groups) if (!test(s, values, ctx)) return false;
        if (range) {
            const sc = parseInt(scoreRecords[s.id], 10);
            if (isNaN(sc) || (range.min !== null && sc < range.min) || (range.max !== null && sc > range.max)) return false;
        }
        return true;
    };
}

// 曲の一覧から統計の数を出す（クリア数・難易度別・メダル数・スコアランク数・スコアの合計・レベル別のスコア）
//   未解禁の曲は、showUnreleased のときだけクリア率の母数に入れる（メダル数は未解禁も数える）
const STATS_DIFF_ORDER = ['危険', '別格', '詐称', '強', '中(+)', '中(-)', '弱', '逆詐称', '入門', '未分類'];

function computeStats(statsSongs, showUnreleased) {
    let kuroHishiClearCount = 0, kuroBoshiClearCount = 0, easyClearCount = 0, normalClearCount = 0, rateTotal = 0;
    const medalCounts = {};
    Object.keys(MEDAL_TYPES).forEach(k => { medalCounts[k] = 0; });
    const rankCounts = {};
    SCORE_RANK_KEYS.forEach(k => { rankCounts[k] = 0; });
    rankCounts[SCORE_RANK_NONE] = 0;
    let scoreSum = 0, scoreCount = 0;
    const diffStats = {};
    STATS_DIFF_ORDER.forEach(k => { diffStats[k] = { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 }; });
    const levelScores = {}; // { レベル: { total: 曲数, count: スコアのある曲数, sum: 合計 } }

    statsSongs.forEach(song => {
        const medalKey = clearRecords[song.id] || '';
        const medalInfo = MEDAL_TYPES[medalKey] || MEDAL_TYPES[''];
        medalCounts[MEDAL_TYPES[medalKey] ? medalKey : '']++;

        let dClass = song.diffClass || '未分類';
        if (dClass === '中') dClass = (song.diffIndex !== null && song.diffIndex < 0) ? '中(-)' : '中(+)';
        if (!diffStats[dClass]) dClass = '未分類';

        if (medalInfo.excludeFromRate && !showUnreleased) return;
        rateTotal++;
        diffStats[dClass].total++;
        if (medalInfo.isKuroHishiClear) { kuroHishiClearCount++; diffStats[dClass].kuroHishi++; }
        if (medalInfo.isKuroBoshiClear) { kuroBoshiClearCount++; diffStats[dClass].kuroBoshi++; }
        if (medalInfo.isEasyClear) { easyClearCount++; diffStats[dClass].easy++; }
        if (medalInfo.isNormalClear) { normalClearCount++; diffStats[dClass].normal++; }

        const rank = getSongScoreRank(song);
        rankCounts[rank || SCORE_RANK_NONE]++;
        const lv = String(song.level);
        const ls = levelScores[lv] || (levelScores[lv] = { total: 0, count: 0, sum: 0 });
        ls.total++;
        if (rank) {
            const sc = parseInt(scoreRecords[song.id], 10);
            scoreSum += sc; scoreCount++;
            ls.count++; ls.sum += sc;
        }
    });
    return { kuroHishiClearCount, kuroBoshiClearCount, easyClearCount, normalClearCount, rateTotal, medalCounts, rankCounts, scoreSum, scoreCount, diffStats, levelScores };
}

function renderTable() {
    const searchInput = document.getElementById('search-input');
    const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : "";

    // 絞り込み条件（空配列 = すべて）
    const isFiltered = countActiveFilters() > 0;
    const songFilter = makeSongFilter();
    const searchTerms = getSearchTerms(searchQuery);

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

    // 1. 表示レベル・検索キーワードだけを当てた楽曲（絞り込みがないときの統計にも使う）
    //    検索中は、表示レベルに関係なく全曲から探す
    const specialIds = !searchQuery && isSpecialViewLevel(currentViewLevel) ? getSpecialViewSongIds(currentViewLevel) : null;
    let baseSongs = songs.filter(s => {
        if (specialIds) return specialIds.has(s.id);
        if (!searchQuery && currentViewLevel !== 'ALL' && s.level !== currentViewLevel) return false;
        // フリーワード検索：曲名・ジャンル・メモ・属性・バージョン（空白で区切ると全部を含む曲）
        if (searchQuery && !songMatchesSearch(s, searchTerms)) return false;
        return true;
    });

    // 2. 実際にテーブルに表示する楽曲（すべての絞り込みを適用）
    let displaySongs = baseSongs.filter(songFilter);
    updateFilterSummaryCount(displaySongs.length);
    updateFilterOptionCounts(baseSongs);
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
            let valA = getDiffSortValue(a);
            let valB = getDiffSortValue(b);
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
            const valA = getVersionSortValue(a.version);
            const valB = getVersionSortValue(b.version);
            if (valA === valB) return a.originalOrder - b.originalOrder;
            // CS系（と未入力）は、昇順・降順どちらでも一番下に固定する
            const bottomA = valA >= VERSION_ORDER_CS, bottomB = valB >= VERSION_ORDER_CS;
            if (bottomA !== bottomB) return bottomA ? 1 : -1;
            if (bottomA && bottomB) return valA - valB;
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

    const isMobile = isNarrowScreen();

    // ★ 絞り込み中は絞り込んだ曲だけで、そうでなければ表示レベル・検索の全曲で統計を出す
    const statsSongs = isFiltered ? displaySongs : baseSongs;
    const stats = computeStats(statsSongs, showUnreleased);
    const { kuroHishiClearCount, kuroBoshiClearCount, easyClearCount, normalClearCount, rateTotal, medalCounts, rankCounts, scoreSum, scoreCount, diffStats } = stats;

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
                <span class="diff-main">${escapeHtml(dClassStr)}</span><span class="diff-sub">${escapeHtml(dIndexStr)}</span>
            </div>
        `;
        
        const safeId = jsStringAttr(song.id); // onclick の引数に埋め込む用

        const isValidMedalUrl = isImageSrc(medalInfo.imgUrl);
        const medalDisplayHtml = isValidMedalUrl
            ? `<img src="${medalInfo.imgUrl}" loading="lazy" style="width: 32px; height: 32px; object-fit: contain; cursor: pointer; display: block; margin: 0 auto;" onclick="openMedalModal('${safeId}')" title="${medalInfo.label}">`
            : `<div onclick="openMedalModal('${safeId}')" style="cursor: pointer; font-weight: bold; padding: 4px; border: 1px solid #ccc; border-radius: 4px; background: #fff; font-size: 0.8em; color: #555; white-space: nowrap;" title="クリックして変更">${medalInfo.label}</div>`;

        const bannerAction = isMobile ? '' : `onclick="updateBannerFromClipboard('${safeId}')"`;
        const cursorStyle = isMobile ? 'default' : 'pointer';
        const bannerTitle = isMobile ? '' : 'title="クリックしてコピーしたURLで上書き"';
        const noImageTitle = isMobile ? '' : 'title="クリックしてコピーしたURLを自動ペースト"';
        const noImageDeco = isMobile ? 'none' : 'underline';

        const bannerSrc = safeUrl(song.bannerUrl, true);
        const bannerHtml = bannerSrc
            ? `<img src="${escapeHtml(bannerSrc)}" style="max-width: 100%; height: auto; max-height: 50px; border-radius: 4px; cursor: ${cursorStyle};" ${bannerAction} ${bannerTitle} onerror="this.style.display='none'" />`
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
                <div style="font-weight: bold; font-size: 1.1em; color: #333;">${escapeHtml(myScore)}</div>
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
                    <div style="font-size: 0.95em; color: #555; font-weight: bold;">${escapeHtml(targetScore)}</div>
                    ${tRankMark}
                    <div style="margin-top: 2px;">${diff}</div>
                `;
            }
        }

        const scoreDisplay = showScore ? '' : 'display: none;';
        const compareDisplay = showCompare ? '' : 'display: none;';

        const finalWikiUrl = getWikiUrl(song); // http(s) 以外のURLは使わない

        const memo = getMemo(song.id);
        const hasMemo = hasMemoContent(memo);
        const memoTooltip = hasMemo ? describeMemo(memo) : 'メモを追加・編集';
        // タグはタグの色で、★練習したいは★で出す
        const affinityBadge = (memo.star ? '<span class="memo-mark-star" style="font-size: 0.8em; margin-left: 2px;">★</span>' : '') +
            getMemoTags(memo).map(t => `<span style="font-size: 0.8em; margin-left: 2px; font-weight: bold; color: ${getMemoTagColor(t)};">[${escapeHtml(t.substring(0, 2))}]</span>`).join('');

        tr.innerHTML = `
            <td class="col-medal" style="text-align: center; vertical-align: middle;">${medalDisplayHtml}</td>
            <td class="col-score" style="text-align: center; cursor: pointer; background-color: #fafafa; ${scoreDisplay}" onclick="openScoreModal('${safeId}')" title="クリックしてスコア入力">${scoreDisplayHtml}</td>
            <td class="col-compare" style="text-align: center; background-color: #f0f8ff; ${compareDisplay}">${compareHtml}</td>
            <td class="col-level" style="text-align: center;"><span class="level-badge">${escapeHtml(song.level || '-')}</span></td>
            <td class="col-version" style="text-align: center;"><span class="ver-badge">${escapeHtml(song.version || '-')}</span></td>
            <td class="col-banner" style="text-align: center; transition: background-color 0.2s;" ondragover="event.preventDefault(); this.style.backgroundColor='#e3f2fd';" ondragleave="event.preventDefault(); this.style.backgroundColor='';" ondrop="handleSingleBannerDrop(event, '${safeId}', this)">${bannerHtml}</td>
            <td class="col-title">
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 0.85em; color: #666; display: flex; align-items: center; flex-wrap: wrap;">
                        <span>${escapeHtml(song.genre)}</span>
                        <span onclick="openMemoModal('${safeId}')" style="cursor: pointer; font-size: 1.2em; margin-left: 4px; padding: 2px; ${hasMemo ? '' : 'opacity: 0.4;'}" title="${escapeHtml(memoTooltip)}">
                            📝${affinityBadge}
                        </span>
                    </div>
                    <div style="font-weight: bold; word-break: break-all; margin-top: 2px;">
                        <a href="${escapeHtml(finalWikiUrl)}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">
                            ${escapeHtml(song.title)} <span style="font-size: 0.8em; color: #2196F3;">🔗</span>
                        </a>
                    </div>
                    ${getSongAttrs(song).length ? `<div class="song-attrs">${getSongAttrs(song).map(a => `<span>${escapeHtml(a)}</span>`).join('')}</div>` : ''}
                </div>
            </td>
            <td class="col-bpm" style="text-align: right;"><span>${escapeHtml(song.bpm || '-')}</span></td>
            <td class="col-notes" style="text-align: right;"><span>${escapeHtml(song.notes)}</span></td>
            <td class="col-diff" style="text-align: center;">${diffHtml}</td>
            <td class="col-action no-export" style="text-align: center;">
                <button class="edit-btn" onclick="openEditModal('${safeId}')">✏️編集</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    lastDisplaySongs = displaySongs;
    lastStatsContext = { baseSongs, isFiltered, songFilter, searchQuery, showUnreleased };
    applyViewMode(displaySongs);
    updateSortHeaders();

    const kuroHishiPerc = formatRate(kuroHishiClearCount, rateTotal);
    const kuroBoshiPerc = formatRate(kuroBoshiClearCount, rateTotal);
    const easyPerc = formatRate(easyClearCount, rateTotal);
    const normalPerc = formatRate(normalClearCount, rateTotal);
    
    const kuroHishiRemain = rateTotal - kuroHishiClearCount;
    const kuroBoshiRemain = rateTotal - kuroBoshiClearCount;
    const easyRemain = rateTotal - easyClearCount;
    const normalRemain = rateTotal - normalClearCount;

    let levelLabel = currentViewLevel === 'ALL' ? '全体' : isSpecialViewLevel(currentViewLevel) ? SPECIAL_VIEW_LEVELS[currentViewLevel] : `Lv${currentViewLevel}`;
    if (searchQuery) levelLabel = `検索結果 ("${searchQuery}")`;
    if (isFiltered) {
        levelLabel += ' (絞り込み中)';
    }
    if (typeof updateNewUiChrome === 'function') {
        updateNewUiChrome({ levelLabel, cleared: normalClearCount, total: rateTotal, shown: displaySongs.length, medalCounts, rankCounts, showUnreleased });
    }
    if (typeof updateGoalsAfterRender === 'function') updateGoalsAfterRender();
    
    const showKuroHishiRate = document.getElementById('show-kurohishi-rate') ? document.getElementById('show-kurohishi-rate').checked : false;
    const showKuroBoshiRate = document.getElementById('show-kuroboshi-rate') ? document.getElementById('show-kuroboshi-rate').checked : false;
    const showEasyRate = document.getElementById('show-easy-rate') ? document.getElementById('show-easy-rate').checked : false;
    const showNormalRate = document.getElementById('show-normal-rate') ? document.getElementById('show-normal-rate').checked : true;
    const showMedalStats = document.getElementById('show-medal-stats') ? document.getElementById('show-medal-stats').checked : false;
    const showDiffStats = document.getElementById('show-diff-stats') ? document.getElementById('show-diff-stats').checked : false;
    const showScoreStats = document.getElementById('show-score-stats') ? document.getElementById('show-score-stats').checked : false;

    let statsHtml = `<div style="display: flex; flex-wrap: wrap; gap: 15px; width: 100%; justify-content: flex-end; align-items: baseline;">
        <div class="stats-level">【${escapeHtml(levelLabel)}】</div>`;

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

    if (showMedalStats || showDiffStats || showScoreStats) {
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
                    ${filterMedals.length > 0 ? `<button onclick="setMedalFilter('ALL')" style="padding: 4px 10px; font-size: 0.85em; cursor: pointer; border: 1px solid #ffcdd2; background: #ffebee; color: #d32f2f; border-radius: 4px; font-weight: bold; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">✖ メダル絞り込み解除</button>` : ''}
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
                const isValidMedalUrl = isImageSrc(m.imgUrl);
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

        if (showScoreStats) {
            const avg = scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null;
            extendedStatsHtml += `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; ${showMedalStats || showDiffStats ? 'border-top: 1px dashed #ccc; padding-top: 10px; margin-top: 15px;' : ''}">
                    <div style="font-weight: bold; color: #555; font-size: 0.9em;">🔢 スコア内訳 <span style="font-weight: normal; color: #666;">（登録 ${scoreCount} / ${rateTotal}曲${avg !== null ? `・平均 ${avg}` : ''}）</span></div>
                    ${filterRanks.length > 0 ? `<button onclick="setRankFilter('ALL')" style="padding: 4px 10px; font-size: 0.85em; cursor: pointer; border: 1px solid #ffcdd2; background: #ffebee; color: #d32f2f; border-radius: 4px; font-weight: bold;">✖ ランク絞り込み解除</button>` : ''}
                </div>
                ${buildScoreRankChartHtml(rankCounts)}
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(55px, 1fr)); gap: 6px;">`;
            SCORE_RANK_KEYS.concat(SCORE_RANK_NONE).forEach(k => {
                const iconHtml = k === SCORE_RANK_NONE
                    ? `<div style="font-weight: bold; color: #888; font-size: 0.7em; height: 26px; display: flex; align-items: center;">なし</div>`
                    : `<img src="${RANK_IMAGES[k]}" alt="${k}" style="height: 26px; max-width: 50px; object-fit: contain; margin-bottom: 2px;">`;
                extendedStatsHtml += `
                    <div onclick="setRankFilter('${k}')" title="クリックしてこのランクで絞り込む" style="cursor: pointer; background: #fff; padding: 6px 2px; border-radius: 4px; border: 1px solid #ddd; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);" onmouseover="this.style.background='#f0f8ff'; this.style.borderColor='#2196F3'" onmouseout="this.style.background='#fff'; this.style.borderColor='#ddd'">
                    ${iconHtml}
                    <span style="color: #333; font-weight: bold; font-size: 1.1em; line-height: 1;">${rankCounts[k]}</span>
                    </div>`;
            });
            extendedStatsHtml += `</div>`;
        }
        extendedStatsHtml += `</div>`;
    }
    
    document.getElementById('stats-display').innerHTML = statsHtml;
    document.getElementById('extended-stats-display').innerHTML = extendedStatsHtml;
    if (isStatsSheetOpen()) renderNewUiStats();
}

// ==========================================
// ★ 統計シート（新しいデザイン）：レベルごとのページを横にスライド（46 → 50 → 全体）。
//   スライドで止まったページのレベルに、メイン画面の表示レベルも切り替える。
//   「更新」「最近」・検索中・文字のレベルは、その内容のページを左端に1枚足す
// ==========================================
let lastStatsContext = null;
let nsScrollTimer = null;

function isStatsSheetOpen() {
    const panel = document.getElementById('menu-panel');
    return !!panel && panel.classList.contains('open') && panel.dataset.sheet === 'stats';
}

function getStatsPages() {
    const ctx = lastStatsContext;
    const numeric = getSortedLevels().filter(l => !isNaN(parseInt(l, 10))).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    const pages = numeric.map(l => ({ key: l, label: l, title: `Lv${l}` }));
    pages.push({ key: 'ALL', label: '全体', title: '全体' });
    const searching = ctx && ctx.searchQuery;
    const cur = searching ? 'CUR' : (pages.some(p => p.key === currentViewLevel) ? currentViewLevel : 'CUR');
    if (cur === 'CUR') {
        const label = searching ? '検索' : (isSpecialViewLevel(currentViewLevel) ? SPECIAL_VIEW_LEVELS[currentViewLevel] : String(currentViewLevel));
        pages.unshift({ key: 'CUR', label, title: searching ? `検索結果（${ctx.searchQuery}）` : label });
    }
    return { pages, active: cur };
}

function getStatsPageSongs(key) {
    const ctx = lastStatsContext;
    const base = key === 'CUR' ? ctx.baseSongs : key === 'ALL' ? songs : songs.filter(s => s.level === key);
    return ctx.isFiltered ? base.filter(ctx.songFilter) : base;
}

function renderNewUiStats() {
    const root = document.getElementById('ns-root');
    if (!root || !lastStatsContext || typeof isNewUi !== 'function' || !isNewUi()) return;
    const { pages, active } = getStatsPages();
    const showUnreleased = lastStatsContext.showUnreleased;
    const tabs = pages.map(p => `<button type="button" role="tab" class="ns-tab${p.key === active ? ' active' : ''}" data-key="${escapeHtml(p.key)}" onclick="scrollStatsToPage('${jsStringAttr(p.key)}')" aria-selected="${p.key === active}">${escapeHtml(p.label)}</button>`).join('');
    const panels = pages.map(p => `<div class="ns-page" data-key="${escapeHtml(p.key)}" role="tabpanel">${buildStatsPageHtml(p, computeStats(getStatsPageSongs(p.key), showUnreleased))}</div>`).join('');
    root.innerHTML = `
        <div class="ns-tabs" role="tablist" aria-label="統計のレベル">${tabs}</div>
        <div class="ns-hint">スライドでレベルを切り替え</div>
        <div class="ns-slider" id="ns-slider">${panels}</div>`;

    const slider = document.getElementById('ns-slider');
    const index = Math.max(0, pages.findIndex(p => p.key === active));
    slider.scrollLeft = index * slider.clientWidth;
    fitStatsSliderHeight();
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            if (!slider.isConnected) { ro.disconnect(); return; }
            fitStatsSliderHeight();
        });
        slider.querySelectorAll('.ns-page').forEach(pg => ro.observe(pg));
    }
    slider.addEventListener('scroll', () => {
        clearTimeout(nsScrollTimer);
        nsScrollTimer = setTimeout(() => {
            if (!slider.isConnected) return;
            const i = Math.round(slider.scrollLeft / Math.max(1, slider.clientWidth));
            const page = pages[Math.min(pages.length - 1, Math.max(0, i))];
            if (!page || page.key === active || page.key === 'CUR') return;
            changeViewLevel(page.key, true);
        }, 120);
    }, { passive: true });
}

// 高さは今のページに合わせる（ほかのページの長さで下に空白ができないように）
function fitStatsSliderHeight() {
    const slider = document.getElementById('ns-slider');
    if (!slider) return;
    const { pages, active } = getStatsPages();
    const pageEl = slider.children[Math.max(0, pages.findIndex(p => p.key === active))];
    if (pageEl) slider.style.height = pageEl.offsetHeight + 'px';
}

function scrollStatsToPage(key) {
    const slider = document.getElementById('ns-slider');
    if (!slider) return;
    const i = Array.from(slider.children).findIndex(el => el.dataset.key === key);
    if (i >= 0) slider.scrollTo({ left: i * slider.clientWidth, behavior: 'smooth' });
}

function setStatsUnreleased(checked) {
    const cb = document.getElementById('show-unreleased');
    if (cb) cb.checked = checked;
    renderTable();
}

const NS_CLEAR_ROWS = [
    ['ノーマル以上', 'normalClearCount', 'normal', '#d32f2f'],
    ['イージー以上', 'easyClearCount', 'easy', '#2e9d2a'],
    ['黒星以上', 'kuroBoshiClearCount', 'kuroBoshi', '#000051'],
    ['黒菱以上', 'kuroHishiClearCount', 'kuroHishi', '#1a237e']
];

function buildStatsPageHtml(page, st) {
    const total = st.rateTotal;
    const pct = (n, d) => d > 0 ? n / d * 100 : 0;
    const filtered = lastStatsContext.isFiltered;
    let html = `<div class="ns-head"><span class="ns-title">${escapeHtml(page.title)}</span>${filtered ? '<span class="ns-filtered">絞り込み中</span>' : ''}
        <label class="ns-unreleased"><input type="checkbox" ${lastStatsContext.showUnreleased ? 'checked' : ''} onchange="setStatsUnreleased(this.checked)"> 未解禁を含む</label></div>`;

    // クリア率
    html += `<section class="ns-card"><div class="ns-card-title">クリア率</div>
        <table class="ns-table ns-clear"><thead><tr><th>区分</th><th>曲数</th><th>クリア率</th></tr></thead><tbody>`;
    NS_CLEAR_ROWS.forEach(([label, key, , color]) => {
        const n = st[key];
        html += `<tr><th style="color: ${color};">${label}</th><td class="ns-num">${n} / ${total}</td>
            <td class="ns-rate-cell"><span class="ns-rate rate-toggle" onclick="toggleRateFormat()" title="タップで表示形式を切替">${formatRate(n, total)}%</span><span class="ns-bar"><span style="width: ${pct(n, total).toFixed(1)}%; background: ${color};"></span></span></td></tr>`;
    });
    html += `</tbody></table></section>`;

    // 難易度別クリア率
    const diffRows = STATS_DIFF_ORDER.filter(k => st.diffStats[k].total > 0);
    if (diffRows.length > 0) {
        html += `<section class="ns-card"><div class="ns-card-title">難易度別クリア率</div>
            <div class="ns-table-wrap"><table class="ns-table ns-diff"><thead><tr><th>難易度</th><th>曲数</th>${NS_CLEAR_ROWS.map(r => `<th style="color: ${r[3]};">${r[0].replace('以上', '')}</th>`).join('')}</tr></thead><tbody>`;
        diffRows.forEach(k => {
            const d = st.diffStats[k];
            const baseClass = k.startsWith('中') ? '中' : k;
            const style = getDifficultyColor(baseClass, k === '中(+)' ? 0.5 : (k === '中(-)' ? -0.5 : 0));
            const nameColor = k === '危険' ? '#b8860b' : style.color.replace('0.3', '1').replace('0.8', '1');
            html += `<tr><th style="color: ${nameColor};">${escapeHtml(k)}</th><td class="ns-num" title="ノーマルクリア以上の曲数 / 曲数">${d.normal}/${d.total}</td>${NS_CLEAR_ROWS.map(r => {
                const p = pct(d[r[2]], d.total);
                return `<td class="ns-pct" style="background: rgba(194,24,91,${(p / 100 * 0.22).toFixed(3)});">${formatRate(d[r[2]], d.total)}%</td>`;
            }).join('')}</tr>`;
        });
        html += `</tbody></table></div></section>`;
    }

    // メダル
    const medalKeys = Object.keys(MEDAL_TYPES).sort((a, b) => MEDAL_TYPES[b].rank - MEDAL_TYPES[a].rank)
        .filter(k => st.medalCounts[k] > 0 && (!MEDAL_TYPES[k].excludeFromRate || lastStatsContext.showUnreleased));
    const medalTotal = medalKeys.reduce((a, k) => a + st.medalCounts[k], 0);
    if (medalTotal > 0) {
        const curMedal = getFilterValues('filter-medal');
        const pie = generatePieChartBase64(medalKeys.map(k => ({ count: st.medalCounts[k], color: MEDAL_COLORS[k] || '#ccc' })), 200);
        const cells = medalKeys.map(k => {
            const m = MEDAL_TYPES[k];
            const value = k === '' ? 'unplayed' : k;
            const active = curMedal.length === 1 && curMedal[0] === value;
            const icon = isImageSrc(m.imgUrl) ? `<img src="${escapeHtml(m.imgUrl)}" alt="${escapeHtml(m.label)}">` : `<span class="ns-chip-text">${k === '未解禁' ? '🔒' : '未'}</span>`;
            return `<button type="button" class="ns-chip${active ? ' active' : ''}" onclick="toggleStatCardFilter('medal', '${jsStringAttr(value)}')" title="${escapeHtml(m.label)}で絞り込む"><span class="ns-swatch" style="background: ${MEDAL_COLORS[k] || '#ccc'};"></span>${icon}<b>${st.medalCounts[k]}</b><span class="ns-chip-pct">${formatRate(st.medalCounts[k], medalTotal)}%</span></button>`;
        }).join('');
        html += `<section class="ns-card"><div class="ns-card-title">メダル</div>
            <div class="ns-chart"><img class="ns-pie" src="${pie}" alt="メダルの円グラフ"><div class="ns-chips">${cells}</div></div></section>`;
    }

    // スコア
    const rankKeys = SCORE_RANK_KEYS.concat(SCORE_RANK_NONE).filter(k => st.rankCounts[k] > 0);
    const rankTotal = rankKeys.reduce((a, k) => a + st.rankCounts[k], 0);
    if (rankTotal > 0) {
        const curRank = getFilterValues('filter-rank');
        const pie = generatePieChartBase64(rankKeys.map(k => { const c = SCORE_RANK_COLORS[k]; return typeof c === 'string' ? { count: st.rankCounts[k], color: c } : { count: st.rankCounts[k], gradient: c.gradient }; }), 200);
        const cells = rankKeys.map(k => {
            const c = SCORE_RANK_COLORS[k];
            const swatch = typeof c === 'string' ? c : `linear-gradient(90deg, ${c.gradient.join(', ')})`;
            const active = curRank.length === 1 && curRank[0] === k;
            const icon = k === SCORE_RANK_NONE ? '<span class="ns-chip-text">なし</span>' : `<img class="ns-rank-img" src="${escapeHtml(RANK_IMAGES[k])}" alt=""><span class="ns-rank-label">${escapeHtml(k)}</span>`;
            return `<button type="button" class="ns-chip${active ? ' active' : ''}" onclick="toggleStatCardFilter('rank', '${jsStringAttr(k)}')" title="${k === SCORE_RANK_NONE ? 'スコアなし' : escapeHtml(k)}で絞り込む"><span class="ns-swatch" style="background: ${swatch};"></span>${icon}<b>${st.rankCounts[k]}</b><span class="ns-chip-pct">${formatRate(st.rankCounts[k], rankTotal)}%</span></button>`;
        }).join('');
        const avg = st.scoreCount > 0 ? Math.round(st.scoreSum / st.scoreCount) : null;
        html += `<section class="ns-card"><div class="ns-card-title">スコア<span class="ns-card-sub">登録 ${st.scoreCount} / ${total}曲${avg !== null ? `・平均 ${avg.toLocaleString('ja-JP')}` : ''}</span></div>
            <div class="ns-chart"><img class="ns-pie" src="${pie}" alt="スコアの円グラフ"><div class="ns-chips">${cells}</div></div></section>`;
    }

    // レベル別スコア平均
    const lvs = Object.keys(st.levelScores).sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
    if (lvs.length > 0) {
        html += `<section class="ns-card"><div class="ns-card-title">スコア平均</div>
            <table class="ns-table ns-avg"><thead><tr><th>Lv</th><th>登録曲数</th><th>平均スコア</th><th>ランク</th></tr></thead><tbody>`;
        lvs.forEach(lv => {
            const ls = st.levelScores[lv];
            const avg = ls.count > 0 ? Math.round(ls.sum / ls.count) : null;
            const rank = avg !== null ? getScoreRankInfo(avg, true).rank : '';
            html += `<tr><th>${escapeHtml(lv)}</th><td class="ns-num">${ls.count} / ${ls.total}</td><td class="ns-num ns-avg-score">${avg !== null ? avg.toLocaleString('ja-JP') : '-'}</td>
                <td>${rank ? `<img class="ns-rank-img" src="${escapeHtml(RANK_IMAGES[rank])}" alt=""><span class="ns-rank-label">${escapeHtml(rank)}</span>` : '-'}</td></tr>`;
        });
        html += `</tbody></table></section>`;
    }
    return html;
}

// スコア内訳の円グラフと凡例（割合は「なし」を含めた全曲に対して）
function buildScoreRankChartHtml(rankCounts) {
    const chartData = [];
    SCORE_RANK_KEYS.concat(SCORE_RANK_NONE).forEach(k => {
        if (rankCounts[k] <= 0) return;
        const c = SCORE_RANK_COLORS[k];
        chartData.push(typeof c === 'string' ? { key: k, count: rankCounts[k], color: c } : { key: k, count: rankCounts[k], gradient: c.gradient });
    });
    const total = chartData.reduce((sum, d) => sum + d.count, 0);
    if (total === 0) return '';
    const legendHtml = chartData.map(d => {
        const swatch = d.gradient ? `linear-gradient(90deg, ${d.gradient.join(', ')})` : d.color;
        const label = d.key === SCORE_RANK_NONE ? 'なし' : d.key;
        return `
            <div style="display: flex; align-items: center; font-size: 0.85em; white-space: nowrap;">
                <span style="display: inline-block; width: 12px; height: 12px; background: ${swatch}; border: 1px solid #aaa; margin-right: 4px; border-radius: 2px;"></span>
                <span style="color: #333;">${escapeHtml(label)}: <span style="font-weight:bold;">${(d.count / total * 100).toFixed(1)}%</span></span>
            </div>`;
    }).join('');
    return `
        <div style="display: flex; flex-wrap: wrap; gap: 15px; align-items: center; margin-bottom: 15px; padding: 15px; background: #fff; border-radius: 6px; border: 1px solid #e0e0e0; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
            <img src="${generatePieChartBase64(chartData, 200)}" style="width: 120px; height: 120px; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.1); flex-shrink: 0;" alt="スコアランクの円グラフ">
            <div style="flex: 1; display: flex; flex-wrap: wrap; gap: 8px 12px; align-content: center;">${legendHtml}</div>
        </div>`;
}

// ==========================================
// ★ 表示レベルボタンの配置（メイン画面 / メニュー内）
// ==========================================
function applyLevelButtonPlacement(onMain) {
    // レベルボタンと表示方法の切り替えを、枠ごと移動する
    const panel = document.getElementById('level-view-panel');
    const slot = document.getElementById(onMain ? 'main-level-slot' : 'menu-level-slot');
    if (panel && slot && panel.parentElement !== slot) slot.appendChild(panel);
    const checkbox = document.getElementById('level-btn-on-main');
    if (checkbox) checkbox.checked = onMain;
}

function setLevelButtonPlacement(onMain) {
    storageSet('popn_level_btn_main', onMain ? '1' : '0');
    applyLevelButtonPlacement(onMain);
}

(function initLevelButtonPlacement() {
    const onMain = storageGet('popn_level_btn_main') !== '0';
    applyLevelButtonPlacement(onMain);
})();

// ==========================================
// ★ 表示方法（リスト / 難易度表 / スコア表）
// ==========================================
const VIEW_MODES = ['list', 'grid', 'medal', 'score', 'pokkura'];

// ---------- 表の向き（強い曲を右に置くか左に置くか。表ごとに、この端末に保存） ----------
//   'right' = 右が強い（強い順に1行ずつ区切って各行を左右反転。右上が最強）
//   'left'  = 左が強い（強い順に左上から並べる）
const GRID_DIR_DEFAULTS = { grid: 'right', medal: 'right', score: 'left', pokkura: 'left' };
const GRID_DIR_WORDS = { grid: ['弱', '強'], medal: ['弱', '強'], score: ['低', '高'], pokkura: ['低', '高'] };

function getGridDirection(mode) {
    const saved = storageGet('popn_dir_' + mode);
    return (saved === 'left' || saved === 'right') ? saved : (GRID_DIR_DEFAULTS[mode] || 'right');
}

// 上下の向き（'top' = 上が強い / 'bottom' = 下が強い。最初はどれも上が強い）。ポックラは上下を変えない
const GRID_VDIR_MODES = ['grid', 'medal', 'score'];

function getGridVertical(mode) {
    if (!GRID_VDIR_MODES.includes(mode)) return 'top';
    return storageGet('popn_vdir_' + mode) === 'bottom' ? 'bottom' : 'top';
}

// 表の上の矢印の列のボタン：その表の向きだけを入れ替える
function toggleGridDirection(mode = viewMode) {
    if (!GRID_DIR_DEFAULTS[mode]) return;
    storageSet('popn_dir_' + mode, getGridDirection(mode) === 'right' ? 'left' : 'right');
    renderTable();
}

function toggleGridVertical(mode = viewMode) {
    if (!GRID_VDIR_MODES.includes(mode)) return;
    storageSet('popn_vdir_' + mode, getGridVertical(mode) === 'bottom' ? 'top' : 'bottom');
    renderTable();
}

// 行（難易度・メダル・ランクのまとまり）を、上下の向きに合わせて並べる（強い順の配列を受け取る）
function orderRowsForVertical(rows, vertical) {
    return vertical === 'bottom' ? rows.slice().reverse() : rows.slice();
}

// 強い順の配列を、向きに合わせて並べ替える（cols ごとの列に区切り、右が強いなら各列を左右反転、下が強いなら列の順番を逆に）
function orderForDirection(list, cols, dir, vertical = 'top') {
    const lines = [];
    for (let i = 0; i < list.length; i += cols) {
        const line = list.slice(i, i + cols);
        lines.push(dir === 'right' ? line.reverse() : line);
    }
    if (vertical === 'bottom') lines.reverse();
    return [].concat(...lines);
}

// 表の上に出す向きの矢印（矢印の先が強い・高いほう）と、入れ替えボタン（⇄ 左右 / ⇅ 上下）
function buildDirectionBar(mode) {
    const [weak, strong] = GRID_DIR_WORDS[mode] || ['弱', '強'];
    const right = getGridDirection(mode) === 'right';
    const weakHtml = `<span class="dg-dir-word">${weak}</span>`;
    const strongHtml = `<span class="dg-dir-word dg-dir-strong">${strong}</span>`;
    const hasVertical = GRID_VDIR_MODES.includes(mode);
    const bottom = getGridVertical(mode) === 'bottom';
    const hBtn = `<button type="button" class="dg-dir-btn" onclick="toggleGridDirection('${mode}')" title="今は${right ? '右' : '左'}ほど${strong}い。押すと${right ? '左' : '右'}ほど${strong}くします" aria-label="左右を入れ替える">⇄</button>`;
    // 上下は左端（行の見出しの上）、左右は右端
    const vBox = hasVertical
        ? `<span class="dg-dir-vbox"><button type="button" class="dg-dir-btn" onclick="toggleGridVertical('${mode}')" title="今は${bottom ? '下' : '上'}ほど${strong}い。押すと${bottom ? '上' : '下'}ほど${strong}くします" aria-label="上下を入れ替える">⇅</button><span class="dg-dir-v" aria-hidden="true">${bottom ? '↓' : '↑'}${strong}</span></span>`
        : '';
    return `<div class="dg-dir${hasVertical ? ' has-v' : ''}">
        ${vBox}${right ? weakHtml : strongHtml}<span class="dg-dir-arrow ${right ? 'dg-dir-to-right' : 'dg-dir-to-left'}" aria-hidden="true"></span>${right ? strongHtml : weakHtml}
        <span class="dg-dir-btns">${hBtn}</span>
        <span class="sr-only">${right ? `右ほど${strong}い` : `左ほど${strong}い`}${hasVertical ? (bottom ? `・下ほど${strong}い` : `・上ほど${strong}い`) : ''}</span>
    </div>`;
}

// 起動時の表示方法（メニューの「起動時の表示」で設定、この端末に保存）
//   未設定なら、以前の「最後に選んだ表示方法」を引き継ぎ、それもなければ難易度表
function getStartupViewMode() {
    const saved = storageGet('popn_startup_view') || storageGet('popn_view_mode');
    return VIEW_MODES.includes(saved) ? saved : 'grid';
}

let viewMode = getStartupViewMode();
let lastGridNarrow = null; // 難易度表・スコア表を描いたときの画面幅の区分（列数の切り替え用）

// 今のユーザーが、スコアを1曲でも登録しているか（0 は登録なし扱い）
function hasAnyScore() {
    return Object.keys(scoreRecords).some(id => parseInt(scoreRecords[id], 10) > 0);
}

// 画面での切り替えは、そのときの表示だけを変える（次の起動時は「起動時の表示」の設定に従う）
function setViewMode(mode) {
    viewMode = VIEW_MODES.includes(mode) ? mode : 'list';
    toggleMenu(false);
    renderTable();
}

// ---------- 起動時の表示（メニューの中だけにある設定） ----------
function updateStartupSettingsUI() {
    const levelSelect = document.getElementById('startup-level');
    const viewSelect = document.getElementById('startup-view-mode');
    if (!levelSelect || !viewSelect) return;

    const savedLevel = storageGet('popn_startup_level') || '48';
    const levels = getSortedLevels();
    levelSelect.innerHTML = '';
    const addOption = (value, text) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.text = text;
        levelSelect.appendChild(opt);
    };
    addOption('ALL', 'すべて');
    levels.forEach(l => addOption(l, isNaN(parseInt(l, 10)) ? l : `Lv${l}`));
    // データにないレベルが保存されていたら「すべて」を見せる（保存値はそのまま残す）
    levelSelect.value = (savedLevel === 'ALL' || levels.includes(savedLevel)) ? savedLevel : 'ALL';

    viewSelect.value = getStartupViewMode();
}

function saveStartupSettings() {
    const levelSelect = document.getElementById('startup-level');
    const viewSelect = document.getElementById('startup-view-mode');
    if (levelSelect) storageSet('popn_startup_level', levelSelect.value);
    if (viewSelect) storageSet('popn_startup_view', VIEW_MODES.includes(viewSelect.value) ? viewSelect.value : 'grid');
}

// スコアを使う表示（スコア表・ポックラ）のボタンは、スコアを登録している人にだけ出す
const SCORE_VIEW_MODES = ['score', 'pokkura'];
function updateViewModeButtons() {
    const scoreOk = hasAnyScore();
    document.querySelectorAll('#view-mode-switch button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === viewMode);
        if (SCORE_VIEW_MODES.includes(btn.dataset.mode)) btn.style.display = scoreOk ? '' : 'none';
    });
    const pkImageBtn = document.getElementById('btn-pokkura-image');
    if (pkImageBtn) pkImageBtn.style.display = scoreOk ? '' : 'none';
}

// renderTable の最後に呼ばれる：表・難易度表・スコア表のどれを見せるかを切り替える
//   表の行は難易度表のときも作っておく（表示曲画像がスコア・比較の文字を表の行から読むため）
function applyViewMode(displaySongs) {
    // スコアがない人（ユーザーを切り替えたときなど）は、スコア表の代わりに難易度表にする
    if (SCORE_VIEW_MODES.includes(viewMode) && !hasAnyScore()) viewMode = 'grid';
    updateViewModeButtons();
    const capture = document.getElementById('capture-area');
    const grid = document.getElementById('diff-grid-view');
    if (!capture || !grid) return;
    const isGrid = viewMode !== 'list';
    capture.style.display = isGrid ? 'none' : '';
    grid.style.display = isGrid ? '' : 'none';
    const specialGrid = viewMode === 'grid' && !(document.getElementById('search-input').value.trim()) && isSpecialViewLevel(currentViewLevel);
    if (specialGrid && currentViewLevel === 'UPDATED') renderUpdatedGrid(displaySongs);
    else if (specialGrid && currentViewLevel === 'RECENT') renderRecentGrid(displaySongs);
    else if (viewMode === 'grid') renderDiffGrid(displaySongs);
    else if (viewMode === 'medal') renderMedalGrid(displaySongs);
    else if (viewMode === 'score') renderScoreGrid(displaySongs);
    else if (viewMode === 'pokkura') renderPokkuraGrid();
    else grid.innerHTML = '';
}

// メダル枠の中身（メダル画像 / 未解禁は鍵 / 未プレイは空）
function buildGridMedalInner(medalKey) {
    const m = MEDAL_TYPES[medalKey];
    if (medalKey === '未解禁') return '<span class="dg-lock">🔒</span>';
    if (m && m.imgUrl && isImageSrc(m.imgUrl)) {
        return `<img src="${escapeHtml(m.imgUrl)}" alt="${escapeHtml(m.label)}" loading="lazy">`;
    }
    return '';
}

// 裏メダルの小さな表示（表示しているメダルがイージーで、裏メダルがある曲だけ。メダル枠の左上に重ねる）
function buildUraBadgeHtml(songId, shownMedal) {
    if (shownMedal !== 'イージー' || typeof getUraMedalInfo !== 'function') return '';
    const info = getUraMedalInfo(songId);
    const m = info.ura ? MEDAL_TYPES[info.ura] : null;
    if (!m || !m.imgUrl) return '';
    const title = `裏メダル：${info.ura}${info.old ? '（旧筐体EC）' : ''}`;
    return `<img class="dg-ura" src="${escapeHtml(m.imgUrl)}" alt="${escapeHtml(title)}" title="${escapeHtml(title)}" loading="lazy">`;
}

function renderDiffGrid(targetSongs) {
    const grid = document.getElementById('diff-grid-view');
    const showScore = document.getElementById('show-score-col').checked; // スコア表示中は、メダルの上にスコアランクを重ねる
    const narrow = isNarrowScreen();
    const COLS = narrow ? 2 : 5;
    lastGridNarrow = narrow;

    if (targetSongs.length === 0) {
        grid.innerHTML = '<div class="dg-empty">表示する曲がありません</div>';
        return;
    }

    let html = buildDirectionBar('grid');
    const vertical = getGridVertical('grid');
    orderRowsForVertical(buildDiffTableGroups(targetSongs), vertical).forEach(g => {
        const labelHtml = g.cls === '未定'
            ? '<span class="dg-label-cls">未定</span>'
            : `<span class="dg-label-cls">${escapeHtml(g.cls)}</span><span class="dg-label-idx">${escapeHtml(g.label)}</span>`;
        const lightLabel = (g.cls === '弱' || (g.cls === '中' && g.label.startsWith('-'))) ? ' dg-label-light' : '';

        // 強い順の曲を、表の向き（最初は右が強い）に合わせて並べる
        const ordered = orderForDirection(g.songs, COLS, getGridDirection('grid'), vertical);

        let cells = '';
        ordered.forEach(song => { cells += buildDiffGridCellHtml(song, showScore); });

        html += `
            <div class="dg-row">
                <div class="dg-label${lightLabel}" style="background: ${getDiffTableLabelColor(g)};">${labelHtml}</div>
                <div class="dg-cells" style="grid-template-columns: repeat(${COLS}, minmax(0, 1fr));">${cells}</div>
            </div>`;
    });
    grid.innerHTML = html;
}

// 難易度表の1曲分（メダル：押すと変更 / バナー：押すと攻略wiki）。extraHtml はバナーの下に小さく出すもの
function buildDiffGridCellHtml(song, showScore, extraHtml = '') {
    const medalKey = clearRecords[song.id] || '';
    const medalClass = medalKey === '' ? ' dg-medal-empty' : '';
    const rank = showScore ? getSongScoreRank(song) : '';
    const rankHtml = rank ? `<img class="dg-rank" src="${escapeHtml(RANK_IMAGES[rank])}" alt="${escapeHtml(rank)}" loading="lazy">` : '';
    const bannerSrc = safeUrl(song.bannerUrl, true);
    const bannerInner = bannerSrc
        ? `<img src="${escapeHtml(bannerSrc)}" alt="${escapeHtml(song.title)}" loading="lazy">`
        : `<span class="dg-banner-text">${escapeHtml(song.title)}</span>`;
    const banner = `<a class="dg-banner" href="${escapeHtml(getWikiUrl(song))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(song.title)}（攻略wikiを開く）">${bannerInner}${buildMemoMarkHtml(song.id)}</a>`;
    return `
                <div class="dg-cell">
                    <button type="button" class="dg-medal${medalClass}" onclick="openMedalModal('${jsStringAttr(song.id)}')" title="メダルを変更">${buildGridMedalInner(medalKey)}${rankHtml}${buildUraBadgeHtml(song.id, medalKey)}</button>
                    ${extraHtml ? `<div class="dg-banner-wrap sv-wrap">${banner}${extraHtml}</div>` : banner}
                </div>`;
}

// ---------- 「更新」：日付ごとの行に、曲を縦に並べる。バナーの右にその日の変更（メダル・スコア）を出す ----------
const SPECIAL_WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function buildSvMedalIcon(key) {
    const m = MEDAL_TYPES[key];
    if (key === '') return '<span class="sv-medal-text">未</span>';
    if (m && m.imgUrl && isImageSrc(m.imgUrl)) return `<img class="sv-medal" src="${escapeHtml(m.imgUrl)}" alt="${escapeHtml(m.label)}" loading="lazy">`;
    return `<span class="sv-medal-text">${escapeHtml(m ? m.label : key)}</span>`;
}

// 縦並びのときの曲の情報（PC だけ。レベル・ジャンル名・曲名・難易度）
function buildSvSongInfoHtml(song, fallback) {
    if (!song) {
        return `<div class="sv-song"><span class="sv-song-lv">-</span><span class="sv-song-text"><span class="sv-song-genre">${escapeHtml(fallback.g || '')}</span><span class="sv-song-title">${escapeHtml(fallback.t || '')}</span></span></div>`;
    }
    const diff = song.diffRaw || song.diffClass || '';
    const style = getDifficultyColor(song.diffClass, song.diffIndex);
    return `<div class="sv-song">
        <span class="sv-song-lv">${escapeHtml(song.level)}</span>
        <span class="sv-song-text"><span class="sv-song-genre">${escapeHtml(song.genre || '')}</span><span class="sv-song-title">${escapeHtml(song.title)}</span>${getSongAttrs(song).length ? `<span class="song-attrs">${getSongAttrs(song).map(a => `<span>${escapeHtml(a)}</span>`).join('')}</span>` : ''}</span>
        ${diff ? `<span class="sv-song-diff" style="color: ${style.color}; text-shadow: ${style.shadow};">${escapeHtml(diff)}</span>` : ''}
    </div>`;
}

function renderUpdatedGrid(targetSongs) {
    const grid = document.getElementById('diff-grid-view');
    const showScore = document.getElementById('show-score-col').checked;
    lastGridNarrow = isNarrowScreen();
    const range = getUpdatedRange();
    const rangeBar = `
        <div class="sv-bar">
            <span class="sv-bar-text">${range === 'all' ? 'すべての更新' : `直近${UPDATED_RANGE_DAYS}日の更新`}</span>
            <div class="sv-range" role="group" aria-label="期間">
                <button type="button" class="${range === 'month' ? 'active' : ''}" onclick="setUpdatedRange('month')">1か月</button>
                <button type="button" class="${range === 'all' ? 'active' : ''}" onclick="setUpdatedRange('all')">全部</button>
            </div>
        </div>`;

    // 日付ごと・曲ごとにまとめる（その日の最初の変更前 → 最後の変更後）
    const shown = new Map(targetSongs.map(s => [s.id, s]));
    const days = [];
    const dayIndex = new Map();
    getUpdatedHistoryList().forEach(e => {
        const song = shown.get(e.id);
        if (!song) return;
        const d = new Date(e.t);
        const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (!dayIndex.has(dayKey)) {
            dayIndex.set(dayKey, days.length);
            days.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, wd: SPECIAL_WEEKDAYS[d.getDay()], items: new Map() });
        }
        const items = days[dayIndex.get(dayKey)].items;
        // 新しい順に見ていくので、最初に見た記録が「最後の変更後」、あとで見た記録が「最初の変更前」
        if (!items.has(e.id)) items.set(e.id, { song });
        const it = items.get(e.id);
        if ('nm' in e) { if (!('nm' in it)) it.nm = e.nm; it.om = e.om; }
        if ('ns' in e) { if (!('ns' in it)) it.ns = e.ns; it.os = e.os; }
    });

    if (days.length === 0) {
        grid.innerHTML = rangeBar + `<div class="dg-empty">${range === 'all' ? '更新履歴がありません' : `直近${UPDATED_RANGE_DAYS}日の更新はありません（「全部」で前の更新も見られます）`}</div>`;
        return;
    }
    // 日の中の並び：メダルが変わった曲（変わったあとのメダルが良い順）→ スコアだけ変わった曲（変わったあとのスコアが高い順）→ その他。
    //   同じ組の中は、メダルが良い順 → スコアが高い順
    const medalRank = k => (MEDAL_TYPES[k || ''] || MEDAL_TYPES['']).rank;
    const scoreOf = it => ('ns' in it && it.ns !== null ? it.ns : parseInt(scoreRecords[it.song.id], 10) || 0);
    const groupOf = it => ('nm' in it && it.om !== it.nm) ? 0 : ('ns' in it && it.os !== it.ns) ? 1 : 2;
    const medalOf = it => ('nm' in it ? it.nm : clearRecords[it.song.id]) || '';
    const byUpdate = (a, b) => (groupOf(a) - groupOf(b))
        || (groupOf(a) === 1 ? 0 : medalRank(medalOf(b)) - medalRank(medalOf(a)))
        || (scoreOf(b) - scoreOf(a))
        || (a.song.originalOrder - b.song.originalOrder);

    let html = rangeBar;
    days.forEach(day => {
        let cells = '';
        [...day.items.values()].sort(byUpdate).forEach(it => {
            const parts = [];
            if ('nm' in it && it.om !== it.nm) parts.push(`<span class="sv-change">${buildSvMedalIcon(it.om || '')}<span class="sv-arrow">→</span>${buildSvMedalIcon(it.nm || '')}</span>`);
            if ('ns' in it && it.os !== it.ns) {
                if (it.ns === null) parts.push('<span class="sv-score">スコア削除</span>');
                else if (it.os === null || it.os === undefined) parts.push(`<span class="sv-score">→${it.ns.toLocaleString('ja-JP')}</span>`);
                else {
                    const diff = it.ns - it.os;
                    parts.push(`<span class="sv-score ${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '+' : '−'}${Math.abs(diff).toLocaleString('ja-JP')}</span>`);
                }
            }
            if (parts.length === 0) parts.push('<span class="sv-score">もとに戻した</span>');
            cells += buildDiffGridCellHtml(it.song, showScore, `<div class="sv-info">${parts.join('')}</div>${buildSvSongInfoHtml(it.song)}`);
        });
        html += `
            <div class="dg-row">
                <div class="dg-label sv-label"><span class="dg-label-cls">${day.label}</span><span class="dg-label-idx">（${day.wd}）</span></div>
                <div class="dg-cells sv-list">${cells}</div>
            </div>`;
    });
    grid.innerHTML = html;
}

// ---------- 「最近」：公式の「最近プレーした曲」を、公式の順番（上が一番最近）で縦に ----------
function renderRecentGrid(targetSongs) {
    const grid = document.getElementById('diff-grid-view');
    const showScore = document.getElementById('show-score-col').checked;
    lastGridNarrow = isNarrowScreen();
    const recent = typeof loadRecentRecords === 'function' ? loadRecentRecords() : null;
    if (!recent || recent.list.length === 0) {
        grid.innerHTML = '<div class="dg-empty">公式データ取り込みをすると、最近プレーした曲が出ます</div>';
        return;
    }
    const at = recent.at ? new Date(recent.at) : null;
    const when = recent.rt ? `最終プレー ${recent.rt}` : (at && !isNaN(at) ? `${at.getMonth() + 1}/${at.getDate()} ${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')} 取り込み` : '');
    const shown = new Set(targetSongs.map(s => s.id));
    const isFiltered = targetSongs.length < getSpecialViewSongIds('RECENT').size;
    let cells = '';
    let count = 0;
    matchRecentSongs(recent.list).forEach((r, i) => {
        const order = `<span class="sv-order">${i + 1}</span>`;
        if (r.songs.length === 0) {
            // アプリにない曲（Lv45以下など）：曲名だけ。絞り込み中は出さない
            if (isFiltered) return;
            count++;
            cells += `
                <div class="dg-cell sv-cell-none">
                    <span class="dg-medal dg-medal-empty pk-medal-static"></span>
                    <div class="dg-banner-wrap sv-wrap">
                        <div class="dg-banner sv-none-banner" title="アプリにない曲です"><span class="dg-banner-text">${escapeHtml(r.t)}</span></div>
                        <div class="sv-info">${order}<span class="sv-score">アプリにない曲</span></div>
                        ${buildSvSongInfoHtml(null, r)}
                    </div>
                </div>`;
            return;
        }
        r.songs.forEach(song => {
            if (!shown.has(song.id)) return;
            count++;
            cells += buildDiffGridCellHtml(song, showScore, `<div class="sv-info">${order}<span class="sv-lv">Lv${escapeHtml(song.level)}</span></div>${buildSvSongInfoHtml(song)}`);
        });
    });
    let html = `<div class="sv-bar"><span class="sv-bar-text">公式の「最近プレーした曲」${when ? `（${escapeHtml(when)}）` : ''}</span></div>`;
    html += count === 0 ? '<div class="dg-empty">表示する曲がありません</div>' : `
        <div class="dg-row">
            <div class="dg-label sv-label"><span class="dg-label-cls">最近</span></div>
            <div class="dg-cells sv-list">${cells}</div>
        </div>`;
    grid.innerHTML = html;
}

// ---------- メダル表 ----------
// メダルごとの行（金星 → … → 黒丸 → 未プレイ → 未解禁）。行の中は、難易度指数の強い順（向きは表ごとの設定）
const DIFF_CLASS_RANK = { '危険': 8, '別格': 7, '詐称': 6, '強': 5, '中': 4, '弱': 3, '逆詐称': 2, '入門': 1 };

function renderMedalGrid(targetSongs) {
    const grid = document.getElementById('diff-grid-view');
    const showScore = document.getElementById('show-score-col').checked; // スコア表示中は、メダルの上にスコアランクを重ねる
    const narrow = isNarrowScreen();
    const COLS = narrow ? 2 : 5;
    lastGridNarrow = narrow;

    if (targetSongs.length === 0) {
        grid.innerHTML = '<div class="dg-empty">表示する曲がありません</div>';
        return;
    }

    const groups = {};
    targetSongs.forEach(song => {
        const key = MEDAL_TYPES[clearRecords[song.id] || ''] ? (clearRecords[song.id] || '') : '';
        (groups[key] = groups[key] || []).push(song);
    });
    const medalKeys = Object.keys(MEDAL_TYPES).sort((a, b) => MEDAL_TYPES[b].rank - MEDAL_TYPES[a].rank);
    const strongerFirst = (a, b) => (getDiffSortValue(b) - getDiffSortValue(a))
        || ((DIFF_CLASS_RANK[b.diffClass] || 0) - (DIFF_CLASS_RANK[a.diffClass] || 0))
        || (a.originalOrder - b.originalOrder);

    let html = buildDirectionBar('medal');
    const vertical = getGridVertical('medal');
    orderRowsForVertical(medalKeys, vertical).forEach(k => {
        const list = groups[k];
        if (!list || list.length === 0) return;
        list.sort(strongerFirst);
        const ordered = orderForDirection(list, COLS, getGridDirection('medal'), vertical);

        let cells = '';
        ordered.forEach(song => {
            const rank = showScore ? getSongScoreRank(song) : '';
            const rankHtml = rank ? `<img class="dg-rank" src="${escapeHtml(RANK_IMAGES[rank])}" alt="${escapeHtml(rank)}" loading="lazy">` : '';
            const bannerSrc = safeUrl(song.bannerUrl, true);
            const bannerInner = bannerSrc
                ? `<img src="${escapeHtml(bannerSrc)}" alt="${escapeHtml(song.title)}" loading="lazy">`
                : `<span class="dg-banner-text">${escapeHtml(song.title)}</span>`;
            const diffText = song.diffRaw ? `・${song.diffRaw}` : '';
            cells += `
                <div class="dg-cell">
                    <button type="button" class="dg-medal${k === '' ? ' dg-medal-empty' : ''}" onclick="openMedalModal('${jsStringAttr(song.id)}')" title="メダルを変更">${buildGridMedalInner(k)}${rankHtml}${buildUraBadgeHtml(song.id, k)}</button>
                    <a class="dg-banner" href="${escapeHtml(getWikiUrl(song))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(song.title)}（Lv${escapeHtml(song.level)}${escapeHtml(diffText)}・攻略wikiを開く）">${bannerInner}${buildMemoMarkHtml(song.id)}</a>
                </div>`;
        });

        const m = MEDAL_TYPES[k];
        const icon = buildGridMedalInner(k);
        const labelHtml = icon && k !== '未解禁'
            ? `<span class="mg-label-icon">${icon}</span>`
            : `<span class="dg-label-cls mg-label-text">${escapeHtml(m.label)}</span>`;
        html += `
            <div class="dg-row">
                <div class="dg-label mg-label" style="background: ${k === '' ? '#9e9e9e' : (MEDAL_COLORS[k] || '#9e9e9e')};" title="${escapeHtml(m.label)}">${labelHtml}<span class="sg-count">${list.length}曲</span></div>
                <div class="dg-cells" style="grid-template-columns: repeat(${COLS}, minmax(0, 1fr));">${cells}</div>
            </div>`;
    });
    grid.innerHTML = html;
}

// ---------- スコア表 ----------
// スコアランクごとの行（S+ → E、最後に「なし」）。行の中は、スコアの高い順（向きは表ごとの設定）
const SCORE_GRID_LABEL_COLORS = {
    'S+': '#d4a106', 'S': '#e0b31a', 'AAA': '#e65100', 'AA+': '#ef6c00', 'AA': '#f57c00',
    'A+': '#c62828', 'A': '#d32f2f', 'B+': '#1565c0', 'B': '#1976d2', 'C': '#2e7d32', 'D': '#558b2f', 'E': '#6d4c41'
};

function renderScoreGrid(targetSongs) {
    const grid = document.getElementById('diff-grid-view');
    const narrow = isNarrowScreen();
    const COLS = narrow ? 2 : 5;
    lastGridNarrow = narrow;

    if (targetSongs.length === 0) {
        grid.innerHTML = '<div class="dg-empty">表示する曲がありません</div>';
        return;
    }

    const groups = {};
    SCORE_RANK_KEYS.concat(SCORE_RANK_NONE).forEach(k => { groups[k] = []; });
    targetSongs.forEach(song => groups[getSongScoreRank(song) || SCORE_RANK_NONE].push(song));

    const scoreOf = song => parseInt(scoreRecords[song.id], 10) || 0;
    const medalRankOf = song => (MEDAL_TYPES[clearRecords[song.id] || ''] || { rank: 0 }).rank;

    let html = buildDirectionBar('score');
    const vertical = getGridVertical('score');
    orderRowsForVertical(SCORE_RANK_KEYS.concat(SCORE_RANK_NONE), vertical).forEach(k => {
        const list = groups[k];
        if (list.length === 0) return;
        // 高い順（スコアなしはメダルの良い順）に、表の向き（最初は左が高い）に合わせて並べる
        list.sort((a, b) => (scoreOf(b) - scoreOf(a)) || (medalRankOf(b) - medalRankOf(a)) || (a.originalOrder - b.originalOrder));
        const ordered = orderForDirection(list, COLS, getGridDirection('score'), vertical);

        let cells = '';
        ordered.forEach(song => {
            const medalKey = clearRecords[song.id] || '';
            const medalClass = medalKey === '' ? ' dg-medal-empty' : '';
            const score = scoreOf(song);
            const bannerSrc = safeUrl(song.bannerUrl, true);
            const bannerInner = bannerSrc
                ? `<img src="${escapeHtml(bannerSrc)}" alt="${escapeHtml(song.title)}" loading="lazy">`
                : `<span class="dg-banner-text">${escapeHtml(song.title)}</span>`;
            const safeId = jsStringAttr(song.id);
            cells += `
                <div class="dg-cell">
                    <button type="button" class="dg-medal${medalClass}" onclick="openMedalModal('${safeId}')" title="メダルを変更">${buildGridMedalInner(medalKey)}${buildUraBadgeHtml(song.id, medalKey)}</button>
                    <div class="dg-banner-wrap">
                        <a class="dg-banner" href="${escapeHtml(getWikiUrl(song))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(song.title)}（攻略wikiを開く）">${bannerInner}${buildMemoMarkHtml(song.id)}</a>
                        <button type="button" class="dg-score${score ? '' : ' dg-score-none'}" onclick="openScoreModal('${safeId}')" title="スコアを変更">${score ? score : '-'}</button>
                    </div>
                </div>`;
        });

        const labelHtml = k === SCORE_RANK_NONE
            ? '<span class="dg-label-idx sg-label-none">なし</span>'
            : `<img class="sg-rank-img" src="${escapeHtml(RANK_IMAGES[k])}" alt="${k}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span class="dg-label-idx" style="display:none;">${k}</span>`;
        html += `
            <div class="dg-row">
                <div class="dg-label sg-label" style="background: ${SCORE_GRID_LABEL_COLORS[k] || '#9e9e9e'};">${labelHtml}<span class="sg-count">${list.length}曲</span></div>
                <div class="dg-cells" style="grid-template-columns: repeat(${COLS}, minmax(0, 1fr));">${cells}</div>
            </div>`;
    });
    grid.innerHTML = html;
}

// ---------- ポックラ（ポップンクラス） ----------
// 計算は ssdh233/popn-class（ポックラ一覧スクリプト）と同じ式。
//   1曲のポイント = level × (3750 × level + メダルボーナス + (スコア − 50000)) ÷ 3881250 × 60（スコア 50000 未満は 0）
//   ポックラ = （新曲 Lv46〜49 の上位20曲 ＋ 旧曲 Lv48〜50 の上位40曲）のポイント合計 ÷ 60
// ※ 公式は旧曲を「今作のスコア」で数えるが、このアプリには歴代ベストしかないので目安になる
const POKKURA_MEDAL_BONUS = {
    '金星': 21250,
    '銀星': 17500, '銀菱': 17500, '銀丸': 17500,
    '銅星': 12500, '銅菱': 12500, '銅丸': 12500,
    'ロングオフ': 10000,
    'イージー': 6250
};
const POKKURA_NEW_COUNT = 20;
const POKKURA_OLD_COUNT = 40;

const pkFloor = (n, p) => Math.floor(n * 10 ** p) / 10 ** p;
const pkRound = (n, p) => Math.round(n * 10 ** p) / 10 ** p;

function calcPokkuraPoint(level, score, medalKey) {
    const s = parseInt(score, 10);
    if (isNaN(s) || s < 50000) return 0;
    const bonus = POKKURA_MEDAL_BONUS[medalKey] || 0;
    return pkFloor(pkFloor((level * (3750 * level + bonus + (s - 50000))) / 3881250, 8) * 60, 2);
}

// 今作（新曲枠のバージョン）：曲データの中で一番新しいアーケードのバージョン（CS 系・未入力は除く）
//   今は HC。次のバージョンの曲を入れると、自動でそちらになる
function getPokkuraNewVersion() {
    let best = null;
    songs.forEach(s => {
        const v = getVersionSortValue(s.version);
        if (v >= VERSION_ORDER_CS) return;
        if (!best || v > best.value) best = { value: v, label: String(s.version).trim() };
    });
    return best || { value: VERSION_ORDER_HC, label: 'HC' };
}

// ポックラで使うレベル。難易度が変わってもポックラは前のレベルのまま、という曲だけ
//   曲データに pokkuraLevel が入っている（Lv と同じなら入れない）
function getPokkuraLevel(song) {
    return song.pokkuraLevel || song.level;
}

// 新曲（今作）は Lv49 まで（アプリにあるのは Lv46 以上）、旧曲は Lv48〜50 が対象
function getPokkuraGroup(song, newVersionValue) {
    const lv = parseInt(getPokkuraLevel(song), 10);
    if (getVersionSortValue(song.version) === newVersionValue && lv <= 49) return 'new';
    return (lv >= 48 && lv <= 50) ? 'old' : null;
}

// ---------- 旧ポックラ（Jam&Fizz までの計算。ssdh233/popn-class の index.js と同じ式） ----------
//   1曲 = (10000×Lv + スコア − 50000 + メダルボーナス) ÷ 5440（スコア 50000 未満は 0）
//   旧ポックラ = Lv48〜50 の全曲（歴代ベスト）の上位50曲の平均
const OLD_POKKURA_MEDAL_BONUS = {
    '金星': 5000, '銀星': 5000, '銀菱': 5000, '銀丸': 5000,
    '銅星': 3000, '銅菱': 3000, '銅丸': 3000,
    'イージー': 3000, 'ロングオフ': 3000
};
const OLD_POKKURA_COUNT = 50;

function calcOldPokkuraPoint(level, score, medalKey) {
    const s = parseInt(score, 10);
    if (isNaN(s) || s < 50000) return 0;
    return pkFloor(pkRound((10000 * level + s - 50000 + (OLD_POKKURA_MEDAL_BONUS[medalKey] || 0)) / 5440, 8), 2);
}

function calcOldPokkura() {
    const points = [];
    songs.forEach(song => {
        const lv = parseInt(song.level, 10);
        if (!(lv >= 48 && lv <= 50)) return;
        const point = calcOldPokkuraPoint(lv, scoreRecords[song.id], clearRecords[song.id] || '');
        if (point > 0) points.push(point);
    });
    points.sort((a, b) => b - a);
    const top = points.slice(0, OLD_POKKURA_COUNT);
    const sum = top.reduce((acc, p) => acc + p, 0);
    const raw = pkRound(sum / OLD_POKKURA_COUNT, 8);
    // 次の 0.01 まであと何点（旧ポックラはスコアに Lv が掛からないので、どの曲でも 1点で 1 ÷ 5440 ÷ 50 上がる。
    //   ssdh233/popn-class のブックマークレットと同じ計算）
    const next = (Math.floor(raw * 100 + 1e-9) + 1) / 100;
    const toNext = Math.ceil((next - raw) * 5440 * OLD_POKKURA_COUNT);
    return { total: pkFloor(raw, 2), count: top.length, raw, next, toNext, per001: 5440 * OLD_POKKURA_COUNT / 100 };
}

// ---------- イージーの曲の裏メダルと旧筐体EC ----------
//   pokkuraFlagRecords: { 曲ID: { vm: 裏メダル（'黒星' | '黒菱' | '黒丸'）, old: 旧筐体EC } }（ユーザーごと・クラウドに保存）
//   どのイージーの曲にも裏メダルを付けられる。ポックラで裏メダルを使うのは、旧筐体EC（旧筐体でつけたイージー）の曲だけ。
//   ver 3.8.0.0 の { vm } だけの記録は、旧筐体EC として読む
const POKKURA_OLD_EASY_CHOICES = ['イージー', '黒星', '黒菱', '黒丸'];

function getPokkuraFlagRecords(user = currentUser) {
    if (!allUsersData[user]) allUsersData[user] = emptyUser();
    if (!allUsersData[user].pokkuraFlagRecords) allUsersData[user].pokkuraFlagRecords = {};
    return allUsersData[user].pokkuraFlagRecords;
}

const URA_MEDALS = ['黒星', '黒菱', '黒丸'];

// { ura: 裏メダル（なければ ''）, old: 旧筐体EC }
function getUraMedalInfo(songId) {
    const f = getPokkuraFlagRecords()[songId];
    const ura = f && URA_MEDALS.includes(f.vm) ? f.vm : '';
    return { ura, old: !!ura && (f.old === undefined ? true : !!f.old) };
}

function setUraMedalInfo(songId, ura, old) {
    const flags = getPokkuraFlagRecords();
    if (!URA_MEDALS.includes(ura)) ura = '';
    if (!ura) delete flags[songId];
    else flags[songId] = { vm: ura, old: !!old };
    scheduleAutoSave();
    renderTable();
}

// ポックラで使うメダル（旧筐体EC で裏メダルがあれば裏メダル、なければイージー）
function getPokkuraOldEasyMedal(songId) {
    const info = getUraMedalInfo(songId);
    return info.old ? info.ura : 'イージー';
}

// ポックラ画面のプルダウン：黒を選ぶと裏メダル＋旧筐体EC、イージーを選ぶと旧筐体EC だけ外す（裏メダルは残す）
function setPokkuraOldEasyMedal(songId, medal) {
    if (!POKKURA_OLD_EASY_CHOICES.includes(medal)) return;
    if (medal === 'イージー') setUraMedalInfo(songId, getUraMedalInfo(songId).ura, false);
    else setUraMedalInfo(songId, medal, true);
}

function calcPokkura() {
    const entries = { new: [], old: [] };
    const newVersion = getPokkuraNewVersion();
    // 旧曲は、公式データ取り込みで保存した「今作のスコア」があればそれで数える（なければ歴代ベスト）
    const version = loadPokkuraVersionRecords(currentUser);
    songs.forEach(song => {
        const group = getPokkuraGroup(song, newVersion.value);
        if (!group) return;
        const vr = group === 'old' && version ? version.records[song.id] : null;
        const score = vr ? vr.s : scoreRecords[song.id];
        let medal = vr ? vr.m : (clearRecords[song.id] || '');
        // 歴代のイージーで計算する曲（今作スコアを読んだ旧曲で今作のメダルが黒星と推測された曲・今作スコアを読んでいない旧曲・新曲）は、
        //   旧筐体EC なら裏メダル（黒）、そうでなければイージーで数える
        const easySelectable = clearRecords[song.id] === 'イージー' && (!vr || vr.m === '黒星');
        if (easySelectable) medal = getPokkuraOldEasyMedal(song.id);
        const point = calcPokkuraPoint(parseInt(getPokkuraLevel(song), 10), score, medal);
        if (point > 0) entries[group].push({ song, point, score: parseInt(score, 10) || 0, isVersion: !!vr, easySelectable, calcMedal: medal });
    });
    // Lv45 以下の今作の新曲（公式データ取り込みで保存したもの。アプリには曲として入っていない）
    const extraNew = version ? version.extraNew : [];
    extraNew.forEach((c, i) => {
        const point = calcPokkuraPoint(c.l, c.s, c.m);
        if (point > 0) entries.new.push({ extra: { title: c.t, genre: c.g, level: String(c.l), medal: c.m, order: 100000 + i }, point, score: c.s });
    });
    const orderOf = e => e.song ? e.song.originalOrder : e.extra.order;
    const byPoint = (a, b) => (b.point - a.point) || (orderOf(a) - orderOf(b));
    entries.new.sort(byPoint);
    entries.old.sort(byPoint);
    const sum = list => list.reduce((acc, e) => acc + e.point, 0);
    const topNew = entries.new.slice(0, POKKURA_NEW_COUNT);
    const topOld = entries.old.slice(0, POKKURA_OLD_COUNT);
    return {
        version,
        newVersionLabel: newVersion.label,
        extraCount: extraNew.length,
        topNew, topOld,
        restNew: entries.new.slice(POKKURA_NEW_COUNT),
        restOld: entries.old.slice(POKKURA_OLD_COUNT),
        newPoint: pkFloor(pkRound(sum(topNew), 8) / 60, 2),
        oldPoint: pkFloor(pkRound(sum(topOld), 8) / 60, 2),
        total: pkFloor(pkRound(sum(topNew) + sum(topOld), 8) / 60, 2),
        // 切り捨てる前の計算値（次の 0.01 まであと何点かを出すのに使う）
        rawTotal: pkRound(sum(topNew) + sum(topOld), 8) / 60
    };
}

// ---------- ポックラを上げるおすすめ ----------
//   曲ごとに「メダルを1段上げる」「スコアを +1000 点ずつ上げる」「未プレイの曲をクリア」の案を作り、
//   やりやすさ（上がり幅 ÷ 大変さ）の一番よい案を1つ残す。大変さ = 種類の重み × 難しさ（Lv・難易度） × タグ（相性）
const POKKURA_REC_COUNT = 20;
const POKKURA_REC_AFFINITY = { '得意': 0.7, '噛み合い待ち': 1.3, '苦手': 1.5, '敵': 2, '💩': 2 };

// スコアを from から to に上げる大変さ（1000点ごとに 1、98000点より上は 2 倍）
function pokkuraScoreEffort(from, to) {
    const low = Math.max(0, Math.min(to, 98000) - from);
    const high = Math.max(0, to - Math.max(from, 98000));
    return (low + high * 2) / 1000;
}

function calcPokkuraRecommendations(pk) {
    const groups = {
        new: { top: pk.topNew, count: POKKURA_NEW_COUNT },
        old: { top: pk.topOld, count: POKKURA_OLD_COUNT }
    };
    Object.values(groups).forEach(g => {
        g.sum = g.top.reduce((acc, e) => acc + e.point, 0);
        g.cutoff = g.top.length >= g.count ? g.top[g.top.length - 1].point : 0;
    });
    const totalOf = (newSum, oldSum) => pkFloor(pkRound(newSum + oldSum, 8) / 60, 2);
    // その曲のポイントが newPoint になったときの上がり幅
    const gainOf = (groupKey, entry, newPoint) => {
        const g = groups[groupKey];
        let sum = g.sum;
        if (entry && g.top.includes(entry)) sum += Math.max(newPoint, entry.point) - entry.point;
        else if (g.top.length < g.count) sum += newPoint;
        else if (newPoint > g.cutoff) sum += newPoint - g.cutoff;
        const total = groupKey === 'new' ? totalOf(sum, groups.old.sum) : totalOf(groups.new.sum, sum);
        return pkRound(total - pk.total, 2);
    };

    const entryOf = {};
    [...pk.topNew, ...pk.restNew, ...pk.topOld, ...pk.restOld].forEach(e => { if (e.song) entryOf[e.song.id] = e; });
    const newVersion = getPokkuraNewVersion();
    const recs = [];
    songs.forEach(song => {
        if (clearRecords[song.id] === '未解禁') return;
        const groupKey = getPokkuraGroup(song, newVersion.value);
        if (!groupKey) return;
        const lv = parseInt(getPokkuraLevel(song), 10);
        const diff = getDiffSortValue(song);
        const memo = memoRecords[song.id] || {};
        // タグの重み（付いているタグの分を掛け合わせる。新しく作ったタグは 1）
        const tagWeight = getMemoTags(memo).reduce((w, t) => w * (POKKURA_REC_AFFINITY[t] || 1), 1);
        const hardness = Math.pow(2, (lv - 48) + (diff === -999 ? 0 : diff) * 0.5) * tagWeight;
        const entry = entryOf[song.id] || null;
        const options = [];
        const add = (kind, gain, effort, extra) => {
            if (gain >= 0.01) options.push({ kind, gain, ease: gain / (effort * hardness), ...extra });
        };
        if (entry) {
            const score = entry.score;
            const medal = entry.calcMedal || '';
            // メダルを1段上げる（スコアはそのまま）。あと少しで届く曲だけ：
            //   黒星・裏メダルが黒星のイージー → クリア、銅星 → フルコンボ
            let target = null;
            let from = medal;
            const uraKuroboshi = medal === 'イージー' && getUraMedalInfo(song.id).ura === '黒星';
            if (medal === '黒星' || uraKuroboshi) {
                target = { medal: '銅星', label: 'クリア', effort: 5, score };
                if (uraKuroboshi) from = '黒星';
            } else if (medal === '銅星') {
                target = { medal: '銀星', label: 'フルコンボ', effort: 5 + Math.max(0, 95000 - score) / 2000, score };
            }
            if (target) add('medal', gainOf(groupKey, entry, calcPokkuraPoint(lv, target.score, target.medal)), target.effort, { target, from, ura: uraKuroboshi });
            // スコアを +1000 点ずつ、0.01 以上上がるところまで
            for (let to = score + 1000; score < 100000; to += 1000) {
                const s = Math.min(to, 100000);
                const gain = gainOf(groupKey, entry, calcPokkuraPoint(lv, s, medal));
                if (gain >= 0.01) { add('score', gain, pokkuraScoreEffort(score, s), { from: score, to: s }); break; }
                if (s >= 100000) break;
            }
        } else {
            // 未プレイ（ポイントなし）：クリアで 0.01 以上上がる一番低い点数（1000点刻み）
            for (let s = 50000; s <= 100000; s += 1000) {
                const gain = gainOf(groupKey, null, calcPokkuraPoint(lv, s, '銅星'));
                if (gain >= 0.01) { add('new', gain, 3 + pokkuraScoreEffort(80000, Math.max(s, 80000)), { to: s }); break; }
            }
        }
        if (options.length === 0) return;
        options.sort((a, b) => b.ease - a.ease);
        recs.push({ song, group: groupKey, entry, ...options[0] });
    });
    recs.sort((a, b) => (b.ease - a.ease) || (b.gain - a.gain) || (a.song.originalOrder - b.song.originalOrder));
    return recs.slice(0, POKKURA_REC_COUNT);
}

function buildPokkuraRecHtml(pk) {
    const recs = calcPokkuraRecommendations(pk);
    if (recs.length === 0) return '<div class="dg-empty">おすすめの曲はありません</div>';
    const fmt = n => Number(n).toLocaleString('ja-JP');
    const rows = recs.map((r, i) => {
        const song = r.song;
        const safeId = jsStringAttr(song.id);
        const bannerSrc = safeUrl(song.bannerUrl, true);
        const bannerInner = bannerSrc
            ? `<img src="${escapeHtml(bannerSrc)}" alt="${escapeHtml(song.title)}" loading="lazy">`
            : `<span class="pk-rec-title">${escapeHtml(song.title)}</span>`;
        let action;
        if (r.kind === 'medal') {
            action = `<button type="button" class="pk-rec-action" onclick="openMedalModal('${safeId}')" title="メダルを変更">
                ${r.ura ? '<span class="pk-rec-sub">裏</span>' : ''}<span class="pk-rec-medal">${buildGridMedalInner(r.from)}</span>→<span class="pk-rec-medal">${buildGridMedalInner(r.target.medal)}</span>
                <b>${r.target.label}</b></button>`;
        } else if (r.kind === 'score') {
            action = `<button type="button" class="pk-rec-action" onclick="openScoreModal('${safeId}')" title="スコアを変更">
                スコア ${fmt(r.from)} → <b>${fmt(r.to)}</b><span class="pk-rec-sub">（+${fmt(r.to - r.from)}）</span></button>`;
        } else {
            action = `<button type="button" class="pk-rec-action" onclick="openMedalModal('${safeId}')" title="メダルを変更">
                <span class="pk-rec-medal">${buildGridMedalInner('銅星')}</span><b>クリア</b>＋<b>${fmt(r.to)}</b>点</button>`;
        }
        const pkLevel = getPokkuraLevel(song);
        return `
            <div class="pk-rec-row">
                <span class="pk-rec-rank">${i + 1}</span>
                <a class="pk-rec-banner" href="${escapeHtml(getWikiUrl(song))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(song.title)}（攻略wikiを開く）">${bannerInner}</a>
                <div class="pk-rec-body">
                    <div class="pk-rec-meta"><span class="pk-rec-group pk-rec-group-${r.group}">${r.group === 'new' ? '新曲' : '旧曲'}</span>Lv${escapeHtml(pkLevel)}${song.diffClass ? ` ${escapeHtml(song.diffClass)}` : ''}</div>
                    ${action}
                </div>
                <span class="pk-rec-gain">+${r.gain.toFixed(2)}</span>
            </div>`;
    }).join('');
    return `<div class="pk-rec-list">${rows}</div>`;
}

function formatPokkuraDate(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ポックラ画面のタブ（'top' = 対象曲 / 'rest' = 圏外 / 'up' = おすすめ）。描き直しても選んだタブのまま
const POKKURA_TABS = ['top', 'rest', 'up'];
let pokkuraTab = 'top';

// 次の 0.01 まで、対象曲のスコアをあと何点（合計）伸ばせばよいか（レベルごと）。
//   対象曲のスコアを 1点上げると、ポックラは Lv ÷ 3881250 上がる（曲ごとの切り捨てがあるので目安）
const POKKURA_PER_POINT_DIV = 3881250;
const POKKURA_HINT_LEVELS = [50, 49, 48, 47, 46];

//   レベルをまとめた目安は、今の対象曲の平均レベルで出す（レベルによる差は Lv48 と Lv50 で 4% ほど）
function getPokkuraPointsToNext(pk) {
    const next = (Math.floor(pk.rawTotal * 100 + 1e-9) + 1) / 100;
    const gap = Math.max(0, next - pk.rawTotal);
    const lvOf = e => e.song ? parseInt(getPokkuraLevel(e.song), 10) : parseInt(e.extra.level, 10);
    const target = pk.topNew.concat(pk.topOld).map(lvOf).filter(lv => lv > 0);
    const avgLv = target.length > 0 ? target.reduce((a, b) => a + b, 0) / target.length : 49;
    return {
        next, avgLv,
        points: Math.ceil(gap * POKKURA_PER_POINT_DIV / avgLv),
        per001: Math.ceil(0.01 * POKKURA_PER_POINT_DIV / avgLv),
        levels: POKKURA_HINT_LEVELS.map(lv => ({ lv, points: Math.ceil(gap * POKKURA_PER_POINT_DIV / lv) }))
    };
}

// ポックラの計算のしかた（ポックラ画面のいちばん下）
function buildPokkuraExplainHtml(pk) {
    const oldPk = calcOldPokkura();
    const bonus = (k) => POKKURA_MEDAL_BONUS[k].toLocaleString('ja-JP');
    const toNext = getPokkuraPointsToNext(pk);
    const rows = POKKURA_HINT_LEVELS.map((lv, i) => `<tr><th>Lv${lv}</th><td>約${toNext.levels[i].points.toLocaleString('ja-JP')}点</td><td>約${Math.ceil(0.01 * POKKURA_PER_POINT_DIV / lv).toLocaleString('ja-JP')}点</td></tr>`).join('');
    return `
        <details class="pk-explain">
            <summary>ポックラの計算のしかた</summary>
            <div class="pk-explain-body">
                <h4>1曲のポイント</h4>
                <p class="pk-formula">Lv × ( 3750 × Lv ＋ メダルボーナス ＋ ( スコア − 50000 ) ) ÷ 3881250 × 60</p>
                <ul>
                    <li>小数第2位で切り捨て。スコアが 50000 未満の曲は 0。</li>
                    <li>メダルボーナス：金星 ${bonus('金星')}／銀 ${bonus('銀星')}／銅 ${bonus('銅星')}／ロングオフ ${bonus('ロングオフ')}／イージー ${bonus('イージー')}／黒・未クリア 0</li>
                    <li>画面の各曲の右下の数（例 0.712）は、このポイント ÷ 60 ＝ その曲がポックラに足している量。</li>
                </ul>
                <h4>ポックラ</h4>
                <p class="pk-formula">（新曲の上位${POKKURA_NEW_COUNT}曲 ＋ 旧曲の上位${POKKURA_OLD_COUNT}曲 のポイントの合計）÷ 60</p>
                <ul>
                    <li>小数第2位で切り捨て。</li>
                    <li>新曲：今作（${escapeHtml(pk.newVersionLabel)}）の Lv49 以下。旧曲：それより前の Lv48〜50。</li>
                    <li>旧曲は、公式データ取り込みで読んだ「今作のスコア」で数える（読んでいなければ歴代ベスト）。</li>
                    <li>アプリの計算値は、公式の値と少しずれることがある。</li>
                </ul>
                <h4>上げるには</h4>
                <p class="pk-explain-big">+0.01まで：対象曲の合計で <b>約${toNext.points.toLocaleString('ja-JP')}点</b>（その後は 0.01 ごとに 約${toNext.per001.toLocaleString('ja-JP')}点）</p>
                <p class="pk-explain-note">今の対象曲の平均レベル ${toNext.avgLv.toFixed(1)} で計算した目安です（計算値 ${pk.rawTotal.toFixed(4)} から）。1点の重みはレベルで少し違うので、レベルごとの数は下の表のとおりです。</p>
                <table class="pk-explain-table">
                    <thead><tr><th>伸ばす曲</th><th>+0.01まで</th><th>0.01 ごと</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                <ul>
                    <li>対象曲のスコアを 1点上げると、ポックラは Lv ÷ 3881250 上がる（0.01 ごと ＝ 38812.5 ÷ Lv 点）。</li>
                    <li>いろいろなレベルの曲で伸ばすときは、それぞれのレベルの割合で足し合わせる（例：Lv50 で 400点 ＋ Lv49 で 400点 ≒ 0.01）。</li>
                    <li>メダルが上がると、ボーナスの差の分だけスコアが上がったのと同じ（例：銅→銀で ＋5000点分、Lv49 なら約 ＋0.06）。</li>
                    <li>圏外の曲は、上がったポイントが対象の一番下の曲を超えたときだけ、その差の分だけ上がる。</li>
                </ul>
                <h4>旧ポックラ（Jam&amp;Fizz までの計算）</h4>
                <p class="pk-formula">1曲 ＝ ( 10000 × Lv ＋ スコア − 50000 ＋ ボーナス ) ÷ 5440</p>
                <ul>
                    <li>ボーナス：金・銀 5000／銅・イージー・ロングオフ 3000。Lv48〜50 の歴代ベスト上位${OLD_POKKURA_COUNT}曲の平均。</li>
                    <li>スコアに Lv が掛からないので、どの曲でも 1点で 1 ÷ 5440 ÷ ${OLD_POKKURA_COUNT} 上がる。0.01 ごとに対象曲の合計で ${(5440 * OLD_POKKURA_COUNT / 100).toLocaleString('ja-JP')}点。${oldPk.count > 0 ? `今は +0.01まで：約${oldPk.toNext.toLocaleString('ja-JP')}点。` : ''}</li>
                </ul>
            </div>
        </details>`;
}

function renderPokkuraGrid() {
    const grid = document.getElementById('diff-grid-view');
    const narrow = isNarrowScreen();
    const COLS = narrow ? 2 : 5;
    lastGridNarrow = narrow;
    const pk = calcPokkura();

    const sourceText = pk.version
        ? `公式データ ${formatPokkuraDate(pk.version.at)} 時点`
        : '歴代ベストで計算（公式データ未取り込み）';
    const topCount = pk.topNew.length + pk.topOld.length;
    const restCount = pk.restNew.length + pk.restOld.length;

    // 公式サイトの値があれば、それを大きく出し、アプリの計算値は下に小さく出す
    const official = pk.version && typeof pk.version.pc === 'number' ? pk.version.pc : null;
    const oldPk = calcOldPokkura();
    const partsText = `新曲 ${pk.newPoint.toFixed(2)} ＋ 旧曲 ${pk.oldPoint.toFixed(2)}`;
    const toNext = getPokkuraPointsToNext(pk);
    const hasNew = pk.topNew.length + pk.topOld.length > 0;
    // 左が新ポックラ（アプリの計算値）、右が旧ポックラ。上の行に値、下の行に +0.01 までのスコア（対象曲の合計）
    const subHtml = `
            <div class="pk-sub">
                <div class="pk-sub-col" title="新ポックラはアプリの計算値。+0.01 までは対象曲の平均レベル（${toNext.avgLv.toFixed(1)}）で計算した目安。Lv50 の曲なら少し少なく、Lv48 の曲なら少し多くなります">
                    <div>新ポックラ ${pk.total.toFixed(2)}</div>
                    <div>${hasNew ? `+0.01まで：約${toNext.points.toLocaleString('ja-JP')}点` : '-'}</div>
                </div>
                <div class="pk-sub-col" title="旧ポックラ（Jam&amp;Fizz までの計算）。どの曲で伸ばしても同じ点数">
                    <div>旧ポックラ ${oldPk.total.toFixed(2)}</div>
                    <div>${oldPk.count > 0 ? `+0.01まで：約${oldPk.toNext.toLocaleString('ja-JP')}点` : '-'}</div>
                </div>
            </div>`;
    let html = official !== null ? `
        <div class="pk-summary">
            <div class="pk-total"><span class="pk-total-label">ポックラ</span><span class="pk-total-value">${official.toFixed(2)}</span></div>
            <div class="pk-source">公式 ${escapeHtml(formatPokkuraDate(pk.version.at))} 時点</div>
            <div class="pk-calc">${partsText}</div>
            ${subHtml}
        </div>` : `
        <div class="pk-summary">
            <div class="pk-total"><span class="pk-total-label">推定ポックラ</span><span class="pk-total-value">${pk.total.toFixed(2)}</span></div>
            <div class="pk-parts">${partsText}</div>
            <div class="pk-source${pk.version ? '' : ' pk-source-none'}">${escapeHtml(sourceText)}</div>
            ${subHtml}
        </div>`;
    html += `
        <div class="pk-tabs" role="tablist" aria-label="ポックラの曲">
            <button type="button" role="tab" id="pk-tab-top" aria-controls="pk-panel-top" onclick="setPokkuraTab('top', true)">対象曲<span class="pk-tab-count">${topCount}</span></button>
            <button type="button" role="tab" id="pk-tab-rest" aria-controls="pk-panel-rest" onclick="setPokkuraTab('rest', true)">圏外<span class="pk-tab-count">${restCount}</span></button>
            <button type="button" role="tab" id="pk-tab-up" aria-controls="pk-panel-up" onclick="setPokkuraTab('up', true)">おすすめ</button>
        </div>`;

    const section = (label, sub, color, list) => {
        if (list.length === 0) return '';
        // ポイントの高い順に、表の向き（最初は左上が1位）に合わせて並べる
        const ordered = orderForDirection(list, COLS, getGridDirection('pokkura'));
        let cells = '';
        ordered.forEach(({ song, extra, point, score, isVersion, easySelectable, calcMedal }) => {
            const pointHtml = `<span class="pk-point" title="ポイント ${point.toFixed(2)}">${pkFloor(point / 60, 3).toFixed(3)}</span>`;
            if (extra) {
                // Lv45 以下の新曲：アプリの曲ではないので、バナーなし・変更なし（表示だけ）
                cells += `
                <div class="dg-cell">
                    <span class="dg-medal pk-medal-static${extra.medal ? '' : ' dg-medal-empty'}">${buildGridMedalInner(extra.medal)}</span>
                    <div class="dg-banner-wrap">
                        <div class="dg-banner pk-extra" title="${escapeHtml(extra.title)}（Lv${escapeHtml(extra.level)}）"><span class="pk-extra-title">${escapeHtml(extra.title)}</span><span class="pk-extra-genre">${escapeHtml(extra.genre)}</span></div>
                        <span class="pk-lv">${escapeHtml(extra.level)}</span>
                        <span class="dg-score pk-score">${score}</span>
                        ${pointHtml}
                    </div>
                </div>`;
                return;
            }
            // 歴代イージー・今作黒星の曲は、計算に使っているメダル（イージー／選んだ黒）を出す
            const medalKey = easySelectable ? calcMedal : (clearRecords[song.id] || '');
            const medalTitle = easySelectable ? `ポックラは${calcMedal}として計算（押すと歴代メダルを変更）` : 'メダルを変更';
            const medalClass = medalKey === '' ? ' dg-medal-empty' : '';
            const bannerSrc = safeUrl(song.bannerUrl, true);
            const bannerInner = bannerSrc
                ? `<img src="${escapeHtml(bannerSrc)}" alt="${escapeHtml(song.title)}" loading="lazy">`
                : `<span class="dg-banner-text">${escapeHtml(song.title)}</span>`;
            const safeId = jsStringAttr(song.id);
            const easySelectHtml = easySelectable
                ? `<select class="pk-oldeasy${calcMedal !== 'イージー' ? ' is-black' : ''}" onchange="setPokkuraOldEasyMedal('${safeId}', this.value)" aria-label="${escapeHtml(song.title)}のポックラでのメダル" title="イージーの曲です。旧筐体でつけたイージー（旧筐体EC）なら、黒（星・菱・丸）を選ぶとポックラはそのメダルで計算します">${POKKURA_OLD_EASY_CHOICES.map(m => `<option value="${m}"${m === calcMedal ? ' selected' : ''}>${m}</option>`).join('')}</select>`
                : '';
            // ポックラ反映時のレベルが Lv と違う曲は、印を付けて両方を見せる
            const pkLevel = getPokkuraLevel(song);
            const lvHtml = pkLevel !== song.level
                ? `<span class="pk-lv pk-lv-custom" title="ポックラはLv${escapeHtml(pkLevel)}で計算（今のLvは${escapeHtml(song.level)}）">${escapeHtml(pkLevel)}</span>`
                : `<span class="pk-lv">${escapeHtml(song.level)}</span>`;
            cells += `
                <div class="dg-cell">
                    <button type="button" class="dg-medal${medalClass}" onclick="openMedalModal('${safeId}')" title="${escapeHtml(medalTitle)}">${buildGridMedalInner(medalKey)}${buildUraBadgeHtml(song.id, medalKey)}</button>
                    <div class="dg-banner-wrap">
                        <a class="dg-banner" href="${escapeHtml(getWikiUrl(song))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(song.title)}（Lv${escapeHtml(song.level)}・攻略wikiを開く）">${bannerInner}${buildMemoMarkHtml(song.id)}</a>
                        ${lvHtml}
                        ${easySelectHtml}
                        <button type="button" class="dg-score pk-score${isVersion ? ' pk-score-version' : ''}" onclick="openScoreModal('${safeId}')" title="${isVersion ? `今作のスコア（歴代ベスト ${escapeHtml(scoreRecords[song.id] || '-')}）。押すと歴代ベストを変更` : 'スコアを変更'}">${score}</button>
                        ${pointHtml}
                    </div>
                </div>`;
        });
        return `
            <div class="dg-row">
                <div class="dg-label pk-label" style="background: ${color};"><span class="dg-label-cls">${label}</span><span class="pk-label-sub">${sub}</span></div>
                <div class="dg-cells" style="grid-template-columns: repeat(${COLS}, minmax(0, 1fr));">${cells}</div>
            </div>`;
    };

    // 対象曲と圏外を横に並べ、タブか横スライドで切り替える
    const topHtml = topCount > 0
        ? section('新曲', `上位${POKKURA_NEW_COUNT}`, '#d82f66', pk.topNew) + section('旧曲', `上位${POKKURA_OLD_COUNT}`, '#7b1fa2', pk.topOld)
        : '<div class="dg-empty">対象の曲（新曲 Lv46〜49・旧曲 Lv48〜50）にスコアがありません</div>';
    const restHtml = restCount > 0
        ? section('新曲', '圏外', '#c48a9b', pk.restNew) + section('旧曲', '圏外', '#a58bb3', pk.restOld)
        : '<div class="dg-empty">圏外の曲はありません</div>';
    html += `
        ${buildDirectionBar('pokkura')}
        <div class="pk-slider" id="pk-slider">
            <div class="pk-panel" id="pk-panel-top" role="tabpanel" aria-labelledby="pk-tab-top">${topHtml}</div>
            <div class="pk-panel pk-panel-rest" id="pk-panel-rest" role="tabpanel" aria-labelledby="pk-tab-rest">${restHtml}</div>
            <div class="pk-panel pk-panel-up" id="pk-panel-up" role="tabpanel" aria-labelledby="pk-tab-up">${buildPokkuraRecHtml(pk)}</div>
        </div>
        ${buildPokkuraExplainHtml(pk)}`;
    grid.innerHTML = html;

    const slider = document.getElementById('pk-slider');
    let scrollTimer = null;
    slider.addEventListener('scroll', () => {
        // スライドが止まったら、見えているほうのタブにする
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
            // 描き直したあとの古いスライダーは無視する
            if (!slider.isConnected) return;
            const index = Math.round(slider.scrollLeft / Math.max(1, slider.clientWidth));
            const tab = POKKURA_TABS[Math.min(POKKURA_TABS.length - 1, Math.max(0, index))];
            if (tab !== pokkuraTab) setPokkuraTab(tab, false);
        }, 80);
    }, { passive: true });
    // 画像の読み込みや画面幅でパネルの高さが変わったら合わせ直す
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            if (!slider.isConnected) { ro.disconnect(); return; }
            fitPokkuraSliderHeight();
        });
        slider.querySelectorAll('.pk-panel').forEach(p => ro.observe(p));
    }
    setPokkuraTab(pokkuraTab, false, true);
}

function fitPokkuraSliderHeight() {
    const slider = document.getElementById('pk-slider');
    const panel = document.getElementById(`pk-panel-${pokkuraTab}`);
    if (slider && panel) slider.style.height = panel.offsetHeight + 'px';
}

// タブを切り替える（scroll = true ならそのパネルまでスライドする）
function setPokkuraTab(tab, scroll, instant) {
    if (!POKKURA_TABS.includes(tab)) tab = 'top';
    pokkuraTab = tab;
    const slider = document.getElementById('pk-slider');
    if (!slider) return;
    POKKURA_TABS.forEach(key => {
        const active = key === tab;
        const btn = document.getElementById(`pk-tab-${key}`);
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
        btn.tabIndex = active ? 0 : -1;
        document.getElementById(`pk-panel-${key}`).classList.toggle('pk-panel-active', active);
    });
    // 高さは見えているパネルに合わせる（もう片方の長さで下に空白ができないように）
    fitPokkuraSliderHeight();
    // おすすめはリストなので、向きの矢印は出さない
    const dirBar = document.querySelector('#diff-grid-view .dg-dir');
    if (dirBar) dirBar.style.display = tab === 'up' ? 'none' : '';
    const left = POKKURA_TABS.indexOf(tab) * slider.clientWidth;
    if (instant) slider.scrollLeft = left;
    else if (scroll) slider.scrollTo({ left, behavior: 'smooth' });
}

// 画面幅がPCとスマホの境目をまたいだら、列の数が変わるので描き直す
let gridResizeTimer = null;
window.addEventListener('resize', () => {
    if (viewMode === 'list') return;
    clearTimeout(gridResizeTimer);
    gridResizeTimer = setTimeout(() => {
        if (lastGridNarrow !== null && lastGridNarrow !== isNarrowScreen()) renderTable();
    }, 200);
});
