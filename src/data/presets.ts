import type {
  ChecklistItem,
  DateOverride,
  PastelColorKey,
  PlannerState,
  StudyBlock,
  Subject,
  WeeklyRule,
} from '../types/planner';

const PRESET_EPOCH = 1762992000000; // Deterministic baseline timestamp

export const PASTEL_STYLE_MAP: Record<
  PastelColorKey,
  { bg: string; text: string; border: string; dot: string; bar: string; label: string }
> = {
  slate: {
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200',
    dot: 'bg-slate-500',
    bar: 'bg-slate-200/90 border-slate-300 text-slate-900',
    label: '슬레이트',
  },
  sky: {
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200',
    dot: 'bg-sky-500',
    bar: 'bg-sky-200/90 border-sky-300 text-sky-950',
    label: '스카이',
  },
  indigo: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    dot: 'bg-indigo-500',
    bar: 'bg-indigo-200/90 border-indigo-300 text-indigo-950',
    label: '인디고',
  },
  emerald: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-200/90 border-emerald-300 text-emerald-950',
    label: '에메랄드',
  },
  amber: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
    bar: 'bg-amber-200/90 border-amber-300 text-amber-950',
    label: '앰버',
  },
  rose: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    dot: 'bg-rose-500',
    bar: 'bg-rose-200/90 border-rose-300 text-rose-950',
    label: '로즈',
  },
  violet: {
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    border: 'border-violet-200',
    dot: 'bg-violet-500',
    bar: 'bg-violet-200/90 border-violet-300 text-violet-950',
    label: '바이올렛',
  },
  teal: {
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200',
    dot: 'bg-teal-500',
    bar: 'bg-teal-200/90 border-teal-300 text-teal-950',
    label: '틸',
  },
};

export const PRESET_SUBJECTS: Subject[] = [
  {
    id: 'subj-eng2',
    name: '영어Ⅱ',
    colorKey: 'sky',
    examDate: '2026-12-03',
    examPeriod: '1교시',
    examStart: '09:10',
    examEnd: '10:00',
    order: 0,
    updatedAt: PRESET_EPOCH,
  },
  {
    id: 'subj-ethics',
    name: '인문학과윤리',
    colorKey: 'amber',
    examDate: '2026-12-03',
    examPeriod: '2교시',
    examStart: '10:20',
    examEnd: '11:10',
    order: 1,
    updatedAt: PRESET_EPOCH,
  },
  {
    id: 'subj-calc1',
    name: '미적분Ⅰ',
    colorKey: 'indigo',
    examDate: '2026-12-04',
    examPeriod: '1교시',
    examStart: '09:10',
    examEnd: '10:00',
    order: 2,
    updatedAt: PRESET_EPOCH,
  },
  {
    id: 'subj-datasci',
    name: '데이터과학',
    colorKey: 'teal',
    examDate: '2026-12-04',
    examPeriod: '2교시',
    examStart: '10:20',
    examEnd: '11:10',
    order: 3,
    updatedAt: PRESET_EPOCH,
  },
  {
    id: 'subj-speech',
    name: '화법과언어',
    colorKey: 'rose',
    examDate: '2026-12-07',
    examPeriod: '1교시',
    examStart: '09:10',
    examEnd: '10:00',
    order: 4,
    updatedAt: PRESET_EPOCH,
  },
  {
    id: 'subj-calc2',
    name: '미적분Ⅱ',
    colorKey: 'violet',
    examDate: '2026-12-08',
    examPeriod: '2교시',
    examStart: '10:20',
    examEnd: '11:10',
    order: 5,
    updatedAt: PRESET_EPOCH,
  },
  {
    id: 'subj-sciresearch',
    name: '과학과제연구',
    colorKey: 'emerald',
    examDate: '2026-12-09',
    examPeriod: '2교시',
    examStart: '10:20',
    examEnd: '11:10',
    order: 6,
    updatedAt: PRESET_EPOCH,
  },
  {
    id: 'subj-society',
    name: '사회와문화',
    colorKey: 'slate',
    examDate: '2026-12-09',
    examPeriod: '3교시',
    examStart: '11:30',
    examEnd: '12:20',
    order: 7,
    updatedAt: PRESET_EPOCH,
  },
];

