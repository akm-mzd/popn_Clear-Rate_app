// ==========================================
// fc-import.js
// フルコン難易度表の画像を取り込む（管理者）。画像を1曲ずつのバナーに切り分け、アプリのバナーと比べて曲を合わせ、
// 確かめてから曲データの fc = { v: 値, o: 同じ値の中の順番 } に入れる（表示は table.js の renderFcGrid）。
// 画像を読むのは取り込むときだけ。読んだ結果は楽曲リストとしてクラウドに保存する。
// ==========================================

// 段の並びの決まった形：1.1×1段、1.0〜0.1×2段ずつ、0.0×1段、-0.1〜-0.9×2段ずつ、-1.0×1段（41段）
const FC_ROW_PATTERN = (() => {
    const list = [1.1];
    for (let i = 10; i >= 1; i--) list.push(i / 10, i / 10);
    list.push(0);
    for (let i = 1; i <= 9; i++) list.push(-i / 10, -i / 10);
    list.push(-1.0);
    return list;
})();
const FC_CROP_W = 0.7;       // バナーの左から何割で比べるか（右側は白くぼけている）
const FC_PICK_MIN = 0.45;    // これより似ていなければ「要確認」（曲を選ばない）
const FC_CAND_COUNT = 5;
const fcVectorCache = new Map(); // 曲ID → バナーの左 70% の数の並び

let fcImport = null; // { images: [{ name, canvas, rows: [{ v, cells: [{ x, y, w, h, thumb, vec, cands, pick }] }], level }], progress }

// ---------- 切り分け ----------
// 白くない画素か
//   faint：薄い色のバナーも拾う（バナーを探すとき）。見出しの列の右端を探すときは、はっきりした色だけ
function fcIsInk(d, i, faint = true) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return faint ? (mn < 238 || mx - mn > 16) : (mn < 225 || mx - mn > 30);
}

