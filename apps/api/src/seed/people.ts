import { randomBytes, randomUUID } from 'node:crypto';
import { randomFromAlphabet } from '../common/crypto.js';
import { checkins, registrations } from '../db/schema.js';
import { type SeedCtx, type SeededEvent, email } from './content.js';
import { EMAIL_DOMAINS, FIRST_NAMES, LAST_NAMES, PHONE_PREFIXES } from './data/people.js';
import type { Rng } from './lib/rng.js';
import { days, insertChunked, minutes, wib } from './util.js';

const TICKET_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

interface Person {
  fullName: string;
  email: string;
  phone: string;
  /** Chance to register for any given Friday while active. */
  propensity: number;
  /** Prefers the livestream. */
  onlineBias: number;
  from: number;
  to: number;
}

type RegRow = typeof registrations.$inferInsert & { id: string };

function phone(rng: Rng): string {
  return `+62${rng.pick(PHONE_PREFIXES)}${String(rng.int(0, 99_999_999)).padStart(rng.chance(0.6) ? 8 : 7, '0')}`;
}

function makeEmail(ctx: SeedCtx, rng: Rng, first: string, last: string, used: Set<string>): string {
  const domain = rng.weighted(EMAIL_DOMAINS.map(([d]) => d), EMAIL_DOMAINS.map(([, w]) => w));
  const f = first.toLowerCase().replace(/[^a-z]/g, '');
  const l = last.toLowerCase().replace(/[^a-z]/g, '');
  const academic = domain.endsWith('.ac.id') || domain.endsWith('.go.id');
  const patterns = academic
    ? [`${f}.${l}`, `${f}${l.slice(0, 1)}`, `${f}.${l}${rng.int(1, 9)}`, `${f.slice(0, 1)}${l}`]
    : [`${f}.${l}`, `${f}${l}${rng.int(10, 99)}`, `${f}_${l}`, `${f}${rng.int(90, 2005)}`, `${f}.${l}${rng.int(1, 99)}`];
  let candidate = email(ctx, rng.pick(patterns), domain);
  for (let n = 2; used.has(candidate); n++) candidate = email(ctx, `${f}.${l}${n}`, domain);
  used.add(candidate);
  return candidate;
}

function makePerson(ctx: SeedCtx, rng: Rng, used: Set<string>, usedNames: Set<string>): Omit<Person, 'propensity' | 'onlineBias' | 'from' | 'to'> {
  let first = rng.pick(FIRST_NAMES);
  let last = rng.pick(LAST_NAMES);
  // Some people go by a two-part given name, some by a single name (very Indonesian).
  let fullName = rng.chance(0.25) ? `${first} ${rng.pick(FIRST_NAMES)} ${last}` : rng.chance(0.06) ? first : `${first} ${last}`;
  for (let tries = 0; usedNames.has(fullName) && tries < 5; tries++) {
    first = rng.pick(FIRST_NAMES);
    last = rng.pick(LAST_NAMES);
    fullName = `${first} ${last}`;
  }
  usedNames.add(fullName);
  return { fullName, email: makeEmail(ctx, rng, first, fullName.includes(' ') ? last : String(rng.int(10, 99)), used), phone: phone(rng) };
}

