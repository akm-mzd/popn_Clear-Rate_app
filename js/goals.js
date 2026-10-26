// ==========================================
// goals.js
// 目標（例：Lv49 の弱を全部ノーマルクリア、Lv47 で銅菱以上を100曲）と、その進み具合。
// 目標はユーザーごとに goalRecords（{ 目標ID: 目標 }）としてクラウドに保存する。
//   目標 = { name, lv: [レベル], df: [難易度], af: [相性], kind: 'medal'|'score'|'rank'|'pokkura',
//           medal: 条件キー, score: 点数, rank: ランク, n: 曲数（null = 全曲）, t: 作った日時, done: 初めて達成した日時,
//           pc: ポップンクラスの目標値, st: 作ったときのポップンクラス（進み具合の起点） }
//   並び順は、達成まで近い順（進み具合の割合が大きい順。達成した目標は下）。
//   ポップンクラスの目標は、ポックラ画面で見せる（公式の値。なければアプリの計算値で判定）
// 進み具合は renderTable のたびに数え直す（updateGoalsAfterRender）。
// ==========================================

// メダルの条件（クリア率と同じ決まりで判定する）
const GOAL_MEDAL_OPTIONS = [
    { value: 'kurohishi', label: '黒菱以上', test: m => m.isKuroHishiClear },
    { value: 'kuroboshi', label: '黒星以上', test: m => m.isKuroBoshiClear },
    { value: 'easy', label: 'イージー以上', test: m => m.isEasyClear },
    { value: 'normal', label: 'ノーマルクリア以上', test: m => m.isNormalClear },
    ...['銅丸', '銅菱', '銅星', '銀丸', '銀菱', '銀星', '金星'].map(k => ({
        value: k, label: k === '金星' ? '金星（パーフェクト）' : `${k}以上`, test: m => m.rank >= MEDAL_TYPES[k].rank
    }))
];
const GOAL_DIFF_VALUES = ['危険', '別格', '詐称', '強', '中(+)', '中(-)', '弱', '逆詐称', '入門', '未分類'];
const GOAL_AFFINITY_VALUES = ['得意', '苦手', '噛み合い待ち', '敵', '💩', '未設定'];
// 目標の控え（この端末）。GAS が古くてクラウドに保存されなかったときに戻せるようにする
const GOAL_BACKUP_PREFIX = 'popn_goal_backup_';

let goalEditingId = null; // 編集中の目標ID（null = 新しく作る）
let goalDetailId = null;  // 詳細を開いている目標ID

function getGoalRecords(user = currentUser) {
    if (!allUsersData[user]) allUsersData[user] = emptyUser();
    if (!allUsersData[user].goalRecords) allUsersData[user].goalRecords = {};
    return allUsersData[user].goalRecords;
}

// ---------- 判定 ----------
function goalSongDiffKey(song) {
    let cls = song.diffClass || '未分類';
    if (cls === '中') cls = (song.diffIndex !== null && song.diffIndex < 0) ? '中(-)' : '中(+)';
    return cls;
}

// 目標の対象になる曲（未解禁は「未解禁を含む」の設定に従う）
function getGoalTargetSongs(goal) {
    const showUnreleased = document.getElementById('show-unreleased') ? document.getElementById('show-unreleased').checked : false;
    return songs.filter(song => {
        if (goal.lv && goal.lv.length > 0 && !goal.lv.includes(String(song.level))) return false;
        if (goal.df && goal.df.length > 0 && !goal.df.includes(goalSongDiffKey(song))) return false;
        if (goal.af && goal.af.length > 0) {
            const aff = (memoRecords[song.id] || {}).affinity || '未設定';
            if (!goal.af.includes(aff)) return false;
        }
        if (!showUnreleased && clearRecords[song.id] === '未解禁') return false;
        return true;
    });
}

