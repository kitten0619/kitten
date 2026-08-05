const MAX_WORDS = 1629;
const SKILL_TYPES = ['heal', 'revive', 'immunity', 'shield', 'critical'];

const toInt = (value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) =>
  Math.min(maximum, Math.max(minimum, Math.floor(Number(value) || 0)));

const toIdList = (value, maximum = MAX_WORDS) => [...new Set(
  (Array.isArray(value) ? value : []).map(Number).filter(id => Number.isInteger(id) && id > 0)
)].slice(0, maximum);

const cleanDate = value => typeof value === 'string' && value.length <= 40 ? value : null;

function sanitizeWordProgress(value) {
  const result = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  Object.entries(value).slice(0, MAX_WORDS).forEach(([rawId, raw]) => {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id < 1 || !raw || typeof raw !== 'object') return;
    result[id] = {
      status: ['learning', 'review', 'mastered'].includes(raw.status) ? raw.status : 'learning',
      firstLearnedAt: cleanDate(raw.firstLearnedAt),
      lastReviewedAt: cleanDate(raw.lastReviewedAt),
      lastAttemptAt: cleanDate(raw.lastAttemptAt),
      nextReviewAt: cleanDate(raw.nextReviewAt),
      intervalIndex: toInt(raw.intervalIndex, 0, 5),
      correctStreak: toInt(raw.correctStreak, 0, 100000),
      wrongCount: toInt(raw.wrongCount, 0, 100000),
      reviewCount: toInt(raw.reviewCount, 0, 100000),
    };
  });
  return result;
}

function sanitizeCardCopies(value) {
  const result = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  Object.entries(value).slice(0, MAX_WORDS).forEach(([rawId, quantity]) => {
    const id = Number(rawId);
    const qty = toInt(quantity, 0, 9999);
    if (Number.isInteger(id) && id > 0 && qty > 0) result[id] = qty;
  });
  return result;
}

function sanitizeDaily(value) {
  const daily = value && typeof value === 'object' ? value : {};
  return {
    date: cleanDate(daily.date),
    learned: toInt(daily.learned, 0, 9999),
    cards: toInt(daily.cards, 0, 9999),
    battles: toInt(daily.battles, 0, 9999),
    claimed: {
      learned: Boolean(daily.claimed?.learned),
      cards: Boolean(daily.claimed?.cards),
      battles: Boolean(daily.claimed?.battles),
      all: Boolean(daily.claimed?.all),
    },
  };
}

function sanitizeDailyPlan(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    date: cleanDate(value.date),
    newIds: toIdList(value.newIds, 6),
    reviewIds: toIdList(value.reviewIds, 18),
    completedNewIds: toIdList(value.completedNewIds, 6),
    completedReviewIds: toIdList(value.completedReviewIds, 18),
    reinforcedIds: toIdList(value.reinforcedIds, 50),
    freePackClaimed: Boolean(value.freePackClaimed),
    reviewRewardClaimed: Boolean(value.reviewRewardClaimed),
    pendingFreePack: Boolean(value.pendingFreePack),
  };
}

function sanitizeBattleHistory(value) {
  return (Array.isArray(value) ? value : []).slice(0, 50).map((item, index) => ({
    id: String(item?.id || `battle-${index}`).slice(0, 80),
    created_at: cleanDate(item?.created_at),
    result: item?.result === 'win' ? 'win' : 'lose',
    hp_remaining: toInt(item?.hp_remaining, 0, 120),
    accuracy: Math.min(1, Math.max(0, Number(item?.accuracy) || 0)),
    max_combo: toInt(item?.max_combo, 0, 9999),
    stars_earned: toInt(item?.stars_earned, 0, 99999),
    gems_earned: toInt(item?.gems_earned, 0, 99999),
    skill_used: typeof item?.skill_used === 'string' ? item.skill_used.slice(0, 50) : null,
  }));
}

export function sanitizeSnapshot(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const cardCopies = sanitizeCardCopies(source.cardCopies);
  const owned = toIdList(source.owned);
  owned.forEach(id => { cardCopies[id] = Math.max(1, cardCopies[id] || 0); });
  const skills = {};
  SKILL_TYPES.forEach(type => { skills[type] = toInt(source.skills?.[type], 0, 9999); });
  const wordProgress = sanitizeWordProgress(source.wordProgress);
  const learnedCount = Object.values(wordProgress).filter(item => item.firstLearnedAt).length;
  return {
    v: 6,
    build: typeof source.build === 'string' ? source.build.slice(0, 80) : null,
    score: toInt(source.score, 0, 999999999),
    gems: toInt(source.gems, 0, 999999999),
    mastered: learnedCount,
    streakDays: toInt(source.streakDays, 0, 99999),
    lastStudyDate: cleanDate(source.lastStudyDate),
    owned: Object.keys(cardCopies).map(Number),
    cardCopies,
    deck: toIdList(source.deck, 5).filter(id => cardCopies[id] > 0),
    wrong: toIdList(source.wrong),
    skills,
    daily: sanitizeDaily(source.daily),
    dailyPlan: sanitizeDailyPlan(source.dailyPlan),
    wordProgress,
    totalBattles: toInt(source.totalBattles, 0, 99999999),
    battlesWon: toInt(source.battlesWon, 0, 99999999),
    battleHistory: sanitizeBattleHistory(source.battleHistory),
    clientUpdatedAt: cleanDate(source.clientUpdatedAt) || new Date().toISOString(),
    deviceId: typeof source.deviceId === 'string' ? source.deviceId.slice(0, 100) : null,
  };
}

export function summarizeSnapshot(snapshot) {
  const state = sanitizeSnapshot(snapshot || {});
  const progressEntries = Object.values(state.wordProgress);
  const uniqueCards = Object.keys(state.cardCopies).length;
  const cardCopies = Object.values(state.cardCopies).reduce((sum, value) => sum + value, 0);
  return {
    stars: state.score,
    gems: state.gems,
    learned_count: progressEntries.filter(item => item.firstLearnedAt).length,
    mastered_count: progressEntries.filter(item => item.status === 'mastered').length,
    wrong_count: state.wrong.length,
    streak_days: state.streakDays,
    unique_cards: uniqueCards,
    card_copies: cardCopies,
    total_battles: state.totalBattles,
    battles_won: state.battlesWon,
    daily: state.daily,
    daily_plan: state.dailyPlan,
    last_study_date: state.lastStudyDate,
  };
}

export function snapshotCards(snapshot, wordsById = new Map()) {
  const state = sanitizeSnapshot(snapshot || {});
  return Object.entries(state.cardCopies).map(([id, quantity]) => {
    const word = wordsById.get(Number(id)) || {};
    return {
      word_id: Number(id), quantity, word: word.word || `#${id}`,
      meaning: word.meaning || '', rarity: word.rarity || 'N', obtained_at: null,
    };
  });
}