function item(
  id: string,
  subjectId: string,
  title: string,
  estimatedMinutes = 60,
): ChecklistItem {
  return {
    id,
    subjectId,
    title,
    completed: false,
    estimatedMinutes,
    createdAt: PRESET_EPOCH,
    updatedAt: PRESET_EPOCH,
  };
}

export const PRESET_CHECKLIST_ITEMS: ChecklistItem[] = [
  // 영어Ⅱ
  item('chk-eng2-1', 'subj-eng2', '수특 프린트 9회(6,10)', 45),
  item('chk-eng2-2', 'subj-eng2', '수특 프린트 10회(4,6,7,9)', 60),
  item('chk-eng2-3', 'subj-eng2', '수특 프린트 11회(4,6,8,9~10)', 60),
  item('chk-eng2-4', 'subj-eng2', '수특 프린트 12회(3,5,6,7)', 60),
  item('chk-eng2-5', 'subj-eng2', '10모(23,30,31,32,33,34)', 75),

  // 인문학과윤리
  item('chk-ethics-1', 'subj-ethics', 'PPT 정리본 보기 및 정리하기', 90),
  item('chk-ethics-2', 'subj-ethics', '교과서 보기', 60),
  item('chk-ethics-3', 'subj-ethics', '이지영 강의 선별', 90),
  item('chk-ethics-4', 'subj-ethics', '수특 선별', 60),

  // 미적분Ⅰ
  item('chk-calc1-1', 'subj-calc1', '정적분으로 정의된 함수 복습', 90),
  item('chk-calc1-2', 'subj-calc1', '교과서 문풀', 90),
  item('chk-calc1-3', 'subj-calc1', '해커스 문풀', 120),

  // 데이터과학
  item('chk-ds-1', 'subj-datasci', '프린트 회독', 60),
  item('chk-ds-2', 'subj-datasci', '교과서 정독', 60),
  item('chk-ds-3', 'subj-datasci', '코드 보기', 60),

  // 화법과언어
  item('chk-speech-1', 'subj-speech', '통사론', 75),
  item('chk-speech-2', 'subj-speech', 'part1문제', 60),
  item('chk-speech-3', 'subj-speech', '국어의 역사', 75),
  item('chk-speech-4', 'subj-speech', 'part2문제', 60),

  // 미적분Ⅱ
  item('chk-calc2-1', 'subj-calc2', 'Theme 8', 60),
  item('chk-calc2-2', 'subj-calc2', 'Theme 9', 60),
  item('chk-calc2-3', 'subj-calc2', 'Theme 10', 60),
  item('chk-calc2-4', 'subj-calc2', 'Theme 11', 60),
  item('chk-calc2-5', 'subj-calc2', 'Theme 12', 60),
  item('chk-calc2-6', 'subj-calc2', 'Theme 13', 60),
  item('chk-calc2-7', 'subj-calc2', 'Theme 14', 60),
  item('chk-calc2-8', 'subj-calc2', 'Theme 15', 60),
  item('chk-calc2-9', 'subj-calc2', 'Theme 16', 60),

  // 과학과제연구
  item('chk-sci-1', 'subj-sciresearch', '프린트 보기', 60),

  // 사회와문화
  item('chk-soc-1', 'subj-society', '교과서 문풀', 60),
  item('chk-soc-2', 'subj-society', '수특 level2 문풀', 75),
  item('chk-soc-3', 'subj-society', '8주차(1,2,3)', 60),
  item('chk-soc-4', 'subj-society', '9주차(1,2,3)', 60),
  item('chk-soc-5', 'subj-society', '10주차(1,2,3)', 60),
  item('chk-soc-6', 'subj-society', '직시크 1주차(1,2,3)', 60),
  item('chk-soc-7', 'subj-society', '직시크 2주차(1,2,3)', 60),
  item('chk-soc-8', 'subj-society', '직시크 3주차(1,2,3)', 60),
  item('chk-soc-9', 'subj-society', '개념완성&프린트 문풀', 75),
];

