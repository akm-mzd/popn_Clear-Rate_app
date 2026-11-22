// ==========================================
// growth.js
// 記録の振り返り。
//   ・伸びのグラフ（統計シートの各ページ）：更新履歴から過去のクリア数・スコア平均を戻して、日・週・月・年ごとの折れ線に（点が多ければ横スクロール）
//   ・ポックラの記録（pokkuraHistRecords：公式データを取り込んだ日ごとに1件）
//   ・属性別（統計シートの各ページ）：属性ごとのクリア率・スコア平均。低い順（苦手）
//   ・この曲の記録（メダルを選ぶ画面）：その曲の更新履歴とスコアの線
//   ・今日のまとめ（公式データを取り込んだあと・画像シート）：今日上がったメダル・スコア・ポックラ
// ==========================================

const GROWTH_UNITS = { day: '日', week: '週', month: '月', year: '年' };
// 点がこれより多いときは、グラフを横に広げて横スクロールにする（1点あたりの幅）
const GROWTH_SCROLL_MIN_POINTS = 24;
const GROWTH_POINT_WIDTH = { day: 8, week: 16, month: 26, year: 40 };
const ATTR_MIN_SONGS = 3;       // これより曲の少ない属性は「苦手」の判定に使わない
const SONG_HISTORY_SHOW = 5;    // この曲の記録：最初に出す件数

function getGrowthUnit() {
    const u = storageGet('popn_growth_unit');
    return GROWTH_UNITS[u] ? u : 'week';
}

function setGrowthUnit(unit) {
    storageSet('popn_growth_unit', GROWTH_UNITS[unit] ? unit : 'week');
    if (typeof renderNewUiStats === 'function') renderNewUiStats();
}

// イージー以上の線（最初は出さない。凡例を押すと出す：この端末に popn_growth_easy）
function isGrowthEasyShown() {
    return storageGet('popn_growth_easy') === '1';
}

function toggleGrowthEasy() {
    storageSet('popn_growth_easy', isGrowthEasyShown() ? '0' : '1');
    if (typeof renderNewUiStats === 'function') renderNewUiStats();
}

// 横スクロールのグラフは、開いたときに右端（今）を見せる（renderNewUiStats のあとに呼ぶ）
function scrollGrowthChartsToEnd(root) {
    (root || document).querySelectorAll('.gr-scroll').forEach(el => { el.scrollLeft = el.scrollWidth; });
}

const toScoreNum = v => (v === undefined || v === null || v === '' || isNaN(parseInt(v, 10))) ? null : parseInt(v, 10);

// ---------- 更新履歴から過去の状態を戻す ----------
//   今のメダル・スコアから、新しい順に履歴をさかのぼって「変更前」に戻していく。
//   返り値 { start: { 曲ID: { m, s } }（一番古い履歴より前の状態）, events: [{ t, id, m?, s? }]（古い順。m・s は変わったあとの値） }
function replayHistory(songList) {
    const ids = new Set(songList.map(s => s.id));
    const state = {};
    songList.forEach(s => { state[s.id] = { m: clearRecords[s.id] || '', s: toScoreNum(scoreRecords[s.id]) }; });
    const list = Object.values(getHistoryRecords())
        .filter(e => e && typeof e.t === 'number' && ids.has(e.id))
        .sort((a, b) => b.t - a.t);
    const events = [];
    list.forEach(e => {
        const ev = { t: e.t, id: e.id };
        if ('nm' in e) { ev.m = state[e.id].m; state[e.id].m = e.om || ''; }
        if ('ns' in e) { ev.s = state[e.id].s; state[e.id].s = toScoreNum(e.os); }
        events.push(ev);
    });
    return { start: state, events: events.reverse() };
}

// 区切りの終わり（その日・その週（日曜まで）・その月・その年の最後の時刻の次）
function growthBucketEnd(t, unit) {
    const d = new Date(t);
    if (unit === 'year') return new Date(d.getFullYear() + 1, 0, 1).getTime();
    if (unit === 'month') return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (unit === 'week') day.setDate(day.getDate() + (7 - day.getDay()) % 7);
    day.setDate(day.getDate() + 1);
    return day.getTime();
}

// 点の文字。日・週は、最初の点と年が変わる点だけ年も付ける（withYear）
function growthBucketLabel(end, unit, withYear) {
    const d = new Date(end - 1);
    if (unit === 'year') return `${d.getFullYear()}`;
    if (unit === 'month') return `${d.getFullYear() % 100}/${d.getMonth() + 1}`;
    const s = new Date(d);
    if (unit === 'week') s.setDate(s.getDate() - 6);
    const text = `${withYear ? `${s.getFullYear() % 100}/` : ''}${s.getMonth() + 1}/${s.getDate()}`;
    return unit === 'week' ? `${text}〜` : text;
}

function labelGrowthPoints(points, unit) {
    let prevYear = null;
    points.forEach(p => {
        const y = new Date(p.end - 1).getFullYear();
        p.label = growthBucketLabel(p.end, unit, y !== prevYear);
        prevYear = y;
    });
    return points;
}

// 区切りごとの値：{ points: [{ label, normal, easy, avg }], total, since }。履歴がなければ null
function buildGrowthSeries(songList, unit) {
    const { start, events } = replayHistory(songList);
    if (events.length === 0) return null;
    let normal = 0, easy = 0, sum = 0, cnt = 0, total = 0;
    const state = {};
    const add = (st, sign) => {
        const m = MEDAL_TYPES[st.m] || MEDAL_TYPES[''];
        if (m.isNormalClear) normal += sign;
        if (m.isEasyClear) easy += sign;
        if (st.s !== null) { sum += sign * st.s; cnt += sign; }
    };
    songList.forEach(s => {
        state[s.id] = { ...start[s.id] };
        if (state[s.id].m !== '未解禁') total++;
        add(state[s.id], 1);
    });
    const ends = [];
    for (let end = growthBucketEnd(events[0].t, unit); ; end = growthBucketEnd(end, unit)) {
        ends.push(end);
        if (end > Date.now()) break;
    }
    const points = [];
    let i = 0;
    ends.forEach(end => {
        while (i < events.length && events[i].t < end) {
            const ev = events[i++];
            const st = state[ev.id];
            add(st, -1);
            if ('m' in ev) st.m = ev.m;
            if ('s' in ev) st.s = ev.s;
            add(st, 1);
        }
        points.push({ end, normal, easy, avg: cnt > 0 ? Math.round(sum / cnt) : null });
    });
    return { points: labelGrowthPoints(points, unit), total, since: events[0].t };
}

// ---------- ポックラの記録（公式データを取り込んだ日ごとに1件） ----------
//   pokkuraHistRecords：{ 'YYYY-MM-DD': { pc: 公式の値 or null, c: 計算値, t: 日時 } }
function getPokkuraHistRecords(user = currentUser) {
    if (!allUsersData[user]) allUsersData[user] = emptyUser();
    if (!allUsersData[user].pokkuraHistRecords) allUsersData[user].pokkuraHistRecords = {};
    return allUsersData[user].pokkuraHistRecords;
}

