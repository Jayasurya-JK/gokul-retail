/** Amounts in words in the Indian system (crore, lakh, thousand), same as `invoice::amount_in_words` in the Rust core. */
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const below100 = (n: number): string => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const below1000 = (n: number): string => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : '', n % 100 ? below100(n % 100) : ''].filter(Boolean).join(' ');

export function wordsIndian(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  let rest = n;
  for (const [div, name] of [[10_000_000, 'Crore'], [100_000, 'Lakh'], [1000, 'Thousand']] as const) {
    const q = Math.floor(rest / div);
    rest %= div;
    if (q > 0) parts.push(`${q >= 100 && name === 'Crore' ? wordsIndian(q) : below100(q)} ${name}`);
  }
  if (rest > 0) parts.push(below1000(rest));
  return parts.join(' ');
}

/** 123456 paise -> "Rupees One Thousand Two Hundred Thirty Four and Fifty Six Paise Only" */
export function amountInWords(paise: number): string {
  const neg = paise < 0;
  const p = Math.abs(Math.round(paise));
  const rupees = Math.floor(p / 100);
  const ps = p % 100;
  return `${neg ? 'Minus ' : ''}Rupees ${wordsIndian(rupees)}${ps > 0 ? ` and ${below100(ps)} Paise` : ''} Only`;
}
