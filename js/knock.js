// ==========================================
// knock.js（table.js から分けたもの）
// 乱ノック表・S乱ノック表（曲合わせ・ページ・マーク・手でつなぐ・アプリに無い譜面のバナー）
// ==========================================
// ---------- 乱ノック表・S乱ノック表（ノック表のボタン。切り替えタブで乱⇔S乱） ----------
// データは knock-data.js の KNOCK_TABLES（強い段が先）。表示レベルに関係なく全部を出す。
// マークは knockRecords（ユーザーごと・クラウド保存）{ 'ran:表の書き方' | 'sran:表の書き方': 'c'（クリア）| 'e'（イージークリア） }。未クリアは記録なし
const KNOCK_MARKS = {
    c: { label: 'クリア', img: 'images/knock/clear.jpg' },
    e: { label: 'イージークリア', img: 'images/knock/Easyclear.jpg?v=2' },
    '': { label: '未クリア', img: 'images/knock/fail.jpg' }
};
const KNOCK_LABEL_COLORS = { ran: [[49, 27, 146], [179, 157, 219]], sran: [[0, 77, 64], [128, 203, 196]] };

function isKnockView() {
    return viewMode === 'knock' || viewMode === 'sknock';
}

function getKnockRecords(user = currentUser) {
    if (!allUsersData[user]) allUsersData[user] = emptyUser();
    if (!allUsersData[user].knockRecords) allUsersData[user].knockRecords = {};
    return allUsersData[user].knockRecords;
}

function getKnockKey(tableKey, item) {
    return `${KNOCK_TABLES[tableKey].prefix}:${item.t}`;
}

function getKnockMark(key) {
    const v = getKnockRecords()[key];
    return v === 'c' || v === 'e' ? v : '';
}

// アプリのジャンル名の末尾の譜面「(EX)」「(H)」など（アプリのジャンル名には付いていることが多い）
const KNOCK_DIFF_SUFFIX_RE = /\s*[(（](EX|H|N|E)[)）]\s*$/i;

// アプリの曲を引けるようにする。full＝ジャンル名そのまま・曲名、base＝ジャンル名から譜面を外したもの・曲名（normalizeSongText でそろえる）
function buildKnockSongIndex() {
    const full = new Map(), base = new Map();
    const add = (map, k, s) => { if (!k) return; if (!map.has(k)) map.set(k, []); if (!map.get(k).includes(s)) map.get(k).push(s); };
    const links = new Map(); // 手でつないだ譜面（曲データの knock：['ran:表の書き方', …]）
    songs.forEach(s => {
        if (Array.isArray(s.knock)) s.knock.forEach(k => { if (typeof k === 'string') links.set(k, s); });
        add(full, normalizeSongText(s.genre), s);
        add(full, normalizeSongText(s.title), s);
        add(base, normalizeSongText(String(s.genre || '').replace(KNOCK_DIFF_SUFFIX_RE, '')), s);
        add(base, normalizeSongText(s.title), s);
    });
    return { full, base, links };
}

// アプリの曲の譜面（ジャンル名の末尾に書いてあれば EX/H…、無ければ ''）
function getKnockSongDiff(song) {
    const m = String(song.genre || '').match(KNOCK_DIFF_SUFFIX_RE);
    return m ? m[1].toUpperCase() : '';
}

// ノック表の1譜面を、アプリの曲に合わせる（無ければ null）
//   1) 表の書き方そのまま（「サイレント(EX)」）でアプリのジャンル名・曲名と比べる。H 譜面もここで合う
//   2) 無ければ、表の名前（譜面を外したもの）で比べる。アプリ側に別の譜面が書いてある曲は除く
//   S乱の lv は譜面の正規Lv なので 46 未満はアプリに無い（乱の lv は乱を掛けた正規相当なので使わない）
//   UPPER かどうかをそろえ、候補が複数なら lv に一番近い曲
function matchKnockSong(item, index, realLevel) {
    if (realLevel && !(item.lv >= 46)) return null;
    const wantUpper = isUpperText(item.n);
    const lv = knockItemTargetLevel(item);
    const pick = list => {
        const cands = (list || []).filter(s => songSaysUpper(s) === wantUpper);
        if (cands.length === 0) return null;
        return cands.slice().sort((a, b) => Math.abs((parseInt(a.level, 10) || 0) - lv) - Math.abs((parseInt(b.level, 10) || 0) - lv))[0];
    };
    const exact = pick(index.full.get(normalizeSongText(item.t)));
    if (exact) return exact;
    const want = item.d || 'EX';
    return pick((index.base.get(normalizeSongText(item.n)) || []).filter(s => { const d = getKnockSongDiff(s); return d === '' ? want === 'EX' : d === want; }));
}

