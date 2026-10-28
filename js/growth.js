// ==========================================
// growth.js
// 記録の振り返り。
//   ・伸びのグラフ（統計シートの各ページ）：更新履歴から過去のクリア数・スコア平均を戻して、日・週・月ごとの折れ線に
//   ・ポックラの記録（pokkuraHistRecords：公式データを取り込んだ日ごとに1件）
//   ・属性別（統計シートの各ページ）：属性ごとのクリア率・スコア平均。低い順（苦手）
//   ・この曲の記録（メダルを選ぶ画面）：その曲の更新履歴とスコアの線
//   ・今日のまとめ（公式データを取り込んだあと・画像シート）：今日上がったメダル・スコア・ポックラ
// ==========================================

const GROWTH_UNITS = { day: '日', week: '週', month: '月' };
const GROWTH_MAX_POINTS = 30;   // グラフの点は直近この数まで
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

// 区切りの終わり（その日・その週（日曜まで）・その月の最後の時刻の次）
function growthBucketEnd(t, unit) {
    const d = new Date(t);
    if (unit === 'month') return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (unit === 'week') day.setDate(day.getDate() + (7 - day.getDay()) % 7);
    day.setDate(day.getDate() + 1);
    return day.getTime();
}

function growthBucketLabel(end, unit) {
    const d = new Date(end - 1);
    if (unit === 'month') return `${d.getFullYear() % 100}/${d.getMonth() + 1}`;
    if (unit === 'week') {
        const s = new Date(d); s.setDate(s.getDate() - 6);
        return `${s.getMonth() + 1}/${s.getDate()}〜`;
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
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
        points.push({ end, label: growthBucketLabel(end, unit), normal, easy, avg: cnt > 0 ? Math.round(sum / cnt) : null });
    });
    return { points: points.slice(-GROWTH_MAX_POINTS), total, since: events[0].t };
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
        const p = { end, label: growthBucketLabel(end, unit), pc: typeof e.pc === 'number' ? e.pc : null, c: typeof e.c === 'number' ? e.c : null };
        if (last && last.end === end) points[points.length - 1] = p; else points.push(p);
    });
    return points.slice(-GROWTH_MAX_POINTS);
}

// ---------- 折れ線グラフ（SVG） ----------
//   points: [{ label, ... }]、series: [{ key, name, color }]、format: 値の文字
//   integer：曲数など整数の値（目盛りに小数を出さない。0 より下に広げない）
function buildLineChartSvg(points, series, format = v => String(v), integer = false) {
    const W = 320, H = 150, L = 40, R = 10, T = 10, B = 24;
    const values = [];
    points.forEach(p => series.forEach(s => { if (typeof p[s.key] === 'number') values.push(p[s.key]); }));
    if (values.length === 0) return '';
    let lo = Math.min(...values), hi = Math.max(...values);
    if (lo === hi) {
        hi += 1;
        if (!(integer && lo <= 0)) lo -= 1;
    }
    const ticks = integer && hi - lo < 2 ? [hi, lo] : [hi, (hi + lo) / 2, lo];
    const pad = (hi - lo) * 0.08;
    const min = lo - pad, max = hi + pad;
    const x = i => L + (points.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (points.length - 1));
    const y = v => T + (max - v) / (max - min) * (H - T - B);
    let svg = `<svg class="gr-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(series.map(s => s.name).join('・'))}の推移">`;
    // 目盛り（上・真ん中・下）
    ticks.forEach(v => {
        svg += `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="gr-grid"/>`;
        svg += `<text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" class="gr-axis" text-anchor="end">${escapeHtml(format(Math.round(v * 100) / 100))}</text>`;
    });
    // 横軸の文字（最初・真ん中・最後）
    const labelIdx = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
    labelIdx.forEach(i => {
        const anchor = points.length === 1 ? 'middle' : i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
        svg += `<text x="${x(i).toFixed(1)}" y="${H - 6}" class="gr-axis" text-anchor="${anchor}">${escapeHtml(points[i].label)}</text>`;
    });
    series.forEach(s => {
        const pts = points.map((p, i) => typeof p[s.key] === 'number' ? `${x(i).toFixed(1)},${y(p[s.key]).toFixed(1)}` : null).filter(Boolean);
        if (pts.length > 1) svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
        points.forEach((p, i) => {
            if (typeof p[s.key] !== 'number') return;
            svg += `<circle cx="${x(i).toFixed(1)}" cy="${y(p[s.key]).toFixed(1)}" r="${points.length > 15 ? 2 : 3}" fill="${s.color}"><title>${escapeHtml(`${p.label} ${s.name}：${format(p[s.key])}`)}</title></circle>`;
        });
    });
    return svg + '</svg>';
}

