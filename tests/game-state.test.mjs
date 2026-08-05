import assert from 'node:assert/strict';
import { sanitizeSnapshot, summarizeSnapshot } from '../server/game-state.js';

const raw = {
  score: 120,
  gems: 9,
  owned: [51, 52, 52],
  cardCopies: { 51: 2, 52: 1 },
  deck: [51, 52, 999],
  wrong: [53],
  skills: { heal: 2, critical: 1, unknown: 99 },
  wordProgress: {
    51: { status: 'learning', firstLearnedAt: '2026-08-05', nextReviewAt: '2026-08-06' },
    52: { status: 'mastered', firstLearnedAt: '2026-08-01', nextReviewAt: '2026-08-12', intervalIndex: 2 },
  },
  totalBattles: 3,
  battlesWon: 2,
  battleHistory: [{ id: 'b1', result: 'win', accuracy: 0.8, created_at: '2026-08-05T10:00:00Z' }],
};

const state = sanitizeSnapshot(raw);
assert.equal(state.v, 6);
assert.deepEqual(state.owned, [51, 52]);
assert.deepEqual(state.deck, [51, 52]);
assert.equal(state.skills.unknown, undefined);
assert.equal(state.mastered, 2, '兼容字段应统计所有已学习单词');

const summary = summarizeSnapshot(state);
assert.equal(summary.learned_count, 2);
assert.equal(summary.mastered_count, 1);
assert.equal(summary.unique_cards, 2);
assert.equal(summary.card_copies, 3);
assert.equal(summary.total_battles, 3);
assert.equal(summary.battles_won, 2);

console.log('All game-state tests passed.');
