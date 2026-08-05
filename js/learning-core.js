(function (root) {
  'use strict';

  const INTERVALS = [1, 3, 7, 14, 30, 60];
  const NEW_WORDS_PER_DAY = 6;
  const MAX_DAILY_REVIEWS = 18;

  function todayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function addDays(dateKey, days) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(year, month - 1, day + days, 12, 0, 0);
    return todayKey(date);
  }

  function normalizeProgress(progress) {
    return progress && typeof progress === 'object' && !Array.isArray(progress) ? progress : {};
  }

  function learnedCount(progress) {
    return Object.values(normalizeProgress(progress)).filter(item => item?.firstLearnedAt).length;
  }

  function masteredCount(progress) {
    return Object.values(normalizeProgress(progress)).filter(item => item?.status === 'mastered').length;
  }

  function adventureProgress(progress) {
    const learned = learnedCount(progress);
    const absoluteLevel = Math.floor(learned / NEW_WORDS_PER_DAY) + 1;
    const chapter = Math.floor((absoluteLevel - 1) / 6) + 1;
    const level = ((absoluteLevel - 1) % 6) + 1;
    return { learned, absoluteLevel, chapter, level, start: Math.min(Math.max(1, level - 1), 3) };
  }

  function dueIds(progress, today) {
    return Object.entries(normalizeProgress(progress))
      .filter(([, item]) => item?.firstLearnedAt && item.nextReviewAt && item.nextReviewAt <= today)
      .sort((a, b) => {
        const dateOrder = String(a[1].nextReviewAt).localeCompare(String(b[1].nextReviewAt));
        if (dateOrder) return dateOrder;
        const strengthOrder = (a[1].intervalIndex || 0) - (b[1].intervalIndex || 0);
        return strengthOrder || Number(a[0]) - Number(b[0]);
      })
      .map(([id]) => Number(id));
  }

  function buildDailyPlan(cards, progress, existingPlan, today = todayKey()) {
    const validIds = new Set(cards.map(card => Number(card.id)));
    if (existingPlan?.date === today) {
      return {
        ...existingPlan,
        newIds: (existingPlan.newIds || []).map(Number).filter(id => validIds.has(id)),
        reviewIds: (existingPlan.reviewIds || []).map(Number).filter(id => validIds.has(id)),
        completedNewIds: [...new Set((existingPlan.completedNewIds || []).map(Number))],
        completedReviewIds: [...new Set((existingPlan.completedReviewIds || []).map(Number))],
        freePackClaimed: Boolean(existingPlan.freePackClaimed),
        reviewRewardClaimed: Boolean(existingPlan.reviewRewardClaimed),
      };
    }
    const known = normalizeProgress(progress);
    const reviewIds = dueIds(known, today).filter(id => validIds.has(id)).slice(0, MAX_DAILY_REVIEWS);
    const newIds = cards
      .map(card => Number(card.id))
      .filter(id => !known[id]?.firstLearnedAt)
      .slice(0, NEW_WORDS_PER_DAY);
    return {
      date: today,
      newIds,
      reviewIds,
      completedNewIds: [],
      completedReviewIds: [],
      freePackClaimed: false,
      reviewRewardClaimed: false,
    };
  }

  function queueForPlan(plan) {
    const reviews = (plan.reviewIds || []).filter(id => !(plan.completedReviewIds || []).includes(id));
    const newWords = (plan.newIds || []).filter(id => !(plan.completedNewIds || []).includes(id));
    const queue = [];
    const max = Math.max(reviews.length, newWords.length);
    for (let index = 0; index < max; index += 1) {
      if (reviews[index] != null) queue.push({ id: reviews[index], mode: 'review' });
      if (newWords[index] != null) queue.push({ id: newWords[index], mode: 'new' });
    }
    return queue;
  }

  function reinforcementQueue(plan, progress) {
    const ids = [...new Set([
      ...(plan.reviewIds || []),
      ...(plan.newIds || []),
      ...Object.entries(normalizeProgress(progress))
        .sort((a, b) => (b[1]?.wrongCount || 0) - (a[1]?.wrongCount || 0))
        .slice(0, NEW_WORDS_PER_DAY)
        .map(([id]) => Number(id)),
    ])].slice(0, 12);
    return ids.map(id => ({ id, mode: 'reinforce' }));
  }

  function applyAnswer(progress, cardId, correct, mode, today = todayKey()) {
    const store = normalizeProgress(progress);
    const id = Number(cardId);
    const previous = store[id] || {};
    const item = {
      status: previous.status || 'learning',
      firstLearnedAt: previous.firstLearnedAt || null,
      lastReviewedAt: previous.lastReviewedAt || null,
      lastAttemptAt: today,
      nextReviewAt: previous.nextReviewAt || today,
      intervalIndex: Math.max(0, Number(previous.intervalIndex) || 0),
      correctStreak: Math.max(0, Number(previous.correctStreak) || 0),
      wrongCount: Math.max(0, Number(previous.wrongCount) || 0),
      reviewCount: Math.max(0, Number(previous.reviewCount) || 0),
    };
    const firstLearned = correct && !item.firstLearnedAt;
    let advanced = false;

    if (correct) {
      item.correctStreak += 1;
      if (firstLearned) {
        item.firstLearnedAt = today;
        item.lastReviewedAt = today;
        item.nextReviewAt = addDays(today, INTERVALS[0]);
        item.intervalIndex = 0;
      } else if (mode === 'review' && item.lastReviewedAt !== today) {
        item.intervalIndex = Math.min(INTERVALS.length - 1, item.intervalIndex + 1);
        item.lastReviewedAt = today;
        item.nextReviewAt = addDays(today, INTERVALS[item.intervalIndex]);
        item.reviewCount += 1;
        advanced = true;
      }
      item.status = item.intervalIndex >= 2 ? 'mastered' : item.intervalIndex >= 1 ? 'review' : 'learning';
    } else {
      item.correctStreak = 0;
      item.wrongCount += 1;
      item.intervalIndex = 0;
      item.status = 'learning';
      item.nextReviewAt = addDays(today, 1);
    }

    store[id] = item;
    return { firstLearned, advanced, item };
  }

  root.KETLearningCore = {
    INTERVALS,
    NEW_WORDS_PER_DAY,
    MAX_DAILY_REVIEWS,
    todayKey,
    addDays,
    learnedCount,
    masteredCount,
    adventureProgress,
    dueIds,
    buildDailyPlan,
    queueForPlan,
    reinforcementQueue,
    applyAnswer,
  };
})(typeof window !== 'undefined' ? window : globalThis);
