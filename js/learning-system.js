(function () {
  'use strict';

  const Core = window.KETLearningCore;
  if (!Core) throw new Error('KETLearningCore failed to load');

  const today = Core.todayKey();
  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

  function migrateLegacyProgress() {
    state.wordProgress ||= {};
    if (Object.keys(state.wordProgress).length || !state.mastered) return;
    const legacyUniqueCount = Math.min(6, Math.max(0, Number(state.mastered) || 0), CARDS.length);
    const yesterday = Core.addDays(today, -1);
    const legacyWords = ['explore', 'lighthouse', 'discover', 'journey', 'brave', 'borrow'];
    const legacyCards = legacyWords.map(word => CARDS.find(card => card.word === word)).filter(Boolean);
    const migrationCards = [...legacyCards, ...CARDS.filter(card => !legacyCards.includes(card))].slice(0, legacyUniqueCount);
    migrationCards.forEach(card => {
      state.wordProgress[card.id] = {
        status: 'learning', firstLearnedAt: yesterday, lastReviewedAt: yesterday,
        lastAttemptAt: yesterday, nextReviewAt: today, intervalIndex: 0,
        correctStreak: 1, wrongCount: 0, reviewCount: 0,
      };
    });
  }

  function ensurePlan() {
    state.wordProgress ||= {};
    state.dailyPlan = Core.buildDailyPlan(CARDS, state.wordProgress, state.dailyPlan, today);
    state.dailyPlan.reinforcedIds ||= [];
    return state.dailyPlan;
  }

  function syncLearningTotals() {
    const plan = ensurePlan();
    state.mastered = Core.learnedCount(state.wordProgress);
    state.daily ||= { date: today, learned: 0, cards: 0, battles: 0, claimed: {} };
    state.daily.learned = plan.completedNewIds.length;
  }

  const baseSaveState = saveState;
  saveState = function () {
    syncLearningTotals();
    baseSaveState();
  };

  function updateStudyStreak() {
    if (state.lastStudyDate === today) return;
    const yesterday = Core.addDays(today, -1);
    state.streakDays = state.lastStudyDate === yesterday ? Math.max(1, state.streakDays + 1) : 1;
    state.lastStudyDate = today;
  }

  function remainingCounts() {
    const plan = ensurePlan();
    return {
      newWords: plan.newIds.filter(id => !plan.completedNewIds.includes(id)).length,
      reviews: plan.reviewIds.filter(id => !plan.completedReviewIds.includes(id)).length,
    };
  }

  function mapNodes(progress) {
    return [0, 1, 2, 3].map(index => {
      const nodeLevel = progress.start + index;
      const status = nodeLevel < progress.level ? 'done' : nodeLevel === progress.level ? 'current' : '';
      const icon = nodeLevel < progress.level ? '✓' : nodeLevel === progress.level ? '⚑' : '🔒';
      return `<div class="node n${index + 1} ${status}">${icon}<small>${progress.chapter}-${nodeLevel}</small></div>`;
    }).join('');
  }

  function dailyTask(icon, title, description, value, target, reward, complete) {
    const percent = target ? Math.min(100, Math.round(value / target * 100)) : 100;
    const counter = target ? `${Math.min(value, target)}/${target}` : '今日无到期';
    return `<article class="daily-task ${complete ? 'complete' : ''}"><div class="daily-task-icon">${icon}</div>
      <div class="daily-task-body"><div class="daily-task-title"><h3>${title}</h3><strong>${counter}</strong></div><p>${description}</p>
      <div class="daily-progress"><i style="width:${percent}%"></i></div><small>${complete ? `✓ 已完成 · ${reward}` : `奖励 ${reward}`}</small></div></article>`;
  }

  function renderLearningHome() {
    const plan = ensurePlan();
    const progress = Core.adventureProgress(state.wordProgress);
    const longTerm = Core.masteredCount(state.wordProgress);
    const remaining = remainingCounts();
    const daily = state.daily;
    const reviewTarget = plan.reviewIds.length;
    const reviewDone = plan.completedReviewIds.length;
    const allPlanDone = remaining.newWords === 0 && remaining.reviews === 0;
    const cta = allPlanDone ? '开始巩固挑战' : (plan.completedNewIds.length || plan.completedReviewIds.length ? '继续今日冒险' : '开始今日冒险');
    const doneCount = ['learned', 'cards', 'battles'].filter(key => daily.claimed?.[key]).length;
    return `<section class="hero"><div class="hero-copy"><p class="eyebrow">LEVEL ${progress.chapter} · WORD EXPLORER</p>
      <h1>KET单词<br><span class="gradient">大冒险</span></h1><p class="subtitle">每日6个新词 + 到期复习，按记忆曲线稳步掌握</p>
      <button class="cta" onclick="startQuiz()">${cta} <span class="arrow">›</span></button>
      <div class="today-brief"><span>新词待完成 ${remaining.newWords}</span><span>复习待完成 ${remaining.reviews}</span></div></div>
      <div class="map"><div class="map-label">第${progress.chapter}章 · 奇境启程 <span>${progress.level}/6</span></div><div class="path"></div>
      ${mapNodes(progress)}<div class="cards"><div class="game-card blue"><small>SR</small><b>explore</b><span>探索</span></div>
      <div class="game-card gold"><small>SSR</small><b>lighthouse</b><span>灯塔</span></div><div class="game-card purple"><small>R</small><b>discover</b><span>发现</span></div></div></div></section>
      <section class="metrics"><div><b>🔥</b><p>连续学习<strong>${state.streakDays} <small>天</small></strong></p></div>
      <div><b>📖</b><p>已学习<strong>${progress.learned} <small>词</small></strong><small class="metric-sub">长期掌握 ${longTerm}</small></p></div>
      <div><b>🃏</b><p>卡牌图鉴<strong>${state.owned.length}<small>/${CARDS.length}</small></strong></p></div></section>
      <section class="memory-panel"><div><span>🧠</span><p><b>记忆计划</b><small>答错会在3–5题后重现；复习间隔为1、3、7、14、30、60天。</small></p></div>
      <strong>${reviewTarget ? `${reviewDone}/${reviewTarget} 已复习` : '今天没有到期复习'}</strong></section>
      <section class="missions daily-missions"><div class="section-title"><div><p>DAILY QUESTS</p><h2>今日任务</h2></div>
      <span>${doneCount}/3 完成${daily.claimed?.all ? ' · 全勤奖励已领取' : ' · 全部完成额外 +3💎'}</span></div><div class="daily-grid five-tasks">
      ${dailyTask('🎯', '学习新词', '首次学会6个不同单词', plan.completedNewIds.length, plan.newIds.length || 6, '+20⭐及免费卡包', daily.claimed?.learned)}
      ${dailyTask('🧠', '到期复习', reviewTarget ? '按记忆曲线完成今天到期词' : '复习计划会在后续学习日自动出现', reviewDone, reviewTarget, '+15⭐', reviewTarget === 0 || plan.reviewRewardClaimed)}
      ${dailyTask('🃏', '今日获得卡牌', '抽取2张卡牌，重复卡也计入', daily.cards, 2, '+2💎', daily.claimed?.cards)}
      ${dailyTask('⚔️', '完成卡牌对战', '完成1场三波守关战', daily.battles, 1, '+30⭐', daily.claimed?.battles)}
      <article class="daily-task skill-supply"><div class="daily-task-icon">🎲</div><div class="daily-task-body"><div class="daily-task-title"><h3>技能补给</h3><strong>5💎</strong></div>
      <p>随机获得1个一次性战斗技能</p><button onclick="drawSkill()" ${state.gems < 5 ? 'disabled' : ''}>${state.gems < 5 ? '钻石不足' : '抽取技能'}</button></div></article></div></section>`;
  }

  function currentQueueItem() {
    return state.learningQueue?.[state.quizIndex] || null;
  }

  function currentLearningCard() {
    const item = currentQueueItem();
    return item ? CARDS.find(card => card.id === item.id) : null;
  }

  function modeLabel(mode) {
    return mode === 'new' ? 'NEW · 今日新词' : mode === 'review' ? 'REVIEW · 到期复习' : 'PRACTICE · 巩固挑战';
  }

  function renderLearningQuiz() {
    const card = currentLearningCard();
    const item = currentQueueItem();
    if (!card || !item) return '<section class="quiz-wrap"><div class="empty"><span>✅</span><h2>今日计划已完成</h2><button onclick="setScreen(\'home\')">返回基地</button></div></section>';
    const cardIndex = Math.max(0, CARDS.findIndex(candidate => candidate.id === card.id));
    const options = buildQuizOptions(card, cardIndex);
    state.learningOptions = options;
    const total = state.learningQueue.length;
    return `<section class="quiz-wrap"><div class="quiz-head"><button class="back" onclick="setScreen('home')">← 返回基地</button>
      <div class="quiz-progress"><i style="width:${(state.quizIndex + 1) / total * 100}%"></i></div><span>${state.quizIndex + 1}/${total}</span></div>
      <div class="quiz-card"><div class="quiz-mode ${item.mode}">${modeLabel(item.mode)}</div><div class="combo">⚡ 连击 ${state.streak}</div>
      <p class="eyebrow">选择正确释义</p><button class="sound" onclick="speak('${escapeHtml(card.word)}')">🔊</button><h1>${escapeHtml(card.word)}</h1>
      <p class="phonetic">${escapeHtml(card.phonetic)}</p><div class="answers">${options.map((option, index) => {
        let className = '';
        if (state.selected) {
          if (option === card.meaning) className = 'correct';
          else if (option === state.selected) className = 'wrong';
          else className = 'dim';
        }
        return `<button class="${className}" onclick="answerLearningOption(${index})" ${state.selected ? 'disabled' : ''}><span>${String.fromCharCode(65 + index)}</span>${escapeHtml(option)}</button>`;
      }).join('')}</div>${state.selected ? renderFeedback(card) : ''}</div></section>`;
  }

  function renderLearningFeedback(card) {
    const correct = state.selected === card.meaning;
    const last = state.lastLearningResult || {};
    const isLast = state.quizIndex >= state.learningQueue.length - 1;
    const reward = last.reward ? ` +${last.reward}⭐` : '';
    return `<div class="feedback ${correct ? 'ok' : 'no'}"><strong>${correct ? `答对了！${reward}` : `正确答案：${escapeHtml(card.meaning)}`}</strong>
      <p>${escapeHtml(card.example)}</p>${!correct ? '<small>这个词会在3–5题后再次出现。</small>' : ''}
      <button onclick="nextQuestion()">${isLast ? '完成本轮学习' : '下一题 →'}</button></div>`;
  }

  renderHome = renderLearningHome;
  renderQuiz = renderLearningQuiz;
  renderFeedback = renderLearningFeedback;

  startQuiz = function () {
    const plan = ensurePlan();
    let queue = Core.queueForPlan(plan);
    if (!queue.length) queue = Core.reinforcementQueue(plan, state.wordProgress);
    if (!queue.length) return;
    state.learningQueue = queue;
    state.quizIndex = 0;
    state.selected = null;
    state.lastLearningResult = null;
    state.screen = 'quiz';
    render();
  };

  answer = function (option) {
    if (state.selected) return;
    const item = currentQueueItem();
    const card = currentLearningCard();
    if (!item || !card) return;
    const correct = option === card.meaning;
    const outcome = Core.applyAnswer(state.wordProgress, card.id, correct, item.mode, today);
    const plan = ensurePlan();
    let reward = 0;
    state.selected = option;

    if (correct) {
      state.streak += 1;
      if (outcome.firstLearned) {
        if (!plan.completedNewIds.includes(card.id)) plan.completedNewIds.push(card.id);
        reward = 10;
        updateStudyStreak();
      } else if (item.mode === 'review') {
        if (!plan.completedReviewIds.includes(card.id)) plan.completedReviewIds.push(card.id);
        reward = outcome.advanced ? 10 : 0;
        updateStudyStreak();
      } else if (!plan.reinforcedIds.includes(card.id)) {
        plan.reinforcedIds.push(card.id);
        reward = 2;
      }
      state.score += reward;
      state.wrong = state.wrong.filter(id => id !== card.id);
    } else {
      state.streak = 0;
      if (!state.wrong.includes(card.id)) state.wrong.push(card.id);
      const hasRetry = state.learningQueue.slice(state.quizIndex + 1).some(entry => entry.id === card.id);
      if (!hasRetry) {
        const gap = 3 + (outcome.item.wrongCount % 3);
        state.learningQueue.splice(Math.min(state.learningQueue.length, state.quizIndex + gap), 0, { id: card.id, mode: item.mode });
      }
    }

    if (plan.reviewIds.length && plan.completedReviewIds.length >= plan.reviewIds.length && !plan.reviewRewardClaimed) {
      plan.reviewRewardClaimed = true;
      state.score += 15;
    }
    if (plan.newIds.length && plan.completedNewIds.length >= plan.newIds.length && !plan.freePackClaimed) {
      plan.pendingFreePack = true;
    }
    state.lastLearningResult = { correct, reward };
    saveState();
    render();
  };

  window.answerLearningOption = function (index) {
    const option = state.learningOptions?.[index];
    if (option != null) answer(option);
  };

  nextQuestion = function () {
    state.selected = null;
    state.lastLearningResult = null;
    if (state.quizIndex < state.learningQueue.length - 1) {
      state.quizIndex += 1;
      render();
      return;
    }
    const plan = ensurePlan();
    state.learningQueue = [];
    state.quizIndex = 0;
    state.screen = 'home';
    if (plan.pendingFreePack && !plan.freePackClaimed) {
      plan.pendingFreePack = false;
      plan.freePackClaimed = true;
      state.gems += 1;
      openPack(true);
      return;
    }
    saveState();
    render();
  };

  const style = document.createElement('style');
  style.textContent = `
    .today-brief{display:flex;gap:8px;margin-top:19px;flex-wrap:wrap}.today-brief span,.quiz-mode{border:1px solid #4adbd0;background:#103b49;color:#75eee8;border-radius:20px;padding:6px 11px;font-size:12px;font-weight:800}.memory-panel{display:flex;justify-content:space-between;align-items:center;gap:18px;border:1px solid #433c8b;background:linear-gradient(120deg,#151348,#102640);border-radius:16px;padding:15px 20px;margin:0 0 18px}.memory-panel>div{display:flex;align-items:center;gap:12px}.memory-panel span{font-size:30px}.memory-panel p{margin:0}.memory-panel small{display:block;color:#aaa7ca;margin-top:4px}.memory-panel>strong{color:#68e5d1;font-size:13px}.metric-sub{display:block!important;color:#8f8bb8!important;font-size:11px!important;margin-top:2px}.five-tasks{grid-template-columns:repeat(5,1fr)!important}.quiz-mode{display:inline-block;margin:0 7px 15px 0}.quiz-mode.new{border-color:#ffd64d;background:#3a2a0c;color:#ffe375}.quiz-mode.reinforce{border-color:#a076ff;background:#2a1f54;color:#c7afff}.feedback small{display:block;color:#ffb2b2;margin:-5px 0 12px}
    @media(max-width:1300px){.five-tasks{grid-template-columns:repeat(3,1fr)!important}}@media(max-width:800px){.five-tasks{grid-template-columns:1fr!important}.memory-panel{align-items:flex-start;flex-direction:column}}
  `;
  document.head.appendChild(style);

  migrateLegacyProgress();
  ensurePlan();
  saveState();
  console.log(`[KET SRS] ${Core.learnedCount(state.wordProgress)} learned · ${ensurePlan().reviewIds.length} due today`);
  render();
})();
