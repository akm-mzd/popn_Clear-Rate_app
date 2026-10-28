// ==========================================
// memo.js
// 曲ごとのメモ：★練習したい・タグ・ハイスピード・オプション・サドプラ・コメント。
//   メモ = memoRecords[曲ID] = { tags: [タグ名], star, hs, opt, sudden, comment }（空の項目は入れない）
//   ver 3.15 までの相性（affinity）は、読むときにタグとして扱い、書き換えたときに tags へ移す。
//   タグの選択肢（名前と色）はユーザーごとに memoConfigRecords（{ _tags: [{ n, c }] }）としてクラウドに保存する。
// メモの入力欄（buildMemoEditor）は、メダルを選ぶ画面とメモの画面で同じものを使う。変えたらすぐ保存する。
// ==========================================

const MEMO_DEFAULT_TAGS = [
    { n: '得意', c: '#2196F3' },
    { n: '苦手', c: '#FF9800' },
    { n: '噛み合い待ち', c: '#9C27B0' },
    { n: '敵', c: '#F44336' },
    { n: '💩', c: '#795548' }
];
const MEMO_OPTIONS = ['正規', 'ミラー', 'ランダム', 'S乱'];
const MEMO_FILTER_STAR = '★';
const MEMO_FILTER_COMMENT = 'コメントあり';
const MEMO_FILTER_NONE = '未設定'; // タグなし（ver 3.15 までの「相性：未設定」と同じ値）
const MEMO_TEXT_SAVE_DELAY_MS = 500;

// ---------- タグの選択肢 ----------
function getMemoTagDefs(user = currentUser) {
    const rec = allUsersData[user] && allUsersData[user].memoConfigRecords;
    if (rec && Array.isArray(rec._tags)) return rec._tags.filter(t => t && typeof t.n === 'string' && t.n.trim());
    return MEMO_DEFAULT_TAGS.map(t => ({ ...t }));
}

function saveMemoTagDefs(defs) {
    if (!allUsersData[currentUser]) allUsersData[currentUser] = emptyUser();
    allUsersData[currentUser].memoConfigRecords = { _tags: defs };
}

function getMemoTagNames() {
    return getMemoTagDefs().map(t => t.n);
}

function getMemoTagColor(name) {
    const def = getMemoTagDefs().find(t => t.n === name);
    return def && /^#[0-9a-fA-F]{6}$/.test(def.c) ? def.c : '#90a4ae';
}

// ---------- 1曲のメモ ----------
function getMemo(songId) {
    return memoRecords[songId] || {};
}

// タグ（ver 3.15 までの相性も含める）
function getMemoTags(memo) {
    const tags = Array.isArray(memo.tags) ? memo.tags.filter(t => typeof t === 'string' && t) : [];
    if (memo.affinity && !tags.includes(memo.affinity)) tags.unshift(String(memo.affinity));
    return tags;
}

function hasMemoContent(memo) {
    return getMemoTags(memo).length > 0 || !!memo.star || !!memo.hs || !!memo.opt || !!memo.sudden || !!memo.comment;
}

// 検索用の文字（コメント・タグ・ハイスピード・サドプラ・オプション）
function getMemoSearchText(memo) {
    return [getMemoTags(memo).join(' '), memo.hs, memo.opt, memo.sudden, memo.comment].filter(Boolean).join(' ').toLowerCase();
}

// メモの中身を1行の文字に（印の title・画像出力などで使う）
function describeMemo(memo) {
    const parts = [];
    if (memo.star) parts.push('★練習したい');
    const tags = getMemoTags(memo);
    if (tags.length) parts.push(`タグ: ${tags.join('・')}`);
    if (memo.hs) parts.push(`ハイスピ: ${memo.hs}`);
    if (memo.opt) parts.push(`オプション: ${memo.opt}`);
    if (memo.sudden) parts.push(`サドプラ: ${memo.sudden}`);
    if (memo.comment) parts.push(`コメント: ${memo.comment}`);
    return parts.join('\n');
}

// メモを書き換える（changes の項目だけ）。空になったら消す
function updateMemo(songId, changes) {
    const old = getMemo(songId);
    const next = { tags: getMemoTags(old), star: !!old.star, hs: old.hs || '', opt: old.opt || '', sudden: old.sudden || '', comment: old.comment || '', ...changes };
    const memo = {};
    if (next.tags && next.tags.length) memo.tags = next.tags;
    if (next.star) memo.star = true;
    ['hs', 'opt', 'sudden', 'comment'].forEach(k => { if (next[k]) memo[k] = String(next[k]).slice(0, 2000); });
    if (Object.keys(memo).length === 0) delete memoRecords[songId];
    else memoRecords[songId] = memo;
    if (!allUsersData[currentUser]) allUsersData[currentUser] = emptyUser();
    allUsersData[currentUser].memoRecords = memoRecords;
    scheduleAutoSave();
}

