const JUNK = new Set(['none', 'null', 'nil', 'na', 'n/a', 'no name', 'noname', 'unknown', 'customer']);

/** True for names that are not a name: empty, only digits or punctuation ("0", ".", "-"), or a placeholder word ("none"). Display only, the stored name is never changed. */
export function isNoName(name: string | null | undefined): boolean {
  const t = (name ?? '').trim().toLowerCase();
  if (!t || JUNK.has(t)) return true;
  return !/[^\u0020-\u0040\u005b-\u0060\u007b-\u007e]/.test(t);
}

/** What screens show for a customer name. */
export const customerLabel = (name: string | null | undefined): string => (isNoName(name) ? 'No name' : (name as string).trim());

/** Named customers first (A to Z), no-name ones after (by mobile). */
export function compareCustomers(a: { name: string; phone: string }, b: { name: string; phone: string }): number {
  const na = isNoName(a.name), nb = isNoName(b.name);
  if (na !== nb) return na ? 1 : -1;
  return na ? a.phone.localeCompare(b.phone) : a.name.trim().localeCompare(b.name.trim(), 'en', { sensitivity: 'base' });
}
