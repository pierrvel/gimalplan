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
        <span className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-slate-50 px-2 py-1 text-xs text-zinc-600">
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
          className="touch-target inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-slate-50"
        >
          <LogIn size={13} strokeWidth={1.5} aria-hidden="true" />
          <span>Google 동기화</span>
        </button>
      );
    }

    if (syncStatus === 'syncing') {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-slate-50 px-2 py-1 text-xs text-zinc-600">
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
          className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800"
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
        className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-slate-50 px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-100"
      >
        <Cloud size={13} strokeWidth={1.5} className="text-blue-600" aria-hidden="true" />
        <span className="hidden xl:inline">동기화됨</span>
      </button>
    );
  };

  return (
    <header className="safe-top shrink-0 border-b border-zinc-200 bg-white">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4">
        {/* Left: Brand + D-Day + Progress */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <Calendar size={16} strokeWidth={1.5} className="text-zinc-900" aria-hidden="true" />
            <h1 className="text-sm font-semibold tracking-tight text-zinc-900">기말 플래너</h1>
          </div>

          <div className="flex items-center gap-2 border-l border-zinc-200 pl-3">
            <span className="tabular-nums rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
              {dDayLabel}
            </span>
            <span className="tabular-nums hidden text-xs text-zinc-500 sm:inline">
              {formatShortDate(state.examStartDate)}–{formatShortDate(state.examEndDate)}
            </span>
          </div>

          <div
            className="flex items-center gap-2 border-l border-zinc-200 pl-3"
            aria-label={`전체 학습 진도율 ${progressPct}%`}
          >
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-200 sm:w-28 md:w-36">
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
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex">{renderSyncIndicator()}</div>

          <button
            type="button"
            onClick={onOpenAiModal}
            className="touch-target inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Cpu size={14} strokeWidth={1.5} aria-hidden="true" />
            <span>AI 플랜</span>
          </button>

          <button
            type="button"
            onClick={onOpenRulesModal}
            aria-label="시간표 및 과목 관리"
            className="touch-target inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-slate-50"
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
    </header>
  );
};
