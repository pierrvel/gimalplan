import { GoogleGenAI, Type } from '@google/genai';
import type { ChecklistItem, PlannerState, StudyBlock, Subject } from '../types/planner';
import { getDayScheduleContext, isTimeRangeInsideWindows } from '../utils/availability';
import { getItemRemainingMinutes } from '../utils/progress';
import {
  enumerateDateRange,
  formatMinutesToTime,
  getDurationMinutes,
  parseTimeToMinutes,
} from '../utils/time';

export interface AiGeneratedBlockCandidate {
  date: string;
  startTime: string;
  endTime: string;
  subjectId: string;
  checklistItemId: string;
  title: string;
}

export interface AiRevisionTurn {
  instruction: string;
  rationale: string;
}

export interface GenerateAiScheduleParams {
  state: PlannerState;
  apiKey: string;
  model: string;
  startDate: string;
  preserveCompletedAndManual: boolean;
  minBlockMinutes?: number;
  maxBlockMinutes?: number;
  customRules?: string[];
  userInstruction?: string;
  currentDraftBlocks?: StudyBlock[];
  revisionHistory?: AiRevisionTurn[];
}

export interface AiScheduleResult {
  /** Preserved blocks plus the newly accepted AI blocks, sorted by date and time. */
  blocks: StudyBlock[];
  /** Only the AI blocks accepted in this generation (never preserved blocks). */
  placedBlocks: StudyBlock[];
  /** Blocks from the comparison base (currentDraftBlocks ?? state.studyBlocks) that are not preserved. */
  replacedBlocks: StudyBlock[];
  rationale: string;
  budgetMinutes: number;
  placedMinutes: number;
  unplacedByItem: Record<string, number>;
  stats: {
    requestedCount: number;
    acceptedCount: number;
    trimmedForPrepCap: number;
    trimmedForBudget: number;
    skippedInvalid: number;
  };
}

export function stripPartSuffix(title: string): string {
  return title.replace(/\s*(?:\(\s*\d+\s*\/\s*\d+\s*\)|\[\s*\d+\s*\/\s*\d+\s*\])\s*$/u, '').trim();
}

export function extractPartSuffix(title: string): string {
  const match = title.match(/(\s*(?:\(\s*\d+\s*\/\s*\d+\s*\)|\[\s*\d+\s*\/\s*\d+\s*\]))\s*$/u);
  return match ? match[1] : '';
}

const SCHEDULE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    rationale: {
      type: Type.STRING,
      description: 'Concise Korean summary of how study sessions were prioritized and scheduled.',
    },
    blocks: {
      type: Type.ARRAY,
      description: 'Scheduled study blocks within the provided available windows.',
      items: {
        type: Type.OBJECT,
        properties: {
          date: {
            type: Type.STRING,
            description: 'Date in YYYY-MM-DD format.',
          },
          startTime: {
            type: Type.STRING,
            description: 'Start time in 24-hour HH:MM format.',
          },
          endTime: {
            type: Type.STRING,
            description: 'End time in 24-hour HH:MM format (up to 24:00).',
          },
          subjectId: {
            type: Type.STRING,
            description: 'Exact subject id from the supplied subjects list.',
          },
          checklistItemId: {
            type: Type.STRING,
            description: 'Exact id of one of the supplied pendingChecklistItems.',
          },
          title: {
            type: Type.STRING,
            description: 'Short study task title in Korean.',
          },
        },
        required: ['date', 'startTime', 'endTime', 'subjectId', 'checklistItemId', 'title'],
      },
    },
  },
  required: ['rationale', 'blocks'],
};

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function blockMinutes(block: StudyBlock): number {
  return getDurationMinutes(block.startTime, block.endTime);
}

function compareBlocks(a: StudyBlock, b: StudyBlock): number {
  return a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date);
}

/**
 * Blocks that survive a regeneration.
 * - preserve on : completed, non-AI, or before the start date
 * - preserve off: only blocks before the start date
 */
export function getPreservedBlocks(
  blocks: StudyBlock[],
  startDate: string,
  preserveCompletedAndManual: boolean,
): StudyBlock[] {
  return preserveCompletedAndManual
    ? blocks.filter((b) => b.completed || b.source !== 'ai' || b.date < startDate)
    : blocks.filter((b) => b.date < startDate);
}

/**
 * Remaining minutes the AI may place per incomplete checklist item:
 * item estimate minus completed linked minutes among the preserved blocks (the blocks that
 * survive apply), minus incomplete preserved blocks on/after the start date linked to it.
 * Items with no remaining budget are omitted.
 */
