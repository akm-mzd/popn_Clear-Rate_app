// ==========================================
// modals.js
// 各種モーダル（メダル選択・スコア入力・メモ・ランダムセレクト・楽曲の追加/編集）。
// ==========================================

function initMedalGrid() {
    const grid = document.getElementById('medal-grid');
    let html = '';
    
    const sortedMedalKeys = Object.keys(MEDAL_TYPES).sort((a, b) => MEDAL_TYPES[b].rank - MEDAL_TYPES[a].rank);
    
    sortedMedalKeys.forEach(k => {
        const m = MEDAL_TYPES[k];
        const isValidUrl = isImageSrc(m.imgUrl);
        const display = isValidUrl 
            ? `<img src="${m.imgUrl}" alt="${m.label}">` 
            : `<div class="fallback-text">${m.label}</div>`;
        
        html += `
            <div class="medal-item" onclick="selectMedal('${k}')">
                ${display}
                <div style="font-size: 0.8em; color: #555; font-weight: bold;">${m.label}</div>
            </div>
        `;
    });
    grid.innerHTML = html;
}

// メダルを選ぶ画面（メダルの一覧と、イージーの曲の裏メダルだけ）
function openMedalModal(id) {
    currentMedalEditId = id;
    const song = songs.find(s => s.id === id);
    document.getElementById('medal-modal-title').textContent = song ? `メダルを選択：${song.title}` : 'メダルを選択';
    renderUraMedalBox();
    document.getElementById('medal-modal').style.display = 'flex';
}

// ---------- 曲の詳細ページ（バナーを長押し）：曲の情報・今のメダル・最高スコア・最小BAD・メモ・この曲の記録 ----------
function openSongDetail(id) {
    const song = songs.find(s => s.id === id);
    if (!song) return;
    flushMemoText();
    currentDetailSongId = id;
    badBoxEditing = false;
    renderSongDetailHead();
    renderBadBox();
    renderMemoEditor('memo-editor-medal', id);
    // メモは最初は畳んでおく
    document.getElementById('memo-fold-medal').open = false;
    updateMemoFoldMark();
    renderSongHistoryBox(id, false);
    document.getElementById('song-detail-modal').style.display = 'flex';
    const content = document.querySelector('#song-detail-modal .modal-content');
    if (content) content.scrollTop = 0;
}

function closeSongDetail() {
    flushMemoText();
    currentDetailSongId = null;
    document.getElementById('song-detail-modal').style.display = 'none';
}

