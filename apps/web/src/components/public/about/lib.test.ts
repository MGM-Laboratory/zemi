import { describe, expect, it } from 'vitest';
import { SITE_DEFAULTS, type PublicSite } from '@zemi/shared';
import { resolveAbout } from './lib';

function site(about: Partial<PublicSite['settings']['about']>, isFallback = false): PublicSite & { isFallback: boolean } {
  return {
    settings: { ...SITE_DEFAULTS, about: { ...SITE_DEFAULTS.about, ...about } } as unknown as PublicSite['settings'],
    faqs: [{ id: '1', question: 'Q?', answer: 'A.', visibility: 'draft', sortOrder: 0 }],
    team: [],
    stats: { sessions: 0, talks: 0, speakers: 0, seatsFilled: 0, publications: 0, hoursOfTalk: 0, firstEventAt: null },
    ogImage: null,
    isFallback,
  };
}

describe('resolveAbout', () => {
  it('always returns four pillars in brand order, filling missing shapes from defaults', () => {
    const d = resolveAbout(site({ pillars: [{ shape: 'square', title: 'Data!', body: 'Stored.' }] }));
    expect(d.pillars.map((p) => p.shape)).toEqual(['circle', 'triangle', 'square', 'arch']);
    expect(d.pillars[2]!.title).toBe('Data!');
    expect(d.pillars[0]!.title).toBe(SITE_DEFAULTS.about.pillars[0]!.title);
  });
  it('falls back for empty title and intro, keeps cleared sections cleared', () => {
    const d = resolveAbout(site({ title: ' ', intro: '', audiences: [], presentSteps: [] }));
    expect(d.about.title).toBe(SITE_DEFAULTS.about.title);
    expect(d.about.intro).toBe(SITE_DEFAULTS.about.intro);
    expect(d.about.audiences).toEqual([]);
    expect(d.about.presentSteps).toEqual([]);
  });
  it('uses the shared defaults when the API is down and hides drafts', () => {
    const d = resolveAbout(site({ title: '', pillars: [] }, true));
    expect(d.about.title).toBe(SITE_DEFAULTS.about.title);
    expect(d.pillars).toHaveLength(4);
    expect(d.faqs).toEqual([]);
    expect(d.labUrl).toBe('https://labmgm.org');
  });
});
