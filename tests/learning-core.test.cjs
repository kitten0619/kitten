const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/learning-core.js', 'utf8'), context);
const Core = context.KETLearningCore;

function test(name, run) {
  try {
    run();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test('同一个单词重复答对不会重复累计已学习数量', () => {
  const progress = {};
  Core.applyAnswer(progress, 51, true, 'new', '2026-07-21');
  Core.applyAnswer(progress, 51, true, 'reinforce', '2026-07-21');
  Core.applyAnswer(progress, 51, true, 'reinforce', '2026-07-21');
  assert.equal(Core.learnedCount(progress), 1);
});

test('六个不同新词只把地图从1-1推进到1-2', () => {
  const progress = {};
  for (let id = 51; id <= 56; id += 1) Core.applyAnswer(progress, id, true, 'new', '2026-07-21');
  assert.deepEqual({ chapter: Core.adventureProgress(progress).chapter, level: Core.adventureProgress(progress).level }, { chapter: 1, level: 2 });
  Core.applyAnswer(progress, 51, true, 'reinforce', '2026-07-21');
  assert.equal(Core.adventureProgress(progress).level, 2);
});

test('复习间隔按1、3、7天递增并进入长期掌握', () => {
  const progress = {};
  Core.applyAnswer(progress, 51, true, 'new', '2026-07-21');
  assert.equal(progress[51].nextReviewAt, '2026-07-22');
  Core.applyAnswer(progress, 51, true, 'review', '2026-07-22');
  assert.equal(progress[51].nextReviewAt, '2026-07-25');
  Core.applyAnswer(progress, 51, true, 'review', '2026-07-25');
  assert.equal(progress[51].nextReviewAt, '2026-08-01');
  assert.equal(progress[51].status, 'mastered');
  assert.equal(Core.masteredCount(progress), 1);
});

test('答错会重置间隔并安排次日复习', () => {
  const progress = {};
  Core.applyAnswer(progress, 51, true, 'new', '2026-07-01');
  Core.applyAnswer(progress, 51, true, 'review', '2026-07-02');
  Core.applyAnswer(progress, 51, false, 'review', '2026-07-05');
  assert.equal(progress[51].intervalIndex, 0);
  assert.equal(progress[51].nextReviewAt, '2026-07-06');
  assert.equal(progress[51].wrongCount, 1);
});

test('每日计划固定为六个未学新词并保留当天进度', () => {
  const cards = Array.from({ length: 20 }, (_, index) => ({ id: 51 + index }));
  const progress = {};
  const plan = Core.buildDailyPlan(cards, progress, null, '2026-07-21');
  assert.equal(plan.newIds.length, 6);
  plan.completedNewIds.push(plan.newIds[0]);
  const sameDay = Core.buildDailyPlan(cards, progress, plan, '2026-07-21');
  assert.deepEqual(sameDay.newIds, plan.newIds);
  assert.deepEqual(sameDay.completedNewIds, plan.completedNewIds);
});

console.log('All learning-core tests passed.');
