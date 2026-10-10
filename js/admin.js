// ==========================================
// admin.js
// データ管理（管理者向け）。
// 楽曲データの取り込み・バックアップ/復元・レベル削除・バナー画像の登録と移行・難易度の一括割り当て。
// ==========================================

function downloadSongsAndClearsJson() {
    const exportData = { songs: songs, clearRecords: clearRecords, scoreRecords: scoreRecords, memoRecords: memoRecords };
    const dataStr = JSON.stringify(exportData, null, 2);
    triggerDownload(dataStr, `popn_data_${currentUser}.json`, 'クリア・スコア・メモを含めて');
}

function downloadSongsJsonOnly() {
    const dataStr = JSON.stringify(songs, null, 2);
    triggerDownload(dataStr, 'songs.json', '楽曲データのみで');
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
    if (isNarrowScreen()) return;

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

async function clearRecordsOnly() {
    if(confirm(`ユーザー [${currentUser}] のすべての記録（クリア・スコア・メモ）をリセットしますか？\n（楽曲リストは保持されます）`)) {
        allUsersData[currentUser].clearRecords = {};
        allUsersData[currentUser].scoreRecords = {};
        allUsersData[currentUser].memoRecords = {};
        clearRecords = allUsersData[currentUser].clearRecords;
        scoreRecords = allUsersData[currentUser].scoreRecords;
        memoRecords = allUsersData[currentUser].memoRecords;
        scheduleAutoSave();   // ←追加
        renderTable();
    }
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
                // 画像をリサイズしてクラウドにアップロード（失敗時はBase64のままフォールバック）
                showLoading(true, `画像を処理・反映中... (${i + 1}/${files.length})`);
                const bannerUrl = await processImageFileAndUpload(file, fileNameWithoutExt);
                targetSong.bannerUrl = bannerUrl;
                updatedCount++;
            } else {
                notFoundFiles.push(file.name);
            }
        }

        showLoading(false);
        renderTable(); // テーブルを再描画して画像を反映

        // 結果のフィードバック
        if (updatedCount > 0) {
            alert(`${updatedCount}件のバナー画像を更新しました！\n（※クラウドに保存するには、メニューの「☁️ 全体保存」から楽曲データを保存してください）`);
        }
        if (notFoundFiles.length > 0) {
            alert(`以下のファイル名に一致する楽曲が見つかりませんでした:\n${notFoundFiles.join('\n')}`);
        }
    });
}

// ★追加：画像ファイルをリサイズ→クラウドにアップロードしてURLを返す。失敗時はBase64にフォールバック
async function processImageFileAndUpload(file, fileNameHint) {
    const dataUrl = await processImageFileToDataURL(file);
    const uploadedUrl = await uploadImageToCloud(dataUrl, fileNameHint || file.name.replace(/\.[^/.]+$/, ""));
    return uploadedUrl || dataUrl;
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
// ★ 既存のBase64バナー画像をクラウドURLへ一括移行
// ==========================================
async function migrateBannersToCloud() {
    if (!checkAdminAuth()) return;
    if (!GAS_URL || GAS_URL.trim() === '') {
        alert("GAS_URLが設定されていません。");
        return;
    }

    const targets = songs.filter(s => s.bannerUrl && s.bannerUrl.startsWith('data:image'));
    if (targets.length === 0) {
        alert("移行対象のBase64画像はありませんでした。（すでに全てURL方式です）");
        return;
    }

    if (!confirm(`${targets.length}件のBase64バナー画像をクラウド上のURLに移行します。\n移行後、楽曲リストをクラウドに保存する必要があります（続けて確認が出ます）。\n\n実行しますか？`)) return;

    let successCount = 0;
    let failCount = 0;
    const failedTitles = [];

    for (let i = 0; i < targets.length; i++) {
        const song = targets[i];
        showLoading(true, `画像を移行中... (${i + 1}/${targets.length}) ${song.title}`);
        const uploadedUrl = await uploadImageToCloud(song.bannerUrl, song.title);
        if (uploadedUrl) {
            song.bannerUrl = uploadedUrl;
            successCount++;
        } else {
            failCount++;
            failedTitles.push(song.title);
        }
    }

    showLoading(false);
    renderTable();

    let msg = `移行完了：成功 ${successCount}件`;
    if (failCount > 0) {
        msg += ` / 失敗 ${failCount}件\n失敗した曲:\n${failedTitles.join('\n')}\n（失敗分はBase64のまま残っているので、後でもう一度このボタンを押せば再試行されます）`;
    }
    alert(msg);

    if (successCount > 0) {
        if (confirm("続けて、更新された楽曲リストをクラウドに保存しますか？\n（保存しないと、次回読み込み時にまたBase64の状態に戻ってしまいます）")) {
            await saveToCloud(true);
        }
    }
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
            const bannerUrl = await processImageFileAndUpload(file, songs[songIndex].title); // リサイズ＋クラウドアップロード
            songs[songIndex].bannerUrl = bannerUrl;
            renderTable(); // テーブルを再描画して反映
        }
    } catch (err) {
        console.error(err);
        alert('画像の処理に失敗しました。');
    }
    showLoading(false);
}

