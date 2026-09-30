import {
  bumperSlideSchema,
  createAbility,
  DEFAULT_BUMPER_THEME,
  type Ability,
  type BumperData,
  type Policy,
  type Principal,
} from '@zemi/shared';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../common/errors.js';
import { BumpersAdminController } from './bumpers.admin.controller.js';
import { toLiveState } from './live-logic.js';
import type { BumpersLiveService, ShowRow } from './live.service.js';
import { BumperShowsService } from './shows.service.js';

/**
 * Show access through the admin controller: `bumperPermissions` on the show's event (stream
 * operators build and run, show runners only run, door crew gets nothing), `bumpers.manage` and the
 * superadmin for everything including standalone shows, and 403 before 404 for scoped admins.
 * Keys never reach anyone without `run`, and never appear in rows, details or the output payload.
 */

const EVENT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SHOW = '33333333-3333-4333-8333-333333333333';
const STANDALONE = '44444444-4444-4444-8444-444444444444';
const MISSING = '55555555-5555-4555-8555-555555555555';
const OUTPUT_KEY = 'OutKey000000000000000000000000AB';
const CONTROL_KEY = 'CtlKey0000000000000000000000000000000ABC';

const admin: Principal = {
  kind: 'admin',
  id: '66666666-6666-4666-8666-666666666666',
  name: 'Rina',
  expiresAt: null,
};
const superadmin: Principal = { kind: 'superadmin', id: 'superadmin', name: 'Superadmin' };
const grant = (actions: string[], id = EVENT) =>
  createAbility(admin, {
    capabilities: [],
    grants: [{ type: 'event', id, actions }],
  } as unknown as Policy);

const ABILITY = {
  streamOperator: grant(['stream.view', 'stream.control']),
  showRunner: grant(['bumpers.run']),
  doorCrew: grant(['attendance.scan', 'attendance.manage']),
  otherOperator: grant(['stream.control'], OTHER),
  manage: createAbility(admin, { capabilities: ['bumpers.manage'], grants: [] }),
  superadmin: createAbility(superadmin, null),
};

function row(id: string, eventId: string | null): ShowRow {
  const now = new Date('2026-10-02T06:00:00Z');
  return {
    id,
    title: 'Zemi #98 bumpers',
    eventId,
    status: 'active',
    origin: 'generated',
    theme: DEFAULT_BUMPER_THEME,
    slides: [
      bumperSlideSchema.parse({ id: 'aaaa', kind: 'welcome' }),
      bumperSlideSchema.parse({ id: 'bbbb', kind: 'closing' }),
    ],
    version: 3,
    outputKey: OUTPUT_KEY,
    controlKeyHash: 'hash-of-control-key',
    controlKeyEnc: `enc:${CONTROL_KEY}`,
    keysRotatedAt: now,
    liveSlideId: 'aaaa',
    liveFromSlideId: null,
    liveTransition: null,
    liveDir: 1,
    liveMode: 'show',
    liveAutoplay: true,
    liveAdvanceAt: null,
    liveStartedAt: null,
    liveUpdatedAt: now,
    liveSeq: 0,
    liveCue: 0,
    liveSlideSince: null,
    liveVia: null,
    liveBy: null,
    lastPlayedAt: null,
    archivedAt: null,
    createdBy: 'superadmin',
    createdByName: 'Superadmin',
    updatedBy: 'superadmin',
    updatedByName: 'Superadmin',
    createdAt: now,
    updatedAt: now,
  };
}

const ROWS = new Map([
  [SHOW, row(SHOW, EVENT)],
  [STANDALONE, row(STANDALONE, null)],
]);

const DATA = {
  events: {},
  speakers: {},
  publications: {},
  team: {},
  threads: {},
  images: {},
  nextEventId: null,
  generatedAt: '',
} as unknown as BumperData;

/** Marks the point where a request got past the access checks and would touch the database. */
class Reached extends Error {}

const live = {
  state: (r: ShowRow) => toLiveState(r),
  outputs: () => 0,
  presenceOf: () => ({ outputs: 0, docks: 0, controllers: 0, clients: [] }),
  control: async () => toLiveState(row(SHOW, EVENT)),
} as unknown as BumpersLiveService;

