import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { createInitialPlannerState } from '../data/presets';
import type {
  ChecklistItem,
  DateOverride,
  PastelColorKey,
  PlannerState,
  StudyBlock,
  Subject,
  SyncStatus,
  WeeklyRule,
} from '../types/planner';
import { auth, isFirebaseConfigured } from '../services/firebase';
import {
  DEFAULT_GEMINI_MODEL,
  loadGeminiApiKey,
  loadGeminiModel,
  loadLocalPlannerState,
  saveGeminiApiKey,
  saveGeminiModel,
  saveLocalPlannerState,
} from '../services/storage';
import {
  getClientSessionId,
  loadAndMergeCloudPlanner,
  pushPlannerStateToCloud,
  signInWithGoogle,
  signOutGoogle,
  subscribeToCloudPlanner,
} from '../services/sync';

interface PlannerContextValue {
  state: PlannerState;
  user: User | null;
  authLoading: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  firebaseEnabled: boolean;
  geminiApiKey: string;
  geminiModel: string;
  setGeminiSettings: (apiKey: string, model: string) => void;
  loginWithGoogle: () => Promise<void>;
  logoutGoogle: () => Promise<void>;
  toggleChecklistItem: (itemId: string) => void;
  addChecklistItem: (subjectId: string, title: string, estimatedMinutes?: number) => void;
  updateChecklistItem: (
    itemId: string,
    patch: Partial<Pick<ChecklistItem, 'title' | 'estimatedMinutes' | 'subjectId' | 'completed'>>,
  ) => void;
  deleteChecklistItem: (itemId: string) => void;
  addSubject: (input: {
    name: string;
    colorKey: PastelColorKey;
    examDate: string;
    examPeriod: string;
    examStart: string;
    examEnd: string;
  }) => void;
  updateSubject: (
    subjectId: string,
    patch: Partial<
      Pick<Subject, 'name' | 'colorKey' | 'examDate' | 'examPeriod' | 'examStart' | 'examEnd'>
    >,
  ) => void;
  deleteSubject: (subjectId: string) => void;
  toggleStudyBlock: (blockId: string) => void;
  addStudyBlock: (input: Omit<StudyBlock, 'id' | 'updatedAt'>) => void;
  updateStudyBlock: (
    blockId: string,
    patch: Partial<
      Pick<StudyBlock, 'date' | 'startTime' | 'endTime' | 'subjectId' | 'checklistItemId' | 'title' | 'completed'>
    >,
  ) => void;
  deleteStudyBlock: (blockId: string) => void;
  replaceStudyBlocksFromAi: (nextBlocks: StudyBlock[]) => void;
  updateWeeklyRule: (rule: WeeklyRule) => void;
  upsertDateOverride: (override: Omit<DateOverride, 'updatedAt'>) => void;
  deleteDateOverride: (overrideId: string) => void;
  resetToPresets: () => void;
}

