import { GoogleGenAI, Type } from '@google/genai';
import type { ChecklistItem, PlannerState, StudyBlock, Subject } from '../types/planner';
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

export interface AiChecklistUpdateCandidate {
  id: string;
  subjectId: string;
  title: string;
  estimatedMinutes: number;
  deleted?: boolean;
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
  currentDraftChecklist?: ChecklistItem[];
  revisionHistory?: AiRevisionTurn[];
}

export interface AiScheduleResult {
  blocks: StudyBlock[];
  checklistItems: ChecklistItem[];
  rationale: string;
  stats: {
    requestedCount: number;
    acceptedCount: number;
    trimmedForPrepCap: number;
    skippedInvalid: number;
    syncedChecklistCount: number;
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
    checklistUpdates: {
      type: Type.ARRAY,
      description:
        'Updates or additions to checklist items to keep the checklist synchronized with the scheduled blocks and user instructions.',
      items: {
        type: Type.OBJECT,
        properties: {
          id: {
            type: Type.STRING,
            description:
              'Existing checklist item id to update, or a new id (e.g. chk-ai-1) when creating a new checklist item.',
          },
          subjectId: {
            type: Type.STRING,
            description: 'Exact subject id from the supplied subjects list.',
          },
          title: {
            type: Type.STRING,
            description:
              'Checklist item title in Korean, synchronized with the study block title.',
          },
          estimatedMinutes: {
            type: Type.NUMBER,
            description: 'Total estimated study minutes for this checklist item.',
          },
          deleted: {
            type: Type.BOOLEAN,
            description: 'True only if the user explicitly requested deleting this checklist item.',
          },
        },
        required: ['id', 'subjectId', 'title', 'estimatedMinutes'],
      },
    },
  },
  required: ['rationale', 'blocks'],
};

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function synchronizeChecklistWithAiBlocks(
  baseChecklist: ChecklistItem[],
  aiBlocks: StudyBlock[],
  preservedBlocks: StudyBlock[],
  checklistUpdates: AiChecklistUpdateCandidate[] = [],
  validSubjectIds: Set<string>,
  now = Date.now(),
): {
  blocks: StudyBlock[];
  checklistItems: ChecklistItem[];
  syncedChecklistCount: number;
} {
  let syncedChecklistCount = 0;
  const nextChecklist: ChecklistItem[] = baseChecklist.map((item) => ({ ...item }));
  const itemById = new Map<string, ChecklistItem>(nextChecklist.map((item) => [item.id, item]));
  const aliasIdMap = new Map<string, string>();
  const explicitlyUpdatedTitleIds = new Set<string>();

  // 1. Apply explicit checklistUpdates from Gemini (updates, additions, or explicit deletions)
  for (const upd of checklistUpdates) {
    if (!upd || typeof upd.id !== 'string' || typeof upd.subjectId !== 'string') continue;
    if (!validSubjectIds.has(upd.subjectId)) continue;

    const existing = itemById.get(upd.id);
    if (upd.deleted) {
      if (existing) {
        itemById.delete(existing.id);
        const idx = nextChecklist.findIndex((i) => i.id === existing.id);
        if (idx >= 0) nextChecklist.splice(idx, 1);
        syncedChecklistCount += 1;
      }
      continue;
    }

    const cleanTitle = stripPartSuffix(String(upd.title ?? '').trim());
    if (!cleanTitle) continue;
    const est = Math.max(15, Math.min(10080, Math.round(Number(upd.estimatedMinutes) || 60)));

    if (existing) {
      if (
        existing.title !== cleanTitle ||
        existing.subjectId !== upd.subjectId ||
        existing.estimatedMinutes !== est
      ) {
        if (existing.title !== cleanTitle) {
          explicitlyUpdatedTitleIds.add(existing.id);
        }
        existing.title = cleanTitle;
        existing.subjectId = upd.subjectId;
        existing.estimatedMinutes = est;
        existing.updatedAt = now;
        syncedChecklistCount += 1;
      }
    } else {
      const normalizedId = upd.id.trim().startsWith('chk-')
        ? upd.id.trim()
        : `chk-ai-${Math.random().toString(36).slice(2, 8)}`;
      const created: ChecklistItem = {
        id: itemById.has(normalizedId)
          ? `chk-ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
          : normalizedId,
        subjectId: upd.subjectId,
        title: cleanTitle,
        completed: false,
        estimatedMinutes: est,
        createdAt: now,
        updatedAt: now,
      };
      aliasIdMap.set(upd.id, created.id);
      nextChecklist.push(created);
      itemById.set(created.id, created);
      explicitlyUpdatedTitleIds.add(created.id);
      syncedChecklistCount += 1;
    }
  }

  // 2. Link every AI block to an existing or newly created ChecklistItem
  const linkedAiBlocks = aiBlocks.map((blk) => {
    const mappedId = blk.checklistItemId
      ? (aliasIdMap.get(blk.checklistItemId) ?? blk.checklistItemId)
      : undefined;

    let linkedItem = mappedId ? itemById.get(mappedId) : undefined;
    const blockBaseTitle = stripPartSuffix(blk.title);

    if (!linkedItem) {
      linkedItem = nextChecklist.find(
        (item) =>
          item.subjectId === blk.subjectId &&
          stripPartSuffix(item.title) === blockBaseTitle,
      );
    }

    if (!linkedItem) {
      const newId = `chk-ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const duration = Math.max(15, getDurationMinutes(blk.startTime, blk.endTime));
      linkedItem = {
        id: newId,
        subjectId: blk.subjectId,
        title: blockBaseTitle || blk.title,
        completed: blk.completed,
        estimatedMinutes: duration,
        createdAt: now,
        updatedAt: now,
      };
      nextChecklist.push(linkedItem);
      itemById.set(newId, linkedItem);
      syncedChecklistCount += 1;
    }

    const suffix = extractPartSuffix(blk.title);
    const nextTitle = explicitlyUpdatedTitleIds.has(linkedItem.id)
      ? `${linkedItem.title}${suffix}`
      : blk.title;

    return {
      ...blk,
      checklistItemId: linkedItem.id,
      subjectId: linkedItem.subjectId,
      title: nextTitle,
    };
  });

  // 3. Recompute estimatedMinutes & sync titles from scheduled blocks to ChecklistItem
  const allResultBlocks = [...preservedBlocks, ...linkedAiBlocks];
  const blocksByChecklistId = new Map<string, StudyBlock[]>();
  for (const blk of allResultBlocks) {
    if (!blk.checklistItemId) continue;
    const list = blocksByChecklistId.get(blk.checklistItemId) ?? [];
    list.push(blk);
    blocksByChecklistId.set(blk.checklistItemId, list);
  }

  for (const [itemId, linkedBlocks] of blocksByChecklistId.entries()) {
    const item = itemById.get(itemId);
    if (!item) continue;

    const totalMinutes = linkedBlocks.reduce(
      (sum, b) => sum + getDurationMinutes(b.startTime, b.endTime),
      0,
    );
    const aiChild = linkedBlocks.find((b) => b.source === 'ai');
    const aiBaseTitle = aiChild ? stripPartSuffix(aiChild.title) : '';

    let changed = false;
    if (totalMinutes > 0 && item.estimatedMinutes !== totalMinutes) {
      item.estimatedMinutes = totalMinutes;
      changed = true;
    }
    if (aiBaseTitle && !explicitlyUpdatedTitleIds.has(itemId) && item.title !== aiBaseTitle) {
      item.title = aiBaseTitle;
      changed = true;
    }
    if (aiChild && item.subjectId !== aiChild.subjectId) {
      item.subjectId = aiChild.subjectId;
      changed = true;
    }
    if (changed) {
      item.updatedAt = now;
      syncedChecklistCount += 1;
    }
  }

  // Ensure preserved blocks also reflect any synced title/subject change
  const syncedAiIds = new Set(linkedAiBlocks.map((b) => b.id));
  const finalBlocks = allResultBlocks.map((blk) => {
    if (syncedAiIds.has(blk.id) || !blk.checklistItemId) return blk;
    const item = itemById.get(blk.checklistItemId);
    if (!item) return blk;
    const suffix = extractPartSuffix(blk.title);
    return {
      ...blk,
      subjectId: item.subjectId,
      title: `${item.title}${suffix}`,
    };
  });

  return {
    blocks: finalBlocks.sort((a, b) =>
      a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
    ),
    checklistItems: nextChecklist,
    syncedChecklistCount,
  };
}

