# 오늘 화면 + AI 배치 전용화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 폰과 패드에서 오늘 할 일과 과목별 남은 양을 먼저 보여주는 "오늘" 화면을 추가한다. AI는 기존 체크리스트를 예상 시간 안에서만 배치하고, 적용 전에 변경 내역을 보여주도록 바꾼다.

**Architecture:** 남은 시간 계산과 완료 규칙은 순수 함수 하나(`src/utils/progress.ts`)에 모으고, 이 함수를 "오늘" 화면, 블록 체크 처리, AI 예산 계산이 함께 쓴다. AI 결과 검증(`aiScheduler.ts`)은 체크리스트를 수정하는 대신 항목별 예산 안에서 블록을 잘라내도록 바꾼다. 미리보기 비교는 별도 순수 함수(`src/services/aiDiff.ts`)로 분리한다. UI는 새 `TodayPane`과 `App.tsx` 레이아웃 변경으로 구성한다.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind 4, lucide-react, vitest, `@google/genai`, Vercel 서버리스 함수

**Spec:** `docs/superpowers/specs/2026-11-16-today-screen-and-ai-placement-design.md`

## Global Constraints

- `src/types/planner.ts`의 타입은 바꾸지 않는다.
- UI 문구는 한국어로 쓴다. 기존 `App.test.tsx`의 규칙을 지킨다. 렌더링 결과에 `!`와 이모지가 없어야 하고, `bg-gradient-`와 `shadow-lg`도 쓰지 않는다. 그래서 스펙의 "⚠" 표시는 이모지가 아닌 lucide `AlertTriangle` 아이콘과 "밀림" 텍스트로 대체한다.
- 브레이크포인트는 기존 기준 `min-[960px]`을 유지한다.
- AI는 체크리스트 항목을 추가, 삭제하거나 이름, 예상 시간을 바꾸지 않는다. 결과 적용 시 `checklistItems`를 넘기지 않는다.
- 블록 길이 최소값은 15분이다(기존 값 유지).
- 매 Task가 끝나면 `npm test`와 `npx tsc -b`가 통과해야 한다.

## Review Focus

1. **블록이 여러 개인 항목에서 하나만 체크를 해제하는 경우:** 완료됐던 항목이 미완료로 돌아가야 한다. 테스트는 Task 2.
2. **이미 완료된 항목이나 없는 항목 id를 가리키는 AI 블록:** 이런 블록은 버려지고 `skippedInvalid`가 증가해야 한다. 테스트는 Task 3.
3. **대화형 수정을 연속으로 하는 경우:** 비교 기준이 직전 미리보기가 되어, 이번 수정이 바꾼 것만 보여야 한다. 테스트는 Task 4(함수 수준)와 Task 5(모달 연결).
4. **시험 당일이거나 시험이 끝난 과목:** 시험 당일 과목은 하루 필요량을 남은 시간 전체로 계산한다(남은 날수 최소 1). 시험일이 지난 과목은 목록에서 뺀다. 테스트는 Task 1.
5. **`checklistItemId`가 없는 예전 블록:** 지난 날짜의 미완료 블록이면 과목 기준으로 "밀림"에 포함한다. 교체 대상이면 미리보기의 "항목 없는 블록"에 나와야 한다. 테스트는 Task 1과 Task 4.

---

### Task 1: 남은 양 계산 유틸

**Files:**
- Create: `src/utils/progress.ts`
- Test: `src/utils/progress.test.ts`

**Interfaces:**
- Consumes: `calculateDDay(target, ref)`, `getDurationMinutes(start, end)` (`src/utils/time.ts`)
- Produces:
  ```ts
  export function getItemRemainingMinutes(item: ChecklistItem, blocks: StudyBlock[]): number;
  export interface SubjectProgress {
    subjectId: string;
    remainingCount: number;      // 미완료 항목 수
    remainingMinutes: number;    // 항목별 남은 시간 합
    totalMinutes: number;        // 과목 전체 estimatedMinutes 합
    daysLeft: number;            // max(1, examDate - today 일수)
    dailyNeedMinutes: number;    // ceil(remainingMinutes / daysLeft)
    overdueMinutes: number;      // today 이전 날짜, 미완료, type이 study|final_prep인 블록의 시간 합(과목 기준)
  }
  export function getSubjectProgress(state: PlannerState, today: string): SubjectProgress[];
  export function getTodayStudyBlocks(state: PlannerState, today: string): StudyBlock[];
  ```

