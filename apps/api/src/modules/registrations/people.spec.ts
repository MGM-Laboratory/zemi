import { parseTicketPayload } from '@zemi/shared';
import { describe, expect, it } from 'vitest';
import { personalize, sanitizeBroadcastHtml, textOf } from './broadcast-html.js';
import { buildIcs } from './calendar.js';
import { thanksSubject } from '../mail/templates/event-thanks.js';
import { csvSafe, exportFilename, toCsv, type ExportRow } from './exports.js';
import { ticketQrSvg } from './qr.js';
import { arrivals, byHour, timeline, topDomains } from './registration-stats.js';
import {
  firstName,
  lifecycleStageSent,
  lifecycleStaleBefore,
  lifecycleWindowOpens,
  newQrToken,
  newTicketCode,
  normalizePhone,
  registrationWindow,
  reminderMoment,
  samePhone,
  shortName,
  TICKET_CODE_PATTERN,
} from './registration-rules.js';

describe('ticket codes and tokens', () => {
  it('uses the unambiguous alphabet and parses back', () => {
    for (let i = 0; i < 200; i++) {
      const code = newTicketCode();
      expect(code).toMatch(TICKET_CODE_PATTERN);
      expect(code.slice(3)).not.toMatch(/[01OI]/);
      expect(parseTicketPayload(code.toLowerCase())).toBe(code);
    }
  });

  it('makes 128-bit base64url tokens that the scanner recognizes, raw or inside the short link', () => {
    const t = newQrToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(parseTicketPayload(t)).toBe(t);
    expect(parseTicketPayload(`https://zemi.labmgm.org/t/${t}`)).toBe(t);
    expect(parseTicketPayload(`https://zemi.labmgm.org/tickets/${t}?cancel=1`)).toBe(t);
  });
});

describe('normalizePhone', () => {
  it.each([
    ['081234567890', '+6281234567890'],
    ['+62 812-3456-7890', '+6281234567890'],
    ['62812345678', '+62812345678'],
    ['0274 123456', '+62274123456'],
    ['+1 415 555 2671', '+14155552671'],
  ])('%s -> %s', (raw, e164) => {
    expect(normalizePhone(raw)).toEqual({ ok: true, value: e164 });
  });

  it('keeps plausible but unparsable numbers as typed, rejects junk, allows empty', () => {
    expect(normalizePhone('+999 1234 5678')).toEqual({ ok: true, value: '+999 1234 5678' });
    expect(normalizePhone('call me maybe')).toEqual({ ok: false });
    expect(normalizePhone('12')).toEqual({ ok: false });
    expect(normalizePhone('')).toEqual({ ok: true, value: '' });
  });

  it('compares phones by digits', () => {
    expect(samePhone('+6281234567890', '0812-3456-7890')).toBe(true);
    expect(samePhone('+6281234567890', '+6281299999999')).toBe(false);
    expect(samePhone('', '+62812')).toBe(false);
  });
});

describe('registrationWindow', () => {
  const base = {
    visibility: 'published' as const,
    registrationOpen: true,
    registrationClosesAt: null,
    capacity: 2,
    cancelledAt: null,
    startsAt: new Date('2026-10-02T06:15:00Z'),
    endsAt: new Date('2026-10-02T08:15:00Z'),
  };
  const now = new Date('2026-10-01T00:00:00Z');

  it('is open with spots left', () => {
    expect(registrationWindow(base, 1, now)).toMatchObject({ open: true, spotsLeft: 1, code: null });
  });
  it('closes when full, closed, cancelled, past or draft', () => {
    expect(registrationWindow(base, 2, now)).toMatchObject({ open: false, code: 'event_full', spotsLeft: 0 });
    expect(registrationWindow({ ...base, registrationOpen: false }, 0, now).code).toBe('registration_closed');
    expect(registrationWindow({ ...base, registrationClosesAt: new Date('2026-09-30T00:00:00Z') }, 0, now).code).toBe('registration_closed');
    expect(registrationWindow({ ...base, cancelledAt: now }, 0, now).code).toBe('event_cancelled');
    expect(registrationWindow(base, 0, new Date('2026-10-02T08:15:00Z')).code).toBe('event_past');
    expect(registrationWindow({ ...base, visibility: 'draft' }, 0, now).code).toBe('not_published');
  });
  it('stays open while the event is on (late stream joiners)', () => {
    expect(registrationWindow({ ...base, capacity: null }, 0, new Date('2026-10-02T07:00:00Z')).open).toBe(true);
  });
  it('never uses dashes in reasons', () => {
    const r = registrationWindow({ ...base, registrationClosesAt: new Date('2026-09-30T00:00:00Z') }, 0, now);
    expect(r.reason).not.toMatch(/[–—]/);
  });
});

