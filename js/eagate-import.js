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
        // 最小BAD（ハイスコアのときの BAD。クリア済み・フルコンボでない譜面だけ）
        chart.bad = Number.isInteger(c.b) && c.b >= 0 && c.b <= 9999 ? c.b : null;
        // ポックラ用：旧曲の今作スコア・メダル（あれば）
        if (Number.isInteger(c.vs) && c.vs >= 0 && c.vs <= 100000) {
            chart.versionScore = c.vs;
            chart.versionMedal = typeof c.vm === 'string' && MEDAL_TYPES[c.vm] ? c.vm : '';
        }
        charts.push(chart);
    });
    // ポックラ用：Lv45 以下の今作の新曲（アプリには曲として入れず、ポックラの計算だけに使う）
    const extraNew = [];
    (Array.isArray(data.extraNew) ? data.extraNew : []).forEach(c => {
        if (!c || typeof c.t !== 'string' || !c.t.trim()) return;
        if (!Number.isInteger(c.l) || c.l < 1 || c.l >= EAGATE_MIN_LEVEL) return;
        if (!Number.isInteger(c.s) || c.s < 0 || c.s > 100000) return;
        extraNew.push({ t: c.t.slice(0, 300), g: typeof c.g === 'string' ? c.g.slice(0, 300) : '', l: c.l, s: c.s, m: typeof c.m === 'string' && MEDAL_TYPES[c.m] ? c.m : '' });
    });
    // 公式サイトに載っているポックラ（読めたときだけ）
    const pc = typeof data.pc === 'number' && isFinite(data.pc) && data.pc > 0 && data.pc <= 1000 ? Math.round(data.pc * 100) / 100 : null;
    // 最近プレーした曲（公式の順番、20曲まで）と最終プレー日時
    const recent = [];
    (Array.isArray(data.recent) ? data.recent : []).slice(0, RECENT_MAX).forEach(c => {
        if (!c || typeof c.t !== 'string' || !c.t.trim()) return;
        recent.push({ t: c.t.slice(0, 300), g: typeof c.g === 'string' ? c.g.slice(0, 300) : '' });
    });
    const rt = typeof data.rt === 'string' ? data.rt.slice(0, 40) : '';
    return { charts, extraNew, pc, recent, rt, at: typeof data.at === 'string' ? data.at : '' };
}

// ---------- 曲の突き合わせ ----------
const UPPER_RE = /\s*\(upper\)/gi;

// UPPER の書き方（Ⓤ・UPPER・(UPPER)・upper・全角）を、すべて「 (upper)」にそろえる（全角/半角もそろえる）
function unifyUpperText(s) {
    return String(s || '')
        .replace(/[\u24CA\u24E4]/g, ' (upper)') // Ⓤ ⓤ（NFKC だと「U」になるので先に）
        .normalize('NFKC')
        .replace(/\s*(?:[(\[]\s*upper\s*[)\]]|(?<![\p{L}\p{N}])upper(?![\p{L}\p{N}]))/giu, ' (upper)');
}

// 公式と攻略wikiで表記が違っても合うように、文字をそろえる。
// UPPER の表記を消したあと、文字と数字以外（空白・記号・波線・「＼」・見えない制御文字）をすべて消す
function normalizeSongText(s) {
    return unifyUpperText(s).toLowerCase()
        .replace(UPPER_RE, '')
        .replace(/[^\p{L}\p{N}]/gu, '');
}

// UPPER と書いてあるか（Ⓤ・UPPER・(UPPER)・upper のどれでも）
function isUpperText(s) {
    return /\(upper\)/i.test(unifyUpperText(s));
}

