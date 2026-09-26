import { describe, expect, it } from 'vitest';
import { SITE_DEFAULTS, type PublicSite } from '@zemi/shared';
import { mapsHref, matchTopic, resolveContact, whatsappHref } from './lib';

const topics = ['I want to present', 'Collaboration', 'A question', 'Something else'];

function site(contact: Partial<PublicSite['settings']['contact']>, isFallback = false): PublicSite & { isFallback: boolean } {
  const { notifyEmails: _n, ...base } = SITE_DEFAULTS.contact;
  void _n;
  return {
    settings: { ...SITE_DEFAULTS, contact: { ...base, ...contact } } as unknown as PublicSite['settings'],
    faqs: [],
    team: [],
    stats: { sessions: 0, talks: 0, speakers: 0, seatsFilled: 0, publications: 0, hoursOfTalk: 0, firstEventAt: null },
    ogImage: null,
    isFallback,
  };
}

describe('matchTopic', () => {
  it('matches keywords and exact labels, falls back to the last topic', () => {
    expect(matchTopic(topics, 'present')).toBe('I want to present');
    expect(matchTopic(topics, 'collab')).toBe('Collaboration');
    expect(matchTopic(topics, 'question')).toBe('A question');
    expect(matchTopic(topics, 'a QUESTION')).toBe('A question');
    expect(matchTopic(topics, 'nonsense')).toBe('Something else');
    expect(matchTopic(topics, undefined)).toBe('Something else');
  });
});

describe('whatsappHref', () => {
  it('builds wa.me links from free text', () => {
    expect(whatsappHref('+62 812 1315 1515')).toMatch(/^https:\/\/wa\.me\/6281213151515\?text=/);
    expect(whatsappHref('0812-1315-1515')).toMatch(/^https:\/\/wa\.me\/6281213151515\?/);
    expect(whatsappHref('call us')).toBeNull();
    expect(whatsappHref(null)).toBeNull();
  });
});

describe('mapsHref', () => {
  it('prefers a real URL, else searches the address', () => {
    expect(mapsHref('https://maps.example/x', 'A')).toBe('https://maps.example/x');
    expect(mapsHref('javascript:alert(1)', 'Kampus Depok')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Kampus%20Depok',
    );
    expect(mapsHref('', '')).toBeNull();
  });
});

describe('resolveContact', () => {
  it('uses the shared defaults when the API is down', () => {
    const c = resolveContact(site({ title: '', topics: [] }, true));
    expect(c.title).toBe(SITE_DEFAULTS.contact.title);
    expect(c.topics).toEqual(SITE_DEFAULTS.contact.topics);
  });
  it('keeps stored values, fills only the essentials, drops unsafe socials', () => {
    const c = resolveContact(
      site({
        title: '',
        address: '',
        topics: [' '],
        socials: [
          { kind: 'website', url: 'javascript:alert(1)', label: 'bad' },
          { kind: 'github', url: 'https://github.com/x', label: null },
        ],
      }),
    );
    expect(c.title).toBe(SITE_DEFAULTS.contact.title);
    expect(c.address).toBe('');
    expect(c.topics).toEqual(SITE_DEFAULTS.contact.topics);
    expect(c.socials.map((s) => s.url)).toEqual(['https://github.com/x']);
  });
});
