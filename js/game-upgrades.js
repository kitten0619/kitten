(function () {
  const STORAGE_KEY = 'ket-card-adventure';
  const PAGE_SIZE = 24;
  const DAILY_TARGETS = { learned: 6, cards: 2, battles: 1 };
  const DECOMPOSE_REWARDS = { N: 10, R: 20, SR: 35, SSR: 60 };
  const SKILL_COST = 5;
  const SKILLS = {
    heal: { name: '生命药剂', icon: '💚', description: '生命首次降到60或以下时，自动恢复30点' },
    revive: { name: '复活徽章', icon: '🪽', description: '生命归零时复活一次并恢复50点' },
    immunity: { name: '免伤护符', icon: '🧿', description: '抵挡本局第一次受到的伤害' },
    shield: { name: '能量护盾', icon: '🛡️', description: '开局获得35点护盾' },
    critical: { name: '暴击核心', icon: '💥', description: '前3次答对造成双倍伤害' },
  };

  const legacyWords = {
    1: 'explore', 2: 'lighthouse', 3: 'discover', 4: 'journey',
    5: 'brave', 6: 'borrow', 7: 'ancient', 8: 'delicious',
    9: 'invite', 10: 'competition', 11: 'environment', 12: 'repair',
  };

  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  function todayKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function createDailyState() {
    return {
      date: todayKey(), learned: 0, cards: 0, battles: 0,
      claimed: { learned: false, cards: false, battles: false, all: false },
    };
  }

  function ensureDaily() {
    if (!state.daily || state.daily.date !== todayKey()) {
      state.daily = createDailyState();
    }
    state.daily.claimed ||= { learned: false, cards: false, battles: false, all: false };
    return state.daily;
  }

  function normalizeCardId(id) {
    const numeric = Number(id);
    if (CARDS.some(card => card.id === numeric)) return numeric;
    const word = legacyWords[numeric];
    return word ? CARDS.find(card => card.word === word)?.id ?? null : null;
  }

  function loadUpgradeState() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (_) {}

    const scalarFields = ['score', 'gems', 'mastered', 'streakDays'];
    scalarFields.forEach(field => {
      if (saved[field] != null) state[field] = Number(saved[field]) || 0;
    });

    state.owned = [...new Set((saved.owned || state.owned || [])
      .map(normalizeCardId).filter(Boolean))];
    state.deck = [...new Set((saved.deck || state.deck || [])
      .map(normalizeCardId).filter(id => id && state.owned.includes(id)))].slice(0, 5);
    state.wrong = [...new Set((saved.wrong || state.wrong || [])
      .map(normalizeCardId).filter(Boolean))];

    state.cardCopies = {};
    if (saved.cardCopies && typeof saved.cardCopies === 'object') {
      Object.entries(saved.cardCopies).forEach(([id, quantity]) => {
        const normalized = normalizeCardId(id);
        if (normalized && Number(quantity) > 0) {
          state.cardCopies[normalized] = Math.floor(Number(quantity));
        }
      });
    }
    state.owned.forEach(id => {
      state.cardCopies[id] = Math.max(1, state.cardCopies[id] || 0);
    });
    state.owned = Object.keys(state.cardCopies).map(Number);

    state.skills = {};
    Object.keys(SKILLS).forEach(type => {
      state.skills[type] = Math.max(0, Math.floor(Number(saved.skills?.[type]) || 0));
    });
    state.daily = saved.daily || createDailyState();
    state.wordProgress = saved.wordProgress && typeof saved.wordProgress === 'object' ? saved.wordProgress : {};
    state.dailyPlan = saved.dailyPlan && typeof saved.dailyPlan === 'object' ? saved.dailyPlan : null;
    state.lastStudyDate = typeof saved.lastStudyDate === 'string' ? saved.lastStudyDate : null;
    ensureDaily();
    state.collectionPage = 1;
    state.collectionSearch = '';
    state.collectionOwnership = 'ALL';
    state.selectedSkill = null;
    state.activeBattleSkill = null;
    state.battleSetup = true;
    state.battleReward = null;
    state.battleStats = { correct: 0, wrong: 0, maxCombo: 0 };
  }

  function persistState() {
    ensureDaily();
    grantDailyRewards();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      v: 5,
      owned: state.owned,
      deck: state.deck,
      score: state.score,
      gems: state.gems,
      wrong: state.wrong,
      mastered: state.mastered,
      streakDays: state.streakDays,
      cardCopies: state.cardCopies,
      skills: state.skills,
      daily: state.daily,
      wordProgress: state.wordProgress || {},
      dailyPlan: state.dailyPlan || null,
      lastStudyDate: state.lastStudyDate || null,
      build: window.__KET_BUILD__ || 'ket-v5-srs',
    }));
  }

  function showToast(message) {
    let toast = document.getElementById('game-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'game-toast';
      toast.className = 'game-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.remove('show');
    requestAnimationFrame(() => toast.classList.add('show'));
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function grantDailyRewards() {
    const daily = ensureDaily();
    const rewards = [];
    if (daily.learned >= DAILY_TARGETS.learned && !daily.claimed.learned) {
      daily.claimed.learned = true;
      state.score += 20;
      rewards.push('学习任务 +20⭐');
    }
    if (daily.cards >= DAILY_TARGETS.cards && !daily.claimed.cards) {
      daily.claimed.cards = true;
      state.gems += 2;
      rewards.push('卡牌任务 +2💎');
    }
    if (daily.battles >= DAILY_TARGETS.battles && !daily.claimed.battles) {
      daily.claimed.battles = true;
      state.score += 30;
      rewards.push('对战任务 +30⭐');
    }
    if (daily.claimed.learned && daily.claimed.cards && daily.claimed.battles && !daily.claimed.all) {
      daily.claimed.all = true;
      state.gems += 3;
      rewards.push('全勤奖励 +3💎');
    }
    if (rewards.length) setTimeout(() => showToast(rewards.join(' · ')), 0);
  }

  function getCardQuantity(id) {
    return Math.max(0, Number(state.cardCopies?.[id]) || 0);
  }

  function adventureProgress() {
    const absoluteLevel = Math.floor(Math.max(0, state.mastered) / 6) + 1;
    const chapter = Math.floor((absoluteLevel - 1) / 6) + 1;
    const level = ((absoluteLevel - 1) % 6) + 1;
    const start = Math.min(Math.max(1, level - 1), 3);
    return { chapter, level, start };
  }

  function renderMapNodes(progress) {
    return [0, 1, 2, 3].map(index => {
      const nodeLevel = progress.start + index;
      const position = `n${index + 1}`;
      const status = nodeLevel < progress.level ? 'done' : nodeLevel === progress.level ? 'current' : '';
      const icon = nodeLevel < progress.level ? '✓' : nodeLevel === progress.level ? '⚑' : '🔒';
      return `<div class="node ${position} ${status}">${icon}<small>${progress.chapter}-${nodeLevel}</small></div>`;
    }).join('');
  }

  function progressPercent(value, target) {
    return Math.min(100, Math.round(value / target * 100));
  }

  function dailyTask(icon, title, description, value, target, reward, complete) {
    return `<article class="daily-task ${complete ? 'complete' : ''}">
      <div class="daily-task-icon">${icon}</div>
      <div class="daily-task-body"><div class="daily-task-title"><h3>${title}</h3><strong>${Math.min(value, target)}/${target}</strong></div>
      <p>${description}</p><div class="daily-progress"><i style="width:${progressPercent(value, target)}%"></i></div>
      <small>${complete ? `✓ 已完成 · ${reward}` : `奖励 ${reward}`}</small></div>
    </article>`;
  }

  function renderUpgradedHome() {
    const progress = adventureProgress();
    const daily = ensureDaily();
    const doneCount = ['learned', 'cards', 'battles'].filter(key => daily.claimed[key]).length;
    return `<section class="hero"><div class="hero-copy"><p class="eyebrow">LEVEL ${progress.chapter} · WORD EXPLORER</p>
      <h1>KET单词<br><span class="gradient">大冒险</span></h1><p class="subtitle">每天10分钟，闯关记住KET核心词汇</p>
      <button class="cta" onclick="startQuiz()">开始今日冒险 <span class="arrow">›</span></button></div>
      <div class="map"><div class="map-label">第${progress.chapter}章 · 奇境启程 <span>${progress.level}/6</span></div><div class="path"></div>
      ${renderMapNodes(progress)}<div class="cards"><div class="game-card blue"><small>SR</small><b>explore</b><span>探索</span></div>
      <div class="game-card gold"><small>SSR</small><b>lighthouse</b><span>灯塔</span></div><div class="game-card purple"><small>R</small><b>discover</b><span>发现</span></div></div></div></section>
      <section class="metrics"><div><b>🔥</b><p>连续学习<strong>${state.streakDays} <small>天</small></strong></p></div>
      <div><b>📖</b><p>已掌握<strong>${state.mastered} <small>词</small></strong></p></div>
      <div><b>🃏</b><p>卡牌图鉴<strong>${state.owned.length}<small>/${CARDS.length}</small></strong></p></div></section>
      <section class="missions daily-missions"><div class="section-title"><div><p>DAILY QUESTS</p><h2>今日任务</h2></div>
      <span>${doneCount}/3 完成${daily.claimed.all ? ' · 全勤奖励已领取' : ' · 全部完成额外 +3💎'}</span></div>
      <div class="daily-grid">${dailyTask('🎯', '学习新词', '完成6次单词答题', daily.learned, 6, '+20⭐', daily.claimed.learned)}
      ${dailyTask('🃏', '今日获得卡牌', '抽取2张卡牌，重复卡也计入', daily.cards, 2, '+2💎', daily.claimed.cards)}
      ${dailyTask('⚔️', '完成卡牌对战', '完成1场三波守关战', daily.battles, 1, '+30⭐', daily.claimed.battles)}
      <article class="daily-task skill-supply"><div class="daily-task-icon">🎲</div><div class="daily-task-body"><div class="daily-task-title"><h3>技能补给</h3><strong>5💎</strong></div>
      <p>随机获得1个一次性战斗技能</p><button onclick="drawSkill()" ${state.gems < SKILL_COST ? 'disabled' : ''}>${state.gems < SKILL_COST ? '钻石不足' : '抽取技能'}</button></div></article></div></section>`;
  }

  function filteredCards() {
    let list = state.collectionFilter === 'ALL' ? CARDS : CARDS.filter(card => card.rarity === state.collectionFilter);
    const keyword = state.collectionSearch.trim().toLowerCase();
    if (keyword) list = list.filter(card => card.word.toLowerCase().includes(keyword) || card.meaning.includes(keyword));
    if (state.collectionOwnership === 'OWNED') list = list.filter(card => getCardQuantity(card.id) > 0);
    if (state.collectionOwnership === 'LOCKED') list = list.filter(card => getCardQuantity(card.id) === 0);
    if (state.collectionOwnership === 'DUPLICATE') list = list.filter(card => getCardQuantity(card.id) > 1);
    return list;
  }

  function renderPager(page, totalPages) {
    if (totalPages <= 1) return '';
    const pages = new Set([1, totalPages, page - 2, page - 1, page, page + 1, page + 2]);
    const visible = [...pages].filter(value => value >= 1 && value <= totalPages).sort((a, b) => a - b);
    let previous = 0;
    const buttons = visible.map(value => {
      const gap = previous && value - previous > 1 ? '<span>…</span>' : '';
      previous = value;
      return `${gap}<button class="${value === page ? 'active' : ''}" onclick="goCollectionPage(${value})">${value}</button>`;
    }).join('');
    return `<div class="pager"><button onclick="goCollectionPage(${page - 1})" ${page === 1 ? 'disabled' : ''}>← 上一页</button>${buttons}
      <button onclick="goCollectionPage(${page + 1})" ${page === totalPages ? 'disabled' : ''}>下一页 →</button>
      <label>跳转 <input id="page-jump" type="number" min="1" max="${totalPages}" value="${page}"></label><button onclick="jumpCollectionPage()">确定</button></div>`;
  }

  function renderUpgradedCollection() {
    const list = filteredCards();
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    state.collectionPage = Math.min(Math.max(1, state.collectionPage), totalPages);
    const start = (state.collectionPage - 1) * PAGE_SIZE;
    const cards = list.slice(start, start + PAGE_SIZE);
    return `<section class="collection-screen"><div class="collection-head"><div><p class="eyebrow">WORD CARD GALLERY</p><h1>单词卡牌图鉴</h1>
      <p>已收集 <b>${state.owned.length}</b>/${CARDS.length} · 当前筛选 ${list.length} 张 · 第 ${state.collectionPage}/${totalPages} 页</p></div>
      <button class="pack-button" onclick="openPack()" ${state.score < 50 ? 'disabled' : ''}>🎁 开启卡包 <small>50 ⭐</small></button></div>
      <div class="deck-bar five"><span>出战卡组</span>${[0,1,2,3,4].map(index => { const card = CARDS.find(item => item.id === state.deck[index]);
        return card ? `<div><b>${card.icon} ${escapeHtml(card.word)}</b><small>${card.rarity} · ⚔${card.power}</small></div>` : '<div><em>+ 选择卡牌</em></div>'; }).join('')}</div>
      <div class="collection-tools"><form onsubmit="applyCollectionSearch();return false"><input id="collection-search" value="${escapeHtml(state.collectionSearch)}" placeholder="搜索英文单词或中文意思"><button>搜索</button>${state.collectionSearch ? '<button type="button" onclick="clearCollectionSearch()">清除</button>' : ''}</form>
      <div class="ownership-filter">${[['ALL','全部'],['OWNED','已获得'],['LOCKED','未获得'],['DUPLICATE','重复卡']].map(([value,label]) => `<button class="${state.collectionOwnership === value ? 'active' : ''}" onclick="setOwnershipFilter('${value}')">${label}</button>`).join('')}</div></div>
      <div class="filter-row">${['ALL','N','R','SR','SSR'].map(value => `<button class="${state.collectionFilter === value ? 'active' : ''}" onclick="setFilter('${value}')">${value === 'ALL' ? '全部稀有度' : value}</button>`).join('')}</div>
      ${cards.length ? `<div class="collection-grid">${cards.map(renderCollectionCard).join('')}</div>` : '<div class="empty"><span>🔎</span><h2>没有符合条件的卡牌</h2><p>换一个关键词或筛选条件试试。</p></div>'}
      ${renderPager(state.collectionPage, totalPages)}</section>`;
  }

  function renderCollectionCard(card) {
    const quantity = getCardQuantity(card.id);
    const owned = quantity > 0;
    const inDeck = state.deck.includes(card.id);
    return `<div class="card-cell"><button class="collect-card rarity-${card.rarity}${owned ? '' : ' locked'}${inDeck ? ' selected' : ''}" onclick="toggleDeck(${card.id})" ${owned ? '' : 'disabled'}>
      <div class="card-top"><b>${card.rarity}</b><span>⚔ ${card.power}</span></div>${quantity > 0 ? `<span class="copy-badge">持有 ×${quantity}</span>` : ''}
      <div class="card-art">${owned ? card.icon : '?'}</div><small>${escapeHtml(card.group)}</small><h3>${owned ? escapeHtml(card.word) : '未解锁'}</h3>
      <p>${owned ? escapeHtml(card.meaning) : '继续学习来发现'}</p>${owned ? `<em>${escapeHtml(card.phonetic)}</em>` : ''}</button>
      ${owned ? `<div class="card-actions"><button onclick="speakCard(${card.id})">🔊 发音</button>${quantity > 1 ? `<button class="decompose" onclick="decomposeCard(${card.id})">♻ 分解 +${DECOMPOSE_REWARDS[card.rarity]}⭐</button>` : ''}</div>` : ''}</div>`;
  }

  function renderPackModal() {
    const card = state.newCard;
    const quantity = getCardQuantity(card.id);
    const duplicate = quantity > 1;
    return `<div class="modal"><div class="pack-result"><p>${duplicate ? 'DUPLICATE!' : 'NEW CARD!'}</p><h2>${duplicate ? `重复卡牌 · 现有 ×${quantity}` : '获得新卡牌'}</h2>
      <button class="collect-card rarity-${card.rarity}" style="cursor:default"><div class="card-top"><b>${card.rarity}</b><span>⚔ ${card.power}</span></div>
      <div class="card-art">${card.icon}</div><small>${escapeHtml(card.group)}</small><h3>${escapeHtml(card.word)}</h3><p>${escapeHtml(card.meaning)}</p><em>${escapeHtml(card.phonetic)}</em></button>
      <button onclick="closeNewCard()">${duplicate ? '收入卡牌仓库' : '收入图鉴'}</button></div></div>`;
  }

  function drawCard() {
    const ownedPool = CARDS.filter(card => getCardQuantity(card.id) > 0);
    const allowDuplicate = ownedPool.length > 0 && Math.random() < 0.25;
    const pool = allowDuplicate ? ownedPool : CARDS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function renderSkillSetup() {
    const deckCards = state.deck.map(id => CARDS.find(card => card.id === id)).filter(Boolean);
    const skillCards = Object.entries(SKILLS).map(([type, skill]) => {
      const quantity = state.skills[type] || 0;
      const selected = state.selectedSkill === type;
      return `<button class="skill-card ${selected ? 'selected' : ''}" onclick="selectBattleSkill('${type}')" ${quantity < 1 ? 'disabled' : ''}>
        <span>${skill.icon}</span><h3>${skill.name}</h3><p>${skill.description}</p><strong>持有 ×${quantity}</strong></button>`;
    }).join('');
    return `<section class="battle-screen battle-setup"><div class="battle-top"><div><p class="eyebrow">BATTLE PREPARATION</p><h1>战斗准备</h1></div>
      <button class="skill-draw" onclick="drawSkill()" ${state.gems < SKILL_COST ? 'disabled' : ''}>🎲 技能补给 · ${SKILL_COST}💎</button></div>
      <div class="setup-panel"><h2>选择1个一次性技能</h2><p>技能将在进入战斗时消耗；也可以不使用技能直接开始。</p>
      <div class="skill-grid">${skillCards}</div><button class="no-skill ${state.selectedSkill === null ? 'active' : ''}" onclick="selectBattleSkill(null)">不使用技能</button></div>
      <div class="setup-deck"><h2>本局卡组 <small>${deckCards.length}/5</small></h2><div>${deckCards.map(card => `<span>${card.icon} ${escapeHtml(card.word)}</span>`).join('') || '<p>尚未选择卡牌</p>'}</div></div>
      ${deckCards.length < 3 ? '<div class="setup-warning">至少需要3张卡牌才能开始。<button onclick="setScreen(\'collection\')">前往图鉴组卡</button></div>' : `<button class="battle-start" onclick="beginBattle()">进入三波守关战 →</button>`}</section>`;
  }

  function initializeBattle() {
    state.battleStage = 0;
    state.battleHp = 120;
    state.battleShield = 0;
    state.battleEnemyHp = ENEMIES[0].hp;
    state.battleEnergy = 4;
    state.battleCombo = 0;
    state.battleTurn = 1;
    state.battleChosen = null;
    state.battleChoices = [];
    state.battleLog = ['新一轮战斗开始！'];
    state.battleDone = false;
    state.battleWon = false;
    state.battleEffect = null;
    state.battleFloat = '';
    state.battleReward = null;
    state.battleRecorded = false;
    state.battleStats = { correct: 0, wrong: 0, maxCombo: 0 };
    state.battleSkillState = { heal: false, revive: false, immunity: false, criticalCharges: 0 };
  }

  function activeSkillStatus() {
    const type = state.activeBattleSkill;
    if (!type) return '<span>无附加技能</span>';
    const skill = SKILLS[type];
    const skillState = state.battleSkillState || {};
    let suffix = '';
    if (type === 'critical') suffix = ` · 剩余${skillState.criticalCharges}次`;
    if (['heal','revive','immunity'].includes(type)) suffix = skillState[type] ? ' · 待触发' : ' · 已触发';
    return `<span>${skill.icon} ${skill.name}${suffix}</span>`;
  }

  function renderUpgradedBattle() {
    if (state.battleSetup !== false) return renderSkillSetup();
    const deckCards = state.deck.map(id => CARDS.find(card => card.id === id)).filter(Boolean);
    const foe = ENEMIES[state.battleStage];
    const turn = state.battleTurn;
    const intent = turn % 3 === 0 ? { icon: '🌀', text: '蓄力：下回合伤害+12' } : turn % 2 === 0 ? { icon: '🛡️', text: '防御：恢复26生命' } : { icon: '⚔️', text: `攻击：造成${foe.attack}伤害` };
    const result = state.battleDone ? `<h2>${state.battleWon ? '🏆 远征胜利！' : '💥 挑战失败'}</h2>
      <p>${state.battleWon ? `获得30⭐和${state.battleReward?.total || 0}💎` : '调整卡组或携带技能后再来挑战。'}</p>
      ${state.battleWon ? `<div class="reward-breakdown">基础3💎${state.battleReward.hp ? ' · 高血量+2' : ''}${state.battleReward.combo ? ' · 高连击+1' : ''}${state.battleReward.perfect ? ' · 零失误+1' : ''}</div>` : ''}
      <button class="reset-battle" onclick="resetBattle()">重新准备</button>` : state.battleChosen ? `<p class="question-label">释放「${escapeHtml(state.battleChosen.word)}」技能：请选择正确释义</p>
      <div class="battle-answers">${state.battleChoices.map((choice, index) => `<button onclick="resolveBattleChoice(${index})">${escapeHtml(choice)}</button>`).join('')}</div>` : '<p>选择卡牌使用技能，能量用完后结束回合。</p><button class="end-turn" onclick="endBattleTurn()">结束回合 →</button>';
    return `<section class="battle-screen advanced"><div class="battle-top"><div><p class="eyebrow">WORD BATTLE · 遗迹远征</p><h1>三波守关战</h1></div>
      <div class="wave-dots">${ENEMIES.map((enemy,index) => `<span class="${index < state.battleStage ? 'clear' : index === state.battleStage ? 'now' : ''}">${index < state.battleStage ? '✓' : index + 1}</span>`).join('')}</div>
      <div class="intent"><small>敌人意图</small><b>${intent.icon} ${intent.text}</b></div></div>
      <div class="active-skill">${activeSkillStatus()}</div><div class="advanced-arena effect-${state.battleEffect || 'idle'}"><div class="enemy-zone"><div class="unit-head"><b>${foe.name}</b><span>${state.battleEnemyHp}/${foe.hp}</span></div>
      <div class="hp wide"><i style="width:${state.battleEnemyHp / foe.hp * 100}%"></i></div><div class="big-enemy">${foe.icon}</div><div class="status-row"><span>第 ${state.battleStage + 1}/3 波</span></div></div>
      <div class="center-fx"><b>回合 ${turn}</b><span class="${state.battleCombo >= 3 ? 'combo-hot' : ''}">⚡ 连击 ×${state.battleCombo}</span>${state.battleFloat ? `<strong class="damage-float">${state.battleFloat}</strong>` : ''}</div>
      <div class="player-zone"><div class="unit-head"><b>单词探索者</b><span>${state.battleHp}/120</span></div><div class="hp wide player-hp"><i style="width:${state.battleHp / 120 * 100}%"></i></div>
      <div class="big-player">🤖</div><div class="status-row"><span>🛡️ 护盾 ${state.battleShield}</span><span>⚡ 能量 ${state.battleEnergy}/4</span></div></div></div>
      <div class="battle-console"><div class="combat-log">${state.battleLog.map((line,index) => `<p class="${index === 0 ? 'latest' : ''}">${escapeHtml(line)}</p>`).join('')}</div><div class="turn-panel">${result}</div></div>
      <div class="advanced-deck">${deckCards.map(card => { const cost = card.rarity === 'SSR' ? 3 : card.rarity === 'SR' ? 2 : 1;
        const skill = card.group === '品质' ? '答对：获得24护盾' : card.group === '旅行' ? '答对：攻击并回复12生命' : card.group === '冒险' ? '答对：连击伤害+15' : `答对：造成${card.power}伤害`;
        return `<button class="battle-card rarity-${card.rarity}${state.battleEnergy < cost ? ' disabled' : ''}" onclick="playBattleCard(${card.id})" ${state.battleEnergy < cost || state.battleChosen || state.battleDone ? 'disabled' : ''}>
          <div><b>${card.rarity}</b><span>${card.icon}</span><em>⚡${cost}</em></div><h3>${escapeHtml(card.word)}</h3><p>${skill}</p><strong>⚔ ${card.power}</strong></button>`; }).join('')}</div></section>`;
  }

  function applyPlayerDamage(amount) {
    const skillState = state.battleSkillState;
    if (skillState?.immunity) {
      skillState.immunity = false;
      state.battleLog = ['🧿 免伤护符抵挡了本次伤害', ...state.battleLog].slice(0, 4);
      battleFlash('shield', 'IMMUNE');
      return 0;
    }
    const absorbed = Math.min(state.battleShield, amount);
    const real = amount - absorbed;
    state.battleShield = Math.max(0, state.battleShield - amount);
    state.battleHp = Math.max(0, state.battleHp - real);
    if (state.battleHp > 0 && state.battleHp <= 60 && skillState?.heal) {
      skillState.heal = false;
      state.battleHp = Math.min(120, state.battleHp + 30);
      state.battleLog = ['💚 生命药剂自动恢复30点生命', ...state.battleLog].slice(0, 4);
      battleFlash('heal', '+30 HP');
    }
    if (state.battleHp === 0 && skillState?.revive) {
      skillState.revive = false;
      state.battleHp = 50;
      state.battleLog = ['🪽 复活徽章触发，恢复50点生命', ...state.battleLog].slice(0, 4);
      battleFlash('heal', 'REVIVE');
    }
    return real;
  }

  function finishBattle(won) {
    if (state.battleDone) return;
    state.battleDone = true;
    state.battleWon = won;
    if (!state.battleRecorded) {
      state.battleRecorded = true;
      ensureDaily().battles += 1;
    }
    if (won) {
      const hp = state.battleHp >= 80 ? 2 : 0;
      const combo = state.battleStats.maxCombo >= 5 ? 1 : 0;
      const perfect = state.battleStats.wrong === 0 ? 1 : 0;
      const total = 3 + hp + combo + perfect;
      state.battleReward = { total, hp, combo, perfect };
      state.score += 30;
      state.gems += total;
    }
    saveState();
  }

  saveState = persistState;
  renderHome = renderUpgradedHome;
  renderCollection = renderUpgradedCollection;
  renderBattle = renderUpgradedBattle;
  renderNewCardModal = renderPackModal;

  answer = function (option) {
    if (state.selected) return;
    const card = CARDS[state.quizIndex];
    state.selected = option;
    ensureDaily().learned += 1;
    if (option === card.meaning) {
      state.score += 10;
      state.streak += 1;
      state.mastered += 1;
    } else {
      state.streak = 0;
      if (!state.wrong.includes(card.id)) state.wrong.push(card.id);
    }
    saveState();
    render();
  };

  openPack = function (free) {
    if (!free && state.score < 50) return;
    if (!free) state.score -= 50;
    const card = drawCard();
    const previous = getCardQuantity(card.id);
    state.cardCopies[card.id] = previous + 1;
    if (previous === 0) state.owned.push(card.id);
    ensureDaily().cards += 1;
    state.newCard = card;
    saveState();
    render();
  };

  toggleDeck = function (id) {
    if (getCardQuantity(id) < 1) return;
    if (state.deck.includes(id)) state.deck = state.deck.filter(cardId => cardId !== id);
    else if (state.deck.length < 5) state.deck.push(id);
    else showToast('出战卡组最多5张');
    saveState();
    render();
  };

  setFilter = function (filter) {
    state.collectionFilter = filter;
    state.collectionPage = 1;
    render();
  };

  setScreen = function (screen) {
    state.screen = screen;
    if (screen === 'battle') {
      state.battleSetup = true;
      state.selectedSkill = null;
    }
    render();
  };

  resetBattle = function () {
    state.battleSetup = true;
    state.selectedSkill = null;
    state.activeBattleSkill = null;
    render();
  };

  playBattleCard = function (id) {
    if (state.battleDone || state.battleChosen) return;
    const card = CARDS.find(item => item.id === id);
    if (!card) return;
    const cost = card.rarity === 'SSR' ? 3 : card.rarity === 'SR' ? 2 : 1;
    if (state.battleEnergy < cost) return;
    const wrongMeanings = [];
    const candidates = [...CARDS].sort(() => Math.random() - 0.5);
    for (const candidate of candidates) {
      if (candidate.id !== card.id && candidate.meaning !== card.meaning && !wrongMeanings.includes(candidate.meaning)) {
        wrongMeanings.push(candidate.meaning);
      }
      if (wrongMeanings.length === 3) break;
    }
    state.battleChosen = card;
    state.battleChoices = [card.meaning, ...wrongMeanings].sort(() => Math.random() - 0.5);
    render();
  };

  resolveBattle = function (answer) {
    if (!state.battleChosen || state.battleDone) return;
    const chosen = state.battleChosen;
    const correct = answer === chosen.meaning;
    const cost = chosen.rarity === 'SSR' ? 3 : chosen.rarity === 'SR' ? 2 : 1;
    state.battleEnergy -= cost;
    if (correct) {
      state.battleStats.correct += 1;
      let damage = chosen.power + state.battleCombo * 5;
      if (chosen.group === '冒险') damage += 15;
      if (state.battleSkillState?.criticalCharges > 0) {
        damage *= 2;
        state.battleSkillState.criticalCharges -= 1;
      }
      if (chosen.group === '品质') {
        state.battleShield += 24;
        damage = Math.round(damage * 0.55);
        battleFlash('shield', '+24 SHIELD');
      } else if (chosen.group === '旅行') {
        state.battleHp = Math.min(120, state.battleHp + 12);
        battleFlash('heal', '+12 HP');
      } else battleFlash('hit', `-${damage}`);
      state.battleEnemyHp = Math.max(0, state.battleEnemyHp - damage);
      state.battleCombo += 1;
      state.battleStats.maxCombo = Math.max(state.battleStats.maxCombo, state.battleCombo);
      state.battleLog = [`✓ ${chosen.word}：造成${damage}伤害`, ...state.battleLog].slice(0, 4);
      if (state.battleEnemyHp === 0) {
        if (state.battleStage < 2) {
          state.battleStage += 1;
          state.battleEnemyHp = ENEMIES[state.battleStage].hp;
          state.battleEnergy = 4;
          state.battleShield += 15;
          state.battleTurn += 1;
          state.battleLog = [`第${state.battleStage + 1}波敌人出现，获得15护盾`, ...state.battleLog].slice(0, 4);
        } else finishBattle(true);
      }
    } else {
      state.battleStats.wrong += 1;
      state.battleCombo = 0;
      const counter = 10 + state.battleStage * 4;
      const real = applyPlayerDamage(counter);
      state.battleLog = [`✕ ${chosen.word}：答错并受到${real}点反击`, ...state.battleLog].slice(0, 4);
      if (state.battleHp === 0) finishBattle(false);
      else battleFlash('hurt', `-${real} COUNTER`);
    }
    state.battleChosen = null;
    state.battleChoices = [];
    render();
  };

  endBattleTurn = function () {
    if (state.battleDone || state.battleChosen) return;
    const foe = ENEMIES[state.battleStage];
    const turn = state.battleTurn;
    if (turn % 2 === 0) {
      state.battleEnemyHp = Math.min(foe.hp, state.battleEnemyHp + 26);
      state.battleLog = [`${foe.name}恢复了26生命`, ...state.battleLog].slice(0, 4);
      battleFlash('heal', '+26 ENEMY');
    } else if (turn % 3 !== 0) {
      let damage = foe.attack;
      if (turn % 3 === 1 && turn > 3) damage += 16;
      const real = applyPlayerDamage(damage);
      state.battleLog = [`${foe.name}发动攻击，受到${real}点伤害`, ...state.battleLog].slice(0, 4);
      if (state.battleHp === 0) finishBattle(false);
      else battleFlash('hurt', `-${real}`);
    } else {
      state.battleLog = [`${foe.name}正在蓄力`, ...state.battleLog].slice(0, 4);
    }
    state.battleEnergy = 4;
    state.battleTurn += 1;
    render();
  };

  window.goCollectionPage = function (page) {
    const totalPages = Math.max(1, Math.ceil(filteredCards().length / PAGE_SIZE));
    state.collectionPage = Math.min(Math.max(1, page), totalPages);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  window.jumpCollectionPage = function () {
    const input = document.getElementById('page-jump');
    goCollectionPage(Number(input?.value) || 1);
  };
  window.applyCollectionSearch = function () {
    state.collectionSearch = document.getElementById('collection-search')?.value.trim() || '';
    state.collectionPage = 1;
    render();
  };
  window.clearCollectionSearch = function () { state.collectionSearch = ''; state.collectionPage = 1; render(); };
  window.setOwnershipFilter = function (filter) { state.collectionOwnership = filter; state.collectionPage = 1; render(); };
  window.speakCard = function (id) { const card = CARDS.find(item => item.id === id); if (card) speak(card.word); };
  window.decomposeCard = function (id) {
    const card = CARDS.find(item => item.id === id);
    if (!card || getCardQuantity(id) <= 1) return showToast('至少需要保留1张卡牌');
    state.cardCopies[id] -= 1;
    const reward = DECOMPOSE_REWARDS[card.rarity] || 10;
    state.score += reward;
    saveState();
    render();
    showToast(`已分解 ${card.word}，获得${reward}⭐`);
  };
  window.drawSkill = function () {
    if (state.gems < SKILL_COST) return showToast('钻石不足，需要5💎');
    const types = Object.keys(SKILLS);
    const type = types[Math.floor(Math.random() * types.length)];
    state.gems -= SKILL_COST;
    state.skills[type] += 1;
    saveState();
    render();
    showToast(`获得 ${SKILLS[type].icon} ${SKILLS[type].name}`);
  };
  window.selectBattleSkill = function (type) {
    state.selectedSkill = type && state.skills[type] > 0 ? type : null;
    render();
  };
  window.beginBattle = function () {
    if (state.deck.length < 3) return showToast('至少选择3张卡牌');
    initializeBattle();
    const type = state.selectedSkill;
    if (type && state.skills[type] > 0) {
      state.skills[type] -= 1;
      state.activeBattleSkill = type;
      state.battleSkillState[type] = type === 'critical' ? false : true;
      if (type === 'critical') state.battleSkillState.criticalCharges = 3;
      if (type === 'shield') state.battleShield = 35;
    } else state.activeBattleSkill = null;
    state.battleSetup = false;
    saveState();
    render();
  };
  window.resolveBattleChoice = function (index) {
    const choice = state.battleChoices[index];
    if (choice != null) resolveBattle(choice);
  };

  const style = document.createElement('style');
  style.textContent = `
    .daily-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:13px}.daily-task{min-height:150px;border:1px solid #514a9c;border-radius:16px;padding:15px;background:linear-gradient(145deg,#171444,#0d0d31);display:flex;gap:12px}.daily-task.complete{border-color:#28c899;background:linear-gradient(145deg,#123b35,#0d2230)}.daily-task-icon{font-size:31px}.daily-task-body{flex:1}.daily-task-title{display:flex;justify-content:space-between;gap:8px}.daily-task h3{margin:0;font-size:15px}.daily-task p{color:#aaa7ca;font-size:12px;line-height:1.5;min-height:36px}.daily-task small{color:#66e6d3}.daily-progress{height:7px;border-radius:9px;background:#282653;overflow:hidden;margin:10px 0}.daily-progress i{display:block;height:100%;background:linear-gradient(90deg,#48dfca,#6a7dff)}.skill-supply button,.skill-draw,.battle-start,.setup-warning button,.no-skill{border:0;border-radius:9px;background:#ffe04b;color:#241700;padding:9px 14px;font-weight:900;cursor:pointer}.skill-supply button:disabled,.skill-draw:disabled{opacity:.4;cursor:not-allowed}
    .collection-tools{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:14px 0;flex-wrap:wrap}.collection-tools form,.ownership-filter{display:flex;gap:7px}.collection-tools input{min-width:260px;background:#111038;border:1px solid #47427d;border-radius:9px;color:#fff;padding:9px 12px}.collection-tools button,.ownership-filter button,.pager button{border:1px solid #46417e;background:#171541;color:#bbb7dc;border-radius:8px;padding:8px 12px;cursor:pointer}.ownership-filter button.active,.pager button.active{background:#5e45d4;border-color:#9a8bff;color:#fff}.copy-badge{position:absolute;right:12px;top:45px;background:#0b0a2ddd;border:1px solid #ffe36a;color:#ffe36a;padding:4px 8px;border-radius:10px;font-size:11px;font-weight:900}.card-actions{position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:center;gap:6px}.card-actions button{border:1px solid #454078;background:#14123a;color:#ccc;border-radius:8px;padding:5px 9px;cursor:pointer;font-size:11px}.card-actions .decompose{border-color:#e09b3d;color:#ffd18c}.pager{display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap;margin:25px 0}.pager button:disabled{opacity:.35}.pager label{color:#aaa7ca;font-size:12px;margin-left:8px}.pager input{width:58px;background:#111038;border:1px solid #47427d;border-radius:7px;color:#fff;padding:7px}
    .battle-setup{max-width:1100px}.setup-panel,.setup-deck{border:1px solid #39357a;background:#0e0d31;border-radius:18px;padding:20px;margin:14px 0}.setup-panel>p{color:#aaa7ca}.skill-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:16px 0}.skill-card{border:2px solid #49447f;background:#171541;color:#fff;border-radius:14px;padding:14px;text-align:left;cursor:pointer}.skill-card>span{font-size:35px}.skill-card h3{margin:7px 0}.skill-card p{color:#aaa7ca;font-size:12px;min-height:52px}.skill-card strong{color:#64e7da;font-size:12px}.skill-card.selected{border-color:#ffe04b;box-shadow:0 0 20px #ffd63355}.skill-card:disabled{opacity:.35;cursor:not-allowed}.no-skill{background:#252153;color:#ccc}.no-skill.active{outline:2px solid #7d6fff}.setup-deck div{display:flex;gap:8px;flex-wrap:wrap}.setup-deck span{border:1px solid #49447f;background:#171541;border-radius:9px;padding:8px 11px}.setup-warning{text-align:center;border:1px solid #c05269;background:#361526;border-radius:14px;padding:17px;color:#ffc0ca}.battle-start{display:block;margin:18px auto;font-size:18px;padding:13px 25px}.active-skill{text-align:center;margin-bottom:9px}.active-skill span{display:inline-block;border:1px solid #4fd5c4;background:#103c3b;border-radius:20px;padding:6px 13px;font-size:12px}.reward-breakdown{color:#ffe168;font-size:12px;margin:9px}.game-toast{position:fixed;left:50%;top:82px;z-index:2000;transform:translate(-50%,-20px);opacity:0;background:#15133f;border:1px solid #68e5d1;color:#fff;padding:11px 18px;border-radius:12px;box-shadow:0 10px 35px #0009;transition:.25s;pointer-events:none}.game-toast.show{transform:translate(-50%,0);opacity:1}
    @media(max-width:1100px){.daily-grid{grid-template-columns:1fr 1fr}.skill-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:700px){.daily-grid,.skill-grid{grid-template-columns:1fr}.collection-tools{align-items:stretch}.collection-tools form{flex-wrap:wrap}.collection-tools input{min-width:0;width:100%}.ownership-filter{flex-wrap:wrap}}
  `;
  document.head.appendChild(style);

  loadUpgradeState();
  saveState();
  render();
})();
