// ==========================================
// wiki-import.js
// 曲の「属性」（攻略wiki popn.wiki の各曲のページの「## 属性」）。
//   曲データの attrs（属性の名前の配列）に入れる。曲データなので、変えるのは管理者だけ（楽曲リストとしてクラウドに保存）。
//   ・曲の編集画面で手入力できる（「、」区切り）
//   ・攻略wikiの上で動くブックマークレット（js/wiki-bookmarklet.js）で全曲の属性を集め、ここに貼って取り込める
//   絞り込みの「属性」、フリーワード検索でも使う。
//   似た属性は1つにまとめる：決まり（canonicalAttr）と、管理者が「属性の整理」でまとめた置き換え（attrConfigRecords._alias）。
//   攻略wikiから取り込むときは、どちらも自動で当てる。
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
        const attrs = organizeAttrs(parseAttrText((Array.isArray(s.a) ? s.a : []).filter(a => typeof a === 'string').join('、')));
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

// ---------- 属性の整理 ----------
// 似た属性を1つにまとめる決まり。末尾の「曲」「系」などと（…）を外し、言い方の違うものを同じ名前にする
const ATTR_SUFFIXES = ['譜面', '要素', '気味', '寄り', '多め', 'あり', '有り', '曲', '系'];
const ATTR_SYNONYMS = {
    '縦連打': '縦連', '同時': '同時押し', 'ガチ押': 'ガチ押し', '総合': '総合力',
    'ゲージ辛': '辛ゲージ', '辛いゲージ': '辛ゲージ', 'ゲージが辛い': '辛ゲージ',
    'BPM変化': 'ソフラン', 'BPM変動': 'ソフラン', '変速': 'ソフラン'
};

function canonicalAttr(name) {
    let a = String(name || '').normalize('NFKC').replace(/\s+/g, '').replace(/[。.、,!！]+$/, '');
    const noParen = a.replace(/[(\[][^)\]]*[)\]]/g, '');
    if (noParen) a = noParen;
    for (let changed = true; changed;) {
        changed = false;
        for (const suf of ATTR_SUFFIXES) {
            if (a.length > suf.length && a.endsWith(suf)) { a = a.slice(0, -suf.length); changed = true; break; }
        }
    }
    return Object.prototype.hasOwnProperty.call(ATTR_SYNONYMS, a) ? ATTR_SYNONYMS[a] : a;
}

// 管理者がまとめた置き換え { 前の名前: 新しい名前（'' は消す） }（ユーザーごと：attrConfigRecords._alias）
function getAttrAliases(user = currentUser) {
    const rec = allUsersData[user] && allUsersData[user].attrConfigRecords;
    const al = rec && rec._alias;
    return al && typeof al === 'object' && !Array.isArray(al) ? al : {};
}

function saveAttrAliases(aliases) {
    if (!allUsersData[currentUser]) return;
    allUsersData[currentUser].attrConfigRecords = { ...(allUsersData[currentUser].attrConfigRecords || {}), _alias: aliases };
    scheduleAutoSave();
}

// 1つの属性を、置き換え → 決まり → 置き換え の順でそろえる（'' は消す）
function organizeAttr(name) {
    const al = getAttrAliases();
    const has = k => Object.prototype.hasOwnProperty.call(al, k) && typeof al[k] === 'string';
    let a = has(name) ? al[name] : name;
    if (!a) return '';
    a = canonicalAttr(a);
    if (has(a)) a = al[a];
    return a;
}

function organizeAttrs(list) {
    const out = [];
    list.forEach(a => { const v = organizeAttr(a); if (v && !out.includes(v)) out.push(v); });
    return out;
}

let attrOrgDraft = null;

function openAttrOrgModal() {
    if (!checkAdminAuth()) return;
    const count = {};
    songs.forEach(s => getSongAttrs(s).forEach(a => { count[a] = (count[a] || 0) + 1; }));
    attrOrgDraft = getAllSongAttrs().map(a => ({ from: a, n: a, count: count[a], del: false }));
    renderAttrOrgModal();
    document.getElementById('attr-org-modal').style.display = 'flex';
}

