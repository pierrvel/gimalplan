import type { ChecklistItem, StudyBlock } from '../types/planner';
import { stripPartSuffix } from './aiScheduler';

export interface PlacementSlot { date: string; startTime: string; endTime: string }
export interface ItemPlacementChange {
  itemId: string;
  title: string;
  subjectId: string;
  before: PlacementSlot[];
  after: PlacementSlot[];
}
export interface PlacementDiff {
  added: ItemPlacementChange[];
  moved: ItemPlacementChange[];
  removed: ItemPlacementChange[];
  unchanged: ItemPlacementChange[];
  unlinkedRemoved: StudyBlock[];
}

function compareSlots(a: PlacementSlot, b: PlacementSlot): number {
  return a.date.localeCompare(b.date)
    || a.startTime.localeCompare(b.startTime)
    || a.endTime.localeCompare(b.endTime);
}

function groupByItem(blocks: StudyBlock[]): Map<string, { slots: PlacementSlot[]; first: StudyBlock }> {
  const map = new Map<string, { slots: PlacementSlot[]; first: StudyBlock }>();
  for (const b of blocks) {
    if (!b.checklistItemId) continue;
    const entry = map.get(b.checklistItemId) ?? { slots: [], first: b };
    entry.slots.push({ date: b.date, startTime: b.startTime, endTime: b.endTime });
    map.set(b.checklistItemId, entry);
  }
  for (const entry of map.values()) entry.slots.sort(compareSlots);
  return map;
}

function sameSlots(a: PlacementSlot[], b: PlacementSlot[]): boolean {
  return a.length === b.length && a.every((s, i) => compareSlots(s, b[i]) === 0);
}

export function diffPlacements(
  before: StudyBlock[],
  after: StudyBlock[],
  items: ChecklistItem[],
): PlacementDiff {
  const itemMap = new Map(items.map(i => [i.id, i]));
  const beforeMap = groupByItem(before);
  const afterMap = groupByItem(after);
  const diff: PlacementDiff = {
    added: [], moved: [], removed: [], unchanged: [],
    unlinkedRemoved: before.filter(b => !b.checklistItemId),
  };

  const ids = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  for (const id of ids) {
    const b = beforeMap.get(id);
    const a = afterMap.get(id);
    const item = itemMap.get(id);
    const sample = (b ?? a)!.first;
    const change: ItemPlacementChange = {
      itemId: id,
      title: item ? item.title : stripPartSuffix(sample.title),
      subjectId: item ? item.subjectId : sample.subjectId,
      before: b?.slots ?? [],
      after: a?.slots ?? [],
    };
    if (!b) diff.added.push(change);
    else if (!a) diff.removed.push(change);
    else if (sameSlots(change.before, change.after)) diff.unchanged.push(change);
    else diff.moved.push(change);
  }
  return diff;
}