// H 譜面の曲を、譜面を見ずに名前だけで探す（UPPER はそろえる。EX・譜面の書いていない曲を先に、レベルの近い順）
function matchKnockSongForH(item, index) {
    const wantUpper = isUpperText(item.n);
    const lv = knockItemTargetLevel(item);
    const cands = (index.base.get(normalizeSongText(item.n)) || []).filter(s => songSaysUpper(s) === wantUpper);
    if (cands.length === 0) return null;
    const rank = s => { const d = getKnockSongDiff(s); return d === 'EX' || d === '' ? 0 : 1; };
    return cands.slice().sort((a, b) => (rank(a) - rank(b)) || (Math.abs((parseInt(a.level, 10) || 0) - lv) - Math.abs((parseInt(b.level, 10) || 0) - lv)))[0];
}

// 同じ名前の曲が複数あるときに近さを比べるレベル：表に正規Lv（rl）があればそれ、なければ表の lv
function knockItemTargetLevel(item) {
    return typeof item.rl === 'number' ? item.rl : item.lv;
}

function renderKnockGrid(tableKey) {
    const grid = document.getElementById('diff-grid-view');
    const table = KNOCK_TABLES[tableKey];
    const narrow = isNarrowScreen();
    const COLS = narrow ? 2 : 5;
    lastGridNarrow = narrow;
    const mode = tableKey === 'sran' ? 'sknock' : 'knock';
    const index = buildKnockSongIndex();
    const vertical = getGridVertical(mode);
    const total = { c: 0, e: 0, '': 0 };
    const rows = table.levels.map((lvl, i) => {
        const cells = lvl.items.map(item => {
            const key = getKnockKey(tableKey, item);
            const mark = getKnockMark(key);
            total[mark]++;
            return { item, key, mark };
        });
        return { lvl, cells, i };
    });
    // 数段ずつのページ。今のページの段だけ曲を合わせて描く
    const pages = buildKnockPages(rows);
    const page = Math.min(Math.max(0, getKnockPage(tableKey)), pages.length - 1);
    const n = rows.length;
    const [dark, light] = KNOCK_LABEL_COLORS[tableKey];
    const colorOf = i => '#' + [0, 1, 2].map(c => Math.round(dark[c] + (light[c] - dark[c]) * (n > 1 ? i / (n - 1) : 0)).toString(16).padStart(2, '0')).join('');
    const all = total.c + total.e + total[''];
    let html = `<div class="kn-summary"><b>${escapeHtml(table.name)}</b>
        <span><img src="${KNOCK_MARKS.c.img}" alt="">クリア ${total.c}</span>
        <span><img src="${KNOCK_MARKS.e.img}" alt="">イージー ${total.e}</span>
        <span><img src="${KNOCK_MARKS[''].img}" alt="">未クリア ${total['']}</span>
        <span class="kn-total">全 ${all}譜面</span></div>`;
    html += buildKnockPageBar(tableKey, pages, page);
    html += buildDirectionBar(mode);
    const pageRows = pages[page].rows;
    pageRows.forEach(row => row.cells.forEach(c => {
        // 手でつないだ曲が先。無ければ名前で合わせる
        c.song = index.links.get(c.key) || matchKnockSong(c.item, index, tableKey === 'sran');
        c.linked = index.links.has(c.key);
        // H 譜面：アプリに H 譜面が無くても、同じ曲（EX）があればそのバナーを出す（枠を黄色にして H と分かるように）
        if (!c.song && c.item.d === 'H') c.song = matchKnockSongForH(c.item, index);
    }));
    orderRowsForVertical(pageRows, vertical).forEach(row => {
        const ordered = orderForDirection(row.cells, COLS, getGridDirection(mode), vertical);
        let cellsHtml = '';
        ordered.forEach(c => { cellsHtml += buildKnockCellHtml(c); });
        const cleared = row.cells.filter(c => c.mark).length;
        html += `
            <div class="dg-row">
                <div class="dg-label kn-label" style="background: ${colorOf(row.i)};"><span class="dg-label-cls">${escapeHtml(row.lvl.label)}</span>${row.lvl.sub ? `<span class="dg-label-idx">${escapeHtml(row.lvl.sub)}</span>` : ''}<span class="sg-count">${cleared}/${row.cells.length}</span></div>
                <div class="dg-cells" style="grid-template-columns: repeat(${COLS}, minmax(0, 1fr));">${cellsHtml}</div>
            </div>`;
    });
    grid.innerHTML = html;
    // 今のページのボタンが見えるように、ページの並びを横に動かす
    const on = grid.querySelector('.kn-page.on');
    const bar = grid.querySelector('.kn-pages');
    if (on && bar) bar.scrollLeft = on.offsetLeft - bar.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2;
}

