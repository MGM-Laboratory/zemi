import {
  Inject,
  Injectable,
  Logger,
  type MessageEvent,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type {
  BumperClientKind,
  BumperControlInput,
  BumperControlVia,
  BumperLiveState,
  BumperPresence,
  BumperStreamMessage,
} from '@zemi/shared';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { Observable } from 'rxjs';
import { AppError, notFound } from '../../common/errors.js';
import { DB, type Db, type Tx } from '../../db/client.js';
import { bumperShows } from '../../db/schema.js';
import { AuditService, type AuditActor } from '../audit/audit.service.js';
import { channels, RealtimeService } from '../realtime/realtime.service.js';
import type { BumperKeyKind } from './bumpers.schemas.js';
import {
  planAuto,
  planControl,
  sameJakartaDay,
  toLiveState,
  type LivePatch,
} from './live-logic.js';
import { parseAgent, PresenceRegistry } from './presence.js';

export type ShowRow = typeof bumperShows.$inferSelect;

/** Who pressed the button (for `via`, `by` and the once-a-day audit entry). */
export interface LiveActor {
  via: Exclude<BumperControlVia, 'auto' | 'system'>;
  by: string | null;
  principal: AuditActor;
  ip: string | null;
}

/** How often the auto-advance clock looks for due shows. */
const TICK_MS = 500;
/** Presence changes are batched this long before they go out. */
const PRESENCE_DEBOUNCE_MS = 300;
const PING_MS = 15_000;

/** Channel messages that only the server understands (never sent to a client as is). */
type Internal = { type: 'keys-rotated'; which: 'output' | 'control' | 'both' };
type ChannelMessage = BumperStreamMessage | Internal;

export const archivedError = () =>
  new AppError(409, 'archived', 'This show is archived. Restore it to play it again.');

/**
 * Playback: the authoritative live state (live_* columns, one locked transaction per change),
 * control actions, the server-side auto-advance clock, presence, and the SSE fan-out on
 * `bumper:<showId>` for admin controllers, OBS outputs and docks.
 */
@Injectable()
export class BumpersLiveService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Bumpers');
  readonly presence = new PresenceRegistry();
  /** showId -> when auto-advance is due (ms). The database stays the source of truth. */
  private readonly deadlines = new Map<string, number>();
  private readonly presenceTimers = new Map<string, NodeJS.Timeout>();
  /** Current key per show, so streams opened with a rotated key end themselves. */
  private readonly keys = new Map<string, { output: string; control: string }>();
  private ticker?: NodeJS.Timeout;
  private ticking = false;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const rows = await this.db
        .select({ id: bumperShows.id, at: bumperShows.liveAdvanceAt })
        .from(bumperShows)
        .where(and(isNotNull(bumperShows.liveAdvanceAt), eq(bumperShows.status, 'active')));
      for (const r of rows) if (r.at) this.deadlines.set(r.id, r.at.getTime());
      if (rows.length)
        this.logger.log(
          `Auto-advance picked up ${rows.length} running show${rows.length === 1 ? '' : 's'}`,
        );
    } catch (err) {
      this.logger.error(`Could not load auto-advance deadlines: ${(err as Error).message}`);
    }
    this.ticker = setInterval(() => void this.tick(), TICK_MS);
    this.ticker.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.ticker);
    for (const t of this.presenceTimers.values()) clearTimeout(t);
    this.presenceTimers.clear();
  }

  /* ---------------------------------------------------------------- state */

  state(row: ShowRow, now = new Date()): BumperLiveState {
    return toLiveState(row, now);
  }

  presenceOf(showId: string): BumperPresence {
    return this.presence.snapshot(showId);
  }

  outputs(showId: string): number {
    return this.presence.outputs(showId);
  }

  /** Keep the auto-advance clock in step with a row that was just written. */
  schedule(row: Pick<ShowRow, 'id' | 'status' | 'liveAdvanceAt'>): void {
    if (row.status === 'active' && row.liveAdvanceAt)
      this.deadlines.set(row.id, row.liveAdvanceAt.getTime());
    else this.deadlines.delete(row.id);
  }

  /* ---------------------------------------------------------------- broadcast */

  private publish(showId: string, msg: ChannelMessage): void {
    this.realtime.publish(channels.bumper(showId), msg);
  }

  publishState(row: ShowRow): void {
    this.publish(row.id, { type: 'state', state: toLiveState(row) });
  }

  publishShow(row: ShowRow): void {
    this.publish(row.id, {
      type: 'show',
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  /** Deleted: every stream ends. Archived: OBS outputs and docks end, admin screens keep going. */
  revoke(showId: string, reason: 'deleted' | 'archived'): void {
    this.publish(showId, { type: 'revoked', reason });
    if (reason === 'deleted') {
      this.deadlines.delete(showId);
      this.keys.delete(showId);
      this.presence.clear(showId);
    }
  }

  /** New keys: remember them, then wake every stream so the ones holding an old key end. */
  rotated(row: ShowRow, which: 'output' | 'control' | 'both'): void {
    this.keys.set(row.id, { output: row.outputKey, control: row.controlKeyHash });
    this.publish(row.id, { type: 'keys-rotated', which });
  }

  /* ---------------------------------------------------------------- control */

  /** POST .../live and the public control endpoint. No-ops (a stale `fromSlideId`, "black" while black) change nothing. */
  async control(
    showId: string,
    input: BumperControlInput,
    actor: LiveActor,
  ): Promise<BumperLiveState> {
    const now = new Date();
    const { row, changed, firstToday } = await this.db.transaction(async (tx) => {
      const [cur] = await tx
        .select()
        .from(bumperShows)
        .where(eq(bumperShows.id, showId))
        .for('update');
      if (!cur) throw notFound("We couldn't find that show. Maybe someone deleted it?");
      if (cur.status === 'archived') throw archivedError();
      const patch = planControl(cur, input, now);
      if (!patch) return { row: cur, changed: false, firstToday: false };
      const updated = await this.writeLive(tx, cur, patch, now, actor.via, actor.by);
      return {
        row: updated,
        changed: true,
        firstToday: !cur.lastPlayedAt || !sameJakartaDay(cur.lastPlayedAt, now),
      };
    });
    if (changed) {
      this.schedule(row);
      this.publishState(row);
    }
    if (firstToday) {
      await this.audit.log({
        principal: actor.principal,
        action: 'bumper.live.start',
        resourceType: 'bumper',
        resourceId: row.id,
        summary: `Started playing "${row.title}"`,
        meta: { eventId: row.eventId, via: actor.via },
        ip: actor.ip,
      });
    }
    return toLiveState(row);
  }

  /** One live write: the patch, a new seq, who did it. `updated_at` is left alone (it tracks content edits). */
  private async writeLive(
    tx: Tx,
    cur: ShowRow,
    patch: LivePatch,
    now: Date,
    via: BumperControlVia,
    by: string | null,
  ): Promise<ShowRow> {
    const [updated] = await tx
      .update(bumperShows)
      .set({
        ...patch,
        liveSeq: sql`${bumperShows.liveSeq} + 1`,
        liveUpdatedAt: now,
        liveVia: via,
        liveBy: by,
        ...(via === 'auto' ? {} : { lastPlayedAt: now }),
        updatedAt: cur.updatedAt,
      })
      .where(eq(bumperShows.id, cur.id))
      .returning();
    return updated;
  }

  /* ---------------------------------------------------------------- auto-advance */

  private async tick(): Promise<void> {
    if (this.ticking || !this.deadlines.size) return;
    this.ticking = true;
    try {
      const now = Date.now();
      const due = [...this.deadlines].filter(([, at]) => at <= now).map(([id]) => id);
      for (const id of due) {
        this.deadlines.delete(id);
        try {
          await this.autoAdvance(id);
        } catch (err) {
          this.logger.warn(`Auto-advance for ${id} failed: ${(err as Error).message}`);
        }
      }
    } finally {
      this.ticking = false;
    }
  }

  /** The clock ran out: re-check under the row lock (another process or a button press may have won). */
  async autoAdvance(showId: string): Promise<void> {
    const now = new Date();
    const result = await this.db.transaction(async (tx) => {
      const [cur] = await tx
        .select()
        .from(bumperShows)
        .where(eq(bumperShows.id, showId))
        .for('update');
      if (!cur || cur.status !== 'active') return null;
      const patch = planAuto(cur, now);
      if (!patch) return { row: cur, changed: false };
      return { row: await this.writeLive(tx, cur, patch, now, 'auto', null), changed: true };
    });
    if (!result) return;
    this.schedule(result.row);
    if (result.changed) this.publishState(result.row);
  }

  /* ---------------------------------------------------------------- streams */

  private currentKey(showId: string, kind: BumperKeyKind): string | null {
    const k = this.keys.get(showId);
    return k ? (kind === 'output' ? k.output : k.control) : null;
  }

  private presenceChanged(showId: string): void {
    const prev = this.presenceTimers.get(showId);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      this.presenceTimers.delete(showId);
      this.publish(showId, { type: 'presence', presence: this.presence.snapshot(showId) });
    }, PRESENCE_DEBOUNCE_MS);
    t.unref();
    this.presenceTimers.set(showId, t);
  }

  /**
   * SSE for one client. `controller` is an admin screen (session auth); `output` and `dock` hold a
   * key, and their stream ends with `{type:'revoked'}` once that key is rotated, the show is
   * archived or deleted. Outputs never get presence. The first messages are the current state
   * (and presence for controllers and docks).
   */
  stream(
    row: ShowRow,
    client: { kind: BumperClientKind; cid: string | null; obs: boolean; userAgent: string | null },
  ): Observable<MessageEvent> {
    const showId = row.id;
    const kind = client.kind;
    const keyKind: BumperKeyKind | null =
      kind === 'output' ? 'output' : kind === 'dock' ? 'control' : null;
    const myKey =
      keyKind === 'output' ? row.outputKey : keyKind === 'control' ? row.controlKeyHash : null;
    if (keyKind && !this.keys.has(showId))
      this.keys.set(showId, { output: row.outputKey, control: row.controlKeyHash });
    const stale = () => keyKind !== null && this.currentKey(showId, keyKind) !== myKey;
    const agent = parseAgent(client.userAgent);
    const obs = client.obs || /\bOBS\//.test(client.userAgent ?? '');

    return new Observable<MessageEvent>((sub) => {
      const send = (msg: BumperStreamMessage) => sub.next({ data: msg });
      const end = (msg: BumperStreamMessage) => {
        if (sub.closed) return;
        send(msg);
        sub.complete();
      };
      let removePresence: (() => void) | null = null;
      const inner = this.realtime
        .stream(channels.bumper(showId), {
          pingMs: PING_MS,
          onClose: () => {
            removePresence?.();
            removePresence = null;
            this.presenceChanged(showId);
          },
        })
        .subscribe({
          next: (m) => {
            const msg = m.data as ChannelMessage;
            if (stale()) return end({ type: 'revoked', reason: 'rotated' });
            switch (msg.type) {
              case 'keys-rotated':
                return;
              case 'revoked':
                if (kind === 'controller' && msg.reason !== 'deleted') return;
                return end(msg);
              case 'presence':
                if (kind === 'output') return;
                return send(msg);
              default:
                return send(msg);
            }
          },
          complete: () => sub.complete(),
        });
      removePresence = this.presence.add(showId, { cid: client.cid, kind, obs, agent });
      this.presenceChanged(showId);

      // The snapshot is read after subscribing, so no change can fall between the two.
      void this.db
        .select()
        .from(bumperShows)
        .where(eq(bumperShows.id, showId))
        .limit(1)
        .then(([fresh]) => {
          if (sub.closed) return;
          if (!fresh) return end({ type: 'revoked', reason: 'deleted' });
          if (stale()) return end({ type: 'revoked', reason: 'rotated' });
          if (kind !== 'controller' && fresh.status === 'archived')
            return end({ type: 'revoked', reason: 'archived' });
          send({ type: 'state', state: toLiveState(fresh) });
          if (kind !== 'output')
            send({ type: 'presence', presence: this.presence.snapshot(showId) });
        })
        .catch((err: unknown) =>
          this.logger.warn(
            `Snapshot for bumper stream ${showId} failed: ${(err as Error).message}`,
          ),
        );

      return () => inner.unsubscribe();
    });
  }
}