/** A real BumperShowsService (real access checks, DTOs and links) over an in-memory show table. */
function service(): BumperShowsService {
  const s = Object.create(BumperShowsService.prototype) as BumperShowsService;
  Object.assign(s, {
    live,
    crypto: { decrypt: (enc: string) => enc.replace(/^enc:/, '') },
    config: { env: { PUBLIC_API_URL: 'http://localhost:4400' } },
    data: { build: async () => DATA, webUrl: () => 'https://zemi.ac' },
    db: {
      transaction: () => {
        throw new Reached();
      },
      update: () => {
        throw new Reached();
      },
      delete: () => {
        throw new Reached();
      },
    },
    find: async (id: string) => ROWS.get(id) ?? null,
    eventSummaries: async () => new Map(),
    insertShow: () => {
      throw new Reached();
    },
    assertEvent: async () => null,
  });
  return s;
}

function controller() {
  return new BumpersAdminController(service(), live, {} as never, {} as never);
}

async function status(call: () => Promise<unknown>): Promise<number | 'reached'> {
  try {
    await call();
    return 200;
  } catch (err) {
    if (err instanceof Reached) return 'reached';
    if (err instanceof AppError) return err.getStatus();
    throw err;
  }
}

const get = (id: string, a: Ability) => status(() => controller().get(id, a));
const patch = (id: string, a: Ability) =>
  status(() => controller().update(id, { baseVersion: 3, title: 'New name' }, admin, a, null));
const output = (id: string, a: Ability) => status(() => controller().output(id, a));
const rotate = (id: string, a: Ability) =>
  status(() => controller().rotate(id, { which: 'both' }, admin, a, null));
const control = (id: string, a: Ability) =>
  status(() => controller().control(id, { action: 'next' }, admin, a, null));
const remove = (id: string, a: Ability) => status(() => controller().remove(id, admin, a, null));

describe('bumper access through the admin controller', () => {
  it('stream operators build and run the shows of their event', async () => {
    const a = ABILITY.streamOperator;
    expect(await get(SHOW, a)).toBe(200);
    expect(await patch(SHOW, a)).toBe('reached');
    expect(await output(SHOW, a)).toBe(200);
    expect(await control(SHOW, a)).toBe(200);
    expect(await remove(SHOW, a)).toBe('reached');
    const detail = await controller().get(SHOW, a);
    expect(detail.permissions).toEqual(['run', 'edit']);
  });

  it('show runners play but never change a show', async () => {
    const a = ABILITY.showRunner;
    expect(await get(SHOW, a)).toBe(200);
    expect(await control(SHOW, a)).toBe(200);
    expect(await output(SHOW, a)).toBe(200);
    expect(await patch(SHOW, a)).toBe(403);
    expect(await rotate(SHOW, a)).toBe(403);
    expect(await remove(SHOW, a)).toBe(403);
    expect(await status(() => controller().duplicate(SHOW, {}, admin, a, null))).toBe(403);
  });

  it('door crew gets 403 everywhere, the library included', async () => {
    const a = ABILITY.doorCrew;
    for (const call of [get, patch, output, rotate, control, remove])
      expect(await call(SHOW, a)).toBe(403);
    expect(
      await status(() => controller().list({ status: 'active', page: 1, pageSize: 24 }, a)),
    ).toBe(403);
    expect(
      await status(() =>
        controller().resolve(
          {
            eventIds: [],
            speakerIds: [],
            publicationIds: [],
            teamMemberIds: [],
            threadIds: [],
            assetIds: [],
          },
          a,
        ),
      ),
    ).toBe(403);
    expect(await status(() => controller().sourceTeam({ limit: 20 }, a))).toBe(403);
  });

  it('a grant on another event opens nothing here', async () => {
    const a = ABILITY.otherOperator;
    expect(await get(SHOW, a)).toBe(403);
    expect(await output(SHOW, a)).toBe(403);
    expect(await control(SHOW, a)).toBe(403);
  });

  it('standalone shows need bumpers.manage', async () => {
    expect(await get(STANDALONE, ABILITY.streamOperator)).toBe(403);
    expect(await control(STANDALONE, ABILITY.showRunner)).toBe(403);
    expect(await get(STANDALONE, ABILITY.manage)).toBe(200);
    expect(await patch(STANDALONE, ABILITY.manage)).toBe('reached');
    expect(await get(STANDALONE, ABILITY.superadmin)).toBe(200);
    expect(
      await status(() =>
        controller().create(
          { title: 'Tech trouble', eventId: null, origin: 'blank' },
          admin,
          ABILITY.streamOperator,
          null,
        ),
      ),
    ).toBe(403);
    expect(
      await status(() =>
        controller().create(
          { title: 'Tech trouble', eventId: null, origin: 'blank' },
          admin,
          ABILITY.manage,
          null,
        ),
      ),
    ).toBe('reached');
  });

  it('bumpers.manage and the superadmin reach every show', async () => {
    for (const a of [ABILITY.manage, ABILITY.superadmin]) {
      expect(await get(SHOW, a)).toBe(200);
      expect(await rotate(SHOW, a)).toBe('reached');
    }
  });

  it('403 before 404: a missing show looks like a forbidden one to scoped admins', async () => {
    expect(await get(MISSING, ABILITY.streamOperator)).toBe(403);
    expect(await get(MISSING, ABILITY.showRunner)).toBe(403);
    expect(await get(MISSING, ABILITY.manage)).toBe(404);
    expect(await get(MISSING, ABILITY.superadmin)).toBe(404);
  });

  it('creating for an event needs edit there', async () => {
    expect(
      await status(() =>
        controller().create(
          { title: 'x', eventId: EVENT, origin: 'blank' },
          admin,
          ABILITY.showRunner,
          null,
        ),
      ),
    ).toBe(403);
    expect(
      await status(() =>
        controller().create(
          { title: 'x', eventId: EVENT, origin: 'blank' },
          admin,
          ABILITY.streamOperator,
          null,
        ),
      ),
    ).toBe('reached');
    expect(
      await status(() =>
        controller().create(
          { title: 'x', eventId: OTHER, origin: 'blank' },
          admin,
          ABILITY.streamOperator,
          null,
        ),
      ),
    ).toBe(403);
  });
});

