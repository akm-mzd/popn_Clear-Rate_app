// ==========================================
// table.js
// 表示レベルの切り替え・並び替え・難易度の並べ方・絞り込みの判定（FILTER_GROUP_TESTS / makeSongFilter）・
// 統計の数（computeStats）・表を描く入口（renderTable：リストを描き、表示方法の表は views.js の applyViewMode へ）。
// 元はこのファイル1つだったものを、filters.js / stats-sheet.js / views.js / pokkura.js / knock.js に分けた（中身と順番はそのまま）
// ==========================================

function changeViewLevel(level, keepMenu = false) {
    if (!keepMenu) toggleMenu(false); // レベルを選んだらメニューを閉じる（統計シートのスライドからは閉じない）
    // ポックラはレベルに関係なく全体を出すので、レベルを選んだら難易度表に切り替える
    //   「更新」「最近」は難易度表の形で見るものなので、いつも難易度表にする
    if (viewMode === 'pokkura' || viewMode === 'oldpokkura' || isKnockView() || isSpecialViewLevel(level)) viewMode = 'grid';
    document.getElementById('search-input').value = '';
    currentViewLevel = level;
    // 絞り込みのレベルも、選んだレベルだけにする（「すべて」「更新」「最近」なら外す）
    setFilterValues('filter-level', isRealViewLevel(level) ? [level] : []);
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
    if (song.diffClass === SUPER_EX) return -1000; // 超EX は未定（-999）の後ろ
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
    'filter-medal': (s, values, ctx) => {
        const medalKey = clearRecords[s.id] || '';
        if (values.includes(medalKey === '' ? 'unplayed' : medalKey)) return true;
        // 「裏メダル・旧筐体のメダルも含める」：表に出している裏メダル・旧筐体のメダルでも当てる
        if (!(ctx && ctx.medalExtra)) return false;
        const ura = getShownUraMedal(s.id), old = getShownOldMedal(s.id);
        return (!!ura && values.includes(ura)) || (!!old && values.includes(old));
    },
    'filter-extra': (s, values) => values.some(v => { const item = EXTRA_MEDAL_FILTER_ITEMS.find(x => x.value === v); return !!item && item.test(s); }),
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
    'filter-bad': (s, values) => {
        const n = getSongBad(s.id);
        return values.some(v => { const item = BAD_FILTER_ITEMS.find(x => x.value === v); return !!item && item.test(n); });
    },
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
    return { lastUpdate, now: Date.now(), medalExtra: isMedalExtraIncluded() };
}

// 絞り込み（メダル・バージョン・難易度・タグ・属性・スコアランク・更新日・スコアの範囲）を当てる関数。何も選んでいない項目は「すべて」
//   skip：その項目は当てない（選択肢の曲数を数えるとき）／ override：{ 項目: 値 } でその項目の値を入れ替える／ range：スコアの範囲を入れ替える（null で外す）
function makeSongFilter(opts = {}) {
    const ctx = opts.ctx || makeFilterContext();
    const groups = FILTER_IDS.filter(id => id !== opts.skip).map(id => {
        const values = opts.override && opts.override[id] ? opts.override[id] : getActiveFilterValues(id);
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
const STATS_DIFF_ORDER = ['危険', '別格', '詐称', '強', '中(+)', '中(-)', '弱', '逆詐称', '入門', '未分類', '超EX'];

// 超EX の曲を統計（クリア率・総数・メダル数など）に入れるか（「超EXを含む」のチェック）
function isSuperExIncluded() {
    const cb = document.getElementById('show-superex');
    return !!(cb && cb.checked);
}

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

    const showSuperEx = isSuperExIncluded();
    statsSongs.forEach(song => {
        if (!showSuperEx && isSuperExSong(song)) return; // 超EX は「超EXを含む」のときだけ数える（総数にも入れない）
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
    syncLevelSelection();

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
    // レベルの選択肢の曲数は、表示しているレベルに関係なく数える
    const levelBaseSongs = specialIds ? baseSongs : searchQuery ? baseSongs : songs;
    updateFilterOptionCounts(baseSongs, levelBaseSongs);
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
            <td class="col-banner" data-sid="${escapeHtml(song.id)}" style="text-align: center; transition: background-color 0.2s;" ondragover="event.preventDefault(); this.style.backgroundColor='#e3f2fd';" ondragleave="event.preventDefault(); this.style.backgroundColor='';" ondrop="handleSingleBannerDrop(event, '${safeId}', this)">${bannerHtml}</td>
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
    lastStatsContext = { baseSongs, isFiltered, songFilter, searchQuery, showUnreleased, showSuperEx: isSuperExIncluded() };
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
