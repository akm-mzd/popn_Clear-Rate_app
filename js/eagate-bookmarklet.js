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
        h: '黒星', i: '黒菱', j: '黒丸',
        k: 'イージー',    // 緑
        l: 'ロングオフ',  // オレンジ
        none: ''
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
    // pop'n のバージョンのフォルダ（popn29 など）は今のページのパスから取る。番号（29）は今作の新曲一覧に使う
    const VER_DIR = (location.pathname.match(/\/game\/popn\/(popn\d+)\//) || [])[1] || 'popn29';
    const VER_NUM = parseInt(VER_DIR.replace(/\D/g, ''), 10) || 29;
    const playdataUrl = path => new URL(`/game/popn/${VER_DIR}/playdata/${path}`, location.origin).href;

    // レベル別一覧（mu_lv.html）の URL。version=-1 は全バージョン、VER_NUM は今作の新曲だけ
    function getLevelUrl(lv, page, version) {
        return playdataUrl(`mu_lv.html?page=${page}&version=${version === undefined ? -1 : version}&bemani=0&category=0&keyword=&lv=${lv}&sort=none&sort_type=none`);
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
            charset = (head.match(/charset=["']?([\w-]+)/i) || [])[1] || 'shift_jis'; // 公式は UTF-8 でなければ Shift_JIS
        }
        let text;
        try { text = new TextDecoder(charset).decode(buf); } catch (e) { text = new TextDecoder('utf-8').decode(buf); }
        return new DOMParser().parseFromString(text, 'text/html');
    }

    // ---------- 1ページ分の読み取り ----------
    // レベル別一覧（mu_lv.html）の決まった形を読む。形が違えば null（汎用の parsePage に切り替える）
    //   .mu_list_lv_table > li（見出しは li.st_th）
    //   1列目：a = 曲名、1つ目の p = ジャンル / 4列目：p = スコア、1つ目の img = メダル、2つ目の img = ランク
    function parseLevelPage(doc, diag, lv) {
        const tables = doc.querySelectorAll('.mu_list_lv_table');
        if (tables.length !== 1) return null;
        const rows = Array.from(tables[0].querySelectorAll('li')).filter(li => !li.classList.contains('st_th'));
        const charts = [];
        let bad = 0;
        rows.forEach(li => {
            const music = li.children[0];
            const result = li.children[3];
            const link = music ? music.querySelector('a') : null;
            const title = link ? clean(link.textContent) : '';
            if (!title || !result) { bad++; return; }
            const genreEl = music.querySelector('p');
            const scoreEl = result.querySelector('p');
            const medalImg = result.querySelector('img');
            const score = scoreEl ? scoreFromText(scoreEl.textContent) : null;
            let medal = '';
            if (medalImg) {
                const m = (medalImg.getAttribute('src') || '').match(MEDAL_IMG_RE);
                const code = m ? m[1].toLowerCase() : '';
                if (!(code in MEDAL_FILES)) {
                    diag.unknownMedals[code || '?'] = (diag.unknownMedals[code || '?'] || 0) + 1;
                    return;
                }
                medal = MEDAL_FILES[code];
            }
            if (!medal && score === null) return; // 未プレイ
            const chart = { t: title, g: genreEl ? clean(genreEl.textContent) : '', d: '', m: medal, l: lv };
            if (score !== null) chart.s = score;
            // 曲の番号（詳細ページを開くのに使う。アプリには送らない）
            const no = new URLSearchParams((link.getAttribute('href') || '').split('?')[1] || '').get('no');
            if (no) Object.defineProperty(chart, 'no', { value: no, enumerable: false });
            charts.push(chart);
        });
        diag.badRows += bad;
        return { rows: rows.length, bad, charts, firstTitle: rows.length ? clean(rows[0].textContent).slice(0, 80) : '' };
    }

    // ページ数（ページ送りの #s_page の数）。分からなければ null
    function getPageCount(doc) {
        const pager = doc.getElementById('s_page');
        return pager && pager.children.length > 0 ? pager.children.length : null;
    }

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

    // pageLevel：レベル別一覧のレベル。1行に譜面が1つなら、その譜面のレベルになる
    function parsePage(doc, diag, pageLevel) {
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
            const inLevelPage = pageLevel !== undefined && medalCells.length === 1;
            if (pageLevel !== undefined && medalCells.length > 1) diag.multiInLevelPage++;
            const single = inLevelPage || (medalCells.length === 1 && rowLevel !== null);

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
                const level = inLevelPage ? pageLevel : (levelFromText(cell.textContent) || (single ? rowLevel : null));
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
    // 公式のポップンクラス（ポックラ）を、プレーデータのトップから読む。
    //   ページの作りが分からないので、「ポップンクラス」「ポックラ」の文字の近くにある 123.45 の形の数を探す。
    //   読めなければ null（取り込みは止めない）。読めなかったときのため、まわりの文字を pcDiag に残す
    let pcDiag = '';
    const PC_NUM = /(\d{1,3}\.\d{1,3})/;

    // プレーデータのトップの <div id="popnclass"><img ...><br>173.94</div> から読む
    function readPopnClassElement(doc) {
        const el = doc && doc.getElementById ? doc.getElementById('popnclass') : null;
        if (!el) return null;
        const m = clean(el.textContent).replace(/[,，]/g, '').match(PC_NUM);
        const v = m ? parseFloat(m[1]) : NaN;
        return v > 0 && v <= 1000 ? v : null;
    }

    // プレーデータのトップ（index.html）。ポックラと最近プレーした曲で使うので、取りに行くのは1回だけ
    //   今開いているページがトップなら、そのページを使う
    let topDocPromise = null;
    function getTopDoc() {
        if (document.getElementById('popnclass') || document.querySelector('ul.st_tbl_r')) return Promise.resolve(document);
        if (!topDocPromise) topDocPromise = fetchDoc(playdataUrl('index.html'));
        return topDocPromise;
    }

    // トップの下にある「最近プレーした曲」（20曲）と「◆最終プレー日時」を読む
    //   <ul class="st_tbl_r"> の <li>（見出しは li.st_th）の中に <a>曲名</a><p>ジャンル</p>。
    //   同じ形の表がほかにもある（プレー回数の表）ので、メダル画像のある最初の表を使う
    function readRecentPlays(doc) {
        const list = [];
        for (const ul of doc.querySelectorAll('ul.st_tbl_r')) {
            if (!ul.querySelector('img[src*="medal/meda_"]')) continue;
            Array.from(ul.children).forEach(li => {
                if (li.tagName !== 'LI' || li.classList.contains('st_th') || list.length >= 20) return;
                const a = li.querySelector('a');
                const t = a ? clean(a.textContent) : '';
                if (!t) return;
                const p = a.parentElement ? a.parentElement.querySelector('p') : null;
                list.push({ t, g: p ? clean(p.textContent) : '' });
            });
            break;
        }
        let rt = '';
        doc.querySelectorAll('li').forEach(li => {
            const label = li.querySelector('p');
            const value = li.querySelector('div');
            if (!rt && label && value && /最終プレー日時/.test(label.textContent)) rt = clean(value.textContent).slice(0, 40);
        });
        return { list, rt };
    }

    async function fetchOfficialPokkura() {
        // ① 今開いているページがトップなら、そこから直接読む
        const here = readPopnClassElement(document);
        if (here !== null) return here;
        // ② トップを取得して読む
        let doc;
        try {
            doc = await getTopDoc();
        } catch (e) {
            pcDiag = 'fetch error: ' + e.message;
            return null;
        }
        const byId = readPopnClassElement(doc);
        if (byId !== null) return byId;
        const LABEL = /ポップンクラス|ポックラ|pop'?n\s*class/i;
        const NUM = PC_NUM;
        const candidates = [];
        const walker = doc.createTreeWalker(doc.body || doc, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            // 「ポップンクラス」などのほか、見出しが「クラス」「CLASS」だけのときも候補にする
            if (LABEL.test(node.textContent) || /^\s*(クラス|class)\s*[:：]?\s*$/i.test(node.textContent)) candidates.push(node.parentElement);
        }
        for (const el of candidates) {
            // ラベルの要素 → 親 → その親 … と広げながら、最初に見つかった数を使う
            let box = el;
            for (let depth = 0; box && depth < 4; depth++, box = box.parentElement) {
                const text = clean(box.textContent).replace(/[,，]/g, '');
                const at = text.search(LABEL) >= 0 ? text.search(LABEL) : text.search(/クラス|class/i);
                const after = text.slice(Math.max(0, at));
                const m = after.match(NUM) || text.match(NUM);
                if (m) {
                    const v = parseFloat(m[1]);
                    if (v > 0 && v <= 1000) return v;
                }
            }
        }
        // 読めなかった：診断用に「クラス」まわりの文字と、小数が書かれた要素の場所（タグ・class 名）だけを残す
        //   （プレーヤー名などはなるべく含めない）
        const all = clean(doc.body ? doc.body.textContent : '');
        const i = all.search(/クラス|class/i);
        const spots = [];
        (doc.body ? doc.body.querySelectorAll('*') : []).forEach(el => {
            if (spots.length >= 15 || el.children.length > 0) return;
            const t = clean(el.textContent);
            if (!NUM.test(t) || t.length > 20) return;
            const path = [];
            for (let e = el; e && e !== doc.body && path.length < 4; e = e.parentElement) {
                path.unshift(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''));
            }
            spots.push(path.join('>') + ' = ' + t);
        });
        pcDiag = `title=${clean(doc.title)}; status_table=${!!doc.getElementById('status_table')}; popnclass=${!!doc.getElementById('popnclass')} || ` +
            (i >= 0 ? all.slice(Math.max(0, i - 40), i + 80) : 'no label') + ' || ' + spots.join(' | ');
        return null;
    }

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
            multiInLevelPage: diag.multiInLevelPage,
            badRows: diag.badRows,
            pokkuraText: pcDiag,
            badDetail: diag.badDetail || '',
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

    // ---------- ポックラ用：旧曲の「今作のスコア」 ----------
    // 公式のポックラは、旧曲を今作のスコア・メダルで数える。一覧には歴代ベストしか出ないので、
    // ポイントの高い旧曲から順に詳細ページを開き、上位40曲が確定したところで止める（ssdh233/popn-class と同じ考え方）
    const PK_BONUS = { '金星': 21250, '銀星': 17500, '銀菱': 17500, '銀丸': 17500, '銅星': 12500, '銅菱': 12500, '銅丸': 12500, 'ロングオフ': 10000, 'イージー': 6250 };
    const pkFloor = (n, p) => Math.floor(n * 10 ** p) / 10 ** p;
    function pkPoint(level, score, medal) {
        if (!(score >= 50000)) return 0;
        return pkFloor(pkFloor((level * (3750 * level + (PK_BONUS[medal] || 0) + (score - 50000))) / 3881250, 8) * 60, 2);
    }

    // 今作の新曲（Lv46〜49）の番号を集める（ssdh233/popn-class と同じく、新曲枠は Lv49 まで）
    async function fetchNewSongNos() {
        const nos = new Set();
        for (let lv = 46; lv <= 49; lv++) {
            let pageCount = null;
            for (let page = 0; page < MAX_PAGES; page++) {
                if (pageCount !== null && page >= pageCount) break;
                setStatus(`新曲の一覧を確認中… Lv${lv} の ${page + 1}ページ目`);
                const doc = await fetchDoc(getLevelUrl(lv, page, VER_NUM));
                if (page === 0) pageCount = getPageCount(doc);
                const links = doc.querySelectorAll('.mu_list_lv_table li:not(.st_th) a');
                if (links.length === 0) break;
                links.forEach(a => {
                    const no = new URLSearchParams((a.getAttribute('href') || '').split('?')[1] || '').get('no');
                    if (no) nos.add(no);
                });
                if (pageCount === null) break;
                await sleep(PAGE_INTERVAL_MS);
            }
        }
        return nos;
    }

    // 詳細ページの EX 譜面の「今作」の欄から、スコアとメダル（回数から推定）を読む。読めなければ null
    function parseVersionRecord(doc) {
        const section = doc.querySelector('#ex');
        if (!section) return null;
        const tables = section.querySelectorAll('table');
        if (tables.length < 2) return null;
        const scoreEl = tables[1].querySelector('tr.score td.play_value');
        if (!scoreEl) return null;
        const text = clean(scoreEl.textContent);
        if (text === '-' || text === '') return { score: 0, medal: '' };
        const counts = Array.from(tables[1].querySelectorAll('tr.play td.play_value')).map(td => parseInt(td.textContent, 10) || 0);
        const [, clear = 0, fc = 0, perfect = 0] = counts;
        const medal = perfect > 0 ? '金星' : fc > 0 ? '銀星' : clear > 0 ? '銅星' : '黒星';
        return { score: scoreFromText(text) || 0, medal };
    }

    // ---------- 最小BAD：詳細ページの EX 譜面の BAD の数（ハイスコアのときの数） ----------
    //   クリアしていてフルコンボでない譜面だけ読む（フルコンボは BAD 0、未クリアは最小BAD がない）。
    //   一覧のハイスコアと詳細ページのハイスコアが同じときだけ使う（別の難易度の譜面と取り違えないように）
    const BAD_TARGET_MEDALS = ['銅星', '銅菱', '銅丸'];
    let badDiag = '';
    const toCount = t => { const v = clean(t).replace(/[,，]/g, ''); return /^\d{1,4}$/.test(v) ? parseInt(v, 10) : null; };

    function parseBestBad(doc, chart) {
        const section = doc.querySelector('#ex');
        if (!section) return null;
        const tables = section.querySelectorAll('table');
        const best = tables[0] ? tables[0].querySelector('tr.score td.play_value') : null;
        if (!best || scoreFromText(best.textContent) !== chart.s) return null;
        const nums = [];
        section.querySelectorAll('th, td, dt, dd, span, div, li, p').forEach(el => {
            if (el.children.length > 0 || !/^BAD$/i.test(clean(el.textContent))) return;
            let n = el.nextElementSibling ? toCount(el.nextElementSibling.textContent) : null;
            if (n === null && el.tagName === 'TH') {
                // 見出しの行の下の行に数がある表
                const row = el.closest('tr');
                const idx = row ? Array.prototype.indexOf.call(row.children, el) : -1;
                const next = row ? row.nextElementSibling : null;
                if (next && next.children[idx]) n = toCount(next.children[idx].textContent);
            }
            if (n === null && el.parentElement && el.parentElement.nextElementSibling) n = toCount(el.parentElement.nextElementSibling.textContent);
            if (n !== null) nums.push(n);
        });
        if (nums.length === 0) {
            const re = /BAD\s*[:：]?\s*(\d{1,4})(?!\d)/gi;
            let m;
            const text = clean(section.textContent);
            while ((m = re.exec(text))) nums.push(parseInt(m[1], 10));
        }
        return nums.length ? Math.min(...nums) : null;
    }

    // 詳細ページを読んだら、BAD も一緒に見る（旧曲の今作スコアを読むときにも使う）
    function noteBad(chart, doc) {
        if (chart.badChecked || !BAD_TARGET_MEDALS.includes(chart.m)) return;
        Object.defineProperty(chart, 'badChecked', { value: true, enumerable: false });
        const n = parseBestBad(doc, chart);
        if (n !== null) chart.b = n;
        else if (!badDiag) {
            const section = doc.querySelector('#ex');
            badDiag = section ? section.outerHTML.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\s+/g, ' ').slice(0, 6000) : 'no #ex';
        }
    }

    // クリア済み・フルコンボでない譜面の詳細ページを読んで BAD を集める。読めた数を返す
    async function readBestBads(charts) {
        const targets = charts.filter(c => c.no && BAD_TARGET_MEDALS.includes(c.m) && c.s >= 50000 && !c.badChecked);
        let found = charts.filter(c => typeof c.b === 'number').length;
        let checked = 0;
        for (let i = 0; i < targets.length; i += 5) {
            const batch = targets.slice(i, i + 5);
            setStatus(`最小BAD を確認中… ${i + batch.length}/${targets.length}曲`);
            for (const c of batch) {
                noteBad(c, await fetchDoc(playdataUrl(`mu_detail.html?no=${encodeURIComponent(c.no)}&back=index`)));
                checked++;
                if (typeof c.b === 'number') found++;
            }
            // 最初の10曲で1つも読めなければ、ページの形が違うので止める（診断データを出す）
            if (checked >= 10 && found === 0) break;
            await sleep(PAGE_INTERVAL_MS);
        }
        return found;
    }

    // 旧曲（Lv48〜50）に、今作のスコア（vs）とメダル（vm）を付ける。調べた数を返す
    async function addVersionRecords(charts, newNos) {
        const old = charts.filter(c => c.no && c.l >= 48 && c.l <= 50 && !newNos.has(c.no) && c.s >= 50000)
            .map(c => ({ c, point: pkPoint(c.l, c.s, c.m) }))
            .sort((a, b) => b.point - a.point)
            .slice(0, 120);
        const resolved = [];
        for (let i = 0; i < old.length; i += 5) {
            const batch = old.slice(i, i + 5);
            setStatus(`旧曲の今作スコアを確認中… ${i + batch.length}/${old.length}曲（上位40曲が決まったら終わります）`);
            for (const item of batch) {
                const detailDoc = await fetchDoc(playdataUrl(`mu_detail.html?no=${encodeURIComponent(item.c.no)}&back=index`));
                noteBad(item.c, detailDoc);
                const rec = parseVersionRecord(detailDoc);
                if (!rec) continue;
                // メダルのボーナスが同じなら、歴代のメダル（菱・丸の区別がある）を使う
                const medal = (PK_BONUS[rec.medal] || 0) === (PK_BONUS[item.c.m] || 0) ? item.c.m : rec.medal;
                item.c.vs = rec.score;
                item.c.vm = medal;
                resolved.push(pkPoint(item.c.l, rec.score, medal));
            }
            await sleep(PAGE_INTERVAL_MS);
            // 40曲目のポイントが、まだ調べていない曲の歴代ポイント以上なら、もう入れ替わらない
            const next = old[i + 5];
            if (resolved.length >= 40 && next) {
                const cutoff = resolved.slice().sort((a, b) => b - a)[39];
                if (cutoff >= next.point) return resolved.length;
            }
        }
        return resolved.length;
    }

    // Lv46 以上の今作の新曲（プレー済み）が20曲に満たないとき、Lv45 以下の今作の新曲も読む。
    //   新バージョンが出た直後は、低いレベルの新曲もポックラの新曲枠に入るため。
    //   上のレベルから読み、20番目のポイントに次のレベルの最高ポイント（100000・金星）が届かなくなったら止める
    async function readLowLevelNewSongs(charts, newNos) {
        const points = charts.filter(c => c.no && newNos.has(c.no) && c.s >= 50000).map(c => pkPoint(c.l, c.s, c.m));
        if (points.length >= 20) return [];
        const extra = [];
        const dummyDiag = { unknownMedals: {}, badRows: 0 };
        for (let lv = MIN_LEVEL - 1; lv >= 1; lv--) {
            let pageCount = null;
            for (let page = 0; page < MAX_PAGES; page++) {
                if (pageCount !== null && page >= pageCount) break;
                setStatus(`Lv45以下の新曲を確認中… Lv${lv} の ${page + 1}${pageCount ? '/' + pageCount : ''}ページ目（${extra.length}曲）`);
                const doc = await fetchDoc(getLevelUrl(lv, page, VER_NUM));
                if (page === 0) pageCount = getPageCount(doc);
                const result = parseLevelPage(doc, dummyDiag, lv);
                if (!result || result.rows === 0) break;
                result.charts.forEach(c => {
                    if (!(c.s >= 50000)) return;
                    extra.push({ t: c.t, g: c.g, l: lv, s: c.s, m: c.m });
                    points.push(pkPoint(lv, c.s, c.m));
                });
                await sleep(PAGE_INTERVAL_MS);
                if (pageCount === null) break;
            }
            if (points.length >= 20 && lv > 1) {
                const twentieth = points.slice().sort((a, b) => b - a)[19];
                if (pkPoint(lv - 1, 100000, '金星') < twentieth) break;
            }
        }
        return extra;
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

        const diag = { unknownMedals: {}, positional: 0, badRows: 0, multiInLevelPage: 0 };
        const charts = [];
        const levelCounts = {}; // Lv → { rows: 行の数, bad: 読めなかった行, played: プレー済みの譜面 }
        let firstDoc = null, firstUrl = '', pages = 0;
        try {
            // Lv46〜50 のレベル別一覧だけを、レベルごとに全ページ読む
            for (let lv = MIN_LEVEL; lv <= MAX_LEVEL; lv++) {
                let lastSig = null;
                let pageCount = null; // 0ページ目の #s_page で決まる
                levelCounts[lv] = { rows: 0, bad: 0, played: 0 };
                for (let page = 0; page < MAX_PAGES; page++) {
                    if (pageCount !== null && page >= pageCount) break;
                    setStatus(`読み取り中… Lv${lv} の ${page + 1}${pageCount ? '/' + pageCount : ''}ページ目（全部で ${charts.length}譜面）`);
                    const url = getLevelUrl(lv, page);
                    const doc = await fetchDoc(url);
                    if (!firstDoc) { firstDoc = doc; firstUrl = url; }
                    if (page === 0) pageCount = getPageCount(doc);
                    const result = parseLevelPage(doc, diag, lv) || parsePage(doc, diag, lv);
                    if (result.rows === 0) break;
                    const sig = result.rows + ':' + result.firstTitle;
                    if (pageCount === null && sig === lastSig) break; // ページ数が分からないとき：最後を過ぎて同じページが返ってきた
                    lastSig = sig;
                    charts.push(...result.charts);
                    levelCounts[lv].rows += result.rows;
                    levelCounts[lv].bad += result.bad || 0;
                    levelCounts[lv].played += result.charts.length;
                    pages++;
                    await sleep(PAGE_INTERVAL_MS);
                }
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

        // ポックラ用に、旧曲の今作スコアを調べる（失敗しても、メダル・スコアの取り込みはできる）
        //   あわせて、Lv46 以上の新曲が少ないときは Lv45 以下の新曲も読む
        let versionChecked = 0, versionError = '';
        let extraNew = [];
        try {
            const newNos = await fetchNewSongNos();
            versionChecked = await addVersionRecords(charts, newNos);
            extraNew = await readLowLevelNewSongs(charts, newNos);
        } catch (e) {
            versionError = e.message;
        }

        // 最小BAD（読めなくても取り込みは続ける）
        let badFound = 0, badError = '';
        try {
            badFound = await readBestBads(charts);
        } catch (e) {
            badError = e.message;
        }

        // 公式のポックラ（読めなくても取り込みは続ける）
        let officialPokkura = null;
        try {
            setStatus('公式のポックラを確認中…');
            officialPokkura = await fetchOfficialPokkura();
        } catch (e) {
            pcDiag = 'error: ' + e.message;
        }

        // 最近プレーした曲（読めなくても取り込みは続ける）
        let recent = { list: [], rt: '' };
        try {
            setStatus('最近プレーした曲を確認中…');
            recent = readRecentPlays(await getTopDoc());
        } catch (e) { /* 読めなければ送らない */ }

        // 結果
        const counts = {};
        charts.forEach(c => { const k = c.m || '未プレイ(スコアのみ)'; counts[k] = (counts[k] || 0) + 1; });
        const order = ['金星', '銀星', '銀菱', '銀丸', '銅星', '銅菱', '銅丸', 'イージー', '黒星', '黒菱', '黒丸'];
        const summary = Object.keys(counts).sort((a, b) => order.indexOf(a) - order.indexOf(b)).map(k => `${k} ${counts[k]}`).join(' / ');
        const payload = { type: 'popn-eagate', v: 1, at: new Date().toISOString(), pages, charts };
        if (extraNew.length > 0) payload.extraNew = extraNew;
        if (officialPokkura !== null) payload.pc = officialPokkura;
        if (recent.list.length > 0) payload.recent = recent.list;
        if (recent.rt) payload.rt = recent.rt;
        const json = JSON.stringify(payload);

        setStatus(`Lv${MIN_LEVEL}〜${MAX_LEVEL} の ${pages}ページから、${charts.length}譜面を読み取りました。`);
        addNote('レベル別（プレー済み / 全曲）：' + Object.keys(levelCounts).map(lv => `Lv${lv} ${levelCounts[lv].played}/${levelCounts[lv].rows}`).join('　'));
        addNote('内訳：' + summary);
        addNote(versionError
            ? `旧曲の今作スコアは読めませんでした（${versionError}）。ポックラは歴代ベストで計算されます。`
            : `ポックラ用に、旧曲 ${versionChecked}曲の今作スコアを読み取りました。` + (extraNew.length ? `Lv45以下の新曲 ${extraNew.length}曲も読み取りました。` : ''));
        addNote(badError ? `最小BAD は読めませんでした（${badError}）。` : `最小BAD：${badFound}曲を読み取りました（クリア済み・フルコンボでない曲。ハイスコアのときの BAD）。`);
        addNote(officialPokkura !== null ? `公式のポックラ：${officialPokkura.toFixed(2)}` : '公式のポックラは読み取れませんでした（アプリでは計算値を出します）。');
        addNote(recent.list.length > 0 ? `最近プレーした曲：${recent.list.length}曲` + (recent.rt ? `（最終プレー ${recent.rt}）` : '') : '最近プレーした曲は読み取れませんでした。');
        addButton('アプリに送る（新しいタブで開く）', '#e91e63', () => sendToApp(json));
        const box = addTextBox(json);
        addButton('コピー（アプリで「クリップボードから取り込む」）', '#2196F3', async () => {
            setStatus((await copyText(json, box)) ? 'コピーしました。アプリのメニュー「公式データ取り込み」で取り込んでください。' : 'コピーできませんでした。上の欄を長押しして全部コピーしてください。');
        });

        const unknown = Object.keys(diag.unknownMedals);
        if (diag.badRows > 0) {
            showDiag(buildDiag(firstDoc, firstUrl, diag, 'bad rows'), `読めなかった行が ${diag.badRows} 行ありました。その曲は取り込みません。`);
        } else if (unknown.length) {
            showDiag(buildDiag(firstDoc, firstUrl, diag, 'unknown medals'), `知らないメダル画像がありました（${unknown.join(', ')}）。その譜面は取り込みません。`);
        } else if (!badError && badFound === 0 && badDiag) {
            showDiag(buildDiag(firstDoc, firstUrl, Object.assign({}, diag, { badDetail: badDiag }), 'no bad count'), '最小BAD を読み取れませんでした。直すために、この診断データを送ってもらえると助かります。');
        } else if (officialPokkura === null) {
            showDiag(buildDiag(firstDoc, firstUrl, diag, 'no official pokkura'), '公式のポックラを読み取れませんでした。直すために、この診断データを送ってもらえると助かります。');
        }
        addCloseButton();
        finish();
    }

    run().catch(e => {
        if (statusEl) setStatus('エラー：' + e.message);
        finish();
    });
})();
