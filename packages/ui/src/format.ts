// Display formatting only. No business rules.

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 12-hour time: "2:32 PM". */
export function formatTime(d: Date): string {
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(d.getMinutes())} ${h < 12 ? "AM" : "PM"}`;
}

/** "Thu 05 Nov 2026  2:32 PM" */
export function formatDateTime(d: Date): string {
  return `${DAYS[d.getDay()]} ${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}  ${formatTime(d)}`;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export interface BackupText {
  text: string;
  level: "normal" | "warn" | "danger";
}

/** Status bar backup segment. `configured=false` is the Step 3 state before backups exist. */
export function formatBackup(configured: boolean, lastBackupAt: string | null, now: Date): BackupText {
  if (!configured) return { text: "Backup: not set up yet", level: "normal" };
  if (lastBackupAt === null) return { text: "Backup: never", level: "danger" };
  const at = new Date(lastBackupAt);
  if (Number.isNaN(at.getTime())) return { text: "Backup: never", level: "danger" };
  const ageMs = now.getTime() - at.getTime();
  const DAY = 24 * 60 * 60 * 1000;
  if (ageMs >= DAY) {
    const days = Math.floor(ageMs / DAY);
    return { text: `Backup: ${days} day${days === 1 ? "" : "s"} ago`, level: "warn" };
  }
  const dayDiff = Math.round((startOfDay(now) - startOfDay(at)) / DAY);
  if (dayDiff <= 0) return { text: `Backup: Today ${formatTime(at)}`, level: "normal" };
  if (dayDiff === 1) return { text: `Backup: Yesterday ${formatTime(at)}`, level: "normal" };
  return { text: `Backup: ${at.getDate()} ${MONTHS[at.getMonth()]} ${formatTime(at)}`, level: "normal" };
}

/** Integer paise to "₹1,23,456.00" (Indian grouping). */
export function formatPaise(paise: number): string {
  const negative = paise < 0;
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const s = String(rupees);
  let grouped = s;
  if (s.length > 3) {
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    grouped = `${rest},${last3}`;
  }
  return `${negative ? "-" : ""}₹${grouped}.${pad2(p)}`;
}

export function digitsOnly(s: string): string {
  return s.replace(/\D+/g, "");
}
