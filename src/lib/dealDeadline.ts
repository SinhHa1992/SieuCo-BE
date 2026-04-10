/**
 * Mirrors mobile timeline parsing: created_at + parsed timeline → deadline.
 * Examples: "3 tháng", "2 tuần", "1 ngày", English month/week/day.
 */
export function parseTimelineToDays(timeline: string): number | null {
  const s = timeline.trim();
  if (!s) return null;
  const m = s
    .toLowerCase()
    .match(/(\d+)\s*(tháng|tuần|ngày|month|week|day)/);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  const unit = m[2] ?? '';
  if (unit.includes('ngày') || unit === 'day') return n;
  if (unit.includes('tuần') || unit === 'week') return n * 7;
  if (unit.includes('tháng') || unit === 'month') return n * 30;
  return null;
}

export function getDealDeadline(createdAt: Date, timeline: string): Date | null {
  const days = parseTimelineToDays(timeline);
  if (days == null) return null;
  return new Date(createdAt.getTime() + days * 86400000);
}

/** Like Dart `until.difference(from).inDays` (truncates toward zero). */
export function differenceInDays(from: Date, until: Date): number {
  const ms = until.getTime() - from.getTime();
  return Math.trunc(ms / 86400000);
}