export function computeItemBudgets(
  state: PlannerState,
  preservedBlocks: StudyBlock[],
  startDate: string,
): Map<string, number> {
  const reservedByItem = new Map<string, number>();
  for (const b of preservedBlocks) {
    if (!b.checklistItemId || b.completed || b.date < startDate) continue;
    reservedByItem.set(
      b.checklistItemId,
      (reservedByItem.get(b.checklistItemId) ?? 0) + blockMinutes(b),
    );
  }

  const budgets = new Map<string, number>();
  for (const item of state.checklistItems) {
    if (item.completed) continue;
    const budget =
      getItemRemainingMinutes(item, preservedBlocks) - (reservedByItem.get(item.id) ?? 0);
    if (budget > 0) budgets.set(item.id, budget);
  }
  return budgets;
}

export function validateAndSanitizeAiBlocks(
  candidates: AiGeneratedBlockCandidate[],
  state: PlannerState,
  preservedBlocks: StudyBlock[],
  startDate: string,
  endDate: string,
  budgets: Map<string, number>,
): {
  blocks: StudyBlock[];
  trimmedForPrepCap: number;
  trimmedForBudget: number;
  skippedInvalid: number;
  unplacedByItem: Record<string, number>;
} {
  const subjectById = new Map<string, Subject>(state.subjects.map((s) => [s.id, s]));
  const itemById = new Map<string, ChecklistItem>(state.checklistItems.map((c) => [c.id, c]));
  const remainingBudget = new Map(budgets);

  const occupiedByDate = new Map<string, Array<{ start: number; end: number }>>();
  const otherMinutesByDate = new Map<string, number>();

  for (const existing of preservedBlocks) {
    const start = parseTimeToMinutes(existing.startTime);
    const end = parseTimeToMinutes(existing.endTime);
    if (end <= start) continue;

    const list = occupiedByDate.get(existing.date) ?? [];
    list.push({ start, end });
    occupiedByDate.set(existing.date, list);

    const ctx = getDayScheduleContext(state, existing.date);
    if (
      ctx.finalPrepSubjectId &&
      ctx.maxOtherSubjectMinutes !== undefined &&
      existing.type === 'study' &&
      existing.subjectId !== ctx.finalPrepSubjectId
    ) {
      otherMinutesByDate.set(
        existing.date,
        (otherMinutesByDate.get(existing.date) ?? 0) + (end - start),
      );
    }
  }

  const accepted: StudyBlock[] = [];
  let trimmedForPrepCap = 0;
  let trimmedForBudget = 0;
  let skippedInvalid = 0;
  const now = Date.now();

  const sorted = [...candidates].sort((a, b) =>
    a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
  );

  for (const cand of sorted) {
    if (!cand || typeof cand.date !== 'string' || typeof cand.startTime !== 'string' || typeof cand.endTime !== 'string') {
      skippedInvalid += 1;
      continue;
    }

    // 1. The block must point at an incomplete checklist item that still has budget.
    const itemId = typeof cand.checklistItemId === 'string' ? cand.checklistItemId : '';
    const item = itemById.get(itemId);
    const budgetLeft = remainingBudget.get(itemId) ?? 0;
    if (!item || !budgets.has(itemId)) {
      skippedInvalid += 1;
      continue;
    }

    // 2. Deduct from the item budget: trim the end, or drop when less than 15 minutes remain.
    const startMin = parseTimeToMinutes(cand.startTime);
    let endMin = parseTimeToMinutes(cand.endTime);
    if (budgetLeft < 15) {
      skippedInvalid += 1;
      continue;
    }
    let budgetTrimmed = false;
    if (endMin - startMin > budgetLeft) {
      endMin = startMin + budgetLeft;
      budgetTrimmed = true;
    }

    if (cand.date < startDate || cand.date > endDate) {
      skippedInvalid += 1;
      continue;
    }

    // Subject always comes from the linked checklist item.
    const subjectId = item.subjectId;
    const subject = subjectById.get(subjectId);
    if (!subject) {
      skippedInvalid += 1;
      continue;
    }

    // Never schedule study for an exam that has already occurred or started
    if (cand.date > subject.examDate) {
      skippedInvalid += 1;
      continue;
    }
    if (cand.date === subject.examDate && endMin > parseTimeToMinutes(subject.examStart)) {
      skippedInvalid += 1;
      continue;
    }

    const ctx = getDayScheduleContext(state, cand.date);
    if (!isTimeRangeInsideWindows(formatMinutesToTime(startMin), formatMinutesToTime(endMin), ctx)) {
      skippedInvalid += 1;
      continue;
    }

    if (endMin - startMin < 15) {
      skippedInvalid += 1;
      continue;
    }

    // Enforce 직전보강 non-prep subject daily cap (e.g. max 180 minutes)
    let prepTrimmed = false;
    if (
      ctx.finalPrepSubjectId &&
      ctx.maxOtherSubjectMinutes !== undefined &&
      subjectId !== ctx.finalPrepSubjectId
    ) {
      const used = otherMinutesByDate.get(cand.date) ?? 0;
      const remaining = ctx.maxOtherSubjectMinutes - used;
      if (remaining < 15) {
        skippedInvalid += 1;
        continue;
      }
      if (endMin - startMin > remaining) {
        endMin = startMin + remaining;
        prepTrimmed = true;
      }
    }

    const occupied = occupiedByDate.get(cand.date) ?? [];
    if (occupied.some((slot) => rangesOverlap(startMin, endMin, slot.start, slot.end))) {
      skippedInvalid += 1;
      continue;
    }

    occupied.push({ start: startMin, end: endMin });
    occupiedByDate.set(cand.date, occupied);

    if (
      ctx.finalPrepSubjectId &&
      ctx.maxOtherSubjectMinutes !== undefined &&
      subjectId !== ctx.finalPrepSubjectId
    ) {
      otherMinutesByDate.set(cand.date, (otherMinutesByDate.get(cand.date) ?? 0) + (endMin - startMin));
    }

    if (budgetTrimmed) trimmedForBudget += 1;
    if (prepTrimmed) trimmedForPrepCap += 1;
    remainingBudget.set(itemId, budgetLeft - (endMin - startMin));

    accepted.push({
      id: `ai-${cand.date}-${formatMinutesToTime(startMin).replace(':', '')}-${Math.random().toString(36).slice(2, 6)}`,
      date: cand.date,
      startTime: formatMinutesToTime(startMin),
      endTime: formatMinutesToTime(endMin),
      subjectId,
      checklistItemId: item.id,
      title: item.title,
      type: 'study',
      completed: false,
      source: 'ai',
      updatedAt: now,
    });
  }

  // Titles come from the linked item; add " (i/n)" when an item spans several blocks.
  const countByItem = new Map<string, number>();
  for (const b of accepted) {
    countByItem.set(b.checklistItemId!, (countByItem.get(b.checklistItemId!) ?? 0) + 1);
  }
  const indexByItem = new Map<string, number>();
  const blocks = accepted.map((b) => {
    const total = countByItem.get(b.checklistItemId!) ?? 1;
    if (total <= 1) return b;
    const index = (indexByItem.get(b.checklistItemId!) ?? 0) + 1;
    indexByItem.set(b.checklistItemId!, index);
    return { ...b, title: `${b.title} (${index}/${total})` };
  });

  const unplacedByItem: Record<string, number> = {};
  for (const [id, left] of remainingBudget) {
    if (left > 0) unplacedByItem[id] = left;
  }

  return { blocks, trimmedForPrepCap, trimmedForBudget, skippedInvalid, unplacedByItem };
}

