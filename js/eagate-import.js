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
        charts.push({ title: c.t.slice(0, 300), genre: typeof c.g === 'string' ? c.g.slice(0, 300) : '', diff, level, medal, score });
    });
    return { charts, at: typeof data.at === 'string' ? data.at : '' };
}

// ---------- 曲の突き合わせ ----------
// 公式と攻略wikiで表記が少し違っても合うように、文字をそろえる
function normalizeSongText(s) {
    return String(s || '').normalize('NFKC').toLowerCase()
        .replace(/[\s　]+/g, '')
        .replace(/[~〜～∼˜]/g, '~')
        .replace(/[‐-―−－]/g, '-')
        .replace(/[‘’`´]/g, "'")
        .replace(/[“”]/g, '"');
}

function isEagateTargetSong(song) {
    const lv = parseInt(song.level, 10);
    return lv >= EAGATE_MIN_LEVEL && lv <= EAGATE_MAX_LEVEL;
}

// 公式の譜面を、アプリの曲に割り当てる。返り値 { pairs: [{ song, chart }], unmatchedSongs }
function matchEagateCharts(charts) {
    const targets = songs.filter(isEagateTargetSong);
    const byTitle = new Map();
    targets.forEach(s => {
        const k = normalizeSongText(s.title);
        if (!byTitle.has(k)) byTitle.set(k, []);
        byTitle.get(k).push(s);
    });

    // 公式側を「曲名＋ジャンル」でまとめる
    const groups = new Map();
    charts.forEach(c => {
        const k = normalizeSongText(c.title) + '\n' + normalizeSongText(c.genre);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(c);
    });

    const assigned = new Map(); // 曲ID → 公式の譜面
    groups.forEach(group => {
        let cands = byTitle.get(normalizeSongText(group[0].title)) || [];
        if (cands.length === 0) return;
        const genre = normalizeSongText(group[0].genre);
        const sameGenre = genre ? cands.filter(s => normalizeSongText(s.genre) === genre) : [];
        if (sameGenre.length > 0) {
            cands = sameGenre;
        } else if (new Set(cands.map(s => normalizeSongText(s.genre))).size > 1) {
            return; // 同じ曲名の別の曲があり、どれか決められない
        }
        cands = cands.filter(s => !assigned.has(s.id));

        // レベルが分かる譜面は、レベルで合わせる
        const rest = [];
        group.forEach(c => {
            if (c.level === null) { rest.push(c); return; }
            const hit = cands.find(s => parseInt(s.level, 10) === c.level && !assigned.has(s.id));
            if (hit) assigned.set(hit.id, c);
        });

        // レベルが分からない譜面は、難しい譜面ほどレベルの高い曲に合わせる（ハイパー → EX の順）
        const left = cands.filter(s => !assigned.has(s.id))
            .sort((a, b) => (parseInt(a.level, 10) - parseInt(b.level, 10)) || ((a.notes || 0) - (b.notes || 0)));
        if (left.length === 0 || rest.length === 0) return;
        const ordered = rest.sort((a, b) => EAGATE_DIFF_ORDER[a.diff] - EAGATE_DIFF_ORDER[b.diff]);
        const use = ordered.slice(-left.length);
        const offset = left.length - use.length;
        use.forEach((c, i) => assigned.set(left[offset + i].id, c));
    });

    const pairs = [];
    targets.forEach(s => { if (assigned.has(s.id)) pairs.push({ song: s, chart: assigned.get(s.id) }); });
    const unmatchedSongs = targets.filter(s => !assigned.has(s.id));
    return { pairs, unmatchedSongs };
}

// 「良くなったときだけ」の変更を作る
function buildEagateChanges(pairs) {
    const changes = [];
    pairs.forEach(({ song, chart }) => {
        const curMedal = clearRecords[song.id] || '';
        const curRank = MEDAL_TYPES[curMedal] ? MEDAL_TYPES[curMedal].rank : 0;
        const newMedal = chart.medal && MEDAL_TYPES[chart.medal].rank > curRank ? chart.medal : null;

        const curScoreNum = parseInt(scoreRecords[song.id], 10);
        const newScore = chart.score !== null && (isNaN(curScoreNum) || chart.score > curScoreNum) ? chart.score : null;

        if (newMedal !== null || newScore !== null) {
            changes.push({ song, oldMedal: curMedal, newMedal, oldScore: isNaN(curScoreNum) ? null : curScoreNum, newScore });
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

    const { pairs, unmatchedSongs } = matchEagateCharts(parsed.charts);
    const changes = buildEagateChanges(pairs);
    pendingEagateImport = { user: currentUser, changes };

    const medalCount = changes.filter(c => c.newMedal !== null).length;
    const scoreCount = changes.filter(c => c.newScore !== null).length;
    const when = parsed.at ? new Date(parsed.at) : null;
    const whenText = when && !isNaN(when) ? `${when.getMonth() + 1}/${when.getDate()} ${when.getHours()}:${String(when.getMinutes()).padStart(2, '0')} に読み取ったデータ` : '';

    let html = `<div class="eagate-summary">
        <div>${escapeHtml(whenText)}</div>
        <div>公式の譜面 <b>${parsed.charts.length}</b> 件のうち、アプリの曲（Lv${EAGATE_MIN_LEVEL}〜${EAGATE_MAX_LEVEL}）と合ったもの <b>${pairs.length}</b> 件</div>
        <div>メダル更新 <b>${medalCount}</b> 件 / スコア更新 <b>${scoreCount}</b> 件</div>
        <div style="font-size:0.85em;color:#666;">※ メダルは上がるときだけ、スコアは高いときだけ更新します。</div>
    </div>`;

    if (changes.length > 0) {
        const rows = changes.map(c => `<tr>
            <td><span class="level-badge">${escapeHtml(c.song.level)}</span> ${escapeHtml(c.song.title)}</td>
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

    document.getElementById('eagate-import-body').innerHTML = html;
    const applyBtn = document.getElementById('eagate-import-apply');
    applyBtn.textContent = `${currentUser} さんに反映`;
    applyBtn.disabled = changes.length === 0;
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
    closeEagateImportModal();
    scheduleAutoSave();
    renderTable();
    showToast('toast-eagate', `公式データを反映しました（${pending.changes.length}曲）`, '#4caf50', 3000);
}