- [ ] **Step 1: `progress.test.ts`에 실패하는 테스트 작성**

  `createInitialPlannerState()`를 기준 상태로 쓰되, 각 테스트에서 `studyBlocks`를 명시적으로 지정한다. 프리셋 블록이 결과에 섞이지 않도록 기본은 `[]`로 둔다.
  - `getItemRemainingMinutes`
    - 완료된 항목은 `0`
    - 미완료 항목(`estimatedMinutes` 90)에 완료 블록 30분과 미완료 블록 60분이 연결돼 있으면 `60`
    - 완료 블록의 시간이 예상 시간을 넘으면 `0`(음수가 되지 않음)
  - `getSubjectProgress(state, '2026-11-16')`
    - `subj-eng2`(항목 45/60/60/60/75, 모두 미완료, 블록 없음): `remainingCount` 5, `remainingMinutes` 300, `daysLeft` 17, `dailyNeedMinutes` 18
    - 결과가 `examDate` 오름차순으로 정렬됨
  - `getSubjectProgress(state, '2026-12-03')`
    - `subj-eng2`의 `daysLeft`가 1
    - `examDate`가 `'2026-12-03'`보다 이른 과목은 결과에 없음
  - `overdueMinutes`
    - `checklistItemId`가 없는 `subj-eng2`의 미완료 블록이 `2026-11-15 18:00–19:30`에 있으면 `subj-eng2`의 값은 90
    - 같은 블록이 완료 상태이면 0
  - `getTodayStudyBlocks`
    - 같은 날의 `exam` 블록은 제외
    - `study`와 `final_prep` 블록만 `startTime` 오름차순으로 반환

- [ ] **Step 2: 테스트 실패 확인**

  Run: `npx vitest run src/utils/progress.test.ts`
  Expected: FAIL (모듈 없음)

- [ ] **Step 3: `src/utils/progress.ts` 구현**

  `getSubjectProgress`의 기준은 다음과 같다.
  - `examDate >= today`인 과목만 포함한다.
  - `examDate`, `order` 순으로 정렬한다.
  - `daysLeft = Math.max(1, calculateDDay(subject.examDate, today))`. `calculateDDay`의 부호가 이 의미와 맞는지 먼저 확인한다.

- [ ] **Step 4: 테스트 통과 확인**

  Run: `npx vitest run src/utils/progress.test.ts`
  Expected: PASS

- [ ] **Step 5: 커밋**

  ```bash
  git add src/utils/progress.ts src/utils/progress.test.ts
  git commit -m "feat: add subject progress and remaining-time utilities"
  ```

### Task 2: 완료 규칙 (모든 블록을 체크해야 항목 완료)

**Files:**
- Modify: `src/utils/progress.ts`
- Modify: `src/context/PlannerContext.tsx:486-518` (`toggleStudyBlock`)
- Test: `src/utils/progress.test.ts`

**Interfaces:**
- Produces: `export function applyStudyBlockToggle(state: PlannerState, blockId: string, now: number): PlannerState;`
- `toggleStudyBlock`의 본문은 `commitLocalMutation((prev) => applyStudyBlockToggle(prev, blockId, Date.now()))`가 된다.
- `toggleChecklistItem`(항목을 직접 체크하면 연결된 블록 전부를 같은 상태로 바꿈)은 그대로 둔다.

- [ ] **Step 1: 실패하는 테스트 작성** (`describe('applyStudyBlockToggle')`)
  - 항목 A에 블록 b1, b2가 연결돼 있다.
    - b1만 체크하면 A는 미완료이고, b1은 `completed: true`다.
    - 이어서 b2도 체크하면 A가 완료된다.
    - 그 상태에서 b1의 체크를 풀면 A가 다시 미완료가 된다(Review Focus 1).
  - 항목이 연결되지 않은 블록을 토글해도 `checklistItems`가 바뀌지 않는다.
  - 바뀐 블록과 항목의 `updatedAt`은 `now`가 된다.

