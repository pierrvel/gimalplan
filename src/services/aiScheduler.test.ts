import { describe, expect, it } from 'vitest';
import { createInitialPlannerState } from '../data/presets';
import type { StudyBlock } from '../types/planner';
import { buildAiSchedulePrompt, validateAndSanitizeAiBlocks } from './aiScheduler';

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

  it('serializes block duration settings, custom rules, user instructions, and current AI blocks into prompt', () => {
    const state = createInitialPlannerState();
    const existingAiDraft: StudyBlock[] = [
      {
        id: 'ai-draft-1',
        date: '2026-11-16',
        startTime: '19:00',
        endTime: '20:00',
        subjectId: 'subj-eng2',
        title: '영어Ⅱ 10모 오답',
        type: 'study',
        completed: false,
        source: 'ai',
        updatedAt: 1000,
      },
    ];

    const { fullPrompt } = buildAiSchedulePrompt({
      state,
      apiKey: '',
      model: 'gemini-4-hydrogen',
      startDate: '2026-11-16',
      preserveCompletedAndManual: true,
      minBlockMinutes: 120,
      maxBlockMinutes: 180,
      customRules: ['블록 사이 15분 휴식 간격 확보'],
      userInstruction: '한 블록 하는 시간을 2시간으로 늘려줘',
      currentDraftBlocks: existingAiDraft,
      revisionHistory: [{ instruction: '초기 생성', rationale: '기본 배치 완료' }],
    });

    expect(fullPrompt).toContain('120분~180분');
    expect(fullPrompt).toContain('블록 사이 15분 휴식 간격 확보');
    expect(fullPrompt).toContain('한 블록 하는 시간을 2시간으로 늘려줘');
    expect(fullPrompt).toContain('currentScheduleBlocks');
    expect(fullPrompt).toContain('영어Ⅱ 10모 오답');
    expect(fullPrompt).toContain('checklistUpdates');
  });

  it('synchronizes checklist items (title, estimatedMinutes, new items) when AI updates or creates blocks', () => {
    const state = createInitialPlannerState();
    const targetItem = state.checklistItems[0];

    const result = validateAndSanitizeAiBlocks(
      [
        {
          date: '2026-11-16',
          startTime: '19:00',
          endTime: '21:00', // 120 minutes
          subjectId: targetItem.subjectId,
          checklistItemId: targetItem.id,
          title: '집중 심화 복습 (1/1)',
        },
        {
          date: '2026-11-16',
          startTime: '21:30',
          endTime: '23:00', // 90 minutes, not in original checklist
          subjectId: 'subj-calc1',
          title: '미적분Ⅰ 기출 변형 모의',
        },
      ],
      state,
      [],
      '2026-11-16',
      '2026-12-09',
      [
        {
          id: targetItem.id,
          subjectId: targetItem.subjectId,
          title: '집중 심화 복습',
          estimatedMinutes: 120,
        },
      ],
    );

    const updatedTarget = result.checklistItems.find((c) => c.id === targetItem.id);
    expect(updatedTarget?.title).toBe('집중 심화 복습');
    expect(updatedTarget?.estimatedMinutes).toBe(120);

    const createdAuto = result.checklistItems.find(
      (c) => c.title === '미적분Ⅰ 기출 변형 모의' && c.subjectId === 'subj-calc1',
    );
    expect(createdAuto).toBeDefined();
    expect(createdAuto?.estimatedMinutes).toBe(90);
    expect(result.blocks[1].checklistItemId).toBe(createdAuto?.id);
    expect(result.syncedChecklistCount).toBeGreaterThanOrEqual(2);
  });
});