function buildChartLegendHtml(series, last) {
    return `<div class="gr-legend">${series.map(s => `<span><i style="background: ${s.color};"></i>${escapeHtml(s.name)}${last && typeof last[s.key] === 'number' ? `<b>${escapeHtml(s.format ? s.format(last[s.key]) : String(last[s.key]))}</b>` : ''}</span>`).join('')}</div>`;
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
        const clearSeries = [
            { key: 'normal', name: 'ノーマル以上', color: '#c2185b' },
            { key: 'easy', name: 'イージー以上', color: '#2e9d2a' }
        ];
        body += `<div class="gr-sub">クリア数（${g.total}曲中）</div>${buildChartLegendHtml(clearSeries, last)}${buildLineChartSvg(g.points, clearSeries, v => `${Math.round(v)}`, true)}`;
        if (g.points.some(p => p.avg !== null)) {
            const avgSeries = [{ key: 'avg', name: 'スコア平均', color: '#1565c0', format: v => Math.round(v).toLocaleString('ja-JP') }];
            body += `<div class="gr-sub">スコア平均</div>${buildChartLegendHtml(avgSeries, last)}${buildLineChartSvg(g.points, avgSeries, v => Math.round(v).toLocaleString('ja-JP'))}`;
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
        body += pk ? `${buildChartLegendHtml(pkSeries, pk[pk.length - 1])}${buildLineChartSvg(pk, pkSeries, v => Number(v).toFixed(2))}`
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

// 苦手な属性（曲が3曲以上で、クリア率が一番低いもの。全部クリアしていればなし）
function getWeakAttrs(songList) {
    const list = getAttrStats(songList).filter(r => r.total >= ATTR_MIN_SONGS && r.rate < 1);
    return list.length > 0 ? list.filter(r => r.rate === list[0].rate).map(r => r.a) : [];
}

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
    return `<section class="ns-card at-card"><div class="ns-card-title">属性別<span class="ns-card-sub">ノーマルクリア率の低い順・押すと絞り込み</span></div>
        <div class="ns-table-wrap"><table class="ns-table at-table"><thead><tr><th>属性</th><th>クリア</th><th>クリア率</th><th>スコア平均</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function filterByAttr(attr) {
    setFilterValues('filter-attr', [attr]);
    if (typeof closeNewUiSheet === 'function') closeNewUiSheet(); else toggleMenu(false);
    renderTable();
}

// ---------- この曲の記録（メダルを選ぶ画面） ----------
let songHistoryShowAll = false;

function getSongHistory(id) {
    return Object.values(getHistoryRecords()).filter(e => e && e.id === id && typeof e.t === 'number').sort((a, b) => b.t - a.t);
}

function renderSongHistoryBox(id, showAll) {
    const box = document.getElementById('song-history-box');
    if (!box) return;
    if (typeof showAll === 'boolean') songHistoryShowAll = showAll;
    const list = getSongHistory(id);
    if (list.length === 0) {
        box.innerHTML = '<div class="sh-title">この曲の記録</div><div class="sh-empty">まだ記録がありません</div>';
        return;
    }
    // スコアの線（古い順。2回以上スコアがあるとき）
    const scorePoints = list.slice().reverse().filter(e => 'ns' in e && e.ns !== null)
        .map(e => { const d = new Date(e.t); return { label: `${d.getMonth() + 1}/${d.getDate()}`, s: e.ns }; });
    const chart = scorePoints.length >= 2
        ? buildLineChartSvg(scorePoints, [{ key: 's', name: 'スコア', color: '#1565c0' }], v => Math.round(v).toLocaleString('ja-JP')) : '';
    const shown = songHistoryShowAll ? list : list.slice(0, SONG_HISTORY_SHOW);
    const rows = shown.map(e => {
        const d = new Date(e.t);
        const parts = [];
        if ('nm' in e) parts.push(`<span class="hist-change">${historyMedalHtml(e.om)}<span class="hist-arrow">→</span>${historyMedalHtml(e.nm)}</span>`);
        if ('ns' in e) parts.push(historyScoreHtml(e.os, e.ns));
        return `<div class="sh-row"><span class="sh-date">${d.getFullYear() % 100}/${d.getMonth() + 1}/${d.getDate()}</span><span class="sh-body">${parts.join('')}</span></div>`;
    }).join('');
    const more = list.length > SONG_HISTORY_SHOW && !songHistoryShowAll
        ? `<button type="button" class="sh-more" onclick="renderSongHistoryBox('${jsStringAttr(id)}', true)">もっと見る（全${list.length}件）</button>` : '';
    box.innerHTML = `<div class="sh-title">この曲の記録<span>${list.length}件</span></div>${chart ? `<div class="sh-chart">${chart}</div>` : ''}${rows}${more}`;
}

// ---------- 今日のまとめ ----------
//   今日（0時から）の更新履歴を曲ごとにまとめる（その日の最初の「変更前」と最後の「変更後」）
function getTodayChanges() {
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const list = Object.values(getHistoryRecords()).filter(e => e && typeof e.t === 'number' && e.t >= since.getTime()).sort((a, b) => a.t - b.t);
    const bySong = new Map();
    list.forEach(e => {
        const c = bySong.get(e.id) || { id: e.id, ti: e.ti, lv: e.lv };
        if ('nm' in e) { if (!('om' in c)) c.om = e.om || ''; c.nm = e.nm || ''; }
        if ('ns' in e) { if (!('os' in c)) c.os = toScoreNum(e.os); c.ns = toScoreNum(e.ns); }
        bySong.set(e.id, c);
    });
    const rankOf = k => (MEDAL_TYPES[k] || MEDAL_TYPES['']).rank;
    const changes = [...bySong.values()].map(c => ({ ...c, song: songs.find(s => s.id === c.id) || null }));
    const medalUp = changes.filter(c => 'nm' in c && rankOf(c.nm) > rankOf(c.om)).sort((a, b) => rankOf(b.nm) - rankOf(a.nm));
    const scoreUp = changes.filter(c => 'ns' in c && c.ns !== null && (c.os === null || c.ns > c.os))
        .map(c => ({ ...c, diff: c.os === null ? null : c.ns - c.os })).sort((a, b) => (b.ns - a.ns));
    const isNormal = k => !!(MEDAL_TYPES[k] || {}).isNormalClear;
    const isFc = k => rankOf(k) >= MEDAL_TYPES['銀丸'].rank;
    return {
        medalUp, scoreUp, count: changes.length,
        newNormal: medalUp.filter(c => !isNormal(c.om) && isNormal(c.nm)).length,
        newFc: medalUp.filter(c => !isFc(c.om) && isFc(c.nm)).length
    };
}

// ポックラの今日の値と、その前の記録
function getTodayPokkuraChange() {
    const list = getPokkuraHistList();
    const today = localDateKey(Date.now());
    const cur = list.find(e => e.day === today);
    if (!cur) return null;
    const prev = list.filter(e => e.day < today).pop() || null;
    const val = e => (e && typeof e.pc === 'number' ? e.pc : e && typeof e.c === 'number' ? e.c : null);
    return { cur: val(cur), prev: val(prev), official: typeof cur.pc === 'number' };
}

function openDailySummary(auto) {
    const sum = getTodayChanges();
    if (sum.count === 0) {
        if (!auto) alert('今日はまだ更新がありません。');
        return;
    }
    document.getElementById('daily-summary-body').innerHTML = buildDailySummaryHtml(sum, getTodayPokkuraChange());
    document.getElementById('daily-summary-modal').style.display = 'flex';
}

function closeDailySummary() {
    document.getElementById('daily-summary-modal').style.display = 'none';
}

function buildDailySummaryHtml(sum, pk) {
    const d = new Date();
    let html = `<div class="ds-date">${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}（${HISTORY_WEEKDAYS[d.getDay()]}）</div>
        <div class="ds-stats">
            <div><b>${sum.medalUp.length}</b><span>メダルが上がった</span></div>
            <div><b>${sum.scoreUp.length}</b><span>スコアが上がった</span></div>
            <div><b>${sum.newNormal}</b><span>初クリア</span></div>
            <div><b>${sum.newFc}</b><span>初フルコン</span></div>
        </div>`;
    if (pk && pk.cur !== null) {
        const diff = pk.prev !== null ? pk.cur - pk.prev : null;
        html += `<div class="ds-pokkura">ポップンクラス <b>${pk.cur.toFixed(2)}</b>${diff !== null ? `<span class="${diff >= 0 ? 'up' : 'down'}">（${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(2)}）</span>` : ''}${pk.official ? '' : '<small>計算値</small>'}</div>`;
    }
    if (sum.medalUp.length > 0) {
        html += `<div class="ds-sub">メダル</div>` + sum.medalUp.map(c => `<div class="ds-row"><span class="level-badge">${escapeHtml(c.lv)}</span><span class="ds-title">${escapeHtml(c.ti)}</span><span class="hist-change">${historyMedalHtml(c.om)}<span class="hist-arrow">→</span>${historyMedalHtml(c.nm)}</span></div>`).join('');
    }
    if (sum.scoreUp.length > 0) {
        html += `<div class="ds-sub">スコア</div>` + sum.scoreUp.map(c => `<div class="ds-row"><span class="level-badge">${escapeHtml(c.lv)}</span><span class="ds-title">${escapeHtml(c.ti)}</span><span class="ds-score">${c.ns.toLocaleString('ja-JP')}${c.diff !== null ? `<small>+${c.diff.toLocaleString('ja-JP')}</small>` : '<small>初</small>'}</span></div>`).join('');
    }
    return html;
}
