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
const EXPORT_MAX_PIXELS = 16000000; // iOS のキャンバス上限（約1677万px）より少し小さく


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

function buildExportHeader(levelText, titleText) {
    const now = new Date();
    const dateText = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
    const lvSize = String(levelText).length > 3 ? 22 : (String(levelText).length > 2 ? 30 : 44);
    return `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 14px;">
            <div style="background: #fff; border: 3px solid ${EXPORT_ACCENT}; border-radius: 12px; width: 104px; height: 84px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0;">
                <div style="font-size: 15px; line-height: 1; font-weight: bold; color: ${EXPORT_ACCENT}; letter-spacing: 1px;">LEVEL</div>
                <div style="font-size: ${lvSize}px; line-height: 1; font-weight: bold; color: ${EXPORT_ACCENT}; margin-top: 6px;">${escapeHtmlText(levelText)}</div>
            </div>
            <div style="flex: 1; ${EXPORT_CENTER} font-size: 28px; line-height: 1.2; font-weight: bold; color: ${EXPORT_ACCENT};">${escapeHtmlText(titleText)}</div>
            <div style="text-align: right; color: #555; font-size: 14px; line-height: 1.6; flex-shrink: 0;">
                <div>作成日 ${dateText}</div>
                <div style="font-weight: bold;">User: ${escapeHtmlText(currentUser)}</div>
            </div>
        </div>`;
}

function getExportLevelText() {
    const searchInput = document.getElementById('search-input');
    if (searchInput && searchInput.value.trim() !== '') return '検索';
    return currentViewLevel === 'ALL' ? 'ALL' : currentViewLevel;
}

function buildMedalIconHtml(medalKey, size) {
    const m = MEDAL_TYPES[medalKey];
    if (m && m.imgUrl && (m.imgUrl.startsWith('http') || m.imgUrl.startsWith('data:'))) {
        return `<img src="${toImageProxyUrl(m.imgUrl)}" crossorigin="anonymous" style="width: ${size}px; height: ${size}px; object-fit: contain; display: block;">`;
    }
    const label = m ? m.label : '';
    return `<span style="font-size: 11px; line-height: 1; color: #555; white-space: nowrap;">${escapeHtmlText(label)}</span>`;
}

// メダル枠（未プレイは空枠、未解禁は鍵）
function buildMedalBoxHtml(medalKey) {
    const m = MEDAL_TYPES[medalKey];
    const boxStyle = `width: 34px; height: 34px; flex-shrink: 0; border-radius: 6px; ${EXPORT_CENTER} box-sizing: border-box;`;
    if (m && m.imgUrl && (m.imgUrl.startsWith('http') || m.imgUrl.startsWith('data:'))) {
        return `<div style="${boxStyle} background: #fff; border: 2px solid #90a4ae;"><img src="${toImageProxyUrl(m.imgUrl)}" crossorigin="anonymous" style="width: 28px; height: 28px; object-fit: contain; display: block;"></div>`;
    }
    if (medalKey === '未解禁') {
        return `<div style="${boxStyle} background: #424242; border: 2px solid #212121; color: #fff; font-size: 14px; line-height: 1;">🔒</div>`;
    }
    return `<div style="${boxStyle} background: #fff; border: 2px solid #90a4ae;"></div>`;
}

function buildBannerBoxHtml(song, width, height) {
    const style = `width: ${width}px; height: ${height}px; flex-shrink: 0; border-radius: 3px; box-sizing: border-box;`;
    if (song.bannerUrl && song.bannerUrl.trim() !== '') {
        return `<img src="${toImageProxyUrl(song.bannerUrl)}" crossorigin="anonymous" style="${style} object-fit: cover; display: block; background: #eee;">`;
    }
    return `<div style="${style} ${EXPORT_CENTER} background: #37474f; color: #fff; padding: 2px 6px; overflow: hidden;"><span style="font-size: 11px; line-height: 1.2; font-weight: bold;">${escapeHtmlText(song.title)}</span></div>`;
}

function waitExportImages(root) {
    const images = Array.from(root.querySelectorAll('img'));
    return Promise.all(images.map(img => new Promise(res => {
        if (img.complete) {
            res();
        } else {
            img.onload = res;
            img.onerror = () => { console.warn("Image proxy failed:", img.src); res(); };
        }
    })));
}

async function prepareExport(btn) {
    beginImageExport();
    const originalText = btn.innerText;
    btn.innerText = "準備中... (ライブラリ読込)";
    try {
        await ensureHtml2Canvas();
    } catch (e) {
        alert("画像生成ライブラリの読み込みに失敗しました。通信環境を確認してください。");
        btn.innerText = originalText;
        endImageExport();
        return null;
    }
    btn.innerText = "生成中... (画像読込待機)";
    return originalText;
}

