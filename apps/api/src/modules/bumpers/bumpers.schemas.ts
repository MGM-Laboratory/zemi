/**
 * Request schemas the shared contract leaves out (the web client in components/bumpers/api.ts sends
 * exactly these shapes), plus the key and client id formats of the public routes.
 */
import { z } from 'zod';

/** OBS output keys (32) and control keys (40) are base62; anything else is a 404 without a lookup. */
export const BUMPER_KEY_RE = /^[A-Za-z0-9]{24,64}$/;
export const bumperKeySchema = z.string().regex(BUMPER_KEY_RE, "We couldn't find that link.");

// Rotate, duplicate and restore bodies live in the shared contract.
export { bumperDuplicateInput, bumperRestoreInput, bumperRotateInput, type BumperDuplicateInput, type BumperRestoreInput, type BumperRotateInput } from '@zemi/shared';
export type BumperKeyKind = 'output' | 'control';

/** Client ids the pages make up for presence (newBumperId on the web). */
const CID_RE = /^[A-Za-z0-9_-]{4,64}$/;

/** ?cid&client=controller on the admin stream, ?cid&obs=1 on the public ones. Bad values are ignored, not errors. */
export const bumperStreamQuery = z.object({
  cid: z
    .string()
    .optional()
    .transform((v) => (v && CID_RE.test(v) ? v : null)),
  obs: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  client: z.string().optional(),
});
export type BumperStreamQuery = z.infer<typeof bumperStreamQuery>;
