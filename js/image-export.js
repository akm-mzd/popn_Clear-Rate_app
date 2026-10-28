// ==========================================
// image-export.js
// 画像出力（全体統計画像・難易度順画像・表示曲画像）。
// ページのCSSに左右されないよう、画像の中身はインラインスタイルで組み立てる。
// ==========================================

// ==========================================
// ★ 画像出力の共通処理
//   ページのCSS（スマホ用の非表示指定など）に影響されないよう、
//   画像の中身はすべてインラインスタイルで組み立てる
// ==========================================
const EXPORT_BG = '#f5f1e6';
const EXPORT_ACCENT = '#3949ab';
// 難易度順画像のレベルとタイトルの色（46 水色・47 オレンジ・48 緑・49 いつもの色・50 赤）
const EXPORT_LEVEL_COLORS = { '46': '#039be5', '47': '#ef6c00', '48': '#2e7d32', '49': EXPORT_ACCENT, '50': '#d32f2f' };
const EXPORT_MAX_PIXELS_PC = 16000000;     // iOS のキャンバス上限（約1677万px）より少し小さく
const EXPORT_MAX_PIXELS_MOBILE = 8000000;  // スマホはメモリが少ないので、さらに小さく抑える

const EXPORT_IMAGE_TIMEOUT_MS = 8000;   // 画像1枚の読み込みを待つ上限
const EXPORT_RENDER_TIMEOUT_MS = 60000; // 画像を作る処理全体の上限

// html2canvas はページ全体を複製してから描くので、画像にする部分（とその親）と <head> 以外は全部外す。
//   一覧の難易度表などにはバナー画像が何百枚もあり、スマホではそれを複製するだけで止まってしまうため
function makeExportIgnore(root) {
    return el => {
        if (el === root || root.contains(el) || el.contains(root)) return false;
        if (el.closest && el.closest('head')) return el.tagName === 'SCRIPT';
        return true;
    };
}

function withTimeout(promise, ms, message) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })
    ]).finally(() => clearTimeout(timer));
}

// スマホの結果表示で使っている画像URL（閉じるときに解放する）
let previewObjectUrl = null;


// 画像出力の開始：メニューを閉じ、保存・トップに戻るボタンを隠す
function beginImageExport() {
    if (typeof toggleMenu === 'function') toggleMenu(false);
    document.body.classList.add('exporting-image');
}

function endImageExport() {
    document.body.classList.remove('exporting-image');
}

function closeImageResultModal() {
    document.getElementById('image-result-modal').style.display = 'none';
    // 大きな画像をメモリに残さないよう、表示を外してから URL を解放する
    document.getElementById('generated-image-preview').removeAttribute('src');
    if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = null;
    }
    endImageExport();
}

function createExportRoot(width) {
    const root = document.createElement('div');
    root.style.cssText = `position: absolute; left: -99999px; top: 0; background: ${EXPORT_BG}; padding: 18px 22px 22px; width: ${width ? width + 'px' : 'max-content'}; font-family: sans-serif; color: #333; box-sizing: border-box; line-height: 1.2;`;
    document.body.appendChild(root);
    return root;
}

// 文字を枠の中央に置くための共通スタイル
const EXPORT_CENTER = 'display: flex; align-items: center; justify-content: center; text-align: center;';

function buildExportHeader(levelText, titleText, accent = EXPORT_ACCENT) {
    const now = new Date();
    const dateText = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
    const lvSize = String(levelText).length > 3 ? 22 : (String(levelText).length > 2 ? 30 : 44);
    return `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 14px;">
            <div style="background: #fff; border: 3px solid ${accent}; border-radius: 12px; width: 104px; height: 84px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0;">
                <div style="font-size: 15px; line-height: 1; font-weight: bold; color: ${accent}; letter-spacing: 1px;">LEVEL</div>
                <div style="font-size: ${lvSize}px; line-height: 1; font-weight: bold; color: ${accent}; margin-top: 6px;">${escapeHtml(levelText)}</div>
            </div>
            <div style="flex: 1; ${EXPORT_CENTER} font-size: 28px; line-height: 1.2; font-weight: bold; color: ${accent};">${escapeHtml(titleText)}</div>
            <div style="text-align: right; color: #555; font-size: 14px; line-height: 1.6; flex-shrink: 0;">
                <div>作成日 ${dateText}</div>
                <div style="font-weight: bold;">User: ${escapeHtml(currentUser)}</div>
            </div>
        </div>`;
}

function getExportLevelText() {
    const searchInput = document.getElementById('search-input');
    if (searchInput && searchInput.value.trim() !== '') return '検索';
    if (isSpecialViewLevel(currentViewLevel)) return SPECIAL_VIEW_LEVELS[currentViewLevel];
    return currentViewLevel === 'ALL' ? 'ALL' : currentViewLevel;
}

function buildMedalIconHtml(medalKey, size) {
    const m = MEDAL_TYPES[medalKey];
    if (m && m.imgUrl && isImageSrc(m.imgUrl)) {
        return `<img src="${toImageProxyUrl(m.imgUrl)}" crossorigin="anonymous" style="width: ${size}px; height: ${size}px; object-fit: contain; display: block;">`;
    }
    const label = m ? m.label : '';
    return `<span style="font-size: 11px; line-height: 1; color: #555; white-space: nowrap;">${escapeHtml(label)}</span>`;
}

