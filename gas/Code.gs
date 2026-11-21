// ==========================================
// Pop'n Clear Rate app のクラウド（Google Apps Script）
//   このファイルの中身を、Apps Script のエディタの「コード.gs」にまるごと貼り替えて、
//   「デプロイ」→「デプロイを管理」→ 今のデプロイの「編集」→ バージョン「新バージョン」→「デプロイ」で反映する。
//   ※ URL（GAS_URL）は変わらない。下の ADMIN_PASSWORD だけは、今のコードの値をそのまま書き写す。
//
// ver 2（アプリ 3.48.0.0 から）で足したもの：
//   ・patchSongs：楽曲リストも「変わった所だけ」保存する（曲ごとに変えた項目だけ。足した曲・消した曲）
//   ・自動バックアップ：1日1回と、楽曲リスト・記録を丸ごと書くときに、前の状態を Drive の popn_backups に残す（新しい60個）
//   ・バックアップの一覧・中身を返す（アプリの「前の状態に戻す」画面で使う）
//   ・保存の記録：いつ・どの端末・どの版のアプリが何を保存したか（新しい300件）
//   ・見張り：曲の数やバナーが急に減る保存・一度にたくさん消す保存は止める（戻すときの force は除く）
//   ・記録の丸ごと上書き（updateClears）は止める（古い版のアプリの「保存」ボタンで、新しい記録が古いもので上書きされないように）
// ==========================================
const FILENAME = 'popn_multi_user_data.json';
const BANNER_FOLDER_NAME = 'popn_banners';
const BACKUP_FOLDER_NAME = 'popn_backups';
const BACKUP_KEEP = 60;                 // 残すバックアップの数
const BACKUP_MIN_INTERVAL_MS = 10 * 60 * 1000; // 丸ごと書くときのバックアップは、前のバックアップから10分以上あいたときだけ
const SAVE_LOG_MAX = 300;               // 残す保存の記録の数
const GAS_VERSION = 2;
const ADMIN_PASSWORD = '****'; // ★ 今のコードの値をそのまま書き写す（js/config.js の ADMIN_PASSWORD と同じ）

// ユーザーごとに保存する記録の種類
//   名前が「Records」で終わり、中身がオブジェクトのものはすべて保存・返却する
//   （clearRecords・scoreRecords・memoRecords・historyRecords・pokkuraRecords・goalRecords など）。
//   アプリに記録の種類を足しても、このコードを直す必要はない
const BASE_RECORD_TYPES = ['clearRecords', 'scoreRecords', 'memoRecords', 'historyRecords'];