// アプリの曲が UPPER 譜面か（曲名・ジャンル・バージョン・難易度のどこかに UPPER と書いてある）
function songSaysUpper(s) {
    return isUpperText(`${s.title || ''} ${s.genre || ''} ${s.version || ''} ${s.diffRaw || ''}`);
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
    const appSaysUpper = songSaysUpper;

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

        // BAD（ハイスコアのときの数なので、スコアが同じでも変わっていることがある）
        //   超EX でクリアしていない曲は最高到達点BAD（多いときだけ）、それ以外は最小BAD（少ないときだけ）
        const afterMedal = newMedal !== null ? newMedal : curMedal;
        const reach = isSuperExSong(song) && !(MEDAL_TYPES[afterMedal] || MEDAL_TYPES['']).isNormalClear;
        const hasBad = chart.bad !== null && chart.bad !== undefined;
        const curBad = toBadNum((reach ? getBadReachRecords() : getBadRecords())[song.id]);
        const newBad = hasBad && (curBad === null || (reach ? chart.bad > curBad : chart.bad < curBad)) ? chart.bad : null;

        if (newMedal !== null || newScore !== null || newBad !== null) {
            changes.push({ song, how, oldMedal: curMedal, newMedal, oldScore: isNaN(curScoreNum) ? null : curScoreNum, newScore, oldBad: curBad, newBad, badReach: reach });
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
    const extraCount = parsed.extraNew.length;
    pendingEagateImport = { user: currentUser, changes, versionRecords, extraNew: parsed.extraNew, pc: parsed.pc, recent: parsed.recent, rt: parsed.rt, at: parsed.at };

    const medalCount = changes.filter(c => c.newMedal !== null).length;
    const scoreCount = changes.filter(c => c.newScore !== null).length;
    const badCount = changes.filter(c => c.newBad !== null && !c.badReach).length;
    const reachCount = changes.filter(c => c.newBad !== null && c.badReach).length;
    const when = parsed.at ? new Date(parsed.at) : null;
    const whenText = when && !isNaN(when) ? `${when.getMonth() + 1}/${when.getDate()} ${when.getHours()}:${String(when.getMinutes()).padStart(2, '0')} に読み取ったデータ` : '';

    let html = `<div class="eagate-summary">
        <div>${escapeHtml(whenText)}</div>
        <div>公式の譜面 <b>${parsed.charts.length}</b> 件のうち、アプリの曲（Lv${EAGATE_MIN_LEVEL}〜${EAGATE_MAX_LEVEL}）と合ったもの <b>${pairs.length}</b> 件</div>
        <div>メダル更新 <b>${medalCount}</b> 件 / スコア更新 <b>${scoreCount}</b> 件 / 最小BAD 更新 <b>${badCount}</b> 件${reachCount ? ` / 到達点BAD 更新 <b>${reachCount}</b> 件` : ''}</div>
        <div style="font-size:0.85em;color:#666;">※ メダルは上がるときだけ、スコアは高いときだけ、最小BAD は少なくなるときだけ更新します（超EX のクリアしていない曲は、最高到達点BAD が多くなるときだけ）。</div>
        ${versionCount > 0 ? `<div style="font-size:0.85em;color:#666;">ポックラ用に、旧曲 <b>${versionCount}</b> 曲の今作スコアも保存します。</div>` : ''}
        ${extraCount > 0 ? `<div style="font-size:0.85em;color:#666;">ポックラ用に、Lv45以下の新曲 <b>${extraCount}</b> 曲も保存します。</div>` : ''}
        ${parsed.pc !== null ? `<div style="font-size:0.85em;color:#666;">公式のポックラ <b>${parsed.pc.toFixed(2)}</b> も保存します。</div>` : ''}
        ${parsed.recent.length > 0 ? `<div style="font-size:0.85em;color:#666;">最近プレーした曲（<b>${parsed.recent.length}</b> 曲）も保存します。</div>` : ''}
    </div>`;

    if (changes.length > 0) {
        const rows = changes.map(c => `<tr>
            <td><span class="level-badge">${escapeHtml(c.song.level)}</span> ${escapeHtml(c.song.title)}${EAGATE_HOW_LABELS[c.how] ? ` <span class="eagate-how">${EAGATE_HOW_LABELS[c.how]}</span>` : ''}</td>
            <td>${c.newMedal !== null ? `${medalLabelHtml(c.oldMedal)} → ${medalLabelHtml(c.newMedal)}` : '<span style="color:#bbb;">-</span>'}</td>
            <td>${c.newScore !== null ? `${c.oldScore === null ? '-' : c.oldScore} → <b>${c.newScore}</b>` : '<span style="color:#bbb;">-</span>'}</td>
            <td>${c.newBad !== null ? `${c.badReach ? '到達 ' : ''}${c.oldBad === null ? '-' : c.oldBad} → <b>${c.newBad}</b>` : '<span style="color:#bbb;">-</span>'}</td>
        </tr>`).join('');
        html += `<div class="eagate-change-list"><table><thead><tr><th>曲</th><th>メダル</th><th>スコア</th><th>BAD</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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

    // 更新履歴に残すか（この端末に覚えておく。最初は残す）
    html += `<label class="eagate-history-opt"><input type="checkbox" id="eagate-record-history"${storageGet('popn_eagate_history') === 'off' ? '' : ' checked'} onchange="storageSet('popn_eagate_history', this.checked ? 'on' : 'off')"> 更新履歴に残す</label>`;
    document.getElementById('eagate-import-body').innerHTML = html;
    const applyBtn = document.getElementById('eagate-import-apply');
    applyBtn.textContent = `${currentUser} さんに反映`;
    applyBtn.disabled = changes.length === 0 && versionCount === 0 && extraCount === 0 && parsed.pc === null && parsed.recent.length === 0;
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
    const cb = document.getElementById('eagate-record-history');
    const recordHistory = !cb || cb.checked;
    pending.changes.forEach(c => {
        const change = {};
        if (c.newMedal !== null) { change.medal = [c.oldMedal, c.newMedal]; clearRecords[c.song.id] = c.newMedal; }
        if (c.newScore !== null) { change.score = [c.oldScore, c.newScore]; scoreRecords[c.song.id] = c.newScore; }
        if (c.newBad !== null && c.badReach) getBadReachRecords()[c.song.id] = c.newBad; // 到達点BAD は履歴に残さない
        else if (c.newBad !== null) { change.bad = [c.oldBad, c.newBad]; getBadRecords()[c.song.id] = c.newBad; }
        if (recordHistory) addHistoryEntry(c.song, change, 'e');
    });
    if (!allUsersData[currentUser]) allUsersData[currentUser] = emptyUser();
    allUsersData[currentUser].clearRecords = clearRecords;
    allUsersData[currentUser].scoreRecords = scoreRecords;
    const hasPokkuraData = Object.keys(pending.versionRecords).length > 0 || pending.extraNew.length > 0 || pending.pc !== null;
    if (hasPokkuraData) {
        savePokkuraVersionRecords(currentUser, pending.versionRecords, pending.at, pending.extraNew, pending.pc);
    }
    const hasRecent = pending.recent.length > 0;
    if (hasRecent) saveRecentRecords(currentUser, pending.recent, pending.rt, pending.at);
    // その日のポックラ（公式の値・計算値）を記録する（伸びのグラフ・今日のまとめで使う）
    recordPokkuraHistory();
    closeEagateImportModal();
    scheduleAutoSave();
    renderTable();
    showToast('toast-eagate', `公式データを反映しました（${pending.changes.length}曲）`, '#4caf50', 3000);
    // 何か上がったら、今日のまとめを出す
    //   （更新履歴に残さなかったときは、まとめに出るものが無いので開かない）
    if (pending.changes.length > 0 && recordHistory) openDailySummary(true);
}

// ---------- 最近プレーした曲：ユーザーごとにクラウドに保存（recentRecords） ----------
//   クラウドの形：{ _at: 取り込んだ日時, _list: [{ t: 曲名, g: ジャンル }]（公式の順番。1つ目が一番最近）, _rt: 最終プレー日時（公式の文字のまま） }
//   取り込むたびに丸ごと置き換える
const RECENT_MAX = 20;

function saveRecentRecords(user, list, rt, at) {
    if (!allUsersData[user]) allUsersData[user] = emptyUser();
    allUsersData[user].recentRecords = { _at: at || new Date().toISOString(), _list: list.slice(0, RECENT_MAX), _rt: rt || '' };
}

function loadRecentRecords(user = currentUser) {
    const r = allUsersData[user] && allUsersData[user].recentRecords;
    if (!r || !Array.isArray(r._list)) return null;
    return { at: typeof r._at === 'string' ? r._at : '', rt: typeof r._rt === 'string' ? r._rt : '', list: r._list.filter(c => c && typeof c.t === 'string') };
}

// 最近プレーした曲を、アプリの曲に合わせる（曲名で。「(UPPER)」付きは、アプリで UPPER と書いてある曲を優先）
//   同じ曲名の曲が複数ある（EX と HYPER など）ときは全部。返り値 [{ t, g, songs: [曲] }]（合わなければ songs は空）
function matchRecentSongs(list) {
    const appSaysUpper = songSaysUpper;
    return list.map(c => {
        const title = normalizeSongText(c.t);
        let hit = title ? songs.filter(s => normalizeSongText(s.title) === title) : [];
        if (hit.length > 1) {
            const upper = isUpperText(c.t) || isUpperText(c.g);
            const sameKind = hit.filter(s => appSaysUpper(s) === upper);
            if (sameKind.length > 0) hit = sameKind;
            const sameGenre = hit.filter(s => normalizeSongText(s.genre) === normalizeSongText(c.g));
            if (sameGenre.length > 0) hit = sameGenre;
        }
        return { t: c.t, g: c.g, songs: hit };
    });
}

// ---------- ポックラ用のデータ：ユーザーごとにクラウドに保存（pokkuraRecords） ----------
//   records：旧曲の今作スコア（公式のポックラは旧曲を今作のスコアで数えるため）
//   extraNew：Lv45 以下の今作の新曲（アプリには Lv46 以上しかないが、新バージョン直後は新曲枠に入るため）
//   クラウドの形：{ 曲ID: { s, m }, _at: 取り込んだ日時, _extra: [...] }
//     （曲ID は「ジャンル_曲名_ノーツ数」で必ず _ が2つ以上あるので、_at・_extra と重ならない）
//   ver 3.1.1.0 までは端末だけに保存していた（popn_pokkura_version_ユーザー名）。
//   その端末のデータは、クラウドに入ったと確認できるまで残しておく（GAS が古いときの保険）
const POKKURA_AT_KEY = '_at';
const POKKURA_EXTRA_KEY = '_extra';
const POKKURA_PC_KEY = '_pc'; // 公式サイトに載っているポックラ
// 曲の記録ではないキー（_vm・_ec は ver 3.3.x で使っていたもの。読むときに無視する）
const POKKURA_META_KEYS = [POKKURA_AT_KEY, POKKURA_EXTRA_KEY, POKKURA_PC_KEY, '_vm', '_ec'];

function pokkuraVersionKey(user) {
    return 'popn_pokkura_version_' + user;
}

function savePokkuraVersionRecords(user, records, at, extraNew, pc) {
    const data = { at: at || new Date().toISOString(), records, extraNew: extraNew || [], pc: typeof pc === 'number' ? pc : null };
    if (!allUsersData[user]) allUsersData[user] = emptyUser();
    // 前回の取り込み分は丸ごと置き換える
    allUsersData[user].pokkuraRecords = toPokkuraCloudRecords(data);
    storageSet(pokkuraVersionKey(user), JSON.stringify(data));
}

function toPokkuraCloudRecords(data) {
    const rec = Object.assign({}, data.records, { [POKKURA_AT_KEY]: data.at, [POKKURA_EXTRA_KEY]: data.extraNew || [] });
    if (typeof data.pc === 'number') rec[POKKURA_PC_KEY] = data.pc;
    return rec;
}

function fromPokkuraCloudRecords(rec) {
    if (!rec || typeof rec !== 'object' || !rec[POKKURA_AT_KEY]) return null;
    const records = {};
    for (const id in rec) {
        if (!POKKURA_META_KEYS.includes(id)) records[id] = rec[id];
    }
    const pc = rec[POKKURA_PC_KEY];
    return {
        at: rec[POKKURA_AT_KEY], records,
        extraNew: Array.isArray(rec[POKKURA_EXTRA_KEY]) ? rec[POKKURA_EXTRA_KEY] : [],
        pc: typeof pc === 'number' && isFinite(pc) ? pc : null
    };
}

function loadLocalPokkuraVersionRecords(user) {
    try {
        const data = JSON.parse(storageGet(pokkuraVersionKey(user)) || 'null');
        if (!data || typeof data.records !== 'object' || !data.records) return null;
        if (!Array.isArray(data.extraNew)) data.extraNew = [];
        if (typeof data.pc !== 'number') data.pc = null;
        return data;
    } catch (e) {
        return null;
    }
}

// { at, records: { 曲ID: { s, m } }, extraNew: [{ t, g, l, s, m }] } か、なければ null
//   クラウドと端末の両方にあれば、新しく取り込んだほう
function loadPokkuraVersionRecords(user) {
    const cloud = fromPokkuraCloudRecords(allUsersData[user] && allUsersData[user].pokkuraRecords);
    const local = loadLocalPokkuraVersionRecords(user);
    if (cloud && local) return new Date(local.at) > new Date(cloud.at) ? local : cloud;
    return cloud || local;
}

// 起動時：端末にだけあるデータをクラウドへ移す。クラウドに同じか新しいデータがあれば、端末のものは消す
function migrateLocalPokkuraRecords() {
    for (const user in allUsersData) {
        const local = loadLocalPokkuraVersionRecords(user);
        if (!local) continue;
        const cloud = fromPokkuraCloudRecords(allUsersData[user].pokkuraRecords);
        if (cloud && new Date(cloud.at) >= new Date(local.at)) {
            storageRemove(pokkuraVersionKey(user));
        } else {
            allUsersData[user].pokkuraRecords = toPokkuraCloudRecords(local);
            localChangeSeq++;
            dirtyUsers.add(user);
        }
    }
}
