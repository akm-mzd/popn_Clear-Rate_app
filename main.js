// ==========================================
// ★クラウド同期設定（GAS）と管理者パスワード
// ==========================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxHiAAGAO39wPDRMeavONe93xQDj9ULCCyi-VNqkV3a866gyahctinmXSjFO72hfEohCg/exec';

// ★ 楽曲リストの編集用パスワード
const ADMIN_PASSWORD = "1005"; 
// ==========================================

const STORAGE_KEY_SONGS = 'popn_songs_data_v2';
const STORAGE_KEY_CLEARS = 'popn_clear_data_v2';
const STORAGE_KEY_SCORES = 'popn_score_data_v2';
const STORAGE_KEY_MEMOS = 'popn_memo_data_v2';

let songs = [];
let allUsersData = {}; 
let currentUser = localStorage.getItem('popn_current_user') || "Guest";
let clearRecords = {}; 
let scoreRecords = {}; 
let memoRecords = {}; 

let isAdminAuthenticated = false;

function checkAdminAuth() {
    if (isAdminAuthenticated) return true;
    const pwd = prompt("この操作には管理者用パスワードが必要です．パスワードを入力してください:");
    if (pwd === ADMIN_PASSWORD) {
        isAdminAuthenticated = true;
        return true;
    } else {
        alert("パスワードが違います．操作はキャンセルされました．");
        return false;
    }
}

