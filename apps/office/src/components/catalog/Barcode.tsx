import { isValidEan13 } from '@gokul/data';

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** 95 modules of EAN-13 bars as a 0/1 string. */
export function ean13Bits(code: string): string {
  const first = Number(code[0]);
  let bits = '101';
  for (let i = 0; i < 6; i++) {
    const d = Number(code[i + 1]);
    bits += PARITY[first][i] === 'L' ? L[d] : G[d];
  }
  bits += '01010';
  for (let i = 0; i < 6; i++) bits += R[Number(code[i + 7])];
  return bits + '101';
}

/** Fallback for non EAN codes: a stable bar pattern from the digits so the preview still looks right. */
function genericBits(code: string): string {
  let bits = '1011';
  for (const ch of code) bits += L[Number(ch) % 10].slice(0, 6) + '0';
  return bits + '1101';
}

/** Draws bars in currentColor, scaled to the box it is placed in. */
export function Barcode({ code, className, showDigits = true }: { code: string; className?: string; showDigits?: boolean }) {
  const ean = isValidEan13(code);
  const bits = ean ? ean13Bits(code) : genericBits(code);
  const quiet = 9;
  const w = bits.length + quiet * 2;
  const bars: { x: number; w: number }[] = [];
  for (let i = 0; i < bits.length; ) {
    if (bits[i] === '1') {
      let j = i;
      while (bits[j] === '1') j++;
      bars.push({ x: i + quiet, w: j - i });
      i = j;
    } else i++;
  }
  const h = showDigits ? 62 : 52;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className={className} aria-label={`Barcode ${code}`} role="img">
      {bars.map((b) => <rect key={b.x} x={b.x} y={0} width={b.w} height={52} fill="currentColor" />)}
      {showDigits && ean && (
        <g fill="currentColor" fontSize="7.5" fontFamily="Inter, sans-serif" textAnchor="middle">
          <text x={quiet - 4} y={61}>{code[0]}</text>
          <text x={quiet + 3 + 21} y={61} letterSpacing="2.3">{code.slice(1, 7)}</text>
          <text x={quiet + 50 + 21} y={61} letterSpacing="2.3">{code.slice(7)}</text>
        </g>
      )}
    </svg>
  );
}