// 画像（ImageData）を段とバナーに切り分ける。戻り値：{ labelRight, rows: [{ y, h, cells: [{ x, y, w, h }] }] }
function segmentFcTable(img) {
    const { width: W, height: H, data: d } = img;
    const ink = (x, y) => fcIsInk(d, (y * W + x) * 4);
    // 1) 左端の見出しの列：左から見て、縦にほとんど白い列が来たところまで
    const top = Math.floor(H * 0.03);
    const colInk = x => { let n = 0; for (let y = top; y < H; y += 2) if (fcIsInk(d, (y * W + x) * 4, false)) n++; return n / ((H - top) / 2); };
    //    （白い隙間がほとんど無い画像もあるので、左の方で一番白い列にする）
    let labelRight = 0, best = 2;
    for (let x = 8; x < Math.max(20, Math.min(90, W * 0.08)); x++) {
        const v = colInk(x);
        if (v < best) { best = v; labelRight = x; }
    }
    if (!labelRight) labelRight = Math.round(W * 0.04);
    // 2) 段：見出しの列より右で、白くない画素の多い横の帯
    const x0 = labelRight + 2;
    const rowInk = new Float32Array(H);
    for (let y = 0; y < H; y++) {
        let n = 0;
        for (let x = x0; x < W; x += 2) if (ink(x, y)) n++;
        rowInk[y] = n / ((W - x0) / 2);
    }
    let runs = [];
    for (let y = 0; y < H; y++) {
        if (rowInk[y] < 0.1) continue;
        const s = y;
        while (y < H && rowInk[y] >= 0.1) y++;
        runs.push({ y: s, h: y - s });
    }
    // 細い隙間でつながったものは1つに
    runs = runs.reduce((acc, r) => {
        const last = acc[acc.length - 1];
        if (last && r.y - (last.y + last.h) <= 2) last.h = r.y + r.h - last.y;
        else acc.push({ ...r });
        return acc;
    }, []).filter(r => r.h >= 20);
    if (runs.length === 0) return { labelRight, rows: [] };
    // 段がくっついて2段分になったものは分ける
    const hs = runs.map(r => r.h).sort((a, b) => a - b);
    const medH = hs[Math.floor(hs.length / 2)];
    const rows = [];
    runs.forEach(r => {
        const k = Math.max(1, Math.round(r.h / medH));
        for (let i = 0; i < k; i++) rows.push({ y: r.y + Math.round(r.h * i / k), h: Math.round(r.h / k) });
    });
    // 3) 列の位置：各段の白くないかたまりの左端を集め、近いものをまとめる
    const segsOf = row => {
        const ys = [row.y + Math.round(row.h * 0.3), row.y + Math.round(row.h * 0.5), row.y + Math.round(row.h * 0.7)];
        const on = x => ys.filter(y => ink(x, y)).length >= 2;
        const segs = [];
        for (let x = x0; x < W; x++) {
            if (!on(x)) continue;
            const s = x;
            let gap = 0, e = x;
            while (x < W && gap <= 6) { if (on(x)) { e = x; gap = 0; } else gap++; x++; }
            if (e - s >= 30) segs.push({ s, e });
        }
        return segs;
    };
    const starts = [];
    rows.forEach(row => { row.segs = segsOf(row); row.segs.forEach(sg => starts.push(sg.s)); });
    starts.sort((a, b) => a - b);
    const clusters = [];
    starts.forEach(x => {
        const c = clusters[clusters.length - 1];
        if (c && x - c.max <= 14) { c.max = x; c.list.push(x); } else clusters.push({ max: x, list: [x] });
    });
    // 列は同じ間隔で並ぶ：一番多い左端（1列目）から、一番多くの左端に当たる間隔を探す
    //   （バナーの中の白いところで切れたかたまりの左端は、間隔に乗らないので外れる）
    clusters.sort((a, b) => b.list.length - a.list.length);
    const first = clusters.length ? clusters[0].list.sort((a, b) => a - b)[Math.floor(clusters[0].list.length / 2)] : x0;
    //   半分の間隔でも同じだけ当たるので、ほとんど（9割）当たる間隔のうち一番広いものにする
    const hitsOf = p => { let hit = 0; starts.forEach(x => { const k = Math.round((x - first) / p); if (Math.abs(x - (first + k * p)) <= 6) hit++; }); return hit; };
    const hits = {};
    let maxHit = 0;
    for (let p = 60; p <= Math.min(320, W / 2); p++) { hits[p] = hitsOf(p); maxHit = Math.max(maxHit, hits[p]); }
    let pitch = 0;
    for (let p = Math.floor(Math.min(320, W / 2)); p >= 60; p--) if (hits[p] >= maxHit * 0.9) { pitch = p; break; }
    for (let p = pitch - 1; p >= pitch - 8 && p >= 60; p--) if (hits[p] > hits[pitch]) pitch = p;
    if (!pitch) pitch = W;
    let c0 = first;
    while (c0 - pitch >= x0 - 8) c0 -= pitch;
    const cols = [];
    for (let x = c0; x < W - 30; x += pitch) cols.push(x);
    const bw = Math.max(30, Math.round(pitch * 0.94));
    // 4) 段ごとに、列の位置にバナーがあるか
    // 上の注意書きとくっついた段は、下の方だけにする
    rows.forEach(row => { if (row.h > medH * 1.15) { row.y += row.h - medH; row.h = medH; } });
    rows.forEach(row => {
        row.cells = [];
        cols.forEach(cx => {
            // その列の場所（バナーの左 6 割）に白くない画素がある程度あれば、バナーがある（白っぽいバナーもあるので緩め）
            let n = 0, all = 0;
            for (let k = 1; k <= 5; k++) {
                const y = row.y + Math.round(row.h * k / 6);
                for (let x = cx + 2; x < Math.min(W, cx + pitch * 0.6); x += 3) { all++; if (ink(x, y)) n++; }
            }
            if (all && n / all > 0.1) {
                row.cells.push({ x: cx, y: row.y, w: Math.min(bw, W - cx), h: row.h });
            }
        });
        delete row.segs;
    });
    return { labelRight, cols, pitch, rows: rows.filter(r => r.cells.length > 0) };
}