// バナーの長押し（0.5秒）で曲の詳細ページを開く。普通に押したときは今まで通り（攻略wiki など）
const BANNER_LONG_PRESS_MS = 500;
let bannerPress = null; // { sid, x, y, timer }
let bannerPressFired = false;
function cancelBannerPress() {
    if (bannerPress) clearTimeout(bannerPress.timer);
    bannerPress = null;
}
document.addEventListener('pointerdown', e => {
    cancelBannerPress();
    bannerPressFired = false;
    if (e.button !== undefined && e.button !== 0) return;
    const el = e.target.closest && e.target.closest('[data-sid]');
    if (!el) return;
    const sid = el.dataset.sid;
    bannerPress = {
        sid, x: e.clientX, y: e.clientY,
        timer: setTimeout(() => {
            bannerPress = null;
            if (!songs.find(s => s.id === sid)) return;
            bannerPressFired = true;
            openSongDetail(sid);
        }, BANNER_LONG_PRESS_MS)
    };
});
document.addEventListener('pointermove', e => {
    if (bannerPress && Math.hypot(e.clientX - bannerPress.x, e.clientY - bannerPress.y) > 10) cancelBannerPress();
});
['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, cancelBannerPress));
window.addEventListener('scroll', cancelBannerPress, true);
// 長押しのあとのクリック（攻略wiki を開くなど）と、長押しで出るメニューを止める
document.addEventListener('click', e => {
    if (!bannerPressFired) return;
    bannerPressFired = false;
    e.preventDefault();
    e.stopPropagation();
}, true);
document.addEventListener('contextmenu', e => {
    // PC の右クリックのメニューは残す（長押しの途中か、長押しが決まったときだけ止める）
    if ((bannerPress || bannerPressFired) && e.target.closest && e.target.closest('[data-sid]')) e.preventDefault();
});

function renderSongDetailHead() {
    const id = currentDetailSongId;
    const song = songs.find(s => s.id === id);
    const box = document.getElementById('sd-head');
    if (!song || !box) return;
    const safeId = jsStringAttr(id);
    const medalKey = clearRecords[id] || '';
    const bannerSrc = safeUrl(song.bannerUrl, true);
    const diffStyle = getDifficultyColor(song.diffClass, song.diffIndex);
    box.innerHTML = `
        ${bannerSrc ? `<img class="sd-banner" src="${escapeHtml(bannerSrc)}" alt="${escapeHtml(song.title)}">` : ''}
        <div class="sd-main">
            <button type="button" class="sd-medal${medalKey === '' ? ' is-empty' : ''}" onclick="openMedalModal('${safeId}')" title="押すとメダルを変更">${buildGridMedalInner(medalKey) || '<span>−</span>'}</button>
            <div class="sd-text">
                <div class="sd-genre">${escapeHtml(song.genre || '')}</div>
                <div class="sd-title">${escapeHtml(song.title)}</div>
                <div class="sd-meta"><span class="level-badge">${escapeHtml(song.level)}</span>
                    ${song.diffRaw ? `<span style="color: ${diffStyle.color}; text-shadow: ${diffStyle.shadow}; font-weight: bold;">${escapeHtml(song.diffRaw)}</span>` : ''}
                    <a href="${escapeHtml(getWikiUrl(song))}" target="_blank" rel="noopener noreferrer" class="sd-wiki">攻略wiki</a></div>
                ${getSongAttrs(song).length ? `<div class="song-attrs">${getSongAttrs(song).map(a => `<span>${escapeHtml(a)}</span>`).join('')}</div>` : ''}
            </div>
        </div>`;
}

// イージーの曲だけ：裏メダル（黒星・黒菱・黒丸）と旧筐体EC（ポックラは裏メダルで計算）
function renderUraMedalBox() {
    const box = document.getElementById('ura-medal-box');
    if (!box) return;
    const id = currentMedalEditId;
    if (!id || clearRecords[id] !== 'イージー') {
        box.style.display = 'none';
        box.innerHTML = '';
        return;
    }
    const info = getUraMedalInfo(id);
    const safeId = jsStringAttr(id);
    const btn = (value, label) => `<button type="button" class="ura-btn${info.ura === value ? ' active' : ''}" onclick="setUraMedalFromModal('${safeId}', '${value}')">${label}</button>`;
    box.innerHTML = `
        <div class="ura-title">裏メダル</div>
        <div class="ura-btns">${btn('', 'なし')}${URA_MEDALS.map(m => btn(m, m)).join('')}</div>
        <label class="ura-old${info.ura ? '' : ' is-disabled'}"><input type="checkbox"${info.old ? ' checked' : ''}${info.ura ? '' : ' disabled'} onchange="setUraOldFromModal('${safeId}', this.checked)"> 旧筐体EC（ポックラは裏メダルで計算）</label>`;
    box.style.display = '';
}

// 最小BAD（最高スコアと同じ形）：履歴（変更前・変更後）と今の記録の中で一番少ない数と、その日。「変更」でその場に入力欄
//   フルコンボ以上で記録が無ければ「0（フルコン）」。超EX のクリアしていない曲は「最高到達点BAD」（多いほど良い）
let badBoxEditing = false;

function renderBadBox() {
    const box = document.getElementById('bad-box');
    if (!box) return;
    const id = currentDetailSongId;
    if (!id) { box.innerHTML = ''; return; }
    const safeId = jsStringAttr(id);
    const song = songs.find(s => s.id === id);
    const medalInfo = MEDAL_TYPES[clearRecords[id] || ''] || MEDAL_TYPES[''];
    const reachMode = isSuperExSong(song) && !medalInfo.isNormalClear;
    const label = reachMode ? '最高到達点BAD' : '最小BAD';
    const cur = toBadNum((reachMode ? getBadReachRecords() : getBadRecords())[id]);
    if (badBoxEditing) {
        box.innerHTML = `<span class="bs-label">${label}</span>
            <input type="number" id="bad-input" class="bad-input" inputmode="numeric" min="0" max="9999" placeholder="未記録" value="${cur === null ? '' : cur}" onkeydown="if (event.key === 'Enter') saveBadBox('${safeId}')">
            <button type="button" class="bs-edit" onclick="saveBadBox('${safeId}')">保存</button>
            <button type="button" class="bs-edit bs-cancel" onclick="setBadBoxEditing(false)">やめる</button>`;
        const input = document.getElementById('bad-input');
        if (input) input.focus();
        return;
    }
    const editBtn = `<button type="button" class="bs-edit" onclick="setBadBoxEditing(true)">変更</button>`;
    let best = null; // { n, t（null は今の記録） }
    if (reachMode) {
        if (cur !== null) best = { n: cur, t: null };
    } else {
        getSongHistory(id).forEach(e => {
            if (!('nb' in e)) return;
            [toBadNum(e.nb), toBadNum(e.ob)].forEach(n => {
                if (n !== null && (!best || n < best.n || (n === best.n && e.t < best.t))) best = { n, t: e.t };
            });
        });
        if (cur !== null && (!best || cur < best.n)) best = { n: cur, t: null };
    }
    let valueHtml;
    if (best) {
        const d = best.t === null ? null : new Date(best.t);
        valueHtml = `<b class="bs-score">${best.n}</b><span class="bs-date">${d ? `（${d.getFullYear() % 100}/${d.getMonth() + 1}/${d.getDate()}）` : '（今の記録）'}</span>`;
    } else if (!reachMode && getSongBad(id) === 0) {
        valueHtml = '<b class="bs-score">0</b><span class="bs-date">（フルコン）</span>';
    } else {
        valueHtml = '<span class="bs-none">記録なし</span>';
    }
    box.innerHTML = `<span class="bs-label">${label}</span>${valueHtml}${editBtn}`;
}

function setBadBoxEditing(on) {
    badBoxEditing = !!on;
    renderBadBox();
}

function saveBadBox(id) {
    const input = document.getElementById('bad-input');
    const value = input ? input.value : '';
    const song = songs.find(s => s.id === id);
    const medalInfo = MEDAL_TYPES[clearRecords[id] || ''] || MEDAL_TYPES[''];
    badBoxEditing = false;
    if (isSuperExSong(song) && !medalInfo.isNormalClear) setBadReachFromModal(id, value);
    else setBadFromModal(id, value);
    renderBadBox();
}

function setBadReachFromModal(id, value) {
    const recs = getBadReachRecords();
    const n = toBadNum(value.trim() === '' ? null : value);
    if (n === null) delete recs[id]; else recs[id] = n;
    scheduleAutoSave();
    renderTable();
    renderBadBox();
}

// 楽曲データの編集：超EXTRA のチェック。入れると難易度の欄を「超EX」にして入力できなくする
function setEditSuperExState(on) {
    const cb = document.getElementById('edit-superex');
    const input = document.getElementById('edit-diff');
    if (cb) cb.checked = on;
    if (input) input.disabled = on;
}

function onEditSuperExChange(on) {
    document.getElementById('edit-diff').value = on ? SUPER_EX : '';
    setEditSuperExState(on);
}

function setBadFromModal(id, value) {
    if (!setSongBad(id, value.trim() === '' ? null : value, 'm')) return;
    scheduleAutoSave();
    renderTable();
    refreshSongHistoryViews(id);
}

function setUraMedalFromModal(id, ura) {
    const info = getUraMedalInfo(id);
    // 裏メダルを初めて付けるときは、旧筐体EC は外したまま（付けるかは自分で決める）
    setUraMedalInfo(id, ura, ura ? info.old : false);
    renderUraMedalBox();
}

function setUraOldFromModal(id, old) {
    setUraMedalInfo(id, getUraMedalInfo(id).ura, old);
    renderUraMedalBox();
}

function closeMedalModal() {
    flushMemoText();
    currentMedalEditId = null;
    document.getElementById('medal-modal').style.display = 'none';
}

async function selectMedal(medalKey) {
    if (currentMedalEditId) {
        addHistoryEntry(songs.find(s => s.id === currentMedalEditId), { medal: [clearRecords[currentMedalEditId] || '', medalKey] }, 'm');
        if (medalKey === '') {
            delete clearRecords[currentMedalEditId];
        } else {
            clearRecords[currentMedalEditId] = medalKey;
        }
        if (!allUsersData[currentUser]) allUsersData[currentUser] = { clearRecords: {}, scoreRecords: {}, memoRecords: {} };
        allUsersData[currentUser].clearRecords = clearRecords;
        scheduleAutoSave();   // ←追加
        renderTable();
        const id = currentMedalEditId;
        closeMedalModal();
        // 詳細ページから開いたときは、詳細も描き直す
        refreshSongHistoryViews(id);
    }
}

function openScoreModal(id) {
    const song = songs.find(s => s.id === id);
    if (!song) return;
    document.getElementById('score-modal-id').value = id;
    document.getElementById('score-modal-title').innerText = `${song.title} - スコア`;
    document.getElementById('score-input-val').value = scoreRecords[id] || '';
    document.getElementById('score-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('score-input-val').focus(), 50);
}

function closeScoreModal() {
    document.getElementById('score-modal').style.display = 'none';
}

async function saveScoreModal() {
    const id = document.getElementById('score-modal-id').value;
    const val = document.getElementById('score-input-val').value.trim();
    const oldScore = scoreRecords[id];
    
    if (val === '') {
        delete scoreRecords[id];
    } else {
        const num = parseInt(val, 10);
        if (isNaN(num) || num < 0 || num > 100000) {
            alert('スコアは0〜100000の間で入力してください。');
            return;
        }
        scoreRecords[id] = num;
    }
    
    if (!allUsersData[currentUser]) allUsersData[currentUser] = { clearRecords: {}, scoreRecords: {}, memoRecords: {} };
    allUsersData[currentUser].scoreRecords = scoreRecords;
    addHistoryEntry(songs.find(s => s.id === id), { score: [oldScore, scoreRecords[id]] }, 'm');

    closeScoreModal();
    scheduleAutoSave();   // ←追加
    renderTable();
    // 曲の画面から変えたときは、最高スコア・この曲の記録も描き直す
    if (typeof refreshSongHistoryViews === 'function') refreshSongHistoryViews(id);
}

// --- メモ：js/memo.js ---

// --- ランダム選曲機能関連 ---
function openRandomModal() {
    toggleMenu(false); // 結果が隠れないようメニューを閉じる
    const levels = [...new Set(songs.map(s => s.level))].filter(l => l).sort((a,b)=>b-a);
    let levelHtml = '';
    levels.forEach(l => {
        levelHtml += `<label class="check-label"><input type="checkbox" class="rand-level" value="${escapeHtml(l)}"> Lv${escapeHtml(l)}</label>`;
    });
    document.getElementById('random-level-checkboxes').innerHTML = levelHtml;

    let medalHtml = `<label class="check-label"><input type="checkbox" class="rand-medal" value=""> (未プレイ)</label>`;
    
    const sortedMedalKeys = Object.keys(MEDAL_TYPES)
        .filter(k => k !== '' && k !== '未解禁')
        .sort((a, b) => MEDAL_TYPES[b].rank - MEDAL_TYPES[a].rank);
    
    sortedMedalKeys.forEach(k => {
        medalHtml += `<label class="check-label"><input type="checkbox" class="rand-medal" value="${k}"> ${MEDAL_TYPES[k].label}</label>`;
    });
    document.getElementById('random-medal-checkboxes').innerHTML = medalHtml;

    const diffs = ['危険', '別格', '詐称', '強', '中(+)', '中(-)', '弱', '逆詐称', '入門', '未分類'];
    let diffHtml = '';
    diffs.forEach(d => {
        diffHtml += `<label class="check-label"><input type="checkbox" class="rand-diff" value="${d}"> ${d}</label>`;
    });
    document.getElementById('random-diff-checkboxes').innerHTML = diffHtml;

    document.getElementById('random-result-area').style.display = 'none';
    document.getElementById('random-modal').style.display = 'flex';
}

function closeRandomModal() {
    document.getElementById('random-modal').style.display = 'none';
}

function executeRandomSelect() {
    const selectedLevels = Array.from(document.querySelectorAll('.rand-level:checked')).map(cb => cb.value);
    const selectedMedals = Array.from(document.querySelectorAll('.rand-medal:checked')).map(cb => cb.value);
    const selectedDiffs = Array.from(document.querySelectorAll('.rand-diff:checked')).map(cb => cb.value);

    const filtered = songs.filter(song => {
        if (selectedLevels.length > 0 && !selectedLevels.includes(song.level)) return false;

        const medalKey = clearRecords[song.id] || '';
        if (selectedMedals.length > 0 && !selectedMedals.includes(medalKey)) return false;

        let dClass = song.diffClass || '未分類';
        if (dClass === '中') {
            dClass = (song.diffIndex !== null && song.diffIndex < 0) ? '中(-)' : '中(+)';
        }
        if (selectedDiffs.length > 0 && !selectedDiffs.includes(dClass)) return false;

        return true;
    });

    const resultArea = document.getElementById('random-result-area');
    resultArea.style.display = 'block';

    if (filtered.length === 0) {
        resultArea.innerHTML = `<div style="color: #d32f2f; font-weight: bold; padding: 10px;">条件に合致する楽曲がありません。</div>`;
        return;
    }

    const randomIndex = Math.floor(Math.random() * filtered.length);
    const song = filtered[randomIndex];
    
    const medalKey = clearRecords[song.id] || '';
    const medalInfo = MEDAL_TYPES[medalKey] || MEDAL_TYPES[''];
    
    const bannerSrc = safeUrl(song.bannerUrl, true);
    const bannerHtml = bannerSrc
        ? `<img src="${escapeHtml(bannerSrc)}" style="max-width: 100%; height: auto; max-height: 60px; border-radius: 4px; margin-bottom: 10px;" />`
        : ``;

    let dClassStr = song.diffClass || '';
    let dIndexStr = song.diffRaw.replace(dClassStr, '').trim();
    if (!song.diffRaw.includes(dClassStr)) { dClassStr = song.diffRaw; dIndexStr = ''; }
    const styleObj = getDifficultyColor(song.diffClass, song.diffIndex);

    const medalDisplay = (medalInfo.imgUrl && isImageSrc(medalInfo.imgUrl))
        ? `<img src="${medalInfo.imgUrl}" style="width:24px; height:24px; object-fit:contain; vertical-align:middle;">`
        : `<span style="font-size:0.9em; color:#555;">[${medalInfo.label}]</span>`;

    resultArea.innerHTML = `
        <div style="font-size: 0.9em; color: #666; margin-bottom: 10px;">🎵 抽選結果 (${filtered.length}曲中から)</div>
        ${bannerHtml}
        <div style="font-size: 0.85em; color: #666;">${escapeHtml(song.genre)}</div>
        <div style="font-size: 1.3em; font-weight: bold; margin: 8px 0; color: #333;">${escapeHtml(song.title)}</div>
        <div style="display: flex; justify-content: center; gap: 12px; margin-top: 10px; align-items: center;">
            <span class="level-badge" style="font-size: 1.1em; padding: 4px 10px;">Lv ${escapeHtml(song.level)}</span>
            <div style="color: ${styleObj.color}; text-shadow: ${styleObj.shadow}; font-weight: bold; font-size: 1.2em;">
                ${escapeHtml(dClassStr)}<span style="font-size: 0.6em; margin-left: 2px;">${escapeHtml(dIndexStr)}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px; font-weight: bold;">
                ${medalDisplay}
            </div>
        </div>
    `;
}

function openAddModal() {
    if (!checkAdminAuth()) return;

    document.getElementById('edit-modal-title').innerText = "楽曲データの新規追加";
    document.getElementById('edit-delete-btn').style.display = 'none';

    document.getElementById('edit-original-id').value = "";
    document.getElementById('edit-genre').value = "";
    document.getElementById('edit-title').value = "";
    document.getElementById('edit-level').value = document.getElementById('import-level').value || "48";
    document.getElementById('edit-pokkura-level').value = "";
    setEditFcSelect(null);
    document.getElementById('edit-version').value = "";
    document.getElementById('edit-bpm').value = "";
    document.getElementById('edit-notes').value = "";
    document.getElementById('edit-diff').value = "";
    setEditSuperExState(false);
    document.getElementById('edit-wiki-url').value = "";
    document.getElementById('edit-banner-url').value = "";

    document.getElementById('edit-modal').style.display = 'flex';
}

function openEditModal(id) {
    if (!checkAdminAuth()) return;

    const song = songs.find(s => s.id === id);
    if (!song) return;

    document.getElementById('edit-modal-title').innerText = "楽曲データの編集";
    document.getElementById('edit-delete-btn').style.display = '';

    document.getElementById('edit-original-id').value = song.id;
    document.getElementById('edit-genre').value = song.genre;
    document.getElementById('edit-title').value = song.title;
    document.getElementById('edit-level').value = song.level || "";
    document.getElementById('edit-pokkura-level').value = song.pokkuraLevel || "";
    setEditFcSelect(getSongFc(song));
    document.getElementById('edit-version').value = song.version || "";
    document.getElementById('edit-bpm').value = song.bpm || "";
    document.getElementById('edit-notes').value = song.notes || 0;
    document.getElementById('edit-diff').value = song.diffRaw || "";
    setEditSuperExState(isSuperExSong(song));
    document.getElementById('edit-banner-url').value = song.bannerUrl || "";
    document.getElementById('edit-wiki-url').value = song.wikiUrl || "";
    document.getElementById('edit-attrs').value = getSongAttrs(song).join('、');

    document.getElementById('edit-modal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
}

async function deleteSong() {
    if (!checkAdminAuth()) return;

    if(confirm("この楽曲をリストから削除しますか？\n（全ユーザーの記録も同時に削除されます）")) {
        const originalId = document.getElementById('edit-original-id').value;
        songs = songs.filter(s => s.id !== originalId);
        
        for(let u in allUsersData) {
            delete allUsersData[u].clearRecords[originalId];
            if (allUsersData[u].scoreRecords) delete allUsersData[u].scoreRecords[originalId];
            if (allUsersData[u].memoRecords) delete allUsersData[u].memoRecords[originalId];
        }
        clearRecords = allUsersData[currentUser].clearRecords;
        scoreRecords = allUsersData[currentUser].scoreRecords;
        memoRecords = allUsersData[currentUser].memoRecords;
        
        updateDynamicFilters();
        renderTable();
        closeEditModal();
        // 楽曲リストもクラウドに保存する（しないと、読み込み直したときに元に戻る）
        await saveToCloud(true);
    }
}

async function saveEditModal() {
    if (!checkAdminAuth()) return;

    const originalId = document.getElementById('edit-original-id').value;
    const isNew = (originalId === ""); 

    const newGenre = document.getElementById('edit-genre').value.trim();
    const newTitle = document.getElementById('edit-title').value.trim();
    const newNotes = parseInt(document.getElementById('edit-notes').value, 10) || 0;
    
    if (!newGenre && !newTitle) {
        alert("ジャンル名または曲名を入力してください。");
        return;
    }

    const newId = newGenre + "_" + newTitle + "_" + newNotes;
    const newLevel = document.getElementById('edit-level').value.trim();
    const newVersion = document.getElementById('edit-version').value.trim();
    const newBpm = document.getElementById('edit-bpm').value.trim();
    const newBannerUrl = document.getElementById('edit-banner-url').value.trim();
    const newWikiUrl = document.getElementById('edit-wiki-url').value.trim();
    const newDiffRaw = document.getElementById('edit-diff').value.trim();
    const parsed = parseDifficulty(newDiffRaw);
    // ポックラ反映時のレベル：Lv と違うときだけ曲データに入れる（空欄・同じなら消す）
    const newPokkuraLevel = document.getElementById('edit-pokkura-level').value.trim().replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    if (newPokkuraLevel !== '' && !(/^\d+$/.test(newPokkuraLevel) && +newPokkuraLevel >= 1 && +newPokkuraLevel <= 50)) {
        alert("ポックラ反映時のレベルは 1〜50 の数字で入力してください（Lvと同じなら空欄）。");
        return;
    }
    const applyPokkuraLevel = (song) => {
        if (newPokkuraLevel === '' || newPokkuraLevel === String(song.level)) delete song.pokkuraLevel;
        else song.pokkuraLevel = newPokkuraLevel;
    };

    if (isNew) {
        if (songs.some(s => s.id === newId)) {
            alert("同じジャンル・曲名・ノーツ数の楽曲が既に存在します。");
            return;
        }
        songs.push({
            id: newId,
            genre: newGenre,
            title: newTitle,
            level: newLevel,
            version: newVersion,
            bpm: newBpm,
            notes: newNotes,
            diffRaw: newDiffRaw,
            diffClass: parsed.diffClass,
            diffIndex: parsed.diffIndex,
            bannerUrl: newBannerUrl,
            wikiUrl: newWikiUrl,
            originalOrder: songs.length
        });
        applyPokkuraLevel(songs[songs.length - 1]);
        applyEditFc(songs[songs.length - 1]);
        setSongAttrs(songs[songs.length - 1], parseAttrText(document.getElementById('edit-attrs').value));
        alert("楽曲を新規追加しました！");
    } else {
        const songIndex = songs.findIndex(s => s.id === originalId);
        if (songIndex === -1) return;

        if (newId !== originalId) {
            for(let u in allUsersData) {
                if (allUsersData[u].clearRecords[originalId] !== undefined) {
                    allUsersData[u].clearRecords[newId] = allUsersData[u].clearRecords[originalId];
                    delete allUsersData[u].clearRecords[originalId];
                }
                if (allUsersData[u].scoreRecords && allUsersData[u].scoreRecords[originalId] !== undefined) {
                    allUsersData[u].scoreRecords[newId] = allUsersData[u].scoreRecords[originalId];
                    delete allUsersData[u].scoreRecords[originalId];
                }
                if (allUsersData[u].memoRecords && allUsersData[u].memoRecords[originalId] !== undefined) {
                    allUsersData[u].memoRecords[newId] = allUsersData[u].memoRecords[originalId];
                    delete allUsersData[u].memoRecords[originalId];
                }
            }
            clearRecords = allUsersData[currentUser].clearRecords;
            scoreRecords = allUsersData[currentUser].scoreRecords;
            memoRecords = allUsersData[currentUser].memoRecords;
            songs[songIndex].id = newId;
        }

        songs[songIndex].genre = newGenre;
        songs[songIndex].title = newTitle;
        songs[songIndex].level = newLevel;
        songs[songIndex].version = newVersion;
        songs[songIndex].bpm = newBpm;
        songs[songIndex].notes = newNotes;
        songs[songIndex].bannerUrl = newBannerUrl;
        songs[songIndex].wikiUrl = newWikiUrl;
        songs[songIndex].diffRaw = newDiffRaw;
        songs[songIndex].diffClass = parsed.diffClass;
        songs[songIndex].diffIndex = parsed.diffIndex;
        applyPokkuraLevel(songs[songIndex]);
        applyEditFc(songs[songIndex]);
        setSongAttrs(songs[songIndex], parseAttrText(document.getElementById('edit-attrs').value));
    }

    updateDynamicFilters();
    renderTable();
    closeEditModal();
    // 楽曲リストもクラウドに保存する（しないと、読み込み直したときに元に戻る）
    await saveToCloud(true);
}

// 楽曲編集の「フルコン難易度」：値を変えたら、その値の中の一番最後（一番弱い）に入れる
function setEditFcSelect(fc) {
    const sel = document.getElementById('edit-fc');
    sel.innerHTML = '<option value="">なし（未定）</option>' + FC_VALUES.map(v => `<option value="${v}">${v > 1.05 ? '別格 ' : ''}${formatFcValue(v)}</option>`).join('');
    sel.value = fc ? String(fc.v) : '';
}

function applyEditFc(song) {
    const raw = document.getElementById('edit-fc').value;
    const cur = getSongFc(song);
    if (raw === '') { delete song.fc; return; }
    const v = Math.round(parseFloat(raw) * 10) / 10;
    if (cur && Math.abs(cur.v - v) < 0.001) return;
    const last = songs.reduce((m, s) => { const f = s !== song && String(s.level) === String(song.level) ? getSongFc(s) : null; return f && Math.abs(f.v - v) < 0.001 ? Math.max(m, f.o) : m; }, -1);
    song.fc = { v, o: last + 1 };
}

function handleBannerFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = async function() {
            const MAX_WIDTH = 250;
            let width = img.width;
            let height = img.height;

            if (width > MAX_WIDTH) {
                height = Math.round(height * (MAX_WIDTH / width));
                width = MAX_WIDTH;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const dataUrl = canvas.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png');

            // ★変更：Base64のまま埋め込まず、クラウドにアップロードしてURL化する
            showLoading(true, '画像をアップロード中...');
            const uploadedUrl = await uploadImageToCloud(dataUrl, 'banner');
            showLoading(false);

            if (uploadedUrl) {
                document.getElementById('edit-banner-url').value = uploadedUrl;
            } else {
                document.getElementById('edit-banner-url').value = dataUrl;
                alert('クラウドへの画像アップロードに失敗したため、一時的にローカル画像（Base64）として保存します。\n通信環境を確認のうえ、後でもう一度アップロードし直すことをおすすめします。');
            }

            event.target.value = '';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