// 段を上（強い段）から順にまとめ、譜面の数が KNOCK_PAGE_SIZE を超えたら次のページ（段の途中では切らない）
const KNOCK_PAGE_SIZE = 50;
function buildKnockPages(rows) {
    const pages = [];
    let cur = null;
    rows.forEach(row => {
        if (!cur || cur.count >= KNOCK_PAGE_SIZE || (cur.count > 0 && cur.count + row.cells.length > KNOCK_PAGE_SIZE * 1.3)) {
            cur = { rows: [], count: 0 };
            pages.push(cur);
        }
        cur.rows.push(row);
        cur.count += row.cells.length;
    });
    return pages.length ? pages : [{ rows: [], count: 0 }];
}

function getKnockPage(tableKey) {
    const n = parseInt(storageGet(`popn_knock_page_${tableKey}`), 10);
    return isNaN(n) ? 0 : n;
}

function setKnockPage(tableKey, page) {
    storageSet(`popn_knock_page_${tableKey}`, String(Math.max(0, page)));
    renderTable();
    const grid = document.getElementById('diff-grid-view');
    if (grid) grid.scrollIntoView({ block: 'start' });
}

// 段の短い名前（「乱●14」→「●14」、「S乱Lv19」→「Lv19」）
function shortKnockLabel(label) {
    return String(label).replace(/^S?乱/, '');
}

function buildKnockPageBar(tableKey, pages, page) {
    if (pages.length <= 1) return '';
    const safeKey = jsStringAttr(tableKey);
    const btns = pages.map((pg, i) => {
        const first = shortKnockLabel(pg.rows[0].lvl.label);
        const last = shortKnockLabel(pg.rows[pg.rows.length - 1].lvl.label);
        const cleared = pg.rows.reduce((n, r) => n + r.cells.filter(c => c.mark).length, 0);
        return `<button type="button" class="kn-page${i === page ? ' on' : ''}" onclick="setKnockPage('${safeKey}', ${i})"${i === page ? ' aria-current="page"' : ''}>
            <span class="kn-page-range">${escapeHtml(first === last ? first : `${first}〜${last}`)}</span><span class="kn-page-count">${cleared}/${pg.count}</span></button>`;
    }).join('');
    return `<div class="kn-pagebar">
        <button type="button" class="kn-page-move" onclick="setKnockPage('${safeKey}', ${page - 1})"${page <= 0 ? ' disabled' : ''} aria-label="前のページ">‹</button>
        <div class="kn-pages">${btns}</div>
        <button type="button" class="kn-page-move" onclick="setKnockPage('${safeKey}', ${page + 1})"${page >= pages.length - 1 ? ' disabled' : ''} aria-label="次のページ">›</button>
    </div>`;
}

function buildKnockCellHtml(c) {
    const m = KNOCK_MARKS[c.mark];
    const song = c.song;
    const markBtn = `<button type="button" class="dg-medal kn-mark" onclick="openKnockMarkModal('${jsStringAttr(c.key)}')" title="${escapeHtml(m.label)}（押して変更）"><img src="${m.img}" alt="${escapeHtml(m.label)}" loading="lazy"></button>`;
    if (!song) {
        return `
                <div class="dg-cell">
                    ${markBtn}
                    ${isKnockLinkable(c) ? buildKnockLinkableHtml(c) : buildKnockNoAppHtml(c)}
                </div>`;
    }
    const bannerSrc = safeUrl(song.bannerUrl, true);
    const bannerInner = bannerSrc
        ? `<img src="${escapeHtml(bannerSrc)}" alt="${escapeHtml(song.title)}" loading="lazy">`
        : `<span class="dg-banner-text">${escapeHtml(song.title)}</span>`;
    return `
                <div class="dg-cell">
                    ${markBtn}
                    <div class="dg-banner-wrap kn-wrap">
                    <a class="dg-banner${c.item.d === 'H' ? ' kn-h' : ''}" data-sid="${escapeHtml(song.id)}" href="${escapeHtml(getWikiUrl(song))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(c.item.t)}（${c.item.d === 'H' ? 'H 譜面・' : ''}攻略wikiを開く）">${bannerInner}${buildMemoMarkHtml(song.id)}</a>
                    ${c.linked ? `<button type="button" class="kn-relink" onclick="openKnockLinkModal('${jsStringAttr(c.key)}')" title="手でつないだ曲（押して変える・外す）" aria-label="つなぐ曲を変える">🔗</button>` : ''}
                    </div>
                </div>`;
}