// ==========================================
// ★ バックアップJSONからの復元機能
// ==========================================
async function restoreFromJson(event) {
    const input = event.target;
    const file = input.files[0];
    if (!file) return;

    try {
        if (!cloudReady) {
            alert('クラウドの最新データを読み込めていないため、復元できません。\nページを再読み込みしてからやり直してください。');
            return;
        }

        const data = JSON.parse(await file.text());
        if (!data || typeof data !== 'object') { alert('対応していないファイル形式です。'); return; }

        const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
        const fileSongs = Array.isArray(data) ? data : data.songs;   // 「楽曲のみ」のバックアップは配列
        const hasSongs = Array.isArray(fileSongs) && fileSongs.length > 0 &&
            fileSongs.every(s => isObj(s) && 'title' in s && 'notes' in s);
        const hasRecords = isObj(data) &&
            (isObj(data.clearRecords) || isObj(data.scoreRecords) || isObj(data.memoRecords));

        if (!hasSongs && !hasRecords) { alert('対応していないファイル形式です。'); return; }

        // 何を復元するか
        let restoreSongs = hasSongs;
        let restoreRecords = hasRecords;
        if (hasSongs && hasRecords) {
            const mode = prompt(`「${file.name}」から何を復元しますか？\n\n1 : 記録（クリア・スコア・メモ）だけ\n2 : 楽曲リスト ＋ 記録（※管理者パスワード必須）\n\n半角数字の 1, 2 のいずれかを入力してください。`, '1');
            if (mode !== '1' && mode !== '2') return;
            restoreSongs = (mode === '2');
        }
        if (restoreSongs && !checkAdminAuth()) return;

        // 確認（ファイル名のユーザーと選択中のユーザーが違えば注意を出す）
        const nameMatch = file.name.match(/^popn_data_(.+?)(?: \(\d+\))?\.json$/);
        const fileUser = nameMatch ? nameMatch[1] : null;
        let msg = `「${file.name}」の内容で復元します。\n`;
        if (restoreRecords) {
            msg += `\n・ユーザー [${currentUser}] の記録を、ファイルの内容に置き換えます`;
            if (fileUser && fileUser !== currentUser) {
                msg += `\n  ⚠ このファイルは [${fileUser}] のバックアップのようです。ユーザーが違っていないか確認してください`;
            }
        }
        if (restoreSongs) msg += `\n・楽曲リスト全体を、ファイルの ${fileSongs.length} 曲に置き換えます（全ユーザーに影響）`;
        msg += `\n\nクラウドにも反映され、元に戻せません。よろしいですか？`;
        if (!confirm(msg)) return;

        // 楽曲リストの復元
        if (restoreSongs) {
            songs = fileSongs.map((s, i) => {
                const p = parseDifficulty(s.diffRaw);
                return Object.assign({}, s, {
                    // 文字列であるべき項目は文字列にそろえ、危険なURLは取り込まない
                    genre: String(s.genre ?? ''),
                    title: String(s.title ?? ''),
                    bannerUrl: safeUrl(s.bannerUrl, true),
                    wikiUrl: safeUrl(s.wikiUrl),
                    id: s.id || (s.genre + '_' + s.title + '_' + s.notes),
                    level: s.level || '48',
                    diffRaw: s.diffRaw || '',
                    diffClass: p.diffClass,
                    diffIndex: p.diffIndex,
                    originalOrder: s.originalOrder !== undefined ? s.originalOrder : i
                });
            });
        }

        // 記録の復元（ファイルに入っている種類だけ置き換える）
        let skippedMedals = 0;
        let orphanCount = 0;
        if (restoreRecords) {
            if (!allUsersData[currentUser]) allUsersData[currentUser] = emptyUser();
            const user = allUsersData[currentUser];

            if (isObj(data.clearRecords)) {
                const clears = {};
                for (const id in data.clearRecords) {
                    const medal = data.clearRecords[id];
                    // アプリが知らないメダル名は取り込まない（画面が壊れるのを防ぐ）
                    if (medal !== '' && MEDAL_TYPES[medal]) clears[id] = medal; else skippedMedals++;
                }
                user.clearRecords = clears;
            }
            if (isObj(data.scoreRecords)) user.scoreRecords = data.scoreRecords;
            if (isObj(data.memoRecords)) user.memoRecords = data.memoRecords;

            clearRecords = user.clearRecords;
            scoreRecords = user.scoreRecords;
            memoRecords = user.memoRecords;

            const songIds = new Set(songs.map(s => s.id));
            orphanCount = Object.keys(clearRecords).filter(id => !songIds.has(id)).length;
        }

        updateDynamicFilters();
        renderTable();

        // クラウドへ反映（楽曲リストはその場で保存、記録は自動保存に任せる）
        let songsSaved = true;
        if (restoreSongs) songsSaved = await saveToCloud(true);
        if (restoreRecords) scheduleAutoSave();

        let done = '復元が完了しました。';
        if (restoreRecords) {
            done += `\n・記録：クリア ${Object.keys(clearRecords).length}件 / スコア ${Object.keys(scoreRecords).length}件 / メモ ${Object.keys(memoRecords).length}件（自動でクラウドに保存されます）`;
            if (orphanCount > 0) done += `\n・うち ${orphanCount}件は、今の楽曲リストに無い曲の記録です（表示されません）`;
            if (skippedMedals > 0) done += `\n・不明なメダル ${skippedMedals}件は取り込みませんでした`;
        }
        if (restoreSongs) {
            done += songsSaved
                ? '\n・楽曲リスト：クラウドに保存しました'
                : '\n・楽曲リスト：クラウド保存に失敗しました。メニューの「☁️ 全体保存」からやり直してください';
        }
        alert(done);

    } catch (err) {
        console.error(err);
        alert('ファイルの読み込みに失敗しました。JSONファイルが壊れている可能性があります。');
    } finally {
        input.value = ''; // 次回も同じファイルを選択できるようにリセット
    }
}

