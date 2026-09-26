import { createAbility, type Policy, type Principal } from '@zemi/shared';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../common/errors.js';
import { AdminStreamController } from './admin-stream.controller.js';
import { StreamService } from './stream.service.js';

/**
 * Least privilege for OBS keys: `stream.view` gets state, health and preview, never the private key
 * (with it anyone could push their own feed into the live stream). Only `stream.control` gets `obs`.
 */

const EVENT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const row = {
  eventId: EVENT,
  streamKey: 'zmAbCdEfGhIjKlMnOp',
  privateKeyEnc: 'enc:secret-private-key',
  state: 'preview',
  ingestOnline: true,
  ingestOnlineAt: new Date('2026-10-02T06:10:00Z'),
  liveStartedAt: null,
  liveEndedAt: null,
  peakViewers: 3,
  currentSessionId: null,
};

/** A real StreamService (real `toConfig` / `snapshot`) with the DB, crypto and audience faked. */
function service(): StreamService {
  const s = Object.create(StreamService.prototype) as StreamService;
  Object.assign(s, {
    crypto: { decrypt: (enc: string) => enc.replace(/^enc:/, '') },
    config: { env: { RTMP_PUBLIC_URL: 'rtmp://localhost:51935/live', PUBLIC_API_URL: 'http://localhost:4400' } },
    audience: { count: () => 0, peak: () => 0 },
  });
  Object.assign(s, {
    event: async (id: string) => ({ id }),
    ensure: async () => row,
  });
  return s;
}

const admin: Principal = { kind: 'admin', id: '33333333-3333-4333-8333-333333333333', name: 'Rina', expiresAt: null };
const ability = (actions: string[], id = EVENT) =>
  createAbility(admin, { capabilities: [], grants: [{ type: 'event', id, actions }] } as unknown as Policy);

function controller() {
  return new AdminStreamController(service(), {} as never, {} as never);
}

describe('GET /admin/events/:id/stream keys', () => {
  it('gives stream.view the state but no OBS keys', async () => {
    const cfg = await controller().config(EVENT, ability(['stream.view']));
    expect(cfg.obs).toBeNull();
    expect(cfg.state).toBe('preview');
    expect(cfg.ingestOnline).toBe(true);
    expect(JSON.stringify(cfg)).not.toContain('secret-private-key');
    expect(JSON.stringify(cfg)).not.toContain(row.streamKey);
  });

  it('gives stream.control the OBS server and keys', async () => {
    const cfg = await controller().config(EVENT, ability(['stream.control']));
    expect(cfg.obs).toEqual({
      server: 'rtmp://localhost:51935/live',
      streamKey: row.streamKey,
      privateKey: 'secret-private-key',
      obsStreamKey: `${row.streamKey}?key=secret-private-key`,
    });
  });

  it('keys follow the grant for this event, not another one', async () => {
    const mixed = createAbility(admin, {
      capabilities: [],
      grants: [
        { type: 'event', id: EVENT, actions: ['stream.view'] },
        { type: 'event', id: OTHER, actions: ['stream.control'] },
      ],
    });
    expect((await controller().config(EVENT, mixed)).obs).toBeNull();
  });

  it('the superadmin gets keys; no stream access at all is a 403', async () => {
    const sup = createAbility({ kind: 'superadmin', id: 'superadmin', name: 'Superadmin' }, null);
    expect((await controller().config(EVENT, sup)).obs?.privateKey).toBe('secret-private-key');
    expect(() => controller().config(EVENT, ability(['view']))).toThrow(AppError);
  });

  it('toConfig without keys never decrypts', () => {
    const s = service();
    Object.assign(s, { crypto: { decrypt: () => { throw new Error('should not decrypt'); } } });
    expect(s.toConfig(row as never, { withKeys: false }).obs).toBeNull();
  });
});
