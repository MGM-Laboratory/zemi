import { z } from 'zod';
import { policySchema, type Policy } from '../rbac.js';
import { isoDate } from './common.js';

export const passphraseSchema = z
  .string()
  .min(12, 'Make it at least 12 characters.')
  .max(128)
  .refine((s) => s.trim().length === s.length, 'No spaces at the start or end.');

export const adminCreateInput = z.object({
  name: z.string().min(1).max(120),
  note: z.string().max(500).optional().nullable(),
  expiresAt: isoDate.optional().nullable(),
  passphrase: passphraseSchema,
  policy: policySchema,
});
export type AdminCreateInput = z.infer<typeof adminCreateInput>;

export const adminUpdateInput = z.object({
  name: z.string().min(1).max(120).optional(),
  note: z.string().max(500).optional().nullable(),
  expiresAt: isoDate.optional().nullable(),
  disabled: z.boolean().optional(),
  policy: policySchema.optional(),
});
export type AdminUpdateInput = z.infer<typeof adminUpdateInput>;

export const adminPassphraseInput = z.object({ passphrase: passphraseSchema });

export interface AdminSummary {
  id: string;
  name: string;
  note: string | null;
  expiresAt: string | null;
  disabledAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'expired' | 'disabled';
  policy: Policy;
  activeSessions: number;
}

export interface SessionSummary {
  id: string;
  principalType: 'superadmin' | 'admin';
  adminId: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
  current: boolean;
}

export interface AuditEntry {
  id: string;
  actorType: 'superadmin' | 'admin' | 'system' | 'public';
  actorId: string | null;
  actorName: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  summary: string;
  meta: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export const auditQuery = z.object({
  actor: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  action: z.string().optional(),
  /** Inclusive lower bound on createdAt (ISO instant). Added by admin-site-access for the date range filter. */
  from: isoDate.optional(),
  /** Exclusive upper bound on createdAt (ISO instant). */
  to: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export interface SystemStatus {
  version: string;
  now: string;
  uptimeSec: number;
  database: { ok: boolean; latencyMs: number | null };
  storage: { ok: boolean; bucket: string; endpoint: string };
  email: { provider: 'resend' | 'outbox'; from: string; ok: boolean };
  media: { ok: boolean; rtmpUrl: string; activePaths: number };
  jobs: { ok: boolean; queued: number; failed24h: number };
  counts: Record<string, number>;
}
