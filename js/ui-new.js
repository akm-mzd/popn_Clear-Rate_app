// ==========================================
// ui-new.js
// 新しいデザイン（ver 3）と、以前の見た目（ver 2）の切り替え。
//   新しいデザインでは body に .ui-new を付け、上部バー・下部ナビ（PCは左のサイドバー）を出す。
//   メニューの中身（検索・統計・画像・設定の枠）はそのまま使い、ナビで開いた項目の枠だけを
//   シート（スマホは下から、PCは右から）に出す。機能のコードは両方の見た目で共通。
//   見た目の選択は、この端末に保存する（popn_ui_mode：'new' / 'classic'）。
// ==========================================

const UI_MODE_KEY = 'popn_ui_mode';
const NEW_UI_SHEET_TITLES = { filter: '検索・絞り込み', stats: '統計', image: '画像を作る', goal: '目標', more: 'その他' };

function getUiMode() {
    return storageGet(UI_MODE_KEY) === 'classic' ? 'classic' : 'new';
}

function isNewUi() {
    return document.body.classList.contains('ui-new');
}

function applyUiMode(mode) {
    const isNew = mode !== 'classic';
    toggleMenu(false);
    document.body.classList.toggle('ui-new', isNew);

    // 統計（クリア率・内訳）：新しいデザインでは「統計」シートの中、以前の見た目では一覧の上
    const stats = document.getElementById('stats-display');
    const extended = document.getElementById('extended-stats-display');
    if (isNew) {
        document.getElementById('nu-stats-slot').append(stats, extended);
    } else {
        document.getElementById('main-stats-anchor').after(stats, extended);
    }

    // 管理者メニュー：新しいデザインでは一覧の下へ（以前の見た目ではタイトルの下）
    const admin = document.getElementById('admin-controls');
    if (isNew) document.getElementById('app-main').appendChild(admin);
    else document.getElementById('current-user-label').after(admin);

    // レベル・表示方法の枠：新しいデザインでは常に一覧の上（固定の帯）
    applyLevelButtonPlacement(isNew ? true : storageGet('popn_level_btn_main') !== '0');

    document.getElementById('ui-switch-text').textContent = isNew ? '新しいデザインで表示中' : '以前の見た目（ver 2）で表示中';
    document.getElementById('ui-switch-btn').textContent = isNew ? '以前の見た目に戻す' : '新しいデザインにする';
}

function toggleUiMode() {
    const next = isNewUi() ? 'classic' : 'new';
    storageSet(UI_MODE_KEY, next);
    applyUiMode(next);
    renderTable();
    window.scrollTo(0, 0);
}

// 以前の見た目のときだけメニューを閉じる（新しいデザインのシートは開いたまま、その場で結果を見せる）
function closeMenuInClassic() {
    if (!isNewUi()) toggleMenu(false);
}

// ---------- シート（ナビで開く） ----------
function openNewUiSheet(key) {
    const panel = document.getElementById('menu-panel');
    panel.dataset.sheet = key;
    panel.querySelectorAll('[data-sheet]').forEach(el => {
        el.classList.toggle('nu-hidden', el.dataset.sheet !== key);
    });
    document.getElementById('nu-sheet-title').textContent = NEW_UI_SHEET_TITLES[key] || '';
    if (key === 'filter') {
        const details = panel.querySelector('.menu-filter-details');
        if (details) details.open = true;
    }
    setNewUiNavActive(key);
    toggleMenu(true);
    panel.scrollTop = 0;
}

function closeNewUiSheet() {
    toggleMenu(false);
}

// メニューが閉じたら呼ばれる（menu.js の toggleMenu から）
function onMenuClosed() {
    setNewUiNavActive('home');
}

function setNewUiNavActive(key) {
    document.querySelectorAll('#nu-nav button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.nav === key);
    });
}

// ---------- 上部バー・絞り込みチップ・統計カード（renderTable の最後に呼ばれる） ----------
const NEW_UI_FILTER_GROUPS = [
    ['filter-medal', 'メダル'], ['filter-diff', '難易度'], ['filter-rank', 'ランク'],
    ['filter-version', 'バージョン'], ['filter-affinity', '相性']
];
const NEW_UI_VALUE_LABELS = { unplayed: '未プレイ', none: 'スコアなし' };

function makeChip(text, ariaLabel, onRemove) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nu-chip';
    btn.setAttribute('aria-label', ariaLabel);
    const label = document.createElement('span');
    label.textContent = text;
    btn.appendChild(label);
    btn.insertAdjacentHTML('beforeend', '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>');
    btn.onclick = onRemove;
    return btn;
}