// 一覧の印（バナーの右上）：タグの色の点・★・📝（コメント）
function buildMemoMarkHtml(songId) {
    const memo = getMemo(songId);
    if (!hasMemoContent(memo)) return '';
    const dots = getMemoTags(memo).slice(0, 4).map(t => `<span class="memo-dot" style="background: ${getMemoTagColor(t)};"></span>`).join('');
    const star = memo.star ? '<span class="memo-mark-star">★</span>' : '';
    const note = memo.comment ? '<span class="memo-mark-note">📝</span>' : '';
    if (!dots && !star && !note) return '';
    return `<span class="memo-mark" title="${escapeHtml(describeMemo(memo))}">${star}${dots}${note}</span>`;
}

// ---------- 入力欄（メダルを選ぶ画面・メモの画面で共通） ----------
let memoEditorSongId = null;
let memoTextTimer = null;

function buildMemoEditorHtml(songId) {
    const memo = getMemo(songId);
    const tags = getMemoTags(memo);
    const safeId = jsStringAttr(songId);
    // メモにあって選択肢にないタグ（消したあとなど）も、付いているものとして出す
    const names = getMemoTagNames();
    tags.forEach(t => { if (!names.includes(t)) names.push(t); });
    const tagChips = names.map(n => {
        const on = tags.includes(n);
        const color = getMemoTagColor(n);
        return `<button type="button" class="me-chip me-tag${on ? ' on' : ''}" style="--tag-color: ${color};" onclick="toggleMemoTag('${safeId}', '${jsStringAttr(n)}')">${escapeHtml(n)}</button>`;
    }).join('');
    const optChips = MEMO_OPTIONS.map(o => `<button type="button" class="me-chip${memo.opt === o ? ' on' : ''}" onclick="toggleMemoOption('${safeId}', '${o}')">${o}</button>`).join('');
    return `
        <div class="memo-editor" data-song-id="${escapeHtml(songId)}">
            <div class="me-head">
                <span class="me-title">メモ</span>
                <button type="button" class="me-star${memo.star ? ' on' : ''}" onclick="toggleMemoStar('${safeId}')" aria-pressed="${!!memo.star}">★ 練習したい</button>
            </div>
            <div class="me-label">タグ <button type="button" class="me-link" onclick="openMemoTagsModal()">タグを編集</button></div>
            <div class="me-chips">${tagChips || '<span class="me-empty">タグがありません</span>'}</div>
            <div class="me-grid2">
                <label class="me-field">ハイスピード<input type="text" class="me-input" data-key="hs" value="${escapeHtml(memo.hs || '')}" placeholder="例：3.8／緑 300" oninput="onMemoTextInput('${safeId}')" onchange="saveMemoText('${safeId}')"></label>
                <label class="me-field">サドプラ<input type="text" class="me-input" data-key="sudden" value="${escapeHtml(memo.sudden || '')}" placeholder="例：-150" oninput="onMemoTextInput('${safeId}')" onchange="saveMemoText('${safeId}')"></label>
            </div>
            <div class="me-label">オプション</div>
            <div class="me-chips">${optChips}</div>
            <label class="me-field">コメント<textarea class="me-input" data-key="comment" rows="3" placeholder="譜面の傾向や注意点など" oninput="onMemoTextInput('${safeId}')" onchange="saveMemoText('${safeId}')">${escapeHtml(memo.comment || '')}</textarea></label>
        </div>`;
}

function renderMemoEditor(containerId, songId) {
    const box = document.getElementById(containerId);
    if (!box) return;
    memoEditorSongId = songId;
    box.innerHTML = songId ? buildMemoEditorHtml(songId) : '';
}

// 開いている入力欄（メダルを選ぶ画面・メモの画面）を描き直す。文字の欄は先に保存しておく
function refreshMemoEditors() {
    ['memo-editor-medal', 'memo-editor-memo'].forEach(cid => {
        const box = document.getElementById(cid);
        const ed = box && box.querySelector('.memo-editor');
        if (!ed) return;
        const id = ed.dataset.songId;
        box.innerHTML = buildMemoEditorHtml(id);
    });
}

function readMemoTextFields(songId) {
    const out = {};
    document.querySelectorAll('.memo-editor').forEach(ed => {
        if (ed.dataset.songId !== songId || !ed.offsetParent) return;
        ed.querySelectorAll('.me-input').forEach(inp => { out[inp.dataset.key] = inp.value.trim(); });
    });
    return out;
}

function onMemoTextInput(songId) {
    clearTimeout(memoTextTimer);
    memoTextTimer = setTimeout(() => saveMemoText(songId), MEMO_TEXT_SAVE_DELAY_MS);
}