// ==========================================
// ★ 難易度・指数の一括割り当て
// ==========================================
const BULK_CLS = '危険|別格|逆詐称|詐称|入門|強|中|弱';
const BULK_NUM = '[+\\-±]?\\d+(?:\\.\\d+)?';
const BULK_SIGNED = '[+\\-±]\\d+(?:\\.\\d+)?';
const BULK_ERR = '(?:\\s*±\\s*\\d+(?:\\.\\d+)?)?'; // 指数の後ろの誤差（例: ±0.5）
const BULK_DECO = '[■□◆◇●○★☆▼▽▶▷【】《》「」『』<>:#*・=、,\\[\\]]+';
const BULK_RE_DECO_START = new RegExp('^' + BULK_DECO);
const BULK_RE_DECO_END = new RegExp(BULK_DECO + '$');
const BULK_RE_STRICT = new RegExp('^(' + BULK_CLS + ')?(?:([(\\[])?(' + BULK_NUM + ')(' + BULK_ERR + ')[)\\]]?)?$');
const BULK_RE_FREE_CLS = new RegExp('(' + BULK_CLS + ')\\s*(?:[(\\[]\\s*(' + BULK_NUM + ')(' + BULK_ERR + ')\\s*[)\\]]|(' + BULK_SIGNED + ')(' + BULK_ERR + '))?', 'g');
const BULK_RE_FREE_NUM = new RegExp('[(\\[]\\s*(' + BULK_SIGNED + ')(' + BULK_ERR + ')\\s*[)\\]]|(?:^|\\s)(' + BULK_SIGNED + ')(' + BULK_ERR + ')(?=\\s|$)');
const BULK_RE_CHART_SUFFIX = /\((?:ex|h|n|e)\)$/; // ジャンル名の末尾の譜面表記

