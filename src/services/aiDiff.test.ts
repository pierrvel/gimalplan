import { describe, expect, it } from 'vitest';
import type { ChecklistItem, StudyBlock } from '../types/planner';
import { diffPlacements } from './aiDiff';

function block(id: string, itemId: string | undefined, date: string, startTime: string, endTime: string, title = '제목'): StudyBlock {
  return {
    id, date, startTime, endTime, subjectId: 's1', checklistItemId: itemId, title,
    type: 'study', completed: false, source: 'ai', updatedAt: 0,
  };
}

function item(id: string, title: string): ChecklistItem {
  return { id, subjectId: 's1', title, completed: false, estimatedMinutes: 60, createdAt: 0, updatedAt: 0 };
}

const items = [item('A', '항목A'), item('B', '항목B'), item('C', '항목C'), item('D', '항목D')];

describe('diffPlacements', () => {
  it('classifies unchanged, moved, added, removed', () => {
    const before = [
      block('a1', 'A', '2026-11-18', '18:00', '19:00'),
      block('b1', 'B', '2026-11-18', '19:00', '20:00'),
      block('d1', 'D', '2026-11-19', '10:00', '11:00'),
    ];
    const after = [
      block('a2', 'A', '2026-11-18', '18:00', '19:00'),
      block('b2', 'B', '2026-11-17', '21:00', '22:00'),
      block('c2', 'C', '2026-11-20', '09:00', '10:00'),
    ];
    const diff = diffPlacements(before, after, items);
    expect(diff.unchanged.map(c => c.itemId)).toEqual(['A']);
    expect(diff.moved.map(c => c.itemId)).toEqual(['B']);
    expect(diff.moved[0].before).toEqual([{ date: '2026-11-18', startTime: '19:00', endTime: '20:00' }]);
    expect(diff.moved[0].after).toEqual([{ date: '2026-11-17', startTime: '21:00', endTime: '22:00' }]);
    expect(diff.added.map(c => c.itemId)).toEqual(['C']);
    expect(diff.removed.map(c => c.itemId)).toEqual(['D']);
    expect(diff.moved[0].title).toBe('항목B');
    expect(diff.moved[0].subjectId).toBe('s1');
  });

  it('puts blocks without checklistItemId only in unlinkedRemoved, ignoring them in after', () => {
    const before = [block('x1', undefined, '2026-11-18', '10:00', '11:00')];
    const after = [block('x2', undefined, '2026-11-18', '12:00', '13:00')];
    const diff = diffPlacements(before, after, items);
    expect(diff.unlinkedRemoved.map(b => b.id)).toEqual(['x1']);
    expect(diff.added).toEqual([]);
    expect(diff.moved).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.unchanged).toEqual([]);
  });

  it('falls back to stripped block title when item is missing and sorts slots', () => {
    const after = [
      block('z2', 'Z', '2026-11-18', '15:00', '16:00', '복습 (2/2)'),
      block('z1', 'Z', '2026-11-18', '09:00', '10:00', '복습 (1/2)'),
    ];
    const diff = diffPlacements([], after, items);
    expect(diff.added[0].title).toBe('복습');
    expect(diff.added[0].after.map(s => s.startTime)).toEqual(['09:00', '15:00']);
  });

  it('chained edits: only items moved in the second edit show as moved', () => {
    const before = [
      block('a1', 'A', '2026-11-18', '18:00', '19:00'),
      block('b1', 'B', '2026-11-18', '19:00', '20:00'),
    ];
    const first = diffPlacements(before, [
      block('a1', 'A', '2026-11-18', '18:00', '19:00'),
      block('b2', 'B', '2026-11-17', '21:00', '22:00'),
    ], items);
    expect(first.moved.map(c => c.itemId)).toEqual(['B']);
    const afterFirst = first.unchanged.concat(first.moved).flatMap(c => c.after.map((s, i) =>
      block(`${c.itemId}${i}`, c.itemId, s.date, s.startTime, s.endTime)));
    const second = diffPlacements(afterFirst, [
      ...afterFirst.filter(b => b.checklistItemId === 'B'),
      block('a3', 'A', '2026-11-19', '18:00', '19:00'),
    ], items);
    expect(second.moved.map(c => c.itemId)).toEqual(['A']);
    expect(second.unchanged.map(c => c.itemId)).toEqual(['B']);
  });
});
