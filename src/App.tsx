import React, { useMemo, useRef, useState } from 'react';
import { CalendarDays, CheckSquare, Sun } from 'lucide-react';
import { AiPlanModal } from './components/AiPlanModal';
import { ChecklistPane } from './components/ChecklistPane';
import { ScheduleRuleModal } from './components/ScheduleRuleModal';
import { SettingsModal } from './components/SettingsModal';
import { StudyBlockModal } from './components/StudyBlockModal';
import { TimelinePane } from './components/TimelinePane';
import { TodayPane } from './components/TodayPane';
import { TopBar } from './components/TopBar';
import { PlannerProvider, usePlanner } from './context/PlannerContext';
import type { ChecklistItem, StudyBlock } from './types/planner';
import { getDayScheduleContext, getOpenStudyGaps } from './utils/availability';
import { formatMinutesToTime, getTodayDateKey, parseTimeToMinutes } from './utils/time';

type MobileTab = 'today' | 'timeline' | 'checklist';
type DesktopLeft = 'today' | 'timeline';

const MOBILE_TABS: MobileTab[] = ['today', 'timeline', 'checklist'];

interface BlockModalState {
  open: boolean;
  date: string;
  startTime?: string;
  endTime?: string;
  subjectId?: string;
  checklistItemId?: string;
  title?: string;
  editingBlock: StudyBlock | null;
}

const TAB_BUTTON_CLASS =
  'tab-item tab-item-top touch-target inline-flex h-12 flex-col items-center justify-center gap-0.5 text-[11px] text-zinc-600 transition-colors hover:text-zinc-900';

function segmentClass(active: boolean): string {
  return `touch-target inline-flex cursor-pointer items-center justify-center gap-1 rounded px-2.5 py-1 text-xs transition-colors ${
    active
      ? 'bg-white font-semibold text-blue-600 ring-1 ring-zinc-200'
      : 'text-zinc-600 hover:text-zinc-900'
  }`;
}

