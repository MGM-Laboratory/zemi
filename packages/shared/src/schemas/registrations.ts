import { z } from 'zod';
import type { EventStatus } from '../status.js';
import type { ImageRef } from './common.js';

export const ATTENDANCE_MODES = ['in-person', 'online'] as const;
export type AttendanceMode = (typeof ATTENDANCE_MODES)[number];

export const registerInput = z.object({
  fullName: z.string().trim().min(2, 'Tell us your full name.').max(160),
  email: z.email('That email looks off. Mind checking it?').max(254),
  phone: z.string().trim().min(6, 'We need a number we can reach.').max(32),
  attendanceMode: z.enum(ATTENDANCE_MODES).default('in-person'),
  /** Honeypot. Must be empty. */
  website: z.string().max(0).optional(),
});
export type RegisterInput = z.infer<typeof registerInput>;

export interface Ticket {
  token: string;
  code: string;
  fullName: string;
  email: string; // masked for public: r***@gmail.com
  attendanceMode: AttendanceMode;
  status: 'registered' | 'cancelled';
  checkedInAt: string | null;
  createdAt: string;
  qrSvgUrl: string;
  qrPngUrl: string;
  calendarUrl: string;
  ticketUrl: string;
  event: {
    id: string;
    slug: string;
    title: string;
    number: number | null;
    startsAt: string;
    endsAt: string;
    status: EventStatus;
    venue: string | null;
    roomNote: string | null;
    mapsUrl: string | null;
    cover: ImageRef | null;
    accent: string;
  };
}

export interface RegisterResult {
  ticket: Ticket;
  /** true if this email already had a ticket for this event (we re-sent it). */
  existing: boolean;
  emailSent: boolean;
}