// メダル枠（未プレイは空枠、未解禁は鍵）
function buildMedalBoxHtml(medalKey) {
    const m = MEDAL_TYPES[medalKey];
    const boxStyle = `width: 34px; height: 34px; flex-shrink: 0; border-radius: 6px; ${EXPORT_CENTER} box-sizing: border-box;`;
    if (m && m.imgUrl && isImageSrc(m.imgUrl)) {
        return `<div style="${boxStyle} background: #fff; border: 2px solid #90a4ae;"><img src="${toImageProxyUrl(m.imgUrl)}" crossorigin="anonymous" style="width: 28px; height: 28px; object-fit: contain; display: block;"></div>`;
    }
    if (medalKey === '未解禁') {
        return `<div style="${boxStyle} background: #424242; border: 2px solid #212121; color: #fff; font-size: 14px; line-height: 1;">🔒</div>`;
    }
    return `<div style="${boxStyle} background: #fff; border: 2px solid #90a4ae;"></div>`;
}

function buildBannerBoxHtml(song, width, height) {
    const style = `width: ${width}px; height: ${height}px; flex-shrink: 0; border-radius: 3px; box-sizing: border-box;`;
    const bannerSrc = safeUrl(song.bannerUrl, true);
    if (bannerSrc) {
        return `<img src="${escapeHtml(toImageProxyUrl(bannerSrc))}" crossorigin="anonymous" style="${style} object-fit: cover; display: block; background: #eee;">`;
    }
    return `<div style="${style} ${EXPORT_CENTER} background: #37474f; color: #fff; padding: 2px 6px; overflow: hidden;"><span style="font-size: 11px; line-height: 1.2; font-weight: bold;">${escapeHtml(song.title)}</span></div>`;
}

// 画像の読み込みを待つ。1枚あたり EXPORT_IMAGE_TIMEOUT_MS を過ぎたら、その画像は外して先に進む
function waitExportImages(root) {
    const images = Array.from(root.querySelectorAll('img'));
    return Promise.all(images.map(img => new Promise(res => {
        if (img.complete) { res(); return; }
        const timer = setTimeout(() => {
            console.warn('Image load timeout:', img.src);
            img.removeAttribute('src'); // 読み込み途中の画像で html2canvas が待たないように
            res();
        }, EXPORT_IMAGE_TIMEOUT_MS);
        img.onload = () => { clearTimeout(timer); res(); };
        img.onerror = () => { clearTimeout(timer); console.warn("Image proxy failed:", img.src); res(); };
    })));
}

// ボタンの元の名前を取り出す。
//   innerText は閉じたメニュー（visibility:hidden）の中では空になるため、textContent を使う。
//   最初に読んだ名前を data-label に残しておき、以後はそれを正とする。
function getButtonLabel(btn) {
    if (!btn.dataset.label) btn.dataset.label = btn.textContent.trim();
    return btn.dataset.label;
}

async function prepareExport(btn) {
    const originalText = getButtonLabel(btn);
    beginImageExport();
    btn.textContent = "準備中... (ライブラリ読込)";
    showLoading(true, '画像を作成中…（準備）');
    try {
        await withTimeout(ensureHtml2Canvas(), 20000, 'timeout');
    } catch (e) {
        showLoading(false);
        alert("画像生成ライブラリの読み込みに失敗しました。通信環境を確認してください。");
        btn.textContent = originalText;
        endImageExport();
        return null;
    }
    btn.textContent = "生成中... (画像読込待機)";
    return originalText;
}

// 組み立てた画像の要素を PNG にして、オブジェクトURL を返す。終わったら要素は取り除く
//   （長い dataURL 文字列を作らないので軽い。使い終わったら URL.revokeObjectURL で解放すること）
async function renderExportToBlobUrl(root) {
    try {
        await waitExportImages(root);
        const w = root.scrollWidth, h = root.scrollHeight;
        // キャンバスの上限を超えないよう、大きい画像は倍率を下げる
        const maxPixels = isMobileDevice() ? EXPORT_MAX_PIXELS_MOBILE : EXPORT_MAX_PIXELS_PC;
        const scale = Math.max(0.5, Math.min(2, Math.sqrt(maxPixels / Math.max(1, w * h))));
        const canvas = await withTimeout(html2canvas(root, {
            backgroundColor: EXPORT_BG, scale, useCORS: true, logging: false,
            width: w, height: h, windowWidth: Math.max(w + 100, 1200),
            imageTimeout: EXPORT_IMAGE_TIMEOUT_MS,
            ignoreElements: makeExportIgnore(root),
        }), EXPORT_RENDER_TIMEOUT_MS, 'timeout');
        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
        });
        // キャンバスのメモリをすぐに返す
        canvas.width = 0;
        canvas.height = 0;
        return URL.createObjectURL(blob);
    } finally {
        root.remove();
    }
}

// ダウンロードさせて、少し待ってから URL を解放する
function downloadBlobUrl(blobUrl, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = blobUrl;
    link.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
}

// 1枚の画像を出力する（スマホ：画面に表示して長押し保存 / PC：ダウンロード）
async function outputExportImage(root, filename, btn, originalText) {
    btn.textContent = "生成中... (描画中)";
    showLoading(true, '画像を作成中…');
    let showedModal = false;
    try {
        const blobUrl = await renderExportToBlobUrl(root);
        if (isMobileDevice()) {
            if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
            previewObjectUrl = blobUrl;
            document.getElementById('generated-image-preview').src = blobUrl;
            document.getElementById('image-result-modal').style.display = 'flex';
            showedModal = true;
        } else {
            downloadBlobUrl(blobUrl, filename);
        }
    } catch (e) {
        alert(e && e.message === 'timeout' ? '画像の作成に時間がかかりすぎたため中止しました。もう一度試してください。' : '画像の生成に失敗しました。');
        console.error(e);
    } finally {
        showLoading(false);
        btn.textContent = originalText;
        if (!showedModal) endImageExport();
    }
}

