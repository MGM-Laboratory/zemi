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
