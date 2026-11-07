/** Rupees as a plain number for a spreadsheet: 12050 paise -> "120.50" */
export const rupeesCell = (paise: number) => (paise / 100).toFixed(2);

const esc = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Saves a .csv that opens in Excel (UTF-8 with a byte order mark so Tamil and rupee signs show properly). */
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const text = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
