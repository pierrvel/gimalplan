import { describe, expect, it } from 'vitest';
import { createInitialPlannerState } from '../data/presets';
import {
  getDayScheduleContext,
  getOtherSubjectMinutesOnDate,
  getTotalAvailableMinutes,
  isTimeRangeInsideWindows,
} from './availability';

const stripLabels = (windows: Array<{ start: string; end: string }>) =>
  windows.map(({ start, end }) => ({ start, end }));

describe('Preset data and availability engine', () => {
  it('loads exact preset subjects and checklist counts', () => {
    const state = createInitialPlannerState();
    expect(state.examStartDate).toBe('2026-12-03');
    expect(state.examEndDate).toBe('2026-12-09');
    expect(state.subjects).toHaveLength(8);
    expect(state.checklistItems).toHaveLength(38);
    expect(state.weeklyRules).toHaveLength(7);
  });

  it('computes standard weekly study windows excluding school, 1h meals, and academies', () => {
    const state = createInitialPlannerState();

    // 2026-11-16 (Mon): 18:00~24:00 (360m)
    const mon = getDayScheduleContext(state, '2026-11-16');
    expect(mon.dayOfWeek).toBe(1);
    expect(stripLabels(mon.studyWindows)).toEqual([{ start: '18:00', end: '24:00' }]);
    expect(getTotalAvailableMinutes(mon)).toBe(360);

    // 2026-11-17 (Tue): 22:00~23:30 (90m)
    const tue = getDayScheduleContext(state, '2026-11-17');
    expect(stripLabels(tue.studyWindows)).toEqual([{ start: '22:00', end: '23:30' }]);
    expect(getTotalAvailableMinutes(tue)).toBe(90);

    // 2026-11-18 (Wed): 17:00~24:00 (420m)
    const wed = getDayScheduleContext(state, '2026-11-18');
    expect(stripLabels(wed.studyWindows)).toEqual([{ start: '17:00', end: '24:00' }]);
    expect(getTotalAvailableMinutes(wed)).toBe(420);

    // 2026-11-12 (Thu normal week): 18:00~24:00 (360m)
    const thu = getDayScheduleContext(state, '2026-11-12');
    expect(stripLabels(thu.studyWindows)).toEqual([{ start: '18:00', end: '24:00' }]);
    expect(getTotalAvailableMinutes(thu)).toBe(360);

    // 2026-11-13 (Fri normal week): 20:00~24:00 (240m)
    const fri = getDayScheduleContext(state, '2026-11-13');
    expect(stripLabels(fri.studyWindows)).toEqual([{ start: '20:00', end: '24:00' }]);
    expect(getTotalAvailableMinutes(fri)).toBe(240);

    // 2026-11-14 (Sat): 15:00~18:00 (180m)
    const sat = getDayScheduleContext(state, '2026-11-14');
    expect(stripLabels(sat.studyWindows)).toEqual([{ start: '15:00', end: '18:00' }]);
    expect(getTotalAvailableMinutes(sat)).toBe(180);

    // 2026-11-15 (Sun): 10:00~13:00 & 21:00~24:00 (360m)
    const sun = getDayScheduleContext(state, '2026-11-15');
    expect(stripLabels(sun.studyWindows)).toEqual([
      { start: '10:00', end: '13:00' },
      { start: '21:00', end: '24:00' },
    ]);
    expect(getTotalAvailableMinutes(sun)).toBe(360);
  });

  it('applies CSAT no-school overrides on 2026-11-19 and 2026-11-20', () => {
    const state = createInitialPlannerState();

    const csatThu = getDayScheduleContext(state, '2026-11-19');
    expect(csatThu.isOverride).toBe(true);
    expect(csatThu.fixedSlots.some((s) => s.kind === 'school')).toBe(false);
    // 10:00~12:00 (120m) + 13:00~18:00 (300m) + 19:00~24:00 (300m) = 720m
    expect(getTotalAvailableMinutes(csatThu)).toBe(720);

    const csatFri = getDayScheduleContext(state, '2026-11-20');
    expect(csatFri.isOverride).toBe(true);
    // 10:00~16:00 (360m) + 20:00~24:00 (240m) = 600m
    expect(stripLabels(csatFri.studyWindows)).toEqual([
      { start: '10:00', end: '16:00' },
      { start: '20:00', end: '24:00' },
    ]);
    expect(getTotalAvailableMinutes(csatFri)).toBe(600);
  });

  it('pauses regular academies during exam period and marks 4 직전보강 days with 3h cap', () => {
    const state = createInitialPlannerState();

    // Non-final-prep exam days pause regular academy
    for (const dateKey of ['2026-12-04', '2026-12-05', '2026-12-08']) {
      const ctx = getDayScheduleContext(state, dateKey);
      expect(ctx.isExamPeriod).toBe(true);
      expect(ctx.fixedSlots.some((s) => s.kind === 'academy')).toBe(false);
      expect(ctx.finalPrepSubjectId).toBeUndefined();
    }

    // Check 12/05 (Sat) regains full daytime minus 1h meals instead of academies
    const examSat = getDayScheduleContext(state, '2026-12-05');
    expect(getTotalAvailableMinutes(examSat)).toBe(720);

    // Check all 4 직전보강 dates enforce 180-minute maxOtherSubjectMinutes
    const expectedPrepDays: Array<[string, string]> = [
      ['2026-12-02', 'subj-eng2'],
      ['2026-12-03', 'subj-calc1'],
      ['2026-12-06', 'subj-speech'],
      ['2026-12-07', 'subj-calc2'],
    ];

    for (const [dateKey, subjectId] of expectedPrepDays) {
      const ctx = getDayScheduleContext(state, dateKey);
      expect(ctx.finalPrepSubjectId).toBe(subjectId);
      expect(ctx.maxOtherSubjectMinutes).toBe(180);
      expect(ctx.fixedSlots.some((s) => s.kind === 'final_prep' && s.subjectId === subjectId)).toBe(
        true,
      );
    }

    // Exam day slots appear in fixedSlots & examBlocks
    const dec03 = getDayScheduleContext(state, '2026-12-03');
    expect(dec03.examBlocks.map((b) => b.subjectId)).toEqual(['subj-eng2', 'subj-ethics']);
  });

  it('validates study windows and counts non-prep subject minutes accurately', () => {
    const state = createInitialPlannerState();
    const mon = getDayScheduleContext(state, '2026-11-16');

    expect(isTimeRangeInsideWindows('17:30', '19:00', mon)).toBe(false); // overlaps dinner 17~18
    expect(isTimeRangeInsideWindows('18:00', '20:00', mon)).toBe(true);
    expect(isTimeRangeInsideWindows('23:00', '24:00', mon)).toBe(true);

    const blocks = [
      {
        id: 'b1',
        date: '2026-12-02',
        startTime: '21:00',
        endTime: '23:00',
        subjectId: 'subj-eng2',
        title: '영어Ⅱ 직전 복습',
        type: 'study' as const,
        completed: false,
        source: 'manual' as const,
        updatedAt: 1,
      },
      {
        id: 'b2',
        date: '2026-12-02',
        startTime: '17:00',
        endTime: '18:00',
        subjectId: 'subj-ethics',
        title: '인문학과윤리 정리',
        type: 'study' as const,
        completed: false,
        source: 'manual' as const,
        updatedAt: 1,
      },
    ];

    expect(getOtherSubjectMinutesOnDate(blocks, '2026-12-02', 'subj-eng2')).toBe(60);
  });
});
