import { describe, expect, it } from 'vitest';
import { createInitialPlannerState } from '../data/presets';
import type { PlannerState, StudyBlock } from '../types/planner';
import { cleanForFirestore, mergePlannerStates } from './sync';

describe('Cloud/local planner state merge logic', () => {
  it('adopts cloud state when local device has no edits yet', () => {
    const local = createInitialPlannerState();
    const cloud: PlannerState = {
      ...createInitialPlannerState(),
      updatedAt: local.updatedAt + 5000,
      hasLocalEdits: true,
      studyBlocks: [
        {
          id: 'cloud-block-1',
          date: '2026-11-20',
          startTime: '10:00',
          endTime: '12:00',
          subjectId: 'subj-calc1',
          title: '클라우드 블록',
          type: 'study',
          completed: true,
          source: 'manual',
          updatedAt: local.updatedAt + 5000,
        },
      ],
    };

    const merged = mergePlannerStates(local, cloud);
    expect(merged.studyBlocks).toHaveLength(1);
    expect(merged.studyBlocks[0].id).toBe('cloud-block-1');
    expect(merged.hasLocalEdits).toBe(true);
  });

  it('merges concurrent edits by updatedAt and respects deletion tombstones', () => {
    const base = createInitialPlannerState();
    const baseTs = base.updatedAt;
    const firstItem = base.checklistItems[0];
    const secondItem = base.checklistItems[1];

    const localBlock: StudyBlock = {
      id: 'blk-shared',
      date: '2026-11-19',
      startTime: '10:00',
      endTime: '11:30',
      subjectId: 'subj-eng2',
      title: '로컬 수정 제목',
      type: 'study',
      completed: false,
      source: 'manual',
      updatedAt: baseTs + 2000,
    };

    const cloudBlockNewer: StudyBlock = {
      ...localBlock,
      title: '클라우드 최신 제목',
      completed: true,
      updatedAt: baseTs + 3000,
    };

    const deletedBlock: StudyBlock = {
      id: 'blk-deleted',
      date: '2026-11-19',
      startTime: '13:00',
      endTime: '14:00',
      subjectId: 'subj-ethics',
      title: '삭제 예정 블록',
      type: 'study',
      completed: false,
      source: 'manual',
      updatedAt: baseTs + 1500,
    };

    const local: PlannerState = {
      ...base,
      hasLocalEdits: true,
      updatedAt: baseTs + 4000,
      checklistItems: base.checklistItems.map((item) =>
        item.id === firstItem.id ? { ...item, completed: true, updatedAt: baseTs + 4000 } : item,
      ),
      studyBlocks: [localBlock],
      tombstones: {
        'blk-deleted': baseTs + 2500,
      },
    };

    const cloud: PlannerState = {
      ...base,
      hasLocalEdits: true,
      updatedAt: baseTs + 3500,
      checklistItems: base.checklistItems.map((item) =>
        item.id === secondItem.id ? { ...item, completed: true, updatedAt: baseTs + 3500 } : item,
      ),
      studyBlocks: [cloudBlockNewer, deletedBlock],
    };

    const merged = mergePlannerStates(local, cloud);

    const mergedFirst = merged.checklistItems.find((i) => i.id === firstItem.id);
    const mergedSecond = merged.checklistItems.find((i) => i.id === secondItem.id);
    expect(mergedFirst?.completed).toBe(true);
    expect(mergedSecond?.completed).toBe(true);

    // Newer cloud title wins for blk-shared; blk-deleted is excluded by tombstone
    expect(merged.studyBlocks).toHaveLength(1);
    expect(merged.studyBlocks[0].id).toBe('blk-shared');
    expect(merged.studyBlocks[0].title).toBe('클라우드 최신 제목');
    expect(merged.studyBlocks[0].completed).toBe(true);
  });

  it('strips undefined properties before Firestore setDoc serialization', () => {
    const base = createInitialPlannerState();
    const dirty: PlannerState = {
      ...base,
      lastUpdatedBy: undefined,
      studyBlocks: [
        {
          id: 'blk-1',
          date: '2026-11-20',
          startTime: '10:00',
          endTime: '11:00',
          subjectId: 'subj-eng2',
          checklistItemId: undefined,
          title: '직접 복습',
          type: 'study',
          completed: false,
          source: 'manual',
          updatedAt: base.updatedAt,
        },
      ],
    };

    const cleaned = cleanForFirestore(dirty);
    expect('lastUpdatedBy' in cleaned).toBe(false);
    expect('checklistItemId' in cleaned.studyBlocks[0]).toBe(false);
  });
});
