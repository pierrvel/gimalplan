import { describe, expect, it } from 'vitest';
import { createInitialPlannerState } from '../data/presets';
import type { ChecklistItem, PlannerState, StudyBlock } from '../types/planner';
import {
  applyStudyBlockToggle,
  getItemRemainingMinutes,
  getSubjectProgress,
  getTodayStudyBlocks,
} from './progress';

function makeState(studyBlocks: StudyBlock[] = []): PlannerState {
  return { ...createInitialPlannerState(), studyBlocks };
}

function makeItem(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    id: 'item-x',
    subjectId: 'subj-eng2',
    title: 't',
    completed: false,
    estimatedMinutes: 90,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeBlock(overrides: Partial<StudyBlock> = {}): StudyBlock {
  return {
    id: 'blk-x',
    date: '2026-11-16',
    startTime: '09:00',
    endTime: '10:00',
    subjectId: 'subj-eng2',
    title: 'b',
    type: 'study',
    completed: false,
    source: 'manual',
    updatedAt: 0,
    ...overrides,
  };
}

describe('getItemRemainingMinutes', () => {
  it('returns 0 for a completed item', () => {
    expect(getItemRemainingMinutes(makeItem({ completed: true }), [])).toBe(0);
  });

  it('subtracts completed linked blocks from the estimate', () => {
    const item = makeItem();
    const blocks = [
      makeBlock({ id: 'a', checklistItemId: item.id, startTime: '09:00', endTime: '09:30', completed: true }),
      makeBlock({ id: 'b', checklistItemId: item.id, startTime: '10:00', endTime: '11:00', completed: false }),
    ];
    expect(getItemRemainingMinutes(item, blocks)).toBe(60);
  });

  it('never goes negative', () => {
    const item = makeItem();
    const blocks = [
      makeBlock({ checklistItemId: item.id, startTime: '09:00', endTime: '12:00', completed: true }),
    ];
    expect(getItemRemainingMinutes(item, blocks)).toBe(0);
  });
});

describe('getSubjectProgress', () => {
  it('computes subj-eng2 totals', () => {
    const p = getSubjectProgress(makeState(), '2026-11-16').find((s) => s.subjectId === 'subj-eng2');
    expect(p).toBeDefined();
    expect(p!.remainingCount).toBe(5);
    expect(p!.remainingMinutes).toBe(300);
    expect(p!.daysLeft).toBe(17);
    expect(p!.dailyNeedMinutes).toBe(18);
  });

  it('sorts by examDate ascending', () => {
    const dates = getSubjectProgress(makeState(), '2026-11-16').map(
      (p) => createInitialPlannerState().subjects.find((s) => s.id === p.subjectId)!.examDate,
    );
    expect(dates).toEqual([...dates].sort());
  });

  it('clamps daysLeft to 1 and excludes past exams', () => {
    const state = makeState();
    const result = getSubjectProgress(state, '2026-12-03');
    expect(result.find((s) => s.subjectId === 'subj-eng2')!.daysLeft).toBe(1);
    for (const p of result) {
      const subj = state.subjects.find((s) => s.id === p.subjectId)!;
      expect(subj.examDate >= '2026-12-03').toBe(true);
    }
  });

  it('counts overdue minutes for unfinished past blocks', () => {
    const block = makeBlock({ date: '2026-11-15', startTime: '18:00', endTime: '19:30' });
    const find = (b: StudyBlock) =>
      getSubjectProgress(makeState([b]), '2026-11-16').find((s) => s.subjectId === 'subj-eng2')!;
    expect(find(block).overdueMinutes).toBe(90);
    expect(find({ ...block, completed: true }).overdueMinutes).toBe(0);
  });
});

describe('getTodayStudyBlocks', () => {
  it('excludes exam blocks and sorts by startTime', () => {
    const state = makeState([
      makeBlock({ id: 'c', startTime: '15:00', endTime: '16:00', type: 'final_prep' }),
      makeBlock({ id: 'x', startTime: '08:00', endTime: '09:00', type: 'exam' }),
      makeBlock({ id: 'a', startTime: '09:00', endTime: '10:00', type: 'study' }),
      makeBlock({ id: 'o', date: '2026-11-17' }),
    ]);
    expect(getTodayStudyBlocks(state, '2026-11-16').map((b) => b.id)).toEqual(['a', 'c']);
  });
});

describe('applyStudyBlockToggle', () => {
  function setup() {
    const item = makeItem({ id: 'A' });
    const b1 = makeBlock({ id: 'b1', checklistItemId: 'A' });
    const b2 = makeBlock({ id: 'b2', checklistItemId: 'A', startTime: '10:00', endTime: '11:00' });
    return { ...makeState([b1, b2]), checklistItems: [item] };
  }
  const itemA = (s: PlannerState) => s.checklistItems.find((c) => c.id === 'A')!;

  it('completes the item only when all linked blocks are checked, and reverts on uncheck', () => {
    const s0 = setup();
    const s1 = applyStudyBlockToggle(s0, 'b1', 100);
    expect(s1.studyBlocks.find((b) => b.id === 'b1')!.completed).toBe(true);
    expect(itemA(s1).completed).toBe(false);
    const s2 = applyStudyBlockToggle(s1, 'b2', 200);
    expect(itemA(s2).completed).toBe(true);
    const s3 = applyStudyBlockToggle(s2, 'b1', 300);
    expect(itemA(s3).completed).toBe(false);
  });

  it('does not change checklistItems for a block without a linked item', () => {
    const s0 = { ...setup(), studyBlocks: [makeBlock({ id: 'free' })] };
    const s1 = applyStudyBlockToggle(s0, 'free', 100);
    expect(s1.checklistItems).toBe(s0.checklistItems);
    expect(s1.studyBlocks[0].completed).toBe(true);
  });

  it('sets updatedAt to now on the changed block and item', () => {
    const s1 = applyStudyBlockToggle(setup(), 'b1', 555);
    expect(s1.studyBlocks.find((b) => b.id === 'b1')!.updatedAt).toBe(555);
    expect(itemA(s1).updatedAt).toBe(555);
  });
});
