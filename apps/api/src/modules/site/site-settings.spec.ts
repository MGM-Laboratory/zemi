import { SITE_DEFAULTS, SITE_SETTING_SCHEMAS } from '@zemi/shared';
import { describe, expect, it } from 'vitest';
import { changedFields, isSiteSettingKey, mergeAllSettings, mergeSetting, publicSettings } from './site-settings.js';

describe('mergeSetting', () => {
  it('gives the rich defaults when nothing is stored', () => {
    expect(mergeSetting('home', undefined)).toEqual(SITE_SETTING_SCHEMAS.home.parse(SITE_DEFAULTS.home));
    expect(mergeSetting('home', undefined).beats).toHaveLength(7);
    expect(mergeSetting('about', null).pillars.map((p) => p.shape)).toEqual(['circle', 'triangle', 'square', 'arch']);
  });

  it('lets stored fields win and fills the rest from defaults', () => {
    const merged = mergeSetting('home', { funStat: '2 coffee machines' });
    expect(merged.funStat).toBe('2 coffee machines');
    expect(merged.heroTitle).toBe(SITE_DEFAULTS.home.heroTitle);
  });

  it('keeps an array the admin cleared', () => {
    expect(mergeSetting('home', { beats: [] }).beats).toEqual([]);
  });

  it('falls back to the default for a stored field that no longer validates', () => {
    const merged = mergeSetting('contact', { title: 'Hello', notifyEmails: ['not an email'] });
    expect(merged.title).toBe('Hello');
    expect(merged.notifyEmails).toEqual(SITE_DEFAULTS.contact.notifyEmails);
  });

  it('drops unknown stored fields', () => {
    expect(mergeSetting('seo', { legacy: true })).not.toHaveProperty('legacy');
  });

  it('ignores a stored value that is not an object', () => {
    expect(mergeSetting('general', ['nope']).siteName).toBe('Zemi');
  });
});

describe('mergeAllSettings and publicSettings', () => {
  it('returns every section', () => {
    const all = mergeAllSettings([{ key: 'general', value: { siteName: 'Zemi Test' } }, { key: 'unknown', value: {} }]);
    expect(Object.keys(all).sort()).toEqual(Object.keys(SITE_SETTING_SCHEMAS).sort());
    expect(all.general.siteName).toBe('Zemi Test');
  });

  it('strips the email section and the organizer notify list', () => {
    const all = mergeAllSettings([{ key: 'contact', value: { notifyEmails: ['crew@labmgm.org'] } }]);
    const pub = publicSettings(all);
    expect(pub).not.toHaveProperty('email');
    expect(pub.contact).not.toHaveProperty('notifyEmails');
    expect(pub.contact.email).toBe(all.contact.email);
    expect(JSON.stringify(pub)).not.toContain('crew@labmgm.org');
  });
});

describe('helpers', () => {
  it('lists changed top-level fields', () => {
    expect(changedFields({ a: 1, b: [1], c: 'x' }, { a: 1, b: [2], d: true })).toEqual(['b', 'c', 'd']);
  });

  it('knows the section keys', () => {
    expect(isSiteSettingKey('home')).toBe(true);
    expect(isSiteSettingKey('nope')).toBe(false);
  });

  it('writes the defaults without en or em dashes', () => {
    expect(JSON.stringify(SITE_DEFAULTS)).not.toMatch(/[\u2013\u2014]/);
  });
});
