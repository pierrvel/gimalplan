import React, { useMemo, useState } from 'react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { usePlanner } from '../context/PlannerContext';
import type { ChecklistItem, StudyBlock } from '../types/planner';
import { formatShortDate } from '../utils/time';
import { SubjectBadge } from './SubjectBadge';

interface ChecklistPaneProps {
  onJumpToDate: (dateKey: string) => void;
}

export const ChecklistPane: React.FC<ChecklistPaneProps> = ({ onJumpToDate }) => {
  const {
    state,
    toggleChecklistItem,
    addChecklistItem,
    updateChecklistItem,
    deleteChecklistItem,
  } = usePlanner();

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [draftTitles, setDraftTitles] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingMinutes, setEditingMinutes] = useState(60);

  const sortedSubjects = useMemo(
    () => [...state.subjects].sort((a, b) => a.order - b.order),
    [state.subjects],
  );

  const blocksByChecklistId = useMemo(() => {
    const map = new Map<string, StudyBlock[]>();
    for (const blk of state.studyBlocks) {
      if (!blk.checklistItemId) continue;
      const list = map.get(blk.checklistItemId) ?? [];
      list.push(blk);
      map.set(blk.checklistItemId, list);
    }
    return map;
  }, [state.studyBlocks]);

  const visibleSubjects = useMemo(
    () =>
      selectedSubjectId === 'all'
        ? sortedSubjects
        : sortedSubjects.filter((s) => s.id === selectedSubjectId),
    [sortedSubjects, selectedSubjectId],
  );

  const remainingTotal = useMemo(
    () => state.checklistItems.filter((c) => !c.completed).length,
    [state.checklistItems],
  );

  const handleAddSubmit = (e: React.FormEvent, subjectId: string) => {
    e.preventDefault();
    const text = (draftTitles[subjectId] ?? '').trim();
    if (!text) return;
    addChecklistItem(subjectId, text, 60);
    setDraftTitles((prev) => ({ ...prev, [subjectId]: '' }));
  };

  const startEditItem = (item: ChecklistItem) => {
    setEditingId(item.id);
    setEditingTitle(item.title);
    setEditingMinutes(item.estimatedMinutes);
  };

  const commitEditItem = (itemId: string) => {
    const clean = editingTitle.trim();
    if (clean) {
      updateChecklistItem(itemId, {
        title: clean,
        estimatedMinutes: Math.max(15, Number(editingMinutes) || 60),
      });
    }
    setEditingId(null);
  };

  return (
    <section aria-label="과목별 시험범위 체크리스트" className="flex h-full min-h-0 flex-col bg-white">
      {/* Filter Header */}
      <div className="border-b border-zinc-200 bg-slate-50 px-3 py-2 sm:px-4">
        <div className="flex items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="과목 필터"
            className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedSubjectId === 'all'}
              onClick={() => setSelectedSubjectId('all')}
              className={`touch-target shrink-0 cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-colors ${
                selectedSubjectId === 'all'
                  ? 'border-blue-600 bg-blue-600 font-medium text-white'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100'
              }`}
            >
              전체
            </button>
            {sortedSubjects.map((subj) => {
              const active = selectedSubjectId === subj.id;
              return (
                <button
                  key={subj.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedSubjectId(subj.id)}
                  className={`touch-target shrink-0 cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    active
                      ? 'border-blue-600 bg-blue-600 font-medium text-white'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  {subj.name}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            aria-pressed={incompleteOnly}
            onClick={() => setIncompleteOnly((v) => !v)}
            className={`tabular-nums touch-target shrink-0 cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
              incompleteOnly
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            미완료 ({remainingTotal})
          </button>
        </div>
      </div>

      {/* Subject Checklist Sections */}
      <div className="scroll-pane flex-1 divide-y divide-zinc-200">
        {visibleSubjects.map((subj) => {
          const allItems = state.checklistItems.filter((c) => c.subjectId === subj.id);
          const doneCount = allItems.filter((c) => c.completed).length;
          const pct = allItems.length > 0 ? Math.round((doneCount / allItems.length) * 100) : 0;
          const shownItems = incompleteOnly ? allItems.filter((c) => !c.completed) : allItems;

          return (
            <div key={subj.id} className="bg-white">
              {/* Subject Section Header */}
              <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-zinc-200 bg-slate-50/95 px-3 py-2 backdrop-blur-none sm:px-4">
                <div className="flex min-w-0 items-center gap-2">
                  <SubjectBadge name={subj.name} colorKey={subj.colorKey} />
                  <span className="tabular-nums truncate text-xs text-zinc-500">
                    {formatShortDate(subj.examDate)} {subj.examPeriod} ({subj.examStart}–{subj.examEnd})
                  </span>
                </div>

                <div className="tabular-nums flex shrink-0 items-center gap-2 text-xs">
                  <div className="hidden h-1 w-14 overflow-hidden rounded-full bg-zinc-200 sm:block">
                    <div className="h-full bg-blue-600" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="font-medium text-zinc-700">
                    {doneCount}/{allItems.length}
                  </span>
                  <span className="text-zinc-500">{pct}%</span>
                </div>
              </div>

              {/* Checklist Rows */}
              <div className="divide-y divide-zinc-100">
                {shownItems.length === 0 ? (
                  <div className="px-3 py-2.5 text-xs text-zinc-400 sm:px-4">
                    {incompleteOnly ? '모든 시험범위 항목을 완료했습니다.' : '등록된 범위 항목이 없습니다.'}
                  </div>
                ) : (
                  shownItems.map((item) => {
                    const linkedBlocks = blocksByChecklistId.get(item.id) ?? [];
                    const isEditing = editingId === item.id;

                    if (isEditing) {
                      return (
                        <form
                          key={item.id}
                          onSubmit={(e) => {
                            e.preventDefault();
                            commitEditItem(item.id);
                          }}
                          className="flex flex-wrap items-center gap-2 bg-slate-50 px-3 py-2 sm:px-4"
                        >
                          <input
                            type="text"
                            autoFocus
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            aria-label="항목 제목 수정"
                            className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900"
                          />
                          <input
                            type="number"
                            min={15}
                            max={360}
                            step={15}
                            value={editingMinutes}
                            onChange={(e) => setEditingMinutes(Number(e.target.value))}
                            aria-label="예상 소요 분"
                            className="tabular-nums w-16 rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900"
                          />
                          <span className="text-xs text-zinc-500">분</span>
                          <button
                            type="submit"
                            className="touch-target cursor-pointer rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                          >
                            저장
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="touch-target cursor-pointer rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600"
                          >
                            취소
                          </button>
                        </form>
                      );
                    }

                    return (
                      <div
                        key={item.id}
                        className="group flex items-center justify-between gap-2 px-3 py-1.5 transition-colors hover:bg-slate-50/70 sm:px-4"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <label className="touch-checkbox shrink-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={item.completed}
                              onChange={() => toggleChecklistItem(item.id)}
                              aria-label={`${item.title} 완료`}
                              className="sr-only"
                            />
                            <span
                              className={`inline-flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                                item.completed
                                  ? 'border-blue-600 bg-blue-600 text-white'
                                  : 'border-zinc-300 bg-white text-transparent hover:border-zinc-400'
                              }`}
                            >
                              <Check size={12} strokeWidth={2} aria-hidden="true" />
                            </span>
                          </label>

                          <span
                            className={`min-w-0 flex-1 text-xs ${
                              item.completed ? 'text-zinc-400 line-through' : 'text-zinc-800'
                            }`}
                          >
                            {item.title}
                          </span>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {linkedBlocks.slice(0, 2).map((blk) => (
                            <button
                              key={blk.id}
                              type="button"
                              onClick={() => onJumpToDate(blk.date)}
                              title="타임라인에서 보기"
                              className="tabular-nums hidden cursor-pointer rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100 sm:inline"
                            >
                              {formatShortDate(blk.date)} {blk.startTime}
                            </button>
                          ))}

                          <span className="tabular-nums text-[11px] text-zinc-400">
                            {item.estimatedMinutes}분
                          </span>

                          <button
                            type="button"
                            onClick={() => startEditItem(item)}
                            aria-label={`${item.title} 수정`}
                            className="touch-target inline-flex cursor-pointer items-center justify-center rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800"
                          >
                            <Pencil size={12} strokeWidth={1.5} aria-hidden="true" />
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteChecklistItem(item.id)}
                            aria-label={`${item.title} 삭제`}
                            className="touch-target inline-flex cursor-pointer items-center justify-center rounded p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-700"
                          >
                            <Trash2 size={12} strokeWidth={1.5} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Inline Add Item Row */}
              <form
                onSubmit={(e) => handleAddSubmit(e, subj.id)}
                className="flex items-center gap-2 border-t border-zinc-100 bg-white px-3 py-1.5 sm:px-4"
              >
                <Plus size={13} strokeWidth={1.5} className="shrink-0 text-zinc-400" aria-hidden="true" />
                <input
                  type="text"
                  value={draftTitles[subj.id] ?? ''}
                  onChange={(e) =>
                    setDraftTitles((prev) => ({ ...prev, [subj.id]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.nativeEvent.isComposing) {
                      e.preventDefault();
                    }
                  }}
                  placeholder={`${subj.name} 범위 추가`}
                  aria-label={`${subj.name} 시험범위 항목 추가`}
                  className="min-w-0 flex-1 border-0 bg-transparent py-1 text-xs text-zinc-800 placeholder:text-zinc-400 focus:outline-none"
                />
                {(draftTitles[subj.id] ?? '').trim().length > 0 && (
                  <button
                    type="submit"
                    className="touch-target cursor-pointer rounded border border-zinc-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    추가
                  </button>
                )}
              </form>
            </div>
          );
        })}
      </div>
    </section>
  );
};