- [ ] **Step 2: 실패 확인**

  Run: `npx vitest run src/utils/progress.test.ts`
  Expected: FAIL (`applyStudyBlockToggle` 없음)

- [ ] **Step 3: `applyStudyBlockToggle` 구현 후 `toggleStudyBlock`에서 사용**

  항목 완료 여부 = 그 항목에 연결된 블록이 모두 `completed`인지.

- [ ] **Step 4: 전체 테스트 통과 확인**

  Run: `npm test`
  Expected: PASS

- [ ] **Step 5: 커밋**

  ```bash
  git add src/utils/progress.ts src/utils/progress.test.ts src/context/PlannerContext.tsx
  git commit -m "feat: complete checklist item only when all linked blocks are done"
  ```

### Task 3: AI를 배치 전용으로 (예산과 체크리스트 불변)

**Files:**
- Modify: `src/services/aiScheduler.ts` (타입, 스키마, `synchronizeChecklistWithAiBlocks` 제거, `validateAndSanitizeAiBlocks`, `buildAiSchedulePrompt`, `generateAiStudySchedule`)
- Modify: `api/schedule.js` (응답 스키마)
- Modify: `src/components/AiPlanModal.tsx` (컴파일이 되도록 최소한만: `currentDraftChecklist` 인자 제거, `replaceStudyBlocksFromAi(preview.blocks)`, 통계 문구를 새 필드로)
- Test: `src/services/aiScheduler.test.ts`

**Interfaces:**
- Consumes: `getItemRemainingMinutes` (Task 1)
- Produces:
  ```ts
  export interface AiGeneratedBlockCandidate { date; startTime; endTime; subjectId; checklistItemId: string; title }  // checklistItemId 필수
  // 삭제: AiChecklistUpdateCandidate, synchronizeChecklistWithAiBlocks, GenerateAiScheduleParams.currentDraftChecklist
  export function getPreservedBlocks(blocks: StudyBlock[], startDate: string, preserveCompletedAndManual: boolean): StudyBlock[];
    // on : b.completed || b.source !== 'ai' || b.date < startDate
    // off: b.date < startDate
  export function computeItemBudgets(state: PlannerState, preservedBlocks: StudyBlock[], startDate: string): Map<string, number>;
    // 미완료 항목마다: getItemRemainingMinutes(item, state.studyBlocks) - (preservedBlocks 중 date >= startDate, 미완료, 그 항목에 연결된 블록의 시간 합)
    // 0 이하인 항목은 Map에 넣지 않음
  export function validateAndSanitizeAiBlocks(
    candidates: AiGeneratedBlockCandidate[], state: PlannerState, preservedBlocks: StudyBlock[],
    startDate: string, endDate: string, budgets: Map<string, number>,
  ): { blocks: StudyBlock[]; trimmedForPrepCap: number; trimmedForBudget: number; skippedInvalid: number; unplacedByItem: Record<string, number> };
  export interface AiScheduleResult {
    blocks: StudyBlock[];          // preserved + 새 AI 블록, 날짜·시간순
    replacedBlocks: StudyBlock[];  // 기준 블록(currentDraftBlocks ?? state.studyBlocks) 중 preserved가 아닌 것 = 미리보기의 "이전"
    rationale: string;
    budgetMinutes: number;         // 예산 합계
    placedMinutes: number;         // 새 AI 블록 시간 합
    unplacedByItem: Record<string, number>;
    stats: { requestedCount: number; acceptedCount: number; trimmedForPrepCap: number; trimmedForBudget: number; skippedInvalid: number };
  }
  ```
- `buildAiSchedulePrompt`는 `preservedBlocks`를 `getPreservedBlocks(state.studyBlocks, effectiveStart, preserve)`로 구하고, `budgets`도 함께 반환한다.