export function buildAiSchedulePrompt(params: GenerateAiScheduleParams): {
  fullPrompt: string;
  effectiveStart: string;
  endDate: string;
  preservedBlocks: StudyBlock[];
  budgets: Map<string, number>;
} {
  const {
    state,
    startDate,
    preserveCompletedAndManual,
    minBlockMinutes = 60,
    maxBlockMinutes = 120,
    customRules = [],
    userInstruction,
    currentDraftBlocks = [],
    revisionHistory = [],
  } = params;

  const endDate = state.examEndDate;
  const effectiveStart = startDate > endDate ? endDate : startDate;

  const preservedBlocks = getPreservedBlocks(
    state.studyBlocks,
    effectiveStart,
    preserveCompletedAndManual,
  );
  const budgets = computeItemBudgets(state, preservedBlocks, effectiveStart);

  const pendingItems = state.checklistItems.filter((item) => budgets.has(item.id));
  if (pendingItems.length === 0) {
    throw new Error('미완료된 시험범위 항목이 없습니다.');
  }

  const subjectMap = new Map(state.subjects.map((s) => [s.id, s]));
  const dateRange = enumerateDateRange(effectiveStart, endDate);

  const dayConstraints = dateRange
    .map((date) => {
      const ctx = getDayScheduleContext(state, date);
      if (ctx.studyWindows.length === 0) return null;

      const occupied = preservedBlocks
        .filter((b) => b.date === date)
        .map((b) => ({
          startTime: b.startTime,
          endTime: b.endTime,
          subjectId: b.subjectId,
          durationMinutes: getDurationMinutes(b.startTime, b.endTime),
        }));

      return {
        date,
        summary: ctx.summaryLabel,
        availableWindows: ctx.studyWindows.map((w) => ({ start: w.start, end: w.end })),
        occupiedBlocks: occupied,
        finalPrepSubjectId: ctx.finalPrepSubjectId ?? null,
        finalPrepSubjectName: ctx.finalPrepSubjectId
          ? (subjectMap.get(ctx.finalPrepSubjectId)?.name ?? null)
          : null,
        maxOtherSubjectMinutes: ctx.maxOtherSubjectMinutes ?? null,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  if (dayConstraints.length === 0) {
    throw new Error('선택한 기간 내에 배치 가능한 자습 시간대가 없습니다.');
  }

  const currentAiSchedule = currentDraftBlocks
    .filter((b) => b.source === 'ai')
    .map((b) => ({
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      durationMinutes: getDurationMinutes(b.startTime, b.endTime),
      subjectId: b.subjectId,
      subjectName: subjectMap.get(b.subjectId)?.name ?? '',
      checklistItemId: b.checklistItemId ?? '',
      title: b.title,
    }));

  const cleanedRules = customRules.map((r) => r.trim()).filter(Boolean);
  const cleanedInstruction = userInstruction?.trim() || null;

  const payload = {
    planningPeriod: { startDate: effectiveStart, endDate },
    subjects: state.subjects.map((s) => ({
      id: s.id,
      name: s.name,
      examDate: s.examDate,
      examPeriod: s.examPeriod,
      examStart: s.examStart,
    })),
    pendingChecklistItems: pendingItems.map((item) => ({
      id: item.id,
      subjectId: item.subjectId,
      subjectName: subjectMap.get(item.subjectId)?.name ?? '',
      title: item.title,
      remainingMinutes: budgets.get(item.id) ?? 0,
    })),
    dailyAvailableConstraints: dayConstraints,
    userPreferences: {
      preferredBlockDurationMinutes: {
        min: minBlockMinutes,
        max: maxBlockMinutes,
      },
      customRules: cleanedRules,
      latestUserInstruction: cleanedInstruction,
      previousRevisions: revisionHistory,
    },
    ...(currentAiSchedule.length > 0 ? { currentScheduleBlocks: currentAiSchedule } : {}),
  };

  const systemPrompt = [
    '당신은 한국 고등학생 기말고사 대비 학습 플래너 스케줄링 엔진입니다.',
    '아래 규칙을 한 치의 오차 없이 지켜, 주어진 체크리스트 항목을 시간표에 배치한 학습 블록을 JSON으로 생성·수정하세요:',
    '1. 모든 블록은 해당 date의 availableWindows 범위 안에 완전히 포함되어야 하며, occupiedBlocks 및 다른 생성 블록과 겹치면 안 됩니다.',
    '2. 각 과목은 반드시 자신의 examDate 이전 날짜에 배치해야 합니다 (examDate 당일 시험 이후나 종료 후에는 배치 금지).',
    '3. 직전보강 규칙 (매우 중요): dailyAvailableConstraints에서 maxOtherSubjectMinutes가 지정된 날(예: 180분)에는 finalPrepSubjectId가 아닌 다른 과목들의 총 학습 시간이 절대 maxOtherSubjectMinutes(180분)를 초과해서는 안 됩니다.',
    `4. 기본 블록 길이 및 우선순위: 시험 일정이 임박한 과목과 미완료 항목을 우선 배분하며, 각 학습 블록 길이는 기본적으로 ${minBlockMinutes}분~${maxBlockMinutes}분 단위로 구성하세요. 단, userPreferences.customRules 또는 latestUserInstruction에서 다른 블록 길이나 분할 방식을 요구하면 그 지시를 우선 따르세요.`,
    '5. 사용자 규칙 및 직접 수정 지시 최우선 반영: userPreferences.customRules와 userPreferences.latestUserInstruction이 있는 경우(예: 블록 시간 늘리기/줄이기, 특정 과목 비중 조정, 배치 날짜·시간 변경 등), Hard Constraint(1~3번)를 위반하지 않는 선에서 최우선으로 반영하세요. currentScheduleBlocks가 함께 제공되었다면 기존 계획을 바탕으로 사용자가 요청한 부분만 정확히 수정하세요.',
    '6. 배치 전용: 모든 블록의 checklistItemId는 pendingChecklistItems의 id 중 하나여야 하며, 항목별 배치 시간 합은 그 항목의 remainingMinutes를 넘으면 안 됩니다. 모든 빈 시간을 채울 필요는 없습니다. 체크리스트 항목을 추가·삭제·수정하지 마세요.',
    '7. 균등 배분: 각 과목의 남은 시간을 그 과목 시험일 전날까지의 날짜에 고르게 나누고, 하루에 한 과목만 몰지 마세요.',
    '8. 사용자가 체크리스트 항목 추가·삭제를 요청하면 수행하지 말고, rationale에 "체크리스트 수정은 직접 해 주세요"라고 안내하세요.',
    '9. rationale은 한국어로 사용자의 규칙과 배치 조정 내역이 어떻게 반영되었는지 간결하고 객관적인 사실만 작성하세요 (이모지, 감탄사, 느낌표 금지).',
  ].join('\n');

  return {
    fullPrompt: `${systemPrompt}\n\n[입력 데이터]\n${JSON.stringify(payload)}`,
    effectiveStart,
    endDate,
    preservedBlocks,
    budgets,
  };
}

export async function generateAiStudySchedule(
  params: GenerateAiScheduleParams,
): Promise<AiScheduleResult> {
  const { state, apiKey, model } = params;

  const trimmedKey = apiKey.trim();
  const { fullPrompt, effectiveStart, endDate, preservedBlocks, budgets } =
    buildAiSchedulePrompt(params);

  const resolvedModel = model.trim() || 'gemini-4-hydrogen';

  let text = '';
  let serverErrorMessage: string | null = null;
  let shouldFallbackToClient = false;

  try {
    const serverRes = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: resolvedModel,
        prompt: fullPrompt,
        ...(trimmedKey ? { apiKey: trimmedKey } : {}),
      }),
    });

    const contentType = serverRes.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const json = (await serverRes.json()) as { text?: string; error?: string };
      if (serverRes.ok && typeof json.text === 'string' && json.text.trim()) {
        text = json.text.trim();
      } else {
        serverErrorMessage = json.error || `AI 서버 요청 실패 (${serverRes.status})`;
      }
    } else if (serverRes.status === 404 || serverRes.status === 405) {
      shouldFallbackToClient = true;
    } else {
      serverErrorMessage = `AI 서버 응답 오류 (${serverRes.status})`;
    }
  } catch {
    shouldFallbackToClient = true;
  }

  if (serverErrorMessage) {
    throw new Error(serverErrorMessage);
  }

  if (!text && shouldFallbackToClient) {
    if (!trimmedKey) {
      throw new Error(
        '서버(/api/schedule)에 연결할 수 없습니다. Vercel 배포 환경에서 실행하거나 설정에서 개인 Gemini API 키를 입력해 주세요.',
      );
    }
    const ai = new GoogleGenAI({ apiKey: trimmedKey });
    const response = await ai.models.generateContent({
      model: resolvedModel,
      contents: fullPrompt,
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: SCHEDULE_RESPONSE_SCHEMA,
        temperature: 0.2,
      },
    });
    text = response.text?.trim() ?? '';
  }

  if (!text) {
    throw new Error('Gemini API로부터 유효한 JSON 응답을 받지 못했습니다.');
  }

  let parsed: {
    rationale?: string;
    blocks?: AiGeneratedBlockCandidate[];
  };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('AI 응답 JSON 파싱에 실패했습니다.');
  }

  const rawBlocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
  const validated = validateAndSanitizeAiBlocks(
    rawBlocks,
    state,
    preservedBlocks,
    effectiveStart,
    endDate,
    budgets,
  );

  const preservedIds = new Set(preservedBlocks.map((b) => b.id));
  const baseBlocks = params.currentDraftBlocks ?? state.studyBlocks;
  const replacedBlocks = baseBlocks.filter((b) => !preservedIds.has(b.id));

  let budgetMinutes = 0;
  for (const minutes of budgets.values()) budgetMinutes += minutes;
  const placedMinutes = validated.blocks.reduce((sum, b) => sum + blockMinutes(b), 0);

  return {
    blocks: [...preservedBlocks, ...validated.blocks].sort(compareBlocks),
    placedBlocks: validated.blocks,
    replacedBlocks,
    rationale:
      typeof parsed.rationale === 'string'
        ? parsed.rationale
        : '가용 시간 및 직전보강 제약을 기준으로 체크리스트 항목을 배치했습니다.',
    budgetMinutes,
    placedMinutes,
    unplacedByItem: validated.unplacedByItem,
    stats: {
      requestedCount: rawBlocks.length,
      acceptedCount: validated.blocks.length,
      trimmedForPrepCap: validated.trimmedForPrepCap,
      trimmedForBudget: validated.trimmedForBudget,
      skippedInvalid: validated.skippedInvalid,
    },
  };
}
