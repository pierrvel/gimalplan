import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Cpu, MessageSquare, Plus, RefreshCw, Send, X } from 'lucide-react';
import { usePlanner } from '../context/PlannerContext';
import {
  generateAiStudySchedule,
  type AiRevisionTurn,
  type AiScheduleResult,
} from '../services/aiScheduler';
import {
  BLOCK_DURATION_PRESETS,
  type BlockDurationPreset,
  loadAiSchedulePreferences,
  saveAiSchedulePreferences,
} from '../services/storage';
import { formatShortDate, getTodayDateKey } from '../utils/time';
import { NativeDialog } from './NativeDialog';
import { SubjectBadge } from './SubjectBadge';

interface AiPlanModalProps {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}

const PRESET_RULE_CHIPS = [
  '한 블록을 120분씩 길게 배치',
  '블록 사이 15분 휴식 간격 확보',
  '하루 최대 2과목까지만 집중 배치',
  '수학(미적분Ⅰ·대수) 매일 1블록 이상 포함',
  '22시 이후에는 암기 과목 위주 배치',
] as const;

export const AiPlanModal: React.FC<AiPlanModalProps> = ({
  open,
  onClose,
  onOpenSettings: _onOpenSettings,
}) => {
  const { state, geminiApiKey, geminiModel, replaceStudyBlocksFromAi } = usePlanner();

  const today = getTodayDateKey();
  const defaultStart = today <= state.examEndDate ? today : state.examStartDate;

  const [startDate, setStartDate] = useState(defaultStart);
  const [preserveExisting, setPreserveExisting] = useState(true);
  const [blockDurationPreset, setBlockDurationPreset] = useState<BlockDurationPreset>(() => {
    return loadAiSchedulePreferences().blockDurationPreset;
  });
  const [customRules, setCustomRules] = useState<string[]>(() => {
    return loadAiSchedulePreferences().customRules;
  });
  const [newRuleInput, setNewRuleInput] = useState('');
  const [userInstruction, setUserInstruction] = useState('');
  const [revisionHistory, setRevisionHistory] = useState<AiRevisionTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AiScheduleResult | null>(null);

  useEffect(() => {
    if (!open) return;
    const prefs = loadAiSchedulePreferences();
    setBlockDurationPreset(prefs.blockDurationPreset);
    setCustomRules(prefs.customRules);
  }, [open]);

  const persistPrefs = (nextPreset: BlockDurationPreset, nextRules: string[]) => {
    saveAiSchedulePreferences({
      blockDurationPreset: nextPreset,
      customRules: nextRules,
    });
  };

  const handleChangeDurationPreset = (nextPreset: BlockDurationPreset) => {
    setBlockDurationPreset(nextPreset);
    persistPrefs(nextPreset, customRules);
  };

  const handleTogglePresetRule = (rule: string) => {
    const exists = customRules.includes(rule);
    const nextRules = exists
      ? customRules.filter((r) => r !== rule)
      : [...customRules, rule];
    setCustomRules(nextRules);
    persistPrefs(blockDurationPreset, nextRules);
  };

  const handleAddCustomRule = () => {
    const trimmed = newRuleInput.trim();
    if (!trimmed) return;
    if (!customRules.includes(trimmed)) {
      const nextRules = [...customRules, trimmed];
      setCustomRules(nextRules);
      persistPrefs(blockDurationPreset, nextRules);
    }
    setNewRuleInput('');
  };

  const handleRemoveRule = (rule: string) => {
    const nextRules = customRules.filter((r) => r !== rule);
    setCustomRules(nextRules);
    persistPrefs(blockDurationPreset, nextRules);
  };

  const pendingCount = state.checklistItems.filter((c) => !c.completed).length;
  const existingAiCount = state.studyBlocks.filter((b) => b.source === 'ai').length;
  const hasActiveDraft = Boolean(preview) || existingAiCount > 0;

  const subjectById = useMemo(
    () => new Map(state.subjects.map((s) => [s.id, s])),
    [state.subjects],
  );

  const selectedDuration =
    BLOCK_DURATION_PRESETS.find((p) => p.id === blockDurationPreset) ?? BLOCK_DURATION_PRESETS[2];

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const trimmedInstruction = userInstruction.trim();
    const currentDraftBlocks = preview?.blocks ?? state.studyBlocks;

    try {
      const result = await generateAiStudySchedule({
        state,
        apiKey: geminiApiKey,
        model: geminiModel,
        startDate,
        preserveCompletedAndManual: preserveExisting,
        minBlockMinutes: selectedDuration.minMinutes,
        maxBlockMinutes: selectedDuration.maxMinutes,
        customRules,
        userInstruction: trimmedInstruction || undefined,
        currentDraftBlocks:
          trimmedInstruction || preview ? currentDraftBlocks : undefined,
        revisionHistory,
      });

      setPreview(result);
      setRevisionHistory((prev) => [
        ...prev,
        {
          instruction: trimmedInstruction || `${selectedDuration.label} 기준으로 플랜 생성`,
          rationale: result.rationale,
        },
      ]);
      setUserInstruction('');
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
    setRevisionHistory([]);
    onClose();
  };

  const handleCloseDialog = () => {
    setPreview(null);
    setRevisionHistory([]);
    setError(null);
    onClose();
  };

  return (
    <NativeDialog
      open={open}
      onClose={handleCloseDialog}
      title="AI 최적 플랜 생성 및 대화형 수정"
      maxWidthClass="w-full max-w-2xl"
    >
      <form onSubmit={handleGenerate} className="space-y-4">
        <div className="rounded-md border border-zinc-200 bg-slate-50 px-3 py-2.5 text-xs text-zinc-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-zinc-900">기본 제약 및 모델</span>
            <span className="tabular-nums text-zinc-500">
              미완료 항목 {pendingCount}개 · 모델 {geminiModel}
            </span>
          </div>
          <ul className="mt-1.5 space-y-1 text-zinc-600">
            <li>고정 제약: 하교·식사 1시간 제외, 수능 휴교일(11.19–11.20), 시험기간 정규학원 휴원</li>
            <li>직전보강(12.02, 12.03, 12.06, 12.07): 보강 과목 외 타 과목 일일 최대 3시간 상한</li>
          </ul>
        </div>

        {/* Date, Duration Preset, Preserve Checkbox */}
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

          <div>
            <label htmlFor="ai-block-duration" className="mb-1 block text-xs font-medium text-zinc-700">
              1블록 학습 시간 단위
            </label>
            <select
              id="ai-block-duration"
              value={blockDurationPreset}
              onChange={(e) => handleChangeDurationPreset(e.target.value as BlockDurationPreset)}
              className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900"
            >
              {BLOCK_DURATION_PRESETS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-700">
          <input
            type="checkbox"
            checked={preserveExisting}
            onChange={(e) => setPreserveExisting(e.target.checked)}
            className="h-4 w-4"
          />
          <span>완료 및 수동 추가 블록 유지</span>
        </label>

        {/* Custom Persistent Scheduling Rules */}
        <div className="space-y-2 rounded-md border border-zinc-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-zinc-900">고정 스케줄링 규칙</span>
            <span className="tabular-nums text-[11px] text-zinc-500">
              적용 중 {customRules.length}개
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PRESET_RULE_CHIPS.map((chip) => {
              const active = customRules.includes(chip);
              return (
                <button
                  key={chip}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleTogglePresetRule(chip)}
                  className={`cursor-pointer rounded border px-2 py-1 text-[11px] transition-colors ${
                    active
                      ? 'border-blue-300 bg-blue-50 font-medium text-blue-700'
                      : 'border-zinc-200 bg-slate-50 text-zinc-600 hover:bg-zinc-100'
                  }`}
                >
                  {active ? `적용: ${chip}` : `+ ${chip}`}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={newRuleInput}
              onChange={(e) => setNewRuleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleAddCustomRule();
                }
              }}
              placeholder="직접 규칙 추가 (예: 일요일 오전에는 대수만 배치)"
              aria-label="새 스케줄링 규칙 입력"
              className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400"
            />
            <button
              type="button"
              onClick={handleAddCustomRule}
              className="touch-target inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-zinc-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
            >
              <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
              <span>규칙 추가</span>
            </button>
          </div>

          {customRules.filter((r) => !PRESET_RULE_CHIPS.includes(r as (typeof PRESET_RULE_CHIPS)[number])).length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {customRules
                .filter((r) => !PRESET_RULE_CHIPS.includes(r as (typeof PRESET_RULE_CHIPS)[number]))
                .map((rule) => (
                  <span
                    key={rule}
                    className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-800"
                  >
                    <span>{rule}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveRule(rule)}
                      aria-label={`${rule} 규칙 삭제`}
                      className="cursor-pointer rounded p-0.5 text-blue-600 hover:bg-blue-100"
                    >
                      <X size={11} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </span>
                ))}
            </div>
          )}
        </div>

        {/* Direct Natural-Language Instruction Box */}
        <div className="space-y-1.5 rounded-md border border-zinc-200 bg-slate-50/70 p-3">
          <label
            htmlFor="ai-direct-instruction"
            className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900"
          >
            <MessageSquare size={13} strokeWidth={1.5} className="text-blue-600" aria-hidden="true" />
            <span>
              {hasActiveDraft
                ? 'AI에게 직접 말해서 현재 플랜 수정하기'
                : 'AI에게 직접 말해서 원하는 플랜 요청하기'}
            </span>
          </label>
          <textarea
            id="ai-direct-instruction"
            rows={2}
            value={userInstruction}
            onChange={(e) => setUserInstruction(e.target.value)}
            placeholder={
              hasActiveDraft
                ? '예: 한 블록 하는 시간을 2시간으로 늘려줘 / 토요일 저녁 영어 블록을 대수로 바꿔줘'
                : '예: 한 블록을 90분 이상 길게 잡고, 블록 사이 15분씩 쉬는 시간을 넣어줘'
            }
            className="w-full resize-y rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs text-zinc-900 placeholder:text-zinc-400"
          />
          <p className="text-[11px] text-zinc-500">
            생성 후에도 원하는 내용을 계속 입력해 여러 번 이어서 수정할 수 있습니다.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="flex max-h-32 items-start gap-2 overflow-y-auto break-all rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
          >
            <AlertCircle size={14} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* Revision History */}
        {revisionHistory.length > 0 && (
          <div className="space-y-1.5 rounded-md border border-zinc-200 bg-slate-50 p-2.5 text-xs">
            <div className="font-semibold text-zinc-800">대화형 수정 내역</div>
            <div className="max-h-28 space-y-1.5 overflow-y-auto">
              {revisionHistory.map((turn, idx) => (
                <div key={idx} className="rounded border border-zinc-200 bg-white px-2.5 py-1.5">
                  <div className="font-medium text-zinc-900">요청 {idx + 1}: {turn.instruction}</div>
                  <div className="mt-0.5 text-[11px] text-zinc-600">{turn.rationale}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Preview */}
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

            <div className="max-h-52 divide-y divide-zinc-100 overflow-y-auto">
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

        <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-200 pt-3">
          <button
            type="button"
            onClick={handleCloseDialog}
            className="touch-target cursor-pointer rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-slate-50"
          >
            닫기
          </button>

          {!preview ? (
            <button
              type="submit"
              disabled={loading}
              className="touch-target inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw size={14} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
              ) : userInstruction.trim() ? (
                <Send size={14} strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <Cpu size={14} strokeWidth={1.5} aria-hidden="true" />
              )}
              <span>
                {loading
                  ? '스케줄 생성 중...'
                  : userInstruction.trim() && existingAiCount > 0
                    ? '요청대로 플랜 수정'
                    : '최적 플랜 생성'}
              </span>
            </button>
          ) : (
            <>
              <button
                type="submit"
                disabled={loading}
                className="touch-target inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <RefreshCw size={13} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Send size={13} strokeWidth={1.5} aria-hidden="true" />
                )}
                <span>
                  {loading
                    ? '수정 반영 중...'
                    : userInstruction.trim()
                      ? '요청대로 수정'
                      : '다시 생성'}
                </span>
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
