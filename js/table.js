// ==========================================
// table.js
// 楽曲一覧の表示。
// 絞り込み・並び替え・統計の計算・表の描画・表示レベルボタン。
// ==========================================

function initFilters() {
    const medalSelect = document.getElementById('filter-medal');
    medalSelect.innerHTML = '<option value="ALL">すべて</option>';
    
    const sortedMedalKeys = Object.keys(MEDAL_TYPES)
        .filter(k => k !== '')
        .sort((a, b) => MEDAL_TYPES[b].rank - MEDAL_TYPES[a].rank);
        
    sortedMedalKeys.forEach(k => {
        const option = document.createElement('option');
        option.value = k;
        option.text = MEDAL_TYPES[k].label;
        medalSelect.appendChild(option);
    });
    const optionUnplayed = document.createElement('option');
    optionUnplayed.value = 'unplayed';
    optionUnplayed.text = '未プレイ';
    medalSelect.appendChild(optionUnplayed);
    
    updateDynamicFilters();
}

function updateDynamicFilters() {
    const versionSelect = document.getElementById('filter-version');
    if (versionSelect) {
        const currentVer = versionSelect.value;
        versionSelect.innerHTML = '<option value="ALL">すべて</option>';
        const versions = [...new Set(songs.map(s => s.version))].filter(v => v).sort((a, b) => getVersionSortValue(a) - getVersionSortValue(b));
        versions.forEach(v => {
            const option = document.createElement('option');
            option.value = v;
            option.text = v;
            versionSelect.appendChild(option);
        });
        if (versions.includes(currentVer)) {
            versionSelect.value = currentVer;
        }
    }

    const viewLevelContainer = document.getElementById('view-level-buttons');
    if (viewLevelContainer) {
        viewLevelContainer.innerHTML = '';
        
        // 「すべて」は一番右端に配置する
        const allBtn = document.createElement('button');
        allBtn.className = `level-btn level-btn-all ${currentViewLevel === 'ALL' ? 'active' : ''}`;
        allBtn.innerText = 'すべて';
        allBtn.onclick = () => changeViewLevel('ALL');
        
        const levels = [...new Set(songs.map(s => s.level))].filter(l => l);
        levels.sort((a, b) => {
            const numA = parseInt(a, 10);
            const numB = parseInt(b, 10);
            if (!isNaN(numA) && !isNaN(numB)) return numB - numA;
            if (isNaN(numA)) return 1;
            if (isNaN(numB)) return -1;
            return 0;
        });
        
        if (currentViewLevel !== 'ALL' && !levels.includes(currentViewLevel)) {
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
    document.getElementById('filter-clear').value = 'ALL';
    document.getElementById('filter-medal').value = 'ALL';
    document.getElementById('filter-version').value = 'ALL';
    document.getElementById('filter-diff').value = 'ALL';
    document.getElementById('filter-affinity').value = 'ALL';
    renderTable();
}

function setMedalFilter(filterVal) {
    const medalSelect = document.getElementById('filter-medal');
    if (medalSelect) {
        medalSelect.value = filterVal;
        
        // 「さらに条件で絞り込む」メニューが閉じていたら自動で開く
        const details = medalSelect.closest('details');
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

function getVersionSortValue(ver) {
    if (!ver) return 9999;
    let v = ver.toLowerCase();
    if (!isNaN(v)) return parseInt(v, 10);
    const acOrder = { 'sp': 21, 'lt': 22, 'écl': 23, 'うさ': 24, 'pe': 25, '解': 26, 'ul': 27, 'jf': 28 };
    if (acOrder[v] !== undefined) return acOrder[v];
    if (v.startsWith('cs')) return 100 + parseInt(v.replace('cs', ''), 10) || 199;
    if (v.startsWith('pmp')) return 200 + parseInt(v.replace('pmp', ''), 10) || 299;
    if (v === 'ee') return 300;
    if (v === 'hc') return 400;
    return 999; 
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
    if (isNaN(s)) return { rank: '', isImage: false, color: '#999' };

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

function renderTable() {
    const searchInput = document.getElementById('search-input');
    const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : "";

    const filterClear = document.getElementById('filter-clear') ? document.getElementById('filter-clear').value : 'ALL';
    const filterMedal = document.getElementById('filter-medal') ? document.getElementById('filter-medal').value : 'ALL';
    const filterVersion = document.getElementById('filter-version') ? document.getElementById('filter-version').value : 'ALL';
    const filterDiff = document.getElementById('filter-diff') ? document.getElementById('filter-diff').value : 'ALL';
    const filterAffinity = document.getElementById('filter-affinity') ? document.getElementById('filter-affinity').value : 'ALL';

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

    // 1. 統計の計算に使うベース楽曲（レベル・検索キーワードのみ適用）
    let baseSongs = songs.filter(s => {
        if (currentViewLevel !== 'ALL' && s.level !== currentViewLevel) return false;
        if (searchQuery && !(s.genre.toLowerCase().includes(searchQuery) || s.title.toLowerCase().includes(searchQuery))) return false;
        return true;
    });

    // 2. 実際にテーブルに表示する楽曲（すべての絞り込みを適用）
    let displaySongs = baseSongs.filter(s => {
        const medalKey = clearRecords[s.id] || '';
        const medalInfo = MEDAL_TYPES[medalKey];

        if (filterClear === 'uncleared' && medalInfo && medalInfo.isEasyClear) return false;
        if (filterClear === 'kurohishi_cleared' && (!medalInfo || !medalInfo.isKuroHishiClear)) return false;
        if (filterClear === 'kuroboshi_cleared' && (!medalInfo || !medalInfo.isKuroBoshiClear)) return false;
        if (filterClear === 'cleared' && (!medalInfo || !medalInfo.isEasyClear)) return false;
        if (filterClear === 'normal_cleared' && (!medalInfo || !medalInfo.isNormalClear)) return false;

        if (filterMedal !== 'ALL') {
            if (filterMedal === 'unplayed' && medalKey !== '') return false;
            if (filterMedal !== 'unplayed' && medalKey !== filterMedal) return false;
        }
        if (filterVersion !== 'ALL' && s.version !== filterVersion) return false;

        if (filterDiff !== 'ALL') {
            let dClass = s.diffClass || '未分類';
            if (dClass === '中') {
                dClass = (s.diffIndex !== null && s.diffIndex < 0) ? '中(-)' : '中(+)';
            }
            if (filterDiff === '中(全体)') {
                if (!dClass.startsWith('中')) return false;
            } else {
                if (dClass !== filterDiff) return false;
            }
        }

        if (filterAffinity !== 'ALL') {
            const memo = memoRecords[s.id] || {};
            const aff = memo.affinity || '';
            if (filterAffinity === '未設定') {
                if (aff !== '') return false;
            } else {
                if (aff !== filterAffinity) return false;
            }
        }
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
            const getVal = (song) => {
                if (song.diffIndex !== null && !isNaN(song.diffIndex)) return parseFloat(song.diffIndex);
                if (song.diffClass === '危険') return 2.5; 
                if (song.diffClass === '別格') return 2.0;
                if (song.diffClass === '詐称') return 1.5;
                if (song.diffClass === '強') return 1.0;
                if (song.diffClass === '中') return 0.0;
                if (song.diffClass === '弱') return -1.0;
                if (song.diffClass === '逆詐称') return -1.5;
                if (song.diffClass === '入門') return -2.0; 
                return -999;
            };
            let valA = getVal(a);
            let valB = getVal(b);
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
            let valA = getVersionSortValue(a.version);
            let valB = getVersionSortValue(b.version);
            if (valA === valB) return a.originalOrder - b.originalOrder;
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

    // ★ 統計の計算は「絞り込み前」の baseSongs で行う
    baseSongs.forEach(song => {
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
                <span class="diff-main">${dClassStr}</span><span class="diff-sub">${dIndexStr}</span>
            </div>
        `;
        
        const safeId = song.id.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;");

        const isValidMedalUrl = medalInfo.imgUrl.startsWith('http') || medalInfo.imgUrl.startsWith('data:');
        const medalDisplayHtml = isValidMedalUrl
            ? `<img src="${medalInfo.imgUrl}" loading="lazy" style="width: 32px; height: 32px; object-fit: contain; cursor: pointer; display: block; margin: 0 auto;" onclick="openMedalModal('${safeId}')" title="${medalInfo.label}">`
            : `<div onclick="openMedalModal('${safeId}')" style="cursor: pointer; font-weight: bold; padding: 4px; border: 1px solid #ccc; border-radius: 4px; background: #fff; font-size: 0.8em; color: #555; white-space: nowrap;" title="クリックして変更">${medalInfo.label}</div>`;

        const bannerAction = isMobile ? '' : `onclick="updateBannerFromClipboard('${safeId}')"`;
        const cursorStyle = isMobile ? 'default' : 'pointer';
        const bannerTitle = isMobile ? '' : 'title="クリックしてコピーしたURLで上書き"';
        const noImageTitle = isMobile ? '' : 'title="クリックしてコピーしたURLを自動ペースト"';
        const noImageDeco = isMobile ? 'none' : 'underline';

        const bannerHtml = song.bannerUrl && song.bannerUrl.trim() !== ''
            ? `<img src="${song.bannerUrl}" style="max-width: 100%; height: auto; max-height: 50px; border-radius: 4px; cursor: ${cursorStyle};" ${bannerAction} ${bannerTitle} onerror="this.style.display='none'" />`
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
                <div style="font-weight: bold; font-size: 1.1em; color: #333;">${myScore}</div>
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
                    <div style="font-size: 0.95em; color: #555; font-weight: bold;">${targetScore}</div>
                    ${tRankMark}
                    <div style="margin-top: 2px;">${diff}</div>
                `;
            }
        }

        const scoreDisplay = showScore ? '' : 'display: none;';
        const compareDisplay = showCompare ? '' : 'display: none;';

        const searchKey = (song.genre && song.genre.trim() !== '') ? song.genre : song.title;
        const autoWikiUrl = `https://popn.wiki/search?q=${encodeURIComponent(searchKey)}`;
        const finalWikiUrl = (song.wikiUrl && song.wikiUrl !== '') ? song.wikiUrl : autoWikiUrl;

        const memo = memoRecords[song.id] || {};
        const hasMemo = memo.comment || memo.sudden || memo.affinity;
        let tooltipLines = [];
        if (memo.affinity) tooltipLines.push(`相性: ${memo.affinity}`);
        if (memo.sudden) tooltipLines.push(`SUDDEN+: ${memo.sudden}`);
        if (memo.comment) tooltipLines.push(`コメント:\n${memo.comment}`);
        const memoTooltip = tooltipLines.length > 0 ? tooltipLines.join('\n') : 'メモを追加・編集';

        let affinityBadge = '';
        if (memo.affinity) {
            affinityBadge = `<span class="memo-badge-${memo.affinity}" style="font-size: 0.8em; margin-left: 2px;">[${memo.affinity.substring(0, 2)}]</span>`;
        }

        tr.innerHTML = `
            <td class="col-medal" style="text-align: center; vertical-align: middle;">${medalDisplayHtml}</td>
            <td class="col-score" style="text-align: center; cursor: pointer; background-color: #fafafa; ${scoreDisplay}" onclick="openScoreModal('${safeId}')" title="クリックしてスコア入力">${scoreDisplayHtml}</td>
            <td class="col-compare" style="text-align: center; background-color: #f0f8ff; ${compareDisplay}">${compareHtml}</td>
            <td class="col-level" style="text-align: center;"><span class="level-badge">${song.level || '-'}</span></td>
            <td class="col-version" style="text-align: center;"><span class="ver-badge">${song.version || '-'}</span></td>
            <td class="col-banner" style="text-align: center; transition: background-color 0.2s;" ondragover="event.preventDefault(); this.style.backgroundColor='#e3f2fd';" ondragleave="event.preventDefault(); this.style.backgroundColor='';" ondrop="handleSingleBannerDrop(event, '${safeId}', this)">${bannerHtml}</td>
            <td class="col-title">
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 0.85em; color: #666; display: flex; align-items: center; flex-wrap: wrap;">
                        <span>${song.genre}</span>
                        <span onclick="openMemoModal('${safeId}')" style="cursor: pointer; font-size: 1.2em; margin-left: 4px; padding: 2px; ${hasMemo ? '' : 'opacity: 0.4;'}" title="${memoTooltip}">
                            📝${affinityBadge}
                        </span>
                    </div>
                    <div style="font-weight: bold; word-break: break-all; margin-top: 2px;">
                        <a href="${finalWikiUrl}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">
                            ${song.title} <span style="font-size: 0.8em; color: #2196F3;">🔗</span>
                        </a>
                    </div>
                </div>
            </td>
            <td class="col-bpm" style="text-align: right;"><span>${song.bpm || '-'}</span></td>
            <td class="col-notes" style="text-align: right;"><span>${song.notes}</span></td>
            <td class="col-diff" style="text-align: center;">${diffHtml}</td>
            <td class="col-action no-export" style="text-align: center;">
                <button class="edit-btn" onclick="openEditModal('${safeId}')">✏️編集</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    lastDisplaySongs = displaySongs;
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
    if (filterClear !== 'ALL' || filterMedal !== 'ALL' || filterVersion !== 'ALL' || filterDiff !== 'ALL' || filterAffinity !== 'ALL') {
        levelLabel += ' (絞り込み中)';
    }
    
    const showKuroHishiRate = document.getElementById('show-kurohishi-rate') ? document.getElementById('show-kurohishi-rate').checked : false;
    const showKuroBoshiRate = document.getElementById('show-kuroboshi-rate') ? document.getElementById('show-kuroboshi-rate').checked : false;
    const showEasyRate = document.getElementById('show-easy-rate') ? document.getElementById('show-easy-rate').checked : false;
    const showNormalRate = document.getElementById('show-normal-rate') ? document.getElementById('show-normal-rate').checked : true;
    const showMedalStats = document.getElementById('show-medal-stats') ? document.getElementById('show-medal-stats').checked : false;
    const showDiffStats = document.getElementById('show-diff-stats') ? document.getElementById('show-diff-stats').checked : false;

    let statsHtml = `<div style="display: flex; flex-wrap: wrap; gap: 15px; width: 100%; justify-content: flex-end; align-items: baseline;">
        <div class="stats-level">【${levelLabel}】</div>`;

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

    if (showMedalStats || showDiffStats) {
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
                    ${filterMedal !== 'ALL' ? `<button onclick="setMedalFilter('ALL')" style="padding: 4px 10px; font-size: 0.85em; cursor: pointer; border: 1px solid #ffcdd2; background: #ffebee; color: #d32f2f; border-radius: 4px; font-weight: bold; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">✖ メダル絞り込み解除</button>` : ''}
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
        extendedStatsHtml += `</div>`;
    }
    
    document.getElementById('stats-display').innerHTML = statsHtml;
    document.getElementById('extended-stats-display').innerHTML = extendedStatsHtml;
}

// ==========================================
// ★ 表示レベルボタンの配置（メイン画面 / メニュー内）
// ==========================================
function applyLevelButtonPlacement(onMain) {
    const buttons = document.getElementById('view-level-buttons');
    const slot = document.getElementById(onMain ? 'main-level-slot' : 'menu-level-slot');
    if (buttons && slot && buttons.parentElement !== slot) slot.appendChild(buttons);
    const checkbox = document.getElementById('level-btn-on-main');
    if (checkbox) checkbox.checked = onMain;
}

function setLevelButtonPlacement(onMain) {
    try { localStorage.setItem('popn_level_btn_main', onMain ? '1' : '0'); } catch (e) {}
    applyLevelButtonPlacement(onMain);
}

(function initLevelButtonPlacement() {
    let onMain = true;
    try { onMain = localStorage.getItem('popn_level_btn_main') !== '0'; } catch (e) {}
    applyLevelButtonPlacement(onMain);
})();