// マークを選ぶ小さな画面
let knockMarkKey = null;
function openKnockMarkModal(key) {
    knockMarkKey = key;
    const [prefix, ...rest] = key.split(':');
    const name = rest.join(':');
    const cur = getKnockMark(key);
    document.getElementById('knock-mark-title').textContent = `${prefix === 'sran' ? 'S乱' : '乱'}：${name}`;
    document.getElementById('knock-mark-choices').innerHTML = ['c', 'e', ''].map(k => `
        <button type="button" class="kn-choice${cur === k ? ' on' : ''}" onclick="setKnockMark('${k}')">
            <img src="${KNOCK_MARKS[k].img}" alt=""><span>${KNOCK_MARKS[k].label}</span>
        </button>`).join('');
    document.getElementById('knock-mark-modal').style.display = 'flex';
}

function closeKnockMarkModal() {
    knockMarkKey = null;
    document.getElementById('knock-mark-modal').style.display = 'none';
}

function setKnockMark(mark) {
    if (!knockMarkKey) return;
    const recs = getKnockRecords();
    if (mark === 'c' || mark === 'e') recs[knockMarkKey] = mark; else delete recs[knockMarkKey];
    closeKnockMarkModal();
    scheduleAutoSave();
    renderTable();
}

// ---------- ノック表の譜面を、アプリの曲に手でつなぐ（全員共通：曲データの knock に入れて楽曲リストごとクラウド保存。管理者） ----------
//   つなげるのは、アプリにありうる譜面だけ（S乱は正規Lv 46 以上。乱は表の Lv が乱を掛けた正規相当なので全部）
let knockLinkKey = null;

function isKnockLinkable(c) {
    return !(c.item.bpm !== undefined && !(c.item.lv >= 46));
}

function findKnockItem(key) {
    const [prefix, ...rest] = key.split(':');
    const t = rest.join(':');
    const tk = Object.keys(KNOCK_TABLES).find(k => KNOCK_TABLES[k].prefix === prefix);
    if (!tk) return null;
    for (const l of KNOCK_TABLES[tk].levels) for (const it of l.items) if (it.t === t) return { tableKey: tk, item: it };
    return null;
}

function getKnockLinkedSong(key) {
    return songs.find(s => Array.isArray(s.knock) && s.knock.includes(key)) || null;
}

function openKnockLinkModal(key) {
    const found = findKnockItem(key);
    if (!found) return;
    knockLinkKey = key;
    document.getElementById('knock-link-title').textContent = `${found.tableKey === 'sran' ? 'S乱' : '乱'}：${found.item.t}${found.item.bpm !== undefined ? `（Lv${found.item.lv}）` : ''}`;
    const input = document.getElementById('knock-link-search');
    input.value = found.item.n.replace(/\s*[(（]UPPER[)）]\s*/i, ' ').trim();
    document.getElementById('knock-link-modal').style.display = 'flex';
    renderKnockLinkResults();
    input.focus();
}

function closeKnockLinkModal() {
    knockLinkKey = null;
    document.getElementById('knock-link-modal').style.display = 'none';
}

