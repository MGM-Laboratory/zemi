import { createAbility, type Principal } from '@zemi/shared';
import { describe, expect, it } from 'vitest';
import { canMutateAsset } from './assets.service.js';

const me: Principal = { kind: 'admin', id: '33333333-3333-4333-8333-333333333333', name: 'Rina', expiresAt: null };
const someoneElse = '44444444-4444-4444-8444-444444444444';
const withCaps = (capabilities: Array<'site.edit' | 'media.library'>) => createAbility(me, { capabilities, grants: [] });

describe('who may edit, re-crop or delete an asset', () => {
  it('the uploader, media librarians and the superadmin', () => {
    expect(canMutateAsset(withCaps([]), me, { createdBy: me.id, purpose: 'event-cover' })).toBe(true);
    expect(canMutateAsset(withCaps([]), me, { createdBy: someoneElse, purpose: 'event-cover' })).toBe(false);
    expect(canMutateAsset(withCaps(['media.library']), me, { createdBy: someoneElse, purpose: 'recording' })).toBe(true);
    const sup = createAbility({ kind: 'superadmin', id: 'superadmin', name: 'Superadmin' }, null);
    expect(canMutateAsset(sup, sup.principal, { createdBy: null, purpose: 'documentation' })).toBe(true);
  });

  it('site editors for site media and team photos only', () => {
    const site = withCaps(['site.edit']);
    expect(canMutateAsset(site, me, { createdBy: someoneElse, purpose: 'site' })).toBe(true);
    expect(canMutateAsset(site, me, { createdBy: null, purpose: 'team-avatar' })).toBe(true);
    expect(canMutateAsset(site, me, { createdBy: someoneElse, purpose: 'speaker-avatar' })).toBe(false);
    expect(canMutateAsset(site, me, { createdBy: someoneElse, purpose: 'documentation' })).toBe(false);
  });
});
