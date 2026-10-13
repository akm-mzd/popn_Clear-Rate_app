// ==========================================
// eagate-import.js
// 公式サイト（e-amusement）のメダル・スコアの取り込み。
// 公式サイトでブックマークレット（js/eagate-bookmarklet.js）を実行して読み取ったデータを、
// 「アプリに送る」かクリップボード経由で受け取り、確認してから今のユーザーに反映する。
// 反映するのは「良くなったときだけ」：メダルは上がるときだけ、スコアは高いときだけ。
// ==========================================

const EAGATE_ORIGIN = 'https://p.eagate.573.jp';
const EAGATE_MIN_LEVEL = 46;
const EAGATE_MAX_LEVEL = 50;
const EAGATE_MAX_TEXT_LENGTH = 3000000;
const EAGATE_DIFF_ORDER = { E: 0, N: 1, H: 2, EX: 3, '': 3 };

const EAGATE_HOW_LABELS = { guess: '(推定)', fuzzy: '(似た曲名)' };

let pendingEagateImport = null; // 確認画面で表示中の変更 { user, changes }

// ---------- ブックマークレット ----------
function getBookmarkletCode() {
    const src = new URL('js/eagate-bookmarklet.js', location.href).href;
    return `javascript:(function(){var s=document.createElement('script');s.charset='UTF-8';s.src=${JSON.stringify(src)}+'?t='+Date.now();document.body.appendChild(s);})();`;
}

function openEagateHelpModal() {
    toggleMenu(false);
    const code = getBookmarkletCode();
    const link = document.getElementById('eagate-bookmarklet-link');
    link.setAttribute('href', code);
    document.getElementById('eagate-bookmarklet-code').value = code;
    document.getElementById('eagate-help-modal').style.display = 'flex';
}

function closeEagateHelpModal() {
    document.getElementById('eagate-help-modal').style.display = 'none';
}

async function copyBookmarkletCode() {
    const box = document.getElementById('eagate-bookmarklet-code');
    let ok = false;
    try {
        await navigator.clipboard.writeText(box.value);
        ok = true;
    } catch (e) {
        box.focus();
        box.select();
        try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    }
    alert(ok ? 'ブックマークレットをコピーしました。' : 'コピーできませんでした。欄の中を長押しして、全部コピーしてください。');
}

// アプリの中でリンクを押しても意味がないので、案内だけ出す
function onBookmarkletLinkClick(e) {
    e.preventDefault();
    alert('このリンクは、ブックマークバーにドラッグして登録してください。\n登録したブックマークを、公式サイトのプレーデータのページで押すと動きます。');
}

// ---------- 受け取り ----------
async function importEagateFromClipboard() {
    toggleMenu(false);
    let text = '';
    try {
        text = await navigator.clipboard.readText();
    } catch (e) {
        alert('クリップボードを読めませんでした。\nメニューの「手で貼り付けて取り込む」に貼り付けてください。');
        return;
    }
    openEagateImportPreview(text);
}

function importEagateFromText() {
    const box = document.getElementById('eagate-import-text');
    toggleMenu(false);
    if (openEagateImportPreview(box.value)) box.value = '';
}

// 公式サイトのタブから「アプリに送る」で開かれたときの受け渡し
window.addEventListener('message', ev => {
    if (ev.origin !== EAGATE_ORIGIN || !ev.data || ev.data.type !== 'popn-eagate-data' || typeof ev.data.payload !== 'string') return;
    if (ev.source) ev.source.postMessage({ type: 'popn-app-received' }, EAGATE_ORIGIN);
    openEagateImportPreview(ev.data.payload);
});

// 起動処理の最後に呼ぶ。公式サイトから開かれていれば「準備できた」と知らせる
function notifyEagateOpener() {
    if (location.hash !== '#eagate-import') return;
    history.replaceState(null, '', location.pathname + location.search);
    if (window.opener) {
        try { window.opener.postMessage({ type: 'popn-app-ready' }, EAGATE_ORIGIN); } catch (e) { /* 何もしない */ }
    }
}

