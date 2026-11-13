import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { usePlanner } from '../context/PlannerContext';
import { PASTEL_STYLE_MAP } from '../data/presets';
import type { PastelColorKey, TimeRange, WeeklyRule } from '../types/planner';
import { NativeDialog } from './NativeDialog';
import { SubjectBadge } from './SubjectBadge';

interface ScheduleRuleModalProps {
  open: boolean;
  onClose: () => void;
}

const COLOR_KEYS = Object.keys(PASTEL_STYLE_MAP) as PastelColorKey[];
const WEEKDAY_NAMES: Record<number, string> = {
  1: '월요일',
  2: '화요일',
  3: '수요일',
  4: '목요일',
  5: '금요일',
  6: '토요일',
  0: '일요일',
};

export const ScheduleRuleModal: React.FC<ScheduleRuleModalProps> = ({ open, onClose }) => {
  const {
    state,
    addSubject,
    updateSubject,
    deleteSubject,
    updateWeeklyRule,
    upsertDateOverride,
    deleteDateOverride,
  } = usePlanner();

  const [tab, setTab] = useState<'subjects' | 'weekly' | 'overrides'>('subjects');

  // New subject draft
  const [newSubjName, setNewSubjName] = useState('');
  const [newSubjColor, setNewSubjColor] = useState<PastelColorKey>('sky');
  const [newSubjDate, setNewSubjDate] = useState('2026-12-03');
  const [newSubjPeriod, setNewSubjPeriod] = useState('1교시');
  const [newSubjStart, setNewSubjStart] = useState('09:10');
  const [newSubjEnd, setNewSubjEnd] = useState('10:00');

  // New override draft
  const [ovrDate, setOvrDate] = useState('2026-11-25');
  const [ovrTitle, setOvrTitle] = useState('');
  const [ovrWindowStart, setOvrWindowStart] = useState('10:00');
  const [ovrWindowEnd, setOvrWindowEnd] = useState('22:00');
  const [ovrPrepSubjectId, setOvrPrepSubjectId] = useState('');
  const [ovrMaxOtherMins, setOvrMaxOtherMins] = useState('180');

  const handleAddSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjName.trim()) return;
    addSubject({
      name: newSubjName,
      colorKey: newSubjColor,
      examDate: newSubjDate,
      examPeriod: newSubjPeriod,
      examStart: newSubjStart,
      examEnd: newSubjEnd,
    });
    setNewSubjName('');
  };

  const handleAddOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ovrDate || !ovrTitle.trim()) return;
    const id = `ovr-${ovrDate}-${Math.random().toString(36).slice(2, 6)}`;
    const prepSubj = state.subjects.find((s) => s.id === ovrPrepSubjectId);
    upsertDateOverride({
      id,
      date: ovrDate,
      title: ovrTitle.trim(),
      studyWindows:
        ovrWindowStart < ovrWindowEnd
          ? [{ start: ovrWindowStart, end: ovrWindowEnd, label: '자습 가능' }]
          : [],
      fixedSlots: prepSubj
        ? [
            {
              start: '15:00',
              end: '18:00',
              kind: 'final_prep',
              label: `${prepSubj.name} 직전보강`,
              subjectId: prepSubj.id,
            },
          ]
        : [],
      finalPrepSubjectId: ovrPrepSubjectId || undefined,
      maxOtherSubjectMinutes:
        ovrPrepSubjectId && Number(ovrMaxOtherMins) > 0 ? Number(ovrMaxOtherMins) : undefined,
    });
    setOvrTitle('');
    setOvrPrepSubjectId('');
  };

  const handleWeeklyWindowChange = (
    rule: WeeklyRule,
    index: number,
    field: keyof TimeRange,
    value: string,
  ) => {
    const nextWindows = rule.studyWindows.map((w, i) =>
      i === index ? { ...w, [field]: value } : w,
    );
    updateWeeklyRule({ ...rule, studyWindows: nextWindows });
  };

  return (
    <NativeDialog open={open} onClose={onClose} title="과목·시험 시간표 및 제약 관리" maxWidthClass="w-full max-w-2xl">
      <div className="space-y-4">
        <div role="tablist" aria-label="시간표 관리 탭" className="flex border-b border-zinc-200">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'subjects'}
            onClick={() => setTab('subjects')}
            className={`tab-item touch-target cursor-pointer px-3 py-2 text-xs ${
              tab === 'subjects' ? 'text-blue-600' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            과목·시험 일정
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'weekly'}
            onClick={() => setTab('weekly')}
            className={`tab-item touch-target cursor-pointer px-3 py-2 text-xs ${
              tab === 'weekly' ? 'text-blue-600' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            주간 가용 시간
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'overrides'}
            onClick={() => setTab('overrides')}
            className={`tab-item touch-target cursor-pointer px-3 py-2 text-xs ${
              tab === 'overrides' ? 'text-blue-600' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            예외·직전보강 규칙
          </button>
        </div>

        {/* Subjects & Exams Tab */}
        {tab === 'subjects' && (
          <div className="space-y-4">
            <div className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
              {state.subjects.map((subj) => (
                <div key={subj.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <SubjectBadge name={subj.name} colorKey={subj.colorKey} />
                    <input
                      type="date"
                      value={subj.examDate}
                      aria-label={`${subj.name} 시험일`}
                      onChange={(e) => updateSubject(subj.id, { examDate: e.target.value })}
                      className="tabular-nums rounded border border-zinc-200 px-1.5 py-1 text-xs"
                    />
                    <input
                      type="text"
                      value={subj.examPeriod}
                      aria-label={`${subj.name} 교시`}
                      onChange={(e) => updateSubject(subj.id, { examPeriod: e.target.value })}
                      className="w-16 rounded border border-zinc-200 px-1.5 py-1 text-xs"
                    />
                    <input
                      type="text"
                      value={subj.examStart}
                      aria-label={`${subj.name} 시작 시각`}
                      onChange={(e) => updateSubject(subj.id, { examStart: e.target.value })}
                      className="tabular-nums w-14 rounded border border-zinc-200 px-1.5 py-1 text-xs"
                    />
                    <span className="text-zinc-400">–</span>
                    <input
                      type="text"
                      value={subj.examEnd}
                      aria-label={`${subj.name} 종료 시각`}
                      onChange={(e) => updateSubject(subj.id, { examEnd: e.target.value })}
                      className="tabular-nums w-14 rounded border border-zinc-200 px-1.5 py-1 text-xs"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteSubject(subj.id)}
                    aria-label={`${subj.name} 과목 삭제`}
                    className="touch-target inline-flex cursor-pointer items-center justify-center rounded p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>

            <form
              onSubmit={handleAddSubject}
              className="grid grid-cols-2 gap-2 rounded-md border border-zinc-200 bg-slate-50 p-3 text-xs sm:grid-cols-6"
            >
              <input
                type="text"
                required
                placeholder="새 과목명"
                value={newSubjName}
                onChange={(e) => setNewSubjName(e.target.value)}
                className="col-span-2 rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs"
              />
              <select
                value={newSubjColor}
                onChange={(e) => setNewSubjColor(e.target.value as PastelColorKey)}
                aria-label="과목 색상"
                className="rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs"
              >
                {COLOR_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {PASTEL_STYLE_MAP[k].label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={newSubjDate}
                onChange={(e) => setNewSubjDate(e.target.value)}
                aria-label="새 과목 시험일"
                className="tabular-nums rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs"
              />
              <input
                type="text"
                value={newSubjPeriod}
                onChange={(e) => setNewSubjPeriod(e.target.value)}
                placeholder="1교시"
                aria-label="새 과목 교시"
                className="rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs"
              />
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newSubjStart}
                  onChange={(e) => setNewSubjStart(e.target.value)}
                  aria-label="시작"
                  className="tabular-nums w-14 rounded border border-zinc-200 bg-white px-1.5 py-1.5 text-xs"
                />
                <input
                  type="text"
                  value={newSubjEnd}
                  onChange={(e) => setNewSubjEnd(e.target.value)}
                  aria-label="종료"
                  className="tabular-nums w-14 rounded border border-zinc-200 bg-white px-1.5 py-1.5 text-xs"
                />
              </div>
              <button
                type="submit"
                className="touch-target col-span-2 inline-flex cursor-pointer items-center justify-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 sm:col-span-6"
              >
                <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
                <span>과목 추가</span>
              </button>
            </form>
          </div>
        )}

        {/* Weekly Rules Tab */}
        {tab === 'weekly' && (
          <div className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
            {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
              const rule = state.weeklyRules.find((r) => r.dayOfWeek === dow);
              if (!rule) return null;
              return (
                <div key={dow} className="space-y-2 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-900">{WEEKDAY_NAMES[dow]}</span>
                    <span className="text-zinc-500">{rule.label}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {rule.studyWindows.map((w, idx) => (
                      <div key={idx} className="flex items-center gap-1 rounded border border-zinc-200 bg-slate-50 px-2 py-1">
                        <input
                          type="text"
                          value={w.start}
                          aria-label={`${WEEKDAY_NAMES[dow]} 자습 시작 ${idx + 1}`}
                          onChange={(e) => handleWeeklyWindowChange(rule, idx, 'start', e.target.value)}
                          className="tabular-nums w-14 rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-xs"
                        />
                        <span className="text-zinc-400">–</span>
                        <input
                          type="text"
                          value={w.end}
                          aria-label={`${WEEKDAY_NAMES[dow]} 자습 종료 ${idx + 1}`}
                          onChange={(e) => handleWeeklyWindowChange(rule, idx, 'end', e.target.value)}
                          className="tabular-nums w-14 rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Date Overrides Tab */}
        {tab === 'overrides' && (
          <div className="space-y-4">
            <div className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
              {state.dateOverrides.map((ovr) => {
                const prepSubj = ovr.finalPrepSubjectId
                  ? state.subjects.find((s) => s.id === ovr.finalPrepSubjectId)
                  : undefined;
                return (
                  <div key={ovr.id} className="flex items-start justify-between gap-2 p-2.5 text-xs">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tabular-nums font-semibold text-zinc-900">{ovr.date}</span>
                        <span className="font-medium text-zinc-800">{ovr.title}</span>
                        {prepSubj && <SubjectBadge name={`${prepSubj.name} 보강`} colorKey={prepSubj.colorKey} compact />}
                        {ovr.maxOtherSubjectMinutes !== undefined && (
                          <span className="tabular-nums rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                            타 과목 최대 {ovr.maxOtherSubjectMinutes}분
                          </span>
                        )}
                      </div>
                      <div className="tabular-nums text-zinc-500">
                        가용 시간:{' '}
                        {ovr.studyWindows.length > 0
                          ? ovr.studyWindows.map((w) => `${w.start}–${w.end}`).join(', ')
                          : '없음'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteDateOverride(ovr.id)}
                      aria-label={`${ovr.date} 예외 삭제`}
                      className="touch-target inline-flex cursor-pointer items-center justify-center rounded p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-700"
                    >
                      <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>

            <form
              onSubmit={handleAddOverride}
              className="grid grid-cols-1 gap-2 rounded-md border border-zinc-200 bg-slate-50 p-3 text-xs sm:grid-cols-2"
            >
              <input
                type="date"
                required
                value={ovrDate}
                onChange={(e) => setOvrDate(e.target.value)}
                aria-label="예외 날짜"
                className="tabular-nums rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs"
              />
              <input
                type="text"
                required
                value={ovrTitle}
                onChange={(e) => setOvrTitle(e.target.value)}
                placeholder="규칙 이름 (예: 특별 자습일)"
                aria-label="예외 규칙 이름"
                className="rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs"
              />
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-600">자습:</span>
                <input
                  type="text"
                  value={ovrWindowStart}
                  onChange={(e) => setOvrWindowStart(e.target.value)}
                  className="tabular-nums w-16 rounded border border-zinc-200 bg-white px-2 py-1 text-xs"
                />
                <span>–</span>
                <input
                  type="text"
                  value={ovrWindowEnd}
                  onChange={(e) => setOvrWindowEnd(e.target.value)}
                  className="tabular-nums w-16 rounded border border-zinc-200 bg-white px-2 py-1 text-xs"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  value={ovrPrepSubjectId}
                  onChange={(e) => setOvrPrepSubjectId(e.target.value)}
                  aria-label="직전보강 과목"
                  className="min-w-0 flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-xs"
                >
                  <option value="">직전보강 없음</option>
                  {state.subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} 직전보강
                    </option>
                  ))}
                </select>
                {ovrPrepSubjectId && (
                  <input
                    type="number"
                    min={30}
                    max={600}
                    step={30}
                    value={ovrMaxOtherMins}
                    onChange={(e) => setOvrMaxOtherMins(e.target.value)}
                    aria-label="타 과목 상한 분"
                    className="tabular-nums w-16 rounded border border-zinc-200 bg-white px-1.5 py-1 text-xs"
                  />
                )}
              </div>
              <button
                type="submit"
                className="touch-target inline-flex cursor-pointer items-center justify-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 sm:col-span-2"
              >
                <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
                <span>날짜 예외 규칙 추가</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </NativeDialog>
  );
};