function isRecordType(key) {
  return typeof key === 'string' && /^[A-Za-z0-9_]{1,40}Records$/.test(key);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// obj の中で、記録の種類にあたるキーの一覧（基本の4つは必ず含める）
function recordTypesOf(obj) {
  const types = BASE_RECORD_TYPES.slice();
  if (isPlainObject(obj)) {
    Object.keys(obj).forEach(function (k) {
      if (isRecordType(k) && types.indexOf(k) === -1) types.push(k);
    });
  }
  return types;
}

function getOrCreateFolder(name) {
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function getOrCreateBannerFolder() {
  return getOrCreateFolder(BANNER_FOLDER_NAME);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function errorResponse(msg, extra) {
  const obj = { status: 'error', message: msg, gasVersion: GAS_VERSION };
  if (extra) Object.keys(extra).forEach(function (k) { obj[k] = extra[k]; });
  return jsonResponse(obj);
}

// データファイルを取得（2回目以降はIDで直接開くので速い）
function getDataFile() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('DATA_FILE_ID');
  if (id) {
    try {
      const f = DriveApp.getFileById(id);
      if (!f.isTrashed()) return f;
    } catch (err) {}
  }
  const files = DriveApp.getFilesByName(FILENAME);
  if (files.hasNext()) {
    const f = files.next();
    props.setProperty('DATA_FILE_ID', f.getId());
    return f;
  }
  return null;
}

// データの版番号（保存のたびに変わる）
function getVersion() {
  return PropertiesService.getScriptProperties().getProperty('DATA_VERSION') || '0';
}

// 曲の見分け（アプリと同じ：ジャンル_曲名_ノーツ数。id があればそれ）
function songIdOf(s) {
  if (!s) return '';
  return s.id || (String(s.genre) + '_' + String(s.title) + '_' + String(s.notes));
}

function countBanners(songs) {
  return (songs || []).filter(function (s) { return s && s.bannerUrl; }).length;
}

// ---------- バックアップ ----------
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function stamp(d) {
  return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '_' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
}

// 今のデータ（文字列）をバックアップする。daily：その日の最初の保存のとき、full：丸ごと書く前（10分あけて）
function backupIfNeeded(rawText, kind) {
  if (!rawText) return;
  const props = PropertiesService.getScriptProperties();
  const now = new Date();
  const today = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const last = Number(props.getProperty('LAST_BACKUP_AT') || '0');
  const lastDay = props.getProperty('LAST_BACKUP_DAY') || '';
  let reason = '';
  if (lastDay !== today) reason = 'daily';
  else if (kind === 'full' && now.getTime() - last >= BACKUP_MIN_INTERVAL_MS) reason = 'full';
  if (!reason) return;
  const folder = getOrCreateFolder(BACKUP_FOLDER_NAME);
  folder.createFile('popn_backup_' + stamp(now) + '_' + reason + '.json', rawText, MimeType.PLAIN_TEXT);
  props.setProperty('LAST_BACKUP_AT', String(now.getTime()));
  props.setProperty('LAST_BACKUP_DAY', today);
  // 古いものを消す（新しい BACKUP_KEEP 個を残す）
  const list = [];
  const it = folder.getFiles();
  while (it.hasNext()) { const f = it.next(); list.push({ f: f, t: f.getDateCreated().getTime() }); }
  list.sort(function (a, b) { return b.t - a.t; });
  list.slice(BACKUP_KEEP).forEach(function (x) { x.f.setTrashed(true); });
}

function listBackups() {
  const folder = getOrCreateFolder(BACKUP_FOLDER_NAME);
  const list = [];
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    list.push({ id: f.getId(), name: f.getName(), t: f.getDateCreated().getTime(), size: f.getSize() });
  }
  list.sort(function (a, b) { return b.t - a.t; });
  return list;
}

// バックアップの中身（popn_backups の中のファイルだけ）
function readBackup(id) {
  const folder = getOrCreateFolder(BACKUP_FOLDER_NAME);
  const f = DriveApp.getFileById(id);
  const parents = f.getParents();
  let ok = false;
  while (parents.hasNext()) { if (parents.next().getId() === folder.getId()) ok = true; }
  if (!ok) throw new Error('バックアップではありません');
  return JSON.parse(f.getBlob().getDataAsString());
}

// 記録だけを返す形にそろえる（返すときに使う）
function sanitizeUsers(users) {
  const out = {};
  for (let user in (users || {})) {
    out[user] = {};
    recordTypesOf(users[user]).forEach(function (type) {
      const v = users[user][type];
      out[user][type] = isPlainObject(v) ? v : {};
    });
  }
  return out;
}

function doGet(e) {
  const version = getVersion();
  const mode = e && e.parameter ? e.parameter.mode : '';

  // ★ 軽い確認用：版番号だけ返す
  if (mode === 'version') {
    return jsonResponse({ version: version, gasVersion: GAS_VERSION });
  }
  // バックアップの一覧
  if (mode === 'backups') {
    try { return jsonResponse({ status: 'success', gasVersion: GAS_VERSION, backups: listBackups() }); }
    catch (err) { return errorResponse('バックアップの一覧を読めません: ' + err.message); }
  }
  // バックアップの中身
  if (mode === 'backup') {
    try {
      const data = readBackup(String(e.parameter.id || ''));
      return jsonResponse({ status: 'success', gasVersion: GAS_VERSION, songs: data.songs || [], users: sanitizeUsers(data.users) });
    } catch (err) { return errorResponse('バックアップを読めません: ' + err.message); }
  }

  let data = { songs: [], users: {} };
  const file = getDataFile();
  if (file) {
    data = JSON.parse(file.getBlob().getDataAsString());
  }
  // 保存の記録
  if (mode === 'log') {
    return jsonResponse({ status: 'success', gasVersion: GAS_VERSION, log: (data.meta && data.meta.saveLog) || [] });
  }

  return jsonResponse({
    version: version,
    gasVersion: GAS_VERSION,
    songs: data.songs || [],
    users: sanitizeUsers(data.users)
  });
}

function doPost(e) {
  let contents;
  try {
    contents = JSON.parse(e.postData.contents);
  } catch (err) {
    return errorResponse('データ形式が不正です');
  }

  // バナー画像のアップロード（曲リストのJSONとは別経路）
  if (contents.type === "uploadBanner") {
    return handleBannerUpload(contents);
  }

  const type = contents.type;
  const user = contents.targetUser;
  const isPatch = type === "patchRecords";
  const isSongs = type === "updateSongs" || type === "patchSongs";

  if (isSongs) {
    if (contents.password !== ADMIN_PASSWORD) return errorResponse('管理者パスワードが違います');
    if (type === "updateSongs" && !Array.isArray(contents.songs)) return errorResponse('楽曲データが不正です');
    if (type === "patchSongs" && !isPlainObject(contents.patch)) return errorResponse('楽曲データが不正です');
  } else if (!user) {
    return errorResponse('ユーザー名がありません');
  } else if (!isPatch && !contents.force) {
    // 記録の丸ごと上書き（古い版のアプリの「保存」ボタン）は止める
    return errorResponse('古い版のアプリです。ページを読み込み直してから、もう一度保存してください（記録は自動で保存されます）', { blocked: true });
  }

  // 同時保存でデータが消えないよう、順番待ちにする
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (err) {
    return errorResponse('サーバーが混み合っています。もう一度お試しください');
  }

  try {
    const props = PropertiesService.getScriptProperties();
    const targetFile = getDataFile();
    let rawText = '';
    let masterData = { songs: [], users: {} };
    if (targetFile) {
      rawText = targetFile.getBlob().getDataAsString();
      masterData = JSON.parse(rawText);
    }
    if (!masterData.users) masterData.users = {};
    if (!Array.isArray(masterData.songs)) masterData.songs = [];
    const logDetail = {};

    if (type === "updateSongs") {
      // A. 楽曲リスト全体の置き換え（バックアップからの復元）。曲の数・バナーが大きく減るときは force のときだけ
      const cur = masterData.songs, next = contents.songs;
      if (!contents.force && cur.length > 20 && next.length < cur.length * 0.9) {
        return errorResponse('曲の数が大きく減るので、保存を止めました（' + cur.length + ' → ' + next.length + '曲）', { blocked: true });
      }
      if (!contents.force && countBanners(next) < countBanners(cur) - 5) {
        return errorResponse('バナーがたくさん消えるので、保存を止めました', { blocked: true });
      }
      backupIfNeeded(rawText, 'full');
      masterData.songs = next;
      logDetail.songs = next.length;
    } else if (type === "patchSongs") {
      // A2. ★ 楽曲リストの変わった所だけ：{ set: { 曲ID: { 項目: 値（null は消す） } }, add: [曲], remove: [曲ID] }
      const patch = contents.patch;
      const set = isPlainObject(patch.set) ? patch.set : {};
      const add = Array.isArray(patch.add) ? patch.add : [];
      const remove = Array.isArray(patch.remove) ? patch.remove : [];
      if (!contents.force && remove.length > 5) {
        return errorResponse('一度にたくさんの曲を消すので、保存を止めました（' + remove.length + '曲）', { blocked: true });
      }
      let clearedBanners = 0;
      const index = {};
      masterData.songs.forEach(function (s, i) { index[songIdOf(s)] = i; });
      Object.keys(set).forEach(function (id) {
        const i = index[id];
        if (i === undefined || !isPlainObject(set[id])) return;
        if (masterData.songs[i].bannerUrl && set[id].bannerUrl !== undefined && !set[id].bannerUrl) clearedBanners++;
      });
      if (!contents.force && clearedBanners > 3) {
        return errorResponse('バナーがたくさん消えるので、保存を止めました（' + clearedBanners + '曲）', { blocked: true });
      }
      backupIfNeeded(rawText, remove.length > 0 ? 'full' : 'daily');
      Object.keys(set).forEach(function (id) {
        const i = index[id];
        if (i === undefined || !isPlainObject(set[id])) return;
        const fields = set[id];
        Object.keys(fields).forEach(function (k) {
          if (fields[k] === null) delete masterData.songs[i][k];
          else masterData.songs[i][k] = fields[k];
        });
      });
      add.forEach(function (s) {
        if (!isPlainObject(s)) return;
        const id = songIdOf(s);
        if (index[id] !== undefined) masterData.songs[index[id]] = s;
        else { index[id] = masterData.songs.length; masterData.songs.push(s); }
      });
      if (remove.length) {
        const rm = {};
        remove.forEach(function (id) { rm[id] = true; });
        masterData.songs = masterData.songs.filter(function (s) { return !rm[songIdOf(s)]; });
      }
      logDetail.set = Object.keys(set).length; logDetail.add = add.length; logDetail.remove = remove.length;
    } else {
      if (!masterData.users[user]) {
        masterData.users[user] = { clearRecords: {}, scoreRecords: {}, memoRecords: {}, historyRecords: {} };
      }
      const target = masterData.users[user];

      if (isPatch) {
        // B. ★ 変更があった記録だけを反映（null は削除）
        backupIfNeeded(rawText, 'daily');
        const patch = isPlainObject(contents.patch) ? contents.patch : {};
        let n = 0;
        recordTypesOf(patch).forEach(function (type) {
          const p = patch[type];
          if (!isPlainObject(p)) return;
          if (!target[type]) target[type] = {};
          for (const id in p) {
            n++;
            if (p[id] === null) delete target[type][id];
            else target[type][id] = p[id];
          }
        });
        logDetail.records = n;
      } else {
        // C. 個人の記録を丸ごと上書き（force のときだけ：バックアップからの復元など）
        backupIfNeeded(rawText, 'full');
        recordTypesOf(contents).forEach(function (type) {
          if (isPlainObject(contents[type])) target[type] = contents[type];
        });
        logDetail.full = true;
      }
    }

    // 保存の記録（新しい SAVE_LOG_MAX 件）
    if (!masterData.meta) masterData.meta = {};
    const log = Array.isArray(masterData.meta.saveLog) ? masterData.meta.saveLog : [];
    log.push({ t: Date.now(), type: type, user: user || '', app: String(contents.app || ''), device: String(contents.device || '').slice(0, 40), d: logDetail });
    masterData.meta.saveLog = log.slice(-SAVE_LOG_MAX);

    if (targetFile) {
      targetFile.setContent(JSON.stringify(masterData));
    } else {
      const f = DriveApp.createFile(FILENAME, JSON.stringify(masterData), MimeType.PLAIN_TEXT);
      props.setProperty('DATA_FILE_ID', f.getId());
    }

    // 版番号を更新
    const prevVersion = getVersion();
    const newVersion = String(Date.now());
    props.setProperty('DATA_VERSION', newVersion);

    return jsonResponse({ status: 'success', gasVersion: GAS_VERSION, version: newVersion, prevVersion: prevVersion, patched: isPatch, songsPatched: type === "patchSongs" });
  } catch (err) {
    return errorResponse('保存に失敗しました: ' + err.message);
  } finally {
    lock.releaseLock();
  }
}

// Base64画像を受け取ってDriveに保存し、公開URLを返す
function handleBannerUpload(contents) {
  try {
    const dataUrl = contents.imageData || '';
    const matches = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!matches) {
      return errorResponse("画像データの形式が不正です");
    }

    const mimeType = matches[1];
    const rawBase64 = matches[2];
    const decodedBytes = Utilities.base64Decode(rawBase64);

    const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
    const safeName = String(contents.fileName || 'banner').replace(/[^a-zA-Z0-9_\-一-龠ぁ-んァ-ヶ]/g, '_');
    const blob = Utilities.newBlob(decodedBytes, mimeType, safeName + '_' + Date.now() + '.' + ext);

    const folder = getOrCreateBannerFolder();
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const url = 'https://lh3.googleusercontent.com/d/' + file.getId();

    return jsonResponse({ status: 'success', url: url, fileId: file.getId() });
  } catch (err) {
    return errorResponse('画像アップロードに失敗しました: ' + err.message);
  }
}
