// ==========================================
// table.js
// 楽曲一覧の表示。
// 絞り込み・並び替え・統計の計算・表の描画・表示レベルボタン。
// ==========================================

// ==========================================
// ★ 絞り込み（チェックリスト）
//   何もチェックしていない項目は「すべて」。
//   同じ項目の中は「どれか」（OR）、違う項目どうしは「すべて」（AND）で絞り込む。
// ==========================================
const FILTER_IDS = ['filter-medal', 'filter-version', 'filter-diff', 'filter-affinity', 'filter-rank'];

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
        cb.checked = checked.includes(value);
        cb.onchange = () => renderTable();
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(' ' + label));
        box.appendChild(lbl);
    });
}

function countActiveFilters() {
    return FILTER_IDS.reduce((n, id) => n + getFilterValues(id).length, 0);
}

// 「さらに条件で絞り込む」と、折りたたみ（バージョン・相性）の見出しに、選んでいる数を出す
function updateFilterSummaryCount() {
    const setCount = (elId, n) => {
        const el = document.getElementById(elId);
        if (el) el.textContent = n > 0 ? `（${n}）` : '';
    };
    setCount('filter-summary-count', countActiveFilters());
    setCount('filter-version-count', getFilterValues('filter-version').length);
    setCount('filter-affinity-count', getFilterValues('filter-affinity').length);
    setCount('filter-rank-count', getFilterValues('filter-rank').length);
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

    updateDynamicFilters();
}

function updateDynamicFilters() {
    const versions = [...new Set(songs.map(s => s.version))].filter(v => v)
        .sort((a, b) => getVersionSortValue(a) - getVersionSortValue(b));
    buildFilterChecks('filter-version', versions.map(v => ({ value: v, label: v })));

    updateStartupSettingsUI();

    const viewLevelContainer = document.getElementById('view-level-buttons');
    if (viewLevelContainer) {
        viewLevelContainer.innerHTML = '';
        
        // 「すべて」は一番右端に配置する
        const allBtn = document.createElement('button');
        allBtn.className = `level-btn level-btn-all ${currentViewLevel === 'ALL' ? 'active' : ''}`;
        allBtn.innerText = 'すべて';
        allBtn.onclick = () => changeViewLevel('ALL');
        
        const levels = getSortedLevels();
        
        // データにないレベルなら「すべて」にする（曲データが届く前の空の状態では戻さない）
        if (levels.length > 0 && currentViewLevel !== 'ALL' && !levels.includes(currentViewLevel)) {
            currentViewLevel = 'ALL';
            allBtn.classList.add('active');
        }
        
        levels.forEach(l => {
            const btn = document.createElement('button');
            btn.className = `level-btn ${isNaN(parseInt(l, 10)) ? 'level-btn-text' : ''} ${currentViewLevel === l ? 'active' : ''}`;
            btn.innerText = l;
            btn.title = isNaN(parseInt(l, 10)) ? l : `Lv${l}`;
            btn.onclick = () => changeViewLevel(l);
            viewLevelContainer.appendChild(btn);
        });
        viewLevelContainer.appendChild(allBtn);
    }
}

