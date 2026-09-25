import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AuditEntry, Principal } from '@zemi/shared';
import { DB, type Db, type DbOrTx } from '../../db/client.js';
import { auditLogs } from '../../db/schema.js';

export type AuditRow = typeof auditLogs.$inferSelect;

/** Who did it: a signed-in principal, the system (jobs, hooks), or a member of the public. */
export type AuditActor = Principal | 'system' | { kind: 'public'; name?: string; id?: string | null };

export interface AuditInput {
  /** Pass `principal` for admin actions. Omit (or 'system') for jobs and hooks. */
  principal?: AuditActor | null;
  /** Dotted verb: `event.update`, `admin.create`, `asset.delete`, `registration.check-in`... */
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  /** One human sentence: `Renamed "Zemi #12" to "Zemi #12: robots"`. */
  summary: string;
  meta?: Record<string, unknown> | null;
  ip?: string | null;
}

export function toAuditEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    actorType: row.actorType,
    actorId: row.actorId ?? null,
    actorName: row.actorName,
    action: row.action,
    resourceType: row.resourceType ?? null,
    resourceId: row.resourceId ?? null,
    summary: row.summary,
    meta: row.meta ?? null,
    ip: row.ip ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Append-only audit log. `log()` never throws: a failed audit write is logged and swallowed so it
 * can't break the action it describes. Await it (it is quick) or fire and forget.
 *
 *   await this.audit.log({ principal, action: 'event.update', resourceType: 'event', resourceId: id,
 *     summary: `Updated "${title}"`, meta: { fields: Object.keys(patch) }, ip });
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(@Inject(DB) private readonly db: Db) {}

  async log(input: AuditInput, db: DbOrTx = this.db): Promise<void> {
    try {
      const actor = input.principal ?? 'system';
      let actorType: AuditRow['actorType'];
      let actorId: string | null;
      let actorName: string;
      if (actor === 'system') {
        actorType = 'system';
        actorId = null;
        actorName = 'System';
      } else if (actor.kind === 'public') {
        actorType = 'public';
        actorId = actor.id ?? null;
        actorName = actor.name ?? 'Visitor';
      } else {
        actorType = actor.kind;
        actorId = actor.id;
        actorName = actor.name;
      }
      await db.insert(auditLogs).values({
        actorType,
        actorId,
        actorName: actorName.slice(0, 200),
        action: input.action.slice(0, 100),
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        summary: input.summary.slice(0, 1000),
        meta: input.meta ?? null,
        ip: input.ip ?? null,
      });
    } catch (err) {
      this.logger.error(`Could not write audit log for ${input.action}: ${(err as Error).message}`);
    }
  }
}