// 段の値：41段なら決まった形。違うときは、見出しの列の色が変わるところで区切って上から当てる
function guessFcRowValues(img, seg) {
    const n = seg.rows.length;
    if (n === FC_ROW_PATTERN.length) return FC_ROW_PATTERN.slice();
    const { width: W, data: d } = img;
    const colorOf = row => {
        let r = 0, g = 0, b = 0, c = 0;
        for (let y = row.y + 2; y < row.y + row.h - 2; y += 2) {
            for (let x = 2; x < Math.max(3, seg.labelRight - 2); x += 2) {
                const i = (y * W + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; c++;
            }
        }
        return [r / c, g / c, b / c];
    };
    const values = [];
    let gi = 0, prev = null;
    const groupValues = FC_VALUES;
    seg.rows.forEach((row, i) => {
        const col = colorOf(row);
        if (prev && Math.hypot(col[0] - prev[0], col[1] - prev[1], col[2] - prev[2]) > 25) gi++;
        prev = col;
        values.push(groupValues[Math.min(gi, groupValues.length - 1)]);
    });
    return values;
}

// ---------- 取り込み：画像を選ぶ → 切り分け → 曲合わせ → 確認 ----------
function openFcImportPicker() {
    if (!checkAdminAuth()) return;
    document.getElementById('fc-import-file').click();
}

function loadFcImageFile(file) {
    return new Promise(resolve => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const cv = document.createElement('canvas');
            cv.width = img.naturalWidth; cv.height = img.naturalHeight;
            cv.getContext('2d').drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            resolve(cv);
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        img.src = url;
    });
}

async function onFcImportFiles(input) {
    const files = Array.from(input.files || []);
    input.value = '';
    if (files.length === 0) return;
    const state = { images: [], progress: { done: 0, total: 0, text: '画像を切り分けています…' } };
    fcImport = state;
    document.getElementById('fc-import-modal').style.display = 'flex';
    renderFcImport();
    for (const file of files) {
        const canvas = await loadFcImageFile(file);
        if (!canvas) { state.images.push({ name: file.name, error: '画像を読めませんでした' }); continue; }
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        const seg = segmentFcTable(data);
        const values = guessFcRowValues(data, seg);
        const rows = seg.rows.map((r, i) => ({
            v: values[i],
            cells: r.cells.map(c => {
                const th = document.createElement('canvas');
                th.width = 120; th.height = Math.max(1, Math.round(120 * c.h / c.w));
                th.getContext('2d').drawImage(canvas, c.x, c.y, c.w, c.h, 0, 0, th.width, th.height);
                return { ...c, thumb: th.toDataURL('image/jpeg', 0.8), vec: imageToBannerVector(canvas, c.x, c.y, c.w * FC_CROP_W, c.h), cands: [], pick: '' };
            })
        }));
        state.images.push({ name: file.name, rows, level: '' });
    }
    if (fcImport !== state) return;
    await loadFcSongVectors(state);
    if (fcImport !== state) return;
    state.images.forEach(im => { if (im.rows) { im.level = guessFcImageLevel(im); matchFcImage(im); } });
    state.progress = null;
    renderFcImport();
}

// アプリの Lv46〜48 の曲のバナー（左 70%）を読む
async function loadFcSongVectors(state) {
    const targets = songs.filter(s => FC_LEVELS.includes(String(s.level)) && isImageSrc(s.bannerUrl) && !fcVectorCache.has(s.id));
    state.progress = { done: 0, total: targets.length, text: 'アプリのバナーを読み込んでいます' };
    renderFcImport();
    let next = 0;
    const worker = async () => {
        while (next < targets.length && fcImport === state) {
            const s = targets[next++];
            const src = s.bannerUrl.startsWith('data:') ? s.bannerUrl : toImageProxyUrl(s.bannerUrl);
            fcVectorCache.set(s.id, await loadBannerVector(src, FC_CROP_W));
            state.progress.done++;
            if (state.progress.done % 10 === 0) renderFcImport();
        }
    };
    await Promise.all(Array.from({ length: BANNER_LOAD_CONCURRENCY }, worker));
}

