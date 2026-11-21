// ==========================================
// pokkura.js（table.js から分けたもの）
// ポックラ（新・旧の計算・裏メダルと旧筐体EC・おすすめ・画面）と、画面幅が変わったときの描き直し
// ==========================================
// ---------- ポックラ（ポップンクラス） ----------
// 計算は ssdh233/popn-class（ポックラ一覧スクリプト）と同じ式。
//   1曲のポイント = level × (3750 × level + メダルボーナス + (スコア − 50000)) ÷ 3881250 × 60（スコア 50000 未満は 0）
//   ポックラ = （新曲 Lv46〜49 の上位20曲 ＋ 旧曲 Lv48〜50 の上位40曲）のポイント合計 ÷ 60
// ※ 公式は旧曲を「今作のスコア」で数えるが、このアプリには歴代ベストしかないので目安になる
const POKKURA_MEDAL_BONUS = {
    '金星': 21250,
    '銀星': 17500, '銀菱': 17500, '銀丸': 17500,
    '銅星': 12500, '銅菱': 12500, '銅丸': 12500,
    'ロングオフ': 10000,
    'イージー': 6250
};
const POKKURA_NEW_COUNT = 20;
const POKKURA_OLD_COUNT = 40;

const pkFloor = (n, p) => Math.floor(n * 10 ** p) / 10 ** p;
const pkRound = (n, p) => Math.round(n * 10 ** p) / 10 ** p;

function calcPokkuraPoint(level, score, medalKey) {
    const s = parseInt(score, 10);
    if (isNaN(s) || s < 50000) return 0;
    const bonus = POKKURA_MEDAL_BONUS[medalKey] || 0;
    return pkFloor(pkFloor((level * (3750 * level + bonus + (s - 50000))) / 3881250, 8) * 60, 2);
}

// 今作（新曲枠のバージョン）：曲データの中で一番新しいアーケードのバージョン（CS 系・未入力は除く）
//   今は HC。次のバージョンの曲を入れると、自動でそちらになる
function getPokkuraNewVersion() {
    let best = null;
    songs.forEach(s => {
        const v = getVersionSortValue(s.version);
        if (v >= VERSION_ORDER_CS) return;
        if (!best || v > best.value) best = { value: v, label: String(s.version).trim() };
    });
    return best || { value: VERSION_ORDER_HC, label: 'HC' };
}

// ポックラで使うレベル。難易度が変わってもポックラは前のレベルのまま、という曲だけ
//   曲データに pokkuraLevel が入っている（Lv と同じなら入れない）
function getPokkuraLevel(song) {
    return song.pokkuraLevel || song.level;
}

// 新曲（今作）は Lv49 まで（アプリにあるのは Lv46 以上）、旧曲は Lv48〜50 が対象
function getPokkuraGroup(song, newVersionValue) {
    const lv = parseInt(getPokkuraLevel(song), 10);
    if (getVersionSortValue(song.version) === newVersionValue && lv <= 49) return 'new';
    return (lv >= 48 && lv <= 50) ? 'old' : null;
}

// ---------- 旧ポックラ（Jam&Fizz までの計算。ssdh233/popn-class の index.js と同じ式） ----------
//   1曲 = (10000×Lv + スコア − 50000 + メダルボーナス) ÷ 5440（スコア 50000 未満は 0）
//   旧ポックラ = Lv48〜50 の全曲（歴代ベスト）の上位50曲の平均
const OLD_POKKURA_MEDAL_BONUS = {
    '金星': 5000, '銀星': 5000, '銀菱': 5000, '銀丸': 5000,
    '銅星': 3000, '銅菱': 3000, '銅丸': 3000,
    'イージー': 3000, 'ロングオフ': 3000
};
const OLD_POKKURA_COUNT = 50;

function calcOldPokkuraPoint(level, score, medalKey) {
    const s = parseInt(score, 10);
    if (isNaN(s) || s < 50000) return 0;
    return pkFloor(pkRound((10000 * level + s - 50000 + (OLD_POKKURA_MEDAL_BONUS[medalKey] || 0)) / 5440, 8), 2);
}

function calcOldPokkura() {
    const entries = [];
    songs.forEach(song => {
        const lv = parseInt(song.level, 10);
        if (!(lv >= 48 && lv <= 50)) return;
        const medal = clearRecords[song.id] || '';
        const point = calcOldPokkuraPoint(lv, scoreRecords[song.id], medal);
        if (point > 0) entries.push({ song, lv, score: parseInt(scoreRecords[song.id], 10), medal, point });
    });
    entries.sort((a, b) => b.point - a.point);
    const top = entries.slice(0, OLD_POKKURA_COUNT).map(e => e.point);
    const sum = top.reduce((acc, p) => acc + p, 0);
    const raw = pkRound(sum / OLD_POKKURA_COUNT, 8);
    // 次の 0.01 まであと何点（旧ポックラはスコアに Lv が掛からないので、どの曲でも 1点で 1 ÷ 5440 ÷ 50 上がる。
    //   ssdh233/popn-class のブックマークレットと同じ計算）
    const next = (Math.floor(raw * 100 + 1e-9) + 1) / 100;
    const toNext = Math.ceil((next - raw) * 5440 * OLD_POKKURA_COUNT);
    return { total: pkFloor(raw, 2), count: top.length, raw, next, toNext, per001: 5440 * OLD_POKKURA_COUNT / 100, entries };
}

