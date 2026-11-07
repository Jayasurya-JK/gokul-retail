import type { LabelElement, LabelFieldChoice, LabelPreview } from '@gokul/data';

/** Preview scale: pixels per printer dot (8 dots = 1 mm, so 5.4 px per mm). */
export const PX_PER_DOT = 5.4 / 8;

export const DEFAULT_FIELDS: LabelFieldChoice = {
  shop: false, name: true, mrp: true, price: true, barcode: true, dates: true, batch: false, net: false, legal: false, qr: false,
};

/** The shop's own small sticker: GOKUL, item name, QR of the item code, code, price, Pkd and Exp. */
export const GOKUL_FIELDS: LabelFieldChoice = {
  shop: true, name: true, mrp: false, price: true, barcode: false, dates: true, batch: false, net: false, legal: false, qr: true,
};

/** Printer built-in fonts 1 to 5: character cell width and height in dots (TSPL). */
const FONT: Record<number, [number, number]> = { 1: [8, 12], 2: [12, 20], 3: [16, 24], 4: [24, 32], 5: [32, 48] };

/**
 * One sticker drawn from the same element list that is sent to the printer (see crates/print/src/tspl.rs), in dots.
 * Text cells are stretched to the printer font's cell size, bars and QR modules are the real ones. Black on white because
 * that is what the sticker prints.
 */
export function LabelSvg({ elements, cellW, cellH, scale = PX_PER_DOT }: { elements: LabelElement[]; cellW: number; cellH: number; scale?: number }) {
  return (
    <svg
      width={cellW * scale} height={cellH * scale} viewBox={`0 0 ${cellW} ${cellH}`} role="img" aria-label="Label preview"
      className="shrink-0 rounded-[3px] bg-white shadow-sm ring-1 ring-black/10"
    >
      {elements.map((e, i) => {
        switch (e.k) {
          case 'text': {
            const [fw, fh] = FONT[e.font] ?? FONT[2];
            const len = e.text.length * fw * e.xm;
            return (
              <text
                key={i} x={e.x} y={e.y + fh * e.ym * 0.8} fill="#000" textLength={len} lengthAdjust="spacingAndGlyphs"
                fontFamily="Consolas, 'Courier New', monospace" fontWeight={600} fontSize={fh * e.ym * 0.9} style={{ whiteSpace: 'pre' }}
              >
                {e.text}
              </text>
            );
          }
          case 'barcode':
            return <g key={i} fill="#000">{e.rects.map(([dx, w], k) => <rect key={k} x={e.x + dx} y={e.y} width={w} height={e.h} />)}</g>;
          case 'qr':
            return (
              <g key={i} fill="#000">
                {e.rows.flatMap((row, r) => [...row].map((c, k) => (c === '1' ? <rect key={`${r}-${k}`} x={e.x + k * e.cell} y={e.y + r * e.cell} width={e.cell} height={e.cell} /> : null)))}
              </g>
            );
          case 'bar':
            return <rect key={i} x={e.x} y={e.y} width={e.w} height={e.h} fill="#000" />;
          case 'frame':
            return <rect key={i} x={e.x + e.t / 2} y={e.y + e.t / 2} width={e.w - e.t} height={e.h - e.t} fill="none" stroke="#000" strokeWidth={e.t} />;
        }
      })}
    </svg>
  );
}

/** A piece of the roll: `columns` stickers across, as many rows as needed, with the real gaps. */
export function LabelRoll({ spec, cells }: { spec: NonNullable<LabelPreview['spec']>; cells: LabelElement[][] }) {
  const rows: LabelElement[][][] = [];
  for (let i = 0; i < cells.length; i += spec.columns) rows.push(cells.slice(i, i + spec.columns));
  return (
    <div className="mx-auto flex w-fit flex-col" style={{ gap: spec.gapMm * 5.4 }}>
      {rows.map((row, r) => (
        <div key={r} className="flex" style={{ gap: spec.colGapDots * PX_PER_DOT }}>
          {row.map((els, c) => <LabelSvg key={c} elements={els} cellW={spec.cellW} cellH={spec.cellH} />)}
        </div>
      ))}
    </div>
  );
}