export function validateAndSanitizeAiBlocks(
  candidates: AiGeneratedBlockCandidate[],
  state: PlannerState,
  preservedBlocks: StudyBlock[],
  startDate: string,
  endDate: string,
  checklistUpdates: AiChecklistUpdateCandidate[] = [],
  baseChecklistOverride?: ChecklistItem[],
): {
  blocks: StudyBlock[];
  checklistItems: ChecklistItem[];
  trimmedForPrepCap: number;
  skippedInvalid: number;
  syncedChecklistCount: number;
} {
  const subjectById = new Map<string, Subject>(state.subjects.map((s) => [s.id, s]));
  const workingChecklist = baseChecklistOverride ?? state.checklistItems;
  const checklistIds = new Set([
    ...workingChecklist.map((c) => c.id),
    ...checklistUpdates.map((u) => u.id),
  ]);

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

  const synced = synchronizeChecklistWithAiBlocks(
    workingChecklist,
    accepted,
    preservedBlocks,
    checklistUpdates,
    new Set(state.subjects.map((s) => s.id)),
    now,
  );

  // Return AI blocks separately when called directly without merging preservedBlocks,
  // or attach checklistItems/syncedChecklistCount for full sync.
  const acceptedAiIds = new Set(accepted.map((b) => b.id));
  const syncedAiBlocks = synced.blocks.filter((b) => acceptedAiIds.has(b.id));

  return {
    blocks: syncedAiBlocks,
    checklistItems: synced.checklistItems,
    trimmedForPrepCap,
    skippedInvalid,
    syncedChecklistCount: synced.syncedChecklistCount,
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
    currentDraftChecklist,
    revisionHistory = [],
  } = params;

  const endDate = state.examEndDate;
  const effectiveStart = startDate > endDate ? endDate : startDate;

  const preservedBlocks = preserveCompletedAndManual
    ? state.studyBlocks.filter((b) => b.completed || b.source !== 'ai')
    : [];

  const sourceChecklist = currentDraftChecklist ?? state.checklistItems;
  const pendingItems = sourceChecklist.filter((item) => !item.completed);
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
    '아래 규칙을 한 치의 오차 없이 지켜 JSON으로 학습 블록과 체크리스트 변경 사항을 함께 생성·수정하세요:',
    '1. 모든 블록은 해당 date의 availableWindows 범위 안에 완전히 포함되어야 하며, occupiedBlocks 및 다른 생성 블록과 겹치면 안 됩니다.',
    '2. 각 과목은 반드시 자신의 examDate 이전 날짜에 배치해야 합니다 (examDate 당일 시험 이후나 종료 후에는 배치 금지).',
    '3. 직전보강 규칙 (매우 중요): dailyAvailableConstraints에서 maxOtherSubjectMinutes가 지정된 날(예: 180분)에는 finalPrepSubjectId가 아닌 다른 과목들의 총 학습 시간이 절대 maxOtherSubjectMinutes(180분)를 초과해서는 안 됩니다.',
    `4. 기본 블록 길이 및 우선순위: 시험 일정이 임박한 과목과 미완료 항목을 우선 배분하며, 각 학습 블록 길이는 기본적으로 ${minBlockMinutes}분~${maxBlockMinutes}분 단위로 구성하세요. 단, userPreferences.customRules 또는 latestUserInstruction에서 다른 블록 길이나 분할 방식을 요구하면 그 지시를 우선 따르세요.`,
    '5. 사용자 규칙 및 직접 수정 지시 최우선 반영: userPreferences.customRules와 userPreferences.latestUserInstruction이 있는 경우(예: 블록 시간 늘리기/줄이기, 특정 과목 비중 조정, 체크리스트 항목 추가·수정·이름 변경·삭제 등), Hard Constraint(1~3번)를 위반하지 않는 선에서 최우선으로 반영하세요. currentScheduleBlocks가 함께 제공되었다면 기존 계획을 바탕으로 사용자가 요청한 부분만 정확히 수정하세요.',
    '6. 타임라인·체크리스트 동시 동기화 (필수): 모든 학습 블록은 checklistItemId로 체크리스트 항목과 연결되어야 하며, 블록의 이름·소요 시간·과목이 바뀌거나 새 학습 항목이 추가·삭제되면 checklistUpdates에도 동일한 id, subjectId, title, estimatedMinutes 변경 내역을 반드시 함께 반환해 타임라인과 체크리스트가 항상 일치하게 유지하세요.',
    '7. rationale은 한국어로 사용자의 규칙과 타임라인/체크리스트 수정 내역이 어떻게 반영되었는지 간결하고 객관적인 사실만 작성하세요 (이모지, 감탄사, 느낌표 금지).',
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

  let parsed: {
    rationale?: string;
    blocks?: AiGeneratedBlockCandidate[];
    checklistUpdates?: AiChecklistUpdateCandidate[];
  };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('AI 응답 JSON 파싱에 실패했습니다.');
  }

  const rawBlocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
  const rawChecklistUpdates = Array.isArray(parsed.checklistUpdates) ? parsed.checklistUpdates : [];
  const validated = validateAndSanitizeAiBlocks(
    rawBlocks,
    state,
    preservedBlocks,
    effectiveStart,
    endDate,
    rawChecklistUpdates,
    params.currentDraftChecklist,
  );

  // Also ensure preserved blocks keep synced titles/subjects from checklistItems
  const updatedItemById = new Map(validated.checklistItems.map((c) => [c.id, c]));
  const syncedPreserved = preservedBlocks.map((blk) => {
    if (!blk.checklistItemId) return blk;
    const item = updatedItemById.get(blk.checklistItemId);
    if (!item) return blk;
    const suffix = extractPartSuffix(blk.title);
    return {
      ...blk,
      subjectId: item.subjectId,
      title: `${item.title}${suffix}`,
    };
  });

  return {
    blocks: [...syncedPreserved, ...validated.blocks].sort((a, b) =>
      a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
    ),
    checklistItems: validated.checklistItems,
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale : '가용 시간 및 직전보강 제약을 기준으로 학습 블록과 체크리스트를 함께 반영했습니다.',
    stats: {
      requestedCount: rawBlocks.length,
      acceptedCount: validated.blocks.length,
      trimmedForPrepCap: validated.trimmedForPrepCap,
      skippedInvalid: validated.skippedInvalid,
      syncedChecklistCount: validated.syncedChecklistCount,
    },
  };
}