// ---------- イージーの曲の裏メダルと旧筐体EC ----------
//   pokkuraFlagRecords: { 曲ID: { vm: 裏メダル（'黒星' | '黒菱' | '黒丸'）, old: 旧筐体EC } }（ユーザーごと・クラウドに保存）
//   どのイージーの曲にも裏メダルを付けられる。ポックラで裏メダルを使うのは、旧筐体EC（旧筐体でつけたイージー）の曲だけ。
//   ver 3.8.0.0 の { vm } だけの記録は、旧筐体EC として読む
const POKKURA_OLD_EASY_CHOICES = ['イージー', '黒星', '黒菱', '黒丸'];

function getPokkuraFlagRecords(user = currentUser) {
    if (!allUsersData[user]) allUsersData[user] = emptyUser();
    if (!allUsersData[user].pokkuraFlagRecords) allUsersData[user].pokkuraFlagRecords = {};
    return allUsersData[user].pokkuraFlagRecords;
}

const URA_MEDALS = ['黒星', '黒菱', '黒丸'];

// { ura: 裏メダル（なければ ''）, old: 旧筐体EC }
function getUraMedalInfo(songId) {
    const f = getPokkuraFlagRecords()[songId];
    const ura = f && URA_MEDALS.includes(f.vm) ? f.vm : '';
    return { ura, old: !!ura && (f.old === undefined ? true : !!f.old) };
}

function setUraMedalInfo(songId, ura, old) {
    const flags = getPokkuraFlagRecords();
    if (!URA_MEDALS.includes(ura)) ura = '';
    if (!ura) delete flags[songId];
    else flags[songId] = { vm: ura, old: !!old };
    scheduleAutoSave();
    renderTable();
}

// ポックラで使うメダル（旧筐体EC で裏メダルがあれば裏メダル、なければイージー）
function getPokkuraOldEasyMedal(songId) {
    const info = getUraMedalInfo(songId);
    return info.old ? info.ura : 'イージー';
}

// ポックラ画面のプルダウン：黒を選ぶと裏メダル＋旧筐体EC、イージーを選ぶと旧筐体EC だけ外す（裏メダルは残す）
function setPokkuraOldEasyMedal(songId, medal) {
    if (!POKKURA_OLD_EASY_CHOICES.includes(medal)) return;
    if (medal === 'イージー') setUraMedalInfo(songId, getUraMedalInfo(songId).ura, false);
    else setUraMedalInfo(songId, medal, true);
}

function calcPokkura() {
    const entries = { new: [], old: [] };
    const newVersion = getPokkuraNewVersion();
    // 旧曲は、公式データ取り込みで保存した「今作のスコア」があればそれで数える（なければ歴代ベスト）
    const version = loadPokkuraVersionRecords(currentUser);
    songs.forEach(song => {
        const group = getPokkuraGroup(song, newVersion.value);
        if (!group) return;
        const vr = group === 'old' && version ? version.records[song.id] : null;
        const score = vr ? vr.s : scoreRecords[song.id];
        let medal = vr ? vr.m : (clearRecords[song.id] || '');
        // 歴代のイージーで計算する曲（今作スコアを読んだ旧曲で今作のメダルが黒星と推測された曲・今作スコアを読んでいない旧曲・新曲）は、
        //   旧筐体EC なら裏メダル（黒）、そうでなければイージーで数える
        const easySelectable = clearRecords[song.id] === 'イージー' && (!vr || vr.m === '黒星');
        if (easySelectable) medal = getPokkuraOldEasyMedal(song.id);
        const point = calcPokkuraPoint(parseInt(getPokkuraLevel(song), 10), score, medal);
        if (point > 0) entries[group].push({ song, point, score: parseInt(score, 10) || 0, isVersion: !!vr, easySelectable, calcMedal: medal });
    });
    // Lv45 以下の今作の新曲（公式データ取り込みで保存したもの。アプリには曲として入っていない）
    const extraNew = version ? version.extraNew : [];
    extraNew.forEach((c, i) => {
        const point = calcPokkuraPoint(c.l, c.s, c.m);
        if (point > 0) entries.new.push({ extra: { title: c.t, genre: c.g, level: String(c.l), medal: c.m, order: 100000 + i }, point, score: c.s });
    });
    const orderOf = e => e.song ? e.song.originalOrder : e.extra.order;
    const byPoint = (a, b) => (b.point - a.point) || (orderOf(a) - orderOf(b));
    entries.new.sort(byPoint);
    entries.old.sort(byPoint);
    const sum = list => list.reduce((acc, e) => acc + e.point, 0);
    const topNew = entries.new.slice(0, POKKURA_NEW_COUNT);
    const topOld = entries.old.slice(0, POKKURA_OLD_COUNT);
    return {
        version,
        newVersionLabel: newVersion.label,
        extraCount: extraNew.length,
        topNew, topOld,
        restNew: entries.new.slice(POKKURA_NEW_COUNT),
        restOld: entries.old.slice(POKKURA_OLD_COUNT),
        newPoint: pkFloor(pkRound(sum(topNew), 8) / 60, 2),
        oldPoint: pkFloor(pkRound(sum(topOld), 8) / 60, 2),
        total: pkFloor(pkRound(sum(topNew) + sum(topOld), 8) / 60, 2),
        // 切り捨てる前の計算値（次の 0.01 まであと何点かを出すのに使う）
        rawTotal: pkRound(sum(topNew) + sum(topOld), 8) / 60
    };
}

