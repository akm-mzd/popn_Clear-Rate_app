// ==========================================
// utils.js
// どのファイルからも使う小さな道具（表示形式・エスケープ・端末判定・難易度の解釈など）。
// ==========================================

// ==========================================
// ★ クリア率の表示形式（タップで切替）
//   'fixed1' : 小数点1桁 (例: 98.7)
//   'sig2'   : 有効数字2桁 (例: 99)
// ==========================================
let rateFormatMode = 'fixed1';
if (storageGet('popn_rate_format') === 'sig2') rateFormatMode = 'sig2';

function formatRate(count, total) {
    if (!total) return '0';
    const x = (count / total) * 100;
    if (rateFormatMode === 'sig2') {
        if (x === 0) return '0';
        return String(Number(x.toPrecision(2)));
    }
    return x.toFixed(1);
}

function toggleRateFormat() {
    rateFormatMode = rateFormatMode === 'sig2' ? 'fixed1' : 'sig2';
    storageSet('popn_rate_format', rateFormatMode);
    renderTable();
}

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
        ctx.fillStyle = d.gradient ? makeSliceGradient(ctx, d.gradient, centerX, centerY, radius, currentAngle, sliceAngle) : d.color;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
        ctx.closePath();
        ctx.fill();
        currentAngle += sliceAngle;
    });

    return canvas.toDataURL();
}

// 円グラフの1切れを虹色などのグラデーションで塗る（d.gradient = 色の配列）。
//   切れの角度の範囲に色を並べるので、小さい切れでも全色が入る
function makeSliceGradient(ctx, colors, cx, cy, radius, start, angle) {
    const stops = colors.length - 1;
    if (ctx.createConicGradient && angle < 2 * Math.PI - 1e-6) {
        // 円錐グラデーションは1周（0〜1）で指定する。切れの範囲だけに色を割り当て、外側は端の色で埋める
        const g = ctx.createConicGradient(start, cx, cy);
        const span = angle / (2 * Math.PI);
        colors.forEach((c, i) => g.addColorStop(span * i / stops, c));
        g.addColorStop(Math.min(1, span + 1e-4), colors[stops]);
        return g;
    }
    if (ctx.createConicGradient) {
        const g = ctx.createConicGradient(start, cx, cy);
        colors.forEach((c, i) => g.addColorStop(i / stops, c));
        return g;
    }
    const g = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
    colors.forEach((c, i) => g.addColorStop(i / stops, c));
    return g;
}

// html2canvas は画像出力ボタンを使う時だけ必要なので、
// 初期表示をブロックしないよう使用直前に動的読み込みする
let html2canvasLoadPromise = null;
function ensureHtml2Canvas() {
    if (typeof html2canvas !== 'undefined') return Promise.resolve();
    if (html2canvasLoadPromise) return html2canvasLoadPromise;
    html2canvasLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = resolve;
        // 失敗したら、次に押したときにもう一度読み込めるようにする
        script.onerror = (e) => { html2canvasLoadPromise = null; script.remove(); reject(e); };
        document.head.appendChild(script);
    });
    return html2canvasLoadPromise;
}
function showLoading(show, text = '通信中...') {
    document.getElementById('loading-text').innerText = text;
    document.getElementById('loading').style.display = show ? 'flex' : 'none';
}

const SUPER_EX = '超EX'; // 超EXTRA（難易度の文字・種類。指数は持たない）
function isSuperExSong(song) { return !!song && song.diffClass === SUPER_EX; }

