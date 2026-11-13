import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { usePlanner } from '../context/PlannerContext';
import { PASTEL_STYLE_MAP } from '../data/presets';
import type { FixedSlot, StudyBlock, Subject } from '../types/planner';
import {
  getDayScheduleContext,
  getOpenStudyGaps,
  getOtherSubjectMinutesOnDate,
  getTotalAvailableMinutes,
} from '../utils/availability';
import {
  addDays,
  calculateDDay,
  formatDateWithWeekday,
  formatDDayLabel,
  formatDurationCompact,
  formatMinutesToTime,
  formatShortDate,
  getDurationMinutes,
  getTodayDateKey,
  getWeekDates,
  parseTimeToMinutes,
} from '../utils/time';
import { SubjectBadge } from './SubjectBadge';

const DAILY_GRID_HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 06:00 .. 23:00

function formatHoursColon(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}:${String(m).padStart(2, '0')}:00`;
}

interface TimelinePaneProps {
  selectedDate: string;
  onSelectDate: (dateKey: string) => void;
  onOpenAddBlock: (dateKey: string, startTime?: string, endTime?: string) => void;
  onOpenEditBlock: (block: StudyBlock) => void;
}

type TimelineEntry =
  | { kind: 'fixed'; start: string; end: string; slot: FixedSlot }
  | { kind: 'study'; start: string; end: string; block: StudyBlock };

export const TimelinePane: React.FC<TimelinePaneProps> = ({
  selectedDate,
  onSelectDate,
  onOpenAddBlock,
  onOpenEditBlock,
}) => {
  const { state, toggleStudyBlock, deleteStudyBlock } = usePlanner();
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [showFixedConstraints, setShowFixedConstraints] = useState(true);

  const subjectById = useMemo(
    () => new Map<string, Subject>(state.subjects.map((s) => [s.id, s])),
    [state.subjects],
  );

  const dayContext = useMemo(
    () => getDayScheduleContext(state, selectedDate),
    [state, selectedDate],
  );

  const dayStudyBlocks = useMemo(
    () =>
      state.studyBlocks
        .filter((b) => b.date === selectedDate)
        .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)),
    [state.studyBlocks, selectedDate],
  );

  const dayTotalAvailable = getTotalAvailableMinutes(dayContext);
  const dayPlannedMinutes = dayStudyBlocks.reduce(
    (sum, b) => sum + getDurationMinutes(b.startTime, b.endTime),
    0,
  );
  const dayCompletedMinutes = dayStudyBlocks
    .filter((b) => b.completed)
    .reduce((sum, b) => sum + getDurationMinutes(b.startTime, b.endTime), 0);
  const dDayForSelected = formatDDayLabel(calculateDDay(state.examStartDate, selectedDate));

  const otherSubjectMinutes = dayContext.finalPrepSubjectId
    ? getOtherSubjectMinutesOnDate(state.studyBlocks, selectedDate, dayContext.finalPrepSubjectId)
    : 0;

  const finalPrepSubject = dayContext.finalPrepSubjectId
    ? subjectById.get(dayContext.finalPrepSubjectId)
    : undefined;

  const chronologicalEntries = useMemo<TimelineEntry[]>(() => {
    const list: TimelineEntry[] = [];
    for (const slot of dayContext.fixedSlots) {
      if (
        !showFixedConstraints &&
        (slot.kind === 'school' || slot.kind === 'meal' || slot.kind === 'academy')
      ) {
        continue;
      }
      list.push({ kind: 'fixed', start: slot.start, end: slot.end, slot });
    }
    for (const block of dayStudyBlocks) {
      list.push({ kind: 'study', start: block.startTime, end: block.endTime, block });
    }
    return list.sort((a, b) => parseTimeToMinutes(a.start) - parseTimeToMinutes(b.start));
  }, [dayContext.fixedSlots, dayStudyBlocks, showFixedConstraints]);

  // Compute remaining free time gaps inside studyWindows
  const openGaps = useMemo(
    () => getOpenStudyGaps(dayContext, dayStudyBlocks),
    [dayContext, dayStudyBlocks],
  );

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const today = getTodayDateKey();

  const shiftRange = (direction: -1 | 1) => {
    const delta = viewMode === 'week' ? direction * 7 : direction;
    onSelectDate(addDays(selectedDate, delta));
  };

  return (
    <section aria-label="주간 및 일별 시간표 타임라인" className="flex h-full min-h-0 flex-col bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-1.5 border-b border-zinc-200 bg-slate-50 px-3 py-1.5 sm:gap-2 sm:px-4 sm:py-2">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <div
            role="tablist"
            aria-label="타임라인 보기 방식"
            className="inline-flex shrink-0 rounded-md border border-zinc-200 bg-white p-0.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'day'}
              onClick={() => setViewMode('day')}
              className={`tab-item touch-target cursor-pointer rounded px-2 py-1 text-xs transition-colors sm:px-2.5 ${
                viewMode === 'day'
                  ? 'bg-slate-50 text-blue-600'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              일간
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'week'}
              onClick={() => setViewMode('week')}
              className={`tab-item touch-target cursor-pointer rounded px-2 py-1 text-xs transition-colors sm:px-2.5 ${
                viewMode === 'week'
                  ? 'bg-slate-50 text-blue-600'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              주간
            </button>
          </div>

          <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
            <button
              type="button"
              onClick={() => shiftRange(-1)}
              aria-label={viewMode === 'week' ? '이전 주' : '이전 날'}
              className="touch-target inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-zinc-200 bg-white px-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
            >
              <ChevronLeft size={15} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <span className="tabular-nums min-w-[5.2rem] truncate px-1 text-center text-xs font-semibold text-zinc-900 sm:min-w-[7.2rem]">
              {viewMode === 'day'
                ? formatDateWithWeekday(selectedDate)
                : `${formatShortDate(weekDates[0])} – ${formatShortDate(weekDates[6])}`}
            </span>
            <button
              type="button"
              onClick={() => shiftRange(1)}
              aria-label={viewMode === 'week' ? '다음 주' : '다음 날'}
              className="touch-target inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-zinc-200 bg-white px-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
            >
              <ChevronRight size={15} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>

          <div className="hidden items-center gap-1 sm:flex">
            <button
              type="button"
              onClick={() => onSelectDate(today)}
              className={`touch-target cursor-pointer rounded-md border px-2 py-1 text-xs ${
                selectedDate === today
                  ? 'border-blue-200 bg-blue-50 font-medium text-blue-700'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() => onSelectDate(state.examStartDate)}
              className={`touch-target cursor-pointer rounded-md border px-2 py-1 text-xs ${
                selectedDate === state.examStartDate
                  ? 'border-blue-200 bg-blue-50 font-medium text-blue-700'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              시험 시작일
            </button>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {viewMode === 'day' && (
            <button
              type="button"
              onClick={() => setShowFixedConstraints((v) => !v)}
              aria-pressed={showFixedConstraints}
              className="touch-target hidden cursor-pointer rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 sm:inline-flex sm:items-center"
            >
              {showFixedConstraints ? '고정일정 숨김' : '고정일정 표시'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenAddBlock(selectedDate)}
            aria-label="학습 블록 추가"
            className="touch-target inline-flex cursor-pointer items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 sm:px-2.5"
          >
            <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
            <span>
              <span className="hidden min-[380px]:inline">블록 </span>추가
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Quick Action Bar */}
      <div className="flex items-center justify-between gap-1.5 border-b border-zinc-200 bg-white px-3 py-1.5 text-[11px] sm:hidden">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSelectDate(today)}
            className={`cursor-pointer rounded border px-2 py-0.5 text-[11px] ${
              selectedDate === today
                ? 'border-blue-200 bg-blue-50 font-medium text-blue-700'
                : 'border-zinc-200 bg-white text-zinc-600'
            }`}
          >
            오늘
          </button>
          <button
            type="button"
            onClick={() => onSelectDate(state.examStartDate)}
            className={`cursor-pointer rounded border px-2 py-0.5 text-[11px] ${
              selectedDate === state.examStartDate
                ? 'border-blue-200 bg-blue-50 font-medium text-blue-700'
                : 'border-zinc-200 bg-white text-zinc-600'
            }`}
          >
            시험 시작일
          </button>
        </div>
        {viewMode === 'day' && (
          <button
            type="button"
            onClick={() => setShowFixedConstraints((v) => !v)}
            aria-pressed={showFixedConstraints}
            className="cursor-pointer rounded border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-600"
          >
            {showFixedConstraints ? '고정일정 숨김' : '고정일정 표시'}
          </button>
        )}
      </div>

      {/* Main Scrollable Content */}
      {viewMode === 'day' ? (
        <div className="scroll-pane flex-1">
          <div className="grid min-h-full grid-cols-[1.08fr_0.92fr] divide-x divide-zinc-200 border-b border-zinc-200 sm:grid-cols-[1.18fr_0.82fr]">
            {/* Left Column: Date Header + Task & Time List */}
            <div className="flex min-w-0 flex-col bg-white">
              {/* Left Top Header: Date & Day Context */}
              <div className="border-b border-zinc-200 px-2.5 py-2.5 sm:px-4 sm:py-3">
                <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                  Date
                </div>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
                  <span className="tabular-nums text-base font-bold tracking-tight text-zinc-900 sm:text-lg">
                    {selectedDate.replaceAll('-', '.')}
                  </span>
                  <span className="text-[11px] font-medium text-zinc-500">
                    {formatDateWithWeekday(selectedDate).split(' ')[1]}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <span className="text-[11px] font-medium text-zinc-700">
                    {dayContext.summaryLabel}
                  </span>
                  {dayContext.isExamPeriod && (
                    <span className="rounded border border-zinc-200 bg-slate-50 px-1 py-0.5 text-[10px] font-medium text-zinc-600">
                      정규학원 휴원
                    </span>
                  )}
                  {finalPrepSubject && (
                    <span className="rounded border border-blue-200 bg-blue-50 px-1 py-0.5 text-[10px] font-medium text-blue-700">
                      {finalPrepSubject.name} 직전보강
                    </span>
                  )}
                </div>

                <div className="tabular-nums mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-zinc-500">
                  <span>가용 {formatDurationCompact(dayTotalAvailable)}</span>
                  {dayContext.maxOtherSubjectMinutes !== undefined && (
                    <span
                      className={`font-medium ${
                        otherSubjectMinutes >= dayContext.maxOtherSubjectMinutes
                          ? 'text-rose-700'
                          : 'text-zinc-700'
                      }`}
                    >
                      타 과목 {otherSubjectMinutes}/{dayContext.maxOtherSubjectMinutes}분
                    </span>
                  )}
                </div>

                {dayContext.studyWindows.length > 0 && (
                  <div className="tabular-nums mt-1.5 flex flex-wrap items-center gap-1 text-[10px] text-zinc-500">
                    <Clock size={11} strokeWidth={1.5} aria-hidden="true" />
                    <span>공부 가능:</span>
                    {dayContext.studyWindows.map((w, idx) => (
                      <span
                        key={`${w.start}-${w.end}-${idx}`}
                        className="rounded border border-zinc-200 bg-slate-50 px-1 py-0.5 text-zinc-700"
                      >
                        {w.start}–{w.end}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Left List: Study Blocks & Fixed Constraints */}
              <div className="flex-1 divide-y divide-zinc-100">
                {chronologicalEntries.length === 0 ? (
                  <div className="flex flex-col items-start gap-2 px-3 py-6 text-xs text-zinc-500 sm:px-4">
                    <p>이 날짜에 표시할 일정이 없습니다.</p>
                    <button
                      type="button"
                      onClick={() => onOpenAddBlock(selectedDate)}
                      className="touch-target inline-flex cursor-pointer items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-slate-50"
                    >
                      <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
                      <span>학습 블록 추가</span>
                    </button>
                  </div>
                ) : (
                  chronologicalEntries.map((entry, idx) => {
                    if (entry.kind === 'fixed') {
                      const { slot } = entry;
                      const subj = slot.subjectId ? subjectById.get(slot.subjectId) : undefined;
                      const isExam = slot.kind === 'exam';
                      const isPrep = slot.kind === 'final_prep';

                      return (
                        <div
                          key={`fixed-${slot.kind}-${slot.start}-${idx}`}
                          className={`flex items-center justify-between gap-1.5 px-2.5 py-2 sm:px-4 ${
                            isExam
                              ? 'bg-slate-50'
                              : isPrep
                                ? 'bg-blue-50/40'
                                : 'bg-white text-zinc-400'
                          }`}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-1.5">
                            <span
                              className={`h-3.5 w-1 shrink-0 rounded-full ${
                                isExam
                                  ? 'bg-zinc-600'
                                  : isPrep
                                    ? 'bg-blue-500'
                                    : 'bg-zinc-200'
                              }`}
                              aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1">
                                {subj && <SubjectBadge name={subj.name} colorKey={subj.colorKey} compact />}
                                <span
                                  className={`break-words text-[11px] sm:text-xs ${
                                    isExam || isPrep ? 'font-semibold text-zinc-900' : 'text-zinc-500'
                                  }`}
                                >
                                  {slot.label}
                                </span>
                              </div>
                            </div>
                          </div>
                          <span className="tabular-nums shrink-0 text-[10px] text-zinc-400 sm:text-[11px]">
                            {slot.start}–{slot.end}
                          </span>
                        </div>
                      );
                    }

                    const { block } = entry;
                    const subj = subjectById.get(block.subjectId);
                    const mins = getDurationMinutes(block.startTime, block.endTime);
                    const dotColor = subj ? PASTEL_STYLE_MAP[subj.colorKey].dot : 'bg-blue-500';

                    return (
                      <div
                        key={block.id}
                        className={`group flex items-start justify-between gap-1 px-2.5 py-2 transition-colors sm:items-center sm:gap-2 sm:px-4 ${
                          block.completed ? 'bg-slate-50/70' : 'bg-white hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="flex min-w-0 flex-1 items-start gap-1.5 sm:items-center">
                          <span
                            className={`mt-1.5 h-3.5 w-1 shrink-0 rounded-full sm:mt-0 ${dotColor}`}
                            aria-hidden="true"
                          />
                          <label className="touch-checkbox shrink-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={block.completed}
                              onChange={() => toggleStudyBlock(block.id)}
                              aria-label={`${block.title} 완료 표시`}
                              className="sr-only"
                            />
                            <span
                              className={`inline-flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                                block.completed
                                  ? 'border-blue-600 bg-blue-600 text-white'
                                  : 'border-zinc-300 bg-white text-transparent hover:border-zinc-400'
                              }`}
                            >
                              <Check size={12} strokeWidth={2} aria-hidden="true" />
                            </span>
                          </label>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1">
                              {subj && <SubjectBadge name={subj.name} colorKey={subj.colorKey} compact />}
                              <span
                                className={`break-words text-xs ${
                                  block.completed
                                    ? 'text-zinc-400 line-through'
                                    : 'font-medium text-zinc-900'
                                }`}
                              >
                                {block.title}
                              </span>
                            </div>
                            <div className="tabular-nums mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-500 sm:text-[11px]">
                              <span>
                                {block.startTime}–{block.endTime}
                              </span>
                              <span className="text-zinc-400">· {mins}분</span>
                              {block.source === 'ai' && (
                                <span className="rounded border border-zinc-200 bg-slate-50 px-1 py-0.2 text-[9px] font-medium text-zinc-500">
                                  AI
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center">
                          <button
                            type="button"
                            onClick={() => onOpenEditBlock(block)}
                            aria-label={`${block.title} 수정`}
                            className="touch-icon inline-flex cursor-pointer items-center justify-center rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800"
                          >
                            <Pencil size={12} strokeWidth={1.5} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteStudyBlock(block.id)}
                            aria-label={`${block.title} 삭제`}
                            className="touch-icon inline-flex cursor-pointer items-center justify-center rounded p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-700"
                          >
                            <Trash2 size={12} strokeWidth={1.5} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Unallocated open gaps */}
                {openGaps.length > 0 && (
                  <div className="bg-slate-50/50 px-2.5 py-2.5 sm:px-4">
                    <div className="mb-1.5 flex items-center gap-1 text-[10px] font-medium text-zinc-500 sm:text-[11px]">
                      <CalendarClock size={12} strokeWidth={1.5} aria-hidden="true" />
                      <span>잔여 가용 시간 슬롯</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {openGaps.map((gap) => (
                        <button
                          key={`${gap.start}-${gap.end}`}
                          type="button"
                          onClick={() => onOpenAddBlock(selectedDate, gap.start, gap.end)}
                          className="tabular-nums touch-target inline-flex cursor-pointer items-center gap-1 rounded border border-dashed border-zinc-300 bg-white px-2 py-1 text-[11px] text-zinc-700 transition-colors hover:border-blue-400 hover:text-blue-700"
                        >
                          <Plus size={11} strokeWidth={1.5} aria-hidden="true" />
                          <span>
                            {gap.start}–{gap.end} ({formatDurationCompact(gap.minutes)})
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: D-day + Total Time + 10-Minute Timetable Grid */}
            <div className="flex min-w-0 flex-col bg-white">
              {/* Right Top Header: D-Day + Total Study Time */}
              <div className="border-b border-zinc-200 px-2.5 py-2.5 text-center sm:px-3 sm:py-3">
                <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-zinc-500">
                  <span>D-day</span>
                  <span className="tabular-nums rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] font-bold text-blue-700">
                    {dDayForSelected}
                  </span>
                </div>
                <div className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                  Total Time
                </div>
                <div className="tabular-nums mt-0.5 text-base font-bold tracking-tight text-zinc-900 sm:text-lg">
                  {formatHoursColon(dayPlannedMinutes)}
                </div>
                <div className="tabular-nums mt-0.5 text-[10px] text-zinc-500">
                  완료 {formatDurationCompact(dayCompletedMinutes)} · 배치 {formatDurationCompact(dayPlannedMinutes)}
                </div>
              </div>

              {/* 10-Minute Tick Column Header */}
              <div className="flex items-center border-b border-zinc-200 bg-slate-50 text-[9px] font-medium text-zinc-400 tabular-nums">
                <div className="w-6 shrink-0 py-1 text-center sm:w-8">시</div>
                <div className="grid flex-1 grid-cols-6 divide-x divide-zinc-200 text-center">
                  <span className="py-1">10</span>
                  <span className="py-1">20</span>
                  <span className="py-1">30</span>
                  <span className="py-1">40</span>
                  <span className="py-1">50</span>
                  <span className="py-1">60</span>
                </div>
              </div>

              {/* Hourly 10-Minute Grid Rows (06:00 - 24:00) */}
              <div className="divide-y divide-zinc-100">
                {DAILY_GRID_HOURS.map((hour) => {
                  const hourStart = hour * 60;
                  const hourEnd = (hour + 1) * 60;
                  const displayHour = hour > 12 ? hour - 12 : hour;

                  const hourSegments = chronologicalEntries
                    .map((entry) => {
                      const sMin = parseTimeToMinutes(entry.start);
                      const eMin = parseTimeToMinutes(entry.end);
                      if (eMin <= hourStart || sMin >= hourEnd) return null;
                      const segStart = Math.max(sMin, hourStart);
                      const segEnd = Math.min(eMin, hourEnd);
                      const leftPct = ((segStart - hourStart) / 60) * 100;
                      const widthPct = ((segEnd - segStart) / 60) * 100;
                      const isFirstHourOfEntry = sMin >= hourStart && sMin < hourEnd;
                      return { entry, leftPct, widthPct, isFirstHourOfEntry };
                    })
                    .filter((seg): seg is NonNullable<typeof seg> => seg !== null);

                  return (
                    <div key={hour} className="flex items-stretch">
                      <div
                        title={`${String(hour).padStart(2, '0')}:00`}
                        className="tabular-nums flex w-6 shrink-0 items-center justify-end border-r border-zinc-200 pr-1 text-[10px] font-medium text-zinc-400 sm:w-8 sm:pr-1.5"
                      >
                        {displayHour}
                      </div>

                      <div className="relative grid h-6 flex-1 grid-cols-6 divide-x divide-zinc-100 sm:h-7">
                        {Array.from({ length: 6 }, (_, colIdx) => {
                          const cellStart = hourStart + colIdx * 10;
                          const cellEnd = cellStart + 10;
                          const isAvailableCell = dayContext.studyWindows.some(
                            (w) =>
                              cellStart >= parseTimeToMinutes(w.start) &&
                              cellEnd <= parseTimeToMinutes(w.end),
                          );
                          const blockEnd = Math.min(24 * 60, cellStart + 60);

                          return (
                            <button
                              key={colIdx}
                              type="button"
                              aria-label={`${formatMinutesToTime(cellStart)} 학습 블록 추가`}
                              onClick={() =>
                                onOpenAddBlock(
                                  selectedDate,
                                  formatMinutesToTime(cellStart),
                                  formatMinutesToTime(blockEnd),
                                )
                              }
                              className={`h-full w-full cursor-pointer transition-colors ${
                                isAvailableCell
                                  ? 'bg-white hover:bg-blue-50/60'
                                  : 'bg-slate-50/70 hover:bg-slate-100/70'
                              }`}
                            />
                          );
                        })}

                        {hourSegments.map((seg, segIdx) => {
                          if (seg.entry.kind === 'fixed') {
                            const { slot } = seg.entry;
                            const isPrep = slot.kind === 'final_prep';
                            const isExam = slot.kind === 'exam';
                            return (
                              <div
                                key={`seg-f-${hour}-${segIdx}`}
                                title={`${slot.label} (${slot.start}–${slot.end})`}
                                style={{
                                  left: `${seg.leftPct}%`,
                                  width: `${seg.widthPct}%`,
                                }}
                                className={`pointer-events-none absolute inset-y-[3px] flex items-center overflow-hidden rounded-[3px] border px-1 text-[9px] font-medium ${
                                  isExam
                                    ? 'border-zinc-400 bg-zinc-200 text-zinc-900'
                                    : isPrep
                                      ? 'border-blue-300 bg-blue-100/90 text-blue-900'
                                      : 'border-zinc-200 bg-zinc-100/90 text-zinc-500'
                                }`}
                              >
                                {seg.isFirstHourOfEntry && (
                                  <span className="truncate">{slot.label}</span>
                                )}
                              </div>
                            );
                          }

                          const { block } = seg.entry;
                          const subj = subjectById.get(block.subjectId);
                          const barStyle = subj
                            ? PASTEL_STYLE_MAP[subj.colorKey].bar
                            : 'bg-blue-200/90 border-blue-300 text-blue-950';

                          return (
                            <button
                              key={`seg-b-${block.id}-${hour}`}
                              type="button"
                              onClick={() => onOpenEditBlock(block)}
                              title={`${subj?.name ?? ''} · ${block.title} (${block.startTime}–${block.endTime})`}
                              style={{
                                left: `${seg.leftPct}%`,
                                width: `${seg.widthPct}%`,
                              }}
                              className={`absolute inset-y-[3px] flex cursor-pointer items-center overflow-hidden rounded-[3px] border px-1 text-left text-[9px] font-semibold transition-opacity hover:opacity-90 ${barStyle} ${
                                block.completed ? 'opacity-65' : ''
                              }`}
                            >
                              {seg.isFirstHourOfEntry && (
                                <span className="truncate">
                                  {subj ? `${subj.name} ` : ''}
                                  {block.title}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Week View */
        <div className="scroll-pane flex-1 overflow-x-auto">
          <div className="grid grid-cols-1 divide-y divide-zinc-200 border-b border-zinc-200 sm:min-w-[740px] sm:grid-cols-7 sm:divide-x sm:divide-y-0">
            {weekDates.map((dateKey) => {
              const ctx = getDayScheduleContext(state, dateKey);
              const blocks = state.studyBlocks
                .filter((b) => b.date === dateKey)
                .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));
              const totalAvail = getTotalAvailableMinutes(ctx);
              const isSelected = dateKey === selectedDate;
              const isToday = dateKey === today;
              const prepSubj = ctx.finalPrepSubjectId
                ? subjectById.get(ctx.finalPrepSubjectId)
                : undefined;

              return (
                <div
                  key={dateKey}
                  className={`flex min-h-0 flex-col sm:min-h-[26rem] ${
                    isSelected ? 'bg-slate-50/70' : 'bg-white'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectDate(dateKey);
                      setViewMode('day');
                    }}
                    className={`flex cursor-pointer flex-col items-start border-b border-zinc-200 px-2 py-2 text-left transition-colors hover:bg-slate-50 ${
                      isSelected ? 'border-b-blue-600 bg-blue-50/40' : ''
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-1">
                      <span
                        className={`tabular-nums text-xs font-semibold ${
                          isToday ? 'text-blue-600' : 'text-zinc-900'
                        }`}
                      >
                        {formatDateWithWeekday(dateKey)}
                      </span>
                      <span className="tabular-nums text-[10px] text-zinc-500">
                        {Math.round((totalAvail / 60) * 10) / 10}h
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {ctx.examBlocks.length > 0 && (
                        <span className="rounded border border-zinc-300 bg-white px-1 py-0.2 text-[10px] font-medium text-zinc-800">
                          시험
                        </span>
                      )}
                      {prepSubj && (
                        <span className="rounded border border-blue-200 bg-blue-50 px-1 py-0.2 text-[10px] font-medium text-blue-700">
                          보강:{prepSubj.name}
                        </span>
                      )}
                      {ctx.isOverride && !ctx.isExamPeriod && (
                        <span className="rounded border border-zinc-200 bg-slate-100 px-1 py-0.2 text-[10px] text-zinc-700">
                          휴교
                        </span>
                      )}
                    </div>
                  </button>

                  <div className="flex-1 divide-y divide-zinc-200">
                    {ctx.examBlocks.map((ex, i) => (
                      <div key={`wk-ex-${i}`} className="bg-slate-50 px-2 py-1.5 text-[11px]">
                        <div className="tabular-nums text-[10px] text-zinc-500">
                          {ex.start}–{ex.end}
                        </div>
                        <div className="truncate font-semibold text-zinc-900">{ex.label}</div>
                      </div>
                    ))}

                    {ctx.fixedSlots
                      .filter((f) => f.kind === 'final_prep')
                      .map((fp, i) => (
                        <div key={`wk-fp-${i}`} className="bg-blue-50/40 px-2 py-1.5 text-[11px]">
                          <div className="tabular-nums text-[10px] text-blue-700">
                            {fp.start}–{fp.end}
                          </div>
                          <div className="truncate font-medium text-blue-900">{fp.label}</div>
                        </div>
                      ))}

                    {blocks.map((blk) => {
                      const subj = subjectById.get(blk.subjectId);
                      return (
                        <div
                          key={blk.id}
                          className="flex items-start gap-1.5 px-2 py-1.5 text-[11px] hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={blk.completed}
                            onChange={() => toggleStudyBlock(blk.id)}
                            aria-label={`${blk.title} 완료 표시`}
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer"
                          />
                          <button
                            type="button"
                            onClick={() => onOpenEditBlock(blk)}
                            className="min-w-0 flex-1 cursor-pointer text-left"
                          >
                            <div className="tabular-nums text-[10px] text-zinc-500">
                              {blk.startTime}–{blk.endTime}
                            </div>
                            <div className="truncate font-medium text-zinc-800">
                              {subj ? `${subj.name} · ` : ''}
                              <span className={blk.completed ? 'text-zinc-400 line-through' : ''}>
                                {blk.title}
                              </span>
                            </div>
                          </button>
                        </div>
                      );
                    })}

                    {blocks.length === 0 && ctx.examBlocks.length === 0 && (
                      <div className="px-2 py-3 text-[11px] text-zinc-400">
                        <button
                          type="button"
                          onClick={() => onOpenAddBlock(dateKey)}
                          className="cursor-pointer hover:text-blue-600"
                        >
                          + 추가
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