describe('time helpers (WIB)', () => {
  it('reminder goes out at 09:00 WIB the Jakarta day before', () => {
    // Friday 13:15 WIB -> Thursday 09:00 WIB = 02:00Z.
    expect(reminderMoment(new Date('2026-10-02T06:15:00Z')).toISOString()).toBe('2026-10-01T02:00:00.000Z');
    // Saturday 06:00 WIB (Friday 23:00Z) -> Friday 09:00 WIB.
    expect(reminderMoment(new Date('2026-10-02T23:00:00Z')).toISOString()).toBe('2026-10-02T02:00:00.000Z');
  });

  it('timeline is cumulative by Jakarta day with gaps filled', () => {
    const t = timeline([new Date('2026-09-28T17:30:00Z'), new Date('2026-09-28T18:00:00Z'), new Date('2026-09-30T03:00:00Z')], new Date('2026-09-30T10:00:00Z'));
    expect(t).toEqual([
      { date: '2026-09-29', count: 2, cumulative: 2 },
      { date: '2026-09-30', count: 1, cumulative: 3 },
    ]);
  });

  it('arrivals bucket per 5 minutes in WIB around the start', () => {
    const start = new Date('2026-10-02T06:15:00Z');
    const a = arrivals([new Date('2026-10-02T06:11:00Z'), new Date('2026-10-02T06:14:59Z'), new Date('2026-10-02T06:21:00Z')], start);
    expect(a[0]).toEqual({ time: '12:45', count: 0 });
    expect(a.find((x) => x.time === '13:10')).toEqual({ time: '13:10', count: 2 });
    expect(a.find((x) => x.time === '13:20')).toEqual({ time: '13:20', count: 1 });
    expect(a.at(-1)?.time).toBe('13:45');
    expect(arrivals([], start)).toEqual([]);
  });

  it('byHour and domains', () => {
    const h = byHour([new Date('2026-09-28T01:30:00Z')]);
    expect(h).toHaveLength(24);
    expect(h[8]).toEqual({ hour: 8, count: 1 });
    expect(topDomains(['a@ugm.ac.id', 'b@ugm.ac.id', 'c@gmail.com'])[0]).toEqual({ domain: 'ugm.ac.id', count: 2 });
  });
});

describe('names', () => {
  it('first and short names', () => {
    expect(firstName('Rina Sari')).toBe('Rina');
    expect(shortName('Rina Putri Sari')).toBe('Rina S.');
    expect(shortName('Rina')).toBe('Rina');
  });
});

