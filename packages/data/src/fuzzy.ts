/** Small fuzzy scorer: token prefix/substring beats subsequence. Higher is better, 0 = no match. */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const t = text.toLowerCase();
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800;
  const tokens = q.split(/\s+/).filter(Boolean);
  let total = 0;
  for (const tok of tokens) {
    const idx = t.indexOf(tok);
    if (idx >= 0) {
      total += (idx === 0 || t[idx - 1] === ' ' ? 200 : 120) - Math.min(idx, 50);
      continue;
    }
    let ti = 0;
    let hits = 0;
    for (const ch of tok) {
      const f = t.indexOf(ch, ti);
      if (f < 0) return 0;
      ti = f + 1;
      hits++;
    }
    total += hits * 4;
  }
  return total;
}

export function fuzzyFilter<T>(list: T[], query: string, pick: (x: T) => string[], limit = 50): T[] {
  if (!query.trim()) return list.slice(0, limit);
  return list
    .map((x) => ({ x, s: Math.max(...pick(x).map((p) => fuzzyScore(query, p))) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((r) => r.x);
}
