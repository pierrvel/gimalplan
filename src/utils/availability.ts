import type { DayScheduleContext, FixedSlot, PlannerState, StudyBlock } from '../types/planner';
import { getDayOfWeek, getDurationMinutes, parseTimeToMinutes } from './time';

export function getDayScheduleContext(state: PlannerState, dateKey: string): DayScheduleContext {
  const dayOfWeek = getDayOfWeek(dateKey);
  const override = state.dateOverrides.find((o) => o.date === dateKey);
  const weekly = state.weeklyRules.find((r) => r.dayOfWeek === dayOfWeek);

  const examBlocks: FixedSlot[] = state.subjects
    .filter((s) => s.examDate === dateKey && s.examStart && s.examEnd)
    .sort((a, b) => parseTimeToMinutes(a.examStart) - parseTimeToMinutes(b.examStart))
    .map((s) => ({
      start: s.examStart,
      end: s.examEnd,
      kind: 'exam' as const,
      label: `${s.examPeriod ? `${s.examPeriod} ` : ''}${s.name} 시험`,
      subjectId: s.id,
    }));

  const isInExamRange = dateKey >= state.examStartDate && dateKey <= state.examEndDate;

  if (override) {
    const fixedSlots = [...examBlocks, ...override.fixedSlots].sort(
      (a, b) => parseTimeToMinutes(a.start) - parseTimeToMinutes(b.start),
    );
    return {
      date: dateKey,
      dayOfWeek,
      summaryLabel: override.title,
      isOverride: true,
      isExamPeriod: Boolean(override.isExamPeriod || isInExamRange),
      studyWindows: override.studyWindows,
      fixedSlots,
      finalPrepSubjectId: override.finalPrepSubjectId,
      maxOtherSubjectMinutes: override.maxOtherSubjectMinutes,
      examBlocks,
    };
  }

  // Fallback for dates within exam range that do not have an explicit override:
  // Regular academies are paused during exam period.
  if (isInExamRange) {
    const baseFixed = (weekly?.fixedSlots ?? []).filter((f) => f.kind !== 'academy');
    const fixedSlots = [...examBlocks, ...baseFixed].sort(
      (a, b) => parseTimeToMinutes(a.start) - parseTimeToMinutes(b.start),
    );
    return {
      date: dateKey,
      dayOfWeek,
      summaryLabel: '시험기간 (정규학원 휴원)',
      isOverride: false,
      isExamPeriod: true,
      studyWindows: weekly?.studyWindows ?? [],
      fixedSlots,
      examBlocks,
    };
  }

  const fixedSlots = [...examBlocks, ...(weekly?.fixedSlots ?? [])].sort(
    (a, b) => parseTimeToMinutes(a.start) - parseTimeToMinutes(b.start),
  );

  return {
    date: dateKey,
    dayOfWeek,
    summaryLabel: weekly?.label ?? '기본 시간표',
    isOverride: false,
    isExamPeriod: false,
    studyWindows: weekly?.studyWindows ?? [],
    fixedSlots,
    examBlocks,
  };
}

export function getTotalAvailableMinutes(ctx: DayScheduleContext): number {
  return ctx.studyWindows.reduce((acc, w) => acc + getDurationMinutes(w.start, w.end), 0);
}

export function isTimeRangeInsideWindows(
  startTime: string,
  endTime: string,
  ctx: DayScheduleContext,
): boolean {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (end <= start) return false;
  return ctx.studyWindows.some(
    (w) => start >= parseTimeToMinutes(w.start) && end <= parseTimeToMinutes(w.end),
  );
}

export function getOtherSubjectMinutesOnDate(
  blocks: StudyBlock[],
  dateKey: string,
  finalPrepSubjectId: string,
): number {
  return blocks
    .filter((b) => b.date === dateKey && b.type === 'study' && b.subjectId !== finalPrepSubjectId)
    .reduce((acc, b) => acc + getDurationMinutes(b.startTime, b.endTime), 0);
}
