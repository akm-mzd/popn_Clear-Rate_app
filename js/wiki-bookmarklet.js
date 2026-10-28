// ==========================================
// wiki-bookmarklet.js
// 攻略wiki（popn.wiki）の上で動くブックマークレット本体。index.html では読み込まない。
// アプリの他のファイルに頼らず、このファイルだけで完結させる。
//   1. /api/sitemap（ページの一覧）から「難易度表/…」のページを集める
//   2. 各ページの中身（/api/page?path=…、Markdown）から、レベル・ジャンル・曲名・ノーツ数・「## 属性」を読む
//   3. Lv46〜50 で属性のある曲を JSON にして、コピーできるように出す（アプリの「攻略wikiから属性を取り込む」に貼る）
// wiki に負担をかけないよう、同時に読むのは少しずつにする。
// ==========================================
(async function () {
    'use strict';
    const MIN_LEVEL = 46, MAX_LEVEL = 50;
    const CONCURRENCY = 4;
    const PANEL_ID = 'popn-wiki-attr-panel';

    if (!/(^|\.)popn\.wiki$/.test(location.hostname) && !window.__popnWikiAllowHost) {
        alert('攻略wiki（popn.wiki）を開いてから、このブックマークを押してください。');
        return;
    }
    const old = document.getElementById(PANEL_ID);
    if (old) old.remove();

    // ---------- 画面（右下の小さな枠） ----------
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;width:min(360px,calc(100vw - 24px));background:#fff;color:#333;border:2px solid #7b1fa2;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.3);padding:12px;font:14px/1.5 sans-serif;';
    panel.innerHTML = '<div style="font-weight:bold;color:#7b1fa2;margin-bottom:6px;">属性の読み取り（Lv46〜50）</div><div data-status>準備中…</div><div data-note style="font-size:12px;color:#666;"></div><div data-actions style="margin-top:8px;display:flex;gap:8px;"></div>';
    document.body.appendChild(panel);
    const statusEl = panel.querySelector('[data-status]');
    const noteEl = panel.querySelector('[data-note]');
    const actionsEl = panel.querySelector('[data-actions]');
    let cancelled = false;
    const setStatus = t => { statusEl.textContent = t; };
    const button = (label, onClick, primary) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.style.cssText = `padding:6px 12px;border-radius:6px;font-weight:bold;cursor:pointer;border:1px solid #7b1fa2;${primary ? 'background:#7b1fa2;color:#fff;' : 'background:#fff;color:#7b1fa2;'}`;
        b.onclick = onClick;
        actionsEl.appendChild(b);
        return b;
    };
    const cancelBtn = button('やめる', () => { cancelled = true; panel.remove(); });

    // ---------- ページの一覧 ----------
    async function getSongPaths() {
        let list = null;
        try {
            const res = await fetch('/api/sitemap', { credentials: 'same-origin' });
            if (res.ok) list = await res.json();
        } catch (e) { /* 下で sitemap.xml を試す */ }
        let locs = [];
        if (Array.isArray(list)) {
            locs = list.map(x => (typeof x === 'string' ? x : x && x.loc)).filter(Boolean);
        } else {
            const res = await fetch('/sitemap.xml', { credentials: 'same-origin' });
            if (!res.ok) throw new Error('ページの一覧を読めませんでした（' + res.status + '）');
            const xml = new DOMParser().parseFromString(await res.text(), 'text/xml');
            locs = Array.from(xml.getElementsByTagName('loc')).map(n => n.textContent.trim());
        }
        const paths = new Set();
        locs.forEach(loc => {
            let p;
            try { p = decodeURIComponent(new URL(loc, location.origin).pathname); } catch (e) { return; }
            p = p.replace(/^\/+/, '');
            if (/^難易度表\/[^/]+$/.test(p)) paths.add(p);
        });
        return Array.from(paths);
    }

    // ---------- 1ページの読み取り ----------
    const clean = s => String(s || '')
        .replace(/<rt>[\s\S]*?<\/rt>|<rp>[\s\S]*?<\/rp>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [文字](リンク) → 文字
        .replace(/\\([\\[\]()*_|#~`>])/g, '$1')  // Markdown のエスケープを外す
        .replace(/\{[^}]*\}/g, '')                // {.text-lg} などの飾り
        .replace(/\s+/g, ' ').trim();

    // 「## 見出し」から次の「## 」までの行
    function section(body, name) {
        const lines = body.split(/\r?\n/);
        const start = lines.findIndex(l => new RegExp('^##\\s*' + name + '\\s*$').test(l.trim()));
        if (start < 0) return [];
        const out = [];
        for (let i = start + 1; i < lines.length; i++) {
            if (/^#{1,2}\s/.test(lines[i].trim())) break;
            out.push(lines[i]);
        }
        return out;
    }

    function parsePage(path, body) {
        // レベル：「## レベル」の中の最初の [50] など
        const lvLine = section(body, 'レベル').find(l => /\[\s*\d{1,2}\s*\]/.test(l));
        const lv = lvLine ? parseInt(lvLine.match(/\[\s*(\d{1,2})\s*\]/)[1], 10) : null;
        // 属性：「## 属性」の箇条書き（「、」などで区切る）
        const attrs = [];
        section(body, '属性').forEach(l => {
            const m = l.match(/^\s*[*\-+]\s+(.*)$/);
            if (!m) return;
            clean(m[1]).split(/[、,，・\/／]+/).map(s => s.trim()).filter(Boolean).forEach(a => { if (!attrs.includes(a)) attrs.push(a); });
        });
        // 曲の情報の表：見出しの次（| --- |）の次の行
        const lines = body.split(/\r?\n/);
        let row = null;
        for (let i = 0; i < lines.length - 2; i++) {
            if (/^\s*\|.*ジャンル.*\|/.test(lines[i]) && /^\s*\|\s*:?-{3,}/.test(lines[i + 1])) { row = lines[i + 2]; break; }
        }
        let genre = '', title = '', notes = null, type = '';
        if (row) {
            const cells = row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
            const g = clean(cells[0]).replace(/^\[[^\]]*\]\s*/, ''); // [16] などのカテゴリを外す
            const tm = g.match(/^(.*?)\s*\((EX|H|N|E|HYPER|NORMAL|EASY)\)\s*$/i);
            genre = tm ? tm[1] : g;
            type = tm ? tm[2].toUpperCase() : '';
            title = clean(cells[1]);
            const n = parseInt(String(cells[cells.length - 1]).replace(/[^\d]/g, ''), 10);
            notes = isNaN(n) ? null : n;
        }
        if (!title) {
            const h = body.match(/^#\s+(.+)$/m);
            if (h) genre = genre || clean(h[1]).replace(/\s*\((EX|H|N|E)\)\s*$/i, '');
        }
        return { p: path, g: genre.slice(0, 300), t: title.slice(0, 300), d: type, lv, n: notes, a: attrs.slice(0, 30) };
    }

    async function readPage(path) {
        const res = await fetch('/api/page?path=' + encodeURIComponent(path), { credentials: 'same-origin' });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        return parsePage(path, String(data && data.body || ''));
    }

    // ---------- 実行 ----------
    try {
        setStatus('ページの一覧を読んでいます…');
        const paths = await getSongPaths();
        if (paths.length === 0) throw new Error('「難易度表」のページが見つかりませんでした');
        const found = [];
        let done = 0, failed = 0, noAttr = 0;
        let next = 0;
        async function worker() {
            while (!cancelled && next < paths.length) {
                const path = paths[next++];
                try {
                    const s = await readPage(path);
                    if (s.lv !== null && s.lv >= MIN_LEVEL && s.lv <= MAX_LEVEL) {
                        if (s.a.length > 0 && (s.t || s.g)) found.push(s);
                        else noAttr++;
                    }
                } catch (e) {
                    failed++;
                }
                done++;
                if (done % 10 === 0 || done === paths.length) setStatus(`読んでいます… ${done} / ${paths.length}ページ（属性のある曲 ${found.length}）`);
            }
        }
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
        if (cancelled) return;

        const json = JSON.stringify({ type: 'popn-wiki-attrs', v: 1, at: new Date().toISOString(), songs: found });
        setStatus(`Lv${MIN_LEVEL}〜${MAX_LEVEL} で属性のある曲を ${found.length}曲 読み取りました。`);
        noteEl.textContent = `${paths.length}ページを確認（属性なし ${noAttr}曲${failed ? `・読めなかったページ ${failed}` : ''}）。「コピー」を押して、アプリの「攻略wikiから属性を取り込む」に貼ってください。`;
        cancelBtn.remove();
        const ta = document.createElement('textarea');
        ta.value = json;
        ta.readOnly = true;
        ta.style.cssText = 'width:100%;height:60px;margin-top:6px;font-size:11px;box-sizing:border-box;';
        panel.insertBefore(ta, actionsEl);
        button('コピー', async () => {
            let ok = false;
            try { await navigator.clipboard.writeText(json); ok = true; } catch (e) {
                ta.select();
                try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
            }
            noteEl.textContent = ok ? 'コピーしました。アプリに戻って取り込んでください。' : 'コピーできませんでした。下の文字を全部選んでコピーしてください。';
        }, true);
        button('閉じる', () => panel.remove());
    } catch (e) {
        setStatus('読み取りに失敗しました：' + e.message);
        cancelBtn.textContent = '閉じる';
    }
})();