function updateNewUiChrome(summary) {
    // ユーザー
    const name = currentUser || '';
    document.getElementById('nu-user-name').textContent = name;
    document.getElementById('nu-user-avatar').textContent = Array.from(name)[0] || '?';

    // 絞り込みのチップ
    const bar = document.getElementById('nu-filterbar');
    bar.innerHTML = '';
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'nu-filter-open';
    openBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16l-6 7v6l-4 2v-8z"/></svg><span>絞り込み</span>';
    openBtn.onclick = () => openNewUiSheet('filter');
    bar.appendChild(openBtn);

    let chipCount = 0;
    const searchInput = document.getElementById('search-input');
    const query = searchInput ? searchInput.value.trim() : '';
    if (query) {
        bar.appendChild(makeChip(`検索：${query}`, `検索「${query}」を外す`, () => clearSearch()));
        chipCount++;
    }
    NEW_UI_FILTER_GROUPS.forEach(([id, groupName]) => {
        const values = getFilterValues(id);
        if (values.length === 0) return;
        const text = `${groupName}：${values.map(v => NEW_UI_VALUE_LABELS[v] || v).join('・')}`;
        bar.appendChild(makeChip(text, `${groupName}の絞り込みを外す`, () => { setFilterValues(id, []); renderTable(); }));
        chipCount++;
    });
    if (chipCount === 0) {
        const none = document.createElement('span');
        none.className = 'nu-chip-none';
        none.textContent = '条件なし（すべての曲）';
        bar.appendChild(none);
    }

    // 統計のミニカード（ノーマルクリア以上）
    const card = document.getElementById('nu-stat-card');
    const rate = summary.total > 0 ? summary.cleared / summary.total : 0;
    const circ = 2 * Math.PI * 18;
    card.innerHTML = `
        <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r="18" fill="none" stroke="#F1E8F3" stroke-width="6"></circle>
            <circle cx="22" cy="22" r="18" fill="none" stroke="#C2185B" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(circ * rate).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 22 22)"></circle>
        </svg>
        <span class="nu-stat-text">
            <span class="nu-stat-label">${escapeHtml(summary.levelLabel)}・ノーマルクリア以上</span>
            <span class="nu-stat-main"><b>${formatRate(summary.cleared, summary.total)}%</b><span>${summary.cleared} / ${summary.total}曲（残り ${summary.total - summary.cleared}）</span></span>
        </span>
        ${buildStatCardBreakdownHtml(summary)}
        <span class="nu-stat-more">内訳 ›</span>`;

    // 絞り込みシートの「N曲を表示」
    document.getElementById('nu-show-count').textContent = `${summary.shown}曲を表示`;
}

// 統計のミニカードの内訳（難易度表・メダル表はメダル、スコア表はスコアランク。0曲のものは出さない）
function buildStatCardBreakdownHtml(summary) {
    const chip = (iconHtml, count, title) =>
        `<span class="nu-stat-chip" title="${escapeHtml(title)}：${count}曲">${iconHtml}<span>${count}</span></span>`;
    const chips = [];
    if ((viewMode === 'grid' || viewMode === 'medal') && summary.medalCounts) {
        Object.keys(MEDAL_TYPES)
            .filter(k => summary.medalCounts[k] > 0 && (k !== '未解禁' || summary.showUnreleased))
            .sort((a, b) => MEDAL_TYPES[b].rank - MEDAL_TYPES[a].rank)
            .forEach(k => {
                const m = MEDAL_TYPES[k];
                const src = safeUrl(m.imgUrl, true);
                const icon = k === '' ? '<span class="nu-stat-chip-text">未</span>'
                    : k === '未解禁' ? '<span class="nu-stat-chip-text">🔒</span>'
                    : src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(m.label)}">` : `<span class="nu-stat-chip-text">${escapeHtml(m.label)}</span>`;
                chips.push(chip(icon, summary.medalCounts[k], m.label));
            });
    } else if (viewMode === 'score' && summary.rankCounts) {
        SCORE_RANK_KEYS.concat(SCORE_RANK_NONE).forEach(k => {
            const count = summary.rankCounts[k];
            if (!(count > 0)) return;
            const icon = k === SCORE_RANK_NONE ? '<span class="nu-stat-chip-text">なし</span>'
                : `<img class="nu-stat-chip-rank" src="${escapeHtml(safeUrl(RANK_IMAGES[k], true) || '')}" alt="${escapeHtml(k)}">`;
            chips.push(chip(icon, count, k === SCORE_RANK_NONE ? 'スコアなし' : k));
        });
    }
    return chips.length ? `<span class="nu-stat-breakdown">${chips.join('')}</span>` : '';
}

// 保存の状態（cloud.js の setSaveStatus から呼ばれる）
function updateSaveChip(text, color) {
    const chip = document.getElementById('nu-save-chip');
    if (!chip) return;
    // 記号（✓ ● など）と文字に分ける。狭い画面では記号だけを出す
    const full = text || '✓ 保存済み';
    const [mark, ...rest] = Array.from(full);
    chip.innerHTML = '';
    const markEl = document.createElement('span');
    markEl.textContent = mark;
    const labelEl = document.createElement('span');
    labelEl.className = 'nu-save-label';
    labelEl.textContent = rest.join('');
    chip.append(markEl, labelEl);
    chip.title = full;
    chip.className = 'nu-save-chip ' + (
        !text || text.startsWith('✓') ? 'is-saved' :
        text.startsWith('⚠') ? 'is-error' :
        text.includes('保存中') ? 'is-saving' : 'is-dirty');
}

applyUiMode(getUiMode());
