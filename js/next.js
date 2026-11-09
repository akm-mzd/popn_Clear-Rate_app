// ==========================================
// next.js
// 「次にやる」：次にプレーしたい曲の一覧。ユーザーごとにクラウドに保存（nextRecords = { 曲ID: 入れた日時 }）。
// 目標のシートの一番上（#next-box）で、曲名などで探して入れる・✕ で消す。メモの入力欄の「▶ 次にやる」でも入れる／外す。
// 公式データの取り込みで、メダル・スコア・BAD のどれかが変わった曲は自動で消す（removeNextForSongs）。
// ==========================================

const NEXT_SUGGEST_MAX = 8;

function getNextRecords(user = currentUser) {
    if (!allUsersData[user]) allUsersData[user] = emptyUser();
    if (!allUsersData[user].nextRecords) allUsersData[user].nextRecords = {};
    return allUsersData[user].nextRecords;
}

function isInNext(songId) {
    return !!getNextRecords()[songId];
}

// 入れた順（古い順）の曲。アプリに無くなった曲は出さない
function getNextSongs() {
    const recs = getNextRecords();
    const byId = new Map(songs.map(s => [s.id, s]));
    return Object.keys(recs).filter(id => byId.has(id)).sort((a, b) => (recs[a] || 0) - (recs[b] || 0)).map(id => byId.get(id));
}

function setInNext(songId, on) {
    const recs = getNextRecords();
    if (on) recs[songId] = Date.now(); else delete recs[songId];
    scheduleAutoSave();
    refreshNextViews();
}

function toggleNext(songId) {
    if (typeof flushMemoText === 'function') flushMemoText();
    setInNext(songId, !isInNext(songId));
}

// 次にやるの一覧・メモの入力欄・表の印を描き直す
function refreshNextViews() {
    renderNextBox();
    if (typeof refreshMemoEditors === 'function') refreshMemoEditors();
    renderTable();
}

// 公式データの取り込みで変わった曲を消す。消した数を返す
function removeNextForSongs(ids) {
    const recs = getNextRecords();
    let n = 0;
    ids.forEach(id => { if (recs[id]) { delete recs[id]; n++; } });
    if (n > 0) renderNextBox();
    return n;
}

// ---------- 目標のシートの欄 ----------
function renderNextBox() {
    const box = document.getElementById('next-box');
    if (!box) return;
    const list = getNextSongs();
    const keep = document.getElementById('next-search');
    const query = keep ? keep.value : '';
    const rows = list.map(song => {
        const safeId = jsStringAttr(song.id);
        const bannerSrc = safeUrl(song.bannerUrl, true);
        const banner = bannerSrc
            ? `<img src="${escapeHtml(bannerSrc)}" alt="${escapeHtml(song.title)}" loading="lazy">`
            : `<span class="nx-banner-text">${escapeHtml(song.title)}</span>`;
        return `<div class="nx-row">
            <button type="button" class="nx-medal" onclick="openMedalModal('${safeId}')" title="メダルを変更">${historyMedalHtml(clearRecords[song.id] || '')}</button>
            <span class="nx-banner" data-sid="${escapeHtml(song.id)}">${banner}</span>
            <span class="nx-text"><span class="nx-title"><span class="level-badge">${escapeHtml(song.level)}</span> ${escapeHtml(song.title)}</span><span class="nx-genre">${escapeHtml(song.genre || '')}</span></span>
            <button type="button" class="nx-remove" onclick="setInNext('${safeId}', false)" aria-label="${escapeHtml(song.title)} を次にやるから消す" title="消す">✕</button>
        </div>`;
    }).join('');
    box.innerHTML = `<div class="nx-head"><span class="nx-heading">▶ 次にやる</span><span class="nx-count">${list.length}曲</span></div>
        <div class="nx-search-wrap">
            <input type="search" id="next-search" placeholder="曲名・ジャンルで探して足す" autocomplete="off" oninput="updateNextSuggest()" value="${escapeHtml(query)}">
            <div id="next-suggest" class="nx-suggest" hidden></div>
        </div>
        ${rows || '<div class="nx-empty">まだありません。上の欄で探すか、曲のメモの「▶ 次にやる」で足せます。公式データを取り込んで記録が変わった曲は、自動で消えます。</div>'}`;
    if (query) updateNextSuggest();
}

function updateNextSuggest() {
    const input = document.getElementById('next-search');
    const box = document.getElementById('next-suggest');
    if (!input || !box) return;
    const terms = getSearchTerms(input.value);
    if (terms.length === 0) { box.hidden = true; box.innerHTML = ''; return; }
    const hits = songs.filter(s => songMatchesSearch(s, terms))
        .sort((a, b) => (parseInt(b.level, 10) || 0) - (parseInt(a.level, 10) || 0) || String(a.title).localeCompare(String(b.title), 'ja'));
    box.innerHTML = hits.length === 0
        ? '<div class="nx-suggest-none">見つかりません</div>'
        : hits.slice(0, NEXT_SUGGEST_MAX).map(s => {
            const on = isInNext(s.id);
            return `<button type="button" class="nx-suggest-item${on ? ' on' : ''}" onclick="pickNextSuggest('${jsStringAttr(s.id)}')">
                <span class="level-badge">${escapeHtml(s.level)}</span>
                <span class="nx-text"><span class="nx-title">${escapeHtml(s.title)}</span><span class="nx-genre">${escapeHtml(s.genre || '')}</span></span>
                <span class="nx-add">${on ? '入っています' : '＋ 足す'}</span>
            </button>`;
        }).join('') + (hits.length > NEXT_SUGGEST_MAX ? `<div class="nx-suggest-none">ほか ${hits.length - NEXT_SUGGEST_MAX}曲。もう少し詳しく入れてください</div>` : '');
    box.hidden = false;
}

function pickNextSuggest(songId) {
    if (!isInNext(songId)) setInNext(songId, true);
    const input = document.getElementById('next-search');
    if (input) { input.value = ''; input.focus(); }
    updateNextSuggest();
}
