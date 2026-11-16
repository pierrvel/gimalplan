import React, { useMemo } from 'react';
import { AlertTriangle, CalendarDays, Check, ChevronRight, Cpu } from 'lucide-react';
import { usePlanner } from '../context/PlannerContext';
import type { StudyBlock, Subject } from '../types/planner';
import { getDayScheduleContext } from '../utils/availability';
import { getSubjectProgress, getTodayStudyBlocks } from '../utils/progress';
import {
  calculateDDay,
  formatDDayLabel,
  formatDateWithWeekday,
  formatDurationCompact,
  getDurationMinutes,
} from '../utils/time';
import { SubjectBadge } from './SubjectBadge';

interface TodayPaneProps {
  today: string;
  onOpenEditBlock: (block: StudyBlock) => void;
  onSelectSubject: (subjectId: string) => void;
  onGoToTimeline: () => void;
  onOpenAiModal: () => void;
}

export const TodayPane: React.FC<TodayPaneProps> = ({
  today,
  onOpenEditBlock,
  onSelectSubject,
  onGoToTimeline,
  onOpenAiModal,
}) => {
  const { state, toggleStudyBlock } = usePlanner();

  const subjectById = useMemo(
    () => new Map<string, Subject>(state.subjects.map((s) => [s.id, s])),
    [state.subjects],
  );

  const dayContext = useMemo(() => getDayScheduleContext(state, today), [state, today]);
  const todayBlocks = useMemo(() => getTodayStudyBlocks(state, today), [state, today]);
  const progress = useMemo(() => getSubjectProgress(state, today), [state, today]);

  const plannedMinutes = todayBlocks.reduce(
    (sum, b) => sum + getDurationMinutes(b.startTime, b.endTime),
    0,
  );
  const dDayLabel = formatDDayLabel(calculateDDay(state.examStartDate, today));
  const studyWindowsLabel =
    dayContext.studyWindows.length > 0
      ? dayContext.studyWindows.map((w) => `${w.start}–${w.end}`).join(', ')
      : '없음';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
      {/* Header */}
      <div className="border-b border-zinc-200 px-3 py-3 sm:px-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="tabular-nums text-sm font-semibold text-zinc-900">
            오늘 · {formatDateWithWeekday(today)}
          </h2>
          <span className="tabular-nums shrink-0 rounded border border-zinc-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-700">
            {dDayLabel}
          </span>
        </div>
        <p className="tabular-nums mt-1 text-[11px] text-zinc-500">
          공부 가능 {studyWindowsLabel} · 계획 {formatDurationCompact(plannedMinutes)}
        </p>
      </div>

      {/* Today's tasks */}
      <section aria-labelledby="today-tasks-heading" className="border-b border-zinc-200">
        <h3
          id="today-tasks-heading"
          className="px-3 pb-1 pt-3 text-xs font-semibold text-zinc-600 sm:px-4"
        >
          오늘 할 일
        </h3>

        {todayBlocks.length === 0 ? (
          <div className="flex flex-col items-start gap-2 px-3 pb-4 pt-1 text-xs text-zinc-500 sm:px-4">
            <p>오늘 배치된 공부가 없습니다.</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={onGoToTimeline}
                className="touch-target inline-flex cursor-pointer items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-slate-50"
              >
                <CalendarDays size={14} strokeWidth={1.5} aria-hidden="true" />
                시간표에서 추가
              </button>
              <button
                type="button"
                onClick={onOpenAiModal}
                className="touch-target inline-flex cursor-pointer items-center gap-1 rounded-md border border-blue-600 bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
              >
                <Cpu size={14} strokeWidth={1.5} aria-hidden="true" />
                AI로 배치
              </button>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 pb-1">
            {todayBlocks.map((block) => {
              const subj = subjectById.get(block.subjectId);
              return (
                <li key={block.id} className="flex items-center gap-1 px-1.5 sm:px-2.5">
                  <label className="touch-target inline-flex shrink-0 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      checked={block.completed}
                      onChange={() => toggleStudyBlock(block.id)}
                      aria-label={`${block.title} 완료 표시`}
                      className="peer sr-only"
                    />
                    <span
                      className={`inline-flex h-4 w-4 items-center justify-center rounded border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-blue-600 peer-focus-visible:ring-offset-1 ${
                        block.completed
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-zinc-300 bg-white text-transparent hover:border-zinc-400'
                      }`}
                    >
                      <Check size={12} strokeWidth={2} aria-hidden="true" />
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => onOpenEditBlock(block)}
                    className="touch-target flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5 pr-1.5 text-left"
                  >
                    <span
                      className={`min-w-0 flex-1 truncate text-sm ${
                        block.completed ? 'text-zinc-400 line-through' : 'font-medium text-zinc-900'
                      }`}
                    >
                      {block.title}
                    </span>
                    <span
                      className={`tabular-nums shrink-0 text-[11px] ${
                        block.completed ? 'text-zinc-400' : 'text-zinc-500'
                      }`}
                    >
                      {block.startTime}–{block.endTime}
                    </span>
                    {subj && (
                      <span className={block.completed ? 'opacity-50' : ''}>
                        <SubjectBadge name={subj.name} colorKey={subj.colorKey} compact />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Remaining per subject */}
      <section aria-labelledby="today-subjects-heading">
        <h3
          id="today-subjects-heading"
          className="px-3 pb-1 pt-3 text-xs font-semibold text-zinc-600 sm:px-4"
        >
          과목별 남은 양
        </h3>
        {progress.length === 0 ? (
          <p className="px-3 pb-4 pt-1 text-xs text-zinc-500 sm:px-4">남은 시험이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 pb-2">
            {progress.map((p) => {
              const subj = subjectById.get(p.subjectId);
              if (!subj) return null;
              const done = p.remainingCount === 0;
              const ratio =
                p.totalMinutes > 0
                  ? Math.min(1, Math.max(0, (p.totalMinutes - p.remainingMinutes) / p.totalMinutes))
                  : done
                    ? 1
                    : 0;
              return (
                <li key={p.subjectId}>
                  <button
                    type="button"
                    onClick={() => onSelectSubject(p.subjectId)}
                    className="touch-target flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 sm:px-4"
                  >
                    <span className="w-24 shrink-0 truncate text-xs font-medium text-zinc-800 sm:w-28">
                      {subj.name}
                    </span>
                    <span
                      className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-zinc-100 sm:w-16"
                      role="progressbar"
                      aria-label={`${subj.name} 진행률`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(ratio * 100)}
                    >
                      <span
                        className="block h-full rounded-full bg-blue-600"
                        style={{ width: `${Math.round(ratio * 100)}%` }}
                      />
                    </span>
                    <span className="tabular-nums flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-600">
                      {done ? (
                        <span className="text-zinc-400">완료</span>
                      ) : (
                        <span>
                          {p.remainingCount}개 · {formatDurationCompact(p.remainingMinutes)} · 하루{' '}
                          {formatDurationCompact(p.dailyNeedMinutes)}
                        </span>
                      )}
                      {p.overdueMinutes > 0 && (
                        <span className="inline-flex items-center gap-0.5 font-medium text-rose-700">
                          <AlertTriangle size={12} strokeWidth={1.5} aria-hidden="true" />
                          밀림 {formatDurationCompact(p.overdueMinutes)}
                        </span>
                      )}
                    </span>
                    <ChevronRight
                      size={14}
                      strokeWidth={1.5}
                      aria-hidden="true"
                      className="shrink-0 text-zinc-300"
                    />
                    <span className="sr-only"> 체크리스트 보기</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