describe('exports', () => {
  it('guards formula injection but keeps phones readable', () => {
    expect(csvSafe('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(csvSafe('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(csvSafe('+cmd|calc')).toBe(`'+cmd|calc`);
    expect(csvSafe('+62 812-3456-7890')).toBe('+62 812-3456-7890');
    expect(csvSafe('Rina')).toBe('Rina');
  });

  it('writes a BOM, CRLF and quotes', () => {
    const row: ExportRow = {
      fullName: 'Sari, Rina "R"',
      email: 'rina@example.com',
      phone: '+6281234567890',
      attendanceMode: 'in-person',
      ticketCode: 'ZM-7K3F9Q',
      status: 'registered',
      source: 'web',
      checkedInAt: new Date('2026-10-02T06:20:00Z'),
      checkedInBy: 'Door',
      createdAt: new Date('2026-09-28T01:00:00Z'),
      emailStatus: 'sent',
      otherEvents: 2,
      notes: null,
    };
    const buf = toCsv([row]);
    expect([...buf.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = buf.subarray(3).toString('utf8');
    expect(text).toContain('\r\n');
    expect(text).toContain('"Sari, Rina ""R"""');
    expect(text).toContain('2026-10-02 13:20');
  });
});

describe('broadcast sanitizing', () => {
  it('keeps formatting, drops scripts, handlers, styles and bad links', () => {
    const html = sanitizeBroadcastHtml(
      '<p style="position:fixed" onclick="x()">Hi <strong>all</strong><script>alert(1)</script></p><a href="javascript:alert(1)">bad</a><a href="https://labmgm.org">good</a><iframe src="https://x"></iframe><img src="http://insecure/x.png"><img src="https://ok/x.png" onerror="x">',
    );
    expect(html).not.toMatch(/script|onclick|onerror|iframe|position|javascript/i);
    expect(html).toContain('<strong>all</strong>');
    expect(html).toContain('href="https://labmgm.org"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain('http://insecure');
    expect(html).toContain('src="https://ok/x.png"');
    // The http image is dropped entirely, not left as an empty <img> (a broken image box in some clients).
    expect(html.match(/<img/g)).toHaveLength(1);
    expect(html).toMatch(/<p style="[^"]*font-size: ?16px/);
  });

  it('empty after sanitizing is detectable', () => {
    expect(textOf(sanitizeBroadcastHtml('<script>x</script><p> </p>'))).toBe('');
  });

  it('personalizes with escaping', () => {
    expect(personalize('<p>Hi {{name}}, {{ fullName }}</p>', { firstName: '<b>Rina', fullName: 'Rina & co' })).toBe('<p>Hi &lt;b&gt;Rina, Rina &amp; co</p>');
  });
});

describe('qr and calendar', () => {
  it('renders an SVG with finder patterns and the mark', () => {
    const svg = ticketQrSvg('https://zemi.labmgm.org/t/abcdefghijklmnopqrstuv', { size: 512 });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('width="512"');
    expect(svg.match(/rx="1.7"/g)?.length).toBe(3);
    expect(svg).toContain('#3a6dc5');
  });

  it('builds a UTC VEVENT with a stable uid', () => {
    const ics = buildIcs({
      eventId: 'e1',
      title: 'Robots',
      number: 12,
      startsAt: new Date('2026-10-02T06:15:00Z'),
      endsAt: new Date('2026-10-02T08:15:00Z'),
      location: 'Theater A, Room 2',
      eventUrl: 'https://zemi.labmgm.org/events/robots',
      cancelled: false,
      lines: ['Ticket: ZM-7K3F9Q'],
    });
    expect(ics).toContain('UID:event-e1@zemi.labmgm.org');
    expect(ics).toContain('DTSTART:20261002T061500Z');
    expect(ics).toContain('SUMMARY:Zemi #12: Robots');
    expect(ics).toContain('STATUS:CONFIRMED');
  });
});

describe('small copy helpers', () => {
  it('does not repeat the Zemi number in export file names', () => {
    expect(exportFilename({ number: 97, slug: 'zemi-97-participatory-ai' }, 'csv')).toMatch(/^zemi-97-participatory-ai-registrations-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(exportFilename({ number: 12, slug: 'robots' }, 'pdf', 'kertas-absensi')).toMatch(/^zemi-12-robots-kertas-absensi-/);
    expect(exportFilename({ number: null, slug: 'people-qa' }, 'xlsx')).toMatch(/^zemi-people-qa-registrations-/);
  });

  it('only thanks people for coming when they came', () => {
    expect(thanksSubject('Robots', true, 'in-person', false)).toBe('Thanks for coming to Robots');
    expect(thanksSubject('Robots', false, 'online', true)).toBe('Thanks for tuning in. The recording is up');
    expect(thanksSubject('Robots', false, 'in-person', false)).toBe('We saved you a seat at Robots');
    expect(thanksSubject('Robots', false, 'in-person', true)).toBe('Missed Robots? The recording is up');
  });

  it('keeps the calendar SEQUENCE in step with the event .ics', () => {
    const ics = buildIcs({
      eventId: 'e1',
      title: 'Zemi #12: Robots',
      number: 12,
      startsAt: new Date('2026-10-02T06:15:00Z'),
      endsAt: new Date('2026-10-02T08:15:00Z'),
      location: null,
      eventUrl: 'https://zemi.labmgm.org/events/robots',
      cancelled: false,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:01:40Z'),
      lines: [],
    });
    expect(ics).toContain('SEQUENCE:100');
    expect(ics).toContain('SUMMARY:Zemi #12: Robots');
    expect(ics).not.toContain('Zemi: Zemi');
  });
});

describe('lifecycle emails after a schedule change', () => {
  // Friday 2 Oct 2026, 13:15 to 15:15 WIB.
  const start = new Date('2026-10-02T06:15:00Z');
  const end = new Date('2026-10-02T08:15:00Z');
  const sent = lifecycleWindowOpens(start, end);
  const at = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);

  it('opens reminder, starting and thanks windows from the event times', () => {
    expect(sent.reminder.toISOString()).toBe('2026-10-01T02:00:00.000Z');
    expect(sent.starting.toISOString()).toBe('2026-10-02T06:05:00.000Z');
    expect(sent.thanks.toISOString()).toBe('2026-10-02T08:15:00.000Z');
  });

  it('sends every stage again when the event moves a week later', () => {
    const moved = lifecycleWindowOpens(at(start, 7 * 1440), at(end, 7 * 1440));
    expect(lifecycleStageSent(at(sent.reminder, 1), moved.reminder)).toBe(false);
    expect(lifecycleStageSent(at(sent.starting, 1), moved.starting)).toBe(false);
    expect(lifecycleStageSent(at(sent.thanks, 5), moved.thanks)).toBe(false);
    // and the email_logs cutoff skips the old sends, so everyone hears about the new date
    expect(lifecycleStaleBefore(moved.starting).getTime()).toBeGreaterThan(at(sent.starting, 1).getTime());
  });

  it('does not send a second thank you when the end is pushed 30 minutes after it went out', () => {
    const later = lifecycleWindowOpens(start, at(end, 30));
    expect(lifecycleStageSent(at(sent.thanks, 5), later.thanks)).toBe(true);
  });

  it('does not send a second "starting now" when the start slips 20 minutes', () => {
    const late = lifecycleWindowOpens(at(start, 20), at(end, 20));
    expect(lifecycleStageSent(at(sent.starting, 1), late.starting)).toBe(true);
    // a same-day time change keeps the reminder window (09:00 WIB the day before)
    expect(late.reminder.toISOString()).toBe(sent.reminder.toISOString());
  });

  it('treats a missing sent time as not sent', () => {
    expect(lifecycleStageSent(null, sent.reminder)).toBe(false);
  });
});