// ---------- ポックラを上げるおすすめ ----------
//   曲ごとに「メダルを1段上げる」「スコアを +1000 点ずつ上げる」「未プレイの曲をクリア」の案を作り、
//   やりやすさ（上がり幅 ÷ 大変さ）の一番よい案を1つ残す。大変さ = 種類の重み × 難しさ（Lv・難易度） × タグ（相性）
const POKKURA_REC_COUNT = 20;
const POKKURA_REC_AFFINITY = { '得意': 0.7, '噛み合い待ち': 1.3, '苦手': 1.5, '敵': 2, '💩': 2 };

// スコアを from から to に上げる大変さ（1000点ごとに 1、98000点より上は 2 倍）
function pokkuraScoreEffort(from, to) {
    const low = Math.max(0, Math.min(to, 98000) - from);
    const high = Math.max(0, to - Math.max(from, 98000));
    return (low + high * 2) / 1000;
}

function calcPokkuraRecommendations(pk) {
    const groups = {
        new: { top: pk.topNew, count: POKKURA_NEW_COUNT },
        old: { top: pk.topOld, count: POKKURA_OLD_COUNT }
    };
    Object.values(groups).forEach(g => {
        g.sum = g.top.reduce((acc, e) => acc + e.point, 0);
        g.cutoff = g.top.length >= g.count ? g.top[g.top.length - 1].point : 0;
    });
    const totalOf = (newSum, oldSum) => pkFloor(pkRound(newSum + oldSum, 8) / 60, 2);
    // その曲のポイントが newPoint になったときの上がり幅
    const gainOf = (groupKey, entry, newPoint) => {
        const g = groups[groupKey];
        let sum = g.sum;
        if (entry && g.top.includes(entry)) sum += Math.max(newPoint, entry.point) - entry.point;
        else if (g.top.length < g.count) sum += newPoint;
        else if (newPoint > g.cutoff) sum += newPoint - g.cutoff;
        const total = groupKey === 'new' ? totalOf(sum, groups.old.sum) : totalOf(groups.new.sum, sum);
        return pkRound(total - pk.total, 2);
    };

    const entryOf = {};
    [...pk.topNew, ...pk.restNew, ...pk.topOld, ...pk.restOld].forEach(e => { if (e.song) entryOf[e.song.id] = e; });
    const newVersion = getPokkuraNewVersion();
    const recs = [];
    songs.forEach(song => {
        if (clearRecords[song.id] === '未解禁') return;
        const groupKey = getPokkuraGroup(song, newVersion.value);
        if (!groupKey) return;
        const lv = parseInt(getPokkuraLevel(song), 10);
        const diff = getDiffSortValue(song);
        const memo = memoRecords[song.id] || {};
        // タグの重み（付いているタグの分を掛け合わせる。新しく作ったタグは 1）
        const tagWeight = getMemoTags(memo).reduce((w, t) => w * (POKKURA_REC_AFFINITY[t] || 1), 1);
        const hardness = Math.pow(2, (lv - 48) + (diff === -999 ? 0 : diff) * 0.5) * tagWeight;
        const entry = entryOf[song.id] || null;
        const options = [];
        const add = (kind, gain, effort, extra) => {
            if (gain >= 0.01) options.push({ kind, gain, ease: gain / (effort * hardness), ...extra });
        };
        if (entry) {
            const score = entry.score;
            const medal = entry.calcMedal || '';
            // メダルを1段上げる（スコアはそのまま）。あと少しで届く曲だけ：
            //   黒星・裏メダルが黒星のイージー → クリア、銅星 → フルコンボ
            let target = null;
            let from = medal;
            const uraKuroboshi = medal === 'イージー' && getUraMedalInfo(song.id).ura === '黒星';
            if (medal === '黒星' || uraKuroboshi) {
                target = { medal: '銅星', label: 'クリア', effort: 5, score };
                if (uraKuroboshi) from = '黒星';
            } else if (medal === '銅星') {
                target = { medal: '銀星', label: 'フルコンボ', effort: 5 + Math.max(0, 95000 - score) / 2000, score };
            }
            if (target) add('medal', gainOf(groupKey, entry, calcPokkuraPoint(lv, target.score, target.medal)), target.effort, { target, from, ura: uraKuroboshi });
            // スコアを +1000 点ずつ、0.01 以上上がるところまで
            for (let to = score + 1000; score < 100000; to += 1000) {
                const s = Math.min(to, 100000);
                const gain = gainOf(groupKey, entry, calcPokkuraPoint(lv, s, medal));
                if (gain >= 0.01) { add('score', gain, pokkuraScoreEffort(score, s), { from: score, to: s }); break; }
                if (s >= 100000) break;
            }
        } else {
            // 未プレイ（ポイントなし）：クリアで 0.01 以上上がる一番低い点数（1000点刻み）
            for (let s = 50000; s <= 100000; s += 1000) {
                const gain = gainOf(groupKey, null, calcPokkuraPoint(lv, s, '銅星'));
                if (gain >= 0.01) { add('new', gain, 3 + pokkuraScoreEffort(80000, Math.max(s, 80000)), { to: s }); break; }
            }
        }
        if (options.length === 0) return;
        options.sort((a, b) => b.ease - a.ease);
        recs.push({ song, group: groupKey, entry, ...options[0] });
    });
    recs.sort((a, b) => (b.ease - a.ease) || (b.gain - a.gain) || (a.song.originalOrder - b.song.originalOrder));
    return recs.slice(0, POKKURA_REC_COUNT);
}

