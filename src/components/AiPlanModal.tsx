import React, { useMemo, useState } from 'react';
import { AlertCircle, Check, Cpu, RefreshCw } from 'lucide-react';
import { usePlanner } from '../context/PlannerContext';
import { generateAiStudySchedule, type AiScheduleResult } from '../services/aiScheduler';
import { formatShortDate, getTodayDateKey } from '../utils/time';
import { NativeDialog } from './NativeDialog';
import { SubjectBadge } from './SubjectBadge';

interface AiPlanModalProps {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}

export const AiPlanModal: React.FC<AiPlanModalProps> = ({ open, onClose, onOpenSettings }) => {
  const { state, geminiApiKey, geminiModel, replaceStudyBlocksFromAi } = usePlanner();

  const today = getTodayDateKey();
  const defaultStart = today <= state.examEndDate ? today : state.examStartDate;

  const [startDate, setStartDate] = useState(defaultStart);
  const [preserveExisting, setPreserveExisting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AiScheduleResult | null>(null);

  const pendingCount = state.checklistItems.filter((c) => !c.completed).length;
  const subjectById = useMemo(
    () => new Map(state.subjects.map((s) => [s.id, s])),
    [state.subjects],
  );

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPreview(null);
    setLoading(true);
    try {
      const result = await generateAiStudySchedule({
        state,
        apiKey: geminiApiKey,
        model: geminiModel,
        startDate,
        preserveCompletedAndManual: preserveExisting,
      });
      setPreview(result);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'AI 플랜 생성 중 오류가 발생했습니다.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!preview) return;
    replaceStudyBlocksFromAi(preview.blocks);
    setPreview(null);
    onClose();
  };

  return (
    <NativeDialog
      open={open}
      onClose={() => {
        setPreview(null);
        setError(null);
        onClose();
      }}
      title="AI 최적 플랜 생성"
      maxWidthClass="w-full max-w-xl"
    >
      <form onSubmit={handleGenerate} className="space-y-4">
        <div className="rounded-md border border-zinc-200 bg-slate-50 px-3 py-2.5 text-xs text-zinc-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-zinc-900">적용 조건 및 모델</span>
            <span className="tabular-nums text-zinc-500">미완료 항목 {pendingCount}개</span>
          </div>
          <ul className="mt-1.5 space-y-1 text-zinc-600">
            <li>모델: {geminiModel}</li>
            <li>고정 제약: 하교·식사 1시간 제외, 수능 휴교일(11.19–11.20), 시험기간 정규학원 휴원</li>
            <li>직전보강(12.02, 12.03, 12.06, 12.07): 보강 과목 외 타 과목 일일 최대 3시간 상한</li>
          </ul>
        </div>

        {!geminiApiKey.trim() && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span>Gemini API 키가 아직 등록되지 않았습니다.</span>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSettings();
              }}
              className="touch-target shrink-0 cursor-pointer rounded border border-amber-300 bg-white px-2.5 py-1 font-medium text-amber-900 hover:bg-amber-100"
            >
              설정에서 등록
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="ai-start-date" className="mb-1 block text-xs font-medium text-zinc-700">
              배치 시작일
            </label>
            <input
              id="ai-start-date"
              type="date"
              value={startDate}
              max={state.examEndDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="tabular-nums w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900"
            />
          </div>

          <div className="flex items-end pb-1">
            <label className="touch-target flex cursor-pointer items-center gap-2 text-xs text-zinc-700">
              <input
                type="checkbox"
                checked={preserveExisting}
                onChange={(e) => setPreserveExisting(e.target.checked)}
                className="h-4 w-4"
              />
              <span>완료 및 수동 추가 블록 유지</span>
            </label>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
          >
            <AlertCircle size={14} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {preview && (
          <div className="space-y-2 rounded-md border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 bg-slate-50 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-zinc-900">생성 결과 미리보기</span>
                <span className="tabular-nums text-zinc-600">
                  신규 {preview.stats.acceptedCount}개 블록
                  {preview.stats.trimmedForPrepCap > 0
                    ? ` · 3시간 상한 보정 ${preview.stats.trimmedForPrepCap}건`
                    : ''}
                  {preview.stats.skippedInvalid > 0
                    ? ` · 범위 외 제외 ${preview.stats.skippedInvalid}건`
                    : ''}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-600">{preview.rationale}</p>
            </div>

            <div className="max-h-56 divide-y divide-zinc-100 overflow-y-auto">
              {preview.blocks
                .filter((b) => b.source === 'ai')
                .map((blk) => {
                  const subj = subjectById.get(blk.subjectId);
                  return (
                    <div
                      key={blk.id}
                      className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="tabular-nums shrink-0 text-zinc-500">
                          {formatShortDate(blk.date)} {blk.startTime}–{blk.endTime}
                        </span>
                        {subj && <SubjectBadge name={subj.name} colorKey={subj.colorKey} compact />}
                        <span className="truncate text-zinc-800">{blk.title}</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-zinc-200 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="touch-target cursor-pointer rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-slate-50"
          >
            닫기
          </button>

          {!preview ? (
            <button
              type="submit"
              disabled={loading || !geminiApiKey.trim()}
              className="touch-target inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw size={14} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
              ) : (
                <Cpu size={14} strokeWidth={1.5} aria-hidden="true" />
              )}
              <span>{loading ? '스케줄 생성 중...' : '최적 플랜 생성'}</span>
            </button>
          ) : (
            <>
              <button
                type="submit"
                disabled={loading}
                className="touch-target cursor-pointer rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-slate-50"
              >
                다시 생성
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="touch-target inline-flex cursor-pointer items-center gap-1 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                <Check size={14} strokeWidth={1.5} aria-hidden="true" />
                <span>타임라인에 적용</span>
              </button>
            </>
          )}
        </div>
      </form>
    </NativeDialog>
  );
};
