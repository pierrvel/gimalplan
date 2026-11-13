const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function parseTimeToMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function formatMinutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(totalMinutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function getDurationMinutes(startTime: string, endTime: string): number {
  return Math.max(0, parseTimeToMinutes(endTime) - parseTimeToMinutes(startTime));
}

export function formatDurationCompact(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(dateKey: string, delta: number): string {
  const d = parseDateKey(dateKey);
  d.setDate(d.getDate() + delta);
  return toDateKey(d);
}

export function getDayOfWeek(dateKey: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  return parseDateKey(dateKey).getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export function formatDateWithWeekday(dateKey: string): string {
  const d = parseDateKey(dateKey);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekday = KO_WEEKDAYS[d.getDay()];
  return `${month}.${String(day).padStart(2, '0')} (${weekday})`;
}

export function formatShortDate(dateKey: string): string {
  const [, m, d] = dateKey.split('-');
  return `${m}.${d}`;
}

export function getWeekDates(anchorDateKey: string): string[] {
  const d = parseDateKey(anchorDateKey);
  const dow = d.getDay();
  // Monday-start week
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = addDays(anchorDateKey, diffToMonday);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function calculateDDay(targetDateKey: string, referenceDateKey: string): number {
  const target = parseDateKey(targetDateKey);
  const ref = parseDateKey(referenceDateKey);
  target.setHours(0, 0, 0, 0);
  ref.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatDDayLabel(dDay: number): string {
  if (dDay > 0) return `D-${dDay}`;
  if (dDay === 0) return 'D-Day';
  return `D+${Math.abs(dDay)}`;
}

export function getTodayDateKey(): string {
  return toDateKey(new Date());
}

export function enumerateDateRange(startDate: string, endDate: string): string[] {
  const result: string[] = [];
  let cursor = startDate;
  let guard = 0;
  while (cursor <= endDate && guard < 90) {
    result.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return result;
}