function buildPokkuraRecHtml(pk) {
    const recs = calcPokkuraRecommendations(pk);
    if (recs.length === 0) return '<div class="dg-empty">おすすめの曲はありません</div>';
    const fmt = n => Number(n).toLocaleString('ja-JP');
    const rows = recs.map((r, i) => {
        const song = r.song;
        const safeId = jsStringAttr(song.id);
        const bannerSrc = safeUrl(song.bannerUrl, true);
        const bannerInner = bannerSrc
            ? `<img src="${escapeHtml(bannerSrc)}" alt="${escapeHtml(song.title)}" loading="lazy">`
            : `<span class="pk-rec-title">${escapeHtml(song.title)}</span>`;
        let action;
        if (r.kind === 'medal') {
            action = `<button type="button" class="pk-rec-action" onclick="openMedalModal('${safeId}')" title="メダルを変更">
                ${r.ura ? '<span class="pk-rec-sub">裏</span>' : ''}<span class="pk-rec-medal">${buildGridMedalInner(r.from)}</span>→<span class="pk-rec-medal">${buildGridMedalInner(r.target.medal)}</span>
                <b>${r.target.label}</b></button>`;
        } else if (r.kind === 'score') {
            action = `<button type="button" class="pk-rec-action" onclick="openScoreModal('${safeId}')" title="スコアを変更">
                スコア ${fmt(r.from)} → <b>${fmt(r.to)}</b><span class="pk-rec-sub">（+${fmt(r.to - r.from)}）</span></button>`;
        } else {
            action = `<button type="button" class="pk-rec-action" onclick="openMedalModal('${safeId}')" title="メダルを変更">
                <span class="pk-rec-medal">${buildGridMedalInner('銅星')}</span><b>クリア</b>＋<b>${fmt(r.to)}</b>点</button>`;
        }
        const pkLevel = getPokkuraLevel(song);
        return `
            <div class="pk-rec-row">
                <span class="pk-rec-rank">${i + 1}</span>
                <a class="pk-rec-banner" data-sid="${escapeHtml(song.id)}" href="${escapeHtml(getWikiUrl(song))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(song.title)}（攻略wikiを開く）">${bannerInner}</a>
                <div class="pk-rec-body">
                    <div class="pk-rec-meta"><span class="pk-rec-group pk-rec-group-${r.group}">${r.group === 'new' ? '新曲' : '旧曲'}</span>Lv${escapeHtml(pkLevel)}${song.diffClass ? ` ${escapeHtml(song.diffClass)}` : ''}</div>
                    ${action}
                </div>
                <span class="pk-rec-gain">+${r.gain.toFixed(2)}</span>
            </div>`;
    }).join('');
    return `<div class="pk-rec-list">${rows}</div>`;
}