async function outputExportImage(root, filename, btn, originalText) {
    await waitExportImages(root);
    btn.innerText = "生成中... (描画中)";
    let showedModal = false;
    try {
        const w = root.scrollWidth, h = root.scrollHeight;
        const scale = Math.max(0.5, Math.min(2, Math.sqrt(EXPORT_MAX_PIXELS / Math.max(1, w * h))));
        const canvas = await html2canvas(root, { backgroundColor: EXPORT_BG, scale, useCORS: true, width: w, height: h, windowWidth: Math.max(w + 100, 1200) });
        const dataUrl = canvas.toDataURL("image/png");

        if (isMobileExport()) {
            document.getElementById('generated-image-preview').src = dataUrl;
            document.getElementById('image-result-modal').style.display = 'flex';
            showedModal = true;
        } else {
            const link = document.createElement('a');
            link.download = filename;
            link.href = dataUrl;
            link.click();
        }
    } catch (e) {
        alert("画像の生成に失敗しました。");
        console.error(e);
    } finally {
        document.body.removeChild(root);
        btn.innerText = originalText;
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
            <div style="display: flex; width: 100%; height: 14px; border-radius: 4px; overflow: hidden; background: #eee; margin-top: 8px;">`;
        sortedMedalKeys.forEach(k => {
            if (counts[k] > 0) {
                html += `<div style="width: ${(counts[k] / total) * 100}%; background: ${MEDAL_COLORS[k] || '#ccc'};"></div>`;
            }
        });
        html += `</div></div>`;
    });

    if (rowCount === 0) {
        html += `<div style="${EXPORT_CENTER} padding: 30px; font-size: 16px; color: #666;">Lv46〜50 の楽曲データがありません。</div>`;
    }

    root.innerHTML = html;
    await outputExportImage(root, `popn_overview_${currentUser}_${exportDateStr()}.png`, btn, originalText);
}

// ==========================================
// ★ 難易度順画像（指数ごとにバナーとクリアメダルを並べた画像）
// ==========================================
const DIFF_TABLE_COLORS = {
    '危険': '#212121',
    '別格': '#e53935',
    '詐称': '#f4511e',
    '強': '#fb8c00',
    '中': '#7cb342',      // 中(プラス)
    '中-': '#aed581',     // 中(マイナス)：やや薄い緑
    '弱': '#81d4fa',      // 水色
    '逆詐称': '#81d4fa',
    '入門': '#42a5f5',
    '未定': '#9e9e9e'
};

// 楽曲を「難易度の種類＋指数(小数第1位)」ごとにまとめ、指数の大きい順に並べる
function buildDiffTableGroups(targetSongs) {
    const groupMap = {};
    targetSongs.forEach(song => {
        let cls = song.diffClass || '未分類';
        const idx = song.diffIndex;
        let key, label, sortVal;
        if (cls === '未分類' || idx === null || idx === undefined || isNaN(idx)) {
            cls = '未定';
            key = '未定';
            label = '';
            sortVal = -Infinity;
        } else {
            const r = Math.round(idx * 10) / 10;
            if (r === 0) {
                label = idx < 0 ? '-0' : '+0';
                sortVal = idx < 0 ? -0.0001 : 0;
            } else {
                label = (r > 0 ? '+' : '') + r.toFixed(1);
                sortVal = r;
            }
            key = `${cls}|${label}`;
        }
        if (!groupMap[key]) groupMap[key] = { cls, label, sortVal, songs: [] };
        groupMap[key].songs.push(song);
    });
    const groups = Object.values(groupMap);
    // 指数が同じ行は、難易度の種類が強い方を上にする
    const clsRank = { '危険': 8, '別格': 7, '詐称': 6, '強': 5, '中': 4, '弱': 3, '逆詐称': 2, '入門': 1, '未定': 0 };
    groups.sort((a, b) => (b.sortVal - a.sortVal) || ((clsRank[b.cls] || 0) - (clsRank[a.cls] || 0)));
    // 行内はカッコ内の指数が高い順（同じ指数は曲名順）
    groups.forEach(g => g.songs.sort((a, b) => {
        const ia = (a.diffIndex === null || a.diffIndex === undefined || isNaN(a.diffIndex)) ? -Infinity : a.diffIndex;
        const ib = (b.diffIndex === null || b.diffIndex === undefined || isNaN(b.diffIndex)) ? -Infinity : b.diffIndex;
        if (ia !== ib) return ib - ia;
        return a.title.localeCompare(b.title, 'ja');
    }));
    return groups;
}

function getDiffTableLabelColor(g) {
    if (g.cls === '中' && g.label.startsWith('-')) return DIFF_TABLE_COLORS['中-'];
    return DIFF_TABLE_COLORS[g.cls] || DIFF_TABLE_COLORS['未定'];
}

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

async function generateDiffTableImage() {
    const btn = document.getElementById('btn-diff-image');
    const targetSongs = lastDisplaySongs.slice();
    if (targetSongs.length === 0) {
        alert("表示中の楽曲がありません。");
        return;
    }
    const originalText = await prepareExport(btn);
    if (originalText === null) return;

    const COLS = 5;
    const root = createExportRoot();
    let html = buildExportHeader(getExportLevelText(), "pop'n music 難易度表");
    html += buildMedalSummaryHtml(targetSongs);

    const groups = buildDiffTableGroups(targetSongs);
    html += `<div style="display: flex; flex-direction: column; gap: 8px;">`;
    groups.forEach(g => {
        const color = getDiffTableLabelColor(g);
        const textShadow = (g.cls === '弱' || g.cls === '逆詐称' || (g.cls === '中' && g.label.startsWith('-'))) ? 'text-shadow: 0 1px 2px rgba(0,0,0,0.45);' : '';
        const labelHtml = g.cls === '未定'
            ? `<div style="font-size: 14px; line-height: 1;">未定</div>`
            : `<div style="font-size: 12px; line-height: 1;">${escapeHtmlText(g.cls)}</div><div style="font-size: 17px; line-height: 1; margin-top: 4px;">${escapeHtmlText(g.label)}</div>`;
        html += `<div style="display: flex; gap: 10px; align-items: stretch;">
            <div style="width: 58px; min-height: 42px; flex-shrink: 0; background: ${color}; color: #fff; font-weight: bold; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 4px 0; box-sizing: border-box; box-shadow: 0 1px 3px rgba(0,0,0,0.25); ${textShadow}">${labelHtml}</div>
            <div style="display: grid; grid-template-columns: repeat(${COLS}, 216px); gap: 8px 12px; align-content: center;">`;
        // 強い曲ほど上・右に来るよう、強い順に1行ずつ区切ってから各行を左右反転する（右上が最強）
        const orderedSongs = [];
        for (let i = 0; i < g.songs.length; i += COLS) {
            orderedSongs.push(...g.songs.slice(i, i + COLS).reverse());
        }
        orderedSongs.forEach(song => {
            html += `<div style="display: flex; align-items: center; gap: 6px;">
                ${buildMedalBoxHtml(clearRecords[song.id] || '')}${buildBannerBoxHtml(song, 168, 42)}
            </div>`;
        });
        html += `</div></div>`;
    });
    html += `</div>`;

    root.innerHTML = html;
    const fileLevel = getExportLevelText() === '検索' ? 'Search' : currentViewLevel;
    await outputExportImage(root, `popn_difftable_${currentUser}_Lv${fileLevel}_${exportDateStr()}.png`, btn, originalText);
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
                <div style="font-size: 13px; line-height: 1.2; font-weight: bold; color: #555;">${escapeHtmlText(title)}</div>
                <div style="font-size: 16px; line-height: 1.3; font-weight: bold; color: #333;">${escapeHtmlText(fraction)} <span style="font-size: 12px; font-weight: normal; color: #777;">${escapeHtmlText(remain)}</span></div>
            </div>
            <div style="font-size: 30px; line-height: 1; font-weight: bold; color: ${color};">${escapeHtmlText(perc)}</div>
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
        { id: 1, w: 90, head: th('スコア', 90), cell: (s, i) => td(escapeHtmlText(cellText(i, '.col-score'))) },
        { id: 2, w: 90, head: th('比較', 90), cell: (s, i) => td(escapeHtmlText(cellText(i, '.col-compare'))) },
        { id: 3, w: 44, head: th('Lv', 44), cell: (s) => td(escapeHtmlText(s.level)) },
        { id: 4, w: 44, head: th('Ver', 44), cell: (s) => td(escapeHtmlText(s.version)) },
        { id: 5, w: 140, head: th('バナー', 140), cell: (s) => td(`<div style="${EXPORT_CENTER}">${buildBannerBoxHtml(s, 128, 32)}</div>`) },
        { id: 6, w: 240, head: th('ジャンル / 曲名', 240, 'left'), cell: (s) => {
            const memo = memoRecords[s.id] || {};
            const memoParts = [memo.affinity, memo.sudden ? `SUD+ ${memo.sudden}` : '', memo.comment].filter(Boolean);
            const memoHtml = memoParts.length ? `<div style="font-size: 11px; color: #e65100; margin-top: 2px;">📝 ${escapeHtmlText(memoParts.join(' / '))}</div>` : '';
            return td(`<div style="font-size: 11px; color: #777;">${escapeHtmlText(s.genre)}</div><div style="font-weight: bold;">${escapeHtmlText(s.title)}</div>${memoHtml}`, 'left');
        } },
        { id: 7, w: 64, head: th('BPM', 64), cell: (s) => td(escapeHtmlText(s.bpm || '-'), 'right') },
        { id: 8, w: 60, head: th('ノーツ', 60), cell: (s) => td(escapeHtmlText(s.notes), 'right') },
        { id: 9, w: 90, head: th('難易度', 90), cell: (s) => {
            const c = getDifficultyColor(s.diffClass || '未分類', s.diffIndex);
            const shadow = c.shadow && c.shadow !== 'none' ? `text-shadow: ${c.shadow};` : '';
            return td(`<span style="font-weight: bold; color: ${c.color}; ${shadow}">${escapeHtmlText(s.diffRaw || '-')}</span>`);
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