function exportDateStr() {
    return new Date().toISOString().slice(0, 10);
}

// ==========================================
// ★ 全体統計画像（Lv50〜46 のクリア・メダル状況）
// ==========================================
async function generateOverviewImage() {
    const btn = document.getElementById('btn-overview-image');
    const originalText = await prepareExport(btn);
    if (originalText === null) return;
    await outputExportImage(buildOverviewRoot(), `popn_overview_${currentUser}_${exportDateStr()}.png`, btn, originalText);
}

function buildOverviewRoot() {
    const sortedMedalKeys = Object.keys(MEDAL_TYPES)
        .sort((a, b) => MEDAL_TYPES[b].rank - MEDAL_TYPES[a].rank);
    const targetLevels = ['50', '49', '48', '47', '46'];
    const COL_W = 62;

    const root = createExportRoot();
    let html = buildExportHeader('ALL', "pop'n music 全体統計");

    // 見出し行（メダルアイコン）
    html += `<div style="display: flex; align-items: stretch; gap: 10px; margin-bottom: 6px;">
        <div style="width: 72px; flex-shrink: 0;"></div>
        <div style="width: 96px; flex-shrink: 0; ${EXPORT_CENTER} font-size: 12px; line-height: 1.3; font-weight: bold; color: #555;">クリア数<br>/ 曲数</div>
        <div style="display: flex; gap: 4px;">`;
    sortedMedalKeys.forEach(k => {
        html += `<div style="width: ${COL_W}px; height: 40px; ${EXPORT_CENTER} background: #fff; border: 2px solid #90a4ae; border-radius: 6px; box-sizing: border-box;">${k === '' ? '<span style="font-size: 11px; line-height: 1; color: #555;">未プレイ</span>' : buildMedalIconHtml(k, 30)}</div>`;
    });
    html += `</div></div>`;

    let rowCount = 0;
    targetLevels.forEach(lv => {
        const lvSongs = songs.filter(s => s.level === lv);
        if (lvSongs.length === 0) return;
        rowCount++;

        const counts = {};
        sortedMedalKeys.forEach(k => counts[k] = 0);
        let clearedCount = 0; // イージークリアは含まない（ノーマル以上のみ）
        lvSongs.forEach(s => {
            const medalKey = clearRecords[s.id] || '';
            if (counts[medalKey] !== undefined) counts[medalKey]++;
            if (MEDAL_TYPES[medalKey] && MEDAL_TYPES[medalKey].isNormalClear) clearedCount++;
        });
        const total = lvSongs.length;

        html += `<div style="background: #fff; border: 2px solid #90a4ae; border-radius: 8px; padding: 8px; margin-bottom: 8px;">
            <div style="display: flex; align-items: stretch; gap: 10px;">
                <div style="width: 72px; height: 56px; flex-shrink: 0; ${EXPORT_CENTER} background: ${EXPORT_ACCENT}; color: #fff; border-radius: 6px; font-size: 26px; line-height: 1; font-weight: bold;">${lv}</div>
                <div style="width: 96px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
                    <div style="font-size: 22px; line-height: 1.1; font-weight: bold; color: #d32f2f;">${clearedCount}</div>
                    <div style="font-size: 13px; line-height: 1.2; color: #666;">/ ${total}</div>
                </div>
                <div style="display: flex; gap: 4px;">`;
        sortedMedalKeys.forEach(k => {
            const c = counts[k];
            const opacity = c === 0 ? 'opacity: 0.25;' : '';
            html += `<div style="width: ${COL_W}px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; ${opacity}">
                <div style="font-size: 18px; line-height: 1.1; font-weight: bold; color: #333;">${c}</div>
                <div style="font-size: 11px; line-height: 1.3; color: #666;">${formatRate(c, total)}%</div>
            </div>`;
        });
        html += `</div></div>
            <div style="display: flex; width: 100%; height: 16px; border-radius: 4px; overflow: hidden; background: #eee; margin-top: 8px; border: 1px solid #cfd8dc; box-sizing: border-box;">`;
        // 近い色が隣り合っても境目が分かるよう、2つ目以降の区切りの左に白い線を入れる
        let isFirstSegment = true;
        sortedMedalKeys.forEach(k => {
            if (counts[k] > 0) {
                const divider = isFirstSegment ? '' : 'border-left: 2px solid #fff;';
                html += `<div style="width: ${(counts[k] / total) * 100}%; background: ${MEDAL_COLORS[k] || '#ccc'}; box-sizing: border-box; ${divider}"></div>`;
                isFirstSegment = false;
            }
        });
        html += `</div></div>`;
    });

    if (rowCount === 0) {
        html += `<div style="${EXPORT_CENTER} padding: 30px; font-size: 16px; color: #666;">Lv46〜50 の楽曲データがありません。</div>`;
    }

    root.innerHTML = html;
    return root;
}