// 文字を確かめて、公式データの譜面一覧を返す。おかしければ null
function parseEagatePayload(text) {
    if (typeof text !== 'string' || !text.trim()) {
        alert('データが空です。公式サイトでブックマークレットを実行して、「コピー」を押してから取り込んでください。');
        return null;
    }
    if (text.length > EAGATE_MAX_TEXT_LENGTH) {
        alert('データが大きすぎます。');
        return null;
    }
    let data;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    if (data && data.type === 'popn-eagate-diag') {
        alert('これは診断データです。アプリの作者（Claude）に送ってください。');
        return null;
    }
    if (!data || data.type !== 'popn-eagate' || !Array.isArray(data.charts)) {
        alert('公式データの形ではありません。\n公式サイトでブックマークレットを実行して、「コピー」を押してから取り込んでください。');
        return null;
    }
    const charts = [];
    data.charts.forEach(c => {
        if (!c || typeof c.t !== 'string' || !c.t.trim()) return;
        const medal = typeof c.m === 'string' && MEDAL_TYPES[c.m] && c.m !== '未解禁' ? c.m : '';
        const score = Number.isInteger(c.s) && c.s >= 0 && c.s <= 100000 ? c.s : null;
        const level = Number.isInteger(c.l) ? c.l : null;
        const diff = ['E', 'N', 'H', 'EX'].includes(c.d) ? c.d : '';
        if (!medal && score === null) return;
        const chart = { title: c.t.slice(0, 300), genre: typeof c.g === 'string' ? c.g.slice(0, 300) : '', diff, level, medal, score };
        // ポックラ用：旧曲の今作スコア・メダル（あれば）
        if (Number.isInteger(c.vs) && c.vs >= 0 && c.vs <= 100000) {
            chart.versionScore = c.vs;
            chart.versionMedal = typeof c.vm === 'string' && MEDAL_TYPES[c.vm] ? c.vm : '';
        }
        charts.push(chart);
    });
    return { charts, at: typeof data.at === 'string' ? data.at : '' };
}

// ---------- 曲の突き合わせ ----------
const UPPER_RE = /\s*\(upper\)/gi;

// 公式と攻略wikiで表記が違っても合うように、文字をそろえる。
// 「(UPPER)」を消したあと、文字と数字以外（空白・記号・波線・「＼」・見えない制御文字）をすべて消す
function normalizeSongText(s) {
    return String(s || '').normalize('NFKC').toLowerCase()
        .replace(UPPER_RE, '')
        .replace(/[^\p{L}\p{N}]/gu, '');
}

// 「(UPPER)」が付いているか（公式は UPPER 譜面の曲名とジャンルに付ける）
function isUpperText(s) {
    return /\(upper\)/i.test(String(s || '').normalize('NFKC'));
}

function isEagateTargetSong(song) {
    const lv = parseInt(song.level, 10);
    return lv >= EAGATE_MIN_LEVEL && lv <= EAGATE_MAX_LEVEL;
}

