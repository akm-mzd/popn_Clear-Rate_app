// gas/Code.gs を Node で動かすための、Google のサービスの代わり（テスト用）
const fs = require('fs');
const vm = require('vm');

function makeGas(codePath, opts = {}) {
  let idSeq = 1;
  const files = new Map();   // id -> { id, name, content, created, trashed, parent }
  const folders = new Map(); // id -> { id, name }
  const props = new Map();
  let clock = opts.now || Date.now();
  const iter = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const fileObj = f => ({
    getId: () => f.id, getName: () => f.name,
    getBlob: () => ({ getDataAsString: () => f.content }),
    setContent: c => { f.content = c; }, isTrashed: () => f.trashed, setTrashed: v => { f.trashed = v; },
    getDateCreated: () => new Date(f.created), getSize: () => Buffer.byteLength(f.content),
    getParents: () => iter(f.parent ? [folderObj(folders.get(f.parent))] : []),
    setSharing: () => {}
  });
  const newFile = (name, content, parent) => { const f = { id: 'f' + (idSeq++), name, content: typeof content === 'string' ? content : content.text, created: clock++, trashed: false, parent }; files.set(f.id, f); return fileObj(f); };
  const folderObj = d => ({
    getId: () => d.id, getName: () => d.name,
    createFile: (a, b) => typeof a === 'string' ? newFile(a, b, d.id) : newFile(a.name, a, d.id),
    getFiles: () => iter([...files.values()].filter(f => f.parent === d.id && !f.trashed).map(fileObj))
  });
  const sandbox = {
    console, JSON, Date, Math, String, Number, Object, Array, Buffer,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.has(k) ? props.get(k) : null, setProperty: (k, v) => props.set(k, String(v)) }) },
    DriveApp: {
      getFileById: id => { const f = files.get(id); if (!f) throw new Error('no file'); return fileObj(f); },
      getFilesByName: n => iter([...files.values()].filter(f => f.name === n && !f.trashed).map(fileObj)),
      getFoldersByName: n => iter([...folders.values()].filter(d => d.name === n).map(folderObj)),
      createFolder: n => { const d = { id: 'd' + (idSeq++), name: n }; folders.set(d.id, d); return folderObj(d); },
      createFile: (n, c) => newFile(n, c, null),
      Access: {}, Permission: {}
    },
    ContentService: { createTextOutput: s => ({ text: s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    MimeType: { PLAIN_TEXT: 'text' },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      formatDate: (d, tz, fmt) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; },
      base64Decode: s => Buffer.from(s, 'base64'), newBlob: (bytes, mime, name) => ({ name, text: '' })
    },
    Session: { getScriptTimeZone: () => 'Asia/Tokyo' }
  };
  let code = fs.readFileSync(codePath, 'utf8').replace("const ADMIN_PASSWORD = '****';", "const ADMIN_PASSWORD = '1005';");
  vm.createContext(sandbox);
  vm.runInContext(code + '\nthis.__doGet = doGet; this.__doPost = doPost;', sandbox);
  return {
    get: (query) => JSON.parse(sandbox.__doGet({ parameter: query }).text),
    post: (body) => JSON.parse(sandbox.__doPost({ postData: { contents: body } }).text),
    seed: (data) => { const f = newFile('popn_multi_user_data.json', JSON.stringify(data), null); props.set('DATA_FILE_ID', f.getId()); props.set('DATA_VERSION', '1'); },
    data: () => JSON.parse(files.get(props.get('DATA_FILE_ID')).content),
    backups: () => [...files.values()].filter(f => f.parent && !f.trashed && folders.get(f.parent).name === 'popn_backups'),
    props
  };
}
module.exports = { makeGas };