- [ ] **Step 1: 기존 테스트 갱신과 새 테스트 작성** (`aiScheduler.test.ts`)

  **기존 테스트 갱신**
  - 기존 세 개 테스트(직전보강 상한, 범위 밖 거부, 프롬프트 직렬화)의 후보 블록에 실제 프리셋 항목 id를 `checklistItemId`로 넣는다. 예: `subj-society` 블록에는 해당 과목의 프리셋 항목.
  - 호출 시그니처를 새 `budgets` 인자에 맞춘다. 넉넉한 예산이 필요하면 `computeItemBudgets(state, existingManual, start)`를 쓴다.
  - 기대값은 지금과 같아야 한다.
  - 마지막 테스트(`synchronizes checklist items…`)는 삭제한다.

  **새 테스트**
  - **예산 초과 블록 자르기:** `chk-eng2-1`(45분)에 `19:00–20:00` 블록이 오면 `19:00–19:45`로 잘리고 `trimmedForBudget`가 1이다. 같은 항목에 이어지는 두 번째 블록은 버려지고 `skippedInvalid`가 1 증가한다.
  - **예산이 15분 미만으로 남은 경우:** 블록은 버려진다.
  - **유효하지 않은 항목 id:** 없는 id(`'chk-nope'`)나 완료된 항목을 가리키는 블록은 버려지고 `skippedInvalid`가 증가한다(Review Focus 2).
  - **제목과 과목 덮어쓰기:** 블록의 `subjectId`와 `title`은 항목 값으로 덮어쓴다. 같은 항목에 블록이 두 개 받아들여지면 제목이 `'<항목 제목> (1/2)'`, `'<항목 제목> (2/2)'`가 된다.
  - **미배치 시간:** `unplacedByItem['chk-eng2-1']`은 예산 45분에서 배치된 시간을 뺀 값이다(전부 배치되면 키가 없음).
  - **`computeItemBudgets`:** `chk-calc1-1`(90분)에 대해 다음과 같으면 예산은 30이다.
    - 완료 블록 30분이 있다.
    - 시작일 이후에 보존되는 미완료 manual 블록 30분이 있다.
    - 시작일 이전의 미완료 블록 60분이 있다. 이 블록은 예산에서 빼지 않는다.
  - **`getPreservedBlocks(..., false)`:** 시작일 이전 블록만 남긴다.
  - **`buildAiSchedulePrompt`:** `fullPrompt`에 `"remainingMinutes"`가 들어가고 `checklistUpdates`는 들어가지 않는다. 예산이 0인 항목 id는 포함되지 않는다.

- [ ] **Step 2: 실패 확인**

  Run: `npx vitest run src/services/aiScheduler.test.ts`
  Expected: FAIL

- [ ] **Step 3: `aiScheduler.ts` 수정**

  **검증 순서.** 기존 검사(기간, 시험일, 가용 시간대, 15분, 직전보강, 겹침)를 하기 전에 다음 두 가지를 먼저 처리한다.
  - 항목 id 유효성: 예산 Map에 없는 id면 버린다.
  - 예산 차감: 날짜순으로 처리하면서 블록이 남은 예산보다 길면 끝 시각을 잘라내고, 남은 예산이 15분 미만이면 버린다.

  잘라낸 다음에 겹침 검사를 한다. 접미사 `(i/n)`은 받아들여진 블록을 모두 모은 뒤 항목별로 붙인다.

  **프롬프트.** 규칙 6과 체크리스트 수정 문구를 삭제하고, 아래 문구로 대체한다.
  ```
  6. 배치 전용: 모든 블록의 checklistItemId는 pendingChecklistItems의 id 중 하나여야 하며, 항목별 배치 시간 합은 그 항목의 remainingMinutes를 넘으면 안 됩니다. 모든 빈 시간을 채울 필요는 없습니다. 체크리스트 항목을 추가·삭제·수정하지 마세요.
  7. 균등 배분: 각 과목의 남은 시간을 그 과목 시험일 전날까지의 날짜에 고르게 나누고, 하루에 한 과목만 몰지 마세요.
  8. 사용자가 체크리스트 항목 추가·삭제를 요청하면 수행하지 말고, rationale에 "체크리스트 수정은 직접 해 주세요"라고 안내하세요.
  ```
  rationale 규칙은 9번으로 옮긴다.

  **스키마.** `aiScheduler.ts`와 `api/schedule.js`의 `SCHEDULE_RESPONSE_SCHEMA`에서 `checklistUpdates`를 제거하고, `blocks.items.required`에 `'checklistItemId'`를 추가한다.

  **결과 조립.** `generateAiStudySchedule`에서 `replacedBlocks`를 계산하고, preserved 블록 제목을 다시 동기화하던 코드는 삭제한다.

