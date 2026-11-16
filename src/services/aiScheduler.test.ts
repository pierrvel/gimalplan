import { describe, expect, it } from 'vitest';
import { createInitialPlannerState } from '../data/presets';
import type { StudyBlock } from '../types/planner';
import {
  buildAiSchedulePrompt,
  computeItemBudgets,
  getPreservedBlocks,
  validateAndSanitizeAiBlocks,
} from './aiScheduler';

function block(partial: Partial<StudyBlock> & Pick<StudyBlock, 'id' | 'date' | 'startTime' | 'endTime'>): StudyBlock {
  return {
    subjectId: 'subj-calc1',
    title: '블록',
    type: 'study',
    completed: false,
    source: 'ai',
    updatedAt: 1000,
    ...partial,
  };
}

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
    // Budgets large enough that budget trimming does not interfere with the prep cap.
    const budgets = new Map<string, number>([
      ['chk-soc-1', 180],
      ['chk-calc1-1', 90],
      ['chk-eng2-2', 60],
    ]);

    const result = validateAndSanitizeAiBlocks(
      [
        {
          date: '2026-12-02',
          startTime: '21:00',
          endTime: '23:30', // 150m proposed -> remaining cap is 120m -> trims to 21:00~23:00
          subjectId: 'subj-society',
          checklistItemId: 'chk-soc-1',
          title: '사회와문화 문풀',
        },
        {
          date: '2026-12-02',
          startTime: '23:00',
          endTime: '23:30', // 30m more of other subject -> cap exhausted, skipped
          subjectId: 'subj-calc1',
          checklistItemId: 'chk-calc1-1',
          title: '미적분Ⅰ 문풀',
        },
        {
          date: '2026-12-02',
          startTime: '23:00',
          endTime: '24:00', // 60m of subj-eng2 (prep subject) -> allowed uncapped
          subjectId: 'subj-eng2',
          checklistItemId: 'chk-eng2-2',
          title: '영어Ⅱ 수특 프린트 9회',
        },
      ],
      state,
      existingManual,
      '2026-12-02',
      '2026-12-02',
      budgets,
    );

    expect(result.trimmedForPrepCap).toBe(1);
    expect(result.trimmedForBudget).toBe(0);
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
    const budgets = new Map<string, number>([
      ['chk-eng2-5', 240],
      ['chk-calc1-1', 240],
    ]);

    const result = validateAndSanitizeAiBlocks(
      [
        // Outside Mon dinner window (17:00~18:00 is blocked)
        {
          date: '2026-11-16',
          startTime: '17:00',
          endTime: '18:30',
          subjectId: 'subj-eng2',
          checklistItemId: 'chk-eng2-5',
          title: '식사시간 침범 블록',
        },
        // Valid Mon block
        {
          date: '2026-11-16',
          startTime: '19:00',
          endTime: '21:00',
          subjectId: 'subj-eng2',
          checklistItemId: 'chk-eng2-5',
          title: '영어Ⅱ 10모 오답',
        },
        // Overlapping Mon block
        {
          date: '2026-11-16',
          startTime: '20:00',
          endTime: '22:00',
          subjectId: 'subj-calc1',
          checklistItemId: 'chk-calc1-1',
          title: '겹치는 블록',
        },
        // Scheduled after subj-eng2 exam date (2026-12-03)
        {
          date: '2026-12-04',
          startTime: '13:00',
          endTime: '15:00',
          subjectId: 'subj-eng2',
          checklistItemId: 'chk-eng2-5',
          title: '이미 끝난 시험 과목',
        },
      ],
      state,
      [],
      '2026-11-16',
      '2026-12-09',
      budgets,
    );

    expect(result.blocks).toHaveLength(1);
    // Title is now taken from the linked checklist item.
    expect(result.blocks[0]).toMatchObject({
      startTime: '19:00',
      endTime: '21:00',
      title: '10모(23,30,31,32,33,34)',
    });
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
        checklistItemId: 'chk-eng2-5',
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
  });
});

