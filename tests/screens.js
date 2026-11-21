// 2つの版（例：main と今の作業）で、同じデータ・同じ画面のスクリーンショットが1画素も違わないか
//   使い方：node tests/screens.js 今の版のポート 比べる版のポート（例：8765 8766）
const { chromium } = require('playwright');
const [PORT_A, PORT_B] = [process.argv[2] || '8765', process.argv[3] || '8766'];
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const shots = async (port, vp, view) => {
    const p = await b.newPage({ viewport: vp });
    await p.route(/^https?:\/\/(?!localhost)/, r => r.abort());
    await p.goto(`http://localhost:${port}/index.html`); await p.waitForTimeout(1200);
    await p.evaluate((view) => {
      const songs = []; const cr = {}; const sc = {}; const medals = ['銅丸', '黒星', '金星', '', 'イージー'];
      for (let i = 0; i < 20; i++) { const s = { level: String(46 + (i % 5)), title: 'T' + i, genre: 'G' + i, notes: 900 + i, diffRaw: ['強(+0.5)', '中(0.0)', '弱(-0.5)'][i % 3], version: '3', bannerUrl: '' }; songs.push(s); const id = `${s.genre}_${s.title}_${s.notes}`; cr[id] = medals[i % 5]; sc[id] = 85000 + i * 500; }
      applyFetchedData({ songs, users: { Guest: { clearRecords: cr, scoreRecords: sc } } });
      refreshUI(); document.getElementById('loading').style.display = 'none';
      changeViewLevel('48'); setViewMode(view);
      document.querySelectorAll('#toast-box').forEach(e => e.remove());
    }, view);
    await p.waitForTimeout(400);
    const buf = await p.screenshot({ fullPage: true, animations: 'disabled' });
    await p.close();
    return buf;
  };
  for (const vp of [{ width: 375, height: 800 }, { width: 1280, height: 900 }]) {
    for (const view of ['list', 'grid', 'medal', 'score', 'pokkura', 'knock']) {
      const a = await shots(PORT_A, vp, view), c = await shots(PORT_B, vp, view);
      console.log(vp.width, view, a.equals(c) ? 'SAME' : 'DIFF');
    }
  }
  await b.close();
})();
