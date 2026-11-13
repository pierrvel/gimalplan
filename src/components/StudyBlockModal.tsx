import React, { useEffect, useState } from 'react';
import { usePlanner } from '../context/PlannerContext';
import type { StudyBlock } from '../types/planner';
import { getDayScheduleContext, getOtherSubjectMinutesOnDate } from '../utils/availability';
import {
  formatDurationCompact,
  formatMinutesToTime,
  getDurationMinutes,
  parseTimeToMinutes,
} from '../utils/time';
import { NativeDialog } from './NativeDialog';

interface StudyBlockModalProps {
  open: boolean;
  onClose: () => void;
  initialDate: string;
  initialStartTime?: string;
  initialEndTime?: string;
  initialSubjectId?: string;
  initialChecklistItemId?: string;
  initialTitle?: string;
  editingBlock?: StudyBlock | null;
}

export const StudyBlockModal: React.FC<StudyBlockModalProps> = ({
  open,
  onClose,
  initialDate,
  initialStartTime = '19:00',
  initialEndTime = '20:30',
  initialSubjectId,
  initialChecklistItemId,
  initialTitle,
  editingBlock = null,
}) => {
  const { state, addStudyBlock, updateStudyBlock } = usePlanner();

  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [subjectId, setSubjectId] = useState(state.subjects[0]?.id ?? '');
  const [checklistItemId, setChecklistItemId] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editingBlock) {
      setDate(editingBlock.date);
      setStartTime(editingBlock.startTime);
      setEndTime(editingBlock.endTime);
      setSubjectId(editingBlock.subjectId);
      setChecklistItemId(editingBlock.checklistItemId ?? '');
      setTitle(editingBlock.title);
    } else {
      setDate(initialDate);
      setStartTime(initialStartTime);
      setEndTime(initialEndTime);
      setSubjectId(initialSubjectId ?? state.subjects[0]?.id ?? '');
      setChecklistItemId(initialChecklistItemId ?? '');
      setTitle(initialTitle ?? '');
    }
  }, [
    open,
    editingBlock,
    initialDate,
    initialStartTime,
    initialEndTime,
    initialSubjectId,
    initialChecklistItemId,
    initialTitle,
    state.subjects,
  ]);

  const subjectItems = state.checklistItems.filter((c) => c.subjectId === subjectId);
  const ctx = getDayScheduleContext(state, date);
  const existingBlocksWithoutSelf = state.studyBlocks.filter((b) => b.id !== editingBlock?.id);
  const otherUsedMinutes = ctx.finalPrepSubjectId
    ? getOtherSubjectMinutesOnDate(existingBlocksWithoutSelf, date, ctx.finalPrepSubjectId)
    : 0;

  const handleSelectChecklist = (itemId: string) => {
    setChecklistItemId(itemId);
    if (itemId) {
      const found = subjectItems.find((i) => i.id === itemId);
      if (found) {
        setTitle(found.title);
        const startMin = parseTimeToMinutes(startTime);
        if (Number.isFinite(startMin)) {
          const targetEnd = Math.min(24 * 60, Math.max(startMin + 15, startMin + found.estimatedMinutes));
          setEndTime(formatMinutesToTime(targetEnd));
        }
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!subjectId) {
      setError('과목을 선택해 주세요.');
      return;
    }

    const startMin = parseTimeToMinutes(startTime);
    const endMin = parseTimeToMinutes(endTime);
    if (endMin <= startMin) {
      setError('종료 시각은 시작 시각보다 늦어야 합니다.');
      return;
    }

    const duration = endMin - startMin;
    if (
      ctx.finalPrepSubjectId &&
      ctx.maxOtherSubjectMinutes !== undefined &&
      subjectId !== ctx.finalPrepSubjectId &&
      otherUsedMinutes + duration > ctx.maxOtherSubjectMinutes
    ) {
      const remaining = Math.max(0, ctx.maxOtherSubjectMinutes - otherUsedMinutes);
      setError(
        `직전보강일 타 과목 3시간(180분) 상한을 초과합니다. 현재 잔여 허용 시간: ${remaining}분`,
      );
      return;
    }

    const subjectName = state.subjects.find((s) => s.id === subjectId)?.name ?? '학습';
    const finalTitle = title.trim() || `${subjectName} 학습`;

    if (editingBlock) {
      updateStudyBlock(editingBlock.id, {
        date,
        startTime,
        endTime,
        subjectId,
        checklistItemId: checklistItemId || undefined,
        title: finalTitle,
      });
    } else {
      addStudyBlock({
        date,
        startTime,
        endTime,
        subjectId,
        checklistItemId: checklistItemId || undefined,
        title: finalTitle,
        type: 'study',
        completed: false,
        source: 'manual',
      });
    }
    onClose();
  };

  const duration = getDurationMinutes(startTime, endTime);

  return (
    <NativeDialog
      open={open}
      onClose={onClose}
      title={editingBlock ? '학습 블록 수정' : '학습 블록 추가'}
      maxWidthClass="w-full max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-md border border-zinc-200 bg-slate-50 px-3 py-2 text-xs text-zinc-700">
          <div className="font-medium text-zinc-900">{ctx.summaryLabel}</div>
          <div className="tabular-nums mt-1 text-zinc-600">
            가용 시간:{' '}
            {ctx.studyWindows.length > 0
              ? ctx.studyWindows.map((w) => `${w.start}–${w.end}`).join(', ')
              : '지정된 가용 시간 없음'}
          </div>
          {ctx.finalPrepSubjectId && ctx.maxOtherSubjectMinutes !== undefined && (
            <div className="tabular-nums mt-1 text-zinc-600">
              직전보강 타 과목 배정: {otherUsedMinutes}분 / {ctx.maxOtherSubjectMinutes}분
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="block-date" className="mb-1 block text-xs font-medium text-zinc-700">
              날짜
            </label>
            <input
              id="block-date"
              name="date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="tabular-nums w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900"
            />
          </div>

          <div>
            <label htmlFor="block-start" className="mb-1 block text-xs font-medium text-zinc-700">
              시작 (HH:MM)
            </label>
            <input
              id="block-start"
              name="startTime"
              type="text"
              required
              pattern="^([01]\d|2[0-3]):[0-5]\d$"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              placeholder="19:00"
              className="tabular-nums w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900"
            />
          </div>

          <div>
            <label htmlFor="block-end" className="mb-1 block text-xs font-medium text-zinc-700">
              종료 (24:00 가능)
            </label>
            <input
              id="block-end"
              name="endTime"
              type="text"
              required
              pattern="^(([01]\d|2[0-3]):[0-5]\d|24:00)$"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              placeholder="20:30"
              className="tabular-nums w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900"
            />
          </div>
        </div>

        <div className="tabular-nums text-xs text-zinc-500">
          예정 소요: {duration > 0 ? formatDurationCompact(duration) : '시간 범위 확인 필요'}
        </div>

        <div>
          <label htmlFor="block-subject" className="mb-1 block text-xs font-medium text-zinc-700">
            과목
          </label>
          <select
            id="block-subject"
            name="subjectId"
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setChecklistItemId('');
            }}
            className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-sm text-zinc-900"
          >
            {state.subjects.map((subj) => (
              <option key={subj.id} value={subj.id}>
                {subj.name} ({subj.examDate.slice(5)} {subj.examPeriod})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="block-checklist" className="mb-1 block text-xs font-medium text-zinc-700">
            연결할 시험범위 항목 (체크 연동)
          </label>
          <select
            id="block-checklist"
            name="checklistItemId"
            value={checklistItemId}
            onChange={(e) => handleSelectChecklist(e.target.value)}
            className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-sm text-zinc-900"
          >
            <option value="">새 체크리스트 항목으로 자동 연동</option>
            {subjectItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.completed ? '[완료] ' : ''}
                {item.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="block-title" className="mb-1 block text-xs font-medium text-zinc-700">
            학습 내용
          </label>
          <input
            id="block-title"
            name="title"
            type="text"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 수특 프린트 10회 복습"
            className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-sm text-zinc-900"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-zinc-200 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="touch-target cursor-pointer rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-slate-50"
          >
            취소
          </button>
          <button
            type="submit"
            className="touch-target cursor-pointer rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            {editingBlock ? '저장' : '추가'}
          </button>
        </div>
      </form>
    </NativeDialog>
  );
};