function isGoalSongDone(goal, song) {
    if (goal.kind === 'score') return (parseInt(scoreRecords[song.id], 10) || 0) >= (goal.score || 0);
    if (goal.kind === 'rank') {
        const rank = getSongScoreRank(song);
        return !!rank && SCORE_RANK_KEYS.indexOf(rank) <= SCORE_RANK_KEYS.indexOf(goal.rank);
    }
    const opt = GOAL_MEDAL_OPTIONS.find(o => o.value === goal.medal);
    const m = MEDAL_TYPES[clearRecords[song.id] || ''];
    return !!(opt && m && opt.test(m));
}

// 今のポップンクラス（ポックラ画面で大きく出している値：公式の値、なければ計算値）
function getCurrentPokkuraValue() {
    const pk = calcPokkura();
    return pk.version && typeof pk.version.pc === 'number' ? pk.version.pc : pk.total;
}

// { total: 対象の曲数, achieved: 達成した曲数, need: 目標の曲数, value: 進んだ数, complete, ratio: 進み具合（0〜1） }
//   ポップンクラスの目標は { pokkura: true, cur: 今の値, target: 目標値, ratio, complete }（value / need は割合の％）
function getGoalProgress(goal) {
    if (goal.kind === 'pokkura') {
        const cur = getCurrentPokkuraValue();
        const target = goal.pc || 0;
        const complete = cur >= target - 1e-9;
        const start = typeof goal.st === 'number' ? goal.st : 0;
        const ratio = complete ? 1 : (target > start ? Math.max(0, Math.min(1, (cur - start) / (target - start))) : 0);
        return { pokkura: true, cur, target, ratio, complete, value: Math.floor(ratio * 100), need: 100, total: 1, achieved: complete ? 1 : 0 };
    }
    const targets = getGoalTargetSongs(goal);
    const achieved = targets.filter(s => isGoalSongDone(goal, s)).length;
    const need = goal.n ? goal.n : targets.length;
    const value = Math.min(achieved, need);
    return { total: targets.length, achieved, need, value, complete: need > 0 && value >= need, ratio: need > 0 ? value / need : 0 };
}

// 進んだ数の文字（ポップンクラスは「今の値 / 目標値」、それ以外は「曲数 / 目標の曲数」）
function goalCountText(p) {
    return p.pokkura ? `${p.cur.toFixed(2)}/${p.target.toFixed(2)}` : `${p.value}/${p.need}`;
}

function describeGoalCondition(goal) {
    if (goal.kind === 'pokkura') return `ポップンクラス ${(goal.pc || 0).toFixed(2)}以上`;
    if (goal.kind === 'score') return `スコア${goal.score}以上`;
    if (goal.kind === 'rank') return `${goal.rank}以上`;
    const opt = GOAL_MEDAL_OPTIONS.find(o => o.value === goal.medal);
    return opt ? opt.label : '';
}

function describeGoal(goal) {
    if (goal.kind === 'pokkura') return describeGoalCondition(goal);
    const parts = [];
    parts.push(goal.lv && goal.lv.length > 0 ? goal.lv.map(l => isNaN(parseInt(l, 10)) ? l : `Lv${l}`).join('・') : '全レベル');
    if (goal.df && goal.df.length > 0) parts.push(goal.df.join('・'));
    if (goal.af && goal.af.length > 0) parts.push(`相性：${goal.af.join('・')}`);
    parts.push(describeGoalCondition(goal));
    parts.push(goal.n ? `${goal.n}曲` : '全曲');
    return parts.join(' ');
}

function goalTitle(goal) {
    return goal.name ? goal.name : describeGoal(goal);
}

