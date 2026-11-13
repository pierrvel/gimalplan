export type PastelColorKey =
  | 'slate'
  | 'sky'
  | 'indigo'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'violet'
  | 'teal';

export interface Subject {
  id: string;
  name: string;
  colorKey: PastelColorKey;
  examDate: string; // YYYY-MM-DD
  examPeriod: string; // e.g. '1교시'
  examStart: string; // HH:MM
  examEnd: string; // HH:MM
  order: number;
  updatedAt: number;
}

export interface ChecklistItem {
  id: string;
  subjectId: string;
  title: string;
  completed: boolean;
  estimatedMinutes: number;
  createdAt: number;
  updatedAt: number;
}

export type StudyBlockType = 'study' | 'final_prep' | 'exam';
export type StudyBlockSource = 'preset' | 'ai' | 'manual';

export interface StudyBlock {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM (up to 24:00)
  subjectId: string;
  checklistItemId?: string;
  title: string;
  type: StudyBlockType;
  completed: boolean;
  source: StudyBlockSource;
  updatedAt: number;
}

export interface TimeRange {
  start: string; // HH:MM
  end: string; // HH:MM (24:00 allowed)
  label?: string;
}

export interface FixedSlot extends TimeRange {
  kind: 'school' | 'meal' | 'academy' | 'exam' | 'final_prep';
  label: string;
  subjectId?: string;
}

export interface WeeklyRule {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sun, 1 = Mon ...
  label: string;
  studyWindows: TimeRange[];
  fixedSlots: FixedSlot[];
}

export interface DateOverride {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  note?: string;
  studyWindows: TimeRange[];
  fixedSlots: FixedSlot[];
  isExamPeriod?: boolean;
  finalPrepSubjectId?: string;
  maxOtherSubjectMinutes?: number;
  updatedAt: number;
}

export interface PlannerState {
  version: number;
  updatedAt: number;
  hasLocalEdits: boolean;
  lastUpdatedBy?: string;
  tombstones?: Record<string, number>;
  examStartDate: string; // 2026-12-03
  examEndDate: string; // 2026-12-09
  subjects: Subject[];
  checklistItems: ChecklistItem[];
  studyBlocks: StudyBlock[];
  weeklyRules: WeeklyRule[];
  dateOverrides: DateOverride[];
}

export interface DayScheduleContext {
  date: string;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  summaryLabel: string;
  isOverride: boolean;
  isExamPeriod: boolean;
  studyWindows: TimeRange[];
  fixedSlots: FixedSlot[];
  finalPrepSubjectId?: string;
  maxOtherSubjectMinutes?: number;
  examBlocks: FixedSlot[];
}

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'offline' | 'error';