- [ ] **Step 4: `AiPlanModal.tsx` 최소 수정**

  - `currentDraftChecklist` 인자를 제거한다.
  - 적용 시 `replaceStudyBlocksFromAi(preview.blocks)`를 호출한다.
  - 미리보기 통계 줄은 `trimmedForBudget`과 `skippedInvalid`로 바꾼다. 상세 UI는 Task 5에서 만든다.

- [ ] **Step 5: 통과 확인**

  Run: `npm test && npx tsc -b`
  Expected: PASS, 타입 에러 없음

- [ ] **Step 6: 커밋**

  ```bash
  git add src/services/aiScheduler.ts src/services/aiScheduler.test.ts api/schedule.js src/components/AiPlanModal.tsx
  git commit -m "feat: restrict AI to placing existing checklist items within their remaining time"
  ```

### Task 4: 배치 변경 비교 함수

**Files:**
- Create: `src/services/aiDiff.ts`
- Test: `src/services/aiDiff.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PlacementSlot { date: string; startTime: string; endTime: string }
  export interface ItemPlacementChange { itemId: string; title: string; subjectId: string; before: PlacementSlot[]; after: PlacementSlot[] }
  export interface PlacementDiff {
    added: ItemPlacementChange[];      // before 없음, after 있음
    moved: ItemPlacementChange[];      // 둘 다 있음, 슬롯 집합이 다름
    removed: ItemPlacementChange[];    // before 있음, after 없음
    unchanged: ItemPlacementChange[];  // 슬롯 집합이 같음
    unlinkedRemoved: StudyBlock[];     // before 중 checklistItemId가 없는 블록
  }
  export function diffPlacements(before: StudyBlock[], after: StudyBlock[], items: ChecklistItem[]): PlacementDiff;
  ```
  - 제목과 과목은 `items`에서 가져온다. 항목이 없으면 블록 제목에서 `stripPartSuffix`한 값을 쓴다.
  - 슬롯은 날짜와 시작 시각 순으로 정렬한다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - **네 분류:** 다음 블록으로 분류를 확인한다.
    - 항목 A: 이전과 이후의 슬롯이 같음 → `unchanged`
    - 항목 B: `11.18 19:00`에서 `11.17 21:00`으로 바뀜 → `moved`이고, `before`와 `after`가 각각 한 개
    - 항목 C: 이후에만 있음 → `added`
    - 항목 D: 이전에만 있음 → `removed`
  - **항목 없는 블록:** `checklistItemId`가 없는 이전 블록은 `unlinkedRemoved`에 들어가고, 다른 분류에는 들어가지 않는다(Review Focus 5).
  - **연속 수정:** 첫 결과의 `after`를 다음 호출의 `before`로 넣으면, 두 번째 수정에서 움직인 항목만 `moved`에 나온다(Review Focus 3).

- [ ] **Step 2: 실패 확인**

  Run: `npx vitest run src/services/aiDiff.test.ts`
  Expected: FAIL

- [ ] **Step 3: `src/services/aiDiff.ts` 구현**

- [ ] **Step 4: 통과 확인**

  Run: `npx vitest run src/services/aiDiff.test.ts`
  Expected: PASS

- [ ] **Step 5: 커밋**

  ```bash
  git add src/services/aiDiff.ts src/services/aiDiff.test.ts
  git commit -m "feat: add AI placement diff by checklist item"
  ```

### Task 5: AI 미리보기에 변경 내역 표시

**Files:**
- Modify: `src/components/AiPlanModal.tsx` (미리보기 영역, 현재 376–430행 부근)

**Interfaces:**
- Consumes:
  - `AiScheduleResult.replacedBlocks`, `blocks`, `budgetMinutes`, `placedMinutes`, `unplacedByItem` (Task 3)
  - `diffPlacements` (Task 4)
  - `formatDurationCompact`, `formatShortDate` (`utils/time.ts`)