// 曲名・ジャンルで探す（アプリの Lv46〜50 の曲。今つないでいる曲には印）
function renderKnockLinkResults() {
    const box = document.getElementById('knock-link-results');
    if (!box || !knockLinkKey) return;
    const terms = getSearchTerms(document.getElementById('knock-link-search').value);
    const linked = getKnockLinkedSong(knockLinkKey);
    const hits = terms.length === 0 ? [] : songs.filter(s => songMatchesSearch(s, terms))
        .sort((a, b) => (parseInt(b.level, 10) || 0) - (parseInt(a.level, 10) || 0) || String(a.title).localeCompare(String(b.title), 'ja'));
    const rows = hits.slice(0, 20).map(s => `
        <button type="button" class="kl-item${linked === s ? ' on' : ''}" onclick="linkKnockToSong('${jsStringAttr(s.id)}')">
            <span class="level-badge">${escapeHtml(s.level)}</span>
            <span class="nx-text"><span class="nx-title">${escapeHtml(s.title)}</span><span class="nx-genre">${escapeHtml(s.genre || '')}</span></span>
            <span class="nx-add">${linked === s ? 'つないでいます' : 'つなぐ'}</span>
        </button>`).join('');
    box.innerHTML = (linked ? `<button type="button" class="kl-unlink" onclick="linkKnockToSong('')">今のつなぎ（${escapeHtml(linked.title)}）を外す</button>` : '')
        + (rows || `<div class="nx-suggest-none">${terms.length ? '見つかりません。曲名・ジャンルの一部で探してください' : '曲名・ジャンルを入れてください'}</div>`)
        + (hits.length > 20 ? `<div class="nx-suggest-none">ほか ${hits.length - 20}曲。もう少し詳しく入れてください</div>` : '');
}

// つなぐ（songId が空ならつなぎを外す）。ほかの曲に同じ譜面がつないであれば外す
async function linkKnockToSong(songId) {
    const key = knockLinkKey;
    if (!key || !checkAdminAuth()) return;
    songs.forEach(s => {
        if (!Array.isArray(s.knock)) return;
        s.knock = s.knock.filter(k => k !== key);
        if (s.knock.length === 0) delete s.knock;
    });
    const song = songId ? songs.find(s => s.id === songId) : null;
    if (song) song.knock = (song.knock || []).concat(key);
    closeKnockLinkModal();
    renderTable();
    showToast('toast-eagate', song ? `「${song.title}」につなぎました` : 'つなぎを外しました', '#4caf50', 2500);
    await saveToCloud(true);
}

// ---------- アプリに無い譜面のバナー（バナー用のブックマークレットで公式の楽曲一覧から集め、クラウドに上げた画像の URL） ----------
//   knockBannerRecords = { 'ran:表の書き方' / 'sran:表の書き方': 画像の URL }。取り込んだユーザーの記録に入れ、表示は全ユーザーの記録から探す（全員共通）
function getKnockBannerUrl(key) {
    const own = allUsersData[currentUser] && allUsersData[currentUser].knockBannerRecords;
    if (own && own[key]) return own[key];
    for (const u in allUsersData) {
        const recs = allUsersData[u] && allUsersData[u].knockBannerRecords;
        if (recs && recs[key]) return recs[key];
    }
    return '';
}

function getKnockBannerRecords(user = currentUser) {
    if (!allUsersData[user]) allUsersData[user] = emptyUser();
    if (!allUsersData[user].knockBannerRecords) allUsersData[user].knockBannerRecords = {};
    return allUsersData[user].knockBannerRecords;
}

// アプリに無い譜面の枠（つなげない枠）。バナーがあれば画像を出す
function buildKnockNoAppHtml(c) {
    const src = safeUrl(getKnockBannerUrl(c.key), true);
    const lv = c.item.bpm !== undefined ? `<span class="kn-lv">Lv${escapeHtml(c.item.lv)}</span>` : '';
    if (src) {
        return `<div class="dg-banner kn-noapp kn-hasimg${c.item.d === 'H' ? ' kn-h' : ''}" title="${escapeHtml(c.item.t)}（アプリに無い譜面）"><img src="${escapeHtml(src)}" alt="${escapeHtml(c.item.t)}" loading="lazy">${lv ? `<span class="kn-lv-badge">Lv${escapeHtml(c.item.lv)}</span>` : ''}</div>`;
    }
    return `<div class="dg-banner kn-noapp" title="${escapeHtml(c.item.t)}（アプリに無い譜面）"><span class="kn-name">${escapeHtml(c.item.t)}</span>${lv}</div>`;
}

