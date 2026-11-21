// ==========================================
// readonly.js（以前のページ ver 2.101 を「見るだけ」にするための部品。いちばん最後に読み込む）
//   メダル・スコア・メモ・楽曲編集などの変更画面は開かない。保存・取り込み・管理の操作は何もしない
// ==========================================
(function () {
    const notice = () => {
        if (typeof showToast === 'function') showToast('toast-readonly', '以前のページは見るだけです（変更は今のアプリで）', '#607d8b', 2500);
    };
    const silent = function () {};
    // メダル・ランクの画像：公式サイトの画像の代わりに、今のアプリにある同じファイル名の画像（../images/）を使う（見た目は同じ。古いコードは http で始まる URL だけを画像にするので、完全な URL にする）
    const local = (url, dir) => { const m = /\/([\w-]+\.png)$/.exec(url || ''); return m ? new URL(`../images/${dir}/${m[1]}`, location.href).href : url; };
    try {
        Object.values(MEDAL_TYPES).forEach(m => { if (m && /^https?:/.test(m.imgUrl || '')) m.imgUrl = local(m.imgUrl, 'medal'); });
        Object.keys(RANK_IMAGES).forEach(k => { RANK_IMAGES[k] = local(RANK_IMAGES[k], 'rank'); });
    } catch (e) { /* 何もしない */ }
    // 変更画面は開かない（押しても何も起きない。案内だけ出す）
    ['openMedalModal', 'openScoreModal', 'openMemoModal', 'openAddModal', 'openEditModal', 'openBulkDiffModal']
        .forEach(name => { if (typeof window[name] === 'function') window[name] = notice; });
    // 記録を変える・保存する・取り込む操作は何もしない
    ['selectMedal', 'saveScoreModal', 'saveMemoModal', 'clearMemo', 'deleteSong', 'saveEditModal', 'handleBannerFileUpload',
     'scheduleAutoSave', 'runAutoSave', 'saveCurrentUserToCloud', 'saveAllToCloud', 'saveToCloud', 'uploadImageToCloud',
     'addNewUser', 'addHistoryEntry', 'deleteHistoryEntry',
     'importFromClipboard', 'importDataManual', 'processImportText', 'updateBannerFromClipboard', 'deleteLevelData', 'clearRecordsOnly',
     'migrateBannersToCloud', 'handleSingleBannerDrop', 'restoreFromJson', 'applyBulkDiff',
     'importEagateFromClipboard', 'importEagateFromText', 'openEagateImportPreview', 'applyEagateImport', 'notifyEagateOpener',
     'savePokkuraVersionRecords']
        .forEach(name => { if (typeof window[name] === 'function') window[name] = (name.startsWith('open') || name.startsWith('import')) ? notice : silent; });
    // 保存・管理のボタンは隠し、上に「以前のページ・見るだけ」の帯を出す
    const style = document.createElement('style');
    style.textContent = '#save-btn, .menu-save-all-btn, #admin-controls { display: none !important; }'
        + '#classic-readonly-bar { position: sticky; top: 0; z-index: 9000; background: #455a64; color: #fff; font-size: 13px; font-weight: bold; text-align: center; padding: 6px 10px; }'
        + '#classic-readonly-bar a { color: #ffe082; margin-left: 10px; }';
    document.head.appendChild(style);
    const bar = document.createElement('div');
    bar.id = 'classic-readonly-bar';
    bar.innerHTML = '以前のページ（ver 2.101）・見るだけ<a href="../">今のアプリに戻る</a>';
    document.body.prepend(bar);
})();