- [ ] **Step 1: 미리보기 UI 교체**

  `diff = diffPlacements(preview.replacedBlocks, preview.blocks.filter(b => b.source === 'ai' && !b.completed), state.checklistItems)`로 계산하고, 스펙 3절 순서대로 보여준다.
  - **요약 줄:** `배치 {placed} / 남은 계획 {budget} · 미배치 {budget - placed}`. 미배치가 0이면 해당 부분은 생략한다.
  - **추가 (n), 이동 (n), 빠짐 (n):** 항목 제목, 과목 배지(`SubjectBadge`), 슬롯을 보여준다. 이동은 `이전 → 이후` 형식이다.
  - **항목 없는 블록 (n):** `unlinkedRemoved`가 있을 때만 보여준다.
  - **그대로 (n):** `<details>`로 기본 접힘.
  - **미배치 목록:** 과목과 항목 제목, 분(`unplacedByItem`)을 보여준다.
  - **rationale:** 요약 아래에 작은 회색 글씨로 둔다.

  "이전"은 생성할 때 이미 `replacedBlocks`에 들어 있다. 연속 수정 시 `currentDraftBlocks = preview.blocks`를 넘기면 직전 미리보기가 기준이 된다(Task 3에서 결정한 동작).

- [ ] **Step 2: 확인**

  Run: `npm test && npx tsc -b`
  Expected: PASS

  추가로 `npm run dev`에서 AI 모달을 열고 다음을 확인한다. 실제 생성에는 API 키가 필요하다.
  - 미리보기가 없을 때 레이아웃이 깨지지 않는다.
  - 키가 있으면 생성 후 위의 분류가 보인다.

- [ ] **Step 3: 커밋**

  ```bash
  git add src/components/AiPlanModal.tsx
  git commit -m "feat: show added/moved/removed placements before applying AI plan"
  ```

### Task 6: "오늘" 화면과 레이아웃

**Files:**
- Create: `src/components/TodayPane.tsx`
- Modify: `src/App.tsx` (모바일 탭, 데스크톱 왼쪽 칸 전환, 과목 필터 상태 끌어올리기)
- Modify: `src/components/ChecklistPane.tsx:27` (`selectedSubjectId` 상태를 props로)
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `getSubjectProgress`, `getTodayStudyBlocks` (Task 1), `usePlanner().toggleStudyBlock`, `getDayScheduleContext`
- Produces:
  ```ts
  interface TodayPaneProps {
    today: string;
    onOpenEditBlock: (block: StudyBlock) => void;
    onSelectSubject: (subjectId: string) => void;  // 과목 줄 탭
    onGoToTimeline: () => void;                    // 빈 상태의 "시간표에서 추가"
    onOpenAiModal: () => void;                     // 빈 상태의 "AI로 배치"
  }
  // ChecklistPaneProps에 추가: selectedSubjectId: string; onSelectSubject: (id: string) => void
  ```

- [ ] **Step 1: `App.test.tsx` 갱신 (실패하는 테스트)**

  - 기존 단언 중 `'타임라인'`을 `'시간표'`로 바꾼다.
  - 다음 단언을 추가한다: `'오늘 할 일'`, `'과목별 남은 양'`
  - 나머지(8과목 이름, `0/38`, `잔여 38`, `!`·이모지 금지)는 유지한다.
  - 테스트 이름에서 "2-column"을 빼고 "today view and checklist"로 바꾼다.

- [ ] **Step 2: 실패 확인**

  Run: `npx vitest run src/App.test.tsx`
  Expected: FAIL (`'오늘 할 일'` 없음)

- [ ] **Step 3: `TodayPane.tsx` 구현** (스펙 1절 와이어프레임 기준)

  **머리글**
  - `오늘 · {formatDateWithWeekday(today)}`와 D-day 배지
  - `공부 가능 {studyWindows} · 계획 {오늘 블록 합계}`

  **"오늘 할 일" 목록**
  - 각 줄은 체크박스, 제목, 시간, 과목 배지로 구성한다.
  - 체크박스는 `toggleStudyBlock`, 줄 탭은 `onOpenEditBlock`에 연결한다.
  - 완료된 줄은 흐리게 표시하고 취소선을 긋는다.

  **"과목별 남은 양" 목록**
  - 과목명과 진행 막대를 보여준다.
  - 숫자는 `{remainingCount}개 · {formatDurationCompact(remainingMinutes)} · 하루 {formatDurationCompact(dailyNeedMinutes)}`로 표시한다.
  - `overdueMinutes > 0`이면 `AlertTriangle` 아이콘과 `밀림 {formatDurationCompact}`를 붙인다.
  - 남은 시간이 0인 과목은 "완료"로 표시한다.
  - 줄을 탭하면 `onSelectSubject`를 호출한다.

  **빈 상태:** 오늘 할 일이 없으면 `오늘 배치된 공부가 없습니다` 문구와 두 버튼을 보여준다.

  **스타일:** 스타일은 `.agent/skills/clean-ui/SKILL.md`와 기존 컴포넌트의 톤을 따른다. 터치 대상에는 `touch-target` 클래스를 쓴다.