function fcCellsOf(im) {
    return im.rows ? im.rows.flatMap(r => r.cells) : [];
}

// 画像ごとのレベル：各バナーの一番似ている曲の似ている度合いの平均が、一番高いレベル
function guessFcImageLevel(im) {
    let best = FC_LEVELS[0], bestScore = -1;
    FC_LEVELS.forEach(lv => {
        const vecs = songs.filter(s => String(s.level) === lv).map(s => fcVectorCache.get(s.id)).filter(Boolean);
        if (vecs.length === 0) return;
        let sum = 0, n = 0;
        fcCellsOf(im).forEach(c => { if (!c.vec) return; sum += Math.max(...vecs.map(v => bannerSimilarity(c.vec, v))); n++; });
        const score = n ? sum / n : -1;
        if (score > bestScore) { bestScore = score; best = lv; }
    });
    return best;
}

// そのレベルの曲と合わせる。似ている順に、まだ使っていない曲を当てる（1曲は1か所だけ）
function matchFcImage(im) {
    const list = songs.filter(s => String(s.level) === String(im.level) && fcVectorCache.get(s.id));
    const cells = fcCellsOf(im);
    const pairs = [];
    cells.forEach((c, ci) => {
        const sims = c.vec ? list.map(s => ({ id: s.id, sim: bannerSimilarity(c.vec, fcVectorCache.get(s.id)) })) : [];
        sims.sort((a, b) => b.sim - a.sim);
        c.cands = sims.slice(0, FC_CAND_COUNT);
        c.pick = '';
        c.sim = 0;
        sims.forEach(x => { if (x.sim >= FC_PICK_MIN) pairs.push({ ci, ...x }); });
    });
    pairs.sort((a, b) => b.sim - a.sim);
    const used = new Set();
    pairs.forEach(p => {
        const c = cells[p.ci];
        if (c.pick || used.has(p.id)) return;
        c.pick = p.id; c.sim = p.sim; used.add(p.id);
        if (!c.cands.some(x => x.id === p.id)) c.cands.push({ id: p.id, sim: p.sim });
    });
}

function setFcImageLevel(i, level) {
    const im = fcImport && fcImport.images[i];
    if (!im) return;
    im.level = level;
    matchFcImage(im);
    renderFcImport();
}

function setFcRowValue(i, r, value) {
    const im = fcImport && fcImport.images[i];
    if (!im || !im.rows[r]) return;
    im.rows[r].v = Math.round(parseFloat(value) * 10) / 10;
}

function setFcCellPick(i, r, c, id) {
    const im = fcImport && fcImport.images[i];
    const cell = im && im.rows[r] && im.rows[r].cells[c];
    if (!cell) return;
    // 同じ曲を別の場所で選んでいたら、そちらは外す
    if (id) fcCellsOf(im).forEach(x => { if (x !== cell && x.pick === id) x.pick = ''; });
    cell.pick = id;
    renderFcImport();
}

function closeFcImport() {
    fcImport = null;
    document.getElementById('fc-import-modal').style.display = 'none';
}