function renderAttrOrgModal() {
    const rows = attrOrgDraft.map((r, i) => `
        <div class="ao-row${r.del ? ' ao-del' : (r.n.trim() !== r.from ? ' ao-changed' : '')}">
            <span class="ao-from" title="${escapeHtml(r.from)}">${escapeHtml(r.from)}</span>
            <span class="ao-count">${r.count}曲</span>
            <span class="ao-arrow">→</span>
            <input type="text" class="ao-name" value="${escapeHtml(r.n)}" maxlength="40" ${r.del ? 'disabled' : ''}
                oninput="attrOrgDraft[${i}].n = this.value" onchange="renderAttrOrgModal()" aria-label="新しい名前">
            <button type="button" class="ao-delbtn" onclick="attrOrgDraft[${i}].del = !attrOrgDraft[${i}].del; renderAttrOrgModal()">${r.del ? '戻す' : '消す'}</button>
        </div>`).join('');
    const aliases = getAttrAliases();
    const aliasRows = Object.keys(aliases).map(k => `<li>${escapeHtml(k)} → ${aliases[k] ? escapeHtml(aliases[k]) : '<span style="color:#d32f2f;">消す</span>'}
        <button type="button" class="ao-alias-del" onclick="removeAttrAlias('${jsStringAttr(k)}')" aria-label="この置き換えをやめる">×</button></li>`).join('');
    const changed = attrOrgDraft.filter(r => r.del || r.n.trim() !== r.from).length;
    document.getElementById('attr-org-body').innerHTML = `
        <button type="button" class="ao-auto" onclick="autoOrganizeAttrDraft()">似た属性を自動でまとめる</button>
        <div class="ao-summary">${attrOrgDraft.length}種類${changed ? `（変えるもの ${changed}）` : ''}</div>
        ${rows || '<div class="me-empty">属性のある曲がありません</div>'}
        ${aliasRows ? `<details class="ao-aliases"><summary>保存している置き換え（${Object.keys(aliases).length}）</summary>
            <div style="font-size:0.85em;color:#888;">攻略wikiから取り込むときにも使います。</div><ul>${aliasRows}</ul></details>` : ''}`;
}

// 決まり（と保存している置き換え）で、名前の欄を埋める
function autoOrganizeAttrDraft() {
    attrOrgDraft.forEach(r => { if (!r.del) r.n = organizeAttr(r.from) || r.from; });
    renderAttrOrgModal();
}

function removeAttrAlias(key) {
    const aliases = { ...getAttrAliases() };
    delete aliases[key];
    saveAttrAliases(aliases);
    renderAttrOrgModal();
}

function closeAttrOrgModal() {
    attrOrgDraft = null;
    document.getElementById('attr-org-modal').style.display = 'none';
}

async function saveAttrOrgModal() {
    if (!attrOrgDraft) return;
    const map = {};
    attrOrgDraft.forEach(r => {
        const n = parseAttrText(r.n)[0] || '';
        if (r.del) map[r.from] = '';
        else if (n && n !== r.from) map[r.from] = n;
    });
    const keys = Object.keys(map);
    if (keys.length === 0) { closeAttrOrgModal(); return; }
    const removed = keys.filter(k => !map[k]);
    if (!confirm(`属性を${keys.length - removed.length}個まとめ・名前を変え${removed.length ? `、${removed.length}個消し` : ''}ます。楽曲リストとして全ユーザーに反映されます。よろしいですか？`)) return;

    let changedSongs = 0;
    songs.forEach(s => {
        const before = getSongAttrs(s);
        const after = [];
        before.forEach(a => { const v = Object.prototype.hasOwnProperty.call(map, a) ? map[a] : a; if (v && !after.includes(v)) after.push(v); });
        if (JSON.stringify(before) !== JSON.stringify(after)) { setSongAttrs(s, after); changedSongs++; }
    });
    // 置き換えを残す（攻略wikiから取り込み直しても同じ名前になるように）。前の置き換えの行き先も付け替える
    const aliases = { ...getAttrAliases() };
    Object.keys(aliases).forEach(k => { if (Object.prototype.hasOwnProperty.call(map, aliases[k])) aliases[k] = map[aliases[k]]; });
    keys.forEach(k => { aliases[k] = map[k]; });
    Object.keys(aliases).forEach(k => { if (aliases[k] === k) delete aliases[k]; });
    saveAttrAliases(aliases);

    const selected = getFilterValues('filter-attr').map(a => (Object.prototype.hasOwnProperty.call(map, a) ? map[a] : a)).filter(Boolean);
    closeAttrOrgModal();
    updateDynamicFilters();
    setFilterValues('filter-attr', [...new Set(selected)]);
    renderTable();
    showToast('toast-eagate', `属性を整理しました（${changedSongs}曲）`, '#4caf50', 3000);
    await saveToCloud(true);
}
