import { Inject, Injectable } from '@nestjs/common';
import {
  normalizePolicy,
  withOwnerGrant,
  withoutResource,
  type Ability,
  type ActionFor,
  type Capability,
  type Principal,
  type ResourceType,
} from '@zemi/shared';
import { eq, sql } from 'drizzle-orm';
import { forbidden } from '../common/errors.js';
import { DB, type Db, type DbOrTx } from '../db/client.js';
import { admins } from '../db/schema.js';

const NOUN: Record<ResourceType, string> = { event: 'event', speaker: 'speaker', publication: 'publication' };

/** 403 unless the ability can do `action` on this resource. */
export function assertCan<T extends ResourceType>(ability: Ability, type: T, id: string, action: ActionFor<T>, message?: string): void {
  if (!ability.can(type, id, action)) {
    throw forbidden(message ?? `You don't have permission to do that on this ${NOUN[type]}.`, { details: { type, id, action } });
  }
}

/** 403 unless the ability has the global capability. */
export function assertCapability(ability: Ability, cap: Capability, message?: string): void {
  if (!ability.has(cap)) throw forbidden(message ?? "You don't have permission to do that.", { details: { capability: cap } });
}

/** 403 unless superadmin. */
export function assertSuperadmin(ability: Ability): void {
  if (!ability.isSuperadmin) throw forbidden('Only the superadmin can do that.');
}

/**
 * Which resources of a type the ability may `action` (default 'view'), for list filtering:
 * `'all'` (superadmin or wildcard grant) or an explicit id list (possibly empty).
 *
 *   const ids = visibleIds(ability, 'event');
 *   const where = ids === 'all' ? undefined : ids.length ? inArray(events.id, ids) : sql`false`;
 */
export function visibleIds<T extends ResourceType>(ability: Ability, type: T, action: ActionFor<T> = 'view'): 'all' | string[] {
  if (ability.isSuperadmin || ability.canAll(type, action)) return 'all';
  return ability.idsWith(type, action);
}

/**
 * Speaker and publication lookups (`GET /admin/<type>/lookup`) feed the pickers in the event and
 * publication editors and the command palette. Allowed for anyone who can create or edit content
 * (they need the full directory to link things) and for anyone who can view at least one of that
 * type (the palette). Everyone else, like a zero-grant admin or door crew, gets a 403. Callers
 * still filter drafts with `visibleIds`.
 */
export function assertCanLookup(ability: Ability, type: 'speaker' | 'publication'): void {
  const picks =
    ability.isSuperadmin ||
    ability.has('events.create') ||
    ability.has('speakers.create') ||
    ability.has('publications.create') ||
    ability.canAny('event', 'edit') ||
    ability.canAny('speaker', 'edit') ||
    ability.canAny('publication', 'edit');
  if (picks || ability.canAny(type, 'view')) return;
  throw forbidden(`Searching ${type === 'speaker' ? 'speakers' : 'publications'} needs access to some content first.`, {
    details: { type, action: 'view' },
  });
}

/**
 * RBAC helpers for feature modules. The pure functions above are also exported for use without DI.
 */
@Injectable()
export class PermissionsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  assertCan = assertCan;
  assertCapability = assertCapability;
  assertSuperadmin = assertSuperadmin;
  visibleIds = visibleIds;

  /** Effective actions on a resource, for the `permissions` field of list items. */
  actionsOn<T extends ResourceType>(ability: Ability, type: T, id: string): ActionFor<T>[] {
    return ability.actionsOn(type, id);
  }

  /**
   * When a normal admin creates an event/speaker/publication, give them a full grant on it
   * (SPEC section 6). No-op for the superadmin. Pass the transaction you created the row in.
   * Locked read-modify-write, so concurrent creates never drop each other's grants.
   */
  async grantOwnership(principal: Principal, type: ResourceType, id: string, db: DbOrTx = this.db): Promise<void> {
    if (principal.kind !== 'admin') return;
    const run = async (tx: DbOrTx) => {
      const [row] = await tx.select({ policy: admins.policy }).from(admins).where(eq(admins.id, principal.id)).for('update');
      if (!row) return;
      const next = withOwnerGrant(normalizePolicy(row.policy), type, id);
      await tx.update(admins).set({ policy: next }).where(eq(admins.id, principal.id));
    };
    // Row locks need a transaction: reuse the caller's, or open one.
    if (db === this.db) await this.db.transaction(run);
    else await run(db);
  }

  /** Remove grants pointing at a deleted resource from every admin's policy. */
  async removeResourceGrants(type: ResourceType, id: string, db: DbOrTx = this.db): Promise<void> {
    const rows = await db
      .select({ id: admins.id, policy: admins.policy })
      .from(admins)
      .where(sql`${admins.policy}->'grants' @> ${JSON.stringify([{ type, id }])}::jsonb`);
    for (const r of rows) {
      await db
        .update(admins)
        .set({ policy: withoutResource(normalizePolicy(r.policy), type, id) })
        .where(eq(admins.id, r.id));
    }
  }
}
