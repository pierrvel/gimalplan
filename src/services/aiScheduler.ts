import { GoogleGenAI, Type } from '@google/genai';
import type { PlannerState, StudyBlock, Subject } from '../types/planner';
import { getDayScheduleContext, isTimeRangeInsideWindows } from '../utils/availability';
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
  checklistItemId?: string;
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
  blocks: StudyBlock[];
  rationale: string;
  stats: {
    requestedCount: number;
    acceptedCount: number;
    trimmedForPrepCap: number;
    skippedInvalid: number;
  };
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
            description: 'Matching checklist item id, or empty string if general review.',
          },
          title: {
            type: Type.STRING,
            description: 'Short study task title in Korean.',
          },
        },
        required: ['date', 'startTime', 'endTime', 'subjectId', 'title'],
      },
    },
  },
  required: ['rationale', 'blocks'],
};

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function validateAndSanitizeAiBlocks(
  candidates: AiGeneratedBlockCandidate[],
  state: PlannerState,
  preservedBlocks: StudyBlock[],
  startDate: string,
  endDate: string,
): {
  blocks: StudyBlock[];
  trimmedForPrepCap: number;
  skippedInvalid: number;
} {
  const subjectById = new Map<string, Subject>(state.subjects.map((s) => [s.id, s]));
  const checklistIds = new Set(state.checklistItems.map((c) => c.id));

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
  let skippedInvalid = 0;
  const now = Date.now();

  const sorted = [...candidates].sort((a, b) =>
    a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
  );

  for (const cand of sorted) {
    if (!cand || typeof cand.date !== 'string') {
      skippedInvalid += 1;
      continue;
    }
    if (cand.date < startDate || cand.date > endDate) {
      skippedInvalid += 1;
      continue;
    }

    const subject = subjectById.get(cand.subjectId);
    if (!subject) {
      skippedInvalid += 1;
      continue;
    }

    // Never schedule study for an exam that has already occurred or started
    if (cand.date > subject.examDate) {
      skippedInvalid += 1;
      continue;
    }
    if (
      cand.date === subject.examDate &&
      parseTimeToMinutes(cand.endTime) > parseTimeToMinutes(subject.examStart)
    ) {
      skippedInvalid += 1;
      continue;
    }

    const ctx = getDayScheduleContext(state, cand.date);
    if (!isTimeRangeInsideWindows(cand.startTime, cand.endTime, ctx)) {
      skippedInvalid += 1;
      continue;
    }

    const startMin = parseTimeToMinutes(cand.startTime);
    let endMin = parseTimeToMinutes(cand.endTime);
    if (endMin - startMin < 15) {
      skippedInvalid += 1;
      continue;
    }

    // Enforce 직전보강 non-prep subject daily cap (e.g. max 180 minutes)
    if (
      ctx.finalPrepSubjectId &&
      ctx.maxOtherSubjectMinutes !== undefined &&
      cand.subjectId !== ctx.finalPrepSubjectId
    ) {
      const used = otherMinutesByDate.get(cand.date) ?? 0;
      const remaining = ctx.maxOtherSubjectMinutes - used;
      if (remaining < 15) {
        skippedInvalid += 1;
        continue;
      }
      if (endMin - startMin > remaining) {
        endMin = startMin + remaining;
        trimmedForPrepCap += 1;
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
      cand.subjectId !== ctx.finalPrepSubjectId
    ) {
      otherMinutesByDate.set(cand.date, (otherMinutesByDate.get(cand.date) ?? 0) + (endMin - startMin));
    }

    const validChecklistId =
      cand.checklistItemId && checklistIds.has(cand.checklistItemId)
        ? cand.checklistItemId
        : undefined;

    accepted.push({
      id: `ai-${cand.date}-${formatMinutesToTime(startMin).replace(':', '')}-${Math.random().toString(36).slice(2, 6)}`,
      date: cand.date,
      startTime: formatMinutesToTime(startMin),
      endTime: formatMinutesToTime(endMin),
      subjectId: cand.subjectId,
      checklistItemId: validChecklistId,
      title: cand.title.trim() || `${subject.name} 학습`,
      type: 'study',
      completed: false,
      source: 'ai',
      updatedAt: now,
    });
  }

  return {
    blocks: accepted,
    trimmedForPrepCap,
    skippedInvalid,
  };
}

export function buildAiSchedulePrompt(params: GenerateAiScheduleParams): {
  fullPrompt: string;
  effectiveStart: string;
  endDate: string;
  preservedBlocks: StudyBlock[];
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

  const preservedBlocks = preserveCompletedAndManual
    ? state.studyBlocks.filter((b) => b.completed || b.source !== 'ai')
    : [];

  const pendingItems = state.checklistItems.filter((item) => !item.completed);
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
      estimatedMinutes: item.estimatedMinutes,
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
    '아래 규칙을 한 치의 오차 없이 지켜 JSON으로 학습 블록을 배치하거나 수정하세요:',
    '1. 모든 블록은 해당 date의 availableWindows 범위 안에 완전히 포함되어야 하며, occupiedBlocks 및 다른 생성 블록과 겹치면 안 됩니다.',
    '2. 각 과목은 반드시 자신의 examDate 이전 날짜에 배치해야 합니다 (examDate 당일 시험 이후나 종료 후에는 배치 금지).',
    '3. 직전보강 규칙 (매우 중요): dailyAvailableConstraints에서 maxOtherSubjectMinutes가 지정된 날(예: 180분)에는 finalPrepSubjectId가 아닌 다른 과목들의 총 학습 시간이 절대 maxOtherSubjectMinutes(180분)를 초과해서는 안 됩니다.',
    `4. 기본 블록 길이 및 우선순위: 시험 일정이 임박한 과목과 미완료 항목을 우선 배분하며, 각 학습 블록 길이는 기본적으로 ${minBlockMinutes}분~${maxBlockMinutes}분 단위로 구성하세요. 단, userPreferences.customRules 또는 latestUserInstruction에서 다른 블록 길이나 분할 방식을 요구하면 그 지시를 우선 따르세요.`,
    '5. 사용자 규칙 및 직접 수정 지시 최우선 반영: userPreferences.customRules와 userPreferences.latestUserInstruction이 있는 경우(예: 블록 시간 늘리기/줄이기, 특정 과목 비중 조정, 블록 간 휴식 시간 확보, 특정 날짜/시간대 변경 등), Hard Constraint(1~3번)를 위반하지 않는 선에서 최우선으로 반영하세요. currentScheduleBlocks가 함께 제공되었다면 기존 계획을 바탕으로 사용자가 요청한 부분만 정확히 수정하고 나머지 흐름은 일관되게 유지하세요.',
    '6. rationale은 한국어로 사용자의 규칙과 수정 요청이 어떻게 반영되었는지 간결하고 객관적인 사실만 작성하세요 (이모지, 감탄사, 느낌표 금지).',
  ].join('\n');

  return {
    fullPrompt: `${systemPrompt}\n\n[입력 데이터]\n${JSON.stringify(payload)}`,
    effectiveStart,
    endDate,
    preservedBlocks,
  };
}

export async function generateAiStudySchedule(
  params: GenerateAiScheduleParams,
): Promise<AiScheduleResult> {
  const { state, apiKey, model } = params;

  const trimmedKey = apiKey.trim();
  const { fullPrompt, effectiveStart, endDate, preservedBlocks } = buildAiSchedulePrompt(params);

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

  let parsed: { rationale?: string; blocks?: AiGeneratedBlockCandidate[] };
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
  );

  return {
    blocks: [...preservedBlocks, ...validated.blocks].sort((a, b) =>
      a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
    ),
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale : '가용 시간 및 직전보강 제약을 기준으로 학습 블록을 배치했습니다.',
    stats: {
      requestedCount: rawBlocks.length,
      acceptedCount: validated.blocks.length,
      trimmedForPrepCap: validated.trimmedForPrepCap,
      skippedInvalid: validated.skippedInvalid,
    },
  };
}