const PlannerContext = createContext<PlannerContextValue | null>(null);

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export const PlannerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<PlannerState>(() => loadLocalPlannerState());
  const stateRef = useRef<PlannerState>(state);
  stateRef.current = state;

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(isFirebaseConfigured);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    isFirebaseConfigured ? 'local' : 'local',
  );
  const [syncError, setSyncError] = useState<string | null>(null);

  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => loadGeminiApiKey());
  const [geminiModel, setGeminiModel] = useState<string>(() => loadGeminiModel());

  const pendingCloudPushRef = useRef(false);
  const pushTimerRef = useRef<number | null>(null);

  const commitLocalMutation = useCallback((updater: (prev: PlannerState) => PlannerState) => {
    setState((prev) => {
      const next = updater(prev);
      const stamped: PlannerState = {
        ...next,
        updatedAt: Date.now(),
        hasLocalEdits: true,
        lastUpdatedBy: getClientSessionId(),
      };
      saveLocalPlannerState(stamped);
      pendingCloudPushRef.current = true;
      return stamped;
    });
  }, []);

  // Auth & Firestore subscription lifecycle
  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setAuthLoading(false);
      setSyncStatus('local');
      return;
    }

    let unsubscribeSnapshot: (() => void) | null = null;
    let active = true;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (!active) return;
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      setUser(currentUser);
      setAuthLoading(false);

      if (!currentUser) {
        setSyncStatus('local');
        setSyncError(null);
        return;
      }

      setSyncStatus('syncing');
      setSyncError(null);

      try {
        const merged = await loadAndMergeCloudPlanner(currentUser.uid, stateRef.current);
        if (!active) return;
        pendingCloudPushRef.current = false;
        saveLocalPlannerState(merged);
        setState(merged);
        setSyncStatus('synced');

        unsubscribeSnapshot = subscribeToCloudPlanner(
          currentUser.uid,
          (remoteState) => {
            if (!active) return;
            pendingCloudPushRef.current = false;
            saveLocalPlannerState(remoteState);
            setState(remoteState);
            setSyncStatus('synced');
            setSyncError(null);
          },
          (err) => {
            if (!active) return;
            setSyncStatus('error');
            setSyncError(err.message);
          },
        );
      } catch (err: unknown) {
        if (!active) return;
        setSyncStatus('error');
        setSyncError(err instanceof Error ? err.message : '클라우드 동기화에 실패했습니다.');
      }
    });

    return () => {
      active = false;
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  // Debounced cloud push when local mutations occur while signed in
  useEffect(() => {
    if (!user || !isFirebaseConfigured || !pendingCloudPushRef.current) {
      return;
    }

    if (pushTimerRef.current !== null) {
      window.clearTimeout(pushTimerRef.current);
    }

    setSyncStatus('syncing');
    const uid = user.uid;
    const snapshotToPush = state;

    pushTimerRef.current = window.setTimeout(async () => {
      try {
        await pushPlannerStateToCloud(uid, snapshotToPush);
        pendingCloudPushRef.current = false;
        setSyncStatus('synced');
        setSyncError(null);
      } catch (err: unknown) {
        setSyncStatus(navigator.onLine ? 'error' : 'offline');
        setSyncError(err instanceof Error ? err.message : '동기화 저장에 실패했습니다.');
      }
    }, 350);

    return () => {
      if (pushTimerRef.current !== null) {
        window.clearTimeout(pushTimerRef.current);
      }
    };
  }, [state, user]);

  const setGeminiSettings = useCallback((apiKey: string, model: string) => {
    const cleanModel = model.trim() || DEFAULT_GEMINI_MODEL;
    saveGeminiApiKey(apiKey);
    saveGeminiModel(cleanModel);
    setGeminiApiKey(apiKey.trim());
    setGeminiModel(cleanModel);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    setSyncError(null);
    await signInWithGoogle();
  }, []);

  const logoutGoogle = useCallback(async () => {
    setSyncError(null);
    await signOutGoogle();
  }, []);

  const toggleChecklistItem = useCallback(
    (itemId: string) => {
      commitLocalMutation((prev) => {
        const now = Date.now();
        const target = prev.checklistItems.find((c) => c.id === itemId);
        if (!target) return prev;
        const nextCompleted = !target.completed;

        return {
          ...prev,
          checklistItems: prev.checklistItems.map((c) =>
            c.id === itemId ? { ...c, completed: nextCompleted, updatedAt: now } : c,
          ),
          studyBlocks: prev.studyBlocks.map((b) =>
            b.checklistItemId === itemId ? { ...b, completed: nextCompleted, updatedAt: now } : b,
          ),
        };
      });
    },
    [commitLocalMutation],
  );

  const addChecklistItem = useCallback(
    (subjectId: string, title: string, estimatedMinutes = 60) => {
      const cleanTitle = title.trim();
      if (!cleanTitle) return;
      commitLocalMutation((prev) => {
        const now = Date.now();
        const item: ChecklistItem = {
          id: makeId('chk'),
          subjectId,
          title: cleanTitle,
          completed: false,
          estimatedMinutes: Math.max(15, estimatedMinutes),
          createdAt: now,
          updatedAt: now,
        };
        return {
          ...prev,
          checklistItems: [...prev.checklistItems, item],
        };
      });
    },
    [commitLocalMutation],
  );

  const updateChecklistItem = useCallback(
    (
      itemId: string,
      patch: Partial<Pick<ChecklistItem, 'title' | 'estimatedMinutes' | 'subjectId' | 'completed'>>,
    ) => {
      commitLocalMutation((prev) => {
        const now = Date.now();
        return {
          ...prev,
          checklistItems: prev.checklistItems.map((c) =>
            c.id === itemId ? { ...c, ...patch, updatedAt: now } : c,
          ),
          studyBlocks:
            patch.completed !== undefined
              ? prev.studyBlocks.map((b) =>
                  b.checklistItemId === itemId
                    ? { ...b, completed: patch.completed as boolean, updatedAt: now }
                    : b,
                )
              : prev.studyBlocks,
        };
      });
    },
    [commitLocalMutation],
  );

  const deleteChecklistItem = useCallback(
    (itemId: string) => {
      commitLocalMutation((prev) => {
        const now = Date.now();
        return {
          ...prev,
          tombstones: { ...(prev.tombstones ?? {}), [itemId]: now },
          checklistItems: prev.checklistItems.filter((c) => c.id !== itemId),
          studyBlocks: prev.studyBlocks.map((b) =>
            b.checklistItemId === itemId
              ? { ...b, checklistItemId: undefined, updatedAt: now }
              : b,
          ),
        };
      });
    },
    [commitLocalMutation],
  );

  const addSubject = useCallback(
    (input: {
      name: string;
      colorKey: PastelColorKey;
      examDate: string;
      examPeriod: string;
      examStart: string;
      examEnd: string;
    }) => {
      const cleanName = input.name.trim();
      if (!cleanName) return;
      commitLocalMutation((prev) => {
        const now = Date.now();
        const maxOrder = prev.subjects.reduce((m, s) => Math.max(m, s.order), -1);
        const subject: Subject = {
          id: makeId('subj'),
          name: cleanName,
          colorKey: input.colorKey,
          examDate: input.examDate,
          examPeriod: input.examPeriod.trim(),
          examStart: input.examStart,
          examEnd: input.examEnd,
          order: maxOrder + 1,
          updatedAt: now,
        };
        return {
          ...prev,
          subjects: [...prev.subjects, subject],
        };
      });
    },
    [commitLocalMutation],
  );

  const updateSubject = useCallback(
    (
      subjectId: string,
      patch: Partial<
        Pick<Subject, 'name' | 'colorKey' | 'examDate' | 'examPeriod' | 'examStart' | 'examEnd'>
      >,
    ) => {
      commitLocalMutation((prev) => {
        const now = Date.now();
        return {
          ...prev,
          subjects: prev.subjects.map((s) =>
            s.id === subjectId ? { ...s, ...patch, updatedAt: now } : s,
          ),
        };
      });
    },
    [commitLocalMutation],
  );

  const deleteSubject = useCallback(
    (subjectId: string) => {
      commitLocalMutation((prev) => {
        const now = Date.now();
        const nextTombstones: Record<string, number> = {
          ...(prev.tombstones ?? {}),
          [subjectId]: now,
        };
        for (const c of prev.checklistItems) {
          if (c.subjectId === subjectId) nextTombstones[c.id] = now;
        }
        for (const b of prev.studyBlocks) {
          if (b.subjectId === subjectId) nextTombstones[b.id] = now;
        }
        return {
          ...prev,
          tombstones: nextTombstones,
          subjects: prev.subjects.filter((s) => s.id !== subjectId),
          checklistItems: prev.checklistItems.filter((c) => c.subjectId !== subjectId),
          studyBlocks: prev.studyBlocks.filter((b) => b.subjectId !== subjectId),
        };
      });
    },
    [commitLocalMutation],
  );

  const toggleStudyBlock = useCallback(
    (blockId: string) => {
      commitLocalMutation((prev) => {
        const now = Date.now();
        const target = prev.studyBlocks.find((b) => b.id === blockId);
        if (!target) return prev;
        const nextCompleted = !target.completed;

        const nextBlocks = prev.studyBlocks.map((b) =>
          b.id === blockId ? { ...b, completed: nextCompleted, updatedAt: now } : b,
        );

        let nextChecklist = prev.checklistItems;
        if (target.checklistItemId) {
          const linkedId = target.checklistItemId;
          const anyOtherCompleted = nextBlocks.some(
            (b) => b.checklistItemId === linkedId && b.completed,
          );
          const shouldBeCompleted = nextCompleted || anyOtherCompleted;
          nextChecklist = prev.checklistItems.map((c) =>
            c.id === linkedId ? { ...c, completed: shouldBeCompleted, updatedAt: now } : c,
          );
        }

        return {
          ...prev,
          studyBlocks: nextBlocks,
          checklistItems: nextChecklist,
        };
      });
    },
    [commitLocalMutation],
  );

  const addStudyBlock = useCallback(
    (input: Omit<StudyBlock, 'id' | 'updatedAt'>) => {
      commitLocalMutation((prev) => {
        const now = Date.now();
        const block: StudyBlock = {
          ...input,
          id: makeId('blk'),
          updatedAt: now,
        };
        return {
          ...prev,
          studyBlocks: [...prev.studyBlocks, block].sort((a, b) =>
            a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
          ),
        };
      });
    },
    [commitLocalMutation],
  );

  const updateStudyBlock = useCallback(
    (
      blockId: string,
      patch: Partial<
        Pick<
          StudyBlock,
          'date' | 'startTime' | 'endTime' | 'subjectId' | 'checklistItemId' | 'title' | 'completed'
        >
      >,
    ) => {
      commitLocalMutation((prev) => {
        const now = Date.now();
        return {
          ...prev,
          studyBlocks: prev.studyBlocks
            .map((b) => (b.id === blockId ? { ...b, ...patch, updatedAt: now } : b))
            .sort((a, b) =>
              a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
            ),
        };
      });
    },
    [commitLocalMutation],
  );

  const deleteStudyBlock = useCallback(
    (blockId: string) => {
      commitLocalMutation((prev) => {
        const now = Date.now();
        return {
          ...prev,
          tombstones: { ...(prev.tombstones ?? {}), [blockId]: now },
          studyBlocks: prev.studyBlocks.filter((b) => b.id !== blockId),
        };
      });
    },
    [commitLocalMutation],
  );

  const replaceStudyBlocksFromAi = useCallback(
    (nextBlocks: StudyBlock[]) => {
      commitLocalMutation((prev) => {
        const now = Date.now();
        const nextIds = new Set(nextBlocks.map((b) => b.id));
        const nextTombstones = { ...(prev.tombstones ?? {}) };
        for (const existing of prev.studyBlocks) {
          if (!nextIds.has(existing.id)) {
            nextTombstones[existing.id] = now;
          }
        }
        return {
          ...prev,
          tombstones: nextTombstones,
          studyBlocks: nextBlocks,
        };
      });
    },
    [commitLocalMutation],
  );

  const updateWeeklyRule = useCallback(
    (rule: WeeklyRule) => {
      commitLocalMutation((prev) => ({
        ...prev,
        weeklyRules: prev.weeklyRules.map((r) =>
          r.dayOfWeek === rule.dayOfWeek ? rule : r,
        ),
      }));
    },
    [commitLocalMutation],
  );

  const upsertDateOverride = useCallback(
    (override: Omit<DateOverride, 'updatedAt'>) => {
      commitLocalMutation((prev) => {
        const now = Date.now();
        const exists = prev.dateOverrides.some((o) => o.id === override.id);
        const full: DateOverride = { ...override, updatedAt: now };
        const nextOverrides = exists
          ? prev.dateOverrides.map((o) => (o.id === override.id ? full : o))
          : [...prev.dateOverrides, full];
        return {
          ...prev,
          dateOverrides: nextOverrides.sort((a, b) => a.date.localeCompare(b.date)),
        };
      });
    },
    [commitLocalMutation],
  );

  const deleteDateOverride = useCallback(
    (overrideId: string) => {
      commitLocalMutation((prev) => {
        const now = Date.now();
        return {
          ...prev,
          tombstones: { ...(prev.tombstones ?? {}), [overrideId]: now },
          dateOverrides: prev.dateOverrides.filter((o) => o.id !== overrideId),
        };
      });
    },
    [commitLocalMutation],
  );

  const resetToPresets = useCallback(() => {
    commitLocalMutation(() => {
      const fresh = createInitialPlannerState();
      return {
        ...fresh,
        hasLocalEdits: true,
        updatedAt: Date.now(),
      };
    });
  }, [commitLocalMutation]);

  const value = useMemo<PlannerContextValue>(
    () => ({
      state,
      user,
      authLoading,
      syncStatus,
      syncError,
      firebaseEnabled: isFirebaseConfigured,
      geminiApiKey,
      geminiModel,
      setGeminiSettings,
      loginWithGoogle,
      logoutGoogle,
      toggleChecklistItem,
      addChecklistItem,
      updateChecklistItem,
      deleteChecklistItem,
      addSubject,
      updateSubject,
      deleteSubject,
      toggleStudyBlock,
      addStudyBlock,
      updateStudyBlock,
      deleteStudyBlock,
      replaceStudyBlocksFromAi,
      updateWeeklyRule,
      upsertDateOverride,
      deleteDateOverride,
      resetToPresets,
    }),
    [
      state,
      user,
      authLoading,
      syncStatus,
      syncError,
      geminiApiKey,
      geminiModel,
      setGeminiSettings,
      loginWithGoogle,
      logoutGoogle,
      toggleChecklistItem,
      addChecklistItem,
      updateChecklistItem,
      deleteChecklistItem,
      addSubject,
      updateSubject,
      deleteSubject,
      toggleStudyBlock,
      addStudyBlock,
      updateStudyBlock,
      deleteStudyBlock,
      replaceStudyBlocksFromAi,
      updateWeeklyRule,
      upsertDateOverride,
      deleteDateOverride,
      resetToPresets,
    ],
  );

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
};

export function usePlanner(): PlannerContextValue {
  const ctx = useContext(PlannerContext);
  if (!ctx) throw new Error('usePlanner must be used inside PlannerProvider');
  return ctx;
}
