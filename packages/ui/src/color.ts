/** White text must read on an avatar or badge colour (>= 7:1). A light brand colour is darkened until it does. */
export function darkenForWhite(color: string | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((color ?? '').trim());
  if (!m) return color ?? '#0E4330';
  let [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const ratio = () => 1.05 / (0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) + 0.05);
  for (let i = 0; i < 40 && ratio() < 7; i++) { r *= 0.94; g *= 0.94; b *= 0.94; }
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;
}