function localDateKey(t) {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function recordPokkuraHistory() {
    const pk = calcPokkura();
    const pc = pk.version && typeof pk.version.pc === 'number' ? pk.version.pc : null;
    getPokkuraHistRecords()[localDateKey(Date.now())] = { pc, c: pk.total, t: Date.now() };
}

function getPokkuraHistList() {
    const recs = getPokkuraHistRecords();
    return Object.keys(recs).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k) && recs[k] && typeof recs[k].t === 'number')
        .map(k => ({ day: k, ...recs[k] })).sort((a, b) => a.t - b.t);
}

function buildPokkuraGrowthSeries(unit) {
    const list = getPokkuraHistList();
    if (list.length === 0) return null;
    const points = [];
    list.forEach(e => {
        const end = growthBucketEnd(e.t, unit);
        const last = points[points.length - 1];
        const p = { end, pc: typeof e.pc === 'number' ? e.pc : null, c: typeof e.c === 'number' ? e.c : null };
        if (last && last.end === end) points[points.length - 1] = p; else points.push(p);
    });
    return labelGrowthPoints(points, unit);
}

// ---------- 折れ線グラフ（SVG） ----------
//   points: [{ label, ... }]、series: [{ key, name, color }]、format: 値の文字
//   integer：曲数など整数の値（目盛りに小数を出さない。0 より下に広げない）
//   pointWidth：点が多いとき、1点あたりの幅（px）。指定すると、目盛りを左に固定し、グラフは横スクロールにする
function buildLineChartSvg(points, series, format = v => String(v), integer = false, pointWidth = 0) {
    if (pointWidth && points.length > GROWTH_SCROLL_MIN_POINTS) return buildScrollLineChartHtml(points, series, format, integer, pointWidth);
    // axis: 'right' の線は、右の目盛りで別の範囲を持つ（スコアと BAD のように大きさが違う数を1つのグラフに出す）
    const rightSeries = series.filter(s => s.axis === 'right');
    const W = 320, H = 150, L = 40, R = rightSeries.length ? 30 : 10, T = 10, B = 24;
    const rangeOf = list => {
        const values = [];
        points.forEach(p => list.forEach(s => { if (typeof p[s.key] === 'number') values.push(p[s.key]); }));
        if (values.length === 0) return null;
        let lo = Math.min(...values), hi = Math.max(...values);
        const isInt = integer || list.every(s => s.integer);
        if (lo === hi) {
            hi += 1;
            if (!(isInt && lo <= 0)) lo -= 1;
        }
        const ticks = isInt && hi - lo < 2 ? [hi, lo] : [hi, (hi + lo) / 2, lo];
        const pad = (hi - lo) * 0.08;
        return { ticks, min: lo - pad, max: hi + pad };
    };
    const leftRange = rangeOf(series.filter(s => s.axis !== 'right'));
    const rightRange = rightSeries.length ? rangeOf(rightSeries) : null;
    if (!leftRange && !rightRange) return '';
    const x = i => L + (points.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (points.length - 1));
    const yOf = range => v => T + (range.max - v) / (range.max - range.min) * (H - T - B);
    const y = yOf(leftRange || rightRange);
    let svg = `<svg class="gr-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(series.map(s => s.name).join('・'))}の推移">`;
    // 目盛り（上・真ん中・下）。右の目盛りは文字だけ
    if (leftRange) {
        leftRange.ticks.forEach(v => {
            svg += `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="gr-grid"/>`;
            svg += `<text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" class="gr-axis" text-anchor="end">${escapeHtml(format(Math.round(v * 100) / 100))}</text>`;
        });
    }
    if (rightRange) {
        const yr = yOf(rightRange);
        const color = rightSeries[0].color;
        rightRange.ticks.forEach(v => {
            if (!leftRange) svg += `<line x1="${L}" x2="${W - R}" y1="${yr(v).toFixed(1)}" y2="${yr(v).toFixed(1)}" class="gr-grid"/>`;
            svg += `<text x="${W - R + 4}" y="${(yr(v) + 3).toFixed(1)}" class="gr-axis" text-anchor="start" style="fill: ${color};">${escapeHtml((rightSeries[0].format || format)(Math.round(v * 100) / 100))}</text>`;
        });
    }
    // 横軸の文字（点が少なければ全部、多ければ最初・真ん中・最後）
    const labelIdx = points.length <= 6 ? points.map((p, i) => i) : [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
    labelIdx.forEach(i => {
        const anchor = points.length === 1 ? 'middle' : i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
        svg += `<text x="${x(i).toFixed(1)}" y="${H - 6}" class="gr-axis" text-anchor="${anchor}">${escapeHtml(points[i].label)}</text>`;
    });
    series.forEach(s => {
        const ys = s.axis === 'right' ? yOf(rightRange) : y;
        const fmt = s.format || format;
        const pts = points.map((p, i) => typeof p[s.key] === 'number' ? `${x(i).toFixed(1)},${ys(p[s.key]).toFixed(1)}` : null).filter(Boolean);
        if (pts.length > 1) svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
        points.forEach((p, i) => {
            if (typeof p[s.key] !== 'number') return;
            svg += `<circle cx="${x(i).toFixed(1)}" cy="${ys(p[s.key]).toFixed(1)}" r="${points.length > 15 ? 2 : 3}" fill="${s.color}"><title>${escapeHtml(`${p.label} ${s.name}：${fmt(p[s.key])}`)}</title></circle>`;
        });
    });
    return svg + '</svg>';
}

// 縦の目盛りの範囲（buildLineChartSvg と同じ決め方）
function chartRange(points, series, integer) {
    const values = [];
    points.forEach(p => series.forEach(s => { if (typeof p[s.key] === 'number') values.push(p[s.key]); }));
    if (values.length === 0) return null;
    let lo = Math.min(...values), hi = Math.max(...values);
    if (lo === hi) {
        hi += 1;
        if (!(integer && lo <= 0)) lo -= 1;
    }
    const pad = (hi - lo) * 0.08;
    return { ticks: integer && hi - lo < 2 ? [hi, lo] : [hi, (hi + lo) / 2, lo], min: lo - pad, max: hi + pad };
}

// 横スクロールの折れ線：左に目盛り（動かない）、右にグラフ（横に動く）
function buildScrollLineChartHtml(points, series, format, integer, pointWidth) {
    const H = 150, T = 10, B = 24, AX = 40, PAD = 12;
    const range = chartRange(points, series, integer);
    if (!range) return '';
    const W = PAD * 2 + (points.length - 1) * pointWidth;
    const x = i => PAD + i * pointWidth;
    const y = v => T + (range.max - v) / (range.max - range.min) * (H - T - B);
    let axis = `<svg class="gr-yaxis" width="${AX}" height="${H}" viewBox="0 0 ${AX} ${H}" aria-hidden="true">`;
    let svg = `<svg class="gr-svg-wide" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(series.map(s => s.name).join('・'))}の推移">`;
    range.ticks.forEach(v => {
        axis += `<text x="${AX - 4}" y="${(y(v) + 3).toFixed(1)}" class="gr-axis" text-anchor="end">${escapeHtml(format(Math.round(v * 100) / 100))}</text>`;
        svg += `<line x1="0" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="gr-grid"/>`;
    });
    // 横軸の文字：だいたい 70px おき（年が付く点は必ず）
    const every = Math.max(1, Math.round(70 / pointWidth));
    let lastLabelX = -Infinity;
    points.forEach((p, i) => {
        const withYear = /^\d{2,4}\//.test(p.label) || /^\d{4}$/.test(p.label);
        if (!(i % every === 0 || (withYear && x(i) - lastLabelX > 40) || i === points.length - 1)) return;
        if (x(i) - lastLabelX < 36) return;
        lastLabelX = x(i);
        svg += `<line x1="${x(i)}" x2="${x(i)}" y1="${H - B}" y2="${H - B + 3}" class="gr-grid"/>`;
        svg += `<text x="${x(i).toFixed(1)}" y="${H - 6}" class="gr-axis" text-anchor="middle">${escapeHtml(p.label)}</text>`;
    });
    series.forEach(s => {
        const pts = points.map((p, i) => typeof p[s.key] === 'number' ? `${x(i).toFixed(1)},${y(p[s.key]).toFixed(1)}` : null).filter(Boolean);
        if (pts.length > 1) svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
        points.forEach((p, i) => {
            if (typeof p[s.key] !== 'number') return;
            svg += `<circle cx="${x(i).toFixed(1)}" cy="${y(p[s.key]).toFixed(1)}" r="${pointWidth < 12 ? 1.5 : 2.5}" fill="${s.color}"><title>${escapeHtml(`${p.label} ${s.name}：${format(p[s.key])}`)}</title></circle>`;
        });
    });
    return `<div class="gr-chart">${axis}</svg><div class="gr-scroll">${svg}</svg></div></div>`;
}

// 凡例。s.toggle のある線は押して出す・消す（s.off のときは薄く）
function buildChartLegendHtml(series, last) {
    return `<div class="gr-legend">${series.map(s => {
        const inner = `<i style="background: ${s.color};"></i>${escapeHtml(s.name)}${last && typeof last[s.key] === 'number' && !s.off ? `<b>${escapeHtml(s.format ? s.format(last[s.key]) : String(last[s.key]))}</b>` : ''}`;
        return s.toggle ? `<button type="button" class="gr-legend-btn${s.off ? ' off' : ''}" aria-pressed="${!s.off}" onclick="${s.toggle}" title="押すと${s.off ? '出す' : '消す'}">${inner}</button>` : `<span>${inner}</span>`;
    }).join('')}</div>`;
}

// 統計シートの「伸び」のカード（page.key：レベル / 'ALL' / 'CUR'）
function buildGrowthCardHtml(page, pageSongs) {
    const unit = getGrowthUnit();
    const tabs = Object.keys(GROWTH_UNITS).map(u => `<button type="button" class="gr-unit${u === unit ? ' active' : ''}" onclick="setGrowthUnit('${u}')">${GROWTH_UNITS[u]}</button>`).join('');
    let body = '';
    const g = buildGrowthSeries(pageSongs, unit);
    if (!g) {
        body += '<div class="gr-empty">まだ更新履歴がありません。メダル・スコアを更新すると、ここに伸びが出ます。</div>';
    } else {
        const last = g.points[g.points.length - 1];
        const pw = GROWTH_POINT_WIDTH[unit];
        const easyOn = isGrowthEasyShown();
        const clearSeries = [
            { key: 'normal', name: 'ノーマル以上', color: '#c2185b' },
            { key: 'easy', name: 'イージー以上', color: '#2e9d2a', toggle: 'toggleGrowthEasy()', off: !easyOn }
        ];
        body += `<div class="gr-sub">クリア数（${g.total}曲中）</div>${buildChartLegendHtml(clearSeries, last)}${buildLineChartSvg(g.points, clearSeries.filter(s => !s.off), v => `${Math.round(v)}`, true, pw)}`;
        if (g.points.some(p => p.avg !== null)) {
            const avgSeries = [{ key: 'avg', name: 'スコア平均', color: '#1565c0', format: v => Math.round(v).toLocaleString('ja-JP') }];
            body += `<div class="gr-sub">スコア平均</div>${buildChartLegendHtml(avgSeries, last)}${buildLineChartSvg(g.points, avgSeries, v => Math.round(v).toLocaleString('ja-JP'), false, pw)}`;
        }
        const d = new Date(g.since);
        body += `<div class="gr-note">${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} からの更新履歴をもとにしています</div>`;
    }
    if (page.key === 'ALL') {
        const pk = buildPokkuraGrowthSeries(unit);
        const pkSeries = [
            { key: 'pc', name: '公式', color: '#7b1fa2', format: v => v.toFixed(2) },
            { key: 'c', name: '計算値', color: '#ef6c00', format: v => v.toFixed(2) }
        ];
        body += `<div class="gr-sub">ポップンクラス</div>`;
        body += pk ? `${buildChartLegendHtml(pkSeries, pk[pk.length - 1])}${buildLineChartSvg(pk, pkSeries, v => Number(v).toFixed(2), false, GROWTH_POINT_WIDTH[unit])}`
            : '<div class="gr-empty">公式データを取り込むたびに記録します（ver 3.22 から）。</div>';
    }
    return `<section class="ns-card gr-card"><div class="ns-card-title">伸び<span class="gr-units" role="group" aria-label="区切り">${tabs}</span></div>${body}</section>`;
}

// ---------- 属性別（苦手な属性） ----------
//   返り値 [{ a, total, normal, rate, avg }]（曲の多い属性はクリア率の低い順、少ない属性は後ろ）
function getAttrStats(songList) {
    const map = {};
    songList.forEach(s => {
        const attrs = getSongAttrs(s);
        if (attrs.length === 0 || clearRecords[s.id] === '未解禁') return;
        const m = MEDAL_TYPES[clearRecords[s.id] || ''] || MEDAL_TYPES[''];
        const sc = toScoreNum(scoreRecords[s.id]);
        attrs.forEach(a => {
            const r = map[a] || (map[a] = { a, total: 0, normal: 0, sum: 0, cnt: 0 });
            r.total++;
            if (m.isNormalClear) r.normal++;
            if (sc !== null) { r.sum += sc; r.cnt++; }
        });
    });
    return Object.values(map).map(r => ({ a: r.a, total: r.total, normal: r.normal, rate: r.normal / r.total, avg: r.cnt > 0 ? Math.round(r.sum / r.cnt) : null }))
        .sort((x, y) => ((y.total >= ATTR_MIN_SONGS) - (x.total >= ATTR_MIN_SONGS)) || (x.rate - y.rate) || ((x.avg || 0) - (y.avg || 0)) || (y.total - x.total));
}

// 苦手の候補にしない属性（名前にこの文字を含むもの。辛ゲージはゲージの種類で、クリア率がいつも低くなるため）
const WEAK_ATTR_EXCLUDE = ['辛ゲージ'];
const isWeakAttrCandidate = a => !WEAK_ATTR_EXCLUDE.some(x => String(a).includes(x));

// 苦手な属性（曲が3曲以上で、クリア率が一番低いもの。全部クリアしていればなし。辛ゲージは除く）
function getWeakAttrs(songList) {
    const list = getAttrStats(songList).filter(r => r.total >= ATTR_MIN_SONGS && r.rate < 1 && isWeakAttrCandidate(r.a));
    return list.length > 0 ? list.filter(r => r.rate === list[0].rate).map(r => r.a) : [];
}

let attrCardOpen = false;

function buildAttrCardHtml(pageSongs) {
    const list = getAttrStats(pageSongs);
    if (list.length === 0) return '';
    const weak = getWeakAttrs(pageSongs);
    const rows = list.map(r => {
        const few = r.total < ATTR_MIN_SONGS;
        return `<tr class="${few ? 'at-few' : ''}" onclick="filterByAttr('${jsStringAttr(r.a)}')" title="${escapeHtml(r.a)}の曲で絞り込む">
            <th>${escapeHtml(r.a)}${weak.includes(r.a) ? '<span class="at-weak">苦手</span>' : ''}</th>
            <td class="ns-num">${r.normal}/${r.total}</td>
            <td class="ns-rate-cell"><span class="ns-rate">${formatRate(r.normal, r.total)}%</span><span class="ns-bar"><span style="width: ${(r.rate * 100).toFixed(1)}%; background: #c2185b;"></span></span></td>
            <td class="ns-num">${r.avg !== null ? r.avg.toLocaleString('ja-JP') : '-'}</td></tr>`;
    }).join('');
    // 最初は畳んでおく（開いたかどうかは、統計シートを描き直しても覚えておく）
    return `<details class="ns-card at-card"${attrCardOpen ? ' open' : ''} ontoggle="attrCardOpen = this.open"><summary class="ns-card-title">属性別<span class="ns-card-sub">${weak.length ? `苦手：${escapeHtml(weak.join('・'))}` : 'ノーマルクリア率の低い順'}</span></summary>
        <div class="ns-card-sub at-hint">ノーマルクリア率の低い順・押すと絞り込み</div>
        <div class="ns-table-wrap"><table class="ns-table at-table"><thead><tr><th>属性</th><th>クリア</th><th>クリア率</th><th>スコア平均</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}

function filterByAttr(attr) {
    setFilterValues('filter-attr', [attr]);
    if (typeof closeNewUiSheet === 'function') closeNewUiSheet(); else toggleMenu(false);
    renderTable();
}

// ---------- この曲の記録（メダルを選ぶ画面） ----------
let songHistoryShowAll = false;
let songHistoryFormOpen = false; // 「記録を足す」の欄を開いているか

function getSongHistory(id) {
    const records = getHistoryRecords();
    return Object.keys(records).filter(k => { const e = records[k]; return e && e.id === id && typeof e.t === 'number'; })
        .map(k => ({ ...records[k], key: k })).sort((a, b) => b.t - a.t);
}

// 履歴から選んだ記録のうち、今の記録と違うもの（{ medal: [今, 履歴], score: …, bad: … }）
//   メダル・スコアは履歴の中で一番良いもの、BAD は履歴の中で一番少ないもの（今の記録より良いときだけ）
function getSongHistoryLatestDiff(id) {
    const list = getSongHistory(id);
    const diff = {};
    const rankOf = k => (MEDAL_TYPES[k] || MEDAL_TYPES['']).rank;
    // 変更後だけでなく、変更前の値も候補にする（変更前の方が良い記録のこともあるので）
    const medals = list.filter(e => 'nm' in e).flatMap(e => [e.nm || '', e.om || '']).filter(k => k !== '未解禁');
    const bestMedal = medals.reduce((best, k) => best === null || rankOf(k) > rankOf(best) ? k : best, null);
    const m = bestMedal === null ? null : { nm: bestMedal };
    const scores = list.filter(e => 'ns' in e).flatMap(e => [toScoreNum(e.ns), toScoreNum(e.os)]).filter(v => v !== null);
    const bads = list.filter(e => 'nb' in e).flatMap(e => [toBadNum(e.nb), toBadNum(e.ob)]).filter(v => v !== null);
    // 今の記録より良いときだけ変える（今の記録の方が良ければ、そのまま。下げることはしない）
    const curMedal = clearRecords[id] || '', curScore = toScoreNum(scoreRecords[id]), curBad = toBadNum(getBadRecords()[id]);
    if (m && curMedal !== '未解禁' && rankOf(m.nm || '') > rankOf(curMedal)) diff.medal = [curMedal, m.nm || ''];
    if (scores.length && (curScore === null || Math.max(...scores) > curScore)) diff.score = [curScore, Math.max(...scores)];
    if (bads.length && (curBad === null || Math.min(...bads) < curBad)) diff.bad = [curBad, Math.min(...bads)];
    return diff;
}

// 「記録を反映」：履歴の一番良いメダル・一番高いスコア・一番少ない BAD を今の記録にする（履歴は足さない）
function applySongHistoryLatest(id) {
    const diff = getSongHistoryLatestDiff(id);
    const name = v => v === null || v === '' ? 'なし' : String(v);
    const lines = [];
    if (diff.medal) lines.push(`メダル：${diff.medal[0] || '未プレイ'} → ${diff.medal[1] || '未プレイ'}`);
    if (diff.score) lines.push(`スコア：${name(diff.score[0])} → ${name(diff.score[1])}`);
    if (diff.bad) lines.push(`BAD：${name(diff.bad[0])} → ${name(diff.bad[1])}`);
    if (lines.length === 0) return;
    if (!confirm(`履歴の記録を、今の記録にしますか？（メダル・スコアは一番良いもの、BAD は一番少ないもの）\n${lines.join('\n')}`)) return;
    if (diff.medal) { if (diff.medal[1] === '') delete clearRecords[id]; else clearRecords[id] = diff.medal[1]; }
    if (diff.score) { if (diff.score[1] === null) delete scoreRecords[id]; else scoreRecords[id] = diff.score[1]; }
    if (diff.bad) { const recs = getBadRecords(); if (diff.bad[1] === null) delete recs[id]; else recs[id] = diff.bad[1]; }
    scheduleAutoSave();
    renderTable();
    refreshSongHistoryViews(id);
}

// 「履歴の一番良い記録をまとめて反映」：全曲で、履歴の一番良いメダル・一番高いスコア・一番少ない BAD が
//   今の記録より良い曲だけを、確認してから今の記録にする（下げることはしない。履歴は足さない）
function applyHistoryBestAll() {
    const name = v => v === null || v === '' ? 'なし' : String(v);
    const list = songs.map(song => ({ song, diff: getSongHistoryLatestDiff(song.id) }))
        .filter(x => x.diff.medal || x.diff.score || x.diff.bad);
    if (list.length === 0) { alert('反映する曲はありません（どの曲も、今の記録が履歴と同じか、より良いです）。'); return; }
    const line = x => {
        const parts = [];
        if (x.diff.medal) parts.push(`${x.diff.medal[0] || '未プレイ'}→${x.diff.medal[1] || '未プレイ'}`);
        if (x.diff.score) parts.push(`スコア ${name(x.diff.score[0])}→${name(x.diff.score[1])}`);
        if (x.diff.bad) parts.push(`BAD ${name(x.diff.bad[0])}→${name(x.diff.bad[1])}`);
        return `Lv${x.song.level} ${x.song.title}：${parts.join('、')}`;
    };
    const sample = list.slice(0, 12).map(line).join('\n');
    if (!confirm(`${list.length}曲の記録を、履歴の一番良い記録にします（今の記録より良いものだけ）。\n\n${sample}${list.length > 12 ? `\n…ほか ${list.length - 12}曲` : ''}`)) return;
    const badRecs = getBadRecords();
    list.forEach(({ song, diff }) => {
        const id = song.id;
        if (diff.medal) { if (diff.medal[1] === '') delete clearRecords[id]; else clearRecords[id] = diff.medal[1]; }
        if (diff.score) { if (diff.score[1] === null) delete scoreRecords[id]; else scoreRecords[id] = diff.score[1]; }
        if (diff.bad) { if (diff.bad[1] === null) delete badRecs[id]; else badRecs[id] = diff.bad[1]; }
    });
    scheduleAutoSave();
    renderTable();
    if (currentDetailSongId) refreshSongHistoryViews(currentDetailSongId);
    showToast('toast-eagate', `${list.length}曲の記録を反映しました`, '#4caf50', 3000);
}

// 曲の詳細ページ・メダルを選ぶ画面で開いている曲なら、その画面（記録・最高スコア・BAD・裏メダル）を描き直す
function refreshSongHistoryViews(id) {
    if (currentMedalEditId === id) renderUraMedalBox();
    if (currentDetailSongId !== id) return;
    renderSongDetailHead();
    renderSongHistoryBox(id);
    renderBadBox();
}

// 履歴の中で一番高いスコア（初めて取った日も）。BAD の欄の上に出す
function renderBestScoreBox(id) {
    const box = document.getElementById('best-score-box');
    if (!box) return;
    let best = null;
    getSongHistory(id).forEach(e => {
        if (!('ns' in e)) return;
        // 変更前の方が高いこともあるので両方見る
        [toScoreNum(e.ns), toScoreNum(e.os)].forEach(s => {
            if (s !== null && (!best || s > best.s || (s === best.s && e.t < best.t))) best = { s, t: e.t };
        });
    });
    // 履歴に無くても、今のスコア（公式から読み取ったものなど）の方が高ければそちらを出す
    const cur = toScoreNum(scoreRecords[id]);
    if (cur !== null && (!best || cur > best.s)) best = { s: cur, t: null };
    const editBtn = `<button type="button" class="bs-edit" onclick="openScoreModal('${jsStringAttr(id)}')">変更</button>`;
    if (!best) {
        box.innerHTML = `<span class="bs-label">最高スコア</span><span class="bs-none">記録なし</span>${editBtn}`;
        return;
    }
    const d = best.t === null ? null : new Date(best.t);
    box.innerHTML = `<span class="bs-label">最高スコア</span><b class="bs-score">${best.s.toLocaleString('ja-JP')}</b><span class="bs-date">${d ? `（${d.getFullYear() % 100}/${d.getMonth() + 1}/${d.getDate()}）` : '（今の記録）'}</span>${editBtn}`;
}

function renderSongHistoryBox(id, showAll) {
    renderBestScoreBox(id);
    const box = document.getElementById('song-history-box');
    if (!box) return;
    if (typeof showAll === 'boolean') { songHistoryShowAll = showAll; if (!showAll) songHistoryFormOpen = false; }
    const list = getSongHistory(id);
    const song = songs.find(s => s.id === id);
    const cur = clearRecords[id] || '';
    const addBtn = `<button type="button" class="sh-add" onclick="toggleSongHistoryForm('${jsStringAttr(id)}')">${songHistoryFormOpen ? '閉じる' : '＋ 記録を足す'}</button>`;
    const diff = getSongHistoryLatestDiff(id);
    const applyBtn = Object.keys(diff).length ? `<button type="button" class="sh-apply" onclick="applySongHistoryLatest('${jsStringAttr(id)}')">記録を反映</button>` : '';
    const form = songHistoryFormOpen && song
        ? buildManualHistoryFormHtml(song, { date: localDateKey(Date.now()), from: cur === '未解禁' ? '' : cur, to: cur === '未解禁' ? '' : cur }, 'sh') : '';
    if (list.length === 0) {
        box.innerHTML = `<div class="sh-title">この曲の記録${addBtn}</div>${form}<div class="sh-empty">まだ記録がありません</div>`;
        return;
    }
    // スコア（赤・左の目盛り）と最小BAD（青・右の目盛り）の線（古い順。どちらかが2回以上あるとき）
    const chartPoints = list.slice().reverse().filter(e => ('ns' in e && e.ns !== null) || ('nb' in e && e.nb !== null))
        .map(e => {
            const d = new Date(e.t);
            const p = { label: `${d.getMonth() + 1}/${d.getDate()}` };
            if ('ns' in e && e.ns !== null) p.s = e.ns;
            if ('nb' in e && e.nb !== null) p.b = toBadNum(e.nb);
            return p;
        });
    const nScore = chartPoints.filter(p => typeof p.s === 'number').length;
    const nBad = chartPoints.filter(p => typeof p.b === 'number').length;
    const chartSeries = [];
    if (nScore > 0) chartSeries.push({ key: 's', name: 'スコア', color: '#e53935' });
    if (nBad > 0) chartSeries.push({ key: 'b', name: '最小BAD', color: '#1565c0', axis: nScore > 0 ? 'right' : 'left', integer: true, format: v => String(Math.round(v)) });
    const chart = (nScore >= 2 || nBad >= 2)
        ? buildLineChartSvg(chartPoints, chartSeries, v => Math.round(v).toLocaleString('ja-JP'))
            + `<div class="gr-legend sh-legend">${chartSeries.map(s => `<span><i style="background: ${s.color};"></i>${s.name}${s.axis === 'right' ? '（右）' : ''}</span>`).join('')}</div>`
        : '';
    const shown = songHistoryShowAll ? list : list.slice(0, SONG_HISTORY_SHOW);
    const rows = shown.map(e => {
        const d = new Date(e.t);
        const parts = [];
        if ('nm' in e) parts.push(`<span class="hist-change">${historyMedalHtml(e.om)}<span class="hist-arrow">→</span>${historyMedalHtml(e.nm)}</span>`);
        if ('ns' in e) parts.push(historyScoreHtml(e.os, e.ns));
        if ('nb' in e) parts.push(historyBadHtml(e.ob, e.nb));
        return `<div class="sh-row"><span class="sh-date">${d.getFullYear() % 100}/${d.getMonth() + 1}/${d.getDate()}</span><span class="sh-body">${parts.join('')}</span>
            <button type="button" class="hist-delete sh-delete sh-edit" onclick="openHistoryEdit('${jsStringAttr(e.key)}')" title="この記録を編集（管理者のみ）" aria-label="この記録を編集（管理者のみ）">✏️</button>
            <button type="button" class="hist-delete sh-delete" onclick="deleteHistoryEntry('${jsStringAttr(e.key)}')" title="この記録を削除（管理者のみ）" aria-label="この記録を削除（管理者のみ）">✕</button></div>`;
    }).join('');
    const more = list.length > SONG_HISTORY_SHOW && !songHistoryShowAll
        ? `<button type="button" class="sh-more" onclick="renderSongHistoryBox('${jsStringAttr(id)}', true)">もっと見る（全${list.length}件）</button>` : '';
    box.innerHTML = `<div class="sh-title">この曲の記録<span>${list.length}件</span>${applyBtn}${addBtn}</div>${form}${chart ? `<div class="sh-chart">${chart}</div>` : ''}${rows}${more}`;
}

function toggleSongHistoryForm(id) {
    songHistoryFormOpen = !songHistoryFormOpen;
    renderSongHistoryBox(id);
}

// ---------- 今日のまとめ（過去の日も見られる） ----------
//   その日（0時から次の日の0時まで）の更新履歴を曲ごとにまとめる（その日の最初の「変更前」と最後の「変更後」）
function dayStartOf(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function nextDayStart(day) { const d = new Date(day); d.setDate(d.getDate() + 1); return d.getTime(); }
function isTodayStart(day) { return day === dayStartOf(Date.now()); }

function getDayChanges(day) {
    const today = isTodayStart(day);
    const to = today ? Infinity : nextDayStart(day);
    const sum = getPeriodChanges(day, to, null, true);
    sum.day = day;
    sum.isToday = today;
    // その日に達成した目標（js/goals.js）
    sum.goals = typeof getGoalsAchievedOn === 'function' ? getGoalsAchievedOn(day, to) : [];
    sum.medalTotals = getDayMedalTotals(sum, to);
    return sum;
}

// メダルの合計（今日のまとめ）：その日に越えた銅丸以上のメダルごとに、そのレベルでそのメダル以上の曲の数 / そのレベルの曲の数
//   黒星 → 銅星なら銅丸・銅菱・銅星のどれにも入る。数はその日の終わりの時点（to が Infinity なら今）
//   返す：[{ lv, medal, have, total, up }]（レベルの高い順 → メダルの低い順）
// レベルごとにまとめる（並びはそのまま）：[{ lv, rows }]
function groupMedalTotalsByLevel(list) {
    const groups = [];
    (list || []).forEach(r => {
        const last = groups[groups.length - 1];
        if (last && last.lv === r.lv) last.rows.push(r);
        else groups.push({ lv: r.lv, rows: [r] });
    });
    return groups;
}

function getDayMedalTotals(sum, to) {
    const rankOf = k => (MEDAL_TYPES[k] || MEDAL_TYPES['']).rank;
    const minRank = MEDAL_TYPES['銅丸'].rank;
    const tiers = Object.keys(MEDAL_TYPES).filter(k => rankOf(k) >= minRank).sort((a, b) => rankOf(a) - rankOf(b));
    const crossed = new Map(); // 'レベル|メダル' -> 越えた曲の数
    (sum.medalUp || []).forEach(c => {
        if (!c.song) return;
        tiers.forEach(k => {
            if (rankOf(k) > rankOf(c.om) && rankOf(k) <= rankOf(c.nm)) {
                const key = String(c.song.level) + '|' + k;
                crossed.set(key, (crossed.get(key) || 0) + 1);
            }
        });
    });
    if (crossed.size === 0) return [];
    // その日の終わりのメダル：今のメダルから、それより後の更新を新しい順に戻す
    const medalAt = {};
    songs.forEach(s => { medalAt[s.id] = clearRecords[s.id] || ''; });
    if (to !== Infinity) {
        Object.values(getHistoryRecords())
            .filter(e => e && typeof e.t === 'number' && e.t >= to && 'nm' in e && e.id in medalAt)
            .sort((a, b) => b.t - a.t)
            .forEach(e => { medalAt[e.id] = e.om || ''; });
    }
    // 母数は統計と同じ（未解禁は「未解禁を表示」のときだけ、超EX は「超EXを含む」のときだけ）
    const cb = document.getElementById('show-unreleased');
    const showUnreleased = !!(cb && cb.checked);
    const showSuperEx = typeof isSuperExIncluded === 'function' ? isSuperExIncluded() : false;
    const rows = [...crossed.entries()].map(([key, up]) => {
        const [lv, medal] = key.split('|');
        let have = 0, total = 0;
        songs.forEach(s => {
            if (String(s.level) !== lv) return;
            if (!showSuperEx && isSuperExSong(s)) return;
            const m = medalAt[s.id];
            if ((MEDAL_TYPES[m] || {}).excludeFromRate && !showUnreleased) return;
            total++;
            if (rankOf(m) >= rankOf(medal)) have++;
        });
        return { lv, medal, have, total, up };
    });
    const lvNum = r => parseInt(r.lv, 10) || 0;
    return rows.sort((a, b) => (lvNum(b) - lvNum(a)) || (rankOf(a.medal) - rankOf(b.medal)));
}

function getTodayChanges() {
    return getDayChanges(dayStartOf(Date.now()));
}

// 期間（from 以上 to 未満）の更新履歴を曲ごとにまとめる（期間の最初の変更前と最後の変更後）。ids を渡すとその曲だけ
//   best：期間の中の一番良い値を「変わった後」にする（メダルは一番良いもの・スコアは一番高いもの・BAD は一番少ないもの）。
//     「変わる前」はスコアは一番低い変更前・BAD は一番多い変更前。手で足した記録の時刻が公式の取り込みより前でも、その日のまとめに出るように（今日のまとめで使う）
function getPeriodChanges(from, to, ids, best) {
    const list = Object.values(getHistoryRecords())
        .filter(e => e && typeof e.t === 'number' && e.t >= from && e.t < to && (!ids || ids.has(e.id)))
        .sort((a, b) => a.t - b.t);
    const rankOf = k => (MEDAL_TYPES[k] || MEDAL_TYPES['']).rank;
    const bySong = new Map();
    list.forEach(e => {
        const c = bySong.get(e.id) || { id: e.id, ti: e.ti, lv: e.lv };
        if (!best) {
            if ('nm' in e) { if (!('om' in c)) c.om = e.om || ''; c.nm = e.nm || ''; }
            if ('ns' in e) { if (!('os' in c)) c.os = toScoreNum(e.os); c.ns = toScoreNum(e.ns); }
            if ('nb' in e) { if (!('ob' in c)) c.ob = toBadNum(e.ob); c.nb = toBadNum(e.nb); }
        } else {
            if ('nm' in e) {
                if (!('om' in c)) c.om = e.om || '';
                const nm = e.nm || '';
                if (!('nm' in c) || rankOf(nm) > rankOf(c.nm)) c.nm = nm;
            }
            if ('ns' in e) {
                const os = toScoreNum(e.os), ns = toScoreNum(e.ns);
                if (!('os' in c) || (os !== null && (c.os === null || os < c.os))) c.os = os;
                if (!('ns' in c) || (ns !== null && (c.ns === null || ns > c.ns))) c.ns = ns;
            }
            if ('nb' in e) {
                const ob = toBadNum(e.ob), nb = toBadNum(e.nb);
                if (!('ob' in c) || (ob !== null && (c.ob === null || ob > c.ob))) c.ob = ob;
                if (!('nb' in c) || (nb !== null && (c.nb === null || nb < c.nb))) c.nb = nb;
            }
        }
        bySong.set(e.id, c);
    });
    const changes = [...bySong.values()].map(c => ({ ...c, song: songs.find(s => s.id === c.id) || null }));
    // どの欄もレベルの高い順。同じレベルの中は、メダルは良い順（→ スコアが高い順）、スコアは高い順、BAD は少ない順
    const lvOf = c => parseInt(c.song ? c.song.level : c.lv, 10) || 0;
    const scoreNow = c => ('ns' in c && c.ns !== null ? c.ns : toScoreNum(scoreRecords[c.id])) || 0;
    const medalUp = changes.filter(c => 'nm' in c && rankOf(c.nm) > rankOf(c.om))
        .sort((a, b) => (lvOf(b) - lvOf(a)) || (rankOf(b.nm) - rankOf(a.nm)) || (scoreNow(b) - scoreNow(a)));
    const scoreUp = changes.filter(c => 'ns' in c && c.ns !== null && (c.os === null || c.ns > c.os))
        .map(c => ({ ...c, diff: c.os === null ? null : c.ns - c.os })).sort((a, b) => (lvOf(b) - lvOf(a)) || (b.ns - a.ns));
    const badDown = changes.filter(c => 'nb' in c && c.nb !== null && (c.ob === null || c.nb < c.ob))
        .sort((a, b) => (lvOf(b) - lvOf(a)) || (a.nb - b.nb));
    // 1曲1行のまとめ（メダル・スコア・BAD のどれかが良くなった曲）。レベルの高い順 → メダルが変わった曲が先 → メダルが良い順 → スコアが高い順 → BAD が少ない順
    const up = new Map();
    medalUp.forEach(c => up.set(c.id, { ...c, medal: true }));
    scoreUp.forEach(c => up.set(c.id, { ...(up.get(c.id) || c), diff: c.diff, score: true }));
    badDown.forEach(c => up.set(c.id, { ...(up.get(c.id) || c), bad: true }));
    // 行に出す曲のスコアが下がっていたら（メダルを取ったときのスコアが自己ベストより低いなど）、下がった分も出す（タイルの「スコア更新」には数えない）
    up.forEach(c => {
        if (!c.score && 'ns' in c && c.ns !== null && c.os !== null && c.os !== undefined && c.ns < c.os) {
            c.scoreDown = true;
            c.diff = c.ns - c.os;
        }
    });
    const medalNow = c => ('nm' in c ? c.nm : clearRecords[c.id]) || '';
    const badNow = c => ('nb' in c && c.nb !== null ? c.nb : (typeof getSongBad === 'function' ? getSongBad(c.id) : null));
    const songsUp = [...up.values()].sort((a, b) => (lvOf(b) - lvOf(a)) || ((b.medal ? 1 : 0) - (a.medal ? 1 : 0)) || (rankOf(medalNow(b)) - rankOf(medalNow(a)))
        || (scoreNow(b) - scoreNow(a)) || ((badNow(a) ?? 1e9) - (badNow(b) ?? 1e9)));
    const isNormal = k => !!(MEDAL_TYPES[k] || {}).isNormalClear;
    const isFc = k => rankOf(k) >= MEDAL_TYPES['銀丸'].rank;
    return {
        medalUp, scoreUp, badDown, songsUp, count: changes.length, all: changes,
        newNormal: medalUp.filter(c => !isNormal(c.om) && isNormal(c.nm)).length,
        newFc: medalUp.filter(c => !isFc(c.om) && isFc(c.nm)).length
    };
}

// ポックラのその日の値と、その前の記録（day を省くと今日）
function getDayPokkuraChange(day) {
    const list = getPokkuraHistList();
    const key = localDateKey(day === undefined ? Date.now() : day);
    const cur = list.find(e => e.day === key);
    if (!cur) return null;
    const prev = list.filter(e => e.day < key).pop() || null;
    const val = e => (e && typeof e.pc === 'number' ? e.pc : e && typeof e.c === 'number' ? e.c : null);
    return { cur: val(cur), prev: val(prev), official: typeof cur.pc === 'number' };
}
function getTodayPokkuraChange() { return getDayPokkuraChange(); }

// 見ている日（その日の0時）
let dailySummaryDay = null;
function getDailySummaryDay() { return dailySummaryDay === null ? dayStartOf(Date.now()) : dailySummaryDay; }

// 更新履歴のある日（0時の時刻、古い順）
function getHistoryDays() {
    const days = new Set();
    Object.values(getHistoryRecords()).forEach(e => { if (e && typeof e.t === 'number') days.add(dayStartOf(e.t)); });
    return [...days].sort((a, b) => a - b);
}

// auto：公式データを反映したあとに自動で開くとき（今日の更新が無ければ開かない）
function openDailySummary(auto) {
    dailySummaryDay = dayStartOf(Date.now());
    if (auto && getTodayChanges().count === 0) return;
    renderDailySummary();
    document.getElementById('daily-summary-modal').style.display = 'flex';
}

// ‹ ›：更新のある前の日・次の日へ（次は今日まで）
function moveDailySummaryDay(step) {
    const cur = getDailySummaryDay();
    const days = getHistoryDays();
    const today = dayStartOf(Date.now());
    let next = null;
    if (step < 0) next = days.filter(d => d < cur).pop();
    else next = days.find(d => d > cur && d <= today);
    if (next === undefined || next === null) next = step > 0 ? today : null;
    if (next === null || next === cur || next > today) return;
    dailySummaryDay = next;
    renderDailySummary();
}

// 日付の欄から選ぶ（今日より後は選べない）
function setDailySummaryDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!m) return;
    const day = new Date(+m[1], +m[2] - 1, +m[3]).getTime();
    if (day > dayStartOf(Date.now())) return;
    dailySummaryDay = day;
    renderDailySummary();
}

function renderDailySummary() {
    const day = getDailySummaryDay();
    const today = dayStartOf(Date.now());
    const days = getHistoryDays();
    const sum = getDayChanges(day);
    const title = document.getElementById('daily-summary-title');
    if (title) title.textContent = day === today ? '今日のまとめ' : 'この日のまとめ';
    const nav = `<div class="ds-nav">
        <button type="button" class="ds-nav-btn" onclick="moveDailySummaryDay(-1)" aria-label="更新のある前の日"${days.some(d => d < day) ? '' : ' disabled'}>‹</button>
        <input type="date" class="ds-nav-date" value="${localDateKey(day)}" max="${localDateKey(today)}" onchange="setDailySummaryDate(this.value)" aria-label="日付を選ぶ">
        <button type="button" class="ds-nav-btn" onclick="moveDailySummaryDay(1)" aria-label="更新のある次の日"${day < today ? '' : ' disabled'}>›</button>
        ${day < today ? '<button type="button" class="ds-nav-today" onclick="setDailySummaryDate(\'' + localDateKey(today) + '\')">今日</button>' : ''}
    </div>`;
    const body = sum.count > 0 ? buildDailySummaryHtml(sum, getDayPokkuraChange(day))
        : `<div class="ds-empty">${day === today ? '今日はまだ更新がありません。' : 'この日の更新はありません。'}‹ で更新のある日に移れます。</div>`;
    document.getElementById('daily-summary-body').innerHTML = nav + body;
    const imgBtn = document.getElementById('btn-daily-summary-image');
    if (imgBtn) imgBtn.disabled = sum.count === 0;
}

function closeDailySummary() {
    document.getElementById('daily-summary-modal').style.display = 'none';
}

// 今日のまとめの数（0 のものは外す）：[[数, 名前]]
function getDailySummaryTiles(sum) {
    return [[(sum.goals || []).length, '目標達成'], [sum.medalUp.length, 'メダル更新'], [sum.scoreUp.length, 'スコア更新'], [sum.badDown.length, 'BAD更新'], [sum.newNormal, '新規クリア'], [sum.newFc, '初フルコン']].filter(([n]) => n > 0);
}

function buildDailySummaryHtml(sum, pk) {
    const d = new Date(sum.day !== undefined ? sum.day : Date.now());
    // 0 のものは出さない
    const tiles = getDailySummaryTiles(sum).map(([n, label]) => `<div><b>${n}</b><span>${label}</span></div>`).join('');
    let html = `<div class="ds-date">${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}（${HISTORY_WEEKDAYS[d.getDay()]}）</div>
        ${tiles ? `<div class="ds-stats">${tiles}</div>` : ''}`;
    // メダルの合計（ポップンクラスの上）
    if (sum.medalTotals && sum.medalTotals.length > 0) {
        // 1レベル1行で、メダルを横に並べる（入りきらなければ折り返す）
        html += `<div class="ds-sub">メダルの合計</div><div class="ds-mtotal">` + groupMedalTotalsByLevel(sum.medalTotals).map(g =>
            `<div class="ds-mtotal-row"><span class="level-badge">${escapeHtml(g.lv)}</span><span class="ds-mtotal-items">${g.rows.map(r =>
                `<span class="ds-mtotal-item">${historyMedalHtml(r.medal)}<span class="ds-mtotal-num"><b>${r.have}</b>/${r.total}</span><span class="ds-mtotal-up">+${r.up}</span></span>`).join('')}</span></div>`
        ).join('') + `</div>`;
    }
    if (pk && pk.cur !== null) {
        const diff = pk.prev !== null ? pk.cur - pk.prev : null;
        html += `<div class="ds-pokkura">ポップンクラス <b>${pk.cur.toFixed(2)}</b>${diff !== null ? `<span class="${diff >= 0 ? 'up' : 'down'}">（${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(2)}）</span>` : ''}${pk.official ? '' : '<small>計算値</small>'}</div>`;
    }
    if (sum.goals && sum.goals.length > 0) {
        html += `<div class="ds-sub">🎉 目標達成</div>` + sum.goals.map(g => `<div class="ds-row ds-goal"><span class="ds-title">${escapeHtml(goalTitle(g.goal))}</span><span class="ds-score">${escapeHtml(goalCountText(g.progress))}</span></div>`).join('');
    }
    // 1曲1行：曲名の下にスコア・BAD、右にメダル（良くなったものだけ）
    if (sum.songsUp && sum.songsUp.length > 0) {
        html += `<div class="ds-sub">更新した曲</div>` + sum.songsUp.map(c => {
            const sub = [];
            // スコアは「変わる前→変わった後 +差」（初めては「変わった後 初」）
            if (c.score) sub.push(`<span class="ds-score">${c.os !== null ? `${c.os.toLocaleString('ja-JP')}→` : ''}${c.ns.toLocaleString('ja-JP')}${c.diff !== null ? `<small>+${c.diff.toLocaleString('ja-JP')}</small>` : '<small>初</small>'}</span>`);
            else if (c.scoreDown) sub.push(`<span class="ds-score">${c.os.toLocaleString('ja-JP')}→${c.ns.toLocaleString('ja-JP')}<small class="ds-down">−${Math.abs(c.diff).toLocaleString('ja-JP')}</small></span>`);
            if (c.bad) sub.push(`<span class="ds-score ds-bad">BAD ${c.ob !== null ? `${c.ob}→` : ''}${c.nb}</span>`);
            const medal = c.medal ? `<span class="hist-change">${historyMedalHtml(c.om)}<span class="hist-arrow">→</span>${historyMedalHtml(c.nm)}</span>` : '';
            return `<div class="ds-row"><span class="level-badge">${escapeHtml(c.lv)}</span><span class="ds-main"><span class="ds-title">${escapeHtml(c.ti)}</span>${sub.length ? `<span class="ds-subline">${sub.join('')}</span>` : ''}</span>${medal}</div>`;
        }).join('');
    }
    return html;
}