// ==========================================
// ★ 難易度順画像（指数ごとにバナーとクリアメダルを並べた画像）
// ==========================================
// メダル別の曲数の帯（「/ 総数」付き）
function buildMedalSummaryHtml(targetSongs) {
    const counts = {};
    targetSongs.forEach(s => {
        const k = clearRecords[s.id] || '';
        counts[k] = (counts[k] || 0) + 1;
    });
    const summaryKeys = Object.keys(MEDAL_TYPES)
        .filter(k => k !== '' && (k !== '未解禁' || counts[k]))
        .sort((a, b) => MEDAL_TYPES[b].rank - MEDAL_TYPES[a].rank);
    let html = `<div style="display: flex; justify-content: flex-end; margin-bottom: 14px;">
        <div style="display: flex; align-items: center; background: #fff; border: 2px solid #90a4ae; border-radius: 8px; padding: 4px 6px;">`;
    summaryKeys.forEach(k => {
        html += `<div style="display: flex; align-items: center; justify-content: center; gap: 4px; height: 30px; padding: 0 7px; border-right: 1px solid #ddd;">
            <div style="width: 24px; height: 24px; ${EXPORT_CENTER}">${buildMedalIconHtml(k, 24)}</div>
            <div style="min-width: 20px; height: 24px; ${EXPORT_CENTER} font-size: 15px; line-height: 1; font-weight: bold; color: #333;">${counts[k] || 0}</div>
        </div>`;
    });
    html += `<div style="height: 30px; ${EXPORT_CENTER} padding: 0 4px 0 8px; font-size: 15px; line-height: 1; font-weight: bold; color: #333;">/ ${targetSongs.length}</div></div></div>`;
    return html;
}

// 難易度順画像の中身を組み立てて、画像用の要素を返す
function buildDiffTableRoot(targetSongs, levelText) {
    const COLS = 5;
    const root = createExportRoot();
    let html = buildExportHeader(levelText, "pop'n music 難易度表", EXPORT_LEVEL_COLORS[String(levelText)] || EXPORT_ACCENT);
    html += buildMedalSummaryHtml(targetSongs);

    const groups = buildDiffTableGroups(targetSongs);
    html += `<div style="display: flex; flex-direction: column; gap: 8px;">`;
    const vertical = getGridVertical('grid');
    orderRowsForVertical(groups, vertical).forEach(g => {
        const color = getDiffTableLabelColor(g);
        const textShadow = (g.cls === '弱' || (g.cls === '中' && g.label.startsWith('-'))) ? 'text-shadow: 0 1px 2px rgba(0,0,0,0.45);' : '';
        const labelHtml = g.cls === '未定'
            ? `<div style="font-size: 14px; line-height: 1;">未定</div>`
            : `<div style="font-size: 12px; line-height: 1;">${escapeHtml(g.cls)}</div><div style="font-size: 17px; line-height: 1; margin-top: 4px;">${escapeHtml(g.label)}</div>`;
        html += `<div style="display: flex; gap: 10px; align-items: stretch;">
            <div style="width: 58px; min-height: 42px; flex-shrink: 0; background: ${color}; color: #fff; font-weight: bold; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 4px 0; box-sizing: border-box; box-shadow: 0 1px 3px rgba(0,0,0,0.25); ${textShadow}">${labelHtml}</div>
            <div style="display: grid; grid-template-columns: repeat(${COLS}, 216px); gap: 8px 12px; align-content: center;">`;
        // 画面の難易度表と同じ向き（最初は右上が最強）で並べる
        const orderedSongs = orderForDirection(g.songs, COLS, getGridDirection('grid'), vertical);
        orderedSongs.forEach(song => {
            html += `<div style="display: flex; align-items: center; gap: 6px;">
                ${buildMedalBoxHtml(clearRecords[song.id] || '')}${buildBannerBoxHtml(song, 168, 42)}
            </div>`;
        });
        html += `</div></div>`;
    });
    html += `</div>`;

    root.innerHTML = html;
    return root;
}

// 「難易度順画像」ボタン
//   PC版   ：作成するレベルを選ぶ画面を開く（選んだレベルごとに1枚ずつ保存）
//   スマホ版：いま表に表示している曲で1枚作る
async function generateDiffTableImage() {
    if (!isMobileDevice()) {
        openDiffLevelModal();
        return;
    }
    const btn = document.getElementById('btn-diff-image');
    const targetSongs = lastDisplaySongs.slice();
    if (targetSongs.length === 0) {
        alert("表示中の楽曲がありません。");
        return;
    }
    const originalText = await prepareExport(btn);
    if (originalText === null) return;

    const levelText = getExportLevelText();
    const root = buildDiffTableRoot(targetSongs, levelText);
    const fileLevel = levelText === '検索' ? 'Search' : currentViewLevel;
    await outputExportImage(root, `popn_difftable_${currentUser}_Lv${fileLevel}_${exportDateStr()}.png`, btn, originalText);
}