// 文字の欄を保存する（印などを描き直す。入力欄はそのまま）
function saveMemoText(songId) {
    clearTimeout(memoTextTimer);
    memoTextTimer = null;
    const fields = readMemoTextFields(songId);
    if (Object.keys(fields).length === 0) return;
    const memo = getMemo(songId);
    if (['hs', 'sudden', 'comment'].every(k => (memo[k] || '') === (fields[k] || ''))) return;
    updateMemo(songId, fields);
    renderTable();
}

// 閉じる前などに、まだ保存していない文字を保存する
function flushMemoText() {
    if (memoTextTimer && memoEditorSongId) saveMemoText(memoEditorSongId);
}

function toggleMemoStar(songId) {
    flushMemoText();
    updateMemo(songId, { star: !getMemo(songId).star });
    refreshMemoEditors();
    renderTable();
}

function toggleMemoTag(songId, name) {
    flushMemoText();
    const tags = getMemoTags(getMemo(songId));
    const i = tags.indexOf(name);
    if (i >= 0) tags.splice(i, 1); else tags.push(name);
    updateMemo(songId, { tags });
    refreshMemoEditors();
    renderTable();
}

function toggleMemoOption(songId, opt) {
    flushMemoText();
    updateMemo(songId, { opt: getMemo(songId).opt === opt ? '' : opt });
    refreshMemoEditors();
    renderTable();
}

// ---------- メモの画面（リスト表示の 📝） ----------
function openMemoModal(id) {
    const song = songs.find(s => s.id === id);
    if (!song) return;
    document.getElementById('memo-modal-title').innerText = `メモ: ${song.title}`;
    renderMemoEditor('memo-editor-memo', id);
    document.getElementById('memo-modal').style.display = 'flex';
}

function closeMemoModal() {
    flushMemoText();
    document.getElementById('memo-modal').style.display = 'none';
    document.getElementById('memo-editor-memo').innerHTML = '';
}

function clearMemo() {
    const ed = document.querySelector('#memo-editor-memo .memo-editor');
    if (!ed) return;
    if (!confirm('この曲のメモをすべて消しますか？')) return;
    clearTimeout(memoTextTimer);
    memoTextTimer = null;
    delete memoRecords[ed.dataset.songId];
    allUsersData[currentUser].memoRecords = memoRecords;
    scheduleAutoSave();
    closeMemoModal();
    renderTable();
}

// ---------- タグの編集（追加・名前の変更・色・削除） ----------
let memoTagsDraft = null; // [{ n, c, from: 元の名前（新しいタグは null） }]

