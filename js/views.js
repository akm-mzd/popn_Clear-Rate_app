// ==========================================
// views.js（table.js から分けたもの）
// 表示レベルボタンの置き場所・表示方法（VIEW_MODES / setViewMode / applyViewMode）・表の向き・起動時の表示・
// 難易度表・フルコン表・「更新」（日ごと・曲ごと）・「最近」・切り替えタブ・BAD表・メダル表・スコア表
// ==========================================
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
const VIEW_MODES = ['list', 'grid', 'fc', 'medal', 'bad', 'score', 'pokkura', 'oldpokkura', 'knock', 'sknock'];

// ---------- 表の向き（強い曲を右に置くか左に置くか。表ごとに、この端末に保存） ----------
//   'right' = 右が強い（強い順に1行ずつ区切って各行を左右反転。右上が最強）
//   'left'  = 左が強い（強い順に左上から並べる）
const GRID_DIR_DEFAULTS = { knock: 'right', sknock: 'right', grid: 'right', fc: 'right', medal: 'right', bad: 'right', score: 'left', pokkura: 'left' };
const GRID_DIR_WORDS = { knock: ['弱', '強'], sknock: ['弱', '強'], grid: ['弱', '強'], fc: ['弱', '強'], medal: ['弱', '強'], bad: ['弱', '強'], score: ['低', '高'], pokkura: ['低', '高'] };

function getGridDirection(mode) {
    const saved = storageGet('popn_dir_' + mode);
    return (saved === 'left' || saved === 'right') ? saved : (GRID_DIR_DEFAULTS[mode] || 'right');
}

