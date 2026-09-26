import {
  contactSettings,
  generalSettings,
  linkSchema,
  publicationInput,
  publicationLinkSchema,
  safeLinkHref,
  safeWebUrl,
  sanitizeLinkList,
  speakerInput,
  teamMemberInput,
} from '@zemi/shared';
import { describe, expect, it } from 'vitest';
import { mergeSetting } from '../modules/site/site-settings.js';

/** Safe links (item 5): only http(s), mailto and tel reach an href, on input and on output. */

const BAD = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  '  javascript:alert(1)',
  'java\tscript:alert(1)',
  'java\nscript:alert(1)',
  '\u0000javascript:alert(1)',
  'vbscript:msgbox(1)',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  'file:///etc/passwd',
  '//evil.example/path',
  'evil.example',
  'https:',
  'https://',
  'mailto:',
  '',
  '   ',
];

describe('safeLinkHref', () => {
  it('keeps web, mail and phone links', () => {
    expect(safeLinkHref('https://labmgm.org')).toBe('https://labmgm.org');
    expect(safeLinkHref('  http://localhost:3300/events  ')).toBe('http://localhost:3300/events');
    expect(safeLinkHref('HTTPS://Scholar.Google.com/citations?user=x')).toBe('HTTPS://Scholar.Google.com/citations?user=x');
    expect(safeLinkHref('mailto:zemi@labmgm.org')).toBe('mailto:zemi@labmgm.org');
    expect(safeLinkHref('tel:+6281234567890')).toBe('tel:+6281234567890');
  });

  it.each(BAD)('refuses %j', (bad) => {
    expect(safeLinkHref(bad)).toBeNull();
    expect(safeLinkHref(bad, { relative: true })).toBeNull();
  });

  it('allows site paths only when asked, never protocol-relative or backslash hosts', () => {
    expect(safeLinkHref('/events/zemi-98')).toBeNull();
    expect(safeLinkHref('/events/zemi-98', { relative: true })).toBe('/events/zemi-98');
    expect(safeLinkHref('//evil.example', { relative: true })).toBeNull();
    expect(safeLinkHref('/\\evil.example', { relative: true })).toBeNull();
    expect(safeLinkHref('javascript&colon;alert(1)', { relative: true })).toBeNull();
  });

  it('safeWebUrl is http(s) only', () => {
    expect(safeWebUrl('https://maps.google.com/?q=1')).toBe('https://maps.google.com/?q=1');
    expect(safeWebUrl('mailto:a@b.co')).toBeNull();
    expect(safeWebUrl('tel:+62')).toBeNull();
    expect(safeWebUrl(null)).toBeNull();
  });
});

describe('input schemas refuse unsafe links', () => {
  it('speaker, team and contact links (linkSchema)', () => {
    expect(linkSchema.safeParse({ kind: 'website', url: 'https://labmgm.org' }).success).toBe(true);
    expect(linkSchema.safeParse({ kind: 'email', url: 'mailto:rina@labmgm.org' }).success).toBe(true);
    for (const url of ['javascript:alert(1)', ' JAVASCRIPT:alert(1)', 'java\tscript:x', 'data:text/html,x', '//evil.example']) {
      expect(linkSchema.safeParse({ kind: 'website', url }).success).toBe(false);
    }
    const speaker = speakerInput.safeParse({ slug: 'rina', fullName: 'Rina', links: [{ kind: 'github', url: 'javascript:alert(1)' }] });
    expect(speaker.success).toBe(false);
    if (!speaker.success) expect(speaker.error.issues[0]?.path).toEqual(['links', 0, 'url']);
    expect(teamMemberInput.safeParse({ name: 'Rina', links: [{ kind: 'x', url: 'vbscript:x' }] }).success).toBe(false);
    expect(contactSettings.safeParse({ socials: [{ kind: 'instagram', url: 'data:text/html,x' }] }).success).toBe(false);
  });

  it('publication links and url', () => {
    expect(publicationLinkSchema.safeParse({ kind: 'code', label: 'Code', url: 'https://github.com/x/y' }).success).toBe(true);
    expect(publicationLinkSchema.safeParse({ kind: 'code', label: 'Code', url: 'javascript:alert(1)' }).success).toBe(false);
    const base = { slug: 'paper', type: 'preprint', title: 'Paper' };
    expect(publicationInput.safeParse({ ...base, url: 'javascript:alert(1)' }).success).toBe(false);
    expect(publicationInput.safeParse({ ...base, url: 'https://arxiv.org/abs/1' }).success).toBe(true);
  });

  it('announcement href takes a site path; the lab URL is http(s)', () => {
    const ok = generalSettings.safeParse({ announcement: { active: true, text: 'Hi', href: '/events/zemi-98' }, labUrl: 'https://labmgm.org' });
    expect(ok.success).toBe(true);
    expect(generalSettings.safeParse({ announcement: { active: true, text: 'Hi', href: '' } }).success).toBe(true);
    expect(generalSettings.safeParse({ announcement: { active: true, text: 'Hi', href: null } }).success).toBe(true);
    expect(generalSettings.safeParse({ announcement: { active: true, text: 'Hi', href: 'javascript:alert(1)' } }).success).toBe(false);
    expect(generalSettings.safeParse({ announcement: { active: true, text: 'Hi', href: '//evil.example' } }).success).toBe(false);
    expect(generalSettings.safeParse({ labUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(generalSettings.safeParse({ labUrl: 'mailto:lab@labmgm.org' }).success).toBe(false);
  });
});

describe('output: rows saved before the checks', () => {
  it('sanitizeLinkList drops unsafe links and turns bare email links into mailto', () => {
    const links = [
      { kind: 'website', url: 'https://labmgm.org', label: null },
      { kind: 'github', url: 'javascript:alert(1)', label: null },
      { kind: 'email', url: 'rina@labmgm.org', label: null },
      { kind: 'website', url: 'rina@labmgm.org', label: null },
      { kind: 'x', url: 'data:text/html,x', label: null },
    ];
    expect(sanitizeLinkList(links)).toEqual([
      { kind: 'website', url: 'https://labmgm.org', label: null },
      { kind: 'email', url: 'mailto:rina@labmgm.org', label: null },
    ]);
    expect(sanitizeLinkList(null)).toEqual([]);
  });

  it('site settings keep the good socials and the banner text when one link is bad', () => {
    const contact = mergeSetting('contact', {
      socials: [
        { kind: 'instagram', url: 'https://www.instagram.com/zemi.fridays', label: '@zemi.fridays' },
        { kind: 'website', url: 'javascript:alert(1)', label: 'Oops' },
      ],
      mapsUrl: 'javascript:alert(1)',
    });
    expect(contact.socials).toEqual([{ kind: 'instagram', url: 'https://www.instagram.com/zemi.fridays', label: '@zemi.fridays' }]);
    expect(contact.mapsUrl).toBeNull();

    const general = mergeSetting('general', {
      announcement: { active: true, text: 'Zemi #98 is Friday', href: 'javascript:alert(1)' },
      labUrl: 'javascript:alert(1)',
    });
    expect(general.announcement).toEqual({ active: true, text: 'Zemi #98 is Friday', href: null });
    expect(general.labUrl).toBe('https://labmgm.org');

    const kept = mergeSetting('general', { announcement: { active: true, text: 'Hi', href: '/events/zemi-98' } });
    expect(kept.announcement.href).toBe('/events/zemi-98');
  });
});