let bulkDiffResults = [];

// 表記ゆれを吸収する（全角/半角・大文字/小文字・ハイフンや波ダッシュの違い・ⓊとUPPER）
function bulkNormText(s) {
    return String(s || '')
        .replace(/[\u24CA\u24E4]/g, '(UPPER)')   // Ⓤ → (UPPER)
        .replace(/[\u2212\u2010-\u2015]/g, '-')
        .replace(/[\u301C\u223C]/g, '~')
        .replace(/[\u2018\u2019\u0060\u00B4]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[(\[]\s*upper\s*[)\]]/g, '(upper)'); // （UPPER）や [UPPER] も同じ扱いに
}
function bulkKey(s) { return bulkNormText(s).replace(/\s+/g, ''); }
function bulkIdxOk(idx) { return Math.abs(parseFloat(idx.replace('±', ''))) <= 10; }
function bulkCleanErr(s) { return (s || '').replace(/\s+/g, ''); }

// 文字列全体が「強(+0.5)」「中(+0.213±0.5)」「詐称」「+1.5」のような難易度表記かどうか
function bulkParseStrict(part) {
    const t = part.replace(/\s+/g, '').replace(BULK_RE_DECO_START, '').replace(BULK_RE_DECO_END, '');
    if (!t) return null;
    const m = t.match(BULK_RE_STRICT);
    if (!m || (!m[1] && !m[3])) return null;
    if (m[3] && !bulkIdxOk(m[3])) return null;
    // 区分なしの数字だけの場合は、符号かカッコが無ければ無視（BPMやノーツ数との混同防止）
    if (!m[1] && !m[2] && !/^[+\-±]/.test(m[3])) return null;
    return { cls: m[1] || null, idx: m[3] || null, err: bulkCleanErr(m[4]) };
}

// 曲名以外の部分から難易度表記を探す
function bulkExtractDiff(parts) {
    for (let i = parts.length - 1; i >= 0; i--) {
        let d = bulkParseStrict(parts[i]);
        if (d) return d;
        const tokens = parts[i].split(/\s+/);
        for (let j = tokens.length - 1; j >= 0; j--) {
            d = bulkParseStrict(tokens[j]);
            if (d) return d;
        }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
        let best = null;
        for (const m of parts[i].matchAll(BULK_RE_FREE_CLS)) {
            const idx = m[2] || m[4] || null;
            const err = idx ? bulkCleanErr(m[2] ? m[3] : m[5]) : '';
            if (!idx && m[1].length === 1) continue; // 「強」「中」「弱」単独は誤検出しやすいので無視
            if (idx && !bulkIdxOk(idx)) continue;
            if (!best || (idx && !best.idx)) best = { cls: m[1], idx: idx, err: err };
        }
        if (best) return best;
    }
    for (let i = parts.length - 1; i >= 0; i--) {
        const m = parts[i].match(BULK_RE_FREE_NUM);
        if (m) {
            const idx = m[1] || m[3];
            const err = bulkCleanErr(m[1] ? m[2] : m[4]);
            if (bulkIdxOk(idx)) return { cls: null, idx: idx, err: err };
        }
    }
    return null;
}