describe('AI placement-only budgets', () => {
  it('trims a block that exceeds the item budget and drops the next block for the exhausted item', () => {
    const state = createInitialPlannerState();
    const budgets = computeItemBudgets(state, [], '2026-11-16');
    expect(budgets.get('chk-eng2-1')).toBe(45);

    const result = validateAndSanitizeAiBlocks(
      [
        {
          date: '2026-11-16',
          startTime: '19:00',
          endTime: '20:00',
          subjectId: 'subj-eng2',
          checklistItemId: 'chk-eng2-1',
          title: 'x',
        },
        {
          date: '2026-11-16',
          startTime: '20:00',
          endTime: '21:00',
          subjectId: 'subj-eng2',
          checklistItemId: 'chk-eng2-1',
          title: 'x',
        },
      ],
      state,
      [],
      '2026-11-16',
      '2026-12-09',
      budgets,
    );

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({ startTime: '19:00', endTime: '19:45' });
    expect(result.trimmedForBudget).toBe(1);
    expect(result.skippedInvalid).toBe(1);
    expect('chk-eng2-1' in result.unplacedByItem).toBe(false);
  });

  it('drops a block when less than 15 minutes of budget remain', () => {
    const state = createInitialPlannerState();
    const budgets = new Map<string, number>([['chk-eng2-1', 10]]);

    const result = validateAndSanitizeAiBlocks(
      [
        {
          date: '2026-11-16',
          startTime: '19:00',
          endTime: '20:00',
          subjectId: 'subj-eng2',
          checklistItemId: 'chk-eng2-1',
          title: 'x',
        },
      ],
      state,
      [],
      '2026-11-16',
      '2026-12-09',
      budgets,
    );

    expect(result.blocks).toHaveLength(0);
    expect(result.skippedInvalid).toBe(1);
    expect(result.unplacedByItem['chk-eng2-1']).toBe(10);
  });

  it('drops blocks pointing at unknown or completed checklist items', () => {
    const state = createInitialPlannerState();
    state.checklistItems = state.checklistItems.map((c) =>
      c.id === 'chk-calc1-2' ? { ...c, completed: true } : c,
    );
    const budgets = computeItemBudgets(state, [], '2026-11-16');
    expect(budgets.has('chk-calc1-2')).toBe(false);

    const result = validateAndSanitizeAiBlocks(
      [
        {
          date: '2026-11-16',
          startTime: '19:00',
          endTime: '20:00',
          subjectId: 'subj-calc1',
          checklistItemId: 'chk-nope',
          title: 'x',
        },
        {
          date: '2026-11-16',
          startTime: '20:00',
          endTime: '21:00',
          subjectId: 'subj-calc1',
          checklistItemId: 'chk-calc1-2',
          title: 'x',
        },
      ],
      state,
      [],
      '2026-11-16',
      '2026-12-09',
      budgets,
    );

    expect(result.blocks).toHaveLength(0);
    expect(result.skippedInvalid).toBe(2);
  });

  it('overwrites subject and title from the linked item and adds part suffixes', () => {
    const state = createInitialPlannerState();
    const budgets = computeItemBudgets(state, [], '2026-11-16');

    const result = validateAndSanitizeAiBlocks(
      [
        {
          date: '2026-11-16',
          startTime: '20:00',
          endTime: '20:45',
          subjectId: 'subj-eng2',
          checklistItemId: 'chk-calc1-1',
          title: '아무 제목',
        },
        {
          date: '2026-11-16',
          startTime: '19:00',
          endTime: '19:45',
          subjectId: 'subj-eng2',
          checklistItemId: 'chk-calc1-1',
          title: '아무 제목',
        },
      ],
      state,
      [],
      '2026-11-16',
      '2026-12-09',
      budgets,
    );

    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]).toMatchObject({
      startTime: '19:00',
      subjectId: 'subj-calc1',
      checklistItemId: 'chk-calc1-1',
      title: '정적분으로 정의된 함수 복습 (1/2)',
    });
    expect(result.blocks[1]).toMatchObject({
      startTime: '20:00',
      subjectId: 'subj-calc1',
      title: '정적분으로 정의된 함수 복습 (2/2)',
    });
    expect(result.unplacedByItem['chk-calc1-1']).toBeUndefined();
  });

  it('reports unplaced minutes per item', () => {
    const state = createInitialPlannerState();
    const budgets = computeItemBudgets(state, [], '2026-11-16');

    const result = validateAndSanitizeAiBlocks(
      [
        {
          date: '2026-11-16',
          startTime: '19:00',
          endTime: '19:30',
          subjectId: 'subj-eng2',
          checklistItemId: 'chk-eng2-1',
          title: 'x',
        },
      ],
      state,
      [],
      '2026-11-16',
      '2026-12-09',
      budgets,
    );

    expect(result.unplacedByItem['chk-eng2-1']).toBe(15);
    expect(result.unplacedByItem['chk-calc1-1']).toBe(90);
  });

  it('computeItemBudgets subtracts completed and preserved future blocks but not past incomplete ones', () => {
    const state = createInitialPlannerState();
    state.studyBlocks = [
      block({
        id: 'done-1',
        date: '2026-11-15',
        startTime: '19:00',
        endTime: '19:30',
        checklistItemId: 'chk-calc1-1',
        completed: true,
      }),
      block({
        id: 'past-1',
        date: '2026-11-14',
        startTime: '19:00',
        endTime: '20:00',
        checklistItemId: 'chk-calc1-1',
      }),
      block({
        id: 'manual-1',
        date: '2026-11-17',
        startTime: '19:00',
        endTime: '19:30',
        checklistItemId: 'chk-calc1-1',
        source: 'manual',
      }),
    ];
    const preserved = getPreservedBlocks(state.studyBlocks, '2026-11-16', true);
    expect(preserved.map((b) => b.id).sort()).toEqual(['done-1', 'manual-1', 'past-1']);

    const budgets = computeItemBudgets(state, preserved, '2026-11-16');
    expect(budgets.get('chk-calc1-1')).toBe(30);
  });

  it('computeItemBudgets with preservation off ignores completed blocks deleted on apply', () => {
    const state = createInitialPlannerState();
    state.studyBlocks = [
      block({
        id: 'done-on-start',
        date: '2026-11-16',
        startTime: '09:00',
        endTime: '09:30',
        checklistItemId: 'chk-calc1-1',
        completed: true,
      }),
    ];
    expect(state.checklistItems.find((c) => c.id === 'chk-calc1-1')!.estimatedMinutes).toBe(90);
    const preserved = getPreservedBlocks(state.studyBlocks, '2026-11-16', false);
    expect(preserved).toEqual([]);

    const budgets = computeItemBudgets(state, preserved, '2026-11-16');
    expect(budgets.get('chk-calc1-1')).toBe(90);
  });

  it('getPreservedBlocks without preservation keeps only blocks before the start date', () => {
    const blocks = [
      block({ id: 'past', date: '2026-11-14', startTime: '19:00', endTime: '20:00' }),
      block({
        id: 'manual',
        date: '2026-11-17',
        startTime: '19:00',
        endTime: '20:00',
        source: 'manual',
      }),
      block({
        id: 'done',
        date: '2026-11-17',
        startTime: '20:00',
        endTime: '21:00',
        completed: true,
      }),
    ];
    expect(getPreservedBlocks(blocks, '2026-11-16', false).map((b) => b.id)).toEqual(['past']);
    expect(getPreservedBlocks(blocks, '2026-11-16', true).map((b) => b.id)).toEqual([
      'past',
      'manual',
      'done',
    ]);
  });

  it('prompt lists remainingMinutes, omits zero-budget items, and no longer asks for checklistUpdates', () => {
    const state = createInitialPlannerState();
    state.studyBlocks = [
      block({
        id: 'done-eng',
        date: '2026-11-15',
        startTime: '19:00',
        endTime: '19:45',
        subjectId: 'subj-eng2',
        checklistItemId: 'chk-eng2-1',
        completed: true,
      }),
    ];

    const { fullPrompt, budgets } = buildAiSchedulePrompt({
      state,
      apiKey: '',
      model: 'gemini-4-hydrogen',
      startDate: '2026-11-16',
      preserveCompletedAndManual: true,
    });

    expect(fullPrompt).toContain('"remainingMinutes"');
    expect(fullPrompt).not.toContain('checklistUpdates');
    expect(fullPrompt).not.toContain('chk-eng2-1');
    expect(budgets.has('chk-eng2-1')).toBe(false);
    expect(fullPrompt).toContain('체크리스트 수정은 직접 해 주세요');
  });
});