function openMemoTagsModal() {
    flushMemoText();
    memoTagsDraft = getMemoTagDefs().map(t => ({ n: t.n, c: /^#[0-9a-fA-F]{6}$/.test(t.c) ? t.c : '#90a4ae', from: t.n }));
    renderMemoTagsModal();
    document.getElementById('memo-tags-modal').style.display = 'flex';
}

function renderMemoTagsModal() {
    const rows = memoTagsDraft.map((t, i) => `
        <div class="mt-row">
            <input type="color" value="${escapeHtml(t.c)}" onchange="memoTagsDraft[${i}].c = this.value" aria-label="色">
            <input type="text" class="mt-name" value="${escapeHtml(t.n)}" maxlength="20" oninput="memoTagsDraft[${i}].n = this.value" aria-label="タグの名前">
            <button type="button" class="mt-del" onclick="removeMemoTagDraft(${i})" aria-label="削除">削除</button>
        </div>`).join('');
    document.getElementById('memo-tags-body').innerHTML = (rows || '<div class="me-empty">タグがありません</div>') +
        `<button type="button" class="mt-add" onclick="addMemoTagDraft()">＋ タグを追加</button>`;
}

function addMemoTagDraft() {
    memoTagsDraft.push({ n: '', c: '#607d8b', from: null });
    renderMemoTagsModal();
    const names = document.querySelectorAll('#memo-tags-body .mt-name');
    if (names.length) names[names.length - 1].focus();
}

function removeMemoTagDraft(i) {
    memoTagsDraft.splice(i, 1);
    renderMemoTagsModal();
}

function closeMemoTagsModal() {
    memoTagsDraft = null;
    document.getElementById('memo-tags-modal').style.display = 'none';
}

function saveMemoTagsModal() {
    const draft = memoTagsDraft.map(t => ({ ...t, n: t.n.trim() })).filter(t => t.n);
    const names = draft.map(t => t.n);
    if (new Set(names).size !== names.length) {
        alert('同じ名前のタグがあります。名前を変えてください。');
        return;
    }
    const oldNames = getMemoTagNames();
    const renamed = {};
    draft.forEach(t => { if (t.from && t.from !== t.n) renamed[t.from] = t.n; });
    const removed = oldNames.filter(n => !draft.some(t => t.from === n));
    if (removed.length > 0 && !confirm(`タグ「${removed.join('」「')}」を消します。メモからも外れます。よろしいですか？`)) return;

    // メモ・目標・絞り込みの名前を書き換える
    const mapName = n => (removed.includes(n) ? null : (renamed[n] || n));
    Object.keys(memoRecords).forEach(id => {
        const memo = memoRecords[id];
        const tags = getMemoTags(memo).map(mapName).filter(Boolean);
        const before = JSON.stringify(getMemoTags(memo));
        if (memo.affinity !== undefined || before !== JSON.stringify(tags)) updateMemo(id, { tags });
    });
    if (typeof getGoalRecords === 'function') {
        Object.values(getGoalRecords()).forEach(g => {
            if (g && Array.isArray(g.af)) g.af = g.af.map(n => n === MEMO_FILTER_NONE ? n : mapName(n)).filter(Boolean);
        });
    }
    const selected = getFilterValues('filter-affinity').map(n => [MEMO_FILTER_STAR, MEMO_FILTER_COMMENT, MEMO_FILTER_NONE].includes(n) ? n : mapName(n)).filter(Boolean);
    saveMemoTagDefs(draft.map(t => ({ n: t.n, c: t.c })));
    scheduleAutoSave();
    closeMemoTagsModal();
    updateDynamicFilters();
    setFilterValues('filter-affinity', selected);
    refreshMemoEditors();
    renderTable();
}

// ---------- メモ一覧 ----------
let memoListFilter = { star: false, tags: [] };

function openMemoListModal() {
    toggleMenu(false);
    renderMemoListModal();
    document.getElementById('memo-list-modal').style.display = 'flex';
}

function closeMemoListModal() {
    document.getElementById('memo-list-modal').style.display = 'none';
}

function toggleMemoListStar() {
    memoListFilter.star = !memoListFilter.star;
    renderMemoListModal();
}

function toggleMemoListTag(name) {
    const i = memoListFilter.tags.indexOf(name);
    if (i >= 0) memoListFilter.tags.splice(i, 1); else memoListFilter.tags.push(name);
    renderMemoListModal();
}

function renderMemoListModal() {
    const modal = document.getElementById('memo-list-modal');
    if (!modal) return;
    const list = songs.filter(s => hasMemoContent(getMemo(s.id))).filter(s => {
        const memo = getMemo(s.id);
        if (memoListFilter.star && !memo.star) return false;
        if (memoListFilter.tags.length > 0 && !getMemoTags(memo).some(t => memoListFilter.tags.includes(t))) return false;
        return true;
    }).sort((a, b) => ((parseInt(b.level, 10) || 0) - (parseInt(a.level, 10) || 0)) || (getDiffSortValue(b) - getDiffSortValue(a)) || (a.originalOrder - b.originalOrder));

    const chips = `<button type="button" class="me-chip${memoListFilter.star ? ' on' : ''}" onclick="toggleMemoListStar()">★ 練習したい</button>` +
        getMemoTagNames().map(n => `<button type="button" class="me-chip me-tag${memoListFilter.tags.includes(n) ? ' on' : ''}" style="--tag-color: ${getMemoTagColor(n)};" onclick="toggleMemoListTag('${jsStringAttr(n)}')">${escapeHtml(n)}</button>`).join('');
    const rows = list.map(s => {
        const memo = getMemo(s.id);
        const tags = getMemoTags(memo).map(t => `<span class="ml-tag" style="background: ${getMemoTagColor(t)};">${escapeHtml(t)}</span>`).join('');
        const extra = [memo.hs ? `ハイスピ ${memo.hs}` : '', memo.opt || '', memo.sudden ? `サドプラ ${memo.sudden}` : ''].filter(Boolean).join('・');
        return `
            <button type="button" class="ml-row" onclick="openMedalModal('${jsStringAttr(s.id)}')">
                <span class="level-badge">${escapeHtml(s.level)}</span>
                <span class="ml-main">
                    <span class="ml-title">${memo.star ? '<span class="memo-mark-star">★</span>' : ''}${escapeHtml(s.title)}</span>
                    <span class="ml-tags">${tags}${extra ? `<span class="ml-extra">${escapeHtml(extra)}</span>` : ''}</span>
                    ${memo.comment ? `<span class="ml-comment">${escapeHtml(memo.comment)}</span>` : ''}
                </span>
            </button>`;
    }).join('');
    document.getElementById('memo-list-chips').innerHTML = chips;
    document.getElementById('memo-list-body').innerHTML = rows || '<div class="me-empty">メモがある曲はありません</div>';
    document.getElementById('memo-list-count').textContent = `${list.length}曲`;
}
