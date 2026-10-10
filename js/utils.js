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
        script.onerror = reject;
        document.head.appendChild(script);
    });
    return html2canvasLoadPromise;
}
function showLoading(show, text = '通信中...') {
    document.getElementById('loading-text').innerText = text;
    document.getElementById('loading').style.display = show ? 'flex' : 'none';
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