/** Registration time: most people sign up in the last two days, at lunch or late at night. */
function signupTime(rng: Rng, start: Date, earliest: Date, latest: Date): Date {
  const bucket = rng.next();
  const daysBefore = bucket < 0.42 ? rng.float(0.1, 2) : bucket < 0.78 ? rng.float(2, 6) : rng.float(6, 10);
  const hour = rng.weighted([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23], [2, 4, 5, 7, 8, 9, 6, 5, 4, 4, 3, 6, 8, 9, 7, 3]);
  const day = new Date(start.getTime() - days(Math.floor(daysBefore)));
  const iso = new Date(day.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  let t = wib(iso, `${String(hour).padStart(2, '0')}:${String(rng.int(0, 59)).padStart(2, '0')}`, rng.int(0, 59));
  if (t.getTime() >= start.getTime() - minutes(20)) t = new Date(start.getTime() - minutes(rng.int(25, 180)));
  if (t < earliest) t = new Date(earliest.getTime() + minutes(rng.int(5, 600)));
  if (t > latest) t = new Date(latest.getTime() - minutes(rng.int(1, 120)));
  return t;
}

/** Arrivals cluster around 13:12 WIB, with a tail of latecomers up to 13:50. */
function arrival(rng: Rng, date: string): Date {
  const raw = rng.chance(0.12) ? rng.float(22, 50) : rng.normal(12, 7);
  const mins = Math.round(Math.min(50, Math.max(0, raw)));
  return wib(date, `13:${String(mins).padStart(2, '0')}`, mins === 50 ? 0 : rng.int(0, 59));
}

export interface PeopleResult {
  registrations: number;
  checkedIn: number;
  checkins: number;
  poolSize: number;
}

/**
 * Registrations and check-ins. A pool of ~300 regulars (each with a period when they were around and
 * a habit of coming) makes "returning attendees" meaningful; one-off guests fill the rest.
 */
export async function seedRegistrations(ctx: SeedCtx, seeded: SeededEvent[]): Promise<PeopleResult> {
  const rng = ctx.rng.fork('registrations');
  const usedEmails = new Set<string>();
  const usedNames = new Set<string>();
  // The preview extension adds registrations beside existing tickets, so codes must be unique
  // across the whole database, not just this invocation.
  const usedCodes = new Set((await ctx.db.select({ code: registrations.ticketCode }).from(registrations)).map(r => r.code));
  const pastCount = seeded.filter((e) => e.plan.past).length;
  const total = seeded.length;

  const pool: Person[] = Array.from({ length: 300 }, () => {
    const base = makePerson(ctx, rng, usedEmails, usedNames);
    const founding = rng.chance(0.3);
    const from = founding ? rng.int(0, 8) : rng.int(0, Math.max(1, total - 6));
    const stay = rng.int(12, 90);
    const habit = rng.next();
    return {
      ...base,
      propensity: habit < 0.12 ? rng.float(0.6, 0.85) : habit < 0.45 ? rng.float(0.25, 0.45) : rng.float(0.06, 0.18),
      onlineBias: rng.chance(0.12) ? 0.8 : 0.08,
      from,
      to: Math.min(total, from + stay),
    };
  });

  const doorCrew = (date: string) => (date >= '2026-07-01' ? 'Gilang (door crew)' : date >= '2026-03-01' ? 'Tika (door crew, last semester)' : 'Superadmin');
  const devices = ['Door phone (Pixel 6)', 'Door phone (iPhone 12)', 'Desk laptop'];

  const regRows: RegRow[] = [];
  const checkinRows: Array<typeof checkins.$inferInsert> = [];
  let checkedIn = 0;

  for (const ev of seeded) {
    const e = ev.plan;
    const upcoming = !e.past && !e.ongoing;
    if (upcoming && e.visibility === 'draft') continue;

    let target: number;
    if (e.past || e.ongoing) {
      const growth = 34 + 68 * (e.index / Math.max(1, pastCount));
      target = Math.round(Math.min(140, Math.max(25, rng.normal(e.theme.big ? 132 : growth, 16))));
    } else if (e.visibility === 'unlisted') {
      target = rng.int(5, 12);
    } else {
      const k = e.upcomingIndex ?? 0;
      target = e.theme.big ? rng.int(52, 60) : Math.max(5, Math.round(rng.int(44, 60) * Math.pow(0.62, k)));
    }
    // Capacity caps the whole list (in-person and online, see registrationInfo), so stay under it. Past
    // Fridays in small rooms may fill up; upcoming ones keep a few seats so the public sign-up still works.
    // A packed room usually ends a few seats short of full, so only some past Fridays sell out exactly.
    if (ev.capacity && upcoming) target = Math.min(target, Math.max(0, ev.capacity - 4));
    else if (ev.capacity && target >= ev.capacity) {
      const short = rng.chance(0.3) ? 0 : rng.int(1, Math.max(2, Math.round(ev.capacity * 0.2)));
      target = Math.min(ev.capacity, Math.max(25, ev.capacity - short));
    }

    const online = e.mode === 'online';
    const offline = e.mode === 'offline';
    const chosen: Array<{ fullName: string; email: string; phone: string; onlineBias: number }> = [];
    const actives = rng.shuffle(pool.filter((pp) => pp.from <= e.index && e.index <= pp.to));
    for (const person of actives) {
      if (chosen.length >= target) break;
      if (rng.chance(person.propensity)) chosen.push(person);
    }
    while (chosen.length < target) {
      const guest = makePerson(ctx, rng, usedEmails, usedNames);
      chosen.push({ ...guest, onlineBias: 0.12 });
    }

    const earliest = ev.publishedAt ?? new Date(e.startsAt.getTime() - days(10));
    const latest = new Date(Math.min(ctx.now.getTime() - minutes(3), e.startsAt.getTime() - minutes(20)));
    const walkIns = e.past && !e.cancelled && !online ? Math.round(chosen.length * rng.float(0.02, 0.07)) : 0;
    // Decide modes and cancellations first, then pick who showed up: 55% to 90% of the active
    // registrations get checked in (walk-ins always, online people never: nobody scans a livestream).
    const plans = chosen.map((person, i) => {
      const isWalkIn = i >= chosen.length - walkIns;
      const mode: 'in-person' | 'online' = online ? 'online' : offline || isWalkIn ? 'in-person' : rng.chance(person.onlineBias) ? 'online' : 'in-person';
      const cancelled = !isWalkIn && rng.chance(0.045);
      return { person, isWalkIn, mode, cancelled, arrivedAt: arrival(rng, e.date), attends: isWalkIn };
    });
    if (!online && !e.cancelled) {
      const active = plans.filter((x) => !x.cancelled).length;
      const eligible = rng.shuffle(plans.filter((x) => !x.isWalkIn && !x.cancelled && x.mode === 'in-person'));
      const want = Math.max(0, Math.round(active * rng.float(0.55, 0.9)) - walkIns);
      eligible.slice(0, want).forEach((x) => (x.attends = true));
    }

    plans.forEach(({ person, isWalkIn, mode, cancelled, arrivedAt, attends }) => {
      const source = isWalkIn ? 'walk-in' : e.number <= 4 ? 'import' : rng.chance(0.02) ? 'admin' : 'web';
      const createdAt = isWalkIn
        ? arrivedAt
        : upcoming
          ? new Date(earliest.getTime() + rng.next() * Math.max(0, latest.getTime() - earliest.getTime()))
          : signupTime(rng, e.startsAt, earliest, latest);
      const attended = attends && !e.cancelled && !cancelled && mode === 'in-person' && (e.past || arrivedAt < ctx.now);
      const code = uniqueCode(usedCodes);
      const row: RegRow = {
        id: randomUUID(),
        eventId: ev.id,
        fullName: person.fullName,
        email: person.email,
        phone: person.phone,
        attendanceMode: mode,
        ticketCode: code,
        qrToken: randomBytes(16).toString('base64url'),
        status: cancelled ? 'cancelled' : 'registered',
        source,
        checkedInAt: attended ? arrivedAt : null,
        checkedInBy: attended ? (isWalkIn ? 'Gilang (door crew)' : doorCrew(e.date)) : null,
        checkInMethod: attended ? (isWalkIn || rng.chance(0.12) ? 'manual' : 'qr') : null,
        notes: isWalkIn ? 'Walk-in, added at the door.' : null,
        emailStatus: source === 'walk-in' ? 'sent' : rng.chance(0.015) ? 'failed' : 'sent',
        ip: null,
        userAgent: null,
        cancelledAt: cancelled ? new Date(Math.min(e.startsAt.getTime() - minutes(30), createdAt.getTime() + days(rng.float(0.1, 3)))) : null,
        createdAt,
        updatedAt: attended ? arrivedAt : createdAt,
      };
      regRows.push(row);
      if (attended) {
        checkedIn++;
        checkinRows.push({
          registrationId: row.id,
          eventId: ev.id,
          action: 'check-in',
          method: row.checkInMethod!,
          actorName: row.checkedInBy!,
          device: rng.pick(devices),
          createdAt: arrivedAt,
        });
      }
    });
  }

  await insertChunked(ctx.db, registrations, regRows, 400);
  await insertChunked(ctx.db, checkins, checkinRows, 800);
  return { registrations: regRows.length, checkedIn, checkins: checkinRows.length, poolSize: pool.length };
}

/** ZM-XXXXXX from node:crypto (never the seeded PRNG), unique within this run. The table is empty before seeding. */
function uniqueCode(used: Set<string>): string {
  for (;;) {
    const code = `ZM-${randomFromAlphabet(TICKET_ALPHABET, 6)}`;
    if (!used.has(code)) {
      used.add(code);
      return code;
    }
  }
}