export const registrationListQuery = z.object({
  search: z.string().max(200).optional(),
  status: z.enum(['registered', 'cancelled', 'all']).default('registered'),
  checkedIn: z.enum(['yes', 'no', 'all']).default('all'),
  mode: z.enum(['in-person', 'online', 'all']).default('all'),
  source: z.enum(['web', 'admin', 'walk-in', 'import', 'all']).default('all'),
  sort: z.enum(['name', '-name', 'createdAt', '-createdAt', 'checkedInAt', '-checkedInAt']).default('-createdAt'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});
export type RegistrationListQuery = z.infer<typeof registrationListQuery>;

export interface RegistrationRow {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  attendanceMode: AttendanceMode;
  ticketCode: string;
  status: 'registered' | 'cancelled';
  source: 'web' | 'admin' | 'walk-in' | 'import';
  checkedInAt: string | null;
  checkedInBy: string | null;
  checkInMethod: 'qr' | 'manual' | null;
  emailStatus: 'pending' | 'sent' | 'failed' | 'logged' | null;
  notes: string | null;
  createdAt: string;
  /** How many other Zemi events this email registered for. */
  otherEvents: number;
}

export const adminRegistrationInput = z.object({
  fullName: z.string().trim().min(1).max(160),
  email: z.email().max(254),
  phone: z.string().trim().max(32).optional().default(''),
  attendanceMode: z.enum(ATTENDANCE_MODES).default('in-person'),
  source: z.enum(['admin', 'walk-in']).default('admin'),
  checkIn: z.boolean().default(false),
  sendEmail: z.boolean().default(true),
  notes: z.string().max(1000).optional().nullable(),
});

export const registrationUpdateInput = z.object({
  fullName: z.string().trim().min(1).max(160).optional(),
  email: z.email().max(254).optional(),
  phone: z.string().trim().max(32).optional(),
  attendanceMode: z.enum(ATTENDANCE_MODES).optional(),
  status: z.enum(['registered', 'cancelled']).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

export const bulkRegistrationInput = z.object({
  ids: z.array(z.uuid()).min(1).max(2000),
  action: z.enum(['resend', 'cancel', 'restore', 'check-in', 'undo-check-in', 'delete']),
});

export interface RegistrationStats {
  total: number;
  cancelled: number;
  checkedIn: number;
  inPerson: number;
  online: number;
  /** Check-ins among in-person registrations (walk-ins included). */
  checkedInInPerson: number;
  /** Check-ins among online registrations (they turned up in the room after all). */
  checkedInOnline: number;
  capacity: number | null;
  walkIns: number;
  returning: number; // registered for at least one earlier event
  firstTimers: number;
  /** Cumulative registrations by day (Jakarta date). */
  timeline: Array<{ date: string; count: number; cumulative: number }>;
  /** Check-ins per 5 minutes on the event day. */
  arrivals: Array<{ time: string; count: number }>;
  /** Registrations by hour of day (0-23, Jakarta), for "when do people sign up". */
  byHour: Array<{ hour: number; count: number }>;
  /** Top email domains. */
  domains: Array<{ domain: string; count: number }>;
  sources: Array<{ source: string; count: number }>;
}

export const scanInput = z.object({
  payload: z.string().min(4).max(2048),
  device: z.string().max(80).optional(),
});

export type ScanOutcome = 'checked-in' | 'already' | 'wrong-event' | 'cancelled' | 'not-found';
export interface ScanResult {
  outcome: ScanOutcome;
  message: string;
  registration: {
    id: string;
    fullName: string;
    ticketCode: string;
    attendanceMode: AttendanceMode;
    checkedInAt: string | null;
    checkedInBy: string | null;
  } | null;
  /** When outcome is wrong-event: which event this ticket belongs to. */
  otherEvent: { id: string; title: string; startsAt: string } | null;
  counts: { checkedIn: number; registered: number };
}

export interface CheckinFeedItem {
  id: string;
  registrationId: string;
  fullName: string;
  ticketCode: string;
  action: 'check-in' | 'undo';
  method: 'qr' | 'manual';
  actorName: string;
  /** Who did it (admin id, or 'superadmin'). Null for rows saved before we kept it. */
  actorId?: string | null;
  device: string | null;
  createdAt: string;
}

export interface AttendanceSummary {
  registered: number;
  checkedIn: number;
  inPersonRegistered: number;
  walkIns: number;
  arrivals: Array<{ time: string; count: number }>;
  recent: CheckinFeedItem[];
}

export interface RosterRow {
  id: string;
  fullName: string;
  ticketCode: string;
  maskedEmail: string;
  maskedPhone: string;
  attendanceMode: AttendanceMode;
  checkedInAt: string | null;
}

export const broadcastInput = z.object({
  subject: z.string().min(1).max(200),
  html: z.string().min(1).max(100_000),
  audience: z.enum(['all', 'in-person', 'online', 'checked-in', 'not-checked-in']).default('all'),
  testEmail: z.email().optional(),
});

export interface EmailLogRow {
  id: string;
  to: string;
  template: string;
  subject: string;
  status: 'sent' | 'failed' | 'logged';
  error: string | null;
  createdAt: string;
}

export interface AudienceRow {
  email: string;
  fullName: string;
  phone: string | null;
  registrations: number;
  attended: number;
  firstSeen: string;
  lastSeen: string;
  events: Array<{ id: string; title: string; startsAt: string; checkedIn: boolean }>;
}

/* ---------------------------------------------------------------- api-people additions (additive) */

/** Seat and door counts pushed with every scan, check-in, undo, walk-in and cancel. */
export interface AttendanceCounts {
  registered: number;
  checkedIn: number;
  inPersonRegistered: number;
  walkIns: number;
}

/**
 * Messages on GET /admin/events/:id/attendance/stream (SSE, JSON in `data`).
 * Principals with only `attendance.scan` get `item` only for their own scans (null otherwise), and
 * `snapshot.summary.recent` holds only their own scans.
 */
export type AttendanceStreamMessage =
  | { type: 'snapshot'; summary: AttendanceSummary; counts: AttendanceCounts }
  | { type: 'checkin'; item: CheckinFeedItem | null; counts: AttendanceCounts }
  | { type: 'counts'; counts: AttendanceCounts }
  | { type: 'ping'; t: string };

/** POST /admin/registrations/:id/check-in | undo-check-in. `changed: false` when it was already in that state. */
export interface CheckinResult {
  changed: boolean;
  message: string;
  registration: RosterRow;
  item: CheckinFeedItem | null;
  counts: AttendanceCounts;
}

/** GET /admin/events/:id/attendance/roster */
export const rosterQuery = z.object({
  search: z.string().max(200).optional(),
  checkedIn: z.enum(['yes', 'no', 'all']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(200),
});

/** GET /admin/audience */
export const audienceQuery = z.object({
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** GET /admin/events/:id/registrations/export (same filters as the list, no paging). */
export const registrationExportQuery = z.object({
  format: z.enum(['csv', 'xlsx']).default('xlsx'),
  search: z.string().max(200).optional(),
  status: z.enum(['registered', 'cancelled', 'all']).default('all'),
  checkedIn: z.enum(['yes', 'no', 'all']).default('all'),
  mode: z.enum(['in-person', 'online', 'all']).default('all'),
  source: z.enum(['web', 'admin', 'walk-in', 'import', 'all']).default('all'),
  sort: z.enum(['name', '-name', 'createdAt', '-createdAt', 'checkedInAt', '-checkedInAt']).default('name'),
});

/** GET /admin/events/:id/attendance-sheet.pdf */
export const attendanceSheetQuery = z.object({
  sort: z.enum(['name', 'registered']).default('name'),
  blankRows: z.coerce.number().int().min(0).max(100).default(10),
  mode: z.enum(['all', 'in-person']).default('all'),
});

/** POST /admin/events/:id/registrations/bulk */
export interface BulkRegistrationResult {
  action: z.infer<typeof bulkRegistrationInput>['action'];
  requested: number;
  /** Rows that actually changed (or got an email). */
  affected: number;
  /** Not in this event, or already in the target state. */
  skipped: number;
  emails: { sent: number; logged: number; failed: number } | null;
  counts: AttendanceCounts;
}

/** POST /admin/events/:id/broadcast */
export interface BroadcastResult {
  test: boolean;
  audience: z.infer<typeof broadcastInput>['audience'];
  recipients: number;
  sent: number;
  logged: number;
  failed: number;
}

/** GET /admin/events/:id/emails */
export const emailLogQuery = z.object({
  template: z.string().max(100).optional(),
  status: z.enum(['sent', 'failed', 'logged', 'all']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

/** POST /admin/registrations/:id/resend */
export interface ResendResult {
  status: 'sent' | 'failed' | 'logged';
  emailStatus: 'pending' | 'sent' | 'failed' | 'logged' | null;
}

/**
 * Public POST /public/events/:id/registrations returns 409 `already_registered` with these details when
 * the email already has an active seat but the phone doesn't match (we re-send the ticket to the email
 * instead of handing it to whoever typed the address). With a matching phone it returns 200 `existing: true`.
 */
export interface AlreadyRegisteredDetails {
  email: string; // masked
  emailSent: boolean;
}
