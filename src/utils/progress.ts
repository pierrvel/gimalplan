import type { ChecklistItem, PlannerState, StudyBlock } from '../types/planner';
import { calculateDDay, getDurationMinutes } from './time';

export interface SubjectProgress {
  subjectId: string;
  remainingCount: number;
  remainingMinutes: number;
  totalMinutes: number;
  daysLeft: number;
  dailyNeedMinutes: number;
  overdueMinutes: number;
}

function blockMinutes(block: StudyBlock): number {
  return getDurationMinutes(block.startTime, block.endTime);
}

export function getItemRemainingMinutes(item: ChecklistItem, blocks: StudyBlock[]): number {
  if (item.completed) return 0;
  return Math.max(0, item.estimatedMinutes - completedLinkedMinutes(item.id, blocks));
}

function completedLinkedMinutes(itemId: string, blocks: StudyBlock[]): number {
  return blocks
    .filter((b) => b.checklistItemId === itemId && b.completed)
    .reduce((sum, b) => sum + blockMinutes(b), 0);
}

export function getSubjectProgress(state: PlannerState, today: string): SubjectProgress[] {
  return state.subjects
    .filter((s) => s.examDate >= today)
    .sort((a, b) => a.examDate.localeCompare(b.examDate) || a.order - b.order)
    .map((subject) => {
      const items = state.checklistItems.filter((i) => i.subjectId === subject.id);
      const open = items.filter((i) => !i.completed);
      const remainingMinutes = open.reduce(
        (sum, i) => sum + getItemRemainingMinutes(i, state.studyBlocks),
        0,
      );
      const daysLeft = Math.max(1, calculateDDay(subject.examDate, today));
      const completedItemIds = new Set(items.filter((i) => i.completed).map((i) => i.id));
      const overdueMinutes = state.studyBlocks
        .filter(
          (b) =>
            b.subjectId === subject.id &&
            b.date < today &&
            !b.completed &&
            !(b.checklistItemId && completedItemIds.has(b.checklistItemId)) &&
            (b.type === 'study' || b.type === 'final_prep'),
        )
        .reduce((sum, b) => sum + blockMinutes(b), 0);
      return {
        subjectId: subject.id,
        remainingCount: open.length,
        remainingMinutes,
        totalMinutes: items.reduce((sum, i) => sum + i.estimatedMinutes, 0),
        daysLeft,
        dailyNeedMinutes: Math.ceil(remainingMinutes / daysLeft),
        overdueMinutes,
      };
    });
}

export function getTodayStudyBlocks(state: PlannerState, today: string): StudyBlock[] {
  return state.studyBlocks
    .filter((b) => b.date === today && (b.type === 'study' || b.type === 'final_prep'))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export function applyStudyBlockToggle(
  state: PlannerState,
  blockId: string,
  now: number,
): PlannerState {
  const target = state.studyBlocks.find((b) => b.id === blockId);
  if (!target) return state;
  const nextCompleted = !target.completed;
  const studyBlocks = state.studyBlocks.map((b) =>
    b.id === blockId ? { ...b, completed: nextCompleted, updatedAt: now } : b,
  );

  let checklistItems = state.checklistItems;
  const linkedId = target.checklistItemId;
  if (linkedId) {
    // Complete when every linked block is done, or when completed linked minutes reach the estimate.
    const allDone = studyBlocks
      .filter((b) => b.checklistItemId === linkedId)
      .every((b) => b.completed);
    const doneMinutes = completedLinkedMinutes(linkedId, studyBlocks);
    checklistItems = state.checklistItems.map((c) =>
      c.id === linkedId
        ? { ...c, completed: allDone || doneMinutes >= c.estimatedMinutes, updatedAt: now }
        : c,
    );
  }
  return { ...state, studyBlocks, checklistItems };
}