// 保存する難易度の文字列を作る（例: 強(+0.5) / 中(+0.213±0.5)）
function bulkBuildDiff(d, song) {
    let idx = d.idx;
    if (idx && /^\d/.test(idx) && parseFloat(idx) > 0) idx = '+' + idx;
    let cls = d.cls;
    let keptClass = false;
    if (!cls && song.diffClass && song.diffClass !== '未分類') { cls = song.diffClass; keptClass = true; }
    return { raw: (cls || '') + (idx ? '(' + idx + (d.err || '') + ')' : ''), keptClass: keptClass };
}

// 曲名・ジャンル名から曲を引くための索引
function bulkBuildNameIndex(targetSongs) {
    const map = new Map();
    const add = (name, song, kind) => {
        const key = bulkKey(name);
        if (!key) return;
        if (!map.has(key)) map.set(key, { key: key, len: key.length, entries: [], re: null });
        map.get(key).entries.push({ song: song, kind: kind });
    };
    targetSongs.forEach(s => {
        add(s.title, s, 'title');
        add(s.genre, s, 'genre');
        const g = bulkKey(s.genre);
        const loose = g.replace(BULK_RE_CHART_SUFFIX, '');
        if (loose && loose !== g) add(loose, s, 'genre'); // (EX) などを外した名前でも引けるように
    });

    map.forEach(e => {
        if (e.len < 2) return; // 1文字の名前は完全一致のみ
        let src = Array.from(e.key).map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
        // 英数字の名前は単語の途中に一致させない（例: "neu" が "neutral" に一致しないように）
        if (/^[a-z0-9]/.test(e.key)) src = '(?<![a-z0-9])' + src;
        if (/[a-z0-9]$/.test(e.key)) src = src + '(?![a-z0-9])';
        try { e.re = new RegExp(src, 'g'); } catch (err) { e.re = null; }
    });

    const list = [...map.values()].sort((a, b) => b.len - a.len); // 長い名前を優先
    return { map: map, list: list };
}

function openBulkDiffModal() {
    if (!checkAdminAuth()) return;

    const select = document.getElementById('bulk-diff-level');
    const levels = [...new Set(songs.map(s => s.level))].filter(l => l);
    levels.sort((a, b) => {
        const na = parseInt(a, 10), nb = parseInt(b, 10);
        if (!isNaN(na) && !isNaN(nb)) return nb - na;
        if (isNaN(na)) return 1;
        if (isNaN(nb)) return -1;
        return 0;
    });
    select.innerHTML = '';
    levels.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l;
        opt.text = isNaN(parseInt(l, 10)) ? l : `Lv ${l}`;
        select.appendChild(opt);
    });
    const optAll = document.createElement('option');
    optAll.value = 'ALL';
    optAll.text = 'すべてのレベル';
    select.appendChild(optAll);
    select.value = levels.includes(currentViewLevel) ? currentViewLevel : 'ALL';

    bulkDiffResults = [];
    document.getElementById('bulk-diff-preview').innerHTML = '';
    document.getElementById('bulk-diff-apply-btn').style.display = 'none';
    document.getElementById('bulk-diff-modal').style.display = 'flex';
}

function closeBulkDiffModal() {
    document.getElementById('bulk-diff-modal').style.display = 'none';
}

