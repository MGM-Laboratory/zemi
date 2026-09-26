import { randomBytes } from 'node:crypto';
import { formatJakarta, jakartaDateInput, fromJakartaInput } from '@zemi/shared';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { randomFromAlphabet } from '../../common/crypto.js';

/**
 * Pure registration rules shared by the public form, the admin tools and (hopefully) the events
 * teammate's `EventDetail.registration`, so "is registration open?" has one answer everywhere.
 */

/** No 0/O/1/I: codes get read out loud and typed by hand at the door. */
export const TICKET_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const TICKET_CODE_PATTERN = /^ZM-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

export const newTicketCode = (): string => `ZM-${randomFromAlphabet(TICKET_ALPHABET, 6)}`;
/** 128-bit random token, base64url (22 chars). The ticket link, the QR payload. */
export const newQrToken = (): string => randomBytes(16).toString('base64url');

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export type PhoneResult = { ok: true; value: string } | { ok: false };

const PLAUSIBLE_CHARS = /^[+()\-.\s\d]+$/;

/**
 * Phone to E.164 with Indonesia as the default region. "0812...", "+62 812..." and "62812..." all become
 * "+62812...". Numbers libphonenumber can't validate are kept as typed (trimmed) when they still look like
 * a phone number (6 to 15 digits, only digits, spaces, dots, dashes, parentheses and a plus).
 * Empty input is allowed (admin adds) and stays empty.
 */
export function normalizePhone(raw: string | null | undefined): PhoneResult {
  const input = (raw ?? '').trim();
  if (!input) return { ok: true, value: '' };
  const digits = input.replace(/\D/g, '');
  const candidates = [parsePhoneNumberFromString(input, 'ID')];
  // "62812..." typed without the plus reads as a local number; try it as international too.
  if (!input.startsWith('+') && !input.startsWith('0') && digits.startsWith('62')) {
    candidates.unshift(parsePhoneNumberFromString(`+${digits}`));
  }
  const valid = candidates.find((c) => c?.isValid());
  if (valid) return { ok: true, value: valid.number };
  if (PLAUSIBLE_CHARS.test(input) && digits.length >= 6 && digits.length <= 15) {
    return { ok: true, value: input.replace(/\s+/g, ' ') };
  }
  return { ok: false };
}

/** Digits only, for "is this the same phone?" comparisons. */
export const phoneDigits = (p: string | null | undefined): string => (p ?? '').replace(/\D/g, '');

export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = phoneDigits(a);
  const db = phoneDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  // Tolerate a local vs international spelling that slipped through unnormalized.
  return da.length >= 8 && db.length >= 8 && da.slice(-9) === db.slice(-9);
}

export interface RegistrationWindowEvent {
  visibility: 'draft' | 'published' | 'unlisted';
  registrationOpen: boolean;
  registrationClosesAt: Date | null;
  capacity: number | null;
  cancelledAt: Date | null;
  startsAt: Date;
  endsAt: Date;
}

export type RegistrationClosedCode =
  | 'not_published'
  | 'event_cancelled'
  | 'event_past'
  | 'registration_closed'
  | 'event_full';

export interface RegistrationWindow {
  open: boolean;
  closesAt: string | null;
  spotsLeft: number | null;
  /** Why it's closed, in plain words (null when open). */
  reason: string | null;
  code: RegistrationClosedCode | null;
}

/**
 * Can a member of the public register right now? `registered` counts active (status registered) seats only.
 * Registration stays open while the event is on (people join the stream late), and closes at `endsAt`.
 */
export function registrationWindow(e: RegistrationWindowEvent, registered: number, now: Date = new Date()): RegistrationWindow {
  const spotsLeft = e.capacity == null ? null : Math.max(0, e.capacity - registered);
  const closesAt = e.registrationClosesAt ? e.registrationClosesAt.toISOString() : null;
  const closed = (code: RegistrationClosedCode, reason: string): RegistrationWindow => ({ open: false, closesAt, spotsLeft, reason, code });
  if (e.visibility === 'draft') return closed('not_published', "This one isn't open yet.");
  if (e.cancelledAt) return closed('event_cancelled', 'This Friday got cancelled, so there is nothing to sign up for.');
  if (now.getTime() >= e.endsAt.getTime()) return closed('event_past', 'This one already wrapped. Catch the next Friday?');
  if (!e.registrationOpen) return closed('registration_closed', 'Registration is closed for this one.');
  if (e.registrationClosesAt && now.getTime() >= e.registrationClosesAt.getTime()) {
    return closed('registration_closed', `Registration closed on ${formatJakarta(e.registrationClosesAt, 'datetime')} WIB.`);
  }
  if (spotsLeft !== null && spotsLeft <= 0) return closed('event_full', "We're full this time. Every seat is taken.");
  return { open: true, closesAt, spotsLeft, reason: null, code: null };
}

/** First word of a name, for "Hi Rina". Falls back to the full name. */
export function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  return first.length >= 2 ? first : fullName.trim();
}

/** "Rina S." style short name for audit summaries and door feeds. */
export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts[0]} ${parts.at(-1)!.slice(0, 1).toUpperCase()}.`;
}

/** 09:00 WIB on the Jakarta calendar day before `startsAt`: when the reminder goes out (SPEC 10). */
export function reminderMoment(startsAt: Date): Date {
  const day = jakartaDateInput(startsAt);
  const dayBefore = new Date(fromJakartaInput(day, '12:00').getTime() - 86_400_000);
  return fromJakartaInput(jakartaDateInput(dayBefore), '09:00');
}

export type LifecycleStage = 'reminder' | 'starting' | 'thanks';

/** When each lifecycle email's window opens for the event's current times. */
export function lifecycleWindowOpens(startsAt: Date, endsAt: Date): Record<LifecycleStage, Date> {
  return {
    reminder: reminderMoment(startsAt),
    starting: new Date(startsAt.getTime() - 10 * 60_000),
    thanks: endsAt,
  };
}

/**
 * How far before a stage's window a `<stage>_sent_at` has to be before it counts as "sent for an earlier
 * schedule". Moving an event to another day shifts every window by 24 hours or more, so the email goes out
 * again. Nudging the time on the same day (starting 20 minutes late, running 30 minutes over) must not send a
 * second "starting now" or thank you email.
 */
export const LIFECYCLE_STALE_MS = 6 * 3_600_000;

/** Sent times before this belong to an earlier schedule. Also the email_logs dedupe cutoff for a re-send. */
export const lifecycleStaleBefore = (windowOpens: Date): Date => new Date(windowOpens.getTime() - LIFECYCLE_STALE_MS);

/** Did this stage already go out for the event's current schedule? */
export function lifecycleStageSent(sentAt: Date | null, windowOpens: Date): boolean {
  return !!sentAt && sentAt.getTime() >= lifecycleStaleBefore(windowOpens).getTime();
}
