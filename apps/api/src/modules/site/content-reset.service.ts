import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Policy, type ResetContentResult, normalizePolicy } from '@zemi/shared';
import { eq, inArray } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { DB, type Db, type Tx } from '../../db/client.js';
import {
  admins,
  assets,
  checkins,
  contactMessages,
  emailLogs,
  eventMedia,
  eventPublications,
  eventSpeakers,
  eventStreams,
  events,
  faqs,
  publicationAuthors,
  publications,
  recordingSegments,
  registrations,
  rundownItems,
  siteSettings,
  slugRedirects,
  speakers,
  streamSessions,
  teamMembers,
  venues,
} from '../../db/schema.js';
import type { AuditActor } from '../audit/audit.service.js';
import { AuditService } from '../audit/audit.service.js';
import { tags } from '../revalidate/revalidate.service.js';
import { StorageService } from '../storage/storage.service.js';
import { SiteService } from './site.service.js';

/**
 * Tables emptied by the content reset, children first so no foreign key complains. Kept on purpose:
 * admins, sessions, audit_logs and site_settings (their references to deleted rows are nulled).
 */
const WIPE: Array<[string, PgTable]> = [
  ['checkins', checkins],
  ['email_logs', emailLogs],
  ['registrations', registrations],
  ['event_media', eventMedia],
  ['stream_sessions', streamSessions],
  ['event_streams', eventStreams],
  ['recording_segments', recordingSegments],
  ['event_publications', eventPublications],
  ['event_speakers', eventSpeakers],
  ['rundown_items', rundownItems],
  ['publication_authors', publicationAuthors],
  ['events', events],
  ['publications', publications],
  ['speakers', speakers],
  ['slug_redirects', slugRedirects],
  ['venues', venues],
  ['faqs', faqs],
  ['team_members', teamMembers],
  ['contact_messages', contactMessages],
  ['assets', assets],
];

/** Site settings fields that point at rows the reset deletes. */
const SETTING_REFS: Array<[key: string, field: string]> = [
  ['general', 'defaultVenueId'],
  ['home', 'featuredEventId'],
  ['seo', 'ogImageAssetId'],
];

const rowCount = (result: unknown) => Number((result as { count?: number } | null)?.count ?? 0);

/**
 * Wipes every piece of content (events, people, papers, registrations, media and their bucket files,
 * FAQ, team, inbox, rooms) while keeping admins, sessions, the audit log and site settings. Used by
 * `POST /admin/system/reset-content` before going live, and by the seeder's `--reset`.
 */
@Injectable()
export class ContentResetService {
  private readonly logger = new Logger('ContentReset');

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly site: SiteService,
  ) {}

  async resetContent(ctx: { principal: AuditActor; ip: string | null }): Promise<ResetContentResult> {
    const started = Date.now();
    const deleted: Record<string, number> = {};
    let adminsPruned = 0;
    let segmentKeys: string[] = [];

    await this.db.transaction(async (tx) => {
      segmentKeys = (await tx.select({ key: recordingSegments.s3Key }).from(recordingSegments)).map((r) => r.key);
      for (const [name, table] of WIPE) deleted[name] = rowCount(await tx.delete(table));
      adminsPruned = await this.pruneGrants(tx);
      await this.clearSettingRefs(tx);
    });

    // Files go after the commit: a failed delete leaves orphans in the bucket, never rows without files.
    let bucketObjects = 0;
    // recordings/raw/ holds MediaMTX's raw segments (stream module); with every event gone, none are needed.
    const prefixes = ['assets/', 'segments/', 'recordings/raw/'];
    for (const prefix of prefixes) {
      try {
        bucketObjects += await this.storage.deletePrefix(prefix);
      } catch (err) {
        this.logger.error(`Could not empty ${prefix} in the bucket: ${(err as Error).message}`);
      }
    }
    const stray = segmentKeys.filter((k) => !prefixes.some((p) => k.startsWith(p)));
    if (stray.length) bucketObjects += await this.storage.deleteKeys(stray).catch(() => 0);

    const total = Object.values(deleted).reduce((a, b) => a + b, 0);
    await this.audit.log({
      principal: ctx.principal,
      action: 'system.reset-content',
      resourceType: 'system',
      summary: `Deleted all content (${total} rows, ${bucketObjects} files)`,
      meta: { deleted, bucketObjects, adminsPruned, ms: Date.now() - started },
      ip: ctx.ip,
    });
    this.site.changed([tags.events, tags.speakers, tags.publications]);
    this.logger.log(`Content reset: ${total} rows and ${bucketObjects} files removed in ${Date.now() - started}ms`);
    return { ok: true, deleted, bucketObjects, adminsPruned };
  }

  /** Grants on specific (now deleted) items are dropped. Wildcard grants and capabilities stay. */
  private async pruneGrants(tx: Tx): Promise<number> {
    const rows = await tx.select({ id: admins.id, policy: admins.policy }).from(admins);
    let pruned = 0;
    for (const row of rows) {
      const policy = normalizePolicy(row.policy);
      const grants = policy.grants.filter((g) => g.id === '*');
      if (grants.length === policy.grants.length) continue;
      const next: Policy = { capabilities: policy.capabilities, grants };
      await tx.update(admins).set({ policy: next }).where(eq(admins.id, row.id));
      pruned++;
    }
    return pruned;
  }

  private async clearSettingRefs(tx: Tx): Promise<void> {
    const keys = [...new Set(['general', ...SETTING_REFS.map(([k]) => k)])];
    const rows = await tx.select().from(siteSettings).where(inArray(siteSettings.key, keys));
    for (const row of rows) {
      const value = { ...(row.value ?? {}) };
      let dirty = false;
      for (const [key, field] of SETTING_REFS) {
        if (key === row.key && value[field]) {
          value[field] = null;
          dirty = true;
        }
      }
      // An announcement that links to an event page now points at nothing: switch it off.
      if (row.key === 'general') {
        const ann = value.announcement as { active?: boolean; href?: string | null } | undefined;
        if (ann?.active && typeof ann.href === 'string' && /\/events\//.test(ann.href)) {
          value.announcement = { ...ann, active: false };
          dirty = true;
        }
      }
      if (dirty) await tx.update(siteSettings).set({ value, updatedAt: new Date() }).where(eq(siteSettings.key, row.key));
    }
  }
}
