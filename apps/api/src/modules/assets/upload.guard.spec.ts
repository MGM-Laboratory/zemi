import { createAbility, type Policy, type Principal } from '@zemi/shared';
import { describe, expect, it } from 'vitest';
import { assertCanLookup } from '../../auth/permissions.service.js';
import { AppError } from '../../common/errors.js';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { canUpload, UPLOAD_RATE, UploadGuard } from './upload.guard.js';

const admin: Principal = { kind: 'admin', id: '00000000-0000-4000-8000-000000000001', name: 'Test admin' };
const EVENT = '00000000-0000-4000-8000-0000000000e1';
const ability = (policy: Policy) => createAbility(admin, policy);
const zero = ability({ capabilities: [], grants: [] });
const doorCrew = ability({ capabilities: [], grants: [{ type: 'event', id: EVENT, actions: ['attendance.scan', 'attendance.manage'] }] });
const viewer = ability({ capabilities: [], grants: [{ type: 'event', id: '*', actions: ['view'] }, { type: 'speaker', id: '*', actions: ['view'] }] });
const editor = ability({ capabilities: [], grants: [{ type: 'event', id: EVENT, actions: ['edit'] }] });
const docs = ability({ capabilities: [], grants: [{ type: 'event', id: EVENT, actions: ['media.manage'] }] });
const creator = ability({ capabilities: ['events.create'], grants: [] });
const site = ability({ capabilities: ['site.edit'], grants: [] });

const status = (fn: () => unknown) => {
  try {
    fn();
    return 200;
  } catch (e) {
    return e instanceof AppError ? e.getStatus() : 500;
  }
};

describe('canUpload', () => {
  it('needs a reason to upload', () => {
    expect([zero, doorCrew, viewer].map(canUpload)).toEqual([false, false, false]);
    expect([editor, docs, creator, site].map(canUpload)).toEqual([true, true, true, true]);
    expect(canUpload(createAbility({ kind: 'superadmin', id: 'superadmin', name: 'Superadmin' }, null))).toBe(true);
  });

  it('the guard refuses before multer runs, and rate limits per admin', () => {
    const rl = new RateLimitService();
    const guard = new UploadGuard(rl);
    const ctx = (a: ReturnType<typeof ability>) =>
      ({ switchToHttp: () => ({ getRequest: () => ({ ability: a, principal: a.principal }) }) }) as never;
    expect(status(() => guard.canActivate(ctx(doorCrew)))).toBe(403);
    for (let i = 0; i < UPLOAD_RATE.limit; i++) guard.canActivate(ctx(editor));
    expect(status(() => guard.canActivate(ctx(editor)))).toBe(429);
    rl.onModuleDestroy();
  });
});

describe('assertCanLookup', () => {
  it('lets pickers and viewers search, refuses zero-grant and door crew', () => {
    expect(status(() => assertCanLookup(zero, 'publication'))).toBe(403);
    expect(status(() => assertCanLookup(doorCrew, 'speaker'))).toBe(403);
    expect(status(() => assertCanLookup(viewer, 'speaker'))).toBe(200);
    expect(status(() => assertCanLookup(viewer, 'publication'))).toBe(403);
    expect(status(() => assertCanLookup(editor, 'publication'))).toBe(200);
    expect(status(() => assertCanLookup(creator, 'speaker'))).toBe(200);
  });
});
