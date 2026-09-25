import { countdownParts } from '@zemi/shared';

/** 1.2 MB, 830 KB, 12 B */
export function formatBytes(bytes: number | null | undefined, digits = 1): string {
  if (bytes == null || !Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(digits).replace(/\.0$/, '')} ${units[i]}`;
}

/** 1:02:03 or 4:05 */
export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '';
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "just now", "5 min ago", "in 3 days" */
export function formatRelative(date: string | number | Date, now: Date = new Date()): string {
  const t = new Date(date).getTime();
  const diffSec = Math.round((t - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute').replace('minutes', 'min').replace('minute', 'min');
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86_400 * 30) return rtf.format(Math.round(diffSec / 86_400), 'day');
  if (abs < 86_400 * 365) return rtf.format(Math.round(diffSec / (86_400 * 30)), 'month');
  return rtf.format(Math.round(diffSec / (86_400 * 365)), 'year');
}

/** Compact countdown: "6d 4h", "3h 12m", "4m 09s". Empty when past. */
export function formatCountdown(target: string | number | Date, now: Date = new Date()): string {
  const p = countdownParts(target, now);
  if (p.totalMs <= 0) return '';
  if (p.days > 0) return `${p.days}d ${p.hours}h`;
  if (p.hours > 0) return `${p.hours}h ${p.minutes}m`;
  return `${p.minutes}m ${String(p.seconds).padStart(2, '0')}s`;
}

/** 1,234 */
export function formatNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  return n.toLocaleString('en-US');
}

/** 12.5% (signed when `signed`). */
export function formatPercent(fraction: number, opts: { signed?: boolean; digits?: number } = {}): string {
  const v = fraction * 100;
  const s = `${Math.abs(v).toFixed(opts.digits ?? (Math.abs(v) < 10 ? 1 : 0)).replace(/\.0$/, '')}%`;
  if (!opts.signed) return v < 0 ? `-${s}` : s;
  return v > 0 ? `+${s}` : v < 0 ? `-${s}` : s;
}
