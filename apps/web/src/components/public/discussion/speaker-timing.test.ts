import { describe, expect, it } from 'vitest';
import { speakerTiming, type DiscussionSpeaker } from './api';

const event = {
  startsAt: '2026-10-02T06:00:00.000Z',
  endsAt: '2026-10-02T09:00:00.000Z',
};
const speaker: DiscussionSpeaker = {
  id: 'speaker-1',
  slug: 'speaker-1',
  fullName: 'First Speaker',
  nickname: null,
  headline: null,
  avatar: null,
  role: 'speaker',
  organization: null,
  position: null,
  talkTitle: 'A seminar talk',
  slot: { time: '13:30', endTime: '14:15', agenda: 'A seminar talk' },
};

describe('speakerTiming', () => {
  it('uses the Jakarta schedule to identify the speaker on stage and up next', () => {
    expect(speakerTiming(speaker, event, new Date('2026-10-02T06:45:00.000Z'))).toBe('now');
    expect(speakerTiming(speaker, event, new Date('2026-10-02T06:00:00.000Z'))).toBe('next');
    expect(speakerTiming(speaker, event, new Date('2026-10-02T07:30:00.000Z'))).toBe('done');
  });

  it('does not label a speaker as on stage on another day', () => {
    expect(speakerTiming(speaker, event, new Date('2026-10-03T06:45:00.000Z'))).toBeNull();
  });
});
