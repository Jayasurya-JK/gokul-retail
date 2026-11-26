const IST = 'Asia/Kolkata';

/** The one time format for every screen and bill: Indian 12-hour clock, lowercase am/pm, always IST (e.g. "4:47 pm"). */
export function clockTime(value: Date | string | number, withSeconds = false): string {
  const d = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit', second: withSeconds ? '2-digit' : undefined, hour12: true }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('hour')}:${get('minute')}${withSeconds ? `:${get('second')}` : ''} ${get('dayPeriod').toLowerCase()}`;
}
