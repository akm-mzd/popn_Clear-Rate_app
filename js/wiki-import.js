// ==========================================
// wiki-import.js
// 曲の「属性」（攻略wiki popn.wiki の各曲のページの「## 属性」）。
//   曲データの attrs（属性の名前の配列）に入れる。曲データなので、変えるのは管理者だけ（楽曲リストとしてクラウドに保存）。
//   ・曲の編集画面で手入力できる（「、」区切り）
//   ・攻略wikiの上で動くブックマークレット（js/wiki-bookmarklet.js）で全曲の属性を集め、ここに貼って取り込める
//   絞り込みの「属性」、フリーワード検索でも使う。
// ==========================================

const WIKI_ATTR_MAX_TEXT_LENGTH = 3000000;

// 曲の属性（なければ空の配列）
function getSongAttrs(song) {
    return Array.isArray(song && song.attrs) ? song.attrs.filter(a => typeof a === 'string' && a) : [];
}

// 「総合力、発狂」などの文字を属性の配列に（重複は外す）
function parseAttrText(text) {
    const out = [];
    String(text || '').split(/[、,，・\/／\n]+/).map(s => s.trim()).filter(Boolean).forEach(a => {
        const v = a.slice(0, 40);
        if (!out.includes(v)) out.push(v);
    });
    return out.slice(0, 30);
}

function setSongAttrs(song, attrs) {
    if (attrs && attrs.length > 0) song.attrs = attrs.slice();
    else delete song.attrs;
}

// 全曲の属性（多い順）
function getAllSongAttrs() {
    const count = {};
    songs.forEach(s => getSongAttrs(s).forEach(a => { count[a] = (count[a] || 0) + 1; }));
    return Object.keys(count).sort((a, b) => (count[b] - count[a]) || a.localeCompare(b, 'ja'));
}

// ---------- ブックマークレット ----------
function getWikiBookmarkletCode() {
    const src = new URL('js/wiki-bookmarklet.js', location.href).href;
    return `javascript:(function(){var s=document.createElement('script');s.charset='UTF-8';s.src=${JSON.stringify(src)}+'?t='+Date.now();document.body.appendChild(s);})();`;
}

function openWikiAttrHelp() {
    const code = getWikiBookmarkletCode();
    document.getElementById('wiki-attr-bookmarklet-link').setAttribute('href', code);
    document.getElementById('wiki-attr-bookmarklet-code').value = code;
}

async function copyWikiBookmarkletCode() {
    const box = document.getElementById('wiki-attr-bookmarklet-code');
    let ok = false;
    try { await navigator.clipboard.writeText(box.value); ok = true; } catch (e) {
        box.focus(); box.select();
        try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    }
    alert(ok ? 'ブックマークレットをコピーしました。' : 'コピーできませんでした。欄の中を全部選んでコピーしてください。');
}

function onWikiBookmarkletLinkClick(e) {
    e.preventDefault();
    alert('このリンクは、ブックマークバーにドラッグして登録してください。\n登録したブックマークを、攻略wiki（popn.wiki）のページで押すと動きます。');
}

// ---------- 受け取り ----------
async function importWikiAttrsFromClipboard() {
    if (!checkAdminAuth()) return;
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch (e) {
        alert('クリップボードを読めませんでした。下の欄に貼り付けて「取り込む」を押してください。');
        return;
    }
    openWikiAttrPreview(text);
}

function importWikiAttrsFromText() {
    if (!checkAdminAuth()) return;
    openWikiAttrPreview(document.getElementById('wiki-attr-text').value);
}

function parseWikiAttrPayload(text) {
    if (typeof text !== 'string' || !text.trim()) { alert('データが空です。攻略wikiでブックマークレットを実行して「コピー」を押してから取り込んでください。'); return null; }
    if (text.length > WIKI_ATTR_MAX_TEXT_LENGTH) { alert('データが大きすぎます。'); return null; }
    let data;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    if (!data || data.type !== 'popn-wiki-attrs' || !Array.isArray(data.songs)) {
        alert('攻略wikiの属性データの形ではありません。\n攻略wikiでブックマークレットを実行して「コピー」を押してから取り込んでください。');
        return null;
    }
    const list = [];
    data.songs.forEach(s => {
        if (!s || (typeof s.t !== 'string' && typeof s.g !== 'string')) return;
        const attrs = parseAttrText((Array.isArray(s.a) ? s.a : []).filter(a => typeof a === 'string').join('、'));
        if (attrs.length === 0) return;
        list.push({
            title: String(s.t || '').slice(0, 300), genre: String(s.g || '').slice(0, 300),
            level: Number.isInteger(s.lv) ? s.lv : null, notes: Number.isInteger(s.n) ? s.n : null,
            path: typeof s.p === 'string' ? s.p.slice(0, 300) : '', type: typeof s.d === 'string' ? s.d.toUpperCase() : '', attrs
        });
    });
    return { list, at: typeof data.at === 'string' ? data.at : '' };
}