function PlannerShell() {
  const { state } = usePlanner();
  const today = getTodayDateKey();
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayDateKey());
  const [mobileTab, setMobileTab] = useState<MobileTab>('today');
  const [desktopLeft, setDesktopLeft] = useState<DesktopLeft>('today');
  const [checklistSubjectId, setChecklistSubjectId] = useState<string>('all');

  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const [blockModal, setBlockModal] = useState<BlockModalState>({
    open: false,
    date: getTodayDateKey(),
    editingBlock: null,
  });

  const tabRefs = useRef<Record<MobileTab, HTMLButtonElement | null>>({
    today: null,
    timeline: null,
    checklist: null,
  });

  const dayBlockCount = useMemo(
    () => state.studyBlocks.filter((b) => b.date === selectedDate).length,
    [state.studyBlocks, selectedDate],
  );

  const remainingChecklistCount = useMemo(
    () => state.checklistItems.filter((item) => !item.completed).length,
    [state.checklistItems],
  );

  const handleOpenAddBlock = (dateKey: string, startTime?: string, endTime?: string) => {
    setBlockModal({
      open: true,
      date: dateKey,
      startTime,
      endTime,
      subjectId: undefined,
      checklistItemId: undefined,
      title: undefined,
      editingBlock: null,
    });
  };

  const handleScheduleChecklistItem = (item: ChecklistItem) => {
    const ctx = getDayScheduleContext(state, selectedDate);
    const gaps = getOpenStudyGaps(ctx, state.studyBlocks);
    const firstGap = gaps[0];
    const startMin = firstGap ? parseTimeToMinutes(firstGap.start) : parseTimeToMinutes('19:00');
    const maxEndMin = firstGap ? parseTimeToMinutes(firstGap.end) : 24 * 60;
    const endMin = Math.min(maxEndMin, Math.max(startMin + 15, startMin + item.estimatedMinutes));

    setBlockModal({
      open: true,
      date: selectedDate,
      startTime: formatMinutesToTime(startMin),
      endTime: formatMinutesToTime(endMin),
      subjectId: item.subjectId,
      checklistItemId: item.id,
      title: item.title,
      editingBlock: null,
    });
  };

  const handleOpenEditBlock = (block: StudyBlock) => {
    setBlockModal({
      open: true,
      date: block.date,
      startTime: block.startTime,
      endTime: block.endTime,
      subjectId: block.subjectId,
      checklistItemId: block.checklistItemId,
      title: block.title,
      editingBlock: block,
    });
  };

  const handleCloseBlockModal = () => {
    setBlockModal((prev) => ({
      ...prev,
      open: false,
      editingBlock: null,
    }));
  };

  // Both the mobile tab and the desktop left-column view are updated: only the one
  // matching the current breakpoint is visible, so no media query is needed here.
  const handleJumpToDate = (dateKey: string) => {
    setSelectedDate(dateKey);
    setMobileTab('timeline');
    setDesktopLeft('timeline');
  };

  const handleGoToTimeline = () => {
    handleJumpToDate(today);
  };

  const handleSelectSubjectFromToday = (subjectId: string) => {
    setChecklistSubjectId(subjectId);
    // On >= 960px the checklist is always visible in the right column; this only
    // changes what the phone layout shows.
    setMobileTab('checklist');
  };

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') {
      return;
    }
    e.preventDefault();
    const count = MOBILE_TABS.length;
    const idx = MOBILE_TABS.indexOf(mobileTab);
    const nextIdx =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? count - 1
          : e.key === 'ArrowRight'
            ? (idx + 1) % count
            : (idx - 1 + count) % count;
    const nextTab = MOBILE_TABS[nextIdx];
    setMobileTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50 text-zinc-900">
      <TopBar
        onOpenAiModal={() => setAiModalOpen(true)}
        onOpenRulesModal={() => setRulesModalOpen(true)}
        onOpenSettingsModal={() => setSettingsModalOpen(true)}
      />

      {/* Main Split Workspace (16:10 Landscape 2-Column Split on >= 960px) */}
      <main className="grid min-h-0 flex-1 grid-cols-1 min-[960px]:grid-cols-[1.2fr_1fr]">
        <div
          className={`min-h-0 min-w-0 flex-col border-zinc-200 bg-white min-[960px]:flex min-[960px]:border-r ${
            mobileTab === 'checklist' ? 'hidden' : 'flex'
          }`}
        >
          {/* Desktop left-column switch (>= 960px) */}
          <div className="hidden shrink-0 items-center border-b border-zinc-200 bg-slate-50 px-3 py-1.5 sm:px-4 min-[960px]:flex">
            <div
              role="group"
              aria-label="왼쪽 화면 전환"
              className="inline-flex items-center gap-0.5 rounded-md bg-zinc-100 p-0.5"
            >
              <button
                type="button"
                aria-pressed={desktopLeft === 'today'}
                onClick={() => setDesktopLeft('today')}
                className={segmentClass(desktopLeft === 'today')}
              >
                <Sun size={14} strokeWidth={1.5} aria-hidden="true" />
                오늘
              </button>
              <button
                type="button"
                aria-pressed={desktopLeft === 'timeline'}
                onClick={() => setDesktopLeft('timeline')}
                className={segmentClass(desktopLeft === 'timeline')}
              >
                <CalendarDays size={14} strokeWidth={1.5} aria-hidden="true" />
                시간표
              </button>
            </div>
          </div>

          <section
            id="panel-today"
            aria-label="오늘 할 일과 과목별 남은 양"
            className={`min-h-0 min-w-0 flex-1 flex-col ${mobileTab === 'today' ? 'flex' : 'hidden'} ${
              desktopLeft === 'today' ? 'min-[960px]:flex' : 'min-[960px]:hidden'
            }`}
          >
            <TodayPane
              today={today}
              onOpenEditBlock={handleOpenEditBlock}
              onSelectSubject={handleSelectSubjectFromToday}
              onGoToTimeline={handleGoToTimeline}
              onOpenAiModal={() => setAiModalOpen(true)}
            />
          </section>

          <section
            id="panel-timeline"
            aria-label="주간 및 일별 학습 시간표"
            className={`min-h-0 min-w-0 flex-1 flex-col ${mobileTab === 'timeline' ? 'flex' : 'hidden'} ${
              desktopLeft === 'timeline' ? 'min-[960px]:flex' : 'min-[960px]:hidden'
            }`}
          >
            <TimelinePane
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onOpenAddBlock={handleOpenAddBlock}
              onOpenEditBlock={handleOpenEditBlock}
            />
          </section>
        </div>

        <section
          id="panel-checklist"
          aria-label="과목별 시험범위 체크리스트"
          className={`min-h-0 min-w-0 flex-col bg-slate-50 min-[960px]:flex ${
            mobileTab === 'checklist' ? 'flex' : 'hidden'
          }`}
        >
          <ChecklistPane
            selectedDate={selectedDate}
            onJumpToDate={handleJumpToDate}
            onScheduleChecklistItem={handleScheduleChecklistItem}
            selectedSubjectId={checklistSubjectId}
            onSelectSubject={setChecklistSubjectId}
          />
        </section>
      </main>

      {/* Mobile Bottom Tab Bar (< 960px) */}
      <div
        role="tablist"
        aria-label="플래너 화면 전환"
        onKeyDown={handleTabKeyDown}
        className="safe-bottom grid shrink-0 grid-cols-3 border-t border-zinc-200 bg-white min-[960px]:hidden"
      >
        <button
          ref={(el) => {
            tabRefs.current.today = el;
          }}
          id="tab-today"
          type="button"
          role="tab"
          aria-selected={mobileTab === 'today'}
          aria-controls="panel-today"
          tabIndex={mobileTab === 'today' ? 0 : -1}
          onClick={() => setMobileTab('today')}
          className={TAB_BUTTON_CLASS}
        >
          <Sun className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          <span>오늘</span>
        </button>

        <button
          ref={(el) => {
            tabRefs.current.timeline = el;
          }}
          id="tab-timeline"
          type="button"
          role="tab"
          aria-selected={mobileTab === 'timeline'}
          aria-controls="panel-timeline"
          tabIndex={mobileTab === 'timeline' ? 0 : -1}
          onClick={() => setMobileTab('timeline')}
          className={TAB_BUTTON_CLASS}
        >
          <CalendarDays className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          <span>
            시간표 <span className="tabular-nums text-zinc-400">{dayBlockCount}</span>
          </span>
        </button>

        <button
          ref={(el) => {
            tabRefs.current.checklist = el;
          }}
          id="tab-checklist"
          type="button"
          role="tab"
          aria-selected={mobileTab === 'checklist'}
          aria-controls="panel-checklist"
          tabIndex={mobileTab === 'checklist' ? 0 : -1}
          onClick={() => setMobileTab('checklist')}
          className={TAB_BUTTON_CLASS}
        >
          <CheckSquare className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          <span>
            체크리스트{' '}
            <span className="tabular-nums text-zinc-400">잔여 {remainingChecklistCount}</span>
          </span>
        </button>
      </div>

      <StudyBlockModal
        open={blockModal.open}
        onClose={handleCloseBlockModal}
        initialDate={blockModal.date}
        initialStartTime={blockModal.startTime}
        initialEndTime={blockModal.endTime}
        initialSubjectId={blockModal.subjectId}
        initialChecklistItemId={blockModal.checklistItemId}
        initialTitle={blockModal.title}
        editingBlock={blockModal.editingBlock}
      />

      <AiPlanModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onOpenSettings={() => setSettingsModalOpen(true)}
      />

      <ScheduleRuleModal
        open={rulesModalOpen}
        onClose={() => setRulesModalOpen(false)}
      />

      <SettingsModal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <PlannerProvider>
      <PlannerShell />
    </PlannerProvider>
  );
}