// ==========================================
// ★ ポックラ画像（ポックラの計算に入っている曲だけ：新曲 上位20・旧曲 上位40）
// ==========================================
function buildPokkuraRoot(pk) {
    const COLS = 5;
    const root = createExportRoot();
    const now = new Date();
    const dateText = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
    const note = pk.version
        ? `旧曲は公式データ取り込み（${formatPokkuraDate(pk.version.at)}）の今作スコアで計算`
        : '旧曲は歴代ベストスコアで計算した目安';
    const extraNote = pk.extraCount > 0 ? '・Lv45以下の新曲（バナーなし）は公式データ取り込みで読んだもの' : '';
    // 公式サイトの値があれば大きく出し、アプリの計算値は小さく添える
    const official = pk.version && typeof pk.version.pc === 'number' ? pk.version.pc : null;
    const bigValue = official !== null ? official : pk.total;
    const calcLine = (official !== null
        ? `<div style="font-size: 11px; line-height: 1; color: #888; margin-top: 5px; white-space: nowrap;">計算値 ${pk.total.toFixed(2)}</div>`
        : '') + `<div style="font-size: 11px; line-height: 1; color: #888; margin-top: 4px; white-space: nowrap;">旧ポックラ ${calcOldPokkura().total.toFixed(2)}</div>`;

    let html = `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 14px;">
            <div style="background: #fff; border: 3px solid #d82f66; border-radius: 12px; padding: 8px 16px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0;">
                <div style="font-size: 14px; line-height: 1; font-weight: bold; color: #d82f66; letter-spacing: 1px;">ポックラ</div>
                <div style="font-size: 38px; line-height: 1; font-weight: bold; color: #333; margin-top: 6px;">${bigValue.toFixed(2)}</div>
                ${calcLine}
            </div>
            <div style="flex: 1; text-align: center;">
                <div style="font-size: 28px; line-height: 1.2; font-weight: bold; color: #d82f66;">pop'n music ポックラ対象曲</div>
                <div style="font-size: 15px; line-height: 1.4; color: #555; margin-top: 4px;">新曲 ${pk.newPoint.toFixed(2)} ＋ 旧曲 ${pk.oldPoint.toFixed(2)}</div>
                <div style="font-size: 12px; line-height: 1.4; color: #888;">${escapeHtml(note + extraNote)}</div>
            </div>
            <div style="text-align: right; color: #555; font-size: 14px; line-height: 1.6; flex-shrink: 0;">
                <div>作成日 ${dateText}</div>
                <div style="font-weight: bold;">User: ${escapeHtml(currentUser)}</div>
            </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 10px;">`;

    const badge = (pos, bg, color, size, text) =>
        `<div style="position: absolute; ${pos} padding: 1px 5px; border-radius: 4px; background: ${bg}; color: ${color}; font-size: ${size}px; line-height: 1.3; font-weight: bold;">${text}</div>`;

    const section = (label, sub, color, list) => {
        if (list.length === 0) return '';
        // 画面のポックラと同じ向き（最初は左上が1位）で並べる
        const ordered = orderForDirection(list, COLS, getGridDirection('pokkura'));
        let cells = '';
        ordered.forEach(({ song, extra, point, score, isVersion }) => {
            // Lv45 以下の新曲（アプリの曲ではない）は、バナーの代わりに曲名・ジャンルの文字の枠
            const bannerHtml = extra
                ? `<div style="width: 168px; height: 42px; border-radius: 3px; box-sizing: border-box; background: #5d4037; color: #fff; padding: 2px 6px 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; overflow: hidden;">
                        <div style="font-size: 11px; line-height: 1.15; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">${escapeHtml(extra.title)}</div>
                        <div style="font-size: 9px; line-height: 1.15; opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">${escapeHtml(extra.genre)}</div>
                   </div>`
                : buildBannerBoxHtml(song, 168, 42);
            cells += `<div style="display: flex; align-items: center; gap: 6px;">
                ${buildMedalBoxHtml(extra ? extra.medal : (clearRecords[song.id] || ''))}
                <div style="position: relative; width: 168px; height: 42px; flex-shrink: 0;">
                    ${bannerHtml}
                    ${badge('left: 2px; top: 2px;', 'rgba(255,255,255,0.88)', '#333', 10, escapeHtml(extra ? extra.level : getPokkuraLevel(song)))}
                    ${badge('left: 2px; bottom: 2px;', isVersion ? 'rgba(123,31,162,0.88)' : 'rgba(0,0,0,0.72)', '#fff', 11, score)}
                    ${badge('right: 2px; bottom: 2px;', '#d82f66', '#fff', 12, pkFloor(point / 60, 3).toFixed(3))}
                </div>
            </div>`;
        });
        return `<div style="display: flex; gap: 10px; align-items: stretch;">
            <div style="width: 58px; flex-shrink: 0; background: ${color}; color: #fff; font-weight: bold; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.25);">
                <div style="font-size: 14px; line-height: 1;">${label}</div><div style="font-size: 11px; line-height: 1; margin-top: 4px;">${sub}</div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(${COLS}, 216px); gap: 8px 12px; align-content: center;">${cells}</div>
        </div>`;
    };
    html += section('新曲', `上位${POKKURA_NEW_COUNT}`, '#d82f66', pk.topNew);
    html += section('旧曲', `上位${POKKURA_OLD_COUNT}`, '#7b1fa2', pk.topOld);
    html += `</div>`;
    root.innerHTML = html;
    return root;
}

async function generatePokkuraImage() {
    const btn = document.getElementById('btn-pokkura-image');
    const pk = calcPokkura();
    if (pk.topNew.length + pk.topOld.length === 0) {
        alert('ポックラの対象曲（新曲 Lv46〜49・旧曲 Lv48〜50）にスコアがありません。');
        return;
    }
    const originalText = await prepareExport(btn);
    if (originalText === null) return;
    await outputExportImage(buildPokkuraRoot(pk), `popn_pokkura_${currentUser}_${exportDateStr()}.png`, btn, originalText);
}

// ==========================================
// ★ まとめて生成：前回まとめて作ったときから更新があったものだけを作る
//   ・難易度順画像：更新履歴のあった曲のレベル
//   ・ポックラ画像：ポックラ（公式の値・計算値）が変わったとき
//   ・全体統計画像：メダルが変わったとき
//   前回の日時とポックラの値は、この端末にユーザーごとに保存（popn_batch_image_ユーザー名）。初めてのときは今日の0時から
// ==========================================
function batchImageKey(user = currentUser) {
    return 'popn_batch_image_' + user;
}