export const PRESET_WEEKLY_RULES: WeeklyRule[] = [
  {
    dayOfWeek: 1,
    label: '월요일 기본 시간표 (학원 없음)',
    studyWindows: [{ start: '18:00', end: '24:00', label: '자습 가능' }],
    fixedSlots: [
      { start: '08:30', end: '17:00', kind: 'school', label: '학교 수업 (17:00 하교)' },
      { start: '17:00', end: '18:00', kind: 'meal', label: '저녁 식사 (1시간)' },
    ],
  },
  {
    dayOfWeek: 2,
    label: '화요일 기본 시간표 (22:00까지 학원)',
    studyWindows: [{ start: '22:00', end: '23:30', label: '취침 전 자투리 복습' }],
    fixedSlots: [
      { start: '08:30', end: '17:00', kind: 'school', label: '학교 수업' },
      { start: '17:00', end: '18:00', kind: 'meal', label: '하교 후 식사 (1시간)' },
      { start: '18:00', end: '22:00', kind: 'academy', label: '정규 학원' },
    ],
  },
  {
    dayOfWeek: 3,
    label: '수요일 기본 시간표 (학원 없음)',
    studyWindows: [{ start: '17:00', end: '24:00', label: '자습 가능' }],
    fixedSlots: [
      { start: '08:30', end: '16:00', kind: 'school', label: '학교 수업 (16:00 하교)' },
      { start: '16:00', end: '17:00', kind: 'meal', label: '저녁 식사 (1시간)' },
    ],
  },
  {
    dayOfWeek: 4,
    label: '목요일 기본 시간표 (학원 없음)',
    studyWindows: [{ start: '18:00', end: '24:00', label: '자습 가능' }],
    fixedSlots: [
      { start: '08:30', end: '17:00', kind: 'school', label: '학교 수업 (17:00 하교)' },
      { start: '17:00', end: '18:00', kind: 'meal', label: '저녁 식사 (1시간)' },
    ],
  },
  {
    dayOfWeek: 5,
    label: '금요일 기본 시간표 (20:00까지 학원)',
    studyWindows: [{ start: '20:00', end: '24:00', label: '자습 가능' }],
    fixedSlots: [
      { start: '08:30', end: '16:30', kind: 'school', label: '학교 수업' },
      { start: '16:30', end: '17:30', kind: 'meal', label: '하교 후 식사 (1시간)' },
      { start: '17:30', end: '20:00', kind: 'academy', label: '정규 학원' },
    ],
  },
  {
    dayOfWeek: 6,
    label: '토요일 기본 시간표 (오전·야간 학원)',
    studyWindows: [{ start: '15:00', end: '18:00', label: '오후 자습' }],
    fixedSlots: [
      { start: '10:00', end: '14:00', kind: 'academy', label: '오전 정규 학원' },
      { start: '14:00', end: '15:00', kind: 'meal', label: '점심 식사 (1시간)' },
      { start: '18:00', end: '22:00', kind: 'academy', label: '야간 정규 학원' },
      { start: '22:00', end: '23:00', kind: 'meal', label: '저녁 식사 (1시간)' },
    ],
  },
  {
    dayOfWeek: 0,
    label: '일요일 기본 시간표 (오후 학원)',
    studyWindows: [
      { start: '10:00', end: '13:00', label: '오전 자습' },
      { start: '21:00', end: '24:00', label: '야간 자습' },
    ],
    fixedSlots: [
      { start: '13:00', end: '14:00', kind: 'meal', label: '점심 식사 (1시간)' },
      { start: '14:00', end: '20:00', kind: 'academy', label: '오후 정규 학원' },
      { start: '20:00', end: '21:00', kind: 'meal', label: '저녁 식사 (1시간)' },
    ],
  },
];