describe('bumper keys', () => {
  it('only a principal with run gets the OBS links', async () => {
    const links = await controller().output(SHOW, ABILITY.showRunner);
    expect(links).toEqual({
      outputUrl: `https://zemi.ac/bumpers/out/${OUTPUT_KEY}`,
      dockUrl: `https://zemi.ac/bumpers/dock/${CONTROL_KEY}`,
      controlApiUrl: `http://localhost:4400/api/v1/public/bumpers/control/${CONTROL_KEY}`,
      outputKey: OUTPUT_KEY,
      controlKey: CONTROL_KEY,
      rotatedAt: '2026-10-02T06:00:00.000Z',
    });
    for (const a of [ABILITY.doorCrew, ABILITY.otherOperator]) {
      const err = await controller()
        .output(SHOW, a)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppError);
      expect(JSON.stringify((err as AppError).getResponse())).not.toContain(CONTROL_KEY);
    }
  });

  it('details, live state and the OBS payload never carry a key', async () => {
    const detail = await controller().get(SHOW, ABILITY.streamOperator);
    const live = await controller().liveState(SHOW, ABILITY.showRunner);
    const payload = await service().publicShow(row(SHOW, EVENT), true);
    for (const out of [detail, live, payload]) {
      const text = JSON.stringify(out);
      expect(text).not.toContain(OUTPUT_KEY);
      expect(text).not.toContain(CONTROL_KEY);
      expect(text).not.toContain('hash-of-control-key');
    }
  });

  it('the OBS payload leaves hidden slides out', async () => {
    const r = row(SHOW, EVENT);
    r.slides = [...r.slides, bumperSlideSchema.parse({ id: 'cccc', kind: 'brb', hidden: true })];
    const payload = await service().publicShow(r, false);
    expect(payload.slides.map((s) => s.id)).toEqual(['aaaa', 'bbbb']);
    expect(payload.state.total).toBe(2);
    expect(payload.canControl).toBe(false);
  });
});
