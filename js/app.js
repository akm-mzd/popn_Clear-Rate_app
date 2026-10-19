// ==========================================
// app.js
// 起動処理。最後に読み込む。
// ==========================================

function refreshUI() {
    initUserSelector();
    updateCompareUserSelect();
    initFilters();
    renderTable();
}

window.onload = async () => {
    initMedalGrid();

    // ① キャッシュがあれば即表示
    let snapshot = null;
    const cached = loadCache();
    if (cached && Array.isArray(cached.songs)) {
        applyFetchedData(cached);
        refreshUI();
        snapshot = JSON.stringify({ songs, allUsersData });
    } else {
        showLoading(true, 'データを取得中...');
    }

    // ② 最新データを取得（キャッシュ表示中は裏で）
    try {
        const fresh = await fetchCloudData();
        knownVersion = fresh.version;
        lastSyncAt = Date.now();
        markSynced(fresh.users);

        const before = snapshot ? JSON.parse(snapshot) : null;
        const songsEdited = before && JSON.stringify(songs) !== JSON.stringify(before.songs);
        if (!songsEdited) {
            if (before) mergeLocalEdits(fresh, before.allUsersData, allUsersData);
            applyFetchedData(fresh);
            refreshUI();
        }
        saveCache(fresh);
        cloudReady = true;
        migrateLocalPokkuraRecords(); // 端末にだけあるポックラ用データをクラウドへ
        checkGoalBackup();            // クラウドに目標がなく、この端末に控えがあれば戻すか聞く
        runAutoSave();      // 待っている間の編集があれば保存
        startRemoteSync();  // 他端末の変更の確認を開始
    } catch (e) {
        console.warn('クラウド読み込み失敗', e);
        alert(cached
            ? '最新データの取得に失敗しました。前回のデータを表示しています。\n（自動保存は止まっています。再読み込みするか、手動で保存してください）'
            : 'データの読み込みに失敗しました。ページを再読み込みしてください。');
    }
    showLoading(false);
    notifyEagateOpener(); // 公式サイトの「アプリに送る」から開かれたときは、データを受け取る
};