function loadBatchImageState() {
    try {
        const s = JSON.parse(storageGet(batchImageKey()) || 'null');
        if (s && typeof s.at === 'number') return s;
    } catch (e) { /* 壊れていたら初めてと同じ */ }
    return null;
}

function saveBatchImageState(snap) {
    storageSet(batchImageKey(), JSON.stringify({ at: Date.now(), pc: snap.pc, total: snap.total }));
}

function currentPokkuraSnapshot() {
    const pk = calcPokkura();
    const pc = pk.version && typeof pk.version.pc === 'number' ? pk.version.pc : null;
    return { pk, pc, total: pk.total };
}

// 何を作るか（作るものがなければ items は空）
function planBatchImages() {
    const state = loadBatchImageState();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const since = state ? state.at : today.getTime();
    const entries = Object.values(getHistoryRecords()).filter(e => e && typeof e.t === 'number' && e.t > since);
    const levelSet = new Set();
    let medalChanged = false;
    let pokkuraSongUpdated = false; // ポックラの対象になりうる曲を更新したか（初めてのときの判断に使う）
    const newVersionValue = getPokkuraNewVersion().value;
    entries.forEach(e => {
        const song = songs.find(s => s.id === e.id);
        const lv = song ? song.level : e.lv;
        if (lv) levelSet.add(String(lv));
        if ('nm' in e && e.om !== e.nm) medalChanged = true;
        if (song && getPokkuraGroup(song, newVersionValue)) pokkuraSongUpdated = true;
    });
    const levels = getSortedLevels().filter(lv => levelSet.has(lv) && songs.some(s => s.level === lv));
    const snap = currentPokkuraSnapshot();
    const hasPokkuraSongs = snap.pk.topNew.length + snap.pk.topOld.length > 0;
    // 前回の値があれば値で比べる。初めてのときは、今日ポックラの対象になりうる曲を更新したかで決める
    const pokkuraChanged = hasPokkuraSongs && (state ? (state.pc !== snap.pc || state.total !== snap.total) : pokkuraSongUpdated);

    const items = levels.map(lv => ({ kind: 'diff', level: lv, label: `Lv${lv} 難易度順画像` }));
    if (pokkuraChanged) items.push({ kind: 'pokkura', label: 'ポックラ画像' });
    if (medalChanged) items.push({ kind: 'overview', label: '全体統計画像' });
    return { since, isFirst: !state, items, snap };
}

