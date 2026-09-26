import type { Ability, AssetKind, Principal } from '@zemi/shared';
import { inArray } from 'drizzle-orm';
import { conflict, validationError } from '../../common/errors.js';
import type { DbOrTx } from '../../db/client.js';
import { assets } from '../../db/schema.js';

/**
 * Helpers shared by the speakers and publications modules (api-content workstream).
 */

/** Who is doing the thing, for audit + RBAC. */
export interface ContentCtx {
  principal: Principal;
  ability: Ability;
  ip: string | null;
}

/**
 * zod `.partial()` still applies `.default()`s in zod 4 (verified: `publicationUpdateInput.parse({ title })`
 * returns `authors: []`, `visibility: 'published'`...). For PATCH we keep only the keys the client sent.
 */
export function presentOnly<T extends object>(parsed: T, raw: unknown): Partial<T> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const sent = new Set(Object.keys(raw));
  return Object.fromEntries(Object.entries(parsed).filter(([k]) => sent.has(k))) as Partial<T>;
}

export const has = <T extends object>(patch: T, key: keyof T): boolean => Object.prototype.hasOwnProperty.call(patch, key);

/** '' and whitespace become null; everything else is trimmed. */
export function blankToNull(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t ? t : null;
}

/**
 * Required text that is only spaces. zod `min(1)` lets `"   "` through and we trim before saving,
 * which would store an empty name or title. Throws a 400 whose issue pins the form field.
 */
export function assertNotBlank(value: string | null | undefined, path: Array<string | number>, message: string): void {
  if (typeof value === 'string' && !value.trim()) throw validationError(message, [{ path, message, code: 'custom' }]);
}

export const iso = (d: Date) => d.toISOString();

const KIND_WORD: Record<AssetKind, string> = { image: 'a photo', video: 'a video', document: 'a PDF', audio: 'an audio file' };

export interface AssetCheck {
  id: string | null | undefined;
  path: Array<string | number>;
  kinds: AssetKind[];
  /** For the message: "cover", "avatar"... */
  label: string;
}

/**
 * Friendly 400s for asset ids that don't exist or have the wrong kind (instead of a bare FK 409).
 * One query for all checks.
 */
export async function assertAssets(db: DbOrTx, checks: AssetCheck[]): Promise<void> {
  const wanted = checks.filter((c): c is AssetCheck & { id: string } => !!c.id);
  if (!wanted.length) return;
  const rows = await db
    .select({ id: assets.id, kind: assets.kind, status: assets.status })
    .from(assets)
    .where(inArray(assets.id, [...new Set(wanted.map((c) => c.id))]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const issues: Array<{ path: Array<string | number>; message: string; code: 'custom' }> = [];
  for (const c of wanted) {
    const row = byId.get(c.id);
    if (!row) issues.push({ path: c.path, message: `That ${c.label} upload is gone. Try uploading it again.`, code: 'custom' });
    else if (!c.kinds.includes(row.kind)) {
      issues.push({ path: c.path, message: `The ${c.label} needs to be ${c.kinds.map((k) => KIND_WORD[k]).join(' or ')}.`, code: 'custom' });
    } else if (row.status === 'failed') {
      issues.push({ path: c.path, message: `That ${c.label} didn't process. Try another file.`, code: 'custom' });
    }
  }
  if (issues.length) throw validationError(issues.length === 1 ? issues[0].message : 'Some uploads need another look.', issues);
}

/** Postgres unique violation (possibly wrapped by drizzle) on a constraint whose name contains `hint`. */
export function isUniqueViolation(err: unknown, hint: string): boolean {
  let e: unknown = err;
  for (let i = 0; i < 4 && e && typeof e === 'object'; i++) {
    const x = e as { code?: unknown; constraint_name?: unknown; constraint?: unknown; cause?: unknown };
    if (x.code === '23505') {
      const raw = x.constraint_name ?? x.constraint;
      const name = typeof raw === 'string' ? raw : '';
      return !hint || name.includes(hint);
    }
    e = x.cause;
  }
  return false;
}

/** Same 409 body as SlugService.ensureUniqueSlug, for the rare race between the check and the insert. */
export function slugTaken(slug: string) {
  const message = `The address "${slug}" is already taken. Try another one.`;
  return conflict(message, { details: { field: 'slug', slug, issues: [{ path: ['slug'], message, code: 'custom' }] } });
}

function stable(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(',')}}`;
}

/** Remove keys whose new value equals the stored one (jsonb compared structurally), so audit `fields` stay honest. */
export function dropUnchanged<T extends object>(set: T, current: object): T {
  const cur = current as Record<string, unknown>;
  const next = set as Record<string, unknown>;
  for (const key of Object.keys(next)) {
    if (stable(next[key]) === stable(cur[key])) delete next[key];
  }
  return set;
}