// 文字の入れ替えの数（編集距離）
function editDistance(a, b) {
    const x = Array.from(a), y = Array.from(b);
    let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
    for (let i = 1; i <= x.length; i++) {
        const cur = [i];
        for (let j = 1; j <= y.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[y.length];
}

// 公式の譜面を、アプリの曲に割り当てる。
// 返り値 { pairs: [{ song, chart, how }], unmatchedSongs, unmatchedCharts }
//   how：'' = 曲名で一致 / 'guess' = 同じ曲名が複数あり推定（UPPERはノーツの多い方） / 'fuzzy' = 似た曲名
function matchEagateCharts(charts) {
    const targets = songs.filter(isEagateTargetSong);
    const assigned = new Map(); // 曲ID → { chart, how }
    const used = new Set();     // 割り当て済みの公式の譜面
    const assign = (song, chart, how) => { assigned.set(song.id, { chart, how }); used.add(chart); };
    const songLv = s => parseInt(s.level, 10);
    const appSaysUpper = s => /upper/i.test(`${s.genre || ''} ${s.version || ''} ${s.diffRaw || ''}`);

    // ① レベルが分かる譜面：同じレベル・同じ曲名で合わせる（ジャンルは、同じ曲名が複数あるときだけ使う）
    const groups = new Map();
    charts.filter(c => c.level !== null).forEach(c => {
        const k = c.level + '\n' + normalizeSongText(c.title);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(c);
    });
    groups.forEach(group => {
        const title = normalizeSongText(group[0].title);
        let cands = targets.filter(s => songLv(s) === group[0].level && normalizeSongText(s.title) === title && !assigned.has(s.id));
        if (cands.length === 0) return;
        if (cands.length === 1 && group.length === 1) { assign(cands[0], group[0], ''); return; }

        let rest = group.slice();
        // ジャンルが同じ曲、アプリ側に UPPER と書いてある曲は、それで決める
        const pickBy = test => {
            rest = rest.filter(c => {
                const hit = cands.filter(s => test(s, c));
                if (hit.length !== 1) return true;
                assign(hit[0], c, '');
                cands = cands.filter(s => s !== hit[0]);
                return false;
            });
        };
        pickBy((s, c) => normalizeSongText(s.genre) === normalizeSongText(c.genre));
        pickBy((s, c) => appSaysUpper(s) === isUpperText(c.title) && cands.some(o => appSaysUpper(o) !== appSaysUpper(s)));

        // 残りは、通常 → UPPER の順に、ノーツの少ない曲 → 多い曲へ割り当てる
        if (rest.length === 0 || cands.length === 0) return;
        const how = rest.length === 1 && cands.length === 1 ? '' : 'guess';
        rest.sort((a, b) => isUpperText(a.title) - isUpperText(b.title));
        cands.sort((a, b) => (a.notes || 0) - (b.notes || 0));
        if (rest.length < cands.length) cands = rest.every(c => isUpperText(c.title)) ? cands.slice(-rest.length) : cands.slice(0, rest.length);
        rest.slice(0, cands.length).forEach((c, i) => assign(cands[i], c, how));
    });

    // ② まだ合っていない譜面：同じレベルの、まだ合っていない曲から、曲名が似ている曲を1つだけ選ぶ
    charts.filter(c => c.level !== null && !used.has(c)).forEach(c => {
        const t = normalizeSongText(c.title);
        if (!t) return;
        const limit = Array.from(t).length >= 8 ? 2 : 1;
        let best = null, bestD = Infinity, tie = false;
        targets.forEach(s => {
            if (songLv(s) !== c.level || assigned.has(s.id)) return;
            const d = editDistance(t, normalizeSongText(s.title));
            if (d < bestD) { best = s; bestD = d; tie = false; } else if (d === bestD) tie = true;
        });
        if (best && bestD <= limit && !tie) assign(best, c, 'fuzzy');
    });

    // ③ レベルが分からない譜面（古い形のデータ）：曲名で探し、難しい譜面ほどレベルの高い曲に合わせる
    const noLevel = new Map();
    charts.filter(c => c.level === null).forEach(c => {
        const k = normalizeSongText(c.title);
        if (!noLevel.has(k)) noLevel.set(k, []);
        noLevel.get(k).push(c);
    });
    noLevel.forEach((group, title) => {
        const left = targets.filter(s => normalizeSongText(s.title) === title && !assigned.has(s.id))
            .sort((a, b) => (songLv(a) - songLv(b)) || ((a.notes || 0) - (b.notes || 0)));
        if (left.length === 0) return;
        const ordered = group.sort((a, b) => EAGATE_DIFF_ORDER[a.diff] - EAGATE_DIFF_ORDER[b.diff]);
        const use = ordered.slice(-left.length);
        const offset = left.length - use.length;
        use.forEach((c, i) => assign(left[offset + i], c, left.length > 1 ? 'guess' : ''));
    });

    const pairs = [];
    targets.forEach(s => { if (assigned.has(s.id)) pairs.push({ song: s, chart: assigned.get(s.id).chart, how: assigned.get(s.id).how }); });
    const unmatchedSongs = targets.filter(s => !assigned.has(s.id));
    const unmatchedCharts = charts.filter(c => !used.has(c));
    return { pairs, unmatchedSongs, unmatchedCharts };
}

// 「良くなったときだけ」の変更を作る
function buildEagateChanges(pairs) {
    const changes = [];
    pairs.forEach(({ song, chart, how }) => {
        const curMedal = clearRecords[song.id] || '';
        const curRank = MEDAL_TYPES[curMedal] ? MEDAL_TYPES[curMedal].rank : 0;
        const newMedal = chart.medal && MEDAL_TYPES[chart.medal].rank > curRank ? chart.medal : null;

        const curScoreNum = parseInt(scoreRecords[song.id], 10);
        const newScore = chart.score !== null && (isNaN(curScoreNum) || chart.score > curScoreNum) ? chart.score : null;

        if (newMedal !== null || newScore !== null) {
            changes.push({ song, how, oldMedal: curMedal, newMedal, oldScore: isNaN(curScoreNum) ? null : curScoreNum, newScore });
        }
    });
    return changes;
}

// ---------- 確認画面 ----------
function medalLabelHtml(key) {
    if (!key) return '<span style="color:#999;">未プレイ</span>';
    const color = MEDAL_COLORS[key] || '#999';
    return `<span style="display:inline-block;padding:1px 6px;border-radius:8px;background:${color};color:${key === '金星' || key === '銀丸' ? '#333' : '#fff'};font-size:0.85em;font-weight:bold;">${escapeHtml(MEDAL_TYPES[key] ? MEDAL_TYPES[key].label : key)}</span>`;
}

// 確認画面を開く。データがおかしければ false
function openEagateImportPreview(text) {
    const parsed = parseEagatePayload(text);
    if (!parsed) return false;
    if (songs.length === 0) {
        alert('曲のデータがまだ読み込まれていません。少し待ってからもう一度取り込んでください。');
        return false;
    }

    const { pairs, unmatchedSongs, unmatchedCharts } = matchEagateCharts(parsed.charts);
    const changes = buildEagateChanges(pairs);
    // ポックラ用の今作スコア（旧曲）。曲IDごとに { s: スコア, m: メダル }
    const versionRecords = {};
    pairs.forEach(({ song, chart }) => {
        if (chart.versionScore !== undefined) versionRecords[song.id] = { s: chart.versionScore, m: chart.versionMedal };
    });
    const versionCount = Object.keys(versionRecords).length;
    pendingEagateImport = { user: currentUser, changes, versionRecords, at: parsed.at };

    const medalCount = changes.filter(c => c.newMedal !== null).length;
    const scoreCount = changes.filter(c => c.newScore !== null).length;
    const when = parsed.at ? new Date(parsed.at) : null;
    const whenText = when && !isNaN(when) ? `${when.getMonth() + 1}/${when.getDate()} ${when.getHours()}:${String(when.getMinutes()).padStart(2, '0')} に読み取ったデータ` : '';

    let html = `<div class="eagate-summary">
        <div>${escapeHtml(whenText)}</div>
        <div>公式の譜面 <b>${parsed.charts.length}</b> 件のうち、アプリの曲（Lv${EAGATE_MIN_LEVEL}〜${EAGATE_MAX_LEVEL}）と合ったもの <b>${pairs.length}</b> 件</div>
        <div>メダル更新 <b>${medalCount}</b> 件 / スコア更新 <b>${scoreCount}</b> 件</div>
        <div style="font-size:0.85em;color:#666;">※ メダルは上がるときだけ、スコアは高いときだけ更新します。</div>
        ${versionCount > 0 ? `<div style="font-size:0.85em;color:#666;">ポックラ用に、旧曲 <b>${versionCount}</b> 曲の今作スコアも保存します（この端末に保存）。</div>` : ''}
    </div>`;

    if (changes.length > 0) {
        const rows = changes.map(c => `<tr>
            <td><span class="level-badge">${escapeHtml(c.song.level)}</span> ${escapeHtml(c.song.title)}${EAGATE_HOW_LABELS[c.how] ? ` <span class="eagate-how">${EAGATE_HOW_LABELS[c.how]}</span>` : ''}</td>
            <td>${c.newMedal !== null ? `${medalLabelHtml(c.oldMedal)} → ${medalLabelHtml(c.newMedal)}` : '<span style="color:#bbb;">-</span>'}</td>
            <td>${c.newScore !== null ? `${c.oldScore === null ? '-' : c.oldScore} → <b>${c.newScore}</b>` : '<span style="color:#bbb;">-</span>'}</td>
        </tr>`).join('');
        html += `<div class="eagate-change-list"><table><thead><tr><th>曲</th><th>メダル</th><th>スコア</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    } else {
        html += '<div style="margin:10px 0;color:#666;">更新するものはありません。</div>';
    }

    if (unmatchedSongs.length > 0) {
        const items = unmatchedSongs.map(s => `<li><span class="level-badge">${escapeHtml(s.level)}</span> ${escapeHtml(s.title)}</li>`).join('');
        html += `<details class="eagate-unmatched"><summary>公式データに見つからなかった曲（${unmatchedSongs.length}曲）</summary>
            <div style="font-size:0.8em;color:#666;">未プレイの曲か、公式と曲名の書き方が違う曲です。</div><ul>${items}</ul></details>`;
    }

    if (unmatchedCharts.length > 0) {
        const items = unmatchedCharts.map(c => `<li>${c.level !== null ? `<span class="level-badge">${c.level}</span> ` : ''}${escapeHtml(c.title)} <span style="color:#888;">(${escapeHtml(c.genre)})</span></li>`).join('');
        html += `<details class="eagate-unmatched"><summary>アプリの曲と合わなかった公式の譜面（${unmatchedCharts.length}件）</summary>
            <div style="font-size:0.8em;color:#666;">アプリにない曲か、曲名・ジャンルの書き方が違う曲です。</div><ul>${items}</ul></details>`;
    }

    document.getElementById('eagate-import-body').innerHTML = html;
    const applyBtn = document.getElementById('eagate-import-apply');
    applyBtn.textContent = `${currentUser} さんに反映`;
    applyBtn.disabled = changes.length === 0 && versionCount === 0;
    document.getElementById('eagate-import-modal').style.display = 'flex';
    return true;
}

function closeEagateImportModal() {
    pendingEagateImport = null;
    document.getElementById('eagate-import-modal').style.display = 'none';
}

function applyEagateImport() {
    const pending = pendingEagateImport;
    if (!pending) return;
    if (pending.user !== currentUser) {
        alert('ユーザーが切り替わったので、反映をやめました。もう一度取り込んでください。');
        closeEagateImportModal();
        return;
    }
    pending.changes.forEach(c => {
        if (c.newMedal !== null) clearRecords[c.song.id] = c.newMedal;
        if (c.newScore !== null) scoreRecords[c.song.id] = c.newScore;
    });
    if (!allUsersData[currentUser]) allUsersData[currentUser] = emptyUser();
    allUsersData[currentUser].clearRecords = clearRecords;
    allUsersData[currentUser].scoreRecords = scoreRecords;
    if (Object.keys(pending.versionRecords).length > 0) savePokkuraVersionRecords(currentUser, pending.versionRecords, pending.at);
    closeEagateImportModal();
    if (pending.changes.length > 0) scheduleAutoSave();
    renderTable();
    showToast('toast-eagate', `公式データを反映しました（${pending.changes.length}曲）`, '#4caf50', 3000);
}

// ---------- ポックラ用の今作スコア（旧曲）：この端末に、ユーザーごとに保存 ----------
//   公式のポックラは旧曲を今作のスコアで数えるため、取り込んだときに保存しておく。
//   クラウドには送らない（保存先の形を変えずに済むように、端末ごとの保存にしている）
function pokkuraVersionKey(user) {
    return 'popn_pokkura_version_' + user;
}

function savePokkuraVersionRecords(user, records, at) {
    storageSet(pokkuraVersionKey(user), JSON.stringify({ at: at || new Date().toISOString(), records }));
}

// { at, records: { 曲ID: { s, m } } } か、なければ null
function loadPokkuraVersionRecords(user) {
    try {
        const data = JSON.parse(storageGet(pokkuraVersionKey(user)) || 'null');
        return data && typeof data.records === 'object' && data.records ? data : null;
    } catch (e) {
        return null;
    }
}
