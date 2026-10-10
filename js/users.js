// ==========================================
// users.js
// ユーザーの選択・切替・新規追加。
// ==========================================

function updateCurrentUserLabel() {
    const label = document.getElementById('current-user-label');
    if (label) label.textContent = `👤 ユーザー: ${currentUser}`;
}

function initUserSelector() {
    updateCurrentUserLabel();
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
    updateCurrentUserLabel();
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
