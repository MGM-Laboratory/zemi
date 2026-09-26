import { describe, expect, it } from 'vitest';
import { pickCitationKey } from './citation-keys.js';

describe('pickCitationKey', () => {
  it('takes the base, then b..z, then -2', () => {
    expect(pickCitationKey('lecun2015deep', new Set())).toBe('lecun2015deep');
    expect(pickCitationKey('lecun2015deep', new Set(['lecun2015deep']))).toBe('lecun2015deepb');
    expect(pickCitationKey('lecun2015deep', new Set(['lecun2015deep', 'lecun2015deepb']))).toBe('lecun2015deepc');
    const all = new Set(['k', ...'bcdefghijklmnopqrstuvwxyz'.split('').map((c) => `k${c}`)]);
    expect(pickCitationKey('k', all)).toBe('k-2');
    expect(pickCitationKey('', new Set())).toBe('zemi');
  });
});
