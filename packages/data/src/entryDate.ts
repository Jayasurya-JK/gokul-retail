/** Local yyyy-mm-dd. */
export function todayYmd(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The moment an entry belongs to (same rule as `db::entry_time` in Rust): nothing means now, a past day without a time is 20:00,
 * today with a time uses that time, and a future day or time is refused.
 */
export function entryDate(day?: string | null, time?: string | null): Date {
  const now = new Date();
  const d = day?.trim() || '';
  const t = time?.trim() || '';
  if (!d && !t) return now;
  const today = todayYmd(now);
  const dd = d || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dd)) throw new Error('The date looks wrong.');
  if (dd > today) throw new Error('The date cannot be in the future.');
  if (!t && dd === today) return now;
  if (t && !/^\d{2}:\d{2}$/.test(t)) throw new Error('The time looks wrong.');
  const at = new Date(`${dd}T${t || '20:00'}:00`);
  if (at.getTime() > now.getTime()) throw new Error('The time cannot be in the future.');
  return at;
}
