import React from 'react';
import {
  AlertCircle,
  Calendar,
  Cloud,
  CloudOff,
  Cpu,
  LogIn,
  RefreshCw,
  Settings,
  SlidersHorizontal,
} from 'lucide-react';
import { usePlanner } from '../context/PlannerContext';
import { calculateDDay, formatDDayLabel, formatShortDate, getTodayDateKey } from '../utils/time';

interface TopBarProps {
  onOpenAiModal: () => void;
  onOpenRulesModal: () => void;
  onOpenSettingsModal: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenAiModal,
  onOpenRulesModal,
  onOpenSettingsModal,
}) => {
  const { state, user, syncStatus, firebaseEnabled, loginWithGoogle } = usePlanner();

  const today = getTodayDateKey();
  const dDay = calculateDDay(state.examStartDate, today);
  const dDayLabel = formatDDayLabel(dDay);

  const totalCount = state.checklistItems.length;
  const completedCount = state.checklistItems.filter((c) => c.completed).length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const renderSyncIndicator = () => {
    if (!firebaseEnabled) {
      return (
        <span className="inline-flex h-8 items-center gap-1 rounded border border-zinc-200 bg-slate-50 px-2 py-1 text-xs text-zinc-600">
          <CloudOff size={13} strokeWidth={1.5} aria-hidden="true" />
          <span className="hidden xl:inline">로컬 저장</span>
        </span>
      );
    }

    if (!user) {
      return (
        <button
          type="button"
          onClick={() => {
            void loginWithGoogle().catch(() => {
              onOpenSettingsModal();
            });
          }}
          aria-label="Google 동기화 로그인"
          className="touch-target inline-flex cursor-pointer items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-slate-50 sm:px-2.5"
        >
          <LogIn size={13} strokeWidth={1.5} aria-hidden="true" />
          <span className="hidden min-[380px]:inline sm:hidden">동기화</span>
          <span className="hidden sm:inline">Google 동기화</span>
        </button>
      );
    }

    if (syncStatus === 'syncing') {
      return (
        <span className="inline-flex h-8 items-center gap-1 rounded border border-zinc-200 bg-slate-50 px-2 py-1 text-xs text-zinc-600">
          <RefreshCw size={13} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
          <span className="hidden xl:inline">동기화 중</span>
        </span>
      );
    }

    if (syncStatus === 'error' || syncStatus === 'offline') {
      return (
        <button
          type="button"
          onClick={onOpenSettingsModal}
          aria-label="동기화 오류 또는 오프라인 상태 확인"
          className="touch-target inline-flex cursor-pointer items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800"
        >
          <AlertCircle size={13} strokeWidth={1.5} aria-hidden="true" />
          <span className="hidden xl:inline">오프라인</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={onOpenSettingsModal}
        title={user.email ?? '동기화됨'}
        aria-label="동기화됨 설정 열기"
        className="touch-target inline-flex cursor-pointer items-center gap-1 rounded border border-zinc-200 bg-slate-50 px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-100"
      >
        <Cloud size={13} strokeWidth={1.5} className="text-blue-600" aria-hidden="true" />
        <span className="hidden xl:inline">동기화됨</span>
      </button>
    );
  };

  return (
    <header className="safe-top shrink-0 border-b border-zinc-200 bg-white">
      <div className="flex items-center justify-between gap-1.5 px-3 py-2 sm:gap-2 sm:px-4">
        {/* Left: Brand + D-Day + Desktop Progress */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <Calendar size={16} strokeWidth={1.5} className="shrink-0 text-zinc-900" aria-hidden="true" />
            <h1 className="truncate text-sm font-semibold tracking-tight text-zinc-900">기말 플래너</h1>
          </div>

          <div className="flex shrink-0 items-center gap-2 border-l border-zinc-200 pl-2 sm:pl-3">
            <span className="tabular-nums rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-blue-700 sm:px-2">
              {dDayLabel}
            </span>
            <span className="tabular-nums hidden text-xs text-zinc-500 lg:inline">
              {formatShortDate(state.examStartDate)}–{formatShortDate(state.examEndDate)}
            </span>
          </div>

          <div
            className="hidden items-center gap-2 border-l border-zinc-200 pl-3 md:flex"
            aria-label={`전체 학습 진도율 ${progressPct}%`}
          >
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-zinc-200 lg:w-36">
              <div
                className="h-full bg-blue-600 transition-[width] duration-200"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="tabular-nums text-xs font-medium text-zinc-800">
              {completedCount}/{totalCount}
            </span>
            <span className="tabular-nums text-xs text-zinc-500">({progressPct}%)</span>
          </div>
        </div>

        {/* Right: Sync + Primary AI Action + Rules + Settings */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {renderSyncIndicator()}

          <button
            type="button"
            onClick={onOpenAiModal}
            className="touch-target inline-flex cursor-pointer items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 sm:gap-1.5 sm:px-3"
          >
            <Cpu size={14} strokeWidth={1.5} aria-hidden="true" />
            <span>AI 플랜</span>
          </button>

          <button
            type="button"
            onClick={onOpenRulesModal}
            aria-label="시간표 및 과목 관리"
            className="touch-target inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-slate-50 sm:px-2.5"
          >
            <SlidersHorizontal size={14} strokeWidth={1.5} aria-hidden="true" />
            <span className="hidden md:inline">시간표·과목</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettingsModal}
            aria-label="설정 및 계정"
            className="touch-target inline-flex cursor-pointer items-center justify-center rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-zinc-700 transition-colors hover:bg-slate-50"
          >
            <Settings size={15} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Mobile-only slim progress & exam date bar */}
      <div
        className="flex items-center justify-between gap-2 border-t border-zinc-100 bg-slate-50/70 px-3 py-1 text-[11px] md:hidden"
        aria-label={`모바일 학습 진도율 ${progressPct}%`}
      >
        <span className="tabular-nums text-zinc-500">
          시험 {formatShortDate(state.examStartDate)}–{formatShortDate(state.examEndDate)}
        </span>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full bg-blue-600 transition-[width] duration-200"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="tabular-nums font-medium text-zinc-700">
            {completedCount}/{totalCount} ({progressPct}%)
          </span>
        </div>
      </div>
    </header>
  );
};