// 手でつなげる枠（乱は全部・S乱は Lv46 以上）。取り込んだバナーがあれば名前の代わりに画像を出し、右下に 🔗
function buildKnockLinkableHtml(c) {
    const onclick = `openKnockLinkModal('${jsStringAttr(c.key)}')`;
    const src = safeUrl(getKnockBannerUrl(c.key), true);
    if (src) {
        return `<button type="button" class="dg-banner kn-noapp kn-linkable kn-hasimg${c.item.d === 'H' ? ' kn-h' : ''}" onclick="${onclick}" title="${escapeHtml(c.item.t)}（押してアプリの曲につなぐ）"><img src="${escapeHtml(src)}" alt="${escapeHtml(c.item.t)}" loading="lazy"><span class="kn-lv-badge">${c.item.bpm !== undefined ? `Lv${escapeHtml(c.item.lv)} ` : ''}🔗</span></button>`;
    }
    return `<button type="button" class="dg-banner kn-noapp kn-linkable" onclick="${onclick}" title="${escapeHtml(c.item.t)}（押してアプリの曲につなぐ）"><span class="kn-name">${escapeHtml(c.item.t)}</span><span class="kn-lv">${c.item.bpm !== undefined ? `Lv${escapeHtml(c.item.lv)}・` : ''}🔗 曲につなぐ</span></button>`;
}

// 受け取ったバナーの確認（公式データ取り込みと同じ画面）
const KNOCK_BANNER_MAX_BYTES = 300000;
function openKnockBannerImport(data) {
    const validKeys = new Set();
    Object.values(KNOCK_TABLES).forEach(tb => tb.levels.forEach(l => l.items.forEach(it => validKeys.add(`${tb.prefix}:${it.t}`))));
    const images = (Array.isArray(data.images) ? data.images : []).map(x => ({
        k: (Array.isArray(x && x.k) ? x.k : []).filter(k => typeof k === 'string' && validKeys.has(k)),
        d: x && typeof x.d === 'string' && /^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(x.d) && x.d.length < KNOCK_BANNER_MAX_BYTES ? x.d : ''
    })).filter(x => x.k.length && x.d);
    if (images.length === 0) { alert('バナーのデータが読めませんでした。'); return false; }
    const todo = images.filter(x => x.k.some(k => !getKnockBannerUrl(k)));
    const keyCount = images.reduce((n, x) => n + x.k.length, 0);
    pendingEagateImport = { user: currentUser, mode: 'knockBanner', images: todo };
    document.getElementById('eagate-import-body').innerHTML = `<div class="eagate-summary">
        <div>ノック表の <b>${keyCount}</b> 譜面ぶんのバナー <b>${images.length}</b> 枚を受け取りました。</div>
        <div>まだ保存していないもの <b>${todo.length}</b> 枚をクラウドに上げて、ノック表のアプリに無い譜面の枠に出します（全ユーザー共通）。</div>
        <div style="font-size:0.85em;color:#666;">※ 1枚ずつクラウドに上げるので、数分かかります。終わるまでこのページを開いたままにしてください。途中で止まっても、もう一度取り込めば残りから続きます。</div>
    </div>
    <div class="kb-preview">${todo.slice(0, 12).map(x => `<img src="${escapeHtml(x.d)}" alt="">`).join('')}</div>`;
    const applyBtn = document.getElementById('eagate-import-apply');
    applyBtn.textContent = `${todo.length}枚をクラウドに保存`;
    applyBtn.disabled = todo.length === 0;
    document.getElementById('eagate-import-modal').style.display = 'flex';
    return true;
}

async function applyKnockBannerImport(pending) {
    closeEagateImportModal();
    const recs = getKnockBannerRecords();
    const list = pending.images.slice();
    let done = 0, failed = 0, next = 0;
    const total = list.length;
    const nameOf = x => 'knock_' + x.k[0].replace(/^[a-z]+:/, '').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);
    const worker = async () => {
        while (next < list.length) {
            const x = list[next++];
            const url = await uploadImageToCloud(x.d, nameOf(x));
            if (url) x.k.forEach(k => { recs[k] = url; }); else failed++;
            done++;
            showToast('toast-eagate', `バナーをクラウドに保存中… ${done}/${total}`, '#1565c0', 0);
            if (done % 10 === 0) { scheduleAutoSave(); renderTable(); }
        }
    };
    await Promise.all([worker(), worker(), worker()]);
    scheduleAutoSave();
    renderTable();
    showToast('toast-eagate', failed ? `バナーを ${total - failed}枚保存しました（${failed}枚は失敗。もう一度取り込むと続きから保存します）` : `バナーを ${total}枚保存しました`, failed ? '#e65100' : '#4caf50', 5000);
}