// 上下の向き（'top' = 上が強い / 'bottom' = 下が強い。最初はどれも上が強い）。ポックラは上下を変えない
const GRID_VDIR_MODES = ['knock', 'sknock', 'grid', 'fc', 'medal', 'bad', 'score'];

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
const SCORE_VIEW_MODES = ['score', 'pokkura', 'oldpokkura'];
function updateViewModeButtons() {
    const scoreOk = hasAnyScore();
    document.querySelectorAll('#view-mode-switch button').forEach(btn => {
        // フルコン表・BAD表・旧ポックラ・S乱ノックは、組のボタン（難易度表・メダル表・ポックラ・ノック表）を選ばれた見た目にする
        btn.classList.toggle('active', btn.dataset.mode === viewMode || VIEW_TAP_ALT[btn.dataset.mode] === viewMode);
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
    // ポックラ画面では、絞り込みとクリア率の表示を隠す（CSS の body.view-pokkura）
    document.body.classList.toggle('view-pokkura', viewMode === 'pokkura' || viewMode === 'oldpokkura');
    // ノック表も表の全部を出すので、絞り込み・クリア率の表示を隠す
    document.body.classList.toggle('view-knock', isKnockView());
    capture.style.display = isGrid ? 'none' : '';
    grid.style.display = isGrid ? '' : 'none';
    renderViewSubTabs();
    const specialGrid = viewMode === 'grid' && !(document.getElementById('search-input').value.trim()) && isSpecialViewLevel(currentViewLevel);
    if (specialGrid && currentViewLevel === 'UPDATED') renderUpdatedGrid(displaySongs);
    else if (specialGrid && currentViewLevel === 'RECENT') renderRecentGrid(displaySongs);
    else if (viewMode === 'grid') renderDiffGrid(displaySongs);
    else if (viewMode === 'fc') renderFcGrid(displaySongs);
    else if (viewMode === 'medal') renderMedalGrid(displaySongs);
    else if (viewMode === 'bad') renderBadGrid(displaySongs);
    else if (viewMode === 'score') renderScoreGrid(displaySongs);
    else if (viewMode === 'pokkura') renderPokkuraGrid();
    else if (viewMode === 'oldpokkura') renderOldPokkuraGrid();
    else if (isKnockView()) renderKnockGrid(viewMode === 'sknock' ? 'sran' : 'ran');
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
// 旧筐体のメダル：今のメダルより良いときだけ、メダル枠の右上に小さく重ねる（表示だけ。統計などには数えない）
// 表に出す旧筐体のメダル（今のメダルより良いときだけ。それ以外は ''）。表示と絞り込みで同じものを使う
function getShownOldMedal(songId, shownMedal = clearRecords[songId] || '') {
    if (typeof getOldMedalRecords !== 'function') return '';
    const old = getOldMedalRecords()[songId];
    const m = old ? MEDAL_TYPES[old] : null;
    const cur = MEDAL_TYPES[shownMedal] || MEDAL_TYPES[''];
    return m && m.rank > cur.rank ? old : '';
}

// 表に出す裏メダル（今のメダルがイージーで、裏メダルがあるときだけ。それ以外は ''）
function getShownUraMedal(songId, shownMedal = clearRecords[songId] || '') {
    if (shownMedal !== 'イージー' || typeof getUraMedalInfo !== 'function') return '';
    return getUraMedalInfo(songId).ura || '';
}

function buildOldMedalBadgeHtml(songId, shownMedal) {
    const old = getShownOldMedal(songId, shownMedal);
    const m = old ? MEDAL_TYPES[old] : null;
    if (!m || !m.imgUrl) return '';
    const title = `旧筐体：${m.label}`;
    return `<img class="dg-oldm" src="${escapeHtml(m.imgUrl)}" alt="${escapeHtml(title)}" title="${escapeHtml(title)}" loading="lazy">`;
}

function buildUraBadgeHtml(songId, shownMedal) {
    if (!getShownUraMedal(songId, shownMedal)) return '';
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
        const labelHtml = (g.cls === '未定' || g.cls === SUPER_EX)
            ? `<span class="dg-label-cls">${escapeHtml(g.cls)}</span>`
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

// ---------- フルコン難易度表（難易度表の切り替えタブ。Lv46〜48 だけ） ----------
// 曲データの fc = { v: 値（1.1＝別格 〜 -1.0）, o: 同じ値の中の順番（小さいほど強い） }。管理者が画像から取り込む（fc-import.js）
const FC_LEVELS = ['46', '47', '48'];
const FC_VALUES = [1.1, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0, -0.1, -0.2, -0.3, -0.4, -0.5, -0.6, -0.7, -0.8, -0.9, -1.0];

function getSongFc(song) {
    const fc = song && song.fc;
    if (!fc || typeof fc.v !== 'number' || !FC_VALUES.some(v => Math.abs(v - fc.v) < 0.001)) return null;
    return { v: Math.round(fc.v * 10) / 10, o: typeof fc.o === 'number' ? fc.o : 0 };
}

function formatFcValue(v) {
    return (v > 0 ? '' : v < 0 ? '-' : '') + Math.abs(v).toFixed(1);
}

// 行の見出し：別格は黒、難しいほど濃い赤、0 の近くは白、易しいほど濃い青
function getFcLabelColor(v) {
    if (v > 1.05) return '#1a1a1a';
    const mix = (a, b, t) => '#' + [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t).toString(16).padStart(2, '0')).join('');
    if (v >= 0.15) return mix([248, 200, 204], [150, 0, 30], (v - 0.2) / 0.8);
    if (v <= -0.15) return mix([200, 240, 248], [20, 70, 130], (-v - 0.2) / 0.8);
    return '#f5f5f5';
}

function renderFcGrid(targetSongs) {
    const grid = document.getElementById('diff-grid-view');
    const showScore = document.getElementById('show-score-col').checked;
    const narrow = isNarrowScreen();
    const COLS = narrow ? 2 : 5;
    lastGridNarrow = narrow;
    if (!FC_LEVELS.includes(String(currentViewLevel)) || isSearching()) {
        grid.innerHTML = '<div class="dg-empty">フルコン難易度表は Lv46〜48 だけです。上のレベルで 46・47・48 を選んでください</div>';
        return;
    }
    if (targetSongs.length === 0) {
        grid.innerHTML = '<div class="dg-empty">表示する曲がありません</div>';
        return;
    }
    const rows = FC_VALUES.map(v => ({ v, songs: [] }));
    const none = { v: null, songs: [] };
    targetSongs.forEach(song => {
        const fc = getSongFc(song);
        const row = fc ? rows.find(r => Math.abs(r.v - fc.v) < 0.001) : null;
        (row || none).songs.push(song);
    });
    const orderOf = song => (getSongFc(song) || { o: 0 }).o;
    let html = '';
    if (none.songs.length === targetSongs.length) {
        html += '<div class="fc-note">この レベルのフルコン難易度はまだありません。管理者の「データの追加・管理」→「曲の情報をまとめて設定する」→「フルコン難易度表の画像を取り込む」で入れてください。</div>';
    }
    html += buildDirectionBar('fc');
    const vertical = getGridVertical('fc');
    orderRowsForVertical([...rows, none], vertical).forEach(row => {
        if (row.songs.length === 0) return;
        if (row === none) row.songs.sort((a, b) => (getDiffSortValue(b) - getDiffSortValue(a)) || (a.originalOrder - b.originalOrder));
        else row.songs.sort((a, b) => (orderOf(a) - orderOf(b)) || (a.originalOrder - b.originalOrder));
        const ordered = orderForDirection(row.songs, COLS, getGridDirection('fc'), vertical);
        let cells = '';
        ordered.forEach(song => { cells += buildDiffGridCellHtml(song, showScore); });
        let labelHtml, color = '#9e9e9e', light = '';
        if (row === none) {
            labelHtml = '<span class="dg-label-cls">未定</span>';
        } else {
            const word = row.v > 1.05 ? '別格' : Math.abs(row.v - 1) < 0.001 ? '難' : Math.abs(row.v) < 0.001 ? '中' : Math.abs(row.v + 1) < 0.001 ? '易' : '';
            labelHtml = `${word ? `<span class="dg-label-cls">${word}</span>` : ''}<span class="dg-label-idx">${formatFcValue(row.v)}</span>`;
            color = getFcLabelColor(row.v);
            if (Math.abs(row.v) < 0.35) light = ' fc-label-dark';
            else if (Math.abs(row.v) < 0.65) light = ' dg-label-light';
        }
        html += `
            <div class="dg-row">
                <div class="dg-label${light}" style="background: ${color};">${labelHtml}<span class="sg-count">${row.songs.length}曲</span></div>
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
    const banner = `<a class="dg-banner" data-sid="${escapeHtml(song.id)}" href="${escapeHtml(getWikiUrl(song))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(song.title)}（攻略wikiを開く）">${bannerInner}${buildMemoMarkHtml(song.id)}</a>`;
    return `
                <div class="dg-cell">
                    <button type="button" class="dg-medal${medalClass}" onclick="openMedalModal('${jsStringAttr(song.id)}')" title="メダルを変更">${buildGridMedalInner(medalKey)}${rankHtml}${buildUraBadgeHtml(song.id, medalKey)}${buildOldMedalBadgeHtml(song.id, medalKey)}</button>
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

// 「更新」の見方の切り替え（日ごと｜曲ごと）
function buildUpdatedModeTabs() {
    const mode = getUpdatedMode();
    const tab = (m, label) => `<button type="button" class="vst-tab${mode === m ? ' on' : ''}" onclick="setUpdatedMode('${m}')" aria-pressed="${mode === m}">${label}</button>`;
    return `<div class="view-sub-tabs sv-mode-tabs" role="group" aria-label="更新の見方">${tab('day', '日ごと')}${tab('song', '曲ごと')}</div>`;
}

// 1件（または1日分のまとめ）の変更の中身：メダル → メダル、スコアの差、BAD
function buildSvChangeParts(it) {
    const parts = [];
    if ('nm' in it && it.om !== it.nm) parts.push(`<span class="sv-change">${buildSvMedalIcon(it.om || '')}<span class="sv-arrow">→</span>${buildSvMedalIcon(it.nm || '')}</span>`);
    if ('ns' in it && it.os !== it.ns) {
        if (it.ns === null) parts.push('<span class="sv-score">スコア削除</span>');
        else if (it.os === null || it.os === undefined) parts.push(`<span class="sv-score">→${Number(it.ns).toLocaleString('ja-JP')}</span>`);
        else {
            const diff = it.ns - it.os;
            parts.push(`<span class="sv-score ${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '+' : '−'}${Math.abs(diff).toLocaleString('ja-JP')}</span>`);
        }
    }
    if ('nb' in it && it.ob !== it.nb) parts.push(`<span class="sv-score sv-bad">BAD ${it.ob === null || it.ob === undefined ? '' : `${it.ob}→`}${it.nb === null ? '削除' : it.nb}</span>`);
    return parts;
}

// ---------- 「更新」の曲ごと：選んだレベルの曲を、最後に更新した日の古い順（新しい順）に。更新したことのない曲は「記録なし」 ----------
function renderUpdatedSongList(targetSongs) {
    const grid = document.getElementById('diff-grid-view');
    const showScore = document.getElementById('show-score-col').checked;
    lastGridNarrow = isNarrowScreen();
    const level = getUpdatedSongLevel();
    const order = getUpdatedOrder();
    const levels = [...new Set(songs.map(s => String(s.level)))].sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
    const chip = (on, onclick, label) => `<button type="button" class="sv-chip${on ? ' on' : ''}" onclick="${onclick}" aria-pressed="${on}">${label}</button>`;
    const bar = `
        <div class="sv-bar sv-song-bar">
            <span class="sv-chips">${levels.map(lv => chip(lv === level, `setUpdatedLevel('${jsStringAttr(lv)}')`, escapeHtml(lv))).join('')}${chip(level === 'ALL', "setUpdatedLevel('ALL')", 'すべて')}</span>
            <span class="sv-chips">${chip(order === 'old', "setUpdatedOrder('old')", '古い順')}${chip(order === 'new', "setUpdatedOrder('new')", '新しい順')}</span>
        </div>`;
    const head = buildUpdatedModeTabs() + bar;
    if (targetSongs.length === 0) {
        grid.innerHTML = head + '<div class="dg-empty">表示する曲がありません</div>';
        return;
    }
    // 曲ごとの一番新しい更新履歴
    const shown = new Set(targetSongs.map(s => s.id));
    const last = new Map();
    Object.values(getHistoryRecords()).forEach(e => {
        if (!e || typeof e.t !== 'number' || !shown.has(e.id)) return;
        const cur = last.get(e.id);
        if (!cur || e.t > cur.t) last.set(e.id, e);
    });
    const dir = order === 'new' ? -1 : 1;
    const list = targetSongs.slice().sort((a, b) => {
        const ta = last.has(a.id) ? last.get(a.id).t : -Infinity;
        const tb = last.has(b.id) ? last.get(b.id).t : -Infinity;
        if (ta !== tb) return ta < tb ? -dir : dir;
        return (getDiffSortValue(b) - getDiffSortValue(a)) || (a.originalOrder - b.originalOrder);
    });
    const today0 = new Date(); today0.setHours(0, 0, 0, 0);
    const rows = [];
    list.forEach(song => {
        const e = last.get(song.id);
        const key = e ? (() => { const d = new Date(e.t); return `${d.getFullYear()}/${d.getMonth() + 1}`; })() : '記録なし';
        if (rows.length === 0 || rows[rows.length - 1].key !== key) rows.push({ key, cells: '' });
        let info;
        if (e) {
            const d = new Date(e.t);
            const day0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
            const ago = Math.round((today0.getTime() - day0) / 86400000);
            const parts = buildSvChangeParts(e);
            info = `<span class="sv-last">最後の更新 <span class="sv-last-date">${d.getFullYear() % 100}/${d.getMonth() + 1}/${d.getDate()}（${ago === 0 ? '今日' : `${ago}日前`}）</span></span>${parts.join('')}`;
        } else {
            info = '<span class="sv-last">更新の記録なし</span>';
        }
        rows[rows.length - 1].cells += buildDiffGridCellHtml(song, showScore, `<div class="sv-info">${info}</div>${buildSvSongInfoHtml(song)}`);
    });
    grid.innerHTML = head + rows.map(r => {
        const [y, m] = r.key.split('/');
        const label = m ? `<span class="dg-label-cls">${m}月</span><span class="dg-label-idx">${y}</span>` : `<span class="dg-label-cls">記録なし</span>`;
        return `
            <div class="dg-row">
                <div class="dg-label sv-label">${label}</div>
                <div class="dg-cells sv-list">${r.cells}</div>
            </div>`;
    }).join('');
}

function renderUpdatedGrid(targetSongs) {
    if (getUpdatedMode() === 'song') { renderUpdatedSongList(targetSongs); return; }
    const grid = document.getElementById('diff-grid-view');
    const showScore = document.getElementById('show-score-col').checked;
    lastGridNarrow = isNarrowScreen();
    const mi = getUpdatedMonthIndex();
    const monthLabel = `${Math.floor(mi / 12)}年${mi % 12 + 1}月`;
    const rangeBar = buildUpdatedModeTabs() + `
        <div class="sv-bar sv-month-bar">
            <button type="button" class="sv-month-btn" onclick="moveUpdatedMonth(-1)" aria-label="前の月"${mi <= getOldestUpdatedMonthIndex() ? ' disabled' : ''}>‹</button>
            <select class="sv-month-select" onchange="setUpdatedMonth(this.value)" aria-label="月を選ぶ">${buildUpdatedMonthOptions(mi)}</select>
            <button type="button" class="sv-month-btn" onclick="moveUpdatedMonth(1)" aria-label="次の月"${mi >= monthIndexOf(Date.now()) ? ' disabled' : ''}>›</button>
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
        if ('nb' in e) { if (!('nb' in it)) it.nb = e.nb; it.ob = e.ob; }
    });

    if (days.length === 0) {
        grid.innerHTML = rangeBar + `<div class="dg-empty">${monthLabel}の更新はありません（‹ で前の月も見られます）</div>`;
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
            const parts = buildSvChangeParts(it);
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
// ---------- 表示方法のボタンと、表の上の切り替えタブ ----------
//   難易度表・メダル表・ノック表・ポックラのボタンは、組になった表（フルコン表・BAD表・S乱ノック・旧ポックラ）を持つ。
//   ボタンを押すと組の表側を出し（組のどちらかを出しているときは何もしない）、表のすぐ上の切り替えタブ（#view-sub-tabs）でもう片方に切り替える
const VIEW_TAP_ALT = { grid: 'fc', medal: 'bad', pokkura: 'oldpokkura', knock: 'sknock' };
const VIEW_SUB_TABS = {
    grid: [['grid', '難易度表'], ['fc', 'フルコン表']],
    medal: [['medal', 'メダル表'], ['bad', 'BAD表']],
    knock: [['knock', '乱ノック'], ['sknock', 'S乱ノック']],
    pokkura: [['pokkura', '新ポックラ'], ['oldpokkura', '旧ポックラ']]
};

function onViewModeTap(mode) {
    if (viewMode !== mode && viewMode !== VIEW_TAP_ALT[mode]) setViewMode(mode);
}

// 組の表を出しているときだけ、表の上に切り替えタブ（「更新」「最近」の縦並びでは出さない）
function renderViewSubTabs() {
    const box = document.getElementById('view-sub-tabs');
    if (!box) return;
    const base = Object.keys(VIEW_TAP_ALT).find(k => k === viewMode || VIEW_TAP_ALT[k] === viewMode);
    const special = viewMode === 'grid' && !(document.getElementById('search-input').value.trim()) && isSpecialViewLevel(currentViewLevel);
    if (!base || special) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = VIEW_SUB_TABS[base].map(([mode, label]) =>
        `<button type="button" class="vst-tab${mode === viewMode ? ' on' : ''}" onclick="setViewMode('${mode}')" aria-pressed="${mode === viewMode}">${label}</button>`).join('');
}

// ---------- BAD表（メダル表の切り替えタブ）：最小BAD の少ない順の行 ----------
// 行の分け方（上から強い順）。max まで（null は上限なし）
const BAD_GRID_ROWS = [
    { label: '0', max: 0, color: '#1b5e20' }, { label: '1〜5', max: 5, color: '#2e7d32' }, { label: '6〜9', max: 9, color: '#43a047' },
    { label: '10〜14', max: 14, color: '#7cb342' }, { label: '15〜20', max: 20, color: '#9e9d24' }, { label: '21〜30', max: 30, color: '#f9a825' },
    { label: '31〜40', max: 40, color: '#ffb300' }, { label: '41〜50', max: 50, color: '#fb8c00' }, { label: '51〜80', max: 80, color: '#f4511e' },
    { label: '81〜100', max: 100, color: '#e53935' }, { label: '101〜', max: null, color: '#b71c1c' }
];

function renderBadGrid(targetSongs) {
    const grid = document.getElementById('diff-grid-view');
    const showScore = document.getElementById('show-score-col').checked;
    const narrow = isNarrowScreen();
    const COLS = narrow ? 2 : 5;
    lastGridNarrow = narrow;
    if (targetSongs.length === 0) {
        grid.innerHTML = '<div class="dg-empty">表示する曲がありません</div>';
        return;
    }
    const rows = BAD_GRID_ROWS.map(r => ({ ...r, songs: [] }));
    const none = { label: '記録なし', color: '#9e9e9e', songs: [] };
    const badOf = new Map();
    targetSongs.forEach(song => {
        const n = getSongBad(song.id);
        badOf.set(song.id, n);
        if (n === null) { none.songs.push(song); return; }
        rows.find(r => r.max === null || n <= r.max).songs.push(song);
    });
    const stronger = (a, b) => (badOf.get(a.id) ?? 1e9) - (badOf.get(b.id) ?? 1e9)
        || (getDiffSortValue(b) - getDiffSortValue(a))
        || ((DIFF_CLASS_RANK[b.diffClass] || 0) - (DIFF_CLASS_RANK[a.diffClass] || 0))
        || (a.originalOrder - b.originalOrder);

    let html = buildDirectionBar('bad');
    const vertical = getGridVertical('bad');
    orderRowsForVertical([...rows, none], vertical).forEach(row => {
        if (row.songs.length === 0) return;
        row.songs.sort(stronger);
        const ordered = orderForDirection(row.songs, COLS, getGridDirection('bad'), vertical);
        let cells = '';
        ordered.forEach(song => {
            const k = MEDAL_TYPES[clearRecords[song.id] || ''] ? (clearRecords[song.id] || '') : '';
            const rank = showScore ? getSongScoreRank(song) : '';
            const rankHtml = rank ? `<img class="dg-rank" src="${escapeHtml(RANK_IMAGES[rank])}" alt="${escapeHtml(rank)}" loading="lazy">` : '';
            const n = badOf.get(song.id);
            const badHtml = n === null ? '' : `<span class="bg-bad">${n}</span>`;
            const bannerSrc = safeUrl(song.bannerUrl, true);
            const bannerInner = bannerSrc
                ? `<img src="${escapeHtml(bannerSrc)}" alt="${escapeHtml(song.title)}" loading="lazy">`
                : `<span class="dg-banner-text">${escapeHtml(song.title)}</span>`;
            cells += `
                <div class="dg-cell">
                    <button type="button" class="dg-medal${k === '' ? ' dg-medal-empty' : ''}" onclick="openMedalModal('${jsStringAttr(song.id)}')" title="メダル・BAD を変更">${buildGridMedalInner(k)}${rankHtml}${buildUraBadgeHtml(song.id, k)}${buildOldMedalBadgeHtml(song.id, k)}${badHtml}</button>
                    <a class="dg-banner" data-sid="${escapeHtml(song.id)}" href="${escapeHtml(getWikiUrl(song))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(song.title)}（Lv${escapeHtml(song.level)}・攻略wikiを開く）">${bannerInner}${buildMemoMarkHtml(song.id)}</a>
                </div>`;
        });
        html += `
            <div class="dg-row">
                <div class="dg-label mg-label" style="background: ${row.color};" title="BAD ${escapeHtml(row.label)}"><span class="dg-label-cls bg-label">${row === none ? '記録なし' : `BAD<br>${escapeHtml(row.label)}`}</span><span class="sg-count">${row.songs.length}曲</span></div>
                <div class="dg-cells" style="grid-template-columns: repeat(${COLS}, minmax(0, 1fr));">${cells}</div>
            </div>`;
    });
    grid.innerHTML = html;
}

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
                    <button type="button" class="dg-medal${k === '' ? ' dg-medal-empty' : ''}" onclick="openMedalModal('${jsStringAttr(song.id)}')" title="メダルを変更">${buildGridMedalInner(k)}${rankHtml}${buildUraBadgeHtml(song.id, k)}${buildOldMedalBadgeHtml(song.id, k)}</button>
                    <a class="dg-banner" data-sid="${escapeHtml(song.id)}" href="${escapeHtml(getWikiUrl(song))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(song.title)}（Lv${escapeHtml(song.level)}${escapeHtml(diffText)}・攻略wikiを開く）">${bannerInner}${buildMemoMarkHtml(song.id)}</a>
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
                    <button type="button" class="dg-medal${medalClass}" onclick="openMedalModal('${safeId}')" title="メダルを変更">${buildGridMedalInner(medalKey)}${buildUraBadgeHtml(song.id, medalKey)}${buildOldMedalBadgeHtml(song.id, medalKey)}</button>
                    <div class="dg-banner-wrap">
                        <a class="dg-banner" data-sid="${escapeHtml(song.id)}" href="${escapeHtml(getWikiUrl(song))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(song.title)}（攻略wikiを開く）">${bannerInner}${buildMemoMarkHtml(song.id)}</a>
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
