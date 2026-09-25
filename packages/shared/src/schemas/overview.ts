import type { AuditEntry } from './admins.js';
import type { EventAdminRow } from './events.js';

export interface AdminOverview {
  now: string;
  live: EventAdminRow | null;
  next: EventAdminRow | null;
  upcoming: EventAdminRow[];
  recent: EventAdminRow[];
  /** Fridays in the next 8 weeks that have no event yet (Jakarta ISO dates). */
  emptyFridays: string[];
  totals: {
    events: number;
    upcoming: number;
    speakers: number;
    publications: number;
    registrations: number;
    checkIns: number;
    unreadMessages: number | null;
  };
  /** Registrations and attendance for the last 12 past events (only events the principal can see). */
  trend: Array<{ eventId: string; label: string; startsAt: string; registrations: number; checkedIn: number }>;
  activity: AuditEntry[];
}
