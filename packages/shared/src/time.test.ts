import { describe, expect, it } from 'vitest';
import { formatJakarta } from './time.js';

const TZ = 'Asia/Jakarta';
const intl = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...o }).format(d);

describe('formatJakarta', () => {
  // 06:15 UTC is 13:15 in Jakarta; 20:00 UTC on the 1st is already the 2nd there.
  const friday = new Date('2026-10-02T06:15:00Z');
  const lateUtc = new Date('2026-10-01T20:00:00Z');

  it('formats every variant in Jakarta time', () => {
    expect(formatJakarta(friday, 'date')).toBe('Fri, 2 Oct 2026');
    expect(formatJakarta(friday, 'date-long')).toBe('Friday, 2 October 2026');
    expect(formatJakarta(friday, 'date-short')).toBe('2 Oct');
    expect(formatJakarta(friday, 'time')).toBe('13:15');
    expect(formatJakarta(friday, 'weekday')).toBe('Friday');
    expect(formatJakarta(friday, 'month-year')).toBe('October 2026');
    expect(formatJakarta(friday, 'iso-date')).toBe('2026-10-02');
    expect(formatJakarta(friday)).toBe('Fri, 2 Oct 2026, 13:15');
    expect(formatJakarta(lateUtc, 'date')).toBe('Fri, 2 Oct 2026');
    expect(formatJakarta(new Date('2026-09-25T06:00:00Z'), 'date')).toBe('Fri, 25 Sept 2026');
  });

  it('rejects invalid dates', () => {
    expect(() => formatJakarta('not a date', 'date')).toThrow(RangeError);
  });

  // Guards the hand-written names against today's ICU (the formats ICU versions agree on).
  it('matches en-GB Intl wherever ICU versions agree', () => {
    for (let i = 0; i < 400; i += 7) {
      const d = new Date(Date.UTC(2026, 0, 1, 5) + i * 86_400_000);
      expect(formatJakarta(d, 'date')).toBe(intl(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }));
      expect(formatJakarta(d, 'date-short')).toBe(intl(d, { day: 'numeric', month: 'short' }));
      expect(formatJakarta(d, 'month-year')).toBe(intl(d, { month: 'long', year: 'numeric' }));
      expect(formatJakarta(d, 'weekday')).toBe(intl(d, { weekday: 'long' }));
    }
  });
});
