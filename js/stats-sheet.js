// ==========================================
// stats-sheet.js（table.js から分けたもの）
// 新しいデザインの統計シート：レベルごとのページの横スライド（renderNewUiStats）
// ==========================================
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
    if (typeof scrollGrowthChartsToEnd === 'function') scrollGrowthChartsToEnd(slider);
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

function setStatsSuperEx(checked) {
    const cb = document.getElementById('show-superex');
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
        <label class="ns-unreleased"><input type="checkbox" ${lastStatsContext.showUnreleased ? 'checked' : ''} onchange="setStatsUnreleased(this.checked)"> 未解禁を含む</label>
        <label class="ns-unreleased"><input type="checkbox" ${lastStatsContext.showSuperEx ? 'checked' : ''} onchange="setStatsSuperEx(this.checked)"> 超EXを含む</label></div>`;

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

    // 属性別（苦手な属性）と、伸びのグラフ（growth.js）
    const pageSongs = getStatsPageSongs(page.key);
    html += buildAttrCardHtml(pageSongs);
    html += buildGrowthCardHtml(page, pageSongs);
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
