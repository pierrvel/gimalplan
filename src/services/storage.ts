import { createInitialPlannerState } from '../data/presets';
import type { PlannerState } from '../types/planner';

const PLANNER_STATE_KEY = 'final_exam_planner_state_v1';
const GEMINI_API_KEY_STORAGE = 'final_exam_planner_gemini_api_key';
const GEMINI_MODEL_STORAGE = 'final_exam_planner_gemini_model';

export const DEFAULT_GEMINI_MODEL = 'gemini-4-argon';

export const GEMINI_MODEL_PRESETS = [
  { id: 'gemini-4-argon', label: 'Gemini 4 Argon (기본 · 고정밀 추론)' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (고속 균형)' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (경량)' },
] as const;

export function sanitizePlannerState(raw: unknown): PlannerState {
  const fallback = createInitialPlannerState();
  if (!raw || typeof raw !== 'object') return fallback;
  const candidate = raw as Partial<PlannerState>;

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
    checklistItems: Array.isArray(candidate.checklistItems)
      ? candidate.checklistItems
      : fallback.checklistItems,
    studyBlocks: Array.isArray(candidate.studyBlocks) ? candidate.studyBlocks : fallback.studyBlocks,
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
    return localStorage.getItem(GEMINI_API_KEY_STORAGE) ?? '';
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
    return localStorage.getItem(GEMINI_MODEL_STORAGE) || DEFAULT_GEMINI_MODEL;
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
