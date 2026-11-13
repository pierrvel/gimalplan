import { signInWithPopup, signOut, type User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import type { PlannerState } from '../types/planner';
import { auth, db, googleProvider, isFirebaseConfigured } from './firebase';
import { sanitizePlannerState } from './storage';

const CLIENT_SESSION_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `client-${Math.random().toString(36).slice(2, 10)}`;

export function getClientSessionId(): string {
  return CLIENT_SESSION_ID;
}

function mergeTombstones(
  a?: Record<string, number>,
  b?: Record<string, number>,
): Record<string, number> {
  const merged: Record<string, number> = { ...(a ?? {}) };
  for (const [id, ts] of Object.entries(b ?? {})) {
    if (typeof ts === 'number' && (!merged[id] || ts > merged[id])) {
      merged[id] = ts;
    }
  }
  return merged;
}

function mergeEntitiesById<T extends { id: string; updatedAt: number }>(
  localList: T[],
  cloudList: T[],
  tombstones: Record<string, number>,
): T[] {
  const byId = new Map<string, T>();

  for (const item of cloudList) {
    const deletedAt = tombstones[item.id] ?? 0;
    if (deletedAt >= item.updatedAt) continue;
    byId.set(item.id, item);
  }

  for (const item of localList) {
    const deletedAt = tombstones[item.id] ?? 0;
    if (deletedAt >= item.updatedAt) continue;
    const existing = byId.get(item.id);
    if (!existing || item.updatedAt > existing.updatedAt) {
      byId.set(item.id, item);
    }
  }

  return Array.from(byId.values());
}

export function mergePlannerStates(local: PlannerState, cloud: PlannerState): PlannerState {
  if (!local.hasLocalEdits) {
    return {
      ...cloud,
      hasLocalEdits: true,
    };
  }

  const tombstones = mergeTombstones(local.tombstones, cloud.tombstones);
  const subjects = mergeEntitiesById(local.subjects, cloud.subjects, tombstones).sort(
    (a, b) => a.order - b.order,
  );
  const checklistItems = mergeEntitiesById(
    local.checklistItems,
    cloud.checklistItems,
    tombstones,
  ).sort((a, b) => a.createdAt - b.createdAt);
  const studyBlocks = mergeEntitiesById(local.studyBlocks, cloud.studyBlocks, tombstones).sort(
    (a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)),
  );
  const dateOverrides = mergeEntitiesById(
    local.dateOverrides,
    cloud.dateOverrides,
    tombstones,
  ).sort((a, b) => a.date.localeCompare(b.date));

  const useLocalMeta = local.updatedAt >= cloud.updatedAt;

  return {
    version: Math.max(local.version, cloud.version),
    updatedAt: Math.max(local.updatedAt, cloud.updatedAt, Date.now()),
    hasLocalEdits: true,
    lastUpdatedBy: CLIENT_SESSION_ID,
    tombstones,
    examStartDate: useLocalMeta ? local.examStartDate : cloud.examStartDate,
    examEndDate: useLocalMeta ? local.examEndDate : cloud.examEndDate,
    subjects,
    checklistItems,
    studyBlocks,
    weeklyRules: useLocalMeta ? local.weeklyRules : cloud.weeklyRules,
    dateOverrides,
  };
}

export async function signInWithGoogle(): Promise<User> {
  if (!isFirebaseConfigured || !auth || !googleProvider) {
    throw new Error('Firebase 환경 변수가 설정되지 않아 로컬 모드로 동작 중입니다.');
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? '';
    if (code === 'auth/popup-closed-by-user') {
      throw new Error('Google 로그인 창이 닫혔습니다.');
    }
    if (code === 'auth/popup-blocked') {
      throw new Error('브라우저에서 로그인 팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.');
    }
    if (code === 'auth/unauthorized-domain') {
      throw new Error(
        '현재 도메인이 Firebase Authentication 승인된 도메인에 등록되지 않았습니다.',
      );
    }
    throw new Error('Google 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  }
}

export async function signOutGoogle(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}

export function cleanForFirestore<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T;
}

function getUserStateDocRef(uid: string) {
  if (!db) return null;
  return doc(db, 'users', uid, 'planner', 'state');
}

export async function loadAndMergeCloudPlanner(
  uid: string,
  localState: PlannerState,
): Promise<PlannerState> {
  const ref = getUserStateDocRef(uid);
  if (!ref) return localState;

  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const initialToUpload: PlannerState = {
      ...localState,
      lastUpdatedBy: CLIENT_SESSION_ID,
      updatedAt: Date.now(),
    };
    await setDoc(ref, cleanForFirestore(initialToUpload));
    return initialToUpload;
  }

  const cloudState = sanitizePlannerState(snap.data());
  const merged = mergePlannerStates(localState, cloudState);
  if (localState.hasLocalEdits) {
    await setDoc(ref, cleanForFirestore(merged));
  }
  return merged;
}

export async function pushPlannerStateToCloud(uid: string, state: PlannerState): Promise<void> {
  const ref = getUserStateDocRef(uid);
  if (!ref) return;
  const payload: PlannerState = {
    ...state,
    lastUpdatedBy: CLIENT_SESSION_ID,
  };
  await setDoc(ref, cleanForFirestore(payload));
}

export function subscribeToCloudPlanner(
  uid: string,
  onRemoteState: (state: PlannerState) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const ref = getUserStateDocRef(uid);
  if (!ref) return () => {};

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists() || snap.metadata.hasPendingWrites) return;
      const incoming = sanitizePlannerState(snap.data());
      if (incoming.lastUpdatedBy === CLIENT_SESSION_ID) return;
      onRemoteState(incoming);
    },
    (err) => {
      onError(err);
    },
  );
}
