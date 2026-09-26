import type { QueryClient } from '@tanstack/react-query';
import type { AttendanceMode, RegistrationRow } from '@zemi/shared';
import { adminKeys } from '@/lib/admin/query-keys';

/**
 * Shared bits for the people area (registrations, attendance, emails, audience). Pure, server safe.
 */

/* ------------------------------------------------------------------ query keys */

/** Everything people-related for one event lives under the event detail key, so one invalidate refreshes it all. */
export const peopleKeys = {
  list: (id: string, params?: Record<string, unknown>) => adminKeys.events.part(id, 'registrations', params),
  lists: (id: string) => adminKeys.events.part(id, 'registrations'),
  stats: (id: string) => adminKeys.events.part(id, 'registration-stats'),
  attendance: (id: string) => adminKeys.events.part(id, 'attendance'),
  roster: (id: string, params?: Record<string, unknown>) => adminKeys.events.part(id, 'roster', params),
  emails: (id: string, params?: Record<string, unknown>) => adminKeys.events.part(id, 'emails', params),
  audience: (params?: Record<string, unknown>) => adminKeys.audience.list(params),
};

/** After any registration or check-in change: the event (header counts), every people part, and the audience. */
export function invalidatePeople(qc: QueryClient, eventId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: adminKeys.events.detail(eventId) }),
    qc.invalidateQueries({ queryKey: adminKeys.events.lists() }),
    qc.invalidateQueries({ queryKey: adminKeys.audience.all }),
    qc.invalidateQueries({ queryKey: adminKeys.overview() }),
  ]);
}

/* ------------------------------------------------------------------ labels */

export const MODE_LABEL: Record<AttendanceMode, string> = { 'in-person': 'In person', online: 'Online' };

export type RegistrationSource = RegistrationRow['source'];
export const SOURCE_LABEL: Record<RegistrationSource, string> = {
  web: 'Website',
  admin: 'Added by admin',
  'walk-in': 'Walk-in',
  import: 'Imported',
};

export const EMAIL_STATUS_LABEL: Record<NonNullable<RegistrationRow['emailStatus']>, string> = {
  pending: 'Sending',
  sent: 'Delivered to Resend',
  logged: 'Logged (dev outbox)',
  failed: 'Failed',
};

/* ------------------------------------------------------------------ chart colors */

/**
 * Chart colors, validated with the dataviz palette checker on the white surface:
 * - single series: brand blue (one hue for every bar, never ranked by value)
 * - check-ins: brand green (the admin's "checked in" color everywhere)
 * - two-part splits: blue then green (CVD 19.1, normal-vision 20.9: pass)
 * - sources (up to four parts): blue, green, yellow-600, red-600 in that fixed order
 *   (worst adjacent CVD 15.0, normal-vision 20.9: pass). Yellow-600 is under 3:1 on white,
 *   so every source segment is direct-labeled and the card has a table view.
 */
export const CHART = {
  blue: '#3a6dc5',
  green: '#0f8657',
  grid: 'var(--color-line)',
  axis: 'var(--color-line-strong)',
  tick: 'var(--color-ink-3)',
} as const;

export const SOURCE_COLOR: Record<string, string> = {
  web: '#3a6dc5',
  admin: '#0f8657',
  'walk-in': '#d99e12',
  import: '#d92f2f',
};
export const SOURCE_ORDER = ['web', 'admin', 'walk-in', 'import'] as const;

/* ------------------------------------------------------------------ list params */

export const STATUS_FILTERS = ['registered', 'cancelled', 'all'] as const;
export const CHECKED_FILTERS = ['all', 'yes', 'no'] as const;
export const MODE_FILTERS = ['all', 'in-person', 'online'] as const;
export const SOURCE_FILTERS = ['all', 'web', 'admin', 'walk-in', 'import'] as const;
export const SORTS = ['name', '-name', 'createdAt', '-createdAt', 'checkedInAt', '-checkedInAt'] as const;
export type RegistrationSort = (typeof SORTS)[number];

/** DataTable column id to API sort field. */
export const SORT_FIELD: Record<string, 'name' | 'createdAt' | 'checkedInAt'> = {
  fullName: 'name',
  createdAt: 'createdAt',
  checkedInAt: 'checkedInAt',
};

export function sortToState(sort: RegistrationSort): Array<{ id: string; desc: boolean }> {
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  const id = field === 'name' ? 'fullName' : field;
  return [{ id, desc }];
}

export function stateToSort(state: Array<{ id: string; desc: boolean }>, fallback: RegistrationSort = '-createdAt'): RegistrationSort {
  const s = state[0];
  if (!s) return fallback;
  const field = SORT_FIELD[s.id];
  if (!field) return fallback;
  return (s.desc ? `-${field}` : field) as RegistrationSort;
}

/* ------------------------------------------------------------------ misc */

export const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;

/** "Rina S." (how people show up in summaries and toasts). */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? full;
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}

/** wa.me link for a phone in E.164 (Indonesia mostly), or null when it does not look like one. */
export function whatsappUrl(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}`;
}

/** Pretty +62 812 3456 7890 grouping for E.164 Indonesian numbers; others unchanged. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const m = phone.match(/^\+62(\d{3})(\d{3,4})(\d{3,5})$/);
  if (m) return `+62 ${m[1]} ${m[2]} ${m[3]}`;
  return phone;
}

/* ------------------------------------------------------------------ CSV (client side) */

/** One CSV cell: quoted, with a formula-injection guard that keeps +62 phone numbers intact. */
export function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value);
  if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-]?[\d\s()-]+$/.test(s))) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** UTF-8 BOM + CRLF, so Excel opens it with the right encoding. */
export function toCsv(header: string[], rows: unknown[][]): string {
  return `﻿${[header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Start a download from a same-origin GET URL (the API sends Content-Disposition). */
export function downloadUrl(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  a.setAttribute('download', '');
  document.body.appendChild(a);
  a.click();
  a.remove();
}