export const PRESET_DATE_OVERRIDES: DateOverride[] = [
  {
    id: 'ovr-csat-1119',
    date: '2026-11-19',
    title: '수능일 휴교 (종일 자습)',
    note: '학교 미등교 · 점심 및 저녁 식사 각 1시간 제외 종일 자습 가능',
    studyWindows: [
      { start: '10:00', end: '12:00', label: '오전 자습' },
      { start: '13:00', end: '18:00', label: '오후 자습' },
      { start: '19:00', end: '24:00', label: '야간 자습' },
    ],
    fixedSlots: [
      { start: '12:00', end: '13:00', kind: 'meal', label: '점심 식사 (1시간)' },
      { start: '18:00', end: '19:00', kind: 'meal', label: '저녁 식사 (1시간)' },
    ],
    updatedAt: PRESET_EPOCH,
  },
  {
    id: 'ovr-csat-1120',
    date: '2026-11-20',
    title: '수능 익일 휴교 (자율 자습)',
    note: '학교 미등교 · 10:00~16:00 및 20:00~24:00 자습 가능',
    studyWindows: [
      { start: '10:00', end: '16:00', label: '주간 자습' },
      { start: '20:00', end: '24:00', label: '야간 자습' },
    ],
    fixedSlots: [
      { start: '16:00', end: '17:00', kind: 'meal', label: '식사 (1시간)' },
      { start: '17:00', end: '20:00', kind: 'academy', label: '금요일 정규 학원' },
    ],
    updatedAt: PRESET_EPOCH,
  },
  {
    id: 'ovr-prep-1202',
    date: '2026-12-02',
    title: '영어Ⅱ 직전보강',
    note: '영어Ⅱ 직전보강 장시간 참석 · 타 과목 공부 최대 3시간 제한',
    studyWindows: [
      { start: '17:00', end: '18:00', label: '오후 자투리 자습' },
      { start: '21:00', end: '24:00', label: '야간 자습' },
    ],
    fixedSlots: [
      { start: '08:30', end: '16:00', kind: 'school', label: '학교 수업 (16:00 하교)' },
      { start: '16:00', end: '17:00', kind: 'meal', label: '저녁 식사 (1시간)' },
      {
        start: '18:00',
        end: '21:00',
        kind: 'final_prep',
        label: '영어Ⅱ 직전보강',
        subjectId: 'subj-eng2',
      },
    ],
    finalPrepSubjectId: 'subj-eng2',
    maxOtherSubjectMinutes: 180,
    updatedAt: PRESET_EPOCH,
  },
  {
    id: 'ovr-exam-1203',
    date: '2026-12-03',
    title: '시험 1일차 · 미적분Ⅰ 직전보강',
    note: '영어Ⅱ·인문학과윤리 시험 후 오후 미적분Ⅰ 직전보강 · 타 과목 최대 3시간',
    isExamPeriod: true,
    studyWindows: [
      { start: '13:00', end: '15:00', label: '오후 자습' },
      { start: '19:00', end: '24:00', label: '야간 자습' },
    ],
    fixedSlots: [
      { start: '12:00', end: '13:00', kind: 'meal', label: '점심 식사 (1시간)' },
      {
        start: '15:00',
        end: '18:00',
        kind: 'final_prep',
        label: '미적분Ⅰ 직전보강',
        subjectId: 'subj-calc1',
      },
      { start: '18:00', end: '19:00', kind: 'meal', label: '저녁 식사 (1시간)' },
    ],
    finalPrepSubjectId: 'subj-calc1',
    maxOtherSubjectMinutes: 180,
    updatedAt: PRESET_EPOCH,
  },
  {
    id: 'ovr-exam-1204',
    date: '2026-12-04',
    title: '시험 2일차 (정규학원 휴원)',
    note: '정규 학원 휴원 및 직전보강 없음 · 다음 시험 과목 온전 자습',
    isExamPeriod: true,
    studyWindows: [
      { start: '13:00', end: '18:00', label: '오후 자습' },
      { start: '19:00', end: '24:00', label: '야간 자습' },
    ],
    fixedSlots: [
      { start: '12:00', end: '13:00', kind: 'meal', label: '점심 식사 (1시간)' },
      { start: '18:00', end: '19:00', kind: 'meal', label: '저녁 식사 (1시간)' },
    ],
    updatedAt: PRESET_EPOCH,
  },
  {
    id: 'ovr-exam-1205',
    date: '2026-12-05',
    title: '시험기간 토요일 (정규학원 휴원)',
    note: '정규 학원 휴원 · 식사 시간 제외 온종일 다음 시험 자습',
    isExamPeriod: true,
    studyWindows: [
      { start: '10:00', end: '13:00', label: '오전 자습' },
      { start: '14:00', end: '18:00', label: '오후 자습' },
      { start: '19:00', end: '24:00', label: '야간 자습' },
    ],
    fixedSlots: [
      { start: '13:00', end: '14:00', kind: 'meal', label: '점심 식사 (1시간)' },
      { start: '18:00', end: '19:00', kind: 'meal', label: '저녁 식사 (1시간)' },
    ],
    updatedAt: PRESET_EPOCH,
  },
  {
    id: 'ovr-exam-1206',
    date: '2026-12-06',
    title: '화법과언어 직전보강 (일요학원 대체)',
    note: '정규 일요일 학원 대신 화법과언어 직전보강 참석 · 타 과목 최대 3시간',
    isExamPeriod: true,
    studyWindows: [
      { start: '10:00', end: '13:00', label: '오전 자습' },
      { start: '19:00', end: '24:00', label: '야간 자습' },
    ],
    fixedSlots: [
      { start: '13:00', end: '14:00', kind: 'meal', label: '점심 식사 (1시간)' },
      {
        start: '14:00',
        end: '18:00',
        kind: 'final_prep',
        label: '화법과언어 직전보강',
        subjectId: 'subj-speech',
      },
      { start: '18:00', end: '19:00', kind: 'meal', label: '저녁 식사 (1시간)' },
    ],
    finalPrepSubjectId: 'subj-speech',
    maxOtherSubjectMinutes: 180,
    updatedAt: PRESET_EPOCH,
  },
  {
    id: 'ovr-exam-1207',
    date: '2026-12-07',
    title: '시험 3일차 · 미적분Ⅱ 직전보강',
    note: '화법과언어 시험 후 오후 미적분Ⅱ 직전보강 · 타 과목 최대 3시간',
    isExamPeriod: true,
    studyWindows: [
      { start: '12:30', end: '14:00', label: '오후 자투리 자습' },
      { start: '19:00', end: '24:00', label: '야간 자습' },
    ],
    fixedSlots: [
      { start: '11:30', end: '12:30', kind: 'meal', label: '점심 식사 (1시간)' },
      {
        start: '14:00',
        end: '18:00',
        kind: 'final_prep',
        label: '미적분Ⅱ 직전보강',
        subjectId: 'subj-calc2',
      },
      { start: '18:00', end: '19:00', kind: 'meal', label: '저녁 식사 (1시간)' },
    ],
    finalPrepSubjectId: 'subj-calc2',
    maxOtherSubjectMinutes: 180,
    updatedAt: PRESET_EPOCH,
  },
  {
    id: 'ovr-exam-1208',
    date: '2026-12-08',
    title: '시험 4일차 (정규학원 휴원)',
    note: '정규 학원 휴원 및 직전보강 없음 · 마지막 날 과목 자습 집중',
    isExamPeriod: true,
    studyWindows: [
      { start: '13:00', end: '18:00', label: '오후 자습' },
      { start: '19:00', end: '24:00', label: '야간 자습' },
    ],
    fixedSlots: [
      { start: '12:00', end: '13:00', kind: 'meal', label: '점심 식사 (1시간)' },
      { start: '18:00', end: '19:00', kind: 'meal', label: '저녁 식사 (1시간)' },
    ],
    updatedAt: PRESET_EPOCH,
  },
  {
    id: 'ovr-exam-1209',
    date: '2026-12-09',
    title: '시험 최종일',
    note: '과학과제연구(2교시) · 사회와문화(3교시) 응시 후 기말고사 종료',
    isExamPeriod: true,
    studyWindows: [],
    fixedSlots: [{ start: '12:30', end: '13:30', kind: 'meal', label: '점심 식사 (1시간)' }],
    updatedAt: PRESET_EPOCH,
  },
];

export const PRESET_STUDY_BLOCKS: StudyBlock[] = [];

export function createInitialPlannerState(): PlannerState {
  return {
    version: 1,
    updatedAt: PRESET_EPOCH,
    hasLocalEdits: false,
    examStartDate: '2026-12-03',
    examEndDate: '2026-12-09',
    subjects: PRESET_SUBJECTS.map((s) => ({ ...s })),
    checklistItems: PRESET_CHECKLIST_ITEMS.map((c) => ({ ...c })),
    studyBlocks: PRESET_STUDY_BLOCKS.map((b) => ({ ...b })),
    weeklyRules: PRESET_WEEKLY_RULES.map((r) => ({
      ...r,
      studyWindows: r.studyWindows.map((w) => ({ ...w })),
      fixedSlots: r.fixedSlots.map((f) => ({ ...f })),
    })),
    dateOverrides: PRESET_DATE_OVERRIDES.map((o) => ({
      ...o,
      studyWindows: o.studyWindows.map((w) => ({ ...w })),
      fixedSlots: o.fixedSlots.map((f) => ({ ...f })),
    })),
  };
}
