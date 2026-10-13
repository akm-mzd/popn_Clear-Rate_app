// ==========================================
// eagate-bookmarklet.js
// 公式サイト（e-amusement）のプレーデータから、メダルとスコアを読み取る。
// アプリの「公式データ取り込み」で配っている短いブックマークレットが、このファイルを読み込んで実行する。
// 公式サイトの上で動くので、アプリの他のファイル（config.js など）は使えない。このファイルだけで完結させる。
// ==========================================
(function () {
    'use strict';
    if (window.__popnEagateRunning) return;
    window.__popnEagateRunning = true;

    // ---------- 設定 ----------
    const MIN_LEVEL = 46;
    const MAX_LEVEL = 50;
    const MAX_PAGES = 200;
    const PAGE_INTERVAL_MS = 300; // 公式サーバーに負担をかけないよう、1ページごとに少し待つ
    const PANEL_ID = 'popn-eagate-panel';

    // メダル画像のファイル名（meda_○.png の ○）→ アプリのメダル名。'' は未プレイ
    // ※ 公式の画像名が変わったときは、ここだけ直す
    const MEDAL_FILES = {
        a: '金星',
        b: '銀星', c: '銀菱', d: '銀丸',
        e: '銅星', f: '銅菱', g: '銅丸',
        h: 'イージー',
        i: '黒星', j: '黒菱', k: '黒丸',
        l: '', none: ''
    };
    const MEDAL_IMG_RE = /meda_([a-z0-9]+)\.(?:png|gif|jpe?g|webp)/i;

    // このファイルの置き場所から、アプリの URL を求める
    const scriptSrc = (document.currentScript && document.currentScript.src) || '';
    const APP_URL = scriptSrc ? scriptSrc.replace(/js\/eagate-bookmarklet\.js.*$/, '') : '';

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const clean = s => String(s || '').replace(/[\s　]+/g, ' ').trim();

    // ---------- 画面（公式ページの上に重ねて出すパネル） ----------
    let panel, statusEl, bodyEl;
    function buildPanel() {
        const old = document.getElementById(PANEL_ID);
        if (old) old.remove();
        panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
            'width:min(420px,calc(100vw - 20px));max-height:calc(100vh - 20px);overflow:auto;box-sizing:border-box;' +
            'background:#fff;color:#333;border:2px solid #e91e63;border-radius:10px;padding:14px;' +
            'box-shadow:0 6px 24px rgba(0,0,0,.35);font:14px/1.5 sans-serif;text-align:left;';
        const title = document.createElement('div');
        title.textContent = "Pop'n Clear Rate app 取り込み";
        title.style.cssText = 'font-weight:bold;color:#c2185b;margin-bottom:6px;';
        statusEl = document.createElement('div');
        bodyEl = document.createElement('div');
        bodyEl.style.cssText = 'margin-top:8px;display:flex;flex-direction:column;gap:8px;';
        panel.append(title, statusEl, bodyEl);
        document.body.appendChild(panel);
    }
    function setStatus(text) { statusEl.textContent = text; }
    function addButton(label, color, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.style.cssText = `padding:10px;border:none;border-radius:6px;background:${color};color:#fff;font-weight:bold;font-size:14px;cursor:pointer;`;
        b.addEventListener('click', onClick);
        bodyEl.appendChild(b);
        return b;
    }
    function addNote(text, color) {
        const d = document.createElement('div');
        d.textContent = text;
        d.style.cssText = `font-size:12px;color:${color || '#555'};white-space:pre-wrap;`;
        bodyEl.appendChild(d);
        return d;
    }
    function addTextBox(text) {
        const t = document.createElement('textarea');
        t.readOnly = true;
        t.value = text;
        t.style.cssText = 'width:100%;height:70px;box-sizing:border-box;font-size:11px;';
        bodyEl.appendChild(t);
        return t;
    }
    function finish() {
        window.__popnEagateRunning = false;
    }
    function addCloseButton() {
        addButton('閉じる', '#9e9e9e', () => { panel.remove(); });
    }

    // テキストをクリップボードへ（使えない端末では、テキスト欄を選択してコピー）
    async function copyText(text, box) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            if (!box) return false;
            box.focus();
            box.select();
            try { return document.execCommand('copy'); } catch (e2) { return false; }
        }
    }

    // ---------- ページの取得 ----------
    function getListUrl(page) {
        const here = new URL(location.href);
        let url;
        if (/\/playdata\/mu_[a-z_]+\.html$/i.test(here.pathname) && here.pathname.indexOf('detail') === -1) {
            url = here; // 今開いている一覧ページの条件（並び順など）をそのまま使う
        } else {
            const m = here.pathname.match(/\/game\/popn\/(popn\d+)\//);
            const ver = m ? m[1] : 'popn29';
            url = new URL(`/game/popn/${ver}/playdata/mu_top.html?page=0&version=-1&bemani=0&category=0&keyword=&sort=music&sort_type=up`, location.origin);
        }
        url.searchParams.set('page', String(page));
        return url.href;
    }

    async function fetchDoc(url) {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error(`ページを読めませんでした（${res.status}）`);
        const buf = await res.arrayBuffer();
        const ctype = res.headers.get('content-type') || '';
        let charset = (ctype.match(/charset=([\w-]+)/i) || [])[1];
        if (!charset) {
            // <meta charset> を見る（先頭だけを仮に読む）
            const head = new TextDecoder('ascii').decode(buf.slice(0, 2048));
            charset = (head.match(/charset=["']?([\w-]+)/i) || [])[1] || document.characterSet || 'utf-8';
        }
        let text;
        try { text = new TextDecoder(charset).decode(buf); } catch (e) { text = new TextDecoder('utf-8').decode(buf); }
        return new DOMParser().parseFromString(text, 'text/html');
    }

    // ---------- 1ページ分の読み取り ----------
    // 行の中で、el を含む「列」（行の直接の子）を返す
    function cellOf(row, el) {
        let cur = el;
        while (cur && cur.parentElement && cur.parentElement !== row) cur = cur.parentElement;
        return cur && cur.parentElement === row ? cur : null;
    }

    function diffFromClass(el) {
        const c = ' ' + String(el.className || '').toLowerCase().replace(/[_\-]/g, ' ') + ' ';
        if (/ (ex|extra) /.test(c)) return 'EX';
        if (/hyper| h /.test(c)) return 'H';
        if (/normal| n /.test(c)) return 'N';
        if (/easy| e /.test(c)) return 'E';
        return '';
    }

    function levelFromText(text) {
        const m = String(text).match(/lv\.?\s*(\d{1,2})/i);
        return m ? parseInt(m[1], 10) : null;
    }

    function scoreFromText(text) {
        const t = String(text).replace(/lv\.?\s*\d{1,2}/ig, ' ').replace(/(\d),(\d{3})/g, '$1$2');
        const nums = (t.match(/\d{1,6}/g) || []).map(Number).filter(n => n >= 0 && n <= 100000);
        return nums.length ? Math.max(...nums) : null;
    }

    const isMedalImg = img => MEDAL_IMG_RE.test(img.getAttribute('src') || '');
    const medalImgOf = el => Array.from(el.querySelectorAll('img')).find(isMedalImg) || null;

    function parsePage(doc, diag) {
        const imgs = Array.from(doc.querySelectorAll('img')).filter(isMedalImg);
        const rows = [];
        imgs.forEach(img => {
            const row = img.closest('li, tr');
            if (row && rows.indexOf(row) === -1) rows.push(row);
        });

        const charts = [];
        rows.forEach(row => {
            // 曲名とジャンル
            const link = row.querySelector('a[href*="detail"]') || row.querySelector('a');
            let musicCell = link ? cellOf(row, link) : null;
            if (!musicCell) musicCell = row.querySelector('[class*="music"], [class*="title"]');
            let title = link ? clean(link.textContent) : '';
            let genre = '';
            if (musicCell) {
                const g = musicCell.querySelector('[class*="genre"]');
                if (g) {
                    genre = clean(g.textContent);
                } else {
                    const walker = doc.createTreeWalker(musicCell, NodeFilter.SHOW_TEXT);
                    const parts = [];
                    while (walker.nextNode()) {
                        const t = clean(walker.currentNode.nodeValue);
                        if (t && !(link && link.contains(walker.currentNode))) parts.push(t);
                    }
                    if (!title && parts.length) title = parts.shift();
                    genre = parts.join(' ');
                }
            }
            if (!title) { diag.badRows++; return; }

            // 行全体のレベル（レベル別の一覧で、1行が1譜面の場合）
            const lvEl = row.querySelector('[class*="lv"], [class*="level"]');
            const lvDigits = lvEl ? clean(lvEl.textContent).match(/^(?:lv\.?\s*)?(\d{1,2})$/i) : null;
            const rowLevel = lvDigits ? parseInt(lvDigits[1], 10) : levelFromText(row.textContent);

            // 譜面ごとの列（曲名の列より後ろ）
            const cells = Array.from(row.children).filter(c => c !== musicCell && (!musicCell || (musicCell.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING)));
            const medalCells = cells.filter(c => medalImgOf(c));
            const single = medalCells.length === 1 && rowLevel !== null;

            medalCells.forEach(cell => {
                const src = medalImgOf(cell).getAttribute('src');
                const code = src.match(MEDAL_IMG_RE)[1].toLowerCase();
                let diff = diffFromClass(cell);
                if (!diff) {
                    // 列のクラスで分からないときは、後ろから EX / H / N / E の順とみなす
                    const fromEnd = cells.length - 1 - cells.indexOf(cell);
                    diff = single ? '' : (['EX', 'H', 'N', 'E'][fromEnd] || '');
                    if (!single) diag.positional++;
                }
                const level = levelFromText(cell.textContent) || (single ? rowLevel : null);
                if (!(code in MEDAL_FILES)) {
                    diag.unknownMedals[code] = (diag.unknownMedals[code] || 0) + 1;
                    return;
                }
                const medal = MEDAL_FILES[code];
                const score = scoreFromText(cell.textContent);
                if (!medal && score === null) return;
                if (level !== null && (level < MIN_LEVEL || level > MAX_LEVEL)) return;
                if (level === null && (diff === 'E' || diff === 'N')) return; // 46以上はハイパーとEXだけ
                const chart = { t: title, g: genre, d: diff, m: medal };
                if (level !== null) chart.l = level;
                if (score !== null) chart.s = score;
                charts.push(chart);
            });
        });
        return { rows: rows.length, charts, firstTitle: rows.length ? clean(rows[0].textContent).slice(0, 80) : '' };
    }

    // ---------- 診断データ（うまく読めなかったときに作者へ送ってもらう） ----------
    function buildDiag(doc, url, diag, reason) {
        const imgs = [];
        doc.querySelectorAll('img').forEach(img => {
            const s = (img.getAttribute('src') || '').split('?')[0].split('/').slice(-2).join('/');
            if (s && imgs.indexOf(s) === -1 && imgs.length < 40) imgs.push(s);
        });
        // 一覧の部分（メダル画像か曲の詳細リンクのまわり）だけを切り出す。ログイン名などは含めない
        const anchor = doc.querySelector('img[src*="meda_"]') || doc.querySelector('a[href*="detail"]');
        let area = anchor ? (anchor.closest('ul, table') || anchor.parentElement) : (doc.querySelector('#contents, .contents, main') || doc.body);
        let html = area ? area.outerHTML : '';
        html = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\s+/g, ' ');
        return JSON.stringify({
            type: 'popn-eagate-diag',
            reason,
            url: url.replace(/[?#].*$/, ''),
            title: clean(doc.title),
            unknownMedals: diag.unknownMedals,
            positional: diag.positional,
            badRows: diag.badRows,
            images: imgs,
            html: html.slice(0, 6000)
        });
    }

    function showDiag(text, message) {
        addNote(message + '\n下の「診断データをコピー」を押して、アプリの作者（Claude）に貼り付けて送ってください。読み取り方を直します。', '#c62828');
        const box = addTextBox(text);
        addButton('診断データをコピー', '#ff9800', async () => {
            setStatus((await copyText(text, box)) ? '診断データをコピーしました。' : 'コピーできませんでした。下の欄を長押しして全部コピーしてください。');
        });
    }

    // ---------- アプリへの受け渡し ----------
    function sendToApp(json) {
        if (!APP_URL) { setStatus('アプリの場所が分かりません。「コピー」を使ってください。'); return; }
        const appOrigin = new URL(APP_URL).origin;
        const w = window.open(APP_URL + '#eagate-import', '_blank');
        if (!w) { setStatus('新しいタブを開けませんでした。「コピー」を使ってください。'); return; }
        setStatus('アプリを開いています…（読み込みが終わると、確認画面が出ます）');
        const onMessage = ev => {
            if (ev.origin !== appOrigin || ev.source !== w || !ev.data) return;
            if (ev.data.type === 'popn-app-ready') {
                w.postMessage({ type: 'popn-eagate-data', payload: json }, appOrigin);
            } else if (ev.data.type === 'popn-app-received') {
                window.removeEventListener('message', onMessage);
                setStatus('アプリに送りました。アプリのタブで確認して「反映」を押してください。');
            }
        };
        window.addEventListener('message', onMessage);
    }

    // ---------- 本体 ----------
    async function run() {
        buildPanel();
        const allowed = location.hostname === 'p.eagate.573.jp' || window.__popnEagateAllowHost === true;
        if (!allowed || !/\/game\/popn\//.test(location.pathname)) {
            setStatus('公式サイト（e-amusement）の pop\'n music のページで実行してください。');
            addCloseButton();
            return finish();
        }

        const diag = { unknownMedals: {}, positional: 0, badRows: 0 };
        const charts = [];
        let lastSig = null, firstDoc = null, firstUrl = '', pages = 0;
        try {
            for (let page = 0; page < MAX_PAGES; page++) {
                setStatus(`読み取り中… ${page + 1}ページ目（${charts.length}譜面）`);
                const url = getListUrl(page);
                const doc = await fetchDoc(url);
                if (!firstDoc) { firstDoc = doc; firstUrl = url; }
                const result = parsePage(doc, diag);
                if (result.rows === 0) break;
                const sig = result.rows + ':' + result.firstTitle;
                if (sig === lastSig) break; // 最後のページを過ぎて、同じページが返ってきた
                lastSig = sig;
                charts.push(...result.charts);
                pages++;
                await sleep(PAGE_INTERVAL_MS);
            }
        } catch (e) {
            setStatus('読み取りに失敗しました：' + e.message);
            if (firstDoc) showDiag(buildDiag(firstDoc, firstUrl, diag, 'error: ' + e.message), 'エラーが出ました。');
            addCloseButton();
            return finish();
        }

        if (charts.length === 0) {
            const needLogin = firstDoc && /ログイン|login/i.test(clean(firstDoc.body ? firstDoc.body.textContent : '')) && pages === 0;
            setStatus(needLogin ? 'ログインしていないようです。e-amusement にログインしてから実行してください。' : '曲のデータを読み取れませんでした。');
            if (firstDoc) showDiag(buildDiag(firstDoc, firstUrl, diag, 'no charts (pages=' + pages + ')'), '公式ページの形が想定と違うようです。');
            addCloseButton();
            return finish();
        }

        // 結果
        const counts = {};
        charts.forEach(c => { const k = c.m || '未プレイ(スコアのみ)'; counts[k] = (counts[k] || 0) + 1; });
        const order = ['金星', '銀星', '銀菱', '銀丸', '銅星', '銅菱', '銅丸', 'イージー', '黒星', '黒菱', '黒丸'];
        const summary = Object.keys(counts).sort((a, b) => order.indexOf(a) - order.indexOf(b)).map(k => `${k} ${counts[k]}`).join(' / ');
        const json = JSON.stringify({ type: 'popn-eagate', v: 1, at: new Date().toISOString(), pages, charts });

        setStatus(`${pages}ページから ${charts.length}譜面（ハイパー・EX）を読み取りました。`);
        addNote('内訳：' + summary);
        addButton('アプリに送る（新しいタブで開く）', '#e91e63', () => sendToApp(json));
        const box = addTextBox(json);
        addButton('コピー（アプリで「クリップボードから取り込む」）', '#2196F3', async () => {
            setStatus((await copyText(json, box)) ? 'コピーしました。アプリのメニュー「公式データ取り込み」で取り込んでください。' : 'コピーできませんでした。上の欄を長押しして全部コピーしてください。');
        });

        const unknown = Object.keys(diag.unknownMedals);
        if (unknown.length) {
            showDiag(buildDiag(firstDoc, firstUrl, diag, 'unknown medals'), `知らないメダル画像がありました（${unknown.join(', ')}）。その譜面は取り込みません。`);
        }
        addCloseButton();
        finish();
    }

    run().catch(e => {
        if (statusEl) setStatus('エラー：' + e.message);
        finish();
    });
})();
