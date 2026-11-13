import { createInitialPlannerState } from '../data/presets';
import type { ChecklistItem, PlannerState, StudyBlock } from '../types/planner';
import { getDurationMinutes } from '../utils/time';

const PLANNER_STATE_KEY = 'final_exam_planner_state_v1';
const GEMINI_API_KEY_STORAGE = 'final_exam_planner_gemini_api_key';
const GEMINI_MODEL_STORAGE = 'final_exam_planner_gemini_model_v2';
const AI_PREFS_STORAGE = 'final_exam_planner_ai_prefs_v1';

export type BlockDurationPreset = '30-60' | '45-90' | '60-120' | '90-150' | '120-180';

export interface BlockDurationOption {
  id: BlockDurationPreset;
  label: string;
  minMinutes: number;
  maxMinutes: number;
}

export const BLOCK_DURATION_PRESETS: readonly BlockDurationOption[] = [
  { id: '30-60', label: '30–60분 (짧은 집중)', minMinutes: 30, maxMinutes: 60 },
  { id: '45-90', label: '45–90분 (기본 권장)', minMinutes: 45, maxMinutes: 90 },
  { id: '60-120', label: '60–120분 (표준 심화)', minMinutes: 60, maxMinutes: 120 },
  { id: '90-150', label: '90–150분 (긴 호흡)', minMinutes: 90, maxMinutes: 150 },
  { id: '120-180', label: '120–180분 (장시간 몰입)', minMinutes: 120, maxMinutes: 180 },
] as const;

export interface AiSchedulePreferences {
  blockDurationPreset: BlockDurationPreset;
  customRules: string[];
}

export const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';

export const GEMINI_MODEL_PRESETS = [
  { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen (기본 · 추론/속도 균형)' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (고속 · 경량)' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (고성능 에이전트)' },
  { id: 'gemini-4-argon', label: 'Gemini 4 Argon (유료 티어 전용)' },
] as const;

export function sanitizePlannerState(raw: unknown): PlannerState {
  const fallback = createInitialPlannerState();
  if (!raw || typeof raw !== 'object') return fallback;
  const candidate = raw as Partial<PlannerState>;

  const rawChecklist: ChecklistItem[] = Array.isArray(candidate.checklistItems)
    ? candidate.checklistItems
    : fallback.checklistItems;
  const rawBlocks: StudyBlock[] = Array.isArray(candidate.studyBlocks)
    ? candidate.studyBlocks
    : fallback.studyBlocks;

  // Reconcile any unlinked studyBlocks so Timeline <-> Checklist stay linked
  const checklistItems = rawChecklist.map((c) => ({ ...c }));
  const checklistIdSet = new Set(checklistItems.map((c) => c.id));
  const stripSuffix = (t: string) =>
    t.replace(/\s*(?:\(\s*\d+\s*\/\s*\d+\s*\)|\[\s*\d+\s*\/\s*\d+\s*\])\s*$/u, '').trim();

  const studyBlocks = rawBlocks.map((blk) => {
    if (blk.checklistItemId && checklistIdSet.has(blk.checklistItemId)) {
      return blk;
    }
    const baseTitle = stripSuffix(blk.title);
    let match = checklistItems.find(
      (c) => c.subjectId === blk.subjectId && stripSuffix(c.title) === baseTitle,
    );
    if (!match) {
      const now = blk.updatedAt || Date.now();
      const autoId = `chk-auto-${blk.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)}`;
      match = {
        id: checklistIdSet.has(autoId) ? `${autoId}-${checklistItems.length}` : autoId,
        subjectId: blk.subjectId,
        title: baseTitle || blk.title,
        completed: blk.completed,
        estimatedMinutes: Math.max(15, getDurationMinutes(blk.startTime, blk.endTime)),
        createdAt: now,
        updatedAt: now,
      };
      checklistItems.push(match);
      checklistIdSet.add(match.id);
    }
    return { ...blk, checklistItemId: match.id };
  });

  return {
    version: typeof candidate.version === 'number' ? candidate.version : fallback.version,
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : fallback.updatedAt,
    hasLocalEdits: Boolean(candidate.hasLocalEdits),
    lastUpdatedBy: typeof candidate.lastUpdatedBy === 'string' ? candidate.lastUpdatedBy : undefined,
    tombstones:
      candidate.tombstones && typeof candidate.tombstones === 'object' ? candidate.tombstones : {},
    examStartDate:
      typeof candidate.examStartDate === 'string' ? candidate.examStartDate : fallback.examStartDate,
    examEndDate:
      typeof candidate.examEndDate === 'string' ? candidate.examEndDate : fallback.examEndDate,
    subjects: Array.isArray(candidate.subjects) ? candidate.subjects : fallback.subjects,
    checklistItems,
    studyBlocks,
    weeklyRules:
      Array.isArray(candidate.weeklyRules) && candidate.weeklyRules.length === 7
        ? candidate.weeklyRules
        : fallback.weeklyRules,
    dateOverrides: Array.isArray(candidate.dateOverrides)
      ? candidate.dateOverrides
      : fallback.dateOverrides,
  };
}

export function loadLocalPlannerState(): PlannerState {
  try {
    const raw = localStorage.getItem(PLANNER_STATE_KEY);
    if (!raw) return createInitialPlannerState();
    return sanitizePlannerState(JSON.parse(raw));
  } catch {
    return createInitialPlannerState();
  }
}

export function saveLocalPlannerState(state: PlannerState): void {
  try {
    localStorage.setItem(PLANNER_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors in private browsing
  }
}

export function loadGeminiApiKey(): string {
  try {
    return localStorage.getItem(GEMINI_API_KEY_STORAGE)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function saveGeminiApiKey(key: string): void {
  try {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem(GEMINI_API_KEY_STORAGE, trimmed);
    } else {
      localStorage.removeItem(GEMINI_API_KEY_STORAGE);
    }
  } catch {
    // Ignore storage errors
  }
}

export function loadGeminiModel(): string {
  try {
    return localStorage.getItem(GEMINI_MODEL_STORAGE)?.trim() || DEFAULT_GEMINI_MODEL;
  } catch {
    return DEFAULT_GEMINI_MODEL;
  }
}

export function saveGeminiModel(modelId: string): void {
  try {
    const trimmed = modelId.trim();
    localStorage.setItem(GEMINI_MODEL_STORAGE, trimmed || DEFAULT_GEMINI_MODEL);
  } catch {
    // Ignore storage errors
  }
}

export function loadAiSchedulePreferences(): AiSchedulePreferences {
  const fallback: AiSchedulePreferences = {
    blockDurationPreset: '60-120',
    customRules: [],
  };
  try {
    const raw = localStorage.getItem(AI_PREFS_STORAGE);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<AiSchedulePreferences>;
    const validPreset = BLOCK_DURATION_PRESETS.some((p) => p.id === parsed.blockDurationPreset)
      ? (parsed.blockDurationPreset as BlockDurationPreset)
      : fallback.blockDurationPreset;
    const validRules = Array.isArray(parsed.customRules)
      ? parsed.customRules.filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
      : [];
    return {
      blockDurationPreset: validPreset,
      customRules: validRules,
    };
  } catch {
    return fallback;
  }
}

export function saveAiSchedulePreferences(prefs: AiSchedulePreferences): void {
  try {
    localStorage.setItem(AI_PREFS_STORAGE, JSON.stringify(prefs));
  } catch {
    // Ignore storage errors
  }
}
