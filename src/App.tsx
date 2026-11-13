import React, { useMemo, useRef, useState } from 'react';
import { CalendarDays, CheckSquare } from 'lucide-react';
import { AiPlanModal } from './components/AiPlanModal';
import { ChecklistPane } from './components/ChecklistPane';
import { ScheduleRuleModal } from './components/ScheduleRuleModal';
import { SettingsModal } from './components/SettingsModal';
import { StudyBlockModal } from './components/StudyBlockModal';
import { TimelinePane } from './components/TimelinePane';
import { TopBar } from './components/TopBar';
import { PlannerProvider, usePlanner } from './context/PlannerContext';
import type { ChecklistItem, StudyBlock } from './types/planner';
import { getDayScheduleContext, getOpenStudyGaps } from './utils/availability';
import { formatMinutesToTime, getTodayDateKey, parseTimeToMinutes } from './utils/time';

type MobileTab = 'timeline' | 'checklist';

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

function PlannerShell() {
  const { state } = usePlanner();
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayDateKey());
  const [mobileTab, setMobileTab] = useState<MobileTab>('timeline');

  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const [blockModal, setBlockModal] = useState<BlockModalState>({
    open: false,
    date: getTodayDateKey(),
    editingBlock: null,
  });

  const timelineTabRef = useRef<HTMLButtonElement>(null);
  const checklistTabRef = useRef<HTMLButtonElement>(null);

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

  const handleJumpToDate = (dateKey: string) => {
    setSelectedDate(dateKey);
    setMobileTab('timeline');
  };

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') {
      return;
    }
    e.preventDefault();
    const nextTab: MobileTab =
      e.key === 'Home'
        ? 'timeline'
        : e.key === 'End'
          ? 'checklist'
          : mobileTab === 'timeline'
            ? 'checklist'
            : 'timeline';
    setMobileTab(nextTab);
    if (nextTab === 'timeline') {
      timelineTabRef.current?.focus();
    } else {
      checklistTabRef.current?.focus();
    }
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50 text-zinc-900">
      <TopBar
        onOpenAiModal={() => setAiModalOpen(true)}
        onOpenRulesModal={() => setRulesModalOpen(true)}
        onOpenSettingsModal={() => setSettingsModalOpen(true)}
      />

      {/* Mobile Portrait Tab Bar (< 960px) */}
      <div
        role="tablist"
        aria-label="플래너 화면 전환"
        onKeyDown={handleTabKeyDown}
        className="grid shrink-0 grid-cols-2 border-b border-zinc-200 bg-white min-[960px]:hidden"
      >
        <button
          ref={timelineTabRef}
          id="tab-timeline"
          type="button"
          role="tab"
          aria-selected={mobileTab === 'timeline'}
          aria-controls="panel-timeline"
          tabIndex={mobileTab === 'timeline' ? 0 : -1}
          onClick={() => setMobileTab('timeline')}
          className="tab-item touch-target inline-flex h-11 items-center justify-center gap-1.5 text-xs text-zinc-600 transition-colors hover:text-zinc-900"
        >
          <CalendarDays className="h-4 w-4" strokeWidth={1.5} />
          <span>타임라인</span>
          <span className="tabular-nums text-[11px] text-zinc-400">{dayBlockCount}</span>
        </button>

        <button
          ref={checklistTabRef}
          id="tab-checklist"
          type="button"
          role="tab"
          aria-selected={mobileTab === 'checklist'}
          aria-controls="panel-checklist"
          tabIndex={mobileTab === 'checklist' ? 0 : -1}
          onClick={() => setMobileTab('checklist')}
          className="tab-item touch-target inline-flex h-11 items-center justify-center gap-1.5 text-xs text-zinc-600 transition-colors hover:text-zinc-900"
        >
          <CheckSquare className="h-4 w-4" strokeWidth={1.5} />
          <span>체크리스트</span>
          <span className="tabular-nums text-[11px] text-zinc-400">잔여 {remainingChecklistCount}</span>
        </button>
      </div>

      {/* Main Split Workspace (16:10 Landscape 2-Column Split on >= 960px) */}
      <main className="grid min-h-0 flex-1 grid-cols-1 min-[960px]:grid-cols-[1.2fr_1fr]">
        <section
          id="panel-timeline"
          aria-label="주간 및 일별 학습 타임라인"
          className={`min-h-0 min-w-0 flex-col border-zinc-200 bg-white min-[960px]:flex min-[960px]:border-r ${
            mobileTab === 'timeline' ? 'flex' : 'hidden'
          }`}
        >
          <TimelinePane
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onOpenAddBlock={handleOpenAddBlock}
            onOpenEditBlock={handleOpenEditBlock}
          />
        </section>

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
          />
        </section>
      </main>

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