- [ ] **Step 4: `App.tsx` 레이아웃 변경**

  **960px 미만**
  - `MobileTab = 'today' | 'timeline' | 'checklist'`로 바꾸고 기본값은 `'today'`로 한다.
  - 탭바는 `<main>` 아래, 화면 하단으로 옮긴다.
  - 탭 라벨은 `오늘`, `시간표 {dayBlockCount}`, `체크리스트 잔여 {n}`이다. 아이콘은 `Sun` 또는 `ListTodo`, `CalendarDays`, `CheckSquare`를 쓴다.
  - 기존 키보드 탐색(좌우 화살표, Home, End)을 세 탭에 맞게 확장한다.

  **960px 이상**
  - 왼쪽 칸 상단에 `오늘 | 시간표` 세그먼트 전환을 둔다(`desktopLeft` 상태, 기본값 `'today'`).
  - 오른쪽 칸은 체크리스트 그대로다.

  **과목 선택**
  - `onSelectSubject`는 `checklistSubjectId`를 설정한다.
  - 960px 미만에서는 탭도 `'checklist'`로 바꾼다.
  - `handleJumpToDate`는 모바일에서는 `'timeline'` 탭으로, 데스크톱에서는 `desktopLeft = 'timeline'`으로 이동한다.

- [ ] **Step 5: 확인**

  Run: `npm test && npx tsc -b`
  Expected: PASS

  추가로 `npm run dev`를 띄우고 세 가지 폭에서 확인한다.
  - **375×812:** 하단 탭, 오늘 화면이 기본, 과목 줄 탭 시 체크리스트로 이동하고 필터가 적용됨
  - **1024×768:** 왼쪽 칸이 오늘 화면, 전환 버튼, 오른쪽 체크리스트
  - **1280:** 가로 스크롤 없음

- [ ] **Step 6: 커밋**

  ```bash
  git add src/components/TodayPane.tsx src/App.tsx src/components/ChecklistPane.tsx src/App.test.tsx
  git commit -m "feat: add Today view as default on phone and pad"
  ```

### Task 7: 가독성 수정

**Files:**
- Modify: `src/components/TimelinePane.tsx:567` (시각 라벨), `:195-230` (데스크톱 툴바 버튼)
- Modify: `src/components/ChecklistPane.tsx:96` (과목 필터 스크롤 영역)
- Modify: `src/index.css` (`.no-scrollbar` 유틸리티)

- [ ] **Step 1: 시각 라벨**

  `displayHour`를 `String(hour).padStart(2, '0')`로 바꿔 24시간제로 표시한다.

- [ ] **Step 2: 데스크톱 툴바**

  `오늘`, `시험 시작일`, `고정일정 숨김/표시` 버튼에 `whitespace-nowrap shrink-0`을 추가한다.

- [ ] **Step 3: 스크롤바 숨김**

  `index.css`에 `.no-scrollbar { scrollbar-width: none } .no-scrollbar::-webkit-scrollbar { display: none }`를 추가하고, 과목 필터 컨테이너에 적용한다.

- [ ] **Step 4: 확인**

  Run: `npm test && npx tsc -b`
  Expected: PASS

  `npm run dev`의 데스크톱 폭에서도 확인한다.
  - 시각 라벨이 `06`…`23`으로 보인다.
  - 툴바 버튼이 한 줄로 보인다.
  - 필터 탭에 스크롤바가 보이지 않는다.

- [ ] **Step 5: 커밋**

  ```bash
  git add src/components/TimelinePane.tsx src/components/ChecklistPane.tsx src/index.css
  git commit -m "fix: 24-hour timeline labels, non-wrapping toolbar, hidden filter scrollbar"
  ```
