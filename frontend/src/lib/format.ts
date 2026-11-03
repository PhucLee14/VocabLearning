// Locale-aware formatting helpers (no translations needed: Intl knows the units).

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Short interval for rating buttons, e.g. "10 phút", "3 ngày" / "10 min", "3 days". */
export function formatInterval(ms: number, locale: string): string {
  const unit = (value: number, u: 'minute' | 'hour' | 'day' | 'month' | 'year') =>
    new Intl.NumberFormat(locale, { style: 'unit', unit: u, unitDisplay: 'long', maximumFractionDigits: 0 }).format(
      value,
    );
  if (ms < HOUR) return unit(Math.max(1, Math.round(ms / MINUTE)), 'minute');
  if (ms < DAY) return unit(Math.round(ms / HOUR), 'hour');
  if (ms < 30 * DAY) return unit(Math.round(ms / DAY), 'day');
  if (ms < 365 * DAY) return unit(Math.round(ms / (30 * DAY)), 'month');
  return unit(Math.round((ms / (365 * DAY)) * 10) / 10, 'year');
}

/** "ngày mai", "trong 3 ngày", "hôm qua" / "tomorrow", "in 3 days". Minutes/hours when under a day. */
export function formatRelative(date: string | Date, locale: string, now = new Date()): string {
  const diff = new Date(date).getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < HOUR) return rtf.format(Math.round(diff / MINUTE), 'minute');
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), 'hour');
  if (abs < 30 * DAY) return rtf.format(Math.round(diff / DAY), 'day');
  if (abs < 365 * DAY) return rtf.format(Math.round(diff / (30 * DAY)), 'month');
  return rtf.format(Math.round(diff / (365 * DAY)), 'year');
}

/** Study time, e.g. "1 giờ 5 phút" / "1 hr, 5 min". */
export function formatDuration(seconds: number, locale: string): string {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const fmt = (value: number, unit: 'hour' | 'minute') =>
    new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short' }).format(value);
  if (h === 0) return fmt(m, 'minute');
  return m === 0 ? fmt(h, 'hour') : `${fmt(h, 'hour')} ${fmt(m, 'minute')}`;
}

/** "2 thg 11, 2026" / "Nov 2, 2026". `date` may be "YYYY-MM-DD" (a calendar day) or an ISO time. */
export function formatDate(date: string, locale: string, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : new Date(date);
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(date) ? 'UTC' : undefined,
    ...opts,
  }).format(d);
}

export const formatNumber = (n: number, locale: string) => new Intl.NumberFormat(locale).format(n);

/** Initials for an avatar: "Lê Hồng Phúc" → "LP", "Mai" → "M". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** A stable pale hue per person (identity, not data). */
export function avatarHue(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
