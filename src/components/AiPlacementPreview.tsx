import React, { useMemo } from 'react';
import type { AiScheduleResult } from '../services/aiScheduler';
import { diffPlacements, type ItemPlacementChange, type PlacementSlot } from '../services/aiDiff';
import type { ChecklistItem, Subject } from '../types/planner';
import { formatDurationCompact, formatShortDate } from '../utils/time';
import { SubjectBadge } from './SubjectBadge';

interface AiPlacementPreviewProps {
  preview: AiScheduleResult;
  checklistItems: ChecklistItem[];
  subjects: Subject[];
}

function formatSlot(slot: PlacementSlot): string {
  return `${formatShortDate(slot.date)} ${slot.startTime}–${slot.endTime}`;
}

function formatSlots(slots: PlacementSlot[]): string {
  return slots.map(formatSlot).join(', ');
}

export const AiPlacementPreview: React.FC<AiPlacementPreviewProps> = ({
  preview,
  checklistItems,
  subjects,
}) => {
  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const itemById = useMemo(() => new Map(checklistItems.map((c) => [c.id, c])), [checklistItems]);
  const diff = useMemo(
    () => diffPlacements(preview.replacedBlocks, preview.placedBlocks, checklistItems),
    [preview.replacedBlocks, preview.placedBlocks, checklistItems],
  );

  const unplacedMinutes = Math.max(0, preview.budgetMinutes - preview.placedMinutes);
  const unplacedEntries = Object.entries(preview.unplacedByItem).filter(([, m]) => m > 0);

  const renderRow = (change: ItemPlacementChange, kind: 'added' | 'moved' | 'removed' | 'unchanged') => {
    const subj = subjectById.get(change.subjectId);
    return (
      <li key={change.itemId} className="space-y-0.5 px-3 py-1.5 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          {subj && <SubjectBadge name={subj.name} colorKey={subj.colorKey} compact />}
          <span className="truncate font-medium text-zinc-800">{change.title}</span>
        </div>
        <div className="tabular-nums text-zinc-600">
          {kind === 'added' && formatSlots(change.after)}
          {kind === 'removed' && formatSlots(change.before)}
          {kind === 'unchanged' && formatSlots(change.after)}
          {kind === 'moved' && (
            <>
              <span className="text-zinc-500">{formatSlots(change.before)}</span>
              <span className="mx-1.5 text-zinc-400">→</span>
              <span>{formatSlots(change.after)}</span>
            </>
          )}
        </div>
      </li>
    );
  };

  const renderSection = (
    label: string,
    changes: ItemPlacementChange[],
    kind: 'added' | 'moved' | 'removed',
    toneClass: string,
  ) => {
    if (changes.length === 0) return null;
    return (
      <section>
        <h4 className={`px-3 py-1.5 text-xs font-semibold ${toneClass}`}>
          {label} ({changes.length})
        </h4>
        <ul className="divide-y divide-zinc-100">{changes.map((c) => renderRow(c, kind))}</ul>
      </section>
    );
  };

  return (
    <div className="rounded-md border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 bg-slate-50 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-zinc-900">생성 결과 미리보기</span>
          <span className="tabular-nums text-zinc-600">
            배치 {formatDurationCompact(preview.placedMinutes)} / 남은 계획{' '}
            {formatDurationCompact(preview.budgetMinutes)}
            {unplacedMinutes > 0 ? ` · 미배치 ${formatDurationCompact(unplacedMinutes)}` : ''}
          </span>
        </div>
        {(preview.stats.trimmedForBudget > 0 ||
          preview.stats.trimmedForPrepCap > 0 ||
          preview.stats.skippedInvalid > 0) && (
          <p className="tabular-nums mt-1 text-[11px] text-zinc-500">
            {[
              preview.stats.trimmedForBudget > 0
                ? `남은 시간 초과 보정 ${preview.stats.trimmedForBudget}건`
                : '',
              preview.stats.trimmedForPrepCap > 0
                ? `3시간 상한 보정 ${preview.stats.trimmedForPrepCap}건`
                : '',
              preview.stats.skippedInvalid > 0
                ? `제외 ${preview.stats.skippedInvalid}건`
                : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        {preview.rationale && <p className="mt-1 text-[11px] text-zinc-500">{preview.rationale}</p>}
      </div>

      <div className="max-h-72 divide-y divide-zinc-200 overflow-y-auto">
        {diff.added.length === 0 &&
          diff.moved.length === 0 &&
          diff.removed.length === 0 &&
          diff.unlinkedRemoved.length === 0 && (
            <p className="px-3 py-2 text-xs text-zinc-500">변경 없음</p>
          )}
        {renderSection('추가', diff.added, 'added', 'text-emerald-700')}
        {renderSection('이동', diff.moved, 'moved', 'text-blue-700')}
        {renderSection('빠짐', diff.removed, 'removed', 'text-rose-700')}

        {diff.unlinkedRemoved.length > 0 && (
          <section>
            <h4 className="px-3 py-1.5 text-xs font-semibold text-zinc-700">
              항목 없는 블록 ({diff.unlinkedRemoved.length})
            </h4>
            <ul className="divide-y divide-zinc-100">
              {diff.unlinkedRemoved.map((blk) => (
                <li key={blk.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                  <span className="tabular-nums shrink-0 text-zinc-500">
                    {formatSlot(blk)}
                  </span>
                  <span className="truncate text-zinc-800">{blk.title}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {diff.unchanged.length > 0 && (
          <details>
            <summary className="cursor-pointer px-3 py-1.5 text-xs font-semibold text-zinc-600">
              그대로 ({diff.unchanged.length})
            </summary>
            <ul className="divide-y divide-zinc-100">
              {diff.unchanged.map((c) => renderRow(c, 'unchanged'))}
            </ul>
          </details>
        )}

        {unplacedEntries.length > 0 && (
          <section>
            <h4 className="px-3 py-1.5 text-xs font-semibold text-amber-700">
              미배치 ({unplacedEntries.length})
            </h4>
            <ul className="divide-y divide-zinc-100">
              {unplacedEntries.map(([itemId, minutes]) => {
                const item = itemById.get(itemId);
                const subj = item ? subjectById.get(item.subjectId) : undefined;
                return (
                  <li
                    key={itemId}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {subj && <SubjectBadge name={subj.name} colorKey={subj.colorKey} compact />}
                      <span className="truncate text-zinc-800">{item?.title ?? itemId}</span>
                    </div>
                    <span className="tabular-nums shrink-0 text-zinc-600">
                      {formatDurationCompact(minutes)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
};