const MEDAL_TYPES = {
    '':         { imgUrl: 'URLをペースト', label: '未プレイ', rank: 0, isKuroHishiClear: false, isKuroBoshiClear: false, isEasyClear: false, isNormalClear: false },
    '未解禁':   { imgUrl: '', label: '未解禁', rank: -1, isKuroHishiClear: false, isKuroBoshiClear: false, isEasyClear: false, isNormalClear: false, excludeFromRate: true },
    '黒丸':     { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/groove_02.png', label: '黒丸', rank: 1, isKuroHishiClear: false, isKuroBoshiClear: false, isEasyClear: false, isNormalClear: false },
    '黒菱':     { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/groove_01.png', label: '黒菱', rank: 2, isKuroHishiClear: true, isKuroBoshiClear: false, isEasyClear: false, isNormalClear: false },
    '黒星':     { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/groove_00.png', label: '黒星', rank: 3, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: false, isNormalClear: false },
    'イージー': { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/easy.png', label: 'イージー', rank: 4, isKuroHishiClear: false, isKuroBoshiClear: false, isEasyClear: true, isNormalClear: false },
    'ロングオフ': { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/long_off.png', label: 'ロングオフ', rank: 5, isKuroHishiClear: false, isKuroBoshiClear: false, isEasyClear: true, isNormalClear: true },
    '銅丸':     { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/bad_02.png', label: '銅丸', rank: 6, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: true, isNormalClear: true },
    '銅菱':     { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/bad_01.png', label: '銅菱', rank: 7, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: true, isNormalClear: true },
    '銅星':     { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/bad_00.png', label: '銅星', rank: 8, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: true, isNormalClear: true },
    '銀丸':     { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/full_combo_02.png', label: '銀丸', rank: 9, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: true, isNormalClear: true },
    '銀菱':     { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/full_combo_01.png', label: '銀菱', rank: 10, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: true, isNormalClear: true },
    '銀星':     { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/full_combo_00.png', label: '銀星', rank: 11, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: true, isNormalClear: true },
    '金星':     { imgUrl: 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/howto/more/perfect_00.png', label: '金星', rank: 12, isKuroHishiClear: true, isKuroBoshiClear: true, isEasyClear: true, isNormalClear: true }
};

const MEDAL_COLORS = {
    '': '#e0e0e0',
    '未解禁': '#212121',
    '黒丸': '#283593', 
    '黒菱': '#1a237e', 
    '黒星': '#000051', 
    'イージー': '#4caf50', 
    'ロングオフ': '#ff9800', 
    '銅丸': '#8d6e63', 
    '銅菱': '#795548', 
    '銅星': '#5d4037', 
    '銀丸': '#bdbdbd', 
    '銀菱': '#9e9e9e', 
    '銀星': '#757575', 
    '金星': '#ffd700'
};

function generatePieChartBase64(data, size = 240) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    let total = data.reduce((sum, d) => sum + d.count, 0);
    let currentAngle = -0.5 * Math.PI;
    
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2;

    if (total === 0) {
        ctx.fillStyle = '#e0e0e0';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();
        return canvas.toDataURL();
    }

    data.forEach(d => {
        let sliceAngle = (d.count / total) * 2 * Math.PI;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
        ctx.closePath();
        ctx.fill();
        currentAngle += sliceAngle;
    });

    return canvas.toDataURL();
}

let currentMedalEditId = null;
let currentSort = window.innerWidth <= 768 ? 'diff' : 'version';
let sortDesc = window.innerWidth <= 768 ? true : false;
let currentViewLevel = '48';

function showLoading(show, text = '通信中...') {
    document.getElementById('loading-text').innerText = text;
    document.getElementById('loading').style.display = show ? 'flex' : 'none';
}

window.onload = async () => {
    if (GAS_URL && GAS_URL.trim() !== '') {
        showLoading(true, 'データを取得中...');
        try {
            const response = await fetch(GAS_URL);
            if (!response.ok) throw new Error('Network error');
            const fetchedData = await response.json();
            
            if (fetchedData && fetchedData.songs) {
                songs = fetchedData.songs;
                allUsersData = fetchedData.users || {};
                
                if (Object.keys(allUsersData).length === 0) {
                    allUsersData["Guest"] = { clearRecords: {}, scoreRecords: {}, memoRecords: {} };
                }
                
                for (let u in allUsersData) {
                    if (!allUsersData[u].scoreRecords) allUsersData[u].scoreRecords = {};
                    if (!allUsersData[u].memoRecords) allUsersData[u].memoRecords = {};
                }
                
                if (allUsersData[currentUser]) {
                    clearRecords = allUsersData[currentUser].clearRecords || {};
                    scoreRecords = allUsersData[currentUser].scoreRecords || {};
                    memoRecords = allUsersData[currentUser].memoRecords || {};
                } else {
                    currentUser = "Guest";
                    localStorage.setItem('popn_current_user', currentUser);
                    if(!allUsersData["Guest"]) allUsersData["Guest"] = { clearRecords: {}, scoreRecords: {}, memoRecords: {} };
                    clearRecords = allUsersData[currentUser].clearRecords;
                    scoreRecords = allUsersData[currentUser].scoreRecords;
                    memoRecords = allUsersData[currentUser].memoRecords || {};
                }
            }
        } catch (error) {
            console.warn('クラウドからの読み込みに失敗しました。ローカルデータを使用します。', error);
            songs = JSON.parse(localStorage.getItem(STORAGE_KEY_SONGS)) || [];
            allUsersData = { "Guest": { 
                clearRecords: JSON.parse(localStorage.getItem(STORAGE_KEY_CLEARS)) || {},
                scoreRecords: JSON.parse(localStorage.getItem(STORAGE_KEY_SCORES)) || {},
                memoRecords: JSON.parse(localStorage.getItem(STORAGE_KEY_MEMOS)) || {}
            } };
            currentUser = "Guest";
            clearRecords = allUsersData["Guest"].clearRecords;
            scoreRecords = allUsersData["Guest"].scoreRecords;
            memoRecords = allUsersData["Guest"].memoRecords;
        }
        showLoading(false);
    } else {
        songs = JSON.parse(localStorage.getItem(STORAGE_KEY_SONGS)) || [];
        allUsersData = { "Guest": { 
            clearRecords: JSON.parse(localStorage.getItem(STORAGE_KEY_CLEARS)) || {},
            scoreRecords: JSON.parse(localStorage.getItem(STORAGE_KEY_SCORES)) || {},
            memoRecords: JSON.parse(localStorage.getItem(STORAGE_KEY_MEMOS)) || {}
        } };
        currentUser = "Guest";
        clearRecords = allUsersData["Guest"].clearRecords;
        scoreRecords = allUsersData["Guest"].scoreRecords;
        memoRecords = allUsersData["Guest"].memoRecords;
    }

    songs.forEach(s => {
        if (!s.level) { s.level = '48'; }
        const reporsed = parseDifficulty(s.diffRaw);
        if(s.diffClass !== reporsed.diffClass || s.diffIndex !== reporsed.diffIndex) {
            s.diffClass = reporsed.diffClass;
            s.diffIndex = reporsed.diffIndex;
        }
        const expectedId = s.genre + "_" + s.title + "_" + s.notes;
        if (s.id !== expectedId) {
            if (clearRecords[s.id] !== undefined) {
                clearRecords[expectedId] = clearRecords[s.id];
                delete clearRecords[s.id];
            }
            if (scoreRecords[s.id] !== undefined) {
                scoreRecords[expectedId] = scoreRecords[s.id];
                delete scoreRecords[s.id];
            }
            if (memoRecords[s.id] !== undefined) {
                memoRecords[expectedId] = memoRecords[s.id];
                delete memoRecords[s.id];
            }
            s.id = expectedId;
        }
    });

    initUserSelector();
    updateCompareUserSelect();
    initFilters();
    initMedalGrid();
    renderTable();
};

function initUserSelector() {
    const select = document.getElementById('current-user-select');
    select.innerHTML = "";
    const users = Object.keys(allUsersData);
    
    users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u;
        opt.text = u;
        if (u === currentUser) opt.selected = true;
        select.appendChild(opt);
    });
}

function updateCompareUserSelect() {
    const select = document.getElementById('compare-user-select');
    if (!select) return;
    const currentUserSelection = select.value;
    select.innerHTML = '<option value="">-- 対象を選択 --</option>';
    const users = Object.keys(allUsersData);
    users.forEach(u => {
        if (u !== currentUser) {
            const opt = document.createElement('option');
            opt.value = u;
            opt.text = u;
            if (u === currentUserSelection) opt.selected = true;
            select.appendChild(opt);
        }
    });
}

function switchUser() {
    currentUser = document.getElementById('current-user-select').value;
    localStorage.setItem('popn_current_user', currentUser);
    clearRecords = allUsersData[currentUser]?.clearRecords || {};
    scoreRecords = allUsersData[currentUser]?.scoreRecords || {};
    memoRecords = allUsersData[currentUser]?.memoRecords || {};
    updateCompareUserSelect();
    renderTable();
}

function addNewUser() {
    const name = prompt("新しいユーザー名を入力してください:\n（例: お名前、ライバルの名前など）");
    if (!name) return;
    if (allUsersData[name]) {
        alert("その名前は既に存在します。");
        return;
    }
    currentUser = name;
    allUsersData[name] = { clearRecords: {}, scoreRecords: {}, memoRecords: {} };
    localStorage.setItem('popn_current_user', name);
    initUserSelector();
    updateCompareUserSelect();
    switchUser();
}

async function manualSaveToCloud() {
    if (!GAS_URL || GAS_URL.trim() === '') {
        alert("クラウド保存先のURLが設定されていません。");
        return;
    }
    const mode = prompt(`何をクラウドに保存（同期）しますか？\n\n1 : 現在のユーザー [${currentUser}] の記録（クリア・スコア・メモ）\n2 : 楽曲リスト全体（※管理者パスワード必須）\n3 : 両方\n\n半角数字の 1, 2, 3 のいずれかを入力してください。`, "1");

    if (mode !== "1" && mode !== "2" && mode !== "3") {
        return; 
    }

    let success1 = true;
    let success2 = true;

    if (mode === "1" || mode === "3") {
        success1 = await saveToCloud(false);
    }
    if (mode === "2" || mode === "3") {
        if (!checkAdminAuth()) return;
        success2 = await saveToCloud(true);
    }
    
    if (success1 && success2) {
        alert("クラウドへの保存が完了しました！");
    }
}

async function saveToCloud(isSongUpdate = false) {
    if (!GAS_URL || GAS_URL.trim() === '') return false;

    showLoading(true, 'クラウドに保存中...');
    let isSuccess = false;
    try {
        const payload = {
            type: isSongUpdate ? "updateSongs" : "updateClears",
            targetUser: currentUser,
            songs: isSongUpdate ? songs : [], 
            clearRecords: clearRecords,
            scoreRecords: scoreRecords,
            memoRecords: memoRecords
        };

        if (isSongUpdate) {
            payload.password = ADMIN_PASSWORD;
        }

        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        if (result.status === 'error') {
            alert(result.message);
        } else {
            if (!isSongUpdate) {
                if (!allUsersData[currentUser]) allUsersData[currentUser] = { clearRecords: {}, scoreRecords: {}, memoRecords: {} };
                allUsersData[currentUser].clearRecords = clearRecords;
                allUsersData[currentUser].scoreRecords = scoreRecords;
                allUsersData[currentUser].memoRecords = memoRecords;
            }
            isSuccess = true;
        }
    } catch (e) {
        console.error("クラウド保存エラー:", e);
        alert("通信エラーが発生しました。サイトを 更新しない で、保存が完了するまで試してください。");
    }
    showLoading(false);
    return isSuccess;
}

async function syncLocalToCloud() {
    if (!GAS_URL || GAS_URL.trim() === '') {
        alert("GAS_URLが設定されていません。先にGASのデプロイとURLの貼り付けを行ってください。");
        return;
    }
    
    if (currentUser === "Guest") {
        alert("「Guest」ユーザーにはデータを上書きできません。\n右上の「+ 新規追加」からユーザーを作成し、選択してから実行してください。");
        return;
    }

    const localSongs = JSON.parse(localStorage.getItem(STORAGE_KEY_SONGS)) || [];
    const localClears = JSON.parse(localStorage.getItem(STORAGE_KEY_CLEARS)) || {};
    const localScores = JSON.parse(localStorage.getItem(STORAGE_KEY_SCORES)) || {};
    const localMemos = JSON.parse(localStorage.getItem(STORAGE_KEY_MEMOS)) || {};
    
    if (localSongs.length === 0 && Object.keys(localClears).length === 0) {
        alert("このデバイス（ブラウザ）にデータが見つかりません。");
        return;
    }

    const mode = prompt(`何をクラウドに同期（上書き）しますか？\n\n1 : 現在のユーザー [${currentUser}] の記録だけを移行\n2 : 楽曲リスト全体を移行（※管理者パスワード必須）\n3 : 両方移行\n\n半角数字の 1, 2, 3 のいずれかを入力してください。`, "1");

    if (mode !== "1" && mode !== "2" && mode !== "3") {
        return; 
    }

    if (mode === "1" || mode === "3") {
        if (!confirm(`このデバイスに保存されている記録を、ユーザー [${currentUser}] のデータとしてクラウドに上書きしますか？`)) return;
        
        showLoading(true, `ユーザー [${currentUser}] の記録を移行中...`);
        try {
            const payload = {
                type: "updateClears",
                targetUser: currentUser,
                clearRecords: localClears,
                scoreRecords: localScores,
                memoRecords: localMemos
            };
            const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
            const result = await res.json();
            
            if (result.status === 'error') {
                alert("記録の移行エラー: " + result.message);
                showLoading(false);
                return;
            } else {
                clearRecords = localClears;
                scoreRecords = localScores;
                memoRecords = localMemos;
                if (!allUsersData[currentUser]) allUsersData[currentUser] = { clearRecords: {}, scoreRecords: {}, memoRecords: {} };
                allUsersData[currentUser].clearRecords = clearRecords;
                allUsersData[currentUser].scoreRecords = scoreRecords;
                allUsersData[currentUser].memoRecords = memoRecords;
                alert(`ユーザー [${currentUser}] への記録の移行が完了しました！`);
            }
        } catch (e) {
            alert("通信エラーが発生しました。");
            showLoading(false);
            return;
        }
    }

    if (mode === "2" || mode === "3") {
        if (!checkAdminAuth()) {
            showLoading(false);
            renderTable();
            return;
        }

        showLoading(true, '楽曲リスト全体を移行中...');
        try {
            const payload = {
                type: "updateSongs",
                targetUser: currentUser, 
                password: ADMIN_PASSWORD,
                songs: localSongs
            };
            const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
            const result = await res.json();
            
            if (result.status === 'error') {
                alert("楽曲リストの移行エラー: " + result.message);
            } else {
                songs = localSongs;
                alert("楽曲リスト全体の移行が完了しました！");
            }
        } catch (e) {
            alert("通信エラーが発生しました。");
        }
    }

    showLoading(false);
    renderTable();
}

function initFilters() {
    const medalSelect = document.getElementById('filter-medal');
    medalSelect.innerHTML = '<option value="ALL">すべて</option>';
    
    const sortedMedalKeys = Object.keys(MEDAL_TYPES)
        .filter(k => k !== '')
        .sort((a, b) => MEDAL_TYPES[b].rank - MEDAL_TYPES[a].rank);
        
    sortedMedalKeys.forEach(k => {
        const option = document.createElement('option');
        option.value = k;
        option.text = MEDAL_TYPES[k].label;
        medalSelect.appendChild(option);
    });
    const optionUnplayed = document.createElement('option');
    optionUnplayed.value = 'unplayed';
    optionUnplayed.text = '未プレイ';
    medalSelect.appendChild(optionUnplayed);
    
    updateDynamicFilters();
}

function updateDynamicFilters() {
    const versionSelect = document.getElementById('filter-version');
    if (versionSelect) {
        const currentVer = versionSelect.value;
        versionSelect.innerHTML = '<option value="ALL">すべて</option>';
        const versions = [...new Set(songs.map(s => s.version))].filter(v => v).sort((a, b) => getVersionSortValue(a) - getVersionSortValue(b));
        versions.forEach(v => {
            const option = document.createElement('option');
            option.value = v;
            option.text = v;
            versionSelect.appendChild(option);
        });
        if (versions.includes(currentVer)) {
            versionSelect.value = currentVer;
        }
    }

    const viewLevelContainer = document.getElementById('view-level-buttons');
    if (viewLevelContainer) {
        viewLevelContainer.innerHTML = '';
        
        const allBtn = document.createElement('button');
        allBtn.className = `level-btn ${currentViewLevel === 'ALL' ? 'active' : ''}`;
        allBtn.innerText = 'すべて';
        allBtn.onclick = () => changeViewLevel('ALL');
        viewLevelContainer.appendChild(allBtn);
        
        const levels = [...new Set(songs.map(s => s.level))].filter(l => l);
        levels.sort((a, b) => {
            const numA = parseInt(a, 10);
            const numB = parseInt(b, 10);
            if (!isNaN(numA) && !isNaN(numB)) return numB - numA;
            if (isNaN(numA)) return 1;
            if (isNaN(numB)) return -1;
            return 0;
        });
        
        if (currentViewLevel !== 'ALL' && !levels.includes(currentViewLevel)) {
            currentViewLevel = 'ALL';
            allBtn.classList.add('active');
        }
        
        levels.forEach(l => {
            const btn = document.createElement('button');
            btn.className = `level-btn ${currentViewLevel === l ? 'active' : ''}`;
            btn.innerText = isNaN(parseInt(l, 10)) ? l : `Lv${l}`;
            btn.onclick = () => changeViewLevel(l);
            viewLevelContainer.appendChild(btn);
        });
    }
}

function resetFilters() {
    document.getElementById('filter-clear').value = 'ALL';
    document.getElementById('filter-medal').value = 'ALL';
    document.getElementById('filter-version').value = 'ALL';
    document.getElementById('filter-diff').value = 'ALL';
    document.getElementById('filter-affinity').value = 'ALL';
    renderTable();
}

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
        localStorage.setItem(STORAGE_KEY_MEMOS, JSON.stringify(memoRecords));

        closeMemoModal();
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
    localStorage.setItem(STORAGE_KEY_MEMOS, JSON.stringify(memoRecords));

    closeMemoModal();
    renderTable();
}

// --- ランダム選曲機能関連 ---
function openRandomModal() {
    const levels = [...new Set(songs.map(s => s.level))].filter(l => l).sort((a,b)=>b-a);
    let levelHtml = '';
    levels.forEach(l => {
        levelHtml += `<label class="check-label"><input type="checkbox" class="rand-level" value="${l}"> Lv${l}</label>`;
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
    
    const bannerHtml = song.bannerUrl && song.bannerUrl.trim() !== ''
        ? `<img src="${song.bannerUrl}" style="max-width: 100%; height: auto; max-height: 60px; border-radius: 4px; margin-bottom: 10px;" />`
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
        <div style="font-size: 0.85em; color: #666;">${song.genre}</div>
        <div style="font-size: 1.3em; font-weight: bold; margin: 8px 0; color: #333;">${song.title}</div>
        <div style="display: flex; justify-content: center; gap: 12px; margin-top: 10px; align-items: center;">
            <span class="level-badge" style="font-size: 1.1em; padding: 4px 10px;">Lv ${song.level}</span>
            <div style="color: ${styleObj.color}; text-shadow: ${styleObj.shadow}; font-weight: bold; font-size: 1.2em;">
                ${dClassStr}<span style="font-size: 0.6em; margin-left: 2px;">${dIndexStr}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px; font-weight: bold;">
                ${medalDisplay}
            </div>
        </div>
    `;
}

function parseDifficulty(rawStr) {
    if (!rawStr) return { diffClass: '未分類', diffIndex: null };
    let diffClass = '未分類';
    let diffIndex = null;
    let normalizedStr = rawStr
        .replace(/[＋]/g, '+')
        .replace(/[－]/g, '-')
        .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .replace(/．/g, '.');
    const match = normalizedStr.match(/([-+]?\d*\.?\d+)/);
    if (match) {
        diffIndex = parseFloat(match[1]);
    }
    if (rawStr.includes('危険')) diffClass = '危険';
    else if (rawStr.includes('別格')) diffClass = '別格';
    else if (rawStr.includes('逆詐称')) diffClass = '逆詐称';
    else if (rawStr.includes('詐称')) diffClass = '詐称';
    else if (rawStr.includes('入門')) diffClass = '入門';
    else if (rawStr.includes('強')) diffClass = '強';
    else if (rawStr.includes('中')) diffClass = '中';
    else if (rawStr.includes('弱')) diffClass = '弱';
    return { diffClass, diffIndex };
}

function downloadSongsAndClearsJson() {
    const exportData = { songs: songs, clearRecords: clearRecords, scoreRecords: scoreRecords, memoRecords: memoRecords };
    const dataStr = JSON.stringify(exportData, null, 2);
    triggerDownload(dataStr, `popn_data_${currentUser}.json`, 'クリア・スコア・メモを含めて');
}

function downloadSongsJsonOnly() {
    const dataStr = JSON.stringify(songs, null, 2);
    triggerDownload(dataStr, 'songs.json', '楽曲データのみで');
}

function triggerDownload(dataStr, filename, typeMessage) {
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    alert(`「${filename}」として${typeMessage}保存しました。`);
}

async function importFromClipboard() {
    if (!checkAdminAuth()) return;

    try {
        const text = await navigator.clipboard.readText();
        if (!text || text.trim() === '') {
            alert("クリップボードにデータがありません。\nWikiで「魔法のボタン」を押してから実行してください。");
            return;
        }
        const targetLevel = document.getElementById('import-level').value;
        await processImportText(text, targetLevel);
    } catch (err) {
        alert("クリップボードの読み取りが許可されなかったか、失敗しました。\n「手動でペーストして追加する場合はこちら」を開いて、手動で貼り付けてください。");
        console.error(err);
    }
}

async function importDataManual() {
    if (!checkAdminAuth()) return;

    const text = document.getElementById('import-text').value;
    if (!text.trim()) {
        alert("テキストエリアが空です。");
        return;
    }
    const targetLevel = document.getElementById('import-level').value;
    await processImportText(text, targetLevel);
    document.getElementById('import-text').value = '';
}

async function processImportText(text, targetLevel) {
    const lines = text.split('\n');
    let newSongsAdded = 0;
    let songsUpdated = 0;

    lines.forEach(line => {
        let cleanLine = line.replace(/<[^>]*>?/gm, '');
        cleanLine = cleanLine.replace(/\[\[[^\]]*?\|([^\]]*?)\]\]/g, '$1');
        cleanLine = cleanLine.replace(/\[\[(.*?)\]\]/g, '$1');

        let p = cleanLine.replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim());
        if (p.length < 5) return; 

        let notesIndex = -1;
        for (let i = p.length - 1; i >= 2; i--) {
            if (/^\d+$/.test(p[i]) && parseInt(p[i], 10) > 50) {
                notesIndex = i;
                break;
            }
        }

        if (notesIndex === -1) return;

        const notes = parseInt(p[notesIndex], 10);
        const diffRaw = p[notesIndex + 1] || "";

        let bpmIndex = notesIndex - 1;
        if (p[bpmIndex] !== undefined && (p[bpmIndex].includes(':') || p[bpmIndex] === "")) {
            bpmIndex = notesIndex - 2;
        }

        const bpm = p[bpmIndex] || "";
        const title = p[bpmIndex - 1] || "";
        const genre = p[bpmIndex - 2] || "";
        
        const versionRaw = p[0] || "";
        const version = versionRaw.replace(/\[|\]/g, '').trim();

        const parsed = parseDifficulty(diffRaw);
        const diffClass = parsed.diffClass;
        const diffIndex = parsed.diffIndex;

        const id = genre + "_" + title + "_" + notes;
        const existingIndex = songs.findIndex(s => s.id === id);

        if (existingIndex === -1) {
            songs.push({ 
                id, level: targetLevel, version, genre, title, bpm, notes, diffClass, diffIndex, diffRaw, bannerUrl: "", originalOrder: songs.length 
            });
            newSongsAdded++;
        } else {
            let hasChanged = false;
            const song = songs[existingIndex];

            if (song.level !== targetLevel) {
                song.level = targetLevel;
                hasChanged = true;
            }
            
            if (song.diffRaw !== diffRaw || song.diffClass !== diffClass || song.diffIndex !== diffIndex) {
                song.diffRaw = diffRaw;
                song.diffClass = diffClass;
                song.diffIndex = diffIndex;
                hasChanged = true;
            }

            if (hasChanged) {
                songsUpdated++;
            }
        }
    });
    
    currentViewLevel = targetLevel;
    updateDynamicFilters();
    document.getElementById('search-input').value = '';
    renderTable();
    
    alert(`レベル${targetLevel}として、${newSongsAdded}件を新規追加、${songsUpdated}件を更新しました。`);
}

async function updateBannerFromClipboard(id) {
    if (window.innerWidth <= 768) return;

    if (!checkAdminAuth()) return;

    try {
        const text = await navigator.clipboard.readText();
        if (!text || text.trim() === '') {
            alert("クリップボードに画像のURLがありません。\n画像のURLをコピーしてから再度クリックしてください。");
            return;
        }
        const songIndex = songs.findIndex(s => s.id === id);
        if (songIndex === -1) return;

        songs[songIndex].bannerUrl = text.trim();
        renderTable();
    } catch (err) {
        const songIndex = songs.findIndex(s => s.id === id);
        if (songIndex === -1) return;
        const currentUrl = songs[songIndex].bannerUrl || "";
        const newUrl = prompt(`【自動取得ブロック】\nブラウザの設定でクリップボードの自動読み取りがブロックされています。\nここにバナー画像のアドレス（URL）を手動で貼り付けてください:`, currentUrl);
        
        if (newUrl !== null) { 
            songs[songIndex].bannerUrl = newUrl.trim();
            renderTable(); 
        }
    }
}

function handleSearch() { renderTable(); }
function clearSearch() { document.getElementById('search-input').value = ''; renderTable(); }

// ==========================================
// 全体統計（一覧）画像出力機能
// ==========================================
async function generateOverviewImage() {
    const btn = document.getElementById('btn-overview-image');
    const originalText = btn.innerText;
    btn.innerText = "生成中... (画像読込待機)";

    const exportContainer = document.createElement('div');
    exportContainer.style.position = 'absolute';
    exportContainer.style.left = '-9999px';
    exportContainer.style.top = '0';
    exportContainer.style.backgroundColor = '#fff';
    exportContainer.style.padding = '20px';
    exportContainer.style.width = 'max-content';
    exportContainer.style.fontFamily = 'sans-serif';
    document.body.appendChild(exportContainer);

    const sortedMedalKeys = Object.keys(MEDAL_TYPES)
        .sort((a, b) => MEDAL_TYPES[b].rank - MEDAL_TYPES[a].rank);

    const headerFlex = document.createElement('div');
    headerFlex.style.display = 'flex';
    headerFlex.style.justifyContent = 'space-between';
    headerFlex.style.alignItems = 'flex-start';
    headerFlex.style.marginBottom = '15px';

    const title = document.createElement('h2');
    title.innerText = `全体クリア・メダル状況 (User: ${currentUser})`;
    title.style.margin = '0';
    title.style.color = '#333';
    headerFlex.appendChild(title);

    // 凡例エリア (2行対応)
    const legendContainer = document.createElement('div');
    legendContainer.style.display = 'flex';
    legendContainer.style.flexDirection = 'column';
    legendContainer.style.alignItems = 'flex-end';
    legendContainer.style.gap = '4px';
    legendContainer.style.fontSize = '12px';

    const row1 = document.createElement('div');
    row1.style.display = 'flex';
    row1.style.gap = '8px';

    const row2 = document.createElement('div');
    row2.style.display = 'flex';
    row2.style.gap = '8px';

    let currentRow = row1;

    sortedMedalKeys.forEach(k => {
        const color = MEDAL_COLORS[k] || '#ccc';
        const label = MEDAL_TYPES[k].label;
        
        if (label === '黒星') {
            currentRow = row2;
        }
        
        const legendItem = document.createElement('div');
        legendItem.style.display = 'flex';
        legendItem.style.alignItems = 'center';
        
        const colorBox = document.createElement('span');
        colorBox.style.display = 'inline-block';
        colorBox.style.width = '12px';
        colorBox.style.height = '12px';
        colorBox.style.backgroundColor = color;
        colorBox.style.border = '1px solid #aaa';
        colorBox.style.marginRight = '4px';
        
        const textSpan = document.createElement('span');
        textSpan.innerText = label;
        
        legendItem.appendChild(colorBox);
        legendItem.appendChild(textSpan);
        currentRow.appendChild(legendItem);
    });

    legendContainer.appendChild(row1);
    legendContainer.appendChild(row2);
    headerFlex.appendChild(legendContainer);
    exportContainer.appendChild(headerFlex);

    const targetLevels = ['50', '49', '48', '47', '46'];

    const table = document.createElement('table');
    table.style.borderCollapse = 'collapse';
    table.style.width = '100%';
    table.style.border = '2px solid #333';

    // ヘッダー作成 (横軸：メダル)
    let theadHtml = `<tr style="background-color: #f2f2f2;">
        <th style="border: 1px solid #ccc; padding: 8px; width: 60px;">Lv</th>
        <th style="border: 1px solid #ccc; padding: 8px; width: 80px;">曲数</th>`;
    
    sortedMedalKeys.forEach(k => {
        const m = MEDAL_TYPES[k];
        const isValidUrl = m.imgUrl.startsWith('http') || m.imgUrl.startsWith('data:');
        let iconHtml = `<span style="font-size:12px;">${m.label}</span>`;
        
        if (isValidUrl) {
            let proxyUrl = m.imgUrl;
            if (proxyUrl.startsWith('http') && !proxyUrl.includes('wsrv.nl')) {
                proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(proxyUrl)}`;
            }
            iconHtml = `<img src="${proxyUrl}" crossorigin="anonymous" style="height:32px; width:auto; vertical-align:middle;">`;
        }
        theadHtml += `<th style="border: 1px solid #ccc; padding: 8px; min-width: 50px; text-align: center;">${iconHtml}</th>`;
    });
    theadHtml += `</tr>`;
    table.innerHTML = `<thead>${theadHtml}</thead>`;

    const tbody = document.createElement('tbody');

    targetLevels.forEach(lv => {
        const lvSongs = songs.filter(s => s.level === lv);
        if (lvSongs.length === 0) return;

        let counts = {};
        sortedMedalKeys.forEach(k => counts[k] = 0);

        lvSongs.forEach(s => {
            const medalKey = clearRecords[s.id] || '';
            if (counts[medalKey] !== undefined) {
                counts[medalKey]++;
            }
        });

        const absTotal = lvSongs.length;

        // 統計行 (縦軸：レベル)
        let trStats = `<tr>
            <td style="border: 1px solid #ccc; padding: 8px; font-weight: bold; font-size: 1.4em; text-align: center; background-color: #e3f2fd; color: #0056b3;">${lv}</td>
            <td style="border: 1px solid #ccc; padding: 8px; font-weight: bold; font-size: 1.2em; text-align: center;">${absTotal}</td>`;
        
        sortedMedalKeys.forEach(k => {
            const count = counts[k];
            const perc = absTotal > 0 ? ((count / absTotal) * 100).toFixed(1) : 0;
            const opacity = count === 0 ? 'opacity: 0.2;' : '';
            trStats += `<td style="border: 1px solid #ccc; padding: 6px; text-align: center; ${opacity}">
                <div style="font-weight: bold; font-size: 1.2em; color: #333;">${count}</div>
                <div style="font-size: 0.85em; color: #666;">${perc}%</div>
            </td>`;
        });
        trStats += `</tr>`;

        // バーグラフ行
        let trBar = `<tr><td colspan="${2 + sortedMedalKeys.length}" style="border: 1px solid #ccc; padding: 6px 10px; background-color: #fafafa;">
            <div style="display: flex; width: 100%; height: 20px; border-radius: 4px; overflow: hidden; background: #eee; box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);">`;
        
        sortedMedalKeys.forEach(k => {
            if (counts[k] > 0) {
                const w = (counts[k] / absTotal) * 100;
                trBar += `<div style="width: ${w}%; background-color: ${MEDAL_COLORS[k] || '#ccc'};" title="${MEDAL_TYPES[k].label}: ${counts[k]}"></div>`;
            }
        });
        trBar += `</div></td></tr>`;

        tbody.innerHTML += trStats + trBar;
    });

    table.appendChild(tbody);
    exportContainer.appendChild(table);

    // 画像の読み込み完了を確実に待機
    const images = Array.from(exportContainer.querySelectorAll('img'));
    await Promise.all(images.map(img => {
        return new Promise(res => {
            if (img.complete) {
                res();
            } else {
                img.onload = res;
                img.onerror = () => { console.warn("Image proxy failed:", img.src); res(); };
            }
        });
    }));

    btn.innerText = "生成中... (描画中)";

    try {
        const canvas = await html2canvas(exportContainer, { backgroundColor: '#fff', scale: 2, useCORS: true });
        const dataUrl = canvas.toDataURL("image/png");
        
        const isMobile = window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isMobile) {
            document.getElementById('generated-image-preview').src = dataUrl;
            document.getElementById('image-result-modal').style.display = 'flex';
        } else {
            const link = document.createElement('a');
            const date = new Date().toISOString().slice(0, 10);
            link.download = `popn_overview_${currentUser}_${date}.png`;
            link.href = dataUrl;
            link.click();
        }
    } catch (e) {
        alert("画像の生成に失敗しました。");
        console.error(e);
    } finally {
        document.body.removeChild(exportContainer);
        btn.innerText = originalText;
    }
}

async function exportAsImage(event) {
    const exportBtn = event.currentTarget; 
    const originalText = exportBtn.innerText;
    
    const activeCheckboxes = Array.from(document.querySelectorAll('.export-col-toggle'));
    const activeIndices = activeCheckboxes.filter(cb => cb.checked).map(cb => parseInt(cb.value));

    if (activeIndices.length === 0) {
        alert("画像に出力する項目を1つ以上選択してください。");
        return;
    }

    exportBtn.innerText = "生成中... (画像読込待機)";
    
    const exportContainer = document.createElement('div');
    exportContainer.style.position = 'absolute';
    exportContainer.style.left = '-9999px';
    exportContainer.style.top = '0';
    exportContainer.style.backgroundColor = '#f9f9f9';
    exportContainer.style.padding = '20px';
    exportContainer.style.width = 'max-content';
    exportContainer.style.fontFamily = 'sans-serif';
    document.body.appendChild(exportContainer);

    const userHeader = document.createElement('h2');
    userHeader.style.margin = '0 0 10px 0';
    userHeader.style.color = '#333';
    userHeader.innerText = `User: ${currentUser}`;
    exportContainer.appendChild(userHeader);

    const statsClone = document.getElementById('stats-display').cloneNode(true);
    statsClone.style.marginBottom = '20px';
    statsClone.style.fontSize = '1.3em';
    statsClone.style.padding = '20px'; 

    const statGroups = statsClone.querySelectorAll('.stats-group');
    statGroups.forEach(group => { group.style.gap = '15px'; });
    const statTitles = statsClone.querySelectorAll('.stats-title');
    statTitles.forEach(title => { title.style.fontSize = '1.1em'; });
    const statFractions = statsClone.querySelectorAll('.stats-fraction');
    statFractions.forEach(frac => { frac.style.fontSize = '1.3em'; });
    const statRemains = statsClone.querySelectorAll('.stats-remain');
    statRemains.forEach(rem => { rem.style.fontSize = '0.9em'; });
    
    const khPercs = statsClone.querySelectorAll('.stats-kurohishipercentage');
    khPercs.forEach(perc => { perc.style.fontSize = '2.3em'; });
    const kbPercs = statsClone.querySelectorAll('.stats-kuroboshipercentage');
    kbPercs.forEach(perc => { perc.style.fontSize = '2.3em'; });
    const easyPercs = statsClone.querySelectorAll('.stats-easypercentage');
    easyPercs.forEach(perc => { perc.style.fontSize = '2.3em'; });
    const percs = statsClone.querySelectorAll('.stats-percentage');
    percs.forEach(perc => { perc.style.fontSize = '2.3em'; });
    
    const levelBadges = statsClone.querySelectorAll('.stats-level');
    levelBadges.forEach(badge => {
        badge.style.fontSize = '1.9em';
        badge.style.padding = '10px 25px'; 
    });
    
    const statsImages = Array.from(statsClone.querySelectorAll('img'));
    statsImages.forEach(img => {
        const originalSrc = img.getAttribute('src');
        if (originalSrc && originalSrc.startsWith('http') && !originalSrc.includes('wsrv.nl')) {
            img.setAttribute('crossOrigin', 'anonymous');
            img.src = `https://wsrv.nl/?url=${encodeURIComponent(originalSrc)}`;
        }
    });

    exportContainer.appendChild(statsClone);

    const tablesWrapper = document.createElement('div');
    tablesWrapper.style.display = 'flex';
    tablesWrapper.style.gap = '20px';
    tablesWrapper.style.alignItems = 'flex-start';
    exportContainer.appendChild(tablesWrapper);

    const originalRows = Array.from(document.querySelectorAll('#song-list tr'));
    const chunkSize = 30;

    const colWidths = [8, 10, 10, 5, 5, 12, 20, 6, 6, 13];
    let totalPct = 0;
    activeIndices.forEach(idx => totalPct += colWidths[idx]);
    const totalWidth = totalPct * 10; 

    const colProps = [
        { id: 0, html: `<th style="width: ${colWidths[0]}%; text-align: center; border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">メダル</th>` },
        { id: 1, html: `<th style="width: ${colWidths[1]}%; text-align: center; border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">スコア</th>` },
        { id: 2, html: `<th style="width: ${colWidths[2]}%; text-align: center; border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">比較</th>` },
        { id: 3, html: `<th style="width: ${colWidths[3]}%; text-align: center; border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">Lv</th>` },
        { id: 4, html: `<th style="width: ${colWidths[4]}%; text-align: center; border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">Ver</th>` },
        { id: 5, html: `<th style="width: ${colWidths[5]}%; text-align: center; border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">バナー</th>` },
        { id: 6, html: `<th style="width: ${colWidths[6]}%; border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; text-align: left;">ジャンル / 曲名 (+メモ)</th>` },
        { id: 7, html: `<th style="width: ${colWidths[7]}%; text-align: right; border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">BPM</th>` },
        { id: 8, html: `<th style="width: ${colWidths[8]}%; text-align: right; border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">ノーツ</th>` },
        { id: 9, html: `<th style="width: ${colWidths[9]}%; border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; text-align: center;">難易度 (指数)</th>` }
    ];

    for (let i = 0; i < originalRows.length; i += chunkSize) {
        const chunk = originalRows.slice(i, i + chunkSize);

        const table = document.createElement('table');
        table.style.borderCollapse = 'collapse';
        table.style.backgroundColor = '#fff';
        table.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        table.style.width = `${totalWidth}px`;

        const thead = document.createElement('thead');
        let theadHtml = '<tr>';
        colProps.forEach(prop => {
            if (activeIndices.includes(prop.id)) {
                theadHtml += prop.html;
            }
        });
        theadHtml += '</tr>';
        thead.innerHTML = theadHtml;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        chunk.forEach(row => {
            const clonedRow = row.cloneNode(true);
            if (clonedRow.lastElementChild) { clonedRow.removeChild(clonedRow.lastElementChild); }
            const cells = Array.from(clonedRow.children);
            cells.forEach((cell, index) => {
                cell.style.border = '1px solid #ddd';
                cell.style.padding = '8px';
                cell.style.verticalAlign = 'middle';
                if (index === 0 || index === 5) {
                    const img = cell.querySelector('img');
                    if (img) {
                        const originalSrc = img.getAttribute('src');
                        if (originalSrc && originalSrc.startsWith('http') && !originalSrc.includes('wsrv.nl')) {
                            img.setAttribute('crossOrigin', 'anonymous');
                            img.src = `https://wsrv.nl/?url=${encodeURIComponent(originalSrc)}`;
                        }
                    }
                }
            });

            for (let c = cells.length - 1; c >= 0; c--) {
                if (!activeIndices.includes(c)) {
                    clonedRow.removeChild(cells[c]);
                } else {
                    cells[c].style.display = ''; 
                }
            }
            tbody.appendChild(clonedRow);
        });
        
        table.appendChild(tbody);
        tablesWrapper.appendChild(table);
    }

    const exportImages = Array.from(exportContainer.querySelectorAll('img'));
    await Promise.all(exportImages.map(img => {
        return new Promise(resolve => {
            if (img.complete) {
                resolve();
            } else {
                img.onload = resolve;
                img.onerror = resolve; 
            }
        });
    }));

    exportBtn.innerText = "生成中... (描画中)";

    const searchInput = document.getElementById('search-input');
    const isSearching = searchInput && searchInput.value.trim() !== '';
    const fileNameLevel = isSearching ? 'Search' : currentViewLevel;

    try {
        const canvas = await html2canvas(exportContainer, {
            backgroundColor: "#f9f9f9",
            useCORS: true,
            scale: 2 
        });
        const dataUrl = canvas.toDataURL("image/png");
        
        const isMobile = window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isMobile) {
            document.getElementById('generated-image-preview').src = dataUrl;
            document.getElementById('image-result-modal').style.display = 'flex';
        } else {
            const link = document.createElement('a');
            const date = new Date().toISOString().slice(0,10);
            link.download = `popn_clearrate_${currentUser}_Lv${fileNameLevel}_${date}.png`;
            link.href = dataUrl;
            link.click();
        }
    } catch (err) {
        alert("画像の生成に失敗しました。（一部の画像URLがセキュリティ制限に引っかかっている可能性があります）");
        console.error(err);
    } finally {
        document.body.removeChild(exportContainer);
        exportBtn.innerText = originalText;
    }
}

async function deleteLevelData() {
    if (!checkAdminAuth()) return;

    const targetLevel = document.getElementById('delete-level').value;
    const songsToDelete = songs.filter(s => s.level === targetLevel);
    
    if (songsToDelete.length === 0) {
        alert(`レベル${targetLevel}の楽曲データはありません。`);
        return;
    }

    if(confirm(`【警告】レベル${targetLevel}の楽曲データ（${songsToDelete.length}件）をすべて削除しますか？\n（クリア記録も削除されます。この操作は元に戻せません）`)) {
        const deleteIds = songsToDelete.map(s => s.id);
        songs = songs.filter(s => s.level !== targetLevel);
        
        for(let u in allUsersData) {
            deleteIds.forEach(id => {
                delete allUsersData[u].clearRecords[id];
                if (allUsersData[u].scoreRecords) delete allUsersData[u].scoreRecords[id];
                if (allUsersData[u].memoRecords) delete allUsersData[u].memoRecords[id];
            });
        }
        clearRecords = allUsersData[currentUser].clearRecords;
        scoreRecords = allUsersData[currentUser].scoreRecords;
        memoRecords = allUsersData[currentUser].memoRecords;
        
        updateDynamicFilters();
        renderTable();
        alert(`レベル${targetLevel}の楽曲データと全ユーザーの記録を削除しました。`);
    }
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
        img.onload = function() {
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
            document.getElementById('edit-banner-url').value = dataUrl;
            
            event.target.value = '';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

async function clearRecordsOnly() {
    if(confirm(`ユーザー [${currentUser}] のすべての記録（クリア・スコア・メモ）をリセットしますか？\n（楽曲リストは保持されます）`)) {
        allUsersData[currentUser].clearRecords = {};
        allUsersData[currentUser].scoreRecords = {};
        allUsersData[currentUser].memoRecords = {};
        clearRecords = allUsersData[currentUser].clearRecords;
        scoreRecords = allUsersData[currentUser].scoreRecords;
        memoRecords = allUsersData[currentUser].memoRecords;
        localStorage.setItem(STORAGE_KEY_MEMOS, JSON.stringify(memoRecords));
        renderTable();
    }
}

function changeViewLevel(level) {
    document.getElementById('search-input').value = '';
    currentViewLevel = level;
    updateDynamicFilters();
    renderTable();
}

function sortBy(key) {
    if (currentSort === key) {
        sortDesc = !sortDesc;
    } else {
        currentSort = key;
        sortDesc = (key === 'notes' || key === 'diff' || key === 'bpm' || key === 'level' || key === 'clear' || key === 'score') ? true : false;
    }
    renderTable();
}

function updateSortHeaders() {
    const headers = {
        'clear': 'メダル',
        'score': 'スコア',
        'level': 'Lv',
        'version': 'Ver',
        'title': 'ジャンル / 曲名 <span style="font-size: 0.8em; font-weight: normal; color: #555;">(メモ)</span>',
        'bpm': 'BPM',
        'notes': 'ノーツ',
        'diff': '難易度<span class="sp-br"></span><span class="diff-header-sub">(指数)</span>'
    };
    for (const [key, label] of Object.entries(headers)) {
        const th = document.getElementById(`th-${key}`);
        if (th) {
            if (currentSort === key) {
                th.innerHTML = `${label} <span style="font-size:0.8em; color:#2196F3; margin-left:4px;">${sortDesc ? '▼' : '▲'}</span>`;
            } else {
                th.innerHTML = label;
            }
        }
    }
}

function getDifficultyColor(diffClass, index) {
    let effIndex = index;
    if (index === null || isNaN(index)) {
        if (diffClass === '危険') effIndex = 2.5; 
        else if (diffClass === '別格') effIndex = 2.0;
        else if (diffClass === '強' || diffClass === '詐称') effIndex = 1.0;
        else if (diffClass === '弱' || diffClass === '逆詐称') effIndex = -1.0;
        else if (diffClass === '入門') effIndex = -2.0; 
        else effIndex = 0.0;
    }

    const absIndex = Math.abs(effIndex);
    const alpha = 0.3 + Math.min(1.0, absIndex) * 0.7;

    if (diffClass === '危険') {
        return { 
            color: '#FFD700', 
            shadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000' 
        };
    }
    if (diffClass === '入門') { return { color: `rgba(0, 128, 0, ${alpha})`, shadow: 'none' }; }
    if (diffClass === '別格') { return { color: `rgba(128, 0, 128, ${alpha})`, shadow: 'none' }; }
    if (diffClass === '強' || diffClass === '詐称') { return { color: `rgba(255, 0, 0, ${alpha})`, shadow: 'none' }; }
    if (diffClass === '弱' || diffClass === '逆詐称') { return { color: `rgba(0, 0, 255, ${alpha})`, shadow: 'none' }; }
    
    return { color: `rgba(0, 0, 0, 1.0)`, shadow: 'none' };
}

function getVersionSortValue(ver) {
    if (!ver) return 9999;
    let v = ver.toLowerCase();
    if (!isNaN(v)) return parseInt(v, 10);
    const acOrder = { 'sp': 21, 'lt': 22, 'écl': 23, 'うさ': 24, 'pe': 25, '解': 26, 'ul': 27, 'jf': 28 };
    if (acOrder[v] !== undefined) return acOrder[v];
    if (v.startsWith('cs')) return 100 + parseInt(v.replace('cs', ''), 10) || 199;
    if (v.startsWith('pmp')) return 200 + parseInt(v.replace('pmp', ''), 10) || 299;
    if (v === 'ee') return 300;
    if (v === 'hc') return 400;
    return 999; 
}

function getBpmSortValue(bpmStr) {
    if (!bpmStr || bpmStr === '-') return 0;
    const matches = bpmStr.match(/\d+/g);
    if (matches) { return Math.max(...matches.map(Number)); }
    return 0;
}

const RANK_IMAGES = {
    'S+':  'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_s_plus.png',
    'S':   'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_s.png',
    'AAA': 'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_a3.png',
    'AA+': 'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_a2_plus.png',
    'AA':  'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_a2.png',
    'A+':  'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_a1_plus.png',
    'A':   'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_a1.png',
    'B+':  'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_b_plus.png',
    'B':   'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_b.png',
    'C':   'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_c.png',
    'D':   'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_d.png',
    'E':   'https://p.eagate.573.jp/game/popn/popn29/images/p/common/medal/rank_big_e.png'
};

function getScoreRankInfo(score, isCleared) {
    if (score === undefined || score === null || score === '') return { rank: '', isImage: false, color: '#999' };
    const s = parseInt(score, 10);
    if (isNaN(s)) return { rank: '', isImage: false, color: '#999' };

    let rankKey = 'E';
    if (s >= 99000 && isCleared) rankKey = 'S+';
    else if (s >= 98000 && isCleared) rankKey = 'S';
    else if (s >= 95000 && isCleared) rankKey = 'AAA';
    else if (s >= 93000 && isCleared) rankKey = 'AA+';
    else if (s >= 90000 && isCleared) rankKey = 'AA';
    else if (s >= 86000 && isCleared) rankKey = 'A+';
    else if (s >= 82000) rankKey = 'A';
    else if (s >= 77000) rankKey = 'B+';
    else if (s >= 72000) rankKey = 'B';
    else if (s >= 62000) rankKey = 'C';
    else if (s >= 50000) rankKey = 'D';

    return { 
        rank: rankKey, 
        isImage: true, 
        imgUrl: RANK_IMAGES[rankKey] 
    };
}

function handleScoreToggle() {
    const showScore = document.getElementById('show-score-col').checked;
    if (showScore) {
        currentSort = 'score';
        sortDesc = true; 
    }
    renderTable();
}

function renderTable() {
    const searchInput = document.getElementById('search-input');
    const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : "";

    const filterClear = document.getElementById('filter-clear') ? document.getElementById('filter-clear').value : 'ALL';
    const filterMedal = document.getElementById('filter-medal') ? document.getElementById('filter-medal').value : 'ALL';
    const filterVersion = document.getElementById('filter-version') ? document.getElementById('filter-version').value : 'ALL';
    const filterDiff = document.getElementById('filter-diff') ? document.getElementById('filter-diff').value : 'ALL';
    const filterAffinity = document.getElementById('filter-affinity') ? document.getElementById('filter-affinity').value : 'ALL';

    const showUnreleased = document.getElementById('show-unreleased') ? document.getElementById('show-unreleased').checked : false;
    
    const showScore = document.getElementById('show-score-col').checked;
    const showCompare = document.getElementById('enable-compare').checked;
    
    document.getElementById('th-score').style.display = showScore ? '' : 'none';
    document.getElementById('th-compare').style.display = showCompare ? '' : 'none';

    const table = document.getElementById('song-table');
    if (showScore || showCompare) {
        table.classList.add('mobile-hide-diff');
    } else {
        table.classList.remove('mobile-hide-diff');
    }
    if (showScore) table.classList.add('has-score'); else table.classList.remove('has-score');
    if (showCompare) table.classList.add('has-compare'); else table.classList.remove('has-compare');

    let displaySongs = songs.filter(s => {
        if (currentViewLevel !== 'ALL' && s.level !== currentViewLevel) return false;
        if (searchQuery && !(s.genre.toLowerCase().includes(searchQuery) || s.title.toLowerCase().includes(searchQuery))) return false;

        const medalKey = clearRecords[s.id] || '';
        const medalInfo = MEDAL_TYPES[medalKey];

        if (filterClear === 'uncleared' && medalInfo && medalInfo.isEasyClear) return false;
        if (filterClear === 'kurohishi_cleared' && (!medalInfo || !medalInfo.isKuroHishiClear)) return false;
        if (filterClear === 'kuroboshi_cleared' && (!medalInfo || !medalInfo.isKuroBoshiClear)) return false;
        if (filterClear === 'cleared' && (!medalInfo || !medalInfo.isEasyClear)) return false;
        if (filterClear === 'normal_cleared' && (!medalInfo || !medalInfo.isNormalClear)) return false;

        if (filterMedal !== 'ALL') {
            if (filterMedal === 'unplayed' && medalKey !== '') return false;
            if (filterMedal !== 'unplayed' && medalKey !== filterMedal) return false;
        }
        if (filterVersion !== 'ALL' && s.version !== filterVersion) return false;

        if (filterDiff !== 'ALL') {
            let dClass = s.diffClass || '未分類';
            if (dClass === '中') {
                dClass = (s.diffIndex !== null && s.diffIndex < 0) ? '中(-)' : '中(+)';
            }
            if (filterDiff === '中(全体)') {
                if (!dClass.startsWith('中')) return false;
            } else {
                if (dClass !== filterDiff) return false;
            }
        }

        if (filterAffinity !== 'ALL') {
            const memo = memoRecords[s.id] || {};
            const aff = memo.affinity || '';
            if (filterAffinity === '未設定') {
                if (aff !== '') return false;
            } else {
                if (aff !== filterAffinity) return false;
            }
        }
        return true;
    });

    if (currentSort === 'clear') {
        displaySongs.sort((a, b) => {
            let valA = MEDAL_TYPES[clearRecords[a.id] || ''].rank;
            let valB = MEDAL_TYPES[clearRecords[b.id] || ''].rank;
            if (valA === valB) return a.originalOrder - b.originalOrder;
            return sortDesc ? valB - valA : valA - valB;
        });
    } else if (currentSort === 'title') {
        displaySongs.sort((a, b) => {
            let valA = (a.title || "").toLowerCase();
            let valB = (b.title || "").toLowerCase();
            if (valA === valB) return a.originalOrder - b.originalOrder;
            if (valA < valB) return sortDesc ? 1 : -1;
            if (valA > valB) return sortDesc ? -1 : 1;
            return 0;
        });
    } else if (currentSort === 'notes') {
        displaySongs.sort((a, b) => sortDesc ? b.notes - a.notes : a.notes - b.notes);
    } else if (currentSort === 'diff') {
        displaySongs.sort((a, b) => {
            const getVal = (song) => {
                if (song.diffIndex !== null && !isNaN(song.diffIndex)) return parseFloat(song.diffIndex);
                if (song.diffClass === '危険') return 2.5; 
                if (song.diffClass === '別格') return 2.0;
                if (song.diffClass === '詐称') return 1.5;
                if (song.diffClass === '強') return 1.0;
                if (song.diffClass === '中') return 0.0;
                if (song.diffClass === '弱') return -1.0;
                if (song.diffClass === '逆詐称') return -1.5;
                if (song.diffClass === '入門') return -2.0; 
                return -999;
            };
            let valA = getVal(a);
            let valB = getVal(b);
            if (valA === valB) return a.originalOrder - b.originalOrder;
            return sortDesc ? valB - valA : valA - valB;
        });
    } else if (currentSort === 'bpm') {
        displaySongs.sort((a, b) => {
            let valA = getBpmSortValue(a.bpm);
            let valB = getBpmSortValue(b.bpm);
            return sortDesc ? valB - valA : valA - valB;
        });
    } else if (currentSort === 'version') {
        displaySongs.sort((a, b) => {
            let valA = getVersionSortValue(a.version);
            let valB = getVersionSortValue(b.version);
            if (valA === valB) return a.originalOrder - b.originalOrder;
            return sortDesc ? valB - valA : valA - valB;
        });
    } else if (currentSort === 'level') {
        displaySongs.sort((a, b) => {
            let valA = parseInt(a.level, 10) || 0;
            let valB = parseInt(b.level, 10) || 0;
            if (valA === valB) return a.originalOrder - b.originalOrder;
            return sortDesc ? valB - valA : valA - valB;
        });
    } else if (currentSort === 'score') {
        displaySongs.sort((a, b) => {
            let valA = parseInt(scoreRecords[a.id]) || -1;
            let valB = parseInt(scoreRecords[b.id]) || -1;
            if (valA === valB) return a.originalOrder - b.originalOrder;
            return sortDesc ? valB - valA : valA - valB;
        });
    }

    const tbody = document.getElementById('song-list');
    tbody.innerHTML = '';

    let kuroHishiClearCount = 0;
    let kuroBoshiClearCount = 0;
    let easyClearCount = 0; 
    let normalClearCount = 0; 
    let rateTotal = 0; 
    
    let medalCounts = {};
    Object.keys(MEDAL_TYPES).forEach(k => {
        medalCounts[k] = 0;
    });

    let diffStats = {
        '危険': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '別格': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '詐称': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '強': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '中(+)': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '中(-)': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '弱': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '逆詐称': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '入門': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 },
        '未分類': { total: 0, kuroHishi: 0, kuroBoshi: 0, easy: 0, normal: 0 }
    };

    const isMobile = window.innerWidth <= 768;

    displaySongs.forEach(song => {
        const medalKey = clearRecords[song.id] || '';
        const medalInfo = MEDAL_TYPES[medalKey];
        
        medalCounts[medalKey]++;
        
        let dClass = song.diffClass || '未分類';
        if (dClass === '中') {
            if (song.diffIndex !== null && song.diffIndex < 0) { dClass = '中(-)'; } else { dClass = '中(+)'; }
        }
        
        if (!diffStats[dClass]) dClass = '未分類';
        
        if (medalInfo.excludeFromRate && !showUnreleased) {
            
        } else {
            rateTotal++;
            diffStats[dClass].total++;
            
            if (medalInfo.isKuroHishiClear) {
                kuroHishiClearCount++;
                diffStats[dClass].kuroHishi++;
            }
            if (medalInfo.isKuroBoshiClear) {
                kuroBoshiClearCount++;
                diffStats[dClass].kuroBoshi++;
            }
            if (medalInfo.isEasyClear) {
                easyClearCount++;
                diffStats[dClass].easy++;
            }
            if (medalInfo.isNormalClear) {
                normalClearCount++;
                diffStats[dClass].normal++;
            }
        }

        const tr = document.createElement('tr');
        if (song.notes >= 1537) tr.classList.add('spicy-gauge');
        if (medalInfo.isEasyClear) tr.classList.add('cleared-row');

        const styleObj = getDifficultyColor(song.diffClass, song.diffIndex);
        let dClassStr = song.diffClass || '';
        let dIndexStr = song.diffRaw.replace(dClassStr, '').trim();
        if (!song.diffRaw.includes(dClassStr)) { dClassStr = song.diffRaw; dIndexStr = ''; }
        
        const diffHtml = `
            <div class="diff-wrapper" style="color: ${styleObj.color}; text-shadow: ${styleObj.shadow}; font-weight: bold;">
                <span class="diff-main">${dClassStr}</span><span class="diff-sub">${dIndexStr}</span>
            </div>
        `;
        
        const safeId = song.id.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;");

        const isValidMedalUrl = medalInfo.imgUrl.startsWith('http') || medalInfo.imgUrl.startsWith('data:');
        const medalDisplayHtml = isValidMedalUrl
            ? `<img src="${medalInfo.imgUrl}" style="width: 32px; height: 32px; object-fit: contain; cursor: pointer; display: block; margin: 0 auto;" onclick="openMedalModal('${safeId}')" title="${medalInfo.label}">`
            : `<div onclick="openMedalModal('${safeId}')" style="cursor: pointer; font-weight: bold; padding: 4px; border: 1px solid #ccc; border-radius: 4px; background: #fff; font-size: 0.8em; color: #555; white-space: nowrap;" title="クリックして変更">${medalInfo.label}</div>`;

        const bannerAction = isMobile ? '' : `onclick="updateBannerFromClipboard('${safeId}')"`;
        const cursorStyle = isMobile ? 'default' : 'pointer';
        const bannerTitle = isMobile ? '' : 'title="クリックしてコピーしたURLで上書き"';
        const noImageTitle = isMobile ? '' : 'title="クリックしてコピーしたURLを自動ペースト"';
        const noImageDeco = isMobile ? 'none' : 'underline';

        const bannerHtml = song.bannerUrl && song.bannerUrl.trim() !== ''
            ? `<img src="${song.bannerUrl}" style="max-width: 100%; height: auto; max-height: 50px; border-radius: 4px; cursor: ${cursorStyle};" ${bannerAction} ${bannerTitle} onerror="this.style.display='none'" />`
            : `<span style="color: #aaa; font-size: 0.85em; font-weight: bold; text-decoration: ${noImageDeco}; cursor: ${cursorStyle};" ${bannerAction} ${noImageTitle}>No Image</span>`;

        const myScore = scoreRecords[song.id];
        const isCleared = medalInfo && medalInfo.isEasyClear;
        const rankInfo = getScoreRankInfo(myScore, isCleared);

        let scoreDisplayHtml = `<div style="color: #ccc; font-size: 0.8em; font-weight: normal;">未登録</div>`;
        if (myScore !== undefined && myScore !== '') {
            const rankMark = rankInfo.isImage 
                ? `<img src="${rankInfo.imgUrl}" alt="${rankInfo.rank}" style="height: 40px; width: auto; vertical-align: middle; margin-top: 2px;">` 
                : `<div style="font-weight: bold; font-size: 0.9em; color: ${rankInfo.color};">${rankInfo.rank}</div>`;
            
            scoreDisplayHtml = `
                <div style="font-weight: bold; font-size: 1.1em; color: #333;">${myScore}</div>
                ${rankMark}
            `;
        }

        let compareHtml = '';
        if (showCompare) {
            const targetUser = document.getElementById('compare-user-select').value;
            let targetScore = undefined;
            if (targetUser && allUsersData[targetUser] && allUsersData[targetUser].scoreRecords) {
                targetScore = allUsersData[targetUser].scoreRecords[song.id];
            }
            
            if (!targetUser) {
                compareHtml = `<div style="color: #ccc; font-size: 0.7em;">ユーザーを選択</div>`;
            } else if (targetScore === undefined || targetScore === '') {
                compareHtml = `<div style="color: #ccc; font-size: 0.8em;">未登録</div>`;
            } else {
                const tMedal = allUsersData[targetUser].clearRecords[song.id];
                const tIsCleared = tMedal ? MEDAL_TYPES[tMedal].isEasyClear : false;
                const tRankInfo = getScoreRankInfo(targetScore, tIsCleared);
                
                const tRankMark = tRankInfo.isImage 
                    ? `<img src="${tRankInfo.imgUrl}" alt="${tRankInfo.rank}" style="height: 40px; width: auto; vertical-align: middle; margin-top: 1px;">` 
                    : `<div style="font-size: 0.8em; color: ${tRankInfo.color}; font-weight: bold;">${tRankInfo.rank}</div>`;

                let diff = '';
                if (myScore !== undefined && myScore !== '') {
                    const d = parseInt(myScore, 10) - parseInt(targetScore, 10);
                    if (d > 0) diff = `<span style="color: #2cbc21; font-weight: bold; font-size: 0.85em;">(+${d})</span>`;
                    else if (d < 0) diff = `<span style="color: #d32f2f; font-weight: bold; font-size: 0.85em;">(${d})</span>`;
                    else diff = `<span style="color: #999; font-weight: bold; font-size: 0.85em;">(±0)</span>`;
                }
                
                compareHtml = `
                    <div style="font-size: 0.95em; color: #555; font-weight: bold;">${targetScore}</div>
                    ${tRankMark}
                    <div style="margin-top: 2px;">${diff}</div>
                `;
            }
        }

        const scoreDisplay = showScore ? '' : 'display: none;';
        const compareDisplay = showCompare ? '' : 'display: none;';

        const searchKey = (song.genre && song.genre.trim() !== '') ? song.genre : song.title;
        const autoWikiUrl = `https://popn.wiki/難易度表/${encodeURIComponent(searchKey)}`;
        const finalWikiUrl = (song.wikiUrl && song.wikiUrl !== '') ? song.wikiUrl : autoWikiUrl;

        const memo = memoRecords[song.id] || {};
        const hasMemo = memo.comment || memo.sudden || memo.affinity;
        let tooltipLines = [];
        if (memo.affinity) tooltipLines.push(`相性: ${memo.affinity}`);
        if (memo.sudden) tooltipLines.push(`SUDDEN+: ${memo.sudden}`);
        if (memo.comment) tooltipLines.push(`コメント:\n${memo.comment}`);
        const memoTooltip = tooltipLines.length > 0 ? tooltipLines.join('\n') : 'メモを追加・編集';

        let affinityBadge = '';
        if (memo.affinity) {
            affinityBadge = `<div class="memo-badge-${memo.affinity}" style="font-size: 0.7em;">${memo.affinity.substring(0, 2)}</div>`;
        }

        tr.innerHTML = `
            <td class="col-medal" style="text-align: center; vertical-align: middle;">${medalDisplayHtml}</td>
            <td class="col-score" style="text-align: center; cursor: pointer; background-color: #fafafa; ${scoreDisplay}" onclick="openScoreModal('${safeId}')" title="クリックしてスコア入力">${scoreDisplayHtml}</td>
            <td class="col-compare" style="text-align: center; background-color: #f0f8ff; ${compareDisplay}">${compareHtml}</td>
            <td class="col-level" style="text-align: center;"><span class="level-badge">${song.level || '-'}</span></td>
            <td class="col-version" style="text-align: center;"><span class="ver-badge">${song.version || '-'}</span></td>
            <td class="col-banner" style="text-align: center; transition: background-color 0.2s;" ondragover="event.preventDefault(); this.style.backgroundColor='#e3f2fd';" ondragleave="event.preventDefault(); this.style.backgroundColor='';" ondrop="handleSingleBannerDrop(event, '${safeId}', this)">${bannerHtml}</td>
            <td class="col-title">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 5px;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 0.85em; color: #666;">${song.genre}</div>
                        <div style="font-weight: bold; word-break: break-all;">
                            <a href="${finalWikiUrl}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">
                                ${song.title} <span style="font-size: 0.8em; color: #2196F3;">🔗</span>
                            </a>
                        </div>
                    </div>
                    <div onclick="openMemoModal('${safeId}')" style="cursor: pointer; text-align: center; background: #f8f9fa; border-radius: 4px; padding: 4px; border: 1px solid #ddd; min-width: 36px; flex-shrink: 0;" title="${memoTooltip}">
                        <div style="${hasMemo ? '' : 'opacity: 0.3;'} font-size: 1.2em; line-height: 1;">📝</div>
                        ${affinityBadge}
                    </div>
                </div>
            </td>
            <td class="col-bpm" style="text-align: right;"><span>${song.bpm || '-'}</span></td>
            <td class="col-notes" style="text-align: right;"><span>${song.notes}</span></td>
            <td class="col-diff" style="text-align: center;">${diffHtml}</td>
            <td class="col-action no-export" style="text-align: center;">
                <button class="edit-btn" onclick="openEditModal('${safeId}')">✏️編集</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    updateSortHeaders();

    const kuroHishiPerc = rateTotal === 0 ? 0 : ((kuroHishiClearCount / rateTotal) * 100).toFixed(1);
    const kuroBoshiPerc = rateTotal === 0 ? 0 : ((kuroBoshiClearCount / rateTotal) * 100).toFixed(1);
    const easyPerc = rateTotal === 0 ? 0 : ((easyClearCount / rateTotal) * 100).toFixed(1);
    const normalPerc = rateTotal === 0 ? 0 : ((normalClearCount / rateTotal) * 100).toFixed(1);
    
    const kuroHishiRemain = rateTotal - kuroHishiClearCount;
    const kuroBoshiRemain = rateTotal - kuroBoshiClearCount;
    const easyRemain = rateTotal - easyClearCount;
    const normalRemain = rateTotal - normalClearCount;

    let levelLabel = currentViewLevel === 'ALL' ? '全体' : `Lv${currentViewLevel}`;
    if (searchQuery) levelLabel = `検索結果 ("${searchQuery}")`;
    if (filterClear !== 'ALL' || filterMedal !== 'ALL' || filterVersion !== 'ALL' || filterDiff !== 'ALL' || filterAffinity !== 'ALL') {
        levelLabel += ' (絞り込み中)';
    }
    
    const showKuroHishiRate = document.getElementById('show-kurohishi-rate') ? document.getElementById('show-kurohishi-rate').checked : false;
    const showKuroBoshiRate = document.getElementById('show-kuroboshi-rate') ? document.getElementById('show-kuroboshi-rate').checked : false;
    const showEasyRate = document.getElementById('show-easy-rate') ? document.getElementById('show-easy-rate').checked : false;
    const showNormalRate = document.getElementById('show-normal-rate') ? document.getElementById('show-normal-rate').checked : true;
    const showMedalStats = document.getElementById('show-medal-stats') ? document.getElementById('show-medal-stats').checked : false;
    const showDiffStats = document.getElementById('show-diff-stats') ? document.getElementById('show-diff-stats').checked : false;

    let statsHtml = `<div style="display: flex; flex-wrap: wrap; gap: 15px; width: 100%; justify-content: flex-end; align-items: baseline;">
        <div class="stats-level">【${levelLabel}】</div>`;

    if (showKuroHishiRate) {
        statsHtml += `
            <div class="stats-group">
                <span class="stats-title">黒菱クリア以上:</span>
                <span class="stats-fraction">${kuroHishiClearCount} / ${rateTotal} <span class="stats-remain">(未クリア: ${kuroHishiRemain})</span></span>
                <span class="stats-kurohishipercentage">${kuroHishiPerc}%</span>
            </div>`;
    }
    if (showKuroBoshiRate) {
        statsHtml += `
            <div class="stats-group">
                <span class="stats-title">黒星クリア以上:</span>
                <span class="stats-fraction">${kuroBoshiClearCount} / ${rateTotal} <span class="stats-remain">(未クリア: ${kuroBoshiRemain})</span></span>
                <span class="stats-kuroboshipercentage">${kuroBoshiPerc}%</span>
            </div>`;
    }
    if (showEasyRate) {
        statsHtml += `
            <div class="stats-group">
                <span class="stats-title">イージークリア以上:</span>
                <span class="stats-fraction">${easyClearCount} / ${rateTotal} <span class="stats-remain">(未クリア: ${easyRemain})</span></span>
                <span class="stats-easypercentage">${easyPerc}%</span>
            </div>`;
    }
    if (showNormalRate) {
        statsHtml += `
            <div class="stats-group">
                <span class="stats-title">ノーマルクリア以上:</span>
                <span class="stats-fraction">${normalClearCount} / ${rateTotal} <span class="stats-remain">(未クリア: ${normalRemain})</span></span>
                <span class="stats-percentage">${normalPerc}%</span>
            </div>`;
    }
    statsHtml += `</div>`;

    let extendedStatsHtml = '';

    if (showMedalStats || showDiffStats) {
        extendedStatsHtml += `<div style="width: 100%; padding: 15px; background: #f1f8ff; border-radius: 6px; border: 1px solid #e3f2fd; box-sizing: border-box;">`;
        
        if (showMedalStats) {
            let chartData = [];
            let totalForChart = 0;
            
            const sortedMedalKeys = Object.keys(MEDAL_TYPES).sort((a, b) => MEDAL_TYPES[b].rank - MEDAL_TYPES[a].rank);

            sortedMedalKeys.forEach(k => {
                const m = MEDAL_TYPES[k];
                const count = medalCounts[k];
                
                if (m.excludeFromRate && !showUnreleased) return; 
                
                if (count > 0) {
                    chartData.push({ key: k, label: m.label, count: count, color: MEDAL_COLORS[k] || '#ccc', rank: m.rank });
                    totalForChart += count;
                }
            });

            let legendHtml = '';
            chartData.forEach(d => {
                let perc = totalForChart === 0 ? 0 : (d.count / totalForChart) * 100;
                let safeLabel = d.label.replace('🔒', '');
                legendHtml += `
                    <div style="display: flex; align-items: center; font-size: 0.85em; white-space: nowrap;">
                        <span style="display: inline-block; width: 12px; height: 12px; background: ${d.color}; border: 1px solid #aaa; margin-right: 4px; border-radius: 2px;"></span>
                        <span style="color: #333;">${safeLabel}: <span style="font-weight:bold;">${perc.toFixed(1)}%</span></span>
                    </div>
                `;
            });

            const pieChartUrl = generatePieChartBase64(chartData, 200);

            extendedStatsHtml += `
                <div style="font-weight: bold; color: #555; margin-bottom: 6px; font-size: 0.9em;">🏅 メダル別内訳</div>
                
                <div style="display: flex; flex-wrap: wrap; gap: 15px; align-items: center; margin-bottom: 15px; padding: 15px; background: #fff; border-radius: 6px; border: 1px solid #e0e0e0; box-shadow: 0 1px 2px rgba(0,0,0,0.05); flex-shrink: 0;" alt="円グラフ">
                    <img src="${pieChartUrl}" style="width: 120px; height: 120px; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.1); flex-shrink: 0;" alt="円グラフ">
                    <div style="flex: 1; display: flex; flex-wrap: wrap; gap: 8px 12px; align-content: center;">
                        ${legendHtml}
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(55px, 1fr)); gap: 6px; margin-bottom: ${showDiffStats ? '15px' : '0'};">
            `;
            sortedMedalKeys.forEach(k => {
                const m = MEDAL_TYPES[k];
                const count = medalCounts[k];
                const isValidMedalUrl = m.imgUrl.startsWith('http') || m.imgUrl.startsWith('data:');
                const iconHtml = isValidMedalUrl 
                    ? `<img src="${m.imgUrl}" style="width: 26px; height: 26px; object-fit: contain; margin-bottom: 2px;">` 
                    : `<div style="font-weight: bold; color: #555; font-size: 0.7em;">${m.label}</div>`;

                extendedStatsHtml += `
                    <div style="background: #fff; padding: 6px 2px; border-radius: 4px; border: 1px solid #ddd; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                    ${iconHtml}
                    <span style="color: #333; font-weight: bold; font-size: 1.1em; line-height: 1;">${count}</span>
                    </div>
                `;
            });
            extendedStatsHtml += `</div>`;
        }

        if (showDiffStats) {
            extendedStatsHtml += `
                <div style="font-weight: bold; color: #555; margin-bottom: 6px; font-size: 0.9em; ${showMedalStats ? 'border-top: 1px dashed #ccc; padding-top: 10px;' : ''}">🎯 難易度（指数）別クリア率</div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px;">
            `;
            const diffOrder = ['危険', '別格', '詐称', '強', '中(+)', '中(-)', '弱', '逆詐称', '入門', '未分類'];
            diffOrder.forEach(dKey => {
                const stat = diffStats[dKey];
                if (stat.total === 0) return; 
                
                const khPerc = ((stat.kuroHishi / stat.total) * 100).toFixed(1);
                const kbPerc = ((stat.kuroBoshi / stat.total) * 100).toFixed(1);
                const ePerc = ((stat.easy / stat.total) * 100).toFixed(1);
                const nPerc = ((stat.normal / stat.total) * 100).toFixed(1);
                
                let baseClass = dKey.startsWith('中') ? '中' : dKey;
                let baseIndex = dKey === '中(+)' ? 0.5 : (dKey === '中(-)' ? -0.5 : 0);
                
                const styleObj = getDifficultyColor(baseClass, baseIndex);
                let borderColor = styleObj.color.replace('0.3', '0.8').replace('1.0', '0.8');
                if (dKey === '危険') borderColor = '#333';
                
                extendedStatsHtml += `
                    <div style="background: #fff; padding: 8px; border-radius: 4px; border: 1px solid #ddd; border-left: 4px solid ${borderColor}; box-shadow: 0 1px 2px rgba(0,0,0,0.05); font-size: 0.85em;">
                        <div style="display: flex; justify-content: space-between; border-bottom: 1px dotted #eee; padding-bottom: 4px; margin-bottom: 4px;">
                            <span style="font-weight: bold; color: ${dKey === '危険' ? '#FFD700' : '#333'}; text-shadow: ${dKey === '危険' ? styleObj.shadow : 'none'};">${dKey}</span>
                            <span style="color: #666;">対象${stat.total}曲</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                            <span style="color: #1a237e; font-weight: bold;">黒菱以上 <span style="color: #333;">${stat.kuroHishi}/${stat.total}</span></span>
                            <span style="color: #666;">${khPerc}%</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                            <span style="color: #000051; font-weight: bold;">黒星以上 <span style="color: #333;">${stat.kuroBoshi}/${stat.total}</span></span>
                            <span style="color: #666;">${kbPerc}%</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                            <span style="color: #2cbc21; font-weight: bold;">イージー以上 <span style="color: #333;">${stat.easy}/${stat.total}</span></span>
                            <span style="color: #666;">${ePerc}%</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #d32f2f; font-weight: bold;">ノーマル以上 <span style="color: #333;">${stat.normal}/${stat.total}</span></span>
                            <span style="color: #666;">${nPerc}%</span>
                        </div>
                    </div>
                `;
            });
            extendedStatsHtml += `</div>`;
        }
        extendedStatsHtml += `</div>`;
    }
    
    document.getElementById('stats-display').innerHTML = statsHtml;
    document.getElementById('extended-stats-display').innerHTML = extendedStatsHtml;
}

// ==========================================
// ★ バナー画像の一括ドロップ（ドラッグ＆ドロップ）機能
// ==========================================
const dropZone = document.getElementById('banner-drop-zone');

if (dropZone) {
    // ドラッグ中の見た目変更
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = '#e3f2fd';
        dropZone.style.borderColor = '#2196F3';
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = '#fdfdfd';
        dropZone.style.borderColor = '#999';
    });

    // ドロップ時の処理
    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = '#fdfdfd';
        dropZone.style.borderColor = '#999';

        const files = e.dataTransfer.files;
        if (!files || files.length === 0) return;

        // ★ 管理者パスワードの確認（キャンセル・失敗時は処理ストップ）
        if (!checkAdminAuth()) return;

        showLoading(true, '画像を処理・反映中...');
        let updatedCount = 0;
        let notFoundFiles = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file.type.startsWith('image/')) continue;

            // 拡張子を除外してファイル名を取得 (例: "neu.png" -> "neu")
            const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");

            // 1. まず「現在表示しているレベル」の中から曲名が一致するものを探す
            // 2. 見つからなければ、全楽曲から探す
            let targetSong = songs.find(s => s.title === fileNameWithoutExt && (currentViewLevel === 'ALL' || s.level === currentViewLevel));
            if (!targetSong) {
                targetSong = songs.find(s => s.title === fileNameWithoutExt);
            }

            if (targetSong) {
                // 画像をリサイズしてBase64化
                const dataUrl = await processImageFileToDataURL(file);
                targetSong.bannerUrl = dataUrl;
                updatedCount++;
            } else {
                notFoundFiles.push(file.name);
            }
        }

        showLoading(false);
        renderTable(); // テーブルを再描画して画像を反映

        // 結果のフィードバック
        if (updatedCount > 0) {
            alert(`${updatedCount}件のバナー画像を更新しました！\n（※クラウドに保存するには、上部の「☁️ 変更をクラウドに保存」から楽曲データを保存してください）`);
        }
        if (notFoundFiles.length > 0) {
            alert(`以下のファイル名に一致する楽曲が見つかりませんでした:\n${notFoundFiles.join('\n')}`);
        }
    });
}

// 画像ファイルをリサイズしてDataURL(Base64)に変換するヘルパー関数
function processImageFileToDataURL(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
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

                resolve(canvas.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ==========================================
// ★ 個別バナー画像の直接ドロップ処理
// ==========================================
async function handleSingleBannerDrop(event, songId, element) {
    // ブラウザの標準動作をキャンセルして、背景色を元に戻す
    event.preventDefault();
    element.style.backgroundColor = ''; 

    const files = event.dataTransfer.files;
    if (!files || files.length === 0) return;

    const file = files[0]; // 複数ドロップされても最初の1枚だけ使う
    if (!file.type.startsWith('image/')) {
        alert('画像ファイルをドロップしてください。');
        return;
    }

    // ★ 管理者パスワードの確認
    if (!checkAdminAuth()) return;

    showLoading(true, 'バナー画像を更新中...');
    try {
        // ドロップされた行の楽曲データをIDから探し出して更新
        const songIndex = songs.findIndex(s => s.id === songId);
        if (songIndex !== -1) {
            const dataUrl = await processImageFileToDataURL(file); // 前に追加したリサイズ関数を再利用
            songs[songIndex].bannerUrl = dataUrl;
            renderTable(); // テーブルを再描画して反映
        }
    } catch (err) {
        console.error(err);
        alert('画像の処理に失敗しました。');
    }
    showLoading(false);
}

// ==========================================
// ★ トップに戻るボタンの制御
// ==========================================
window.addEventListener('scroll', () => {
    const topBtn = document.getElementById('back-to-top');
    if (topBtn) {
        // スマホでも確実にスクロール量を取得できるように修正
        const scrollAmount = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        
        // 上から300px以上スクロールしたらボタンを表示
        if (scrollAmount > 300) {
            topBtn.style.display = 'flex';
        } else {
            topBtn.style.display = 'none';
        }
    }
});



function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// ==========================================
// ★ バックアップJSONからの復元機能
// ==========================================
async function restoreFromJson(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            // ファイルの形式チェック
            const hasSongs = data.songs && Array.isArray(data.songs) && data.songs.length > 0;
            const hasRecords = data.clearRecords || data.scoreRecords || data.memoRecords;
            const isSongOnly = Array.isArray(data) && data.length > 0 && data[0].id; // 「楽曲のみ」で出力した場合

            if (!hasSongs && !hasRecords && !isSongOnly) {
                alert('対応していないファイル形式です。');
                return;
            }

            // 楽曲データが含まれる場合は管理者パスワードを要求
            if (hasSongs || isSongOnly) {
                if (!checkAdminAuth()) {
                    event.target.value = ''; // ファイル選択をリセット
                    return;
                }
            }

            if (!confirm(`現在のデータを選択したファイル「${file.name}」の内容で上書きしますか？\n※現在の未保存の記録は消去され、元に戻せません。`)) {
                event.target.value = '';
                return;
            }

            showLoading(true, 'データを復元中...');

            // 楽曲のみの配列だった場合
            if (isSongOnly) {
                songs = data;
                localStorage.setItem(STORAGE_KEY_SONGS, JSON.stringify(songs));
            } else {
                // フルバックアップ形式の場合
                if (hasSongs) {
                    songs = data.songs;
                    localStorage.setItem(STORAGE_KEY_SONGS, JSON.stringify(songs));
                }
                if (data.clearRecords) clearRecords = data.clearRecords;
                if (data.scoreRecords) scoreRecords = data.scoreRecords;
                if (data.memoRecords) memoRecords = data.memoRecords;

                // 現在のユーザーデータに反映
                if (!allUsersData[currentUser]) allUsersData[currentUser] = { clearRecords: {}, scoreRecords: {}, memoRecords: {} };
                allUsersData[currentUser].clearRecords = clearRecords;
                allUsersData[currentUser].scoreRecords = scoreRecords;
                allUsersData[currentUser].memoRecords = memoRecords;

                // ローカルストレージに保存
                localStorage.setItem(STORAGE_KEY_CLEARS, JSON.stringify(clearRecords));
                localStorage.setItem(STORAGE_KEY_SCORES, JSON.stringify(scoreRecords));
                localStorage.setItem(STORAGE_KEY_MEMOS, JSON.stringify(memoRecords));
            }

            updateDynamicFilters();
            renderTable();
            showLoading(false);
            
            alert('データの復元が完了しました！\n※クラウドへも反映する場合は、上部の「☁️ 変更をクラウドに保存」または「⬆️ 今のデバイスのデータを移行」を実行してください。');

        } catch (err) {
            console.error(err);
            alert('ファイルの読み込みに失敗しました。JSONファイルが壊れている可能性があります。');
            showLoading(false);
        }
        
        event.target.value = ''; // 次回も同じファイルを選択できるようにリセット
    };
    reader.readAsText(file);
}
