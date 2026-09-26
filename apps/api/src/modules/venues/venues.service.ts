import { Inject, Injectable } from '@nestjs/common';
import type { Principal, Venue, VenueInput } from '@zemi/shared';
import { and, asc, count, eq, ilike, ne, or, sql } from 'drizzle-orm';
import { conflict, notFound, searchPattern } from '../../common/index.js';
import { DB, type Db } from '../../db/client.js';
import { events, venues } from '../../db/schema.js';
import { AuditService } from '../audit/audit.service.js';
import { RevalidateService, tags } from '../revalidate/revalidate.service.js';

type VenueRow = typeof venues.$inferSelect;

export interface VenueDeleteResult {
  ok: true;
  /** Events that used this room. Their room is now empty (the FK sets venue_id to null). */
  detachedEvents: number;
  /** A friendly heads-up when events lost their room, else null. */
  warning: string | null;
}

interface Ctx {
  principal: Principal;
  ip: string | null;
}

const text = (v: string | null | undefined) => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

export function toVenue(row: VenueRow, eventCount: number): Venue {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    building: row.building ?? null,
    floor: row.floor ?? null,
    capacity: row.capacity ?? null,
    address: row.address ?? null,
    mapsUrl: row.mapsUrl ?? null,
    notes: row.notes ?? null,
    eventCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Reusable rooms (classrooms, theaters, labs...). Small table: lists are not paginated. */
@Injectable()
export class VenuesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly revalidate: RevalidateService,
  ) {}

  async list(search?: string | null): Promise<Venue[]> {
    // Postgres text can't hold NUL bytes (the query would fail with 22021).
    const p = searchPattern(search?.replaceAll('\u0000', ''));
    // Qualify both sides: in a single-table select Drizzle renders columns unqualified, and
    // "venue_id" = "id" would then compare events.venue_id with events.id (always 0).
    const eventCount =
      sql<number>`(select count(*) from ${events} where ${events}.${sql.identifier(events.venueId.name)} = ${venues}.${sql.identifier(venues.id.name)})`.mapWith(
        Number,
      );
    const rows = await this.db
      .select({ venue: venues, eventCount })
      .from(venues)
      .where(
        p
          ? or(
              ilike(venues.name, p),
              ilike(venues.building, p),
              ilike(venues.address, p),
              ilike(venues.notes, p),
            )
          : undefined,
      )
      .orderBy(asc(sql`lower(${venues.name})`), asc(venues.createdAt));
    return rows.map((r) => toVenue(r.venue, r.eventCount));
  }

  async get(id: string): Promise<Venue> {
    const [row] = await this.db.select().from(venues).where(eq(venues.id, id)).limit(1);
    if (!row) throw notFound("We couldn't find that room.");
    const [c] = await this.db.select({ n: count() }).from(events).where(eq(events.venueId, id));
    return toVenue(row, c?.n ?? 0);
  }

  async create(input: VenueInput, ctx: Ctx): Promise<Venue> {
    const values = this.values(input);
    await this.assertNameFree(values.name, values.building, null);
    const [row] = await this.db.insert(venues).values(values).returning();
    await this.audit.log({
      principal: ctx.principal,
      action: 'venue.create',
      resourceType: 'venue',
      resourceId: row.id,
      summary: `Added the room "${row.name}"`,
      ip: ctx.ip,
    });
    return toVenue(row, 0);
  }

  async update(id: string, patch: Partial<VenueInput>, ctx: Ctx): Promise<Venue> {
    const [current] = await this.db.select().from(venues).where(eq(venues.id, id)).limit(1);
    if (!current) throw notFound("We couldn't find that room.");
    const set: Partial<typeof venues.$inferInsert> = {};
    if (patch.name !== undefined) set.name = patch.name.trim() || current.name;
    if (patch.kind !== undefined) set.kind = patch.kind;
    if (patch.building !== undefined) set.building = text(patch.building);
    if (patch.floor !== undefined) set.floor = text(patch.floor);
    if (patch.capacity !== undefined) set.capacity = patch.capacity ?? null;
    if (patch.address !== undefined) set.address = text(patch.address);
    if (patch.mapsUrl !== undefined) set.mapsUrl = text(patch.mapsUrl);
    if (patch.notes !== undefined) set.notes = text(patch.notes);
    const fields = Object.keys(set);
    if (!fields.length) return this.get(id);
    if (set.name !== undefined || set.building !== undefined) {
      await this.assertNameFree(
        set.name ?? current.name,
        set.building !== undefined ? set.building : current.building,
        id,
      );
    }
    await this.db.update(venues).set(set).where(eq(venues.id, id));
    await this.audit.log({
      principal: ctx.principal,
      action: 'venue.update',
      resourceType: 'venue',
      resourceId: id,
      summary: `Updated the room "${set.name ?? current.name}"`,
      meta: { fields },
      ip: ctx.ip,
    });
    await this.revalidateEvents(id);
    return this.get(id);
  }

  /** Allowed even when events use the room: they keep going, just without a room (FK set null). */
  async remove(id: string, ctx: Ctx): Promise<VenueDeleteResult> {
    const [current] = await this.db.select().from(venues).where(eq(venues.id, id)).limit(1);
    if (!current) throw notFound("We couldn't find that room.");
    const used = await this.db.select({ id: events.id }).from(events).where(eq(events.venueId, id));
    await this.db.delete(venues).where(eq(venues.id, id));
    const n = used.length;
    await this.audit.log({
      principal: ctx.principal,
      action: 'venue.delete',
      resourceType: 'venue',
      resourceId: id,
      summary: `Deleted the room "${current.name}"${n ? ` (${n === 1 ? '1 event now has' : `${n} events now have`} no room)` : ''}`,
      meta: { detachedEvents: n, eventIds: used.map((u) => u.id) },
      ip: ctx.ip,
    });
    if (n) void this.revalidate.revalidate([tags.events, ...used.map((u) => tags.event(u.id))]);
    return {
      ok: true,
      detachedEvents: n,
      warning: n
        ? `${n === 1 ? '1 event' : `${n} events`} used this room and now ${n === 1 ? 'has' : 'have'} no room set. Give ${n === 1 ? 'it' : 'them'} a new one.`
        : null,
    };
  }

  private values(input: VenueInput): typeof venues.$inferInsert {
    return {
      name: input.name.trim(),
      kind: input.kind,
      building: text(input.building),
      floor: text(input.floor),
      capacity: input.capacity ?? null,
      address: text(input.address),
      mapsUrl: text(input.mapsUrl),
      notes: text(input.notes),
    };
  }

  /** Same name in the same building (ignoring case) is almost always a double add. */
  private async assertNameFree(
    name: string,
    building: string | null | undefined,
    excludeId: string | null,
  ): Promise<void> {
    const sameBuilding = building
      ? sql`lower(coalesce(${venues.building}, '')) = lower(${building})`
      : sql`coalesce(${venues.building}, '') = ''`;
    const [dupe] = await this.db
      .select({ id: venues.id })
      .from(venues)
      .where(
        and(
          sql`lower(${venues.name}) = lower(${name})`,
          sameBuilding,
          excludeId ? ne(venues.id, excludeId) : undefined,
        ),
      )
      .limit(1);
    if (dupe) {
      const message = `You already have a room called "${name}"${building ? ` in ${building}` : ''}.`;
      throw conflict(message, {
        details: { field: 'name', issues: [{ path: ['name'], message, code: 'custom' }] },
      });
    }
  }

  /** Events show the room (cards, detail, calendar files): bump them and tell the web. */
  private async revalidateEvents(venueId: string): Promise<void> {
    const used = await this.db
      .update(events)
      .set({ updatedAt: new Date() })
      .where(eq(events.venueId, venueId))
      .returning({ id: events.id });
    if (used.length)
      void this.revalidate.revalidate([tags.events, ...used.map((u) => tags.event(u.id))]);
  }
}