function renderFcImport() {
    const state = fcImport;
    const box = document.getElementById('fc-import-body');
    const saveBtn = document.getElementById('fc-import-save');
    if (!state || !box) return;
    if (state.progress) {
        const p = state.progress;
        box.innerHTML = `<div class="fc-progress">${escapeHtml(p.text)}${p.total ? `（${p.done} / ${p.total}）` : ''}</div>`;
        saveBtn.disabled = true;
        return;
    }
    saveBtn.disabled = !state.images.some(im => im.rows && im.rows.length);
    const songById = new Map(songs.map(s => [s.id, s]));
    const valueOptions = sel => FC_VALUES.map(v => `<option value="${v}"${Math.abs(v - sel) < 0.001 ? ' selected' : ''}>${v > 1.05 ? '別格 ' : ''}${formatFcValue(v)}</option>`).join('');
    const levelCount = {};
    state.images.forEach(im => { if (im.level) levelCount[im.level] = (levelCount[im.level] || 0) + 1; });
    box.innerHTML = state.images.map((im, i) => {
        if (!im.rows) return `<div class="fc-img"><div class="fc-img-head">${escapeHtml(im.name)}：${escapeHtml(im.error || '')}</div></div>`;
        const cells = fcCellsOf(im);
        const picked = new Set(cells.map(c => c.pick).filter(Boolean));
        const unsure = cells.filter(c => !c.pick).length;
        const notIn = songs.filter(s => String(s.level) === String(im.level) && !picked.has(s.id)).length;
        const rowsHtml = im.rows.map((row, r) => {
            const cellHtml = row.cells.map((c, ci) => {
                const song = c.pick ? songById.get(c.pick) : null;
                const opts = c.cands.map(x => {
                    const s = songById.get(x.id);
                    return s ? `<option value="${escapeHtml(x.id)}"${x.id === c.pick ? ' selected' : ''}>${escapeHtml(s.title)}（${Math.round(x.sim * 100)}）</option>` : '';
                }).join('');
                const songBanner = song && safeUrl(song.bannerUrl, true) ? `<img class="fc-cell-song" src="${escapeHtml(safeUrl(song.bannerUrl, true))}" alt="${escapeHtml(song.title)}">` : '';
                return `<div class="fc-cell${c.pick ? '' : ' fc-cell-unsure'}">
                    <img class="fc-cell-thumb" src="${escapeHtml(c.thumb)}" alt="">
                    ${songBanner}
                    <select onchange="setFcCellPick(${i}, ${r}, ${ci}, this.value)"><option value="">${c.pick ? '合わない（入れない）' : '要確認：曲を選ぶ'}</option>${opts}</select>
                </div>`;
            }).join('');
            return `<div class="fc-row">
                <div class="fc-row-head"><select onchange="setFcRowValue(${i}, ${r}, this.value)" aria-label="値">${valueOptions(row.v)}</select></div>
                <div class="fc-row-cells">${cellHtml}</div>
            </div>`;
        }).join('');
        return `<div class="fc-img">
            <div class="fc-img-head">
                <span class="fc-img-name">${escapeHtml(im.name)}</span>
                <label>レベル <select onchange="setFcImageLevel(${i}, this.value)">${FC_LEVELS.map(lv => `<option value="${lv}"${lv === String(im.level) ? ' selected' : ''}>${lv}</option>`).join('')}</select></label>
                <span class="fc-img-stat">${im.rows.length}段・${cells.length}曲${unsure ? `・<b>要確認 ${unsure}</b>` : ''}・このレベルで表に載らない曲 ${notIn}${levelCount[im.level] > 1 ? '・<b>同じレベルの画像が2枚以上あります（後の画像が使われます）</b>' : ''}</span>
            </div>
            ${rowsHtml}
        </div>`;
    }).join('');
}

// 保存：取り込んだレベルの曲は fc を付け直す（表に載らない曲からは消す）
async function saveFcImport() {
    const state = fcImport;
    if (!state) return;
    const byLevel = {};
    state.images.forEach(im => { if (im.rows && im.level) byLevel[im.level] = im; });
    const levels = Object.keys(byLevel);
    if (levels.length === 0) return;
    if (!confirm(`Lv${levels.join('・')} のフルコン難易度を、この内容で入れ直します。よろしいですか？`)) return;
    let n = 0;
    levels.forEach(lv => {
        const im = byLevel[lv];
        const assigned = new Map();
        const counter = {};
        im.rows.forEach(row => {
            const key = String(row.v);
            row.cells.forEach(c => {
                if (!c.pick || assigned.has(c.pick)) return;
                counter[key] = (counter[key] || 0);
                assigned.set(c.pick, { v: row.v, o: counter[key]++ });
            });
        });
        songs.forEach(s => {
            if (String(s.level) !== lv) return;
            if (assigned.has(s.id)) { s.fc = assigned.get(s.id); n++; } else delete s.fc;
        });
    });
    closeFcImport();
    renderTable();
    showToast('toast-eagate', `フルコン難易度を入れました（${n}曲）`, '#4caf50', 3000);
    await saveToCloud(true);
}