function resetFilters() {
    FILTER_IDS.forEach(id => setFilterValues(id, []));
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

function handleSearch() { renderTable(); }
function clearSearch() { document.getElementById('search-input').value = ''; renderTable(); }


function changeViewLevel(level) {
    toggleMenu(false); // レベルを選んだらメニューを閉じる
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

function renderTable() {
    const searchInput = document.getElementById('search-input');
    const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : "";

    // 絞り込み条件（空配列 = すべて）
    const filterMedals = getFilterValues('filter-medal');
    const filterVersions = getFilterValues('filter-version');
    const filterDiffs = getFilterValues('filter-diff');
    const filterAffinities = getFilterValues('filter-affinity');
    const filterRanks = getFilterValues('filter-rank');
    const isFiltered = filterMedals.length + filterVersions.length + filterDiffs.length + filterAffinities.length + filterRanks.length > 0;
    updateFilterSummaryCount();

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
    let baseSongs = songs.filter(s => {
        if (!searchQuery && currentViewLevel !== 'ALL' && s.level !== currentViewLevel) return false;
        if (searchQuery && !(s.genre.toLowerCase().includes(searchQuery) || s.title.toLowerCase().includes(searchQuery))) return false;
        return true;
    });

    // 2. 実際にテーブルに表示する楽曲（すべての絞り込みを適用）
    let displaySongs = baseSongs.filter(s => {
        if (filterMedals.length > 0) {
            const medalKey = clearRecords[s.id] || '';
            const medalValue = medalKey === '' ? 'unplayed' : medalKey;
            if (!filterMedals.includes(medalValue)) return false;
        }
        if (filterVersions.length > 0 && !filterVersions.includes(s.version)) return false;

        if (filterDiffs.length > 0) {
            let dClass = s.diffClass || '未分類';
            if (dClass === '中') {
                dClass = (s.diffIndex !== null && s.diffIndex < 0) ? '中(-)' : '中(+)';
            }
            if (!filterDiffs.includes(dClass)) return false;
        }

        if (filterAffinities.length > 0) {
            const memo = memoRecords[s.id] || {};
            const aff = memo.affinity || '未設定';
            if (!filterAffinities.includes(aff)) return false;
        }

        if (filterRanks.length > 0 && !filterRanks.includes(getSongScoreRank(s) || SCORE_RANK_NONE)) return false;
        return true;
    });
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

    let kuroHishiClearCount = 0;
    let kuroBoshiClearCount = 0;
    let easyClearCount = 0; 
    let normalClearCount = 0; 
    let rateTotal = 0; 
    
    let medalCounts = {};
    Object.keys(MEDAL_TYPES).forEach(k => {
        medalCounts[k] = 0;
    });

    // スコア内訳（ランクごとの曲数・登録したスコアの合計）
    const rankCounts = {};
    SCORE_RANK_KEYS.forEach(k => { rankCounts[k] = 0; });
    rankCounts[SCORE_RANK_NONE] = 0;
    let scoreSum = 0, scoreCount = 0;

    let diffStats = {
        '危険': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '別格': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '詐称': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '強': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '中(+)': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '中(-)': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '弱': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '逆詐称': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '入門': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '未分類': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 }
    };

    const isMobile = isNarrowScreen();

    // ★ 絞り込み中は絞り込んだ曲だけで、そうでなければ表示レベル・検索の全曲で統計を出す
    const statsSongs = isFiltered ? displaySongs : baseSongs;
    statsSongs.forEach(song => {
        const medalKey = clearRecords[song.id] || '';
        const medalInfo = MEDAL_TYPES[medalKey];
        
        medalCounts[medalKey]++;
        
        let dClass = song.diffClass || '未分類';
        if (dClass === '中') {
            if (song.diffIndex !== null && song.diffIndex < 0) { dClass = '中(-)'; } else { dClass = '中(+)'; }
        }
        
        if (!diffStats[dClass]) dClass = '未分類';
        
        if (medalInfo.excludeFromRate && !showUnreleased) {
            // 除外
        } else {
            rateTotal++;
            diffStats[dClass].total++;
            
            if (medalInfo.isKuroHishiClear) {
                kuroHishiClearCount++;
                diffStats[dClass].kuroHishi++;
            }
            if (medalInfo.isKuroBoshiClear) {
                kuroBoshiClearCount++;
                diffStats[dClass].kuroBoshi++;
            }
            if (medalInfo.isEasyClear) {
                easyClearCount++;
                diffStats[dClass].easy++;
            }
            if (medalInfo.isNormalClear) {
                normalClearCount++;
                diffStats[dClass].normal++;
            }

            const rank = getSongScoreRank(song);
            rankCounts[rank || SCORE_RANK_NONE]++;
            if (rank) { scoreSum += parseInt(scoreRecords[song.id], 10); scoreCount++; }
        }
    });

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

        const isValidMedalUrl = medalInfo.imgUrl.startsWith('http') || medalInfo.imgUrl.startsWith('data:');
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

        const memo = memoRecords[song.id] || {};
        const hasMemo = memo.comment || memo.sudden || memo.affinity;
        let tooltipLines = [];
        if (memo.affinity) tooltipLines.push(`相性: ${memo.affinity}`);
        if (memo.sudden) tooltipLines.push(`SUDDEN+: ${memo.sudden}`);
        if (memo.comment) tooltipLines.push(`コメント:\n${memo.comment}`);
        const memoTooltip = tooltipLines.length > 0 ? tooltipLines.join('\n') : 'メモを追加・編集';

        let affinityBadge = '';
        if (memo.affinity) {
            const affinity = String(memo.affinity);
            const badgeClass = ['得意', '苦手', '噛み合い待ち', '敵', '💩'].includes(affinity) ? `memo-badge-${affinity}` : '';
            affinityBadge = `<span class="${badgeClass}" style="font-size: 0.8em; margin-left: 2px;">[${escapeHtml(affinity.substring(0, 2))}]</span>`;
        }

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

    let levelLabel = currentViewLevel === 'ALL' ? '全体' : `Lv${currentViewLevel}`;
    if (searchQuery) levelLabel = `検索結果 ("${searchQuery}")`;
    if (isFiltered) {
        levelLabel += ' (絞り込み中)';
    }
    if (typeof updateNewUiChrome === 'function') {
        updateNewUiChrome({ levelLabel, cleared: normalClearCount, total: rateTotal, shown: displaySongs.length });
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
                const isValidMedalUrl = m.imgUrl.startsWith('http') || m.imgUrl.startsWith('data:');
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

// 今見ている表の向きだけを入れ替える（表示レベル・方法の枠のボタン）
function toggleGridDirection() {
    if (!GRID_DIR_DEFAULTS[viewMode]) return;
    storageSet('popn_dir_' + viewMode, getGridDirection(viewMode) === 'right' ? 'left' : 'right');
    renderTable();
}

// 強い順の配列を、向きに合わせて並べ替える
function orderForDirection(list, cols, dir) {
    if (dir !== 'right') return list.slice();
    const ordered = [];
    for (let i = 0; i < list.length; i += cols) ordered.push(...list.slice(i, i + cols).reverse());
    return ordered;
}

// 表の上に出す向きの矢印（矢印の先が強い・高いほう）
function buildDirectionBar(mode) {
    const [weak, strong] = GRID_DIR_WORDS[mode] || ['弱', '強'];
    const right = getGridDirection(mode) === 'right';
    const weakHtml = `<span class="dg-dir-word">${weak}</span>`;
    const strongHtml = `<span class="dg-dir-word dg-dir-strong">${strong}</span>`;
    return `<div class="dg-dir" title="「表示レベル・方法」の「左右入れ替え」で向きを変えられます">
        ${right ? weakHtml : strongHtml}<span class="dg-dir-arrow ${right ? 'dg-dir-to-right' : 'dg-dir-to-left'}" aria-hidden="true"></span>${right ? strongHtml : weakHtml}
        <span class="sr-only">${right ? `右ほど${strong}い` : `左ほど${strong}い`}</span>
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
    const dirBtn = document.getElementById('grid-dir-btn');
    if (dirBtn) dirBtn.style.display = GRID_DIR_DEFAULTS[viewMode] ? '' : 'none';
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
    if (viewMode === 'grid') renderDiffGrid(displaySongs);
    else if (viewMode === 'medal') renderMedalGrid(displaySongs);
    else if (viewMode === 'score') renderScoreGrid(displaySongs);
    else if (viewMode === 'pokkura') renderPokkuraGrid();
    else grid.innerHTML = '';
}

// メダル枠の中身（メダル画像 / 未解禁は鍵 / 未プレイは空）
function buildGridMedalInner(medalKey) {
    const m = MEDAL_TYPES[medalKey];
    if (medalKey === '未解禁') return '<span class="dg-lock">🔒</span>';
    if (m && m.imgUrl && (m.imgUrl.startsWith('http') || m.imgUrl.startsWith('data:'))) {
        return `<img src="${escapeHtml(m.imgUrl)}" alt="${escapeHtml(m.label)}" loading="lazy">`;
    }
    return '';
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
    buildDiffTableGroups(targetSongs).forEach(g => {
        const labelHtml = g.cls === '未定'
            ? '<span class="dg-label-cls">未定</span>'
            : `<span class="dg-label-cls">${escapeHtml(g.cls)}</span><span class="dg-label-idx">${escapeHtml(g.label)}</span>`;
        const lightLabel = (g.cls === '弱' || (g.cls === '中' && g.label.startsWith('-'))) ? ' dg-label-light' : '';

        // 強い順の曲を、表の向き（最初は右が強い）に合わせて並べる
        const ordered = orderForDirection(g.songs, COLS, getGridDirection('grid'));

        let cells = '';
        ordered.forEach(song => {
            const medalKey = clearRecords[song.id] || '';
            const medalClass = medalKey === '' ? ' dg-medal-empty' : '';
            const rank = showScore ? getSongScoreRank(song) : '';
            const rankHtml = rank ? `<img class="dg-rank" src="${escapeHtml(RANK_IMAGES[rank])}" alt="${escapeHtml(rank)}" loading="lazy">` : '';
            const bannerSrc = safeUrl(song.bannerUrl, true);
            const bannerInner = bannerSrc
                ? `<img src="${escapeHtml(bannerSrc)}" alt="${escapeHtml(song.title)}" loading="lazy">`
                : `<span class="dg-banner-text">${escapeHtml(song.title)}</span>`;
            cells += `
                <div class="dg-cell">
                    <button type="button" class="dg-medal${medalClass}" onclick="openMedalModal('${jsStringAttr(song.id)}')" title="メダルを変更">${buildGridMedalInner(medalKey)}${rankHtml}</button>
                    <a class="dg-banner" href="${escapeHtml(getWikiUrl(song))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(song.title)}（攻略wikiを開く）">${bannerInner}</a>
                </div>`;
        });

        html += `
            <div class="dg-row">
                <div class="dg-label${lightLabel}" style="background: ${getDiffTableLabelColor(g)};">${labelHtml}</div>
                <div class="dg-cells" style="grid-template-columns: repeat(${COLS}, minmax(0, 1fr));">${cells}</div>
            </div>`;
    });
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
    medalKeys.forEach(k => {
        const list = groups[k];
        if (!list || list.length === 0) return;
        list.sort(strongerFirst);
        const ordered = orderForDirection(list, COLS, getGridDirection('medal'));

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
                    <button type="button" class="dg-medal${k === '' ? ' dg-medal-empty' : ''}" onclick="openMedalModal('${jsStringAttr(song.id)}')" title="メダルを変更">${buildGridMedalInner(k)}${rankHtml}</button>
                    <a class="dg-banner" href="${escapeHtml(getWikiUrl(song))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(song.title)}（Lv${escapeHtml(song.level)}${escapeHtml(diffText)}・攻略wikiを開く）">${bannerInner}</a>
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
    SCORE_RANK_KEYS.concat(SCORE_RANK_NONE).forEach(k => {
        const list = groups[k];
        if (list.length === 0) return;
        // 高い順（スコアなしはメダルの良い順）に、表の向き（最初は左が高い）に合わせて並べる
        list.sort((a, b) => (scoreOf(b) - scoreOf(a)) || (medalRankOf(b) - medalRankOf(a)) || (a.originalOrder - b.originalOrder));
        const ordered = orderForDirection(list, COLS, getGridDirection('score'));

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
                    <button type="button" class="dg-medal${medalClass}" onclick="openMedalModal('${safeId}')" title="メダルを変更">${buildGridMedalInner(medalKey)}</button>
                    <div class="dg-banner-wrap">
                        <a class="dg-banner" href="${escapeHtml(getWikiUrl(song))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(song.title)}（攻略wikiを開く）">${bannerInner}</a>
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
        const medal = vr ? vr.m : (clearRecords[song.id] || '');
        const point = calcPokkuraPoint(parseInt(getPokkuraLevel(song), 10), score, medal);
        if (point > 0) entries[group].push({ song, point, score: parseInt(score, 10) || 0, isVersion: !!vr });
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
        total: pkFloor(pkRound(sum(topNew) + sum(topOld), 8) / 60, 2)
    };
}

function formatPokkuraDate(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ポックラ画面のタブ（'top' = 対象曲 / 'rest' = 圏外）。描き直しても選んだタブのまま
let pokkuraTab = 'top';

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
    const partsText = `新曲（${escapeHtml(pk.newVersionLabel)}） ${pk.newPoint.toFixed(2)}（${pk.topNew.length}/${POKKURA_NEW_COUNT}曲） ＋ 旧曲 ${pk.oldPoint.toFixed(2)}（${pk.topOld.length}/${POKKURA_OLD_COUNT}曲）`;
    let html = official !== null ? `
        <div class="pk-summary">
            <div class="pk-total"><span class="pk-total-label">ポックラ</span><span class="pk-total-value">${official.toFixed(2)}</span></div>
            <div class="pk-source">公式 ${escapeHtml(formatPokkuraDate(pk.version.at))} 時点</div>
            <div class="pk-calc">計算値 ${pk.total.toFixed(2)}（${partsText}）</div>
        </div>` : `
        <div class="pk-summary">
            <div class="pk-total"><span class="pk-total-label">推定ポックラ</span><span class="pk-total-value">${pk.total.toFixed(2)}</span></div>
            <div class="pk-parts">${partsText}</div>
            <div class="pk-source${pk.version ? '' : ' pk-source-none'}">${escapeHtml(sourceText)}</div>
        </div>`;
    html += `
        <div class="pk-tabs" role="tablist" aria-label="ポックラの曲">
            <button type="button" role="tab" id="pk-tab-top" aria-controls="pk-panel-top" onclick="setPokkuraTab('top', true)">対象曲<span class="pk-tab-count">${topCount}</span></button>
            <button type="button" role="tab" id="pk-tab-rest" aria-controls="pk-panel-rest" onclick="setPokkuraTab('rest', true)">圏外<span class="pk-tab-count">${restCount}</span></button>
        </div>`;

    const section = (label, sub, color, list) => {
        if (list.length === 0) return '';
        // ポイントの高い順に、表の向き（最初は左上が1位）に合わせて並べる
        const ordered = orderForDirection(list, COLS, getGridDirection('pokkura'));
        let cells = '';
        ordered.forEach(({ song, extra, point, score, isVersion }) => {
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
            const medalKey = clearRecords[song.id] || '';
            const medalClass = medalKey === '' ? ' dg-medal-empty' : '';
            const bannerSrc = safeUrl(song.bannerUrl, true);
            const bannerInner = bannerSrc
                ? `<img src="${escapeHtml(bannerSrc)}" alt="${escapeHtml(song.title)}" loading="lazy">`
                : `<span class="dg-banner-text">${escapeHtml(song.title)}</span>`;
            const safeId = jsStringAttr(song.id);
            // ポックラ反映時のレベルが Lv と違う曲は、印を付けて両方を見せる
            const pkLevel = getPokkuraLevel(song);
            const lvHtml = pkLevel !== song.level
                ? `<span class="pk-lv pk-lv-custom" title="ポックラはLv${escapeHtml(pkLevel)}で計算（今のLvは${escapeHtml(song.level)}）">${escapeHtml(pkLevel)}</span>`
                : `<span class="pk-lv">${escapeHtml(song.level)}</span>`;
            cells += `
                <div class="dg-cell">
                    <button type="button" class="dg-medal${medalClass}" onclick="openMedalModal('${safeId}')" title="メダルを変更">${buildGridMedalInner(medalKey)}</button>
                    <div class="dg-banner-wrap">
                        <a class="dg-banner" href="${escapeHtml(getWikiUrl(song))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(song.title)}（Lv${escapeHtml(song.level)}・攻略wikiを開く）">${bannerInner}</a>
                        ${lvHtml}
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
        </div>`;
    grid.innerHTML = html;

    const slider = document.getElementById('pk-slider');
    let scrollTimer = null;
    slider.addEventListener('scroll', () => {
        // スライドが止まったら、見えているほうのタブにする
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
            const tab = slider.scrollLeft > slider.clientWidth / 2 ? 'rest' : 'top';
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
    pokkuraTab = tab;
    const slider = document.getElementById('pk-slider');
    if (!slider) return;
    ['top', 'rest'].forEach(key => {
        const active = key === tab;
        const btn = document.getElementById(`pk-tab-${key}`);
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
        btn.tabIndex = active ? 0 : -1;
        document.getElementById(`pk-panel-${key}`).classList.toggle('pk-panel-active', active);
    });
    // 高さは見えているパネルに合わせる（もう片方の長さで下に空白ができないように）
    fitPokkuraSliderHeight();
    const left = tab === 'rest' ? slider.clientWidth : 0;
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
