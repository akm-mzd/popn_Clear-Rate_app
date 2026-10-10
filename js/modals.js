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
        const isValidUrl = m.imgUrl.startsWith('http') || m.imgUrl.startsWith('data:');
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

function openMedalModal(id) {
    currentMedalEditId = id;
    document.getElementById('medal-modal').style.display = 'flex';
}

function closeMedalModal() {
    currentMedalEditId = null;
    document.getElementById('medal-modal').style.display = 'none';
}

async function selectMedal(medalKey) {
    if (currentMedalEditId) {
        if (medalKey === '') {
            delete clearRecords[currentMedalEditId];
        } else {
            clearRecords[currentMedalEditId] = medalKey;
        }
        if (!allUsersData[currentUser]) allUsersData[currentUser] = { clearRecords: {}, scoreRecords: {}, memoRecords: {} };
        allUsersData[currentUser].clearRecords = clearRecords;
        scheduleAutoSave();   // ←追加
        renderTable();
        closeMedalModal();
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

    closeScoreModal();
    scheduleAutoSave();   // ←追加
    renderTable();
}

// --- メモ機能関連 ---
function openMemoModal(id) {
    const song = songs.find(s => s.id === id);
    if (!song) return;
    
    const memo = memoRecords[id] || {};
    
    document.getElementById('memo-modal-id').value = id;
    document.getElementById('memo-modal-title').innerText = `メモ: ${song.title}`;
    document.getElementById('memo-input-affinity').value = memo.affinity || '';
    document.getElementById('memo-input-sudden').value = memo.sudden || '';
    document.getElementById('memo-input-comment').value = memo.comment || '';
    
    document.getElementById('memo-modal').style.display = 'flex';
}

function closeMemoModal() {
    document.getElementById('memo-modal').style.display = 'none';
}

function clearMemo() {
    if(confirm('この楽曲のメモをすべてクリアしますか？')) {
        const id = document.getElementById('memo-modal-id').value;
        delete memoRecords[id];
        
        if (!allUsersData[currentUser]) allUsersData[currentUser] = { clearRecords: {}, scoreRecords: {}, memoRecords: {} };
        allUsersData[currentUser].memoRecords = memoRecords;

        closeMemoModal();
        scheduleAutoSave();   // ←追加
        renderTable();
    }
}

function saveMemoModal() {
    const id = document.getElementById('memo-modal-id').value;
    const affinity = document.getElementById('memo-input-affinity').value;
    const sudden = document.getElementById('memo-input-sudden').value.trim();
    const comment = document.getElementById('memo-input-comment').value.trim();

    if (affinity === '' && sudden === '' && comment === '') {
        delete memoRecords[id];
    } else {
        memoRecords[id] = { affinity, sudden, comment };
    }

    if (!allUsersData[currentUser]) allUsersData[currentUser] = { clearRecords: {}, scoreRecords: {}, memoRecords: {} };
    allUsersData[currentUser].memoRecords = memoRecords;

    closeMemoModal();
    scheduleAutoSave();   // ←追加
    renderTable();
}

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

    const medalDisplay = (medalInfo.imgUrl && (medalInfo.imgUrl.startsWith('http') || medalInfo.imgUrl.startsWith('data:')))
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
    document.getElementById('edit-version').value = "";
    document.getElementById('edit-bpm').value = "";
    document.getElementById('edit-notes').value = "";
    document.getElementById('edit-diff').value = "";
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
    document.getElementById('edit-version').value = song.version || "";
    document.getElementById('edit-bpm').value = song.bpm || "";
    document.getElementById('edit-notes').value = song.notes || 0;
    document.getElementById('edit-diff').value = song.diffRaw || "";
    document.getElementById('edit-banner-url').value = song.bannerUrl || "";
    document.getElementById('edit-wiki-url').value = song.wikiUrl || "";

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
    }

    updateDynamicFilters();
    renderTable();
    closeEditModal();
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
