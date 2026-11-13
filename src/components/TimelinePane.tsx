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
import type { FixedSlot, StudyBlock, Subject } from '../types/planner';
import {
  getDayScheduleContext,
  getOpenStudyGaps,
  getOtherSubjectMinutesOnDate,
  getTotalAvailableMinutes,
} from '../utils/availability';
import {
  addDays,
  formatDateWithWeekday,
  formatDurationCompact,
  formatShortDate,
  getDurationMinutes,
  getTodayDateKey,
  getWeekDates,
  parseTimeToMinutes,
} from '../utils/time';
import { SubjectBadge } from './SubjectBadge';

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

      {/* Day Context Summary Strip */}
      {viewMode === 'day' && (
        <div className="border-b border-zinc-200 bg-white px-3 py-2.5 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-zinc-900">{dayContext.summaryLabel}</span>
              {dayContext.isExamPeriod && (
                <span className="rounded border border-zinc-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700">
                  정규학원 휴원
                </span>
              )}
              {finalPrepSubject && (
                <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
                  {finalPrepSubject.name} 직전보강일
                </span>
              )}
            </div>

            <div className="tabular-nums flex flex-wrap items-center gap-3 text-xs text-zinc-600">
              <span>
                자습 가용 {formatDurationCompact(dayTotalAvailable)}
              </span>
              <span>
                배치됨 {formatDurationCompact(dayPlannedMinutes)}
              </span>
              {dayContext.maxOtherSubjectMinutes !== undefined && (
                <span
                  className={`font-medium ${
                    otherSubjectMinutes >= dayContext.maxOtherSubjectMinutes
                      ? 'text-rose-700'
                      : 'text-zinc-800'
                  }`}
                >
                  타 과목 {otherSubjectMinutes}/{dayContext.maxOtherSubjectMinutes}분
                </span>
              )}
            </div>
          </div>

          {dayContext.studyWindows.length > 0 && (
            <div className="tabular-nums mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
              <Clock size={12} strokeWidth={1.5} aria-hidden="true" />
              <span>순수 공부 가능 시간:</span>
              {dayContext.studyWindows.map((w, idx) => (
                <span
                  key={`${w.start}-${w.end}-${idx}`}
                  className="rounded border border-zinc-200 bg-slate-50 px-1.5 py-0.5 text-zinc-700"
                >
                  {w.start}–{w.end}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Scrollable Content */}
      {viewMode === 'day' ? (
        <div className="scroll-pane flex-1 divide-y divide-zinc-200">
          {chronologicalEntries.length === 0 ? (
            <div className="flex flex-col items-start gap-2 px-4 py-8 text-xs text-zinc-500">
              <p>이 날짜에 표시할 일정이 없습니다.</p>
              <button
                type="button"
                onClick={() => onOpenAddBlock(selectedDate)}
                className="touch-target inline-flex cursor-pointer items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-slate-50"
              >
                <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
                <span>학습 블록 직접 추가</span>
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
                    className={`flex items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 ${
                      isExam
                        ? 'bg-slate-50'
                        : isPrep
                          ? 'bg-blue-50/40'
                          : 'bg-white text-zinc-500'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                      <span className="tabular-nums w-[5.25rem] shrink-0 text-xs font-medium text-zinc-600 sm:w-24">
                        {slot.start}–{slot.end}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                        {subj && <SubjectBadge name={subj.name} colorKey={subj.colorKey} compact />}
                        <span
                          className={`break-words text-xs sm:truncate ${
                            isExam || isPrep ? 'font-semibold text-zinc-900' : 'text-zinc-500'
                          }`}
                        >
                          {slot.label}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium ${
                        isExam
                          ? 'border-zinc-300 bg-white text-zinc-800'
                          : isPrep
                            ? 'border-blue-200 bg-white text-blue-700'
                            : 'border-zinc-200 bg-slate-50 text-zinc-500'
                      }`}
                    >
                      {isExam
                        ? '시험'
                        : isPrep
                          ? '직전보강'
                          : slot.kind === 'meal'
                            ? '식사'
                            : slot.kind === 'academy'
                              ? '학원'
                              : '학교'}
                    </span>
                  </div>
                );
              }

              const { block } = entry;
              const subj = subjectById.get(block.subjectId);
              const mins = getDurationMinutes(block.startTime, block.endTime);

              return (
                <div
                  key={block.id}
                  className={`group flex items-start justify-between gap-2 px-3 py-2 transition-colors sm:items-center sm:px-4 ${
                    block.completed ? 'bg-slate-50/70' : 'bg-white hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center sm:gap-2.5">
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

                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2.5">
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <div className="tabular-nums text-xs text-zinc-700 sm:w-24">
                          <span className="font-medium">{block.startTime}–{block.endTime}</span>
                          <span className="ml-1 text-[11px] text-zinc-400">({mins}분)</span>
                        </div>
                        {subj && <SubjectBadge name={subj.name} colorKey={subj.colorKey} compact />}
                        {block.source === 'ai' && (
                          <span className="rounded border border-zinc-200 bg-slate-50 px-1 py-0.2 text-[10px] font-medium text-zinc-500 sm:hidden">
                            AI
                          </span>
                        )}
                      </div>

                      <span
                        className={`break-words text-xs sm:truncate ${
                          block.completed ? 'text-zinc-400 line-through' : 'font-medium text-zinc-900'
                        }`}
                      >
                        {block.title}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                    {block.source === 'ai' && (
                      <span className="hidden rounded border border-zinc-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 sm:inline">
                        AI
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenEditBlock(block)}
                      aria-label={`${block.title} 수정`}
                      className="touch-icon inline-flex cursor-pointer items-center justify-center rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800"
                    >
                      <Pencil size={13} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteStudyBlock(block.id)}
                      aria-label={`${block.title} 삭제`}
                      className="touch-icon inline-flex cursor-pointer items-center justify-center rounded p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-700"
                    >
                      <Trash2 size={13} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })
          )}

          {/* Unallocated open gaps */}
          {openGaps.length > 0 && (
            <div className="bg-slate-50/50 px-3 py-2.5 sm:px-4">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
                <CalendarClock size={12} strokeWidth={1.5} aria-hidden="true" />
                <span>잔여 가용 시간 슬롯</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {openGaps.map((gap) => (
                  <button
                    key={`${gap.start}-${gap.end}`}
                    type="button"
                    onClick={() => onOpenAddBlock(selectedDate, gap.start, gap.end)}
                    className="tabular-nums touch-target inline-flex cursor-pointer items-center gap-1 rounded border border-dashed border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 transition-colors hover:border-blue-400 hover:text-blue-700"
                  >
                    <Plus size={12} strokeWidth={1.5} aria-hidden="true" />
                    <span>
                      {gap.start}–{gap.end} ({formatDurationCompact(gap.minutes)})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
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