function analyzeBulkDiff() {
    const level = document.getElementById('bulk-diff-level').value;
    const text = document.getElementById('bulk-diff-text').value;
    const usePartial = document.getElementById('bulk-diff-partial').checked;

    if (!text.trim()) { alert('テキストが空です。'); return; }

    const targetSongs = songs.filter(s => level === 'ALL' || s.level === level);
    if (targetSongs.length === 0) { alert('対象レベルの楽曲がありません。'); return; }

    const index = bulkBuildNameIndex(targetSongs);
    const found = new Map();     // 曲ID -> 割り当て結果
    const noSongLines = [];      // 曲が見つからなかった行
    const noDiffLines = [];      // 曲はあったが難易度が読み取れなかった行
    let header = { cls: null, idx: null, err: '' }; // 直前の見出し（例: ■強(+1.0)）

    text.split(/\r?\n/).forEach(rawLine => {
        const line = rawLine
            .replace(/<[^>]+>/g, '')
            .replace(/\[\[[^\]]*?\|([^\]]*?)\]\]/g, '$1')
            .replace(/\[\[(.*?)\]\]/g, '$1');
        const lineN = bulkNormText(line).trim();
        if (!lineN) return;

        const cells = lineN.split(/[\t|]/).map(c => c.trim()).filter(c => c);
        if (cells.length === 0) return;

        const hits = new Map(); // song -> { title, genre, partial, ambiguous }
        const groups = [];
        let rest = [];
        const hit = (entry, partial) => {
            groups.push(entry);
            entry.entries.forEach(x => {
                const h = hits.get(x.song) || { title: false, genre: false, partial: partial, ambiguous: false };
                h[x.kind] = true;
                hits.set(x.song, h);
            });
        };

        // ① セル単位の完全一致
        cells.forEach(c => {
            const k = bulkKey(c);
            const e = index.map.get(k) || index.map.get(k.replace(BULK_RE_CHART_SUFFIX, ''));
            if (e) hit(e, false); else rest.push(c);
        });

        // ② 見つからなければ、行の中に曲名・ジャンル名が含まれているか探す
        if (hits.size === 0 && usePartial) {
            let work = cells.join(' \t ');
            index.list.forEach(e => {
                if (!e.re) return;
                e.re.lastIndex = 0;
                if (e.re.test(work)) {
                    e.re.lastIndex = 0;
                    work = work.replace(e.re, ' \u0001 '); // 一致した部分を伏せて、短い名前の重複一致を防ぐ
                    hit(e, true);
                }
            });
            if (hits.size > 0) {
                rest = work.split('\t').map(p => p.replace(/\u0001/g, ' ').trim()).filter(p => p);
            }
        }

        // 曲が無い行：難易度だけの行なら「見出し」として覚える
        if (hits.size === 0) {
            const h = cells.length === 1 ? bulkParseStrict(cells[0]) : null;
            if (h) header = h.cls ? h : { cls: header.cls, idx: h.idx, err: h.err };
            else noSongLines.push(rawLine.trim());
            return;
        }

        // 同じ名前の曲が複数ある場合：ジャンルと曲名の両方が一致した曲を優先
        groups.forEach(e => {
            const ss = [...new Set(e.entries.map(x => x.song))];
            if (ss.length < 2) return;
            const both = ss.filter(s => hits.get(s) && hits.get(s).title && hits.get(s).genre);
            if (both.length > 0) {
                ss.forEach(s => { if (!both.includes(s)) hits.delete(s); });
            } else {
                ss.forEach(s => { const h = hits.get(s); if (h) h.ambiguous = true; });
            }
        });

        // 難易度の読み取り（行内に無ければ見出しを使う）
        let d = bulkExtractDiff(rest);
        let fromHeader = false;
        if (d && !d.cls && header.cls) d = { cls: header.cls, idx: d.idx, err: d.err };
        if (!d && (header.cls || header.idx)) { d = header; fromHeader = true; }
        if (!d) { noDiffLines.push(rawLine.trim()); return; }

        hits.forEach((h, song) => {
            const built = bulkBuildDiff(d, song);
            if (!built.raw) return;
            const notes = [];
            if (h.partial) notes.push('部分一致');
            if (h.ambiguous) notes.push('同名の曲あり');
            if (fromHeader) notes.push('見出しから');
            if (built.keptClass) notes.push('区分は現状維持');
            const prev = found.get(song.id);
            if (prev && prev.newRaw !== built.raw) notes.push('複数行に登場(後の行を採用)');
            found.set(song.id, { id: song.id, song: song, newRaw: built.raw, notes: notes, ambiguous: h.ambiguous });
        });
    });

    const all = [...found.values()];
    bulkDiffResults = all.filter(r => (r.song.diffRaw || '') !== r.newRaw);
    const unchangedCount = all.length - bulkDiffResults.length;
    const unmatchedSongs = targetSongs.filter(s => !found.has(s.id));

    let html = `<div style="font-weight: bold; margin-bottom: 8px;">一致 ${all.length}曲（変更あり <span style="color:#d32f2f;">${bulkDiffResults.length}</span> / 変更なし ${unchangedCount}） ・ 対象レベルの未一致 ${unmatchedSongs.length}曲</div>`;

    if (bulkDiffResults.length > 0) {
        html += `<div style="max-height: 40vh; overflow-y: auto; border: 1px solid #ddd;">
            <table style="font-size: 0.85em; box-shadow: none;">
                <thead><tr>
                    <th style="width: 30px; text-align: center;"><input type="checkbox" checked onchange="document.querySelectorAll('.bulk-diff-check').forEach(c => c.checked = this.checked)"></th>
                    <th>ジャンル / 曲名</th><th>現在</th><th>変更後</th><th>備考</th>
                </tr></thead><tbody>`;
        bulkDiffResults.forEach((r, i) => {
            const p = parseDifficulty(r.newRaw);
            const st = getDifficultyColor(p.diffClass, p.diffIndex);
            html += `<tr>
                <td style="text-align: center;"><input type="checkbox" class="bulk-diff-check" value="${i}" ${r.ambiguous ? '' : 'checked'}></td>
                <td><div style="font-size: 0.85em; color: #666;">${escapeHtml(r.song.genre)}</div><b>${escapeHtml(r.song.title)}</b>${level === 'ALL' ? ` <span class="level-badge">${escapeHtml(r.song.level)}</span>` : ''}</td>
                <td style="color: #888;">${escapeHtml(r.song.diffRaw) || '（なし）'}</td>
                <td style="font-weight: bold; color: ${st.color}; text-shadow: ${st.shadow};">${escapeHtml(r.newRaw)}</td>
                <td style="font-size: 0.85em; color: #e65100;">${escapeHtml(r.notes.join(' / '))}</td>
            </tr>`;
        });
        html += `</tbody></table></div>`;
    } else {
        html += `<div style="color: #d32f2f; font-weight: bold; padding: 8px 0;">変更が必要な曲は見つかりませんでした。</div>`;
    }

    const listBlock = (title, items) => items.length === 0 ? '' : `
        <details style="margin-top: 8px; background: #f5f5f5; padding: 8px; border-radius: 4px;">
            <summary style="cursor: pointer; font-size: 0.85em; font-weight: bold; color: #555;">${title} (${items.length})</summary>
            <div style="max-height: 150px; overflow-y: auto; font-size: 0.8em; margin-top: 6px; white-space: pre-wrap; word-break: break-all;">${items.map(escapeHtml).join('\n')}</div>
        </details>`;

    html += listBlock('⚠ 曲は見つかったが難易度を読み取れなかった行', noDiffLines);
    html += listBlock('対象レベルで割り当てが無かった曲', unmatchedSongs.map(s => (s.genre && s.genre !== s.title ? s.genre + ' / ' : '') + s.title));
    html += listBlock('曲が見つからなかった行', noSongLines);

    document.getElementById('bulk-diff-preview').innerHTML = html;
    document.getElementById('bulk-diff-apply-btn').style.display = bulkDiffResults.length > 0 ? '' : 'none';
}

async function applyBulkDiff() {
    if (!checkAdminAuth()) return;

    const picked = [...document.querySelectorAll('.bulk-diff-check:checked')].map(cb => bulkDiffResults[parseInt(cb.value, 10)]);
    if (picked.length === 0) { alert('適用する曲が選択されていません。'); return; }

    let applied = 0;
    picked.forEach(r => {
        const song = songs.find(s => s.id === r.id);
        if (!song) return;
        const p = parseDifficulty(r.newRaw);
        song.diffRaw = r.newRaw;
        song.diffClass = p.diffClass;
        song.diffIndex = p.diffIndex;
        applied++;
    });

    bulkDiffResults = [];
    closeBulkDiffModal();
    renderTable();

    if (confirm(`${applied}曲に難易度を割り当てました。\n続けて楽曲リストをクラウドに保存しますか？\n（保存しないと、再読み込みしたときに元に戻ります）`)) {
        const ok = await saveToCloud(true);
        if (ok) alert('楽曲リストをクラウドに保存しました！');
    }
}