function parseDifficulty(rawStr) {
    if (!rawStr) return { diffClass: '未分類', diffIndex: null };
    if (/超\s*EX/i.test(String(rawStr).normalize('NFKC'))) return { diffClass: SUPER_EX, diffIndex: null };
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
function toImageProxyUrl(url) {
    if (url && url.startsWith('http') && !url.includes('wsrv.nl')) {
        return `https://wsrv.nl/?url=${encodeURIComponent(url)}`;
    }
    return url;
}

// HTML に埋め込む文字をエスケープする（曲名・メモなど、外から入ってくる文字は必ず通す）
function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// onclick="func('…')" のように、HTML属性の中の JavaScript 文字列として埋め込む値を安全にする
function jsStringAttr(str) {
    const jsEscaped = String(str ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r?\n/g, '\\n');
    return escapeHtml(jsEscaped);
}

// リンクや画像に使ってよいURLだけを通す（javascript: などは空文字にする）
//   allowDataImage: true のときは data:image/... も許可（バナー画像用）
function safeUrl(url, allowDataImage = false) {
    const u = String(url ?? '').trim();
    if (/^https?:\/\//i.test(u)) return u;
    if (allowDataImage && /^data:image\/(png|jpe?g|gif|webp);/i.test(u)) return u;
    return '';
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

    if (diffClass === SUPER_EX) return { color: '#6a1b9a', shadow: 'none' };
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

// データに含まれるレベルの一覧（数字は大きい順、「その他」などの文字は後ろ）
function getSortedLevels() {
    const levels = [...new Set(songs.map(s => s.level))].filter(l => l);
    return levels.sort((a, b) => {
        const numA = parseInt(a, 10);
        const numB = parseInt(b, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numB - numA;
        if (isNaN(numA)) return 1;
        if (isNaN(numB)) return -1;
        return 0;
    });
}

// ==========================================
// ★ 難易度表（難易度順画像と、メイン画面の「難易度表」表示で共通）
// ==========================================
const DIFF_TABLE_COLORS = {
    '危険': '#212121',
    '別格': '#e53935',
    '詐称': '#f4511e',
    '強': '#fb8c00',
    '中': '#7cb342',      // 中(プラス)
    '中-': '#9ccc65',     // 中(マイナス)：やや薄い緑
    '弱': '#81d4fa',      // 水色
    '逆詐称': '#1a4fa3',  // 濃い青
    '入門': '#42a5f5',
    '未定': '#9e9e9e',
    '超EX': '#6a1b9a'     // 超EXTRA：未定の下
};

// 楽曲を「難易度の種類＋指数(小数第1位)」ごとにまとめ、指数の大きい順に並べる
function buildDiffTableGroups(targetSongs) {
    const groupMap = {};
    targetSongs.forEach(song => {
        let cls = song.diffClass || '未分類';
        const idx = song.diffIndex;
        let key, label, sortVal;
        if (cls === SUPER_EX) {
            key = SUPER_EX;
            label = '';
            sortVal = -Infinity;
        } else if (cls === '未分類' || idx === null || idx === undefined || isNaN(idx)) {
            cls = '未定';
            key = '未定';
            label = '';
            sortVal = -Infinity;
        } else {
            // 小数第1位で切り捨てて枠を分ける（例: +0.977 → +0.9、-0.43 → -0.4）
            //   ±0.5 などの誤差表記は parseDifficulty の時点で読み飛ばされている
            //   1e-9 は 0.3×10=2.9999… のような浮動小数の誤差で1つ下の枠に落ちないための補正
            const r = Math.trunc(idx * 10 + (idx >= 0 ? 1e-9 : -1e-9)) / 10;
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
    const clsRank = { '危険': 8, '別格': 7, '詐称': 6, '強': 5, '中': 4, '弱': 3, '逆詐称': 2, '入門': 1, '未定': 0, '超EX': -1 };
    groups.sort((a, b) => (b.sortVal - a.sortVal) || ((clsRank[b.cls] ?? 0) - (clsRank[a.cls] ?? 0)));
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

// 攻略wikiのURL（曲ごとに登録があればそれ、なければ popn.wiki の検索）
function getWikiUrl(song) {
    const searchKey = (song.genre && song.genre.trim() !== '') ? song.genre : song.title;
    return safeUrl(song.wikiUrl) || `https://popn.wiki/search?q=${encodeURIComponent(searchKey)}`;
}