function formatPokkuraDate(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 旧ポックラの画面で、上位50曲の下に薄く出す曲の数
const OLD_POKKURA_LIST_EXTRA = 10;

// ポックラ画面のタブ（'top' = 対象曲 / 'rest' = 圏外 / 'up' = おすすめ）。描き直しても選んだタブのまま
const POKKURA_TABS = ['top', 'rest', 'up'];
let pokkuraTab = 'top';

// 次の 0.01 まで、対象曲のスコアをあと何点（合計）伸ばせばよいか（レベルごと）。
//   対象曲のスコアを 1点上げると、ポックラは Lv ÷ 3881250 上がる（曲ごとの切り捨てがあるので目安）
const POKKURA_PER_POINT_DIV = 3881250;
const POKKURA_HINT_LEVELS = [50, 49, 48, 47, 46];

//   レベルをまとめた目安は、今の対象曲の平均レベルで出す（レベルによる差は Lv48 と Lv50 で 4% ほど）
function getPokkuraPointsToNext(pk) {
    const next = (Math.floor(pk.rawTotal * 100 + 1e-9) + 1) / 100;
    const gap = Math.max(0, next - pk.rawTotal);
    const lvOf = e => e.song ? parseInt(getPokkuraLevel(e.song), 10) : parseInt(e.extra.level, 10);
    const target = pk.topNew.concat(pk.topOld).map(lvOf).filter(lv => lv > 0);
    const avgLv = target.length > 0 ? target.reduce((a, b) => a + b, 0) / target.length : 49;
    return {
        next, avgLv,
        points: Math.ceil(gap * POKKURA_PER_POINT_DIV / avgLv),
        per001: Math.ceil(0.01 * POKKURA_PER_POINT_DIV / avgLv),
        levels: POKKURA_HINT_LEVELS.map(lv => ({ lv, points: Math.ceil(gap * POKKURA_PER_POINT_DIV / lv) }))
    };
}

// ポックラの計算のしかた（ポックラ画面のいちばん下）
function buildPokkuraExplainHtml(pk) {
    const oldPk = calcOldPokkura();
    const bonus = (k) => POKKURA_MEDAL_BONUS[k].toLocaleString('ja-JP');
    const toNext = getPokkuraPointsToNext(pk);
    const rows = POKKURA_HINT_LEVELS.map((lv, i) => `<tr><th>Lv${lv}</th><td>約${toNext.levels[i].points.toLocaleString('ja-JP')}点</td><td>約${Math.ceil(0.01 * POKKURA_PER_POINT_DIV / lv).toLocaleString('ja-JP')}点</td></tr>`).join('');
    return `
        <details class="pk-explain">
            <summary>ポックラの計算のしかた</summary>
            <div class="pk-explain-body">
                <h4>1曲のポイント</h4>
                <p class="pk-formula">Lv × ( 3750 × Lv ＋ メダルボーナス ＋ ( スコア − 50000 ) ) ÷ 3881250 × 60</p>
                <ul>
                    <li>小数第2位で切り捨て。スコアが 50000 未満の曲は 0。</li>
                    <li>メダルボーナス：金星 ${bonus('金星')}／銀 ${bonus('銀星')}／銅 ${bonus('銅星')}／ロングオフ ${bonus('ロングオフ')}／イージー ${bonus('イージー')}／黒・未クリア 0</li>
                    <li>画面の各曲の右下の数（例 0.712）は、このポイント ÷ 60 ＝ その曲がポックラに足している量。</li>
                </ul>
                <h4>ポックラ</h4>
                <p class="pk-formula">（新曲の上位${POKKURA_NEW_COUNT}曲 ＋ 旧曲の上位${POKKURA_OLD_COUNT}曲 のポイントの合計）÷ 60</p>
                <ul>
                    <li>小数第2位で切り捨て。</li>
                    <li>新曲：今作（${escapeHtml(pk.newVersionLabel)}）の Lv49 以下。旧曲：それより前の Lv48〜50。</li>
                    <li>旧曲は、公式データ取り込みで読んだ「今作のスコア」で数える（読んでいなければ歴代ベスト）。</li>
                    <li>アプリの計算値は、公式の値と少しずれることがある。</li>
                </ul>
                <h4>上げるには</h4>
                <p class="pk-explain-big">+0.01まで：対象曲の合計で <b>約${toNext.points.toLocaleString('ja-JP')}点</b>（その後は 0.01 ごとに 約${toNext.per001.toLocaleString('ja-JP')}点）</p>
                <p class="pk-explain-note">今の対象曲の平均レベル ${toNext.avgLv.toFixed(1)} で計算した目安です（計算値 ${pk.rawTotal.toFixed(4)} から）。1点の重みはレベルで少し違うので、レベルごとの数は下の表のとおりです。</p>
                <table class="pk-explain-table">
                    <thead><tr><th>伸ばす曲</th><th>+0.01まで</th><th>0.01 ごと</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                <ul>
                    <li>対象曲のスコアを 1点上げると、ポックラは Lv ÷ 3881250 上がる（0.01 ごと ＝ 38812.5 ÷ Lv 点）。</li>
                    <li>いろいろなレベルの曲で伸ばすときは、それぞれのレベルの割合で足し合わせる（例：Lv50 で 400点 ＋ Lv49 で 400点 ≒ 0.01）。</li>
                    <li>メダルが上がると、ボーナスの差の分だけスコアが上がったのと同じ（例：銅→銀で ＋5000点分、Lv49 なら約 ＋0.06）。</li>
                    <li>圏外の曲は、上がったポイントが対象の一番下の曲を超えたときだけ、その差の分だけ上がる。</li>
                </ul>
                <h4>旧ポックラ（Jam&amp;Fizz までの計算）</h4>
                <p class="pk-formula">1曲 ＝ ( 10000 × Lv ＋ スコア − 50000 ＋ ボーナス ) ÷ 5440</p>
                <ul>
                    <li>ボーナス：金・銀 5000／銅・イージー・ロングオフ 3000。Lv48〜50 の歴代ベスト上位${OLD_POKKURA_COUNT}曲の平均。</li>
                    <li>スコアに Lv が掛からないので、どの曲でも 1点で 1 ÷ 5440 ÷ ${OLD_POKKURA_COUNT} 上がる。0.01 ごとに対象曲の合計で ${(5440 * OLD_POKKURA_COUNT / 100).toLocaleString('ja-JP')}点。${oldPk.count > 0 ? `今は +0.01まで：約${oldPk.toNext.toLocaleString('ja-JP')}点。` : ''}</li>
                </ul>
            </div>
        </details>`;
}

// ポックラの表の1行（新曲・旧曲・旧ポックラ）。pointText：ポイントの出し方（旧ポックラは1曲の点をそのまま出す）
function buildPokkuraSectionHtml(label, sub, color, list, COLS, pointText) {
    if (list.length === 0) return '';
    // ポイントの高い順に、表の向き（最初は左上が1位）に合わせて並べる
    const ordered = orderForDirection(list, COLS, getGridDirection('pokkura'));
    let cells = '';
    ordered.forEach(({ song, extra, point, score, isVersion, easySelectable, calcMedal }) => {
        const pointHtml = `<span class="pk-point" title="ポイント ${point.toFixed(2)}">${pointText ? pointText(point) : pkFloor(point / 60, 3).toFixed(3)}</span>`;
        if (extra) {
            // Lv45 以下の新曲：アプリの曲ではないので、バナーなし・変更なし（表示だけ）
            cells += `
            <div class="dg-cell">
                <span class="dg-medal pk-medal-static${extra.medal ? '' : ' dg-medal-empty'}">${buildGridMedalInner(extra.medal)}</span>
                <div class="dg-banner-wrap">
                    <div class="dg-banner pk-extra" title="${escapeHtml(extra.title)}（Lv${escapeHtml(extra.level)}）"><span class="pk-extra-title">${escapeHtml(extra.title)}</span><span class="pk-extra-genre">${escapeHtml(extra.genre)}</span></div>
                    <span class="pk-lv">${escapeHtml(extra.level)}</span>
                    <span class="dg-score pk-score">${score}</span>
                    ${pointHtml}
                </div>
            </div>`;
            return;
        }
        // 歴代イージー・今作黒星の曲は、計算に使っているメダル（イージー／選んだ黒）を出す
        const medalKey = easySelectable ? calcMedal : (clearRecords[song.id] || '');
        const medalTitle = easySelectable ? `ポックラは${calcMedal}として計算（押すと歴代メダルを変更）` : 'メダルを変更';
        const medalClass = medalKey === '' ? ' dg-medal-empty' : '';
        const bannerSrc = safeUrl(song.bannerUrl, true);
        const bannerInner = bannerSrc
            ? `<img src="${escapeHtml(bannerSrc)}" alt="${escapeHtml(song.title)}" loading="lazy">`
            : `<span class="dg-banner-text">${escapeHtml(song.title)}</span>`;
        const safeId = jsStringAttr(song.id);
        const easySelectHtml = easySelectable
            ? `<select class="pk-oldeasy${calcMedal !== 'イージー' ? ' is-black' : ''}" onchange="setPokkuraOldEasyMedal('${safeId}', this.value)" aria-label="${escapeHtml(song.title)}のポックラでのメダル" title="イージーの曲です。旧筐体でつけたイージー（旧筐体EC）なら、黒（星・菱・丸）を選ぶとポックラはそのメダルで計算します">${POKKURA_OLD_EASY_CHOICES.map(m => `<option value="${m}"${m === calcMedal ? ' selected' : ''}>${m}</option>`).join('')}</select>`
            : '';
        // ポックラ反映時のレベルが Lv と違う曲は、印を付けて両方を見せる
        const pkLevel = getPokkuraLevel(song);
        const lvHtml = pkLevel !== song.level
            ? `<span class="pk-lv pk-lv-custom" title="ポックラはLv${escapeHtml(pkLevel)}で計算（今のLvは${escapeHtml(song.level)}）">${escapeHtml(pkLevel)}</span>`
            : `<span class="pk-lv">${escapeHtml(song.level)}</span>`;
        cells += `
            <div class="dg-cell">
                <button type="button" class="dg-medal${medalClass}" onclick="openMedalModal('${safeId}')" title="${escapeHtml(medalTitle)}">${buildGridMedalInner(medalKey)}${buildUraBadgeHtml(song.id, medalKey)}${buildOldMedalBadgeHtml(song.id, medalKey)}</button>
                <div class="dg-banner-wrap">
                    <a class="dg-banner" data-sid="${escapeHtml(song.id)}" href="${escapeHtml(getWikiUrl(song))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(song.title)}（Lv${escapeHtml(song.level)}・攻略wikiを開く）">${bannerInner}${buildMemoMarkHtml(song.id)}</a>
                    ${lvHtml}
                    ${easySelectHtml}
                    <button type="button" class="dg-score pk-score${isVersion ? ' pk-score-version' : ''}" onclick="openScoreModal('${safeId}')" title="${isVersion ? `今作のスコア（歴代ベスト ${escapeHtml(scoreRecords[song.id] || '-')}）。押すと歴代ベストを変更` : 'スコアを変更'}">${score}</button>
                    ${pointHtml}
                </div>
            </div>`;
    });
    return `
        <div class="dg-row">
            <div class="dg-label pk-label" style="background: ${color};"><span class="dg-label-cls">${label}</span><span class="pk-label-sub">${sub}</span></div>
            <div class="dg-cells" style="grid-template-columns: repeat(${COLS}, minmax(0, 1fr));">${cells}</div>
        </div>`;
}

// 旧ポックラ（ポックラの切り替えタブ）：大きな枠に値と +0.01まで、その下に上位50曲と圏外10曲の表
function renderOldPokkuraGrid() {
    const grid = document.getElementById('diff-grid-view');
    const narrow = isNarrowScreen();
    const COLS = narrow ? 2 : 5;
    lastGridNarrow = narrow;
    const old = calcOldPokkura();
    const items = old.entries.map(e => ({ song: e.song, point: e.point, score: e.score }));
    const pointText = p => p.toFixed(2);
    let html = `
        <div class="pk-summary pk-summary-old">
            <div class="pk-total"><span class="pk-total-label">旧ポックラ</span><span class="pk-total-value">${old.total.toFixed(2)}</span></div>
            <div class="pk-parts">${old.count > 0 ? `+0.01まで：約${old.toNext.toLocaleString('ja-JP')}点` : '-'}</div>
        </div>
        <div id="pk-goal-slot" class="goal-strip" style="display: none;"></div>`;
    html += items.length > 0
        ? buildDirectionBar('pokkura')
            + buildPokkuraSectionHtml('旧', `上位${OLD_POKKURA_COUNT}`, '#5d4037', items.slice(0, OLD_POKKURA_COUNT), COLS, pointText)
            + `<div class="pk-old-rest">${buildPokkuraSectionHtml('旧', '圏外', '#a1887f', items.slice(OLD_POKKURA_COUNT, OLD_POKKURA_COUNT + OLD_POKKURA_LIST_EXTRA), COLS, pointText)}</div>`
        : '<div class="dg-empty">Lv48〜50 でスコアのある曲がありません</div>';
    grid.innerHTML = html;
}

function renderPokkuraGrid() {
    const grid = document.getElementById('diff-grid-view');
    const narrow = isNarrowScreen();
    const COLS = narrow ? 2 : 5;
    lastGridNarrow = narrow;
    const pk = calcPokkura();

    const sourceText = pk.version
        ? `公式データ ${formatPokkuraDate(pk.version.at)} 時点`
        : '歴代ベストで計算（公式データ未取り込み）';
    const topCount = pk.topNew.length + pk.topOld.length;
    const restCount = pk.restNew.length + pk.restOld.length;

    // 公式サイトの値があれば、それを大きく出し、アプリの計算値は下に小さく出す
    const official = pk.version && typeof pk.version.pc === 'number' ? pk.version.pc : null;
    const oldPk = calcOldPokkura();
    const partsText = `新曲 ${pk.newPoint.toFixed(2)} ＋ 旧曲 ${pk.oldPoint.toFixed(2)}`;
    const toNext = getPokkuraPointsToNext(pk);
    const hasNew = pk.topNew.length + pk.topOld.length > 0;
    // 左が新ポックラ（アプリの計算値）、右が旧ポックラ。上の行に値、下の行に +0.01 までのスコア（対象曲の合計）
    const subHtml = `
            <div class="pk-sub">
                <div class="pk-sub-col" title="新ポックラはアプリの計算値。+0.01 までは対象曲の平均レベル（${toNext.avgLv.toFixed(1)}）で計算した目安。Lv50 の曲なら少し少なく、Lv48 の曲なら少し多くなります">
                    <div>新ポックラ ${pk.total.toFixed(2)}</div>
                    <div>${hasNew ? `+0.01まで：約${toNext.points.toLocaleString('ja-JP')}点` : '-'}</div>
                </div>
                <div class="pk-sub-col" title="旧ポックラ（Jam&amp;Fizz までの計算）。どの曲で伸ばしても同じ点数">
                    <div>旧ポックラ ${oldPk.total.toFixed(2)}</div>
                    <div>${oldPk.count > 0 ? `+0.01まで：約${oldPk.toNext.toLocaleString('ja-JP')}点` : '-'}</div>
                </div>
            </div>`;
    let html = official !== null ? `
        <div class="pk-summary">
            <div class="pk-total"><span class="pk-total-label">ポックラ</span><span class="pk-total-value">${official.toFixed(2)}</span></div>
            <div class="pk-source">公式 ${escapeHtml(formatPokkuraDate(pk.version.at))} 時点</div>
            <div class="pk-calc">${partsText}</div>
            ${subHtml}
        </div>` : `
        <div class="pk-summary">
            <div class="pk-total"><span class="pk-total-label">推定ポックラ</span><span class="pk-total-value">${pk.total.toFixed(2)}</span></div>
            <div class="pk-parts">${partsText}</div>
            <div class="pk-source${pk.version ? '' : ' pk-source-none'}">${escapeHtml(sourceText)}</div>
            ${subHtml}
        </div>`;
    html += `
        <div id="pk-goal-slot" class="goal-strip" style="display: none;"></div>
        <div class="pk-tabs" role="tablist" aria-label="ポックラの曲">
            <button type="button" role="tab" id="pk-tab-top" aria-controls="pk-panel-top" onclick="setPokkuraTab('top', true)">対象曲<span class="pk-tab-count">${topCount}</span></button>
            <button type="button" role="tab" id="pk-tab-rest" aria-controls="pk-panel-rest" onclick="setPokkuraTab('rest', true)">圏外<span class="pk-tab-count">${restCount}</span></button>
            <button type="button" role="tab" id="pk-tab-up" aria-controls="pk-panel-up" onclick="setPokkuraTab('up', true)">おすすめ</button>
        </div>`;

    const section = (label, sub, color, list) => buildPokkuraSectionHtml(label, sub, color, list, COLS);

    // 対象曲と圏外を横に並べ、タブか横スライドで切り替える
    const topHtml = topCount > 0
        ? section('新曲', `上位${POKKURA_NEW_COUNT}`, '#d82f66', pk.topNew) + section('旧曲', `上位${POKKURA_OLD_COUNT}`, '#7b1fa2', pk.topOld)
        : '<div class="dg-empty">対象の曲（新曲 Lv46〜49・旧曲 Lv48〜50）にスコアがありません</div>';
    const restHtml = restCount > 0
        ? section('新曲', '圏外', '#c48a9b', pk.restNew) + section('旧曲', '圏外', '#a58bb3', pk.restOld)
        : '<div class="dg-empty">圏外の曲はありません</div>';
    html += `
        ${buildDirectionBar('pokkura')}
        <div class="pk-slider" id="pk-slider">
            <div class="pk-panel" id="pk-panel-top" role="tabpanel" aria-labelledby="pk-tab-top">${topHtml}</div>
            <div class="pk-panel pk-panel-rest" id="pk-panel-rest" role="tabpanel" aria-labelledby="pk-tab-rest">${restHtml}</div>
            <div class="pk-panel pk-panel-up" id="pk-panel-up" role="tabpanel" aria-labelledby="pk-tab-up">${buildPokkuraRecHtml(pk)}</div>
        </div>
        ${buildPokkuraExplainHtml(pk)}`;
    grid.innerHTML = html;

    const slider = document.getElementById('pk-slider');
    let scrollTimer = null;
    slider.addEventListener('scroll', () => {
        // スライドが止まったら、見えているほうのタブにする
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
            // 描き直したあとの古いスライダーは無視する
            if (!slider.isConnected) return;
            const index = Math.round(slider.scrollLeft / Math.max(1, slider.clientWidth));
            const tab = POKKURA_TABS[Math.min(POKKURA_TABS.length - 1, Math.max(0, index))];
            if (tab !== pokkuraTab) setPokkuraTab(tab, false);
        }, 80);
    }, { passive: true });
    // 画像の読み込みや画面幅でパネルの高さが変わったら合わせ直す
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            if (!slider.isConnected) { ro.disconnect(); return; }
            fitPokkuraSliderHeight();
        });
        slider.querySelectorAll('.pk-panel').forEach(p => ro.observe(p));
    }
    setPokkuraTab(pokkuraTab, false, true);
}