function formatBatchSince(ms) {
    const d = new Date(ms);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

let batchImageResults = []; // スマホで一覧に出している画像 [{ url, filename, label }]

async function generateBatchImages() {
    const plan = planBatchImages();
    const sinceText = plan.isFirst ? '今日' : `前回（${formatBatchSince(plan.since)}）`;
    if (plan.items.length === 0) {
        // 初めてのときは、今を「前回」として覚えておく（次からはここからの更新で決める）
        if (plan.isFirst) saveBatchImageState(plan.snap);
        alert(`${sinceText}から、画像にする更新はありません。`);
        return;
    }
    if (!confirm(`${sinceText}からの更新で、次の画像を作ります。\n\n${plan.items.map(it => '・' + it.label).join('\n')}`)) return;

    const btn = document.getElementById('btn-batch-image');
    const originalText = await prepareExport(btn);
    if (originalText === null) return;
    const mobile = isMobileDevice();
    const results = [];
    let failed = false;
    try {
        for (let i = 0; i < plan.items.length; i++) {
            const it = plan.items[i];
            showLoading(true, `画像を作成中… (${i + 1}/${plan.items.length}) ${it.label}`);
            btn.textContent = `生成中... (${i + 1}/${plan.items.length})`;
            let root, filename;
            if (it.kind === 'diff') {
                root = buildDiffTableRoot(songs.filter(s => s.level === it.level), it.level);
                filename = `popn_difftable_${currentUser}_Lv${it.level}_${exportDateStr()}.png`;
            } else if (it.kind === 'pokkura') {
                root = buildPokkuraRoot(plan.snap.pk);
                filename = `popn_pokkura_${currentUser}_${exportDateStr()}.png`;
            } else {
                root = buildOverviewRoot();
                filename = `popn_overview_${currentUser}_${exportDateStr()}.png`;
            }
            const url = await renderExportToBlobUrl(root);
            if (mobile) {
                results.push({ url, filename, label: it.label });
            } else {
                downloadBlobUrl(url, filename);
                // 連続ダウンロードがブラウザに止められにくいよう、少し間を空ける
                if (i < plan.items.length - 1) await new Promise(res => setTimeout(res, 400));
            }
        }
    } catch (e) {
        failed = true;
        alert(e && e.message === 'timeout' ? '画像の作成に時間がかかりすぎたため中止しました。もう一度試してください。' : '画像の生成に失敗しました。');
        console.error(e);
    } finally {
        showLoading(false);
        btn.textContent = originalText;
    }
    // 全部できたときだけ「前回」を今にする（失敗したら次も同じものを作れるように）
    if (!failed) saveBatchImageState(plan.snap);
    if (mobile && results.length > 0) openBatchImageModal(results);
    else endImageExport();
}

// スマホ：できた画像を縦に並べて出す（長押しで保存。共有できる端末では「まとめて共有」）
function openBatchImageModal(results) {
    closeBatchImageModal(true);
    batchImageResults = results;
    const list = document.getElementById('batch-image-list');
    list.innerHTML = results.map(r => `
        <figure class="batch-image-item">
            <figcaption>${escapeHtml(r.label)}</figcaption>
            <img src="${escapeHtml(r.url)}" alt="${escapeHtml(r.label)}">
        </figure>`).join('');
    const shareBtn = document.getElementById('batch-image-share');
    shareBtn.style.display = navigator.canShare && navigator.share ? '' : 'none';
    document.getElementById('batch-image-modal').style.display = 'flex';
}

async function shareBatchImages() {
    try {
        const files = await Promise.all(batchImageResults.map(async r => new File([await (await fetch(r.url)).blob()], r.filename, { type: 'image/png' })));
        if (!navigator.canShare({ files })) {
            alert('この端末では、まとめて共有できません。画像を1枚ずつ長押しして保存してください。');
            return;
        }
        await navigator.share({ files });
    } catch (e) {
        if (e && e.name === 'AbortError') return;
        alert('共有できませんでした。画像を1枚ずつ長押しして保存してください。');
        console.error(e);
    }
}

function closeBatchImageModal(keepExporting) {
    const modal = document.getElementById('batch-image-modal');
    if (modal) modal.style.display = 'none';
    const list = document.getElementById('batch-image-list');
    if (list) list.innerHTML = '';
    batchImageResults.forEach(r => URL.revokeObjectURL(r.url));
    batchImageResults = [];
    if (!keepExporting) endImageExport();
}

// ---------- PC版：複数レベルをまとめて作成 ----------
function openDiffLevelModal() {
    toggleMenu(false);
    const container = document.getElementById('diff-level-checkboxes');
    container.innerHTML = '';
    getSortedLevels().forEach(lv => {
        const label = document.createElement('label');
        label.className = 'check-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'diff-level-check';
        cb.value = lv;
        cb.checked = (lv === currentViewLevel); // 今表示しているレベルを最初から選んでおく
        label.appendChild(cb);
        label.appendChild(document.createTextNode(isNaN(parseInt(lv, 10)) ? ` ${lv}` : ` Lv${lv}`));
        container.appendChild(label);
    });
    document.getElementById('diff-level-modal').style.display = 'flex';
}

function closeDiffLevelModal() {
    document.getElementById('diff-level-modal').style.display = 'none';
}

function setAllDiffLevelChecks(checked) {
    document.querySelectorAll('.diff-level-check').forEach(cb => { cb.checked = checked; });
}

async function generateDiffTableImagesForSelectedLevels() {
    const levels = Array.from(document.querySelectorAll('.diff-level-check:checked')).map(cb => cb.value);
    if (levels.length === 0) {
        alert("レベルを1つ以上選んでください。");
        return;
    }
    closeDiffLevelModal();

    const btn = document.getElementById('btn-diff-image');
    const originalText = await prepareExport(btn);
    if (originalText === null) return;

    let savedCount = 0;
    try {
        for (let i = 0; i < levels.length; i++) {
            const lv = levels[i];
            const lvSongs = songs.filter(s => s.level === lv);
            if (lvSongs.length === 0) continue;
            showLoading(true, `難易度順画像を作成中... (${i + 1}/${levels.length}) Lv${lv}`);
            const blobUrl = await renderExportToBlobUrl(buildDiffTableRoot(lvSongs, lv));
            downloadBlobUrl(blobUrl, `popn_difftable_${currentUser}_Lv${lv}_${exportDateStr()}.png`);
            savedCount++;
            // 連続ダウンロードがブラウザに止められにくいよう、少し間を空ける
            if (i < levels.length - 1) await new Promise(res => setTimeout(res, 400));
        }
    } catch (e) {
        alert(`画像の生成に失敗しました。（${savedCount}枚は保存済み）`);
        console.error(e);
    } finally {
        showLoading(false);
        btn.textContent = originalText;
        endImageExport();
    }
}

// ==========================================
// ★ 表示曲画像（表に表示中の楽曲一覧）
// ==========================================
// 画面の統計表示（クリア率）を、画像用のカードに組み立て直す
function buildExportStatsHtml() {
    const statsEl = document.getElementById('stats-display');
    const groups = statsEl ? Array.from(statsEl.querySelectorAll('.stats-group')) : [];
    if (groups.length === 0) return '';
    const colorOf = (el) => {
        if (el.querySelector('.stats-kurohishipercentage')) return '#1a237e';
        if (el.querySelector('.stats-kuroboshipercentage')) return '#000051';
        if (el.querySelector('.stats-easypercentage')) return '#2cbc21';
        return '#d32f2f';
    };
    let html = `<div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px;">`;
    groups.forEach(gEl => {
        const title = (gEl.querySelector('.stats-title')?.textContent || '').replace(/[:：]\s*$/, '');
        const fracEl = gEl.querySelector('.stats-fraction');
        const remain = fracEl?.querySelector('.stats-remain')?.textContent || '';
        const fraction = fracEl ? fracEl.textContent.replace(remain, '').trim() : '';
        const percEl = gEl.querySelector('[class*="percentage"]');
        const perc = percEl ? percEl.textContent.trim() : '';
        const color = colorOf(gEl);
        html += `<div style="background: #fff; border: 2px solid #90a4ae; border-left: 8px solid ${color}; border-radius: 8px; padding: 8px 14px; display: flex; align-items: center; gap: 16px;">
            <div style="display: flex; flex-direction: column; justify-content: center;">
                <div style="font-size: 13px; line-height: 1.2; font-weight: bold; color: #555;">${escapeHtml(title)}</div>
                <div style="font-size: 16px; line-height: 1.3; font-weight: bold; color: #333;">${escapeHtml(fraction)} <span style="font-size: 12px; font-weight: normal; color: #777;">${escapeHtml(remain)}</span></div>
            </div>
            <div style="font-size: 30px; line-height: 1; font-weight: bold; color: ${color};">${escapeHtml(perc)}</div>
        </div>`;
    });
    html += `</div>`;
    return html;
}

async function exportAsImage(event) {
    const exportBtn = event.currentTarget;
    const activeIndices = Array.from(document.querySelectorAll('.export-col-toggle'))
        .filter(cb => cb.checked).map(cb => parseInt(cb.value));
    if (activeIndices.length === 0) {
        alert("画像に出力する項目を1つ以上選択してください。");
        return;
    }
    const targetSongs = lastDisplaySongs.slice();
    if (targetSongs.length === 0) {
        alert("表示中の楽曲がありません。");
        return;
    }
    const originalText = await prepareExport(exportBtn);
    if (originalText === null) return;

    // スコア・比較は画面の行から文字をもらう（表示順と同じ並び）
    const rows = Array.from(document.querySelectorAll('#song-list tr'));
    const cellText = (i, cls) => {
        const cell = rows[i] && rows[i].querySelector(cls);
        return cell ? cell.innerText.replace(/\s+/g, ' ').trim() : '';
    };

    const th = (label, width, align = 'center') => `<th style="width: ${width}px; padding: 8px 6px; background: ${EXPORT_ACCENT}; color: #fff; font-size: 13px; line-height: 1.2; text-align: ${align}; border: 1px solid #c5cae9;">${label}</th>`;
    const td = (inner, align = 'center', extra = '') => `<td style="padding: 6px; border: 1px solid #d7dbe6; text-align: ${align}; vertical-align: middle; font-size: 13px; line-height: 1.3; ${extra}">${inner}</td>`;

    const columns = [
        { id: 0, w: 60, head: th('メダル', 60), cell: (s) => td(`<div style="${EXPORT_CENTER}">${buildMedalBoxHtml(clearRecords[s.id] || '')}</div>`) },
        { id: 1, w: 90, head: th('スコア', 90), cell: (s, i) => td(escapeHtml(cellText(i, '.col-score'))) },
        { id: 2, w: 90, head: th('比較', 90), cell: (s, i) => td(escapeHtml(cellText(i, '.col-compare'))) },
        { id: 3, w: 44, head: th('Lv', 44), cell: (s) => td(escapeHtml(s.level)) },
        { id: 4, w: 44, head: th('Ver', 44), cell: (s) => td(escapeHtml(s.version)) },
        { id: 5, w: 140, head: th('バナー', 140), cell: (s) => td(`<div style="${EXPORT_CENTER}">${buildBannerBoxHtml(s, 128, 32)}</div>`) },
        { id: 6, w: 240, head: th('ジャンル / 曲名', 240, 'left'), cell: (s) => {
            const memo = getMemo(s.id);
            const memoParts = [memo.star ? '★' : '', getMemoTags(memo).join('・'), memo.hs ? `HS ${memo.hs}` : '', memo.opt || '', memo.sudden ? `SUD+ ${memo.sudden}` : '', memo.comment].filter(Boolean);
            const memoHtml = memoParts.length ? `<div style="font-size: 11px; color: #e65100; margin-top: 2px;">📝 ${escapeHtml(memoParts.join(' / '))}</div>` : '';
            return td(`<div style="font-size: 11px; color: #777;">${escapeHtml(s.genre)}</div><div style="font-weight: bold;">${escapeHtml(s.title)}</div>${memoHtml}`, 'left');
        } },
        { id: 7, w: 64, head: th('BPM', 64), cell: (s) => td(escapeHtml(s.bpm || '-'), 'right') },
        { id: 8, w: 60, head: th('ノーツ', 60), cell: (s) => td(escapeHtml(s.notes), 'right') },
        { id: 9, w: 90, head: th('難易度', 90), cell: (s) => {
            const c = getDifficultyColor(s.diffClass || '未分類', s.diffIndex);
            const shadow = c.shadow && c.shadow !== 'none' ? `text-shadow: ${c.shadow};` : '';
            return td(`<span style="font-weight: bold; color: ${c.color}; ${shadow}">${escapeHtml(s.diffRaw || '-')}</span>`);
        } }
    ].filter(c => activeIndices.includes(c.id));

    const root = createExportRoot();
    let html = buildExportHeader(getExportLevelText(), "pop'n music 表示曲一覧");
    html += buildExportStatsHtml();

    const tableWidth = columns.reduce((sum, c) => sum + c.w, 0);
    const CHUNK = 30;
    html += `<div style="display: flex; gap: 16px; align-items: flex-start;">`;
    for (let start = 0; start < targetSongs.length; start += CHUNK) {
        html += `<table class="export-table" style="width: ${tableWidth}px; border-collapse: collapse; background: #fff; table-layout: fixed; box-shadow: 0 1px 3px rgba(0,0,0,0.15);"><thead><tr>${columns.map(c => c.head).join('')}</tr></thead><tbody>`;
        targetSongs.slice(start, start + CHUNK).forEach((s, j) => {
            const i = start + j;
            const bg = j % 2 ? 'background: #fafafa;' : '';
            html += `<tr style="${bg}">${columns.map(c => c.cell(s, i)).join('')}</tr>`;
        });
        html += `</tbody></table>`;
    }
    html += `</div>`;

    root.innerHTML = html;
    const fileLevel = getExportLevelText() === '検索' ? 'Search' : currentViewLevel;
    await outputExportImage(root, `popn_clearrate_${currentUser}_Lv${fileLevel}_${exportDateStr()}.png`, exportBtn, originalText);
}