function formatGoalDate(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// 並び順：達成まで近い順（進み具合の割合が大きい順。同じなら新しいものが上）。達成した目標は下
//   返り値の各要素には進み具合 p も付ける
function getSortedGoals() {
    const records = getGoalRecords();
    return Object.keys(records).map(id => ({ id, goal: records[id] }))
        .filter(x => x.goal && typeof x.goal === 'object')
        .map(x => Object.assign(x, { p: getGoalProgress(x.goal) }))
        .sort((a, b) => (a.p.complete - b.p.complete)
            || (a.p.complete ? (b.goal.done || 0) - (a.goal.done || 0) : b.p.ratio - a.p.ratio)
            || ((b.goal.t || 0) - (a.goal.t || 0)));
}

// 今の画面で一覧の上に見せる目標か
//   ポックラ画面ではポップンクラスの目標だけ。それ以外の画面では、ポップンクラス以外の目標を表示レベルに合わせて
//   （レベルを決めていない目標と「すべて」表示のときは、いつも見せる）
function isGoalForCurrentLevel(goal) {
    if (viewMode === 'pokkura') return goal.kind === 'pokkura';
    if (goal.kind === 'pokkura') return false;
    if (currentViewLevel === 'ALL' || isSpecialViewLevel(currentViewLevel) || !goal.lv || goal.lv.length === 0) return true;
    return goal.lv.includes(String(currentViewLevel));
}

// ---------- 描画（renderTable の最後に呼ばれる） ----------
function updateGoalsAfterRender() {
    const list = getSortedGoals();

    // 初めて達成した目標は、達成日を残して知らせる
    list.forEach(({ goal, p }) => {
        if (p.complete && !goal.done) {
            goal.done = Date.now();
            scheduleAutoSave();
            showToast('toast-goal', `🎉 目標達成：${goalTitle(goal)}`, '#7b1fa2', 5000);
        }
    });

    saveGoalBackup();
    renderGoalStrip(list);
    renderGoalList(list);
    // 詳細を開いたままメダル・スコアを変えたら、詳細も描き直す
    if (goalDetailId) renderGoalDetail();
}

function goalBarHtml(p) {
    const pct = p.need > 0 ? Math.min(100, p.value / p.need * 100) : 0;
    return `<div class="goal-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${p.need}" aria-valuenow="${p.value}"><span style="width: ${pct.toFixed(1)}%;"></span></div>`;
}

// 一覧の上の小さな表示（今の表示レベルの、まだ達成していない目標を並び順で。横にスライドして全部見られる）
function renderGoalStrip(list) {
    const strip = document.getElementById('goal-strip');
    if (!strip) return;
    const active = list.filter(x => !x.p.complete && isGoalForCurrentLevel(x.goal));
    if (active.length === 0) {
        strip.innerHTML = '';
        strip.style.display = 'none';
        return;
    }
    strip.style.display = '';
    strip.innerHTML = active.map(({ id, goal, p }) => `
        <button type="button" class="goal-chip" onclick="openGoalDetail('${jsStringAttr(id)}')" title="${escapeHtml(describeGoal(goal))}（押すと詳細）">
            <span class="goal-chip-head"><span class="goal-chip-name">🎯 ${escapeHtml(goalTitle(goal))}</span><span class="goal-chip-num">${goalCountText(p)}</span></span>
            ${goalBarHtml(p)}
        </button>`).join('');
}

function renderGoalList(list) {
    const box = document.getElementById('goal-list');
    if (!box) return;
    if (list.length === 0) {
        box.innerHTML = '<div class="goal-empty">まだ目標がありません。「＋ 目標を追加」から作れます。</div>';
        return;
    }
    const item = ({ id, goal, p }) => {
        const pct = p.need > 0 ? Math.floor(p.value / p.need * 100) : 0;
        const safeId = jsStringAttr(id);
        const status = p.complete
            ? `<span class="goal-done">✓ 達成${goal.done ? `（${formatGoalDate(goal.done)}）` : ''}</span>`
            : `<span class="goal-rest">あと ${p.pokkura ? (p.target - p.cur).toFixed(2) : `${p.need - p.value}曲`}</span>`;
        const meta = p.pokkura ? `今 ${p.cur.toFixed(2)} / 目標 ${p.target.toFixed(2)}` : `${p.value} / ${p.need}曲（${pct}%）`;
        const warn = !p.pokkura && goal.n && p.total < goal.n ? `<div class="goal-warn">対象の曲が ${p.total}曲しかありません</div>` : '';
        return `
            <div class="goal-item${p.complete ? ' is-done' : ''}">
                <button type="button" class="goal-open" onclick="openGoalDetail('${safeId}')" title="${p.pokkura ? '押すと、ポックラ画面を開きます' : '押すと、対象の曲と今のメダル・スコアが見られます'}">
                    <span class="goal-name">${escapeHtml(goalTitle(goal))}</span>
                    ${goal.name ? `<span class="goal-desc">${escapeHtml(describeGoal(goal))}</span>` : ''}
                    ${goalBarHtml(p)}
                    <span class="goal-open-hint">詳細 ›</span>
                </button>
                <div class="goal-meta"><span>${meta}</span>${status}</div>
                ${warn}
                <div class="goal-actions">
                    <button type="button" class="goal-see" onclick="showGoalSongs('${safeId}')">${p.pokkura ? 'ポックラを見る' : '曲を見る'}</button>
                    <button type="button" onclick="openGoalForm('${safeId}')">編集</button>
                    <button type="button" class="goal-delete" onclick="deleteGoal('${safeId}')">削除</button>
                </div>
            </div>`;
    };
    const active = list.filter(x => !x.p.complete);
    const done = list.filter(x => x.p.complete);
    let html = active.map(item).join('');
    if (done.length > 0) html += `<div class="goal-section">達成した目標（${done.length}）</div>` + done.map(item).join('');
    box.innerHTML = html;
}

// ---------- 開く・曲を見る ----------
function openGoalSheet() {
    if (isNewUi()) openNewUiSheet('goal');
    else {
        toggleMenu(true);
        const card = document.getElementById('goal-card');
        if (card) card.scrollIntoView({ block: 'start' });
    }
}

// 目標の条件で一覧を絞り込む（まだ達成していない曲だけ）
function showGoalSongs(id) {
    const goal = getGoalRecords()[id];
    if (!goal) return;
    if (goal.kind === 'pokkura') { openPokkuraForGoal(); return; }
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    FILTER_IDS.forEach(fid => setFilterValues(fid, []));
    setFilterValues('filter-diff', goal.df || []);
    setFilterValues('filter-affinity', goal.af || []);
    if (goal.kind === 'medal') {
        const opt = GOAL_MEDAL_OPTIONS.find(o => o.value === goal.medal);
        const showUnreleased = document.getElementById('show-unreleased') ? document.getElementById('show-unreleased').checked : false;
        const notDone = Object.keys(MEDAL_TYPES)
            .filter(k => opt && !opt.test(MEDAL_TYPES[k]) && (showUnreleased || k !== '未解禁'))
            .map(k => k === '' ? 'unplayed' : k);
        setFilterValues('filter-medal', notDone);
    } else if (goal.kind === 'rank') {
        const idx = SCORE_RANK_KEYS.indexOf(goal.rank);
        setFilterValues('filter-rank', SCORE_RANK_KEYS.slice(idx + 1).concat(SCORE_RANK_NONE));
    }
    toggleMenu(false);
    changeViewLevel(goal.lv && goal.lv.length === 1 ? goal.lv[0] : 'ALL');
    renderTable();
    window.scrollTo(0, 0);
}

function deleteGoal(id) {
    const records = getGoalRecords();
    if (!records[id]) return;
    if (!confirm(`目標「${goalTitle(records[id])}」を削除しますか？`)) return;
    delete records[id];
    // 最後の1件を消したら、控えも消す（次に開いたとき「戻しますか？」と聞かないように）
    if (Object.keys(records).length === 0) storageRemove(GOAL_BACKUP_PREFIX + currentUser);
    scheduleAutoSave();
    renderTable();
}

// ---------- 追加・編集のフォーム ----------
function goalChipsHtml(name, values, selected) {
    return values.map(v => `<label class="goal-opt"><input type="checkbox" name="${name}" value="${escapeHtml(v)}"${selected.includes(v) ? ' checked' : ''} onchange="updateGoalFormPreview()"><span>${escapeHtml(v)}</span></label>`).join('');
}

function openGoalForm(id) {
    goalEditingId = id || null;
    const goal = id ? getGoalRecords()[id] : null;
    const g = goal || { lv: [], df: [], af: [], kind: 'medal', medal: 'normal', score: 95000, rank: 'AA', n: null, name: '' };
    const curPc = getCurrentPokkuraValue();
    const pcDefault = typeof g.pc === 'number' ? g.pc : Math.floor(curPc) + 1;
    const form = document.getElementById('goal-form');
    const levels = getSortedLevels();
    form.innerHTML = `
        <div class="goal-form-title">${goal ? '目標を編集' : '新しい目標'}</div>
        <div class="goal-field goal-song-only"><div class="goal-label">レベル <span>（選ばなければ全レベル）</span></div>
            <div class="goal-opts">${goalChipsHtml('goal-lv', levels, g.lv || [])}</div></div>
        <div class="goal-field goal-song-only"><div class="goal-label">難易度 <span>（選ばなければすべて）</span></div>
            <div class="goal-opts">${goalChipsHtml('goal-df', GOAL_DIFF_VALUES, g.df || [])}</div></div>
        <div class="goal-field goal-song-only"><div class="goal-label">相性 <span>（選ばなければすべて）</span></div>
            <div class="goal-opts">${goalChipsHtml('goal-af', GOAL_AFFINITY_VALUES, g.af || [])}</div></div>
        <div class="goal-field"><div class="goal-label">達成の条件</div>
            <div class="goal-row">
                <select id="goal-kind" onchange="updateGoalFormPreview()">
                    <option value="medal"${g.kind === 'medal' ? ' selected' : ''}>メダル</option>
                    <option value="score"${g.kind === 'score' ? ' selected' : ''}>スコア</option>
                    <option value="rank"${g.kind === 'rank' ? ' selected' : ''}>ランク</option>
                    <option value="pokkura"${g.kind === 'pokkura' ? ' selected' : ''}>ポップンクラス</option>
                </select>
                <select id="goal-medal" onchange="updateGoalFormPreview()">${GOAL_MEDAL_OPTIONS.map(o => `<option value="${o.value}"${o.value === g.medal ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select>
                <span id="goal-score-wrap"><input type="number" id="goal-score" min="0" max="100000" step="100" value="${g.score || 95000}" oninput="updateGoalFormPreview()"> 点以上</span>
                <span id="goal-pc-wrap"><input type="number" id="goal-pc" min="0" max="999" step="0.01" value="${pcDefault.toFixed(2)}" oninput="updateGoalFormPreview()"> 以上</span>
                <span id="goal-rank-wrap"><select id="goal-rank" onchange="updateGoalFormPreview()">${SCORE_RANK_KEYS.map(k => `<option value="${k}"${k === g.rank ? ' selected' : ''}>${k}</option>`).join('')}</select> 以上</span>
            </div></div>
        <div class="goal-field goal-song-only"><div class="goal-label">曲数</div>
            <div class="goal-row">
                <label class="goal-radio"><input type="radio" name="goal-n-mode" value="all"${g.n ? '' : ' checked'} onchange="updateGoalFormPreview()"> 全曲</label>
                <label class="goal-radio"><input type="radio" name="goal-n-mode" value="num"${g.n ? ' checked' : ''} onchange="updateGoalFormPreview()"> <input type="number" id="goal-n" min="1" step="1" value="${g.n || 100}" oninput="updateGoalFormPreview()"> 曲</label>
            </div></div>
        <div class="goal-field"><div class="goal-label">名前 <span>（空欄なら条件から自動）</span></div>
            <input type="text" id="goal-name" maxlength="40" value="${escapeHtml(g.name || '')}" placeholder="例：49弱 全クリア"></div>
        <div class="goal-preview" id="goal-preview"></div>
        <div class="goal-form-actions">
            <button type="button" onclick="closeGoalForm()">キャンセル</button>
            <button type="button" class="goal-save" onclick="saveGoalForm()">保存</button>
        </div>`;
    form.style.display = '';
    document.getElementById('goal-add-btn').style.display = 'none';
    updateGoalFormPreview();
    form.scrollIntoView({ block: 'nearest' });
}

function closeGoalForm() {
    goalEditingId = null;
    const form = document.getElementById('goal-form');
    form.style.display = 'none';
    form.innerHTML = '';
    document.getElementById('goal-add-btn').style.display = '';
}

function readGoalForm() {
    const checked = name => Array.from(document.querySelectorAll(`#goal-form input[name="${name}"]:checked`)).map(cb => cb.value);
    const kind = document.getElementById('goal-kind').value;
    const numMode = (document.querySelector('#goal-form input[name="goal-n-mode"]:checked') || {}).value === 'num';
    const n = parseInt(document.getElementById('goal-n').value, 10);
    const goal = { name: document.getElementById('goal-name').value.trim(), lv: checked('goal-lv'), df: checked('goal-df'), af: checked('goal-af'), kind, n: numMode && n > 0 ? n : null };
    if (kind === 'medal') goal.medal = document.getElementById('goal-medal').value;
    if (kind === 'score') goal.score = Math.max(0, Math.min(100000, parseInt(document.getElementById('goal-score').value, 10) || 0));
    if (kind === 'rank') goal.rank = document.getElementById('goal-rank').value;
    if (kind === 'pokkura') {
        goal.pc = Math.round((parseFloat(document.getElementById('goal-pc').value) || 0) * 100) / 100;
        goal.lv = []; goal.df = []; goal.af = []; goal.n = null;
    }
    return goal;
}

function updateGoalFormPreview() {
    if (!document.getElementById('goal-kind')) return;
    const kind = document.getElementById('goal-kind').value;
    document.getElementById('goal-medal').style.display = kind === 'medal' ? '' : 'none';
    document.getElementById('goal-score-wrap').style.display = kind === 'score' ? '' : 'none';
    document.getElementById('goal-rank-wrap').style.display = kind === 'rank' ? '' : 'none';
    document.getElementById('goal-pc-wrap').style.display = kind === 'pokkura' ? '' : 'none';
    document.querySelectorAll('#goal-form .goal-song-only').forEach(el => { el.style.display = kind === 'pokkura' ? 'none' : ''; });
    const goal = readGoalForm();
    const p = getGoalProgress(goal);
    document.getElementById('goal-preview').textContent = kind === 'pokkura'
        ? `いまのポップンクラス ${getCurrentPokkuraValue().toFixed(2)}（${describeGoal(goal)}）`
        : `対象 ${p.total}曲・いま ${p.achieved}曲 達成（${describeGoal(goal)}）`;
}

function saveGoalForm() {
    const goal = readGoalForm();
    if (goal.n === null && document.querySelector('#goal-form input[name="goal-n-mode"]:checked').value === 'num') {
        alert('曲数は 1 以上の数字で入力してください。');
        return;
    }
    if (goal.kind === 'pokkura' && !(goal.pc > 0)) {
        alert('ポップンクラスの目標の値を入力してください。');
        return;
    }
    if (goal.kind !== 'pokkura' && getGoalTargetSongs(goal).length === 0) {
        alert('この条件に合う曲がありません。条件を見直してください。');
        return;
    }
    const records = getGoalRecords();
    const old = goalEditingId ? records[goalEditingId] : null;
    goal.t = old ? old.t : Date.now();
    // ポップンクラスの目標は、作ったとき（目標値を変えたとき）の値を進み具合の起点にする
    if (goal.kind === 'pokkura') goal.st = old && old.kind === 'pokkura' && old.pc === goal.pc && typeof old.st === 'number' ? old.st : getCurrentPokkuraValue();
    // 条件を変えたら、達成日は付け直す（すでに達成していれば、描き直しのときに今日の日付が入る）
    if (old && old.done && describeGoal(old) === describeGoal(goal)) goal.done = old.done;
    const id = goalEditingId || (Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7));
    records[id] = goal;
    closeGoalForm();
    scheduleAutoSave();
    renderTable();
}

// ---------- 目標の詳細（対象の曲・今のメダル・スコア） ----------
// ポップンクラスの目標：ポックラ画面を開く
function openPokkuraForGoal() {
    closeGoalDetail();
    toggleMenu(false);
    if (viewMode !== 'pokkura') setViewMode('pokkura');
    window.scrollTo(0, 0);
}

function openGoalDetail(id) {
    const g = getGoalRecords()[id];
    if (!g) return;
    if (g.kind === 'pokkura') { openPokkuraForGoal(); return; }
    goalDetailId = id;
    renderGoalDetail();
    document.getElementById('goal-detail-filter').onclick = () => { closeGoalDetail(); showGoalSongs(id); };
    document.getElementById('goal-detail-modal').style.display = 'flex';
    document.getElementById('goal-detail-body').scrollTop = 0;
}

function closeGoalDetail() {
    goalDetailId = null;
    document.getElementById('goal-detail-modal').style.display = 'none';
}

// まだの曲は「あと少し」の順（メダルなら今のメダルが良い順、スコア・ランクならスコアが高い順）
function goalCloseness(goal, song) {
    if (goal.kind === 'medal') return (MEDAL_TYPES[clearRecords[song.id] || ''] || { rank: -1 }).rank * 1000000 + (parseInt(scoreRecords[song.id], 10) || 0);
    return parseInt(scoreRecords[song.id], 10) || 0;
}

function goalSongRowHtml(goal, song, done) {
    const safeId = jsStringAttr(song.id);
    const medalKey = clearRecords[song.id] || '';
    const medalLabel = (MEDAL_TYPES[medalKey] || { label: medalKey }).label;
    const score = parseInt(scoreRecords[song.id], 10) || 0;
    const rank = getSongScoreRank(song);
    const bannerSrc = safeUrl(song.bannerUrl, true);
    const bannerInner = bannerSrc
        ? `<img src="${escapeHtml(bannerSrc)}" alt="${escapeHtml(song.title)}" loading="lazy">`
        : `<span class="gd-banner-text">${escapeHtml(song.title)}</span>`;
    // 目標に足りない数（スコアの目標のときだけ）
    const short = !done && goal.kind === 'score' ? `<span class="gd-short">あと ${(goal.score || 0) - score}</span>` : '';
    return `
        <div class="gd-row${done ? ' is-done' : ''}">
            <button type="button" class="gd-medal${medalKey === '' ? ' is-empty' : ''}" onclick="openMedalModal('${safeId}')" title="${escapeHtml(medalLabel || '未プレイ')}（押すとメダルを変更）">${buildGridMedalInner(medalKey) || '<span class="gd-medal-none">−</span>'}</button>
            <a class="gd-banner" href="${escapeHtml(getWikiUrl(song))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(song.title)}（攻略wikiを開く）">${bannerInner}</a>
            <div class="gd-info">
                <div class="gd-title">${escapeHtml(song.title)}</div>
                <div class="gd-sub"><span class="level-badge">${escapeHtml(song.level)}</span> ${escapeHtml(song.diffRaw || '未分類')} ・ ${escapeHtml(medalLabel || '未プレイ')}</div>
            </div>
            <button type="button" class="gd-score" onclick="openScoreModal('${safeId}')" title="押すとスコアを変更">
                ${rank ? `<img class="gd-rank" src="${escapeHtml(RANK_IMAGES[rank])}" alt="${escapeHtml(rank)}">` : ''}
                <span class="gd-score-num">${score ? score : '-'}</span>${short}
            </button>
        </div>`;
}

function renderGoalDetail() {
    const goal = getGoalRecords()[goalDetailId];
    if (!goal) { closeGoalDetail(); return; }
    const p = getGoalProgress(goal);
    const targets = getGoalTargetSongs(goal);
    const todo = targets.filter(s => !isGoalSongDone(goal, s))
        .sort((a, b) => (goalCloseness(goal, b) - goalCloseness(goal, a)) || (getDiffSortValue(b) - getDiffSortValue(a)) || (a.originalOrder - b.originalOrder));
    const done = targets.filter(s => isGoalSongDone(goal, s))
        .sort((a, b) => (getDiffSortValue(b) - getDiffSortValue(a)) || (a.originalOrder - b.originalOrder));
    const pct = p.need > 0 ? Math.floor(p.value / p.need * 100) : 0;
    const status = p.complete
        ? `<span class="goal-done">✓ 達成${goal.done ? `（${formatGoalDate(goal.done)}）` : ''}</span>`
        : `<span class="goal-rest">あと ${p.need - p.value}曲</span>`;

    document.getElementById('goal-detail-head').innerHTML = `
        <h3 class="gd-head-title">🎯 ${escapeHtml(goalTitle(goal))}</h3>
        ${goal.name ? `<div class="goal-desc">${escapeHtml(describeGoal(goal))}</div>` : ''}
        <div class="${p.complete ? 'goal-item is-done gd-head-bar' : 'gd-head-bar'}">${goalBarHtml(p)}</div>
        <div class="goal-meta"><span>${p.value} / ${p.need}曲（${pct}%）・対象 ${p.total}曲</span>${status}</div>`;

    let html = '';
    if (todo.length > 0) {
        const note = goal.n && !p.complete ? `（このうち ${p.need - p.value}曲で達成）` : '';
        html += `<div class="gd-section">まだの曲 ${todo.length}曲 <span>${note}</span></div>`;
        html += todo.map(s => goalSongRowHtml(goal, s, false)).join('');
    } else {
        html += '<div class="gd-section gd-all-done">🎉 対象の曲はすべて達成しています</div>';
    }
    if (done.length > 0) {
        html += `<details class="gd-done-group"${todo.length === 0 ? ' open' : ''}><summary class="gd-section">達成した曲 ${done.length}曲</summary>${done.map(s => goalSongRowHtml(goal, s, true)).join('')}</details>`;
    }
    const body = document.getElementById('goal-detail-body');
    const scrollTop = body.scrollTop;
    const openDone = !!body.querySelector('.gd-done-group[open]');
    body.innerHTML = html;
    if (openDone && body.querySelector('.gd-done-group')) body.querySelector('.gd-done-group').open = true;
    body.scrollTop = scrollTop;
}

// ---------- 目標の控え（この端末） ----------
// クラウドの読み込みが済んでから（cloudReady）、目標があるときだけ控えを書く
function saveGoalBackup() {
    if (typeof cloudReady === 'undefined' || !cloudReady) return;
    const records = getGoalRecords();
    if (Object.keys(records).length === 0) return;
    storageSet(GOAL_BACKUP_PREFIX + currentUser, JSON.stringify(records));
}

// 起動時：クラウドに目標が1件もないのに、この端末に控えがあれば、戻すか聞く
function checkGoalBackup() {
    const key = GOAL_BACKUP_PREFIX + currentUser;
    let backup = null;
    try { backup = JSON.parse(storageGet(key) || 'null'); } catch (e) { backup = null; }
    if (!backup || typeof backup !== 'object' || Array.isArray(backup)) return;
    const ids = Object.keys(backup).filter(id => backup[id] && typeof backup[id] === 'object');
    if (ids.length === 0) return;
    const records = getGoalRecords();
    if (Object.keys(records).length > 0) return;
    const ok = confirm(`クラウドに目標がありませんが、この端末に目標の控えが ${ids.length}件あります。戻しますか？\n` +
        '（何度もこの確認が出るときは、GAS（Google Apps Script）が最新になっていないため保存できていません）');
    if (!ok) {
        storageRemove(key);
        return;
    }
    ids.forEach(id => { records[id] = backup[id]; });
    scheduleAutoSave();
    renderTable();
    showToast('toast-goal', `目標を ${ids.length}件 戻しました`, '#7b1fa2', 4000);
}