// wiki の曲をアプリの曲に合わせる：曲名（なければジャンル）→ UPPER かどうか → レベル → ノーツ数 → ジャンルの順に絞り、1曲に決まったものだけ
//   曲名の Ⓤ・UPPER・(UPPER)・upper は同じものとして扱う（normalizeSongText）
function matchWikiAttrSongs(list) {
    const norm = normalizeSongText;
    const used = new Set();
    const pairs = [];
    const unmatched = [];
    list.forEach(w => {
        const t = norm(w.title), g = norm(w.genre);
        let cands = t ? songs.filter(s => norm(s.title) === t) : [];
        if (cands.length === 0 && g) cands = songs.filter(s => norm(s.genre) === g);
        const narrow = test => { const c = cands.filter(test); if (c.length > 0) cands = c; };
        const upper = isUpperText(w.title) || isUpperText(w.genre) || isUpperText(w.path) || w.type === 'UPPER';
        if (cands.length > 1) narrow(s => songSaysUpper(s) === upper);
        if (cands.length > 1 && w.level !== null) narrow(s => parseInt(s.level, 10) === w.level || parseInt(s.pokkuraLevel, 10) === w.level);
        if (cands.length > 1 && w.notes !== null) narrow(s => parseInt(s.notes, 10) === w.notes);
        if (cands.length > 1 && g) narrow(s => norm(s.genre) === g);
        cands = cands.filter(s => !used.has(s.id));
        if (cands.length === 1) { used.add(cands[0].id); pairs.push({ song: cands[0], wiki: w }); }
        else unmatched.push(w);
    });
    return { pairs, unmatched };
}

let pendingWikiAttrImport = null;

function openWikiAttrPreview(text) {
    const parsed = parseWikiAttrPayload(text);
    if (!parsed) return;
    const { pairs, unmatched } = matchWikiAttrSongs(parsed.list);
    const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
    const changes = pairs.filter(p => !sameSet(getSongAttrs(p.song), p.wiki.attrs));
    pendingWikiAttrImport = { changes };
    const rows = changes.map(c => `<tr><td><span class="level-badge">${escapeHtml(c.song.level)}</span> ${escapeHtml(c.song.title)}</td>
        <td>${escapeHtml(getSongAttrs(c.song).join('、') || '-')}</td><td><b>${escapeHtml(c.wiki.attrs.join('、'))}</b></td></tr>`).join('');
    const un = unmatched.slice(0, 200).map(w => `<li>${w.level ? `<span class="level-badge">${w.level}</span> ` : ''}${escapeHtml(w.title || w.genre)} <span style="color:#888;">(${escapeHtml(w.genre)})</span></li>`).join('');
    document.getElementById('wiki-attr-body').innerHTML = `
        <div class="eagate-summary">
            <div>攻略wikiの曲 <b>${parsed.list.length}</b> 曲のうち、アプリの曲と合ったもの <b>${pairs.length}</b> 曲</div>
            <div>属性が変わる曲 <b>${changes.length}</b> 曲</div>
            <div style="font-size:0.85em;color:#666;">※ 属性は攻略wikiのものに置き換えます。楽曲リストとして全ユーザーに反映されます。</div>
        </div>
        ${changes.length > 0 ? `<div class="eagate-change-list"><table><thead><tr><th>曲</th><th>今の属性</th><th>新しい属性</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div style="margin:10px 0;color:#666;">変わる曲はありません。</div>'}
        ${unmatched.length > 0 ? `<details class="eagate-unmatched"><summary>アプリの曲と合わなかった攻略wikiの曲（${unmatched.length}曲）</summary><ul>${un}</ul></details>` : ''}`;
    const btn = document.getElementById('wiki-attr-apply');
    btn.disabled = changes.length === 0;
    document.getElementById('wiki-attr-modal').style.display = 'flex';
}

function closeWikiAttrModal() {
    pendingWikiAttrImport = null;
    document.getElementById('wiki-attr-modal').style.display = 'none';
}

async function applyWikiAttrImport() {
    const pending = pendingWikiAttrImport;
    if (!pending || !checkAdminAuth()) return;
    pending.changes.forEach(c => setSongAttrs(c.song, c.wiki.attrs));
    closeWikiAttrModal();
    updateDynamicFilters();
    renderTable();
    showToast('toast-eagate', `属性を反映しました（${pending.changes.length}曲）`, '#4caf50', 3000);
    await saveToCloud(true);
}
