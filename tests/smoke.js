// 画面の中身（統計・表の文字・並び替え・絞り込み）を JSON で出す。2つの版で出したものが同じなら、見た目の文字は変わっていない
//   使い方：node tests/smoke.js ポート > a.json（もう1つの版も出して、cmp で比べる）
// 同じテストデータで画面の中身を書き出す（main と比べる）。BAD の履歴は入れない（入れると今回の修正で変わるのが正しい）
const { chromium } = require('playwright');
const port = process.argv[2];
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const out = {};
  for (const ui of ['classic', 'new']) for (const [name, vp] of [['sp', { width: 375, height: 800 }], ['pc', { width: 1280, height: 900 }]]) {
    const p = await b.newPage({ viewport: vp });
    await p.addInitScript(u => localStorage.setItem('popn_ui_mode', u), ui);
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    p.on('dialog', d => d.dismiss());
    await p.route(/^https?:\/\/(?!localhost)/, r => r.abort());
    await p.goto(`http://localhost:${port}/index.html`); await p.waitForTimeout(1000);
    const r = await p.evaluate(async () => {
      const diffs = ['別格(+1.1)', '強(+0.5)', '中(+0.21)', '中(-0.12)', '弱(-0.4)', '入門(-2.0)', ''];
      const vers = ['3', 'sp', 'jf', 'hc', 'cs4', 'pmp2', 'ee', 'ee2', 'ul'];
      const medals = ['', '金星', '銀丸', '銅丸', 'イージー', '黒星', 'ロングオフ', '未解禁'];
      const songs = []; const cr = {}; const sc = {}; const bad = {}; const hist = {};
      let t = 1700000000000;
      ['50', '49', '48', '47', '46'].forEach(lv => { for (let i = 0; i < 10; i++) {
        const s = { level: lv, title: `T${lv}-${i}`, genre: 'G' + i, notes: 900 + i, bpm: String(100 + i * 7), diffRaw: diffs[i % diffs.length], version: vers[i % vers.length], bannerUrl: '' };
        songs.push(s); const id = `${s.genre}_${s.title}_${s.notes}`;
        cr[id] = medals[i % medals.length]; sc[id] = 80000 + i * 1500;
        if (i % 3 === 0) bad[id] = i * 4;
        if (i % 2 === 0) hist['k' + lv + i] = { id, t: (t += 3600000), om: '', nm: cr[id], os: null, ns: sc[id], src: 'm' };
      } });
      applyFetchedData({ songs, users: { Guest: { clearRecords: cr, scoreRecords: sc, badRecords: bad, historyRecords: hist } } });
      refreshUI(); document.getElementById('loading').style.display = 'none';
      const txt = sel => { const e = document.querySelector(sel); return e ? e.innerText.replace(/\s+/g, ' ').trim().slice(0, 600) : null; };
      const res = {};
      for (const lv of ['48', '50', 'ALL']) {
        changeViewLevel(lv);
        for (const m of ['list', 'grid', 'fc', 'medal', 'bad', 'score', 'pokkura', 'oldpokkura']) {
          setViewMode(m); await new Promise(r => setTimeout(r, 10));
          res[lv + ':' + m] = [txt('#stats-display'), m === 'list' ? document.querySelectorAll('#song-list tr').length : txt('#diff-grid-view')];
        }
      }
      changeViewLevel('UPDATED'); await new Promise(r => setTimeout(r, 10)); res.updated = txt('#diff-grid-view');
      changeViewLevel('49'); setViewMode('list');
      setFilterValues('filter-bad', [BAD_FILTER_ITEMS[1].value]); renderTable(); res.filterBad = document.querySelectorAll('#song-list tr').length;
      resetFilters && resetFilters();
      res.stats = JSON.stringify(computeStats(lastDisplaySongs || []));
      res.goalBad = songs.slice(0, 20).map(s => getSongBad(s.id)).join(',');
      return res;
    });
    out[ui + '_' + name] = { errs, r };
    await p.close();
  }
  await b.close();
  console.log(JSON.stringify(out, null, 1));
})();