function fitPokkuraSliderHeight() {
    const slider = document.getElementById('pk-slider');
    const panel = document.getElementById(`pk-panel-${pokkuraTab}`);
    if (slider && panel) slider.style.height = panel.offsetHeight + 'px';
}

// タブを切り替える（scroll = true ならそのパネルまでスライドする）
function setPokkuraTab(tab, scroll, instant) {
    if (!POKKURA_TABS.includes(tab)) tab = 'top';
    pokkuraTab = tab;
    const slider = document.getElementById('pk-slider');
    if (!slider) return;
    POKKURA_TABS.forEach(key => {
        const active = key === tab;
        const btn = document.getElementById(`pk-tab-${key}`);
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
        btn.tabIndex = active ? 0 : -1;
        document.getElementById(`pk-panel-${key}`).classList.toggle('pk-panel-active', active);
    });
    // 高さは見えているパネルに合わせる（もう片方の長さで下に空白ができないように）
    fitPokkuraSliderHeight();
    // おすすめはリストなので、向きの矢印は出さない
    const dirBar = document.querySelector('#diff-grid-view .dg-dir');
    if (dirBar) dirBar.style.display = tab === 'up' ? 'none' : '';
    const left = POKKURA_TABS.indexOf(tab) * slider.clientWidth;
    if (instant) slider.scrollLeft = left;
    else if (scroll) slider.scrollTo({ left, behavior: 'smooth' });
}

// 画面幅がPCとスマホの境目をまたいだら、列の数が変わるので描き直す
let gridResizeTimer = null;
window.addEventListener('resize', () => {
    if (viewMode === 'list') return;
    clearTimeout(gridResizeTimer);
    gridResizeTimer = setTimeout(() => {
        if (lastGridNarrow !== null && lastGridNarrow !== isNarrowScreen()) renderTable();
    }, 200);
});
