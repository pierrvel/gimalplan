import { describe, expect, it } from 'vitest';
import { createInitialPlannerState } from '../data/presets';
import type { StudyBlock } from '../types/planner';
import { validateAndSanitizeAiBlocks } from './aiScheduler';

describe('AI Scheduler sanitizer and constraints enforcement', () => {
  it('enforces the 3-hour (180m) non-prep subject limit on 직전보강 days', () => {
    const state = createInitialPlannerState();
    // 2026-12-02 has study windows 17:00~18:00 & 21:00~24:00, and 직전보강 for subj-eng2 (cap 180m on other subjects)
    const existingManual: StudyBlock[] = [
      {
        id: 'manual-1',
        date: '2026-12-02',
        startTime: '17:00',
        endTime: '18:00', // 60m already used by non-prep subject
        subjectId: 'subj-ethics',
        title: '윤리 교과서 보기',
        type: 'study',
        completed: false,
        source: 'manual',
        updatedAt: 1000,
      },
    ];

    const result = validateAndSanitizeAiBlocks(
      [
        {
          date: '2026-12-02',
          startTime: '21:00',
          endTime: '23:30', // 150m proposed -> remaining cap is 120m -> trims to 21:00~23:00
          subjectId: 'subj-society',
          title: '사회와문화 문풀',
        },
        {
          date: '2026-12-02',
          startTime: '23:00',
          endTime: '23:30', // 30m more of other subject -> cap exhausted, skipped
          subjectId: 'subj-calc1',
          title: '미적분Ⅰ 문풀',
        },
        {
          date: '2026-12-02',
          startTime: '23:00',
          endTime: '24:00', // 60m of subj-eng2 (prep subject) -> allowed uncapped
          subjectId: 'subj-eng2',
          title: '영어Ⅱ 수특 프린트 9회',
        },
      ],
      state,
      existingManual,
      '2026-12-02',
      '2026-12-02',
    );

    expect(result.trimmedForPrepCap).toBe(1);
    expect(result.skippedInvalid).toBe(1);
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]).toMatchObject({
      subjectId: 'subj-society',
      startTime: '21:00',
      endTime: '23:00',
    });
    expect(result.blocks[1]).toMatchObject({
      subjectId: 'subj-eng2',
      startTime: '23:00',
      endTime: '24:00',
    });
  });

  it('rejects blocks outside study windows, overlapping blocks, or after subject exam start', () => {
    const state = createInitialPlannerState();

    const result = validateAndSanitizeAiBlocks(
      [
        // Outside Mon dinner window (17:00~18:00 is blocked)
        {
          date: '2026-11-16',
          startTime: '17:00',
          endTime: '18:30',
          subjectId: 'subj-eng2',
          title: '식사시간 침범 블록',
        },
        // Valid Mon block
        {
          date: '2026-11-16',
          startTime: '19:00',
          endTime: '21:00',
          subjectId: 'subj-eng2',
          title: '영어Ⅱ 10모 오답',
        },
        // Overlapping Mon block
        {
          date: '2026-11-16',
          startTime: '20:00',
          endTime: '22:00',
          subjectId: 'subj-calc1',
          title: '겹치는 블록',
        },
        // Scheduled after subj-eng2 exam date (2026-12-03)
        {
          date: '2026-12-04',
          startTime: '13:00',
          endTime: '15:00',
          subjectId: 'subj-eng2',
          title: '이미 끝난 시험 과목',
        },
      ],
      state,
      [],
      '2026-11-16',
      '2026-12-09',
    );

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].title).toBe('영어Ⅱ 10모 오답');
    expect(result.skippedInvalid).toBe(3);
  });
});
