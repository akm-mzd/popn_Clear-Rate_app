// データの守り：gas/Code.gs を Node で動かし（tests/gasmock.js）、アプリとつないで確かめる
//   使い方：node tests/data-safety.js ポート（アプリを python3 -m http.server で配信しているポート。省くと 8765）
const { chromium } = require('playwright');
const { makeGas } = require('./gasmock');
const path = require('path');
const REPO = path.join(__dirname, '..');
const mk = (i, banner) => ({ id: `G${i}_S${i}_${900 + i}`, level: '48', title: 'S' + i, genre: 'G' + i, notes: 900 + i, diffRaw: '中(0.0)', version: '3', bannerUrl: banner ? `https://example.com/b${i}.png` : '' });
const seedData = () => ({ songs: Array.from({ length: 30 }, (_, i) => mk(i, true)), users: { Guest: { clearRecords: { G0_S0_900: '銅丸', G1_S1_901: '黒星' }, scoreRecords: {}, historyRecords: {} } } });

const PORT = process.argv[2] || '8765';
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const out = {};
  // ---------- GAS だけで確かめる ----------
  {
    const gas = makeGas(REPO + '/gas/Code.gs');
    gas.seed(seedData());
    out.gasVersion = gas.get({ mode: 'version' }).gasVersion;
    out.oldClears = gas.post(JSON.stringify({ type: 'updateClears', targetUser: 'Guest', clearRecords: {} })).message.slice(0, 12);
    out.bigDrop = gas.post(JSON.stringify({ type: 'updateSongs', password: '1005', songs: seedData().songs.slice(0, 10) })).message.slice(0, 14);
    out.bigDropForce = gas.post(JSON.stringify({ type: 'updateSongs', password: '1005', songs: seedData().songs.slice(0, 10), force: true })).status;
    out.removeMany = gas.post(JSON.stringify({ type: 'patchSongs', password: '1005', patch: { remove: ['a', 'b', 'c', 'd', 'e', 'f'] } })).message.slice(0, 14);
    out.backupsAfter = gas.backups().map(f => f.name.replace(/popn_backup_\d+_\d+_/, ''));
    out.list = gas.get({ mode: 'backups' }).backups.length;
    out.backupContentSongs = gas.get({ mode: 'backup', id: gas.get({ mode: 'backups' }).backups[0].id }).songs.length;
    out.log = gas.get({ mode: 'log' }).log.map(e => e.type);
  }
  // ---------- アプリとつなぐ ----------
  for (const [name, vp] of [['sp', { width: 375, height: 800 }], ['pc', { width: 1280, height: 900 }]]) {
    const gas = makeGas(REPO + '/gas/Code.gs');
    gas.seed(seedData());
    let oldGas = false; const posts = [];
    const ctx = await b.newContext({ viewport: vp });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    const dialogs = []; p.on('dialog', d => { dialogs.push(d.message().slice(0, 30)); d.type() === 'prompt' ? d.accept('1005') : d.accept(); });
    await p.route(/script\.google\.com/, async r => {
      const req = r.request(); const url = new URL(req.url());
      if (req.method() === 'GET') return r.fulfill({ contentType: 'application/json', body: JSON.stringify(gas.get(Object.fromEntries(url.searchParams))) });
      const body = req.postData(); const t = JSON.parse(body).type; posts.push(t);
      if (oldGas && t === 'patchSongs') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'error', message: 'ユーザー名がありません' }) });
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify(gas.post(body)) });
    });
    await p.route(/^https?:\/\/(?!localhost|script\.google)/, r => r.abort());
    await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(2000);
    const r = {};
    // ほかの端末が S5 のバナーを変える（この端末は知らない）
    { const d = gas.data(); d.songs[5].bannerUrl = 'https://example.com/other5.png'; gas.seed(d); }
    // この端末で S2 に属性を付けて楽曲リストを保存 → 変わった所だけ（patchSongs）
    await p.evaluate(async () => { isAdminAuthenticated = true; songs.find(s => s.title === 'S2').attrs = ['階段']; return saveToCloud(true); });
    let d = gas.data();
    r.patch = { s2attrs: (d.songs.find(s => s.title === 'S2').attrs || []).join(), s5banner: d.songs.find(s => s.title === 'S5').bannerUrl.slice(-10), count: d.songs.length };
    // バナーを4曲消そうとすると確かめが出る（OK で保存）
    await p.evaluate(async () => { ['S10', 'S11', 'S12', 'S13'].forEach(t => { songs.find(s => s.title === t).bannerUrl = ''; }); return saveToCloud(true); });
    d = gas.data(); r.cleared = d.songs.filter(s => ['S10', 'S11', 'S12', 'S13'].includes(s.title) && !s.bannerUrl).length;
    // 「保存」ボタン：記録の変わった所だけ（updateClears は使わない）
    await p.evaluate(async () => { clearRecords['G3_S3_903'] = '金星'; await saveCurrentUserToCloud(); });
    r.saveBtn = gas.data().users.Guest.clearRecords.G3_S3_903;
    // 古い GAS のとき：patchSongs が通らなければ、前のやり方（updateSongs）で保存する
    oldGas = true;
    await p.evaluate(async () => { songs.find(s => s.title === 'S4').attrs = ['縦連']; return saveToCloud(true); });
    r.fallback = (gas.data().songs.find(s => s.title === 'S4').attrs || []).join();
    oldGas = false;
    r.posts = [...new Set(posts)].join(',');
    // 前の状態に戻す画面：クラウドのバックアップを選んで、消えたバナーを戻す
    await p.evaluate(() => openBackupRestoreModal()); await p.waitForTimeout(800);
    r.listText = await p.$eval('#backup-restore-body', e => e.innerText.replace(/\s+/g, ' ').slice(0, 120));
    await p.click('#backup-restore-body .br-item'); await p.waitForTimeout(500);
    r.diffText = await p.$eval('#backup-restore-body', e => e.innerText.replace(/\s+/g, ' ').slice(0, 260));
    await p.click('text=消えたバナーだけ戻す'); await p.waitForTimeout(800);
    r.restoredBanners = gas.data().songs.filter(s => ['S10', 'S11', 'S12', 'S13'].includes(s.title) && s.bannerUrl).length;
    // 保存の記録
    await p.evaluate(() => { backupRestoreState.selected = null; renderBackupRestore(); });
    await p.click('text=保存の記録を見る'); await p.waitForTimeout(500);
    r.log = await p.$eval('.br-log', e => e.innerText.split('\n').slice(0, 3).join(' | ')).catch(() => 'none');
    await p.screenshot({ path: require('path').join(require('os').tmpdir(), `br_${name}.png`) });
    await p.evaluate(() => closeBackupRestoreModal());
    // この端末の控え（IndexedDB）と見張り：前の日の控えより曲が大きく減っていたら知らせる
    r.deviceBackups = await p.evaluate(async () => (await listDeviceBackups()).map(x => x.songs).join());
    const n = dialogs.length;
    r.dropWarn = await p.evaluate(async () => {
      const y = new Date(Date.now() - 86400000);
      await idbRequest(null, 'readwrite', st => st.put({ day: localDateKey(y.getTime()), t: y.getTime(), songs: 40, banners: 40, data: { songs: Array.from({ length: 40 }, (_, i) => ({ title: 'x' + i, bannerUrl: 'u' })), users: {} } }));
      await checkDataDrop({ songs: songs, users: allUsersData });
      return true;
    });
    r.dropDialog = dialogs.slice(n).join(' / ');
    r.errs = errs;
    out[name] = r;
    await ctx.close();
  }
  await b.close();
  console.log(JSON.stringify(out, null, 1));
})();
