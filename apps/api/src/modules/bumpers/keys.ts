/**
 * OBS link keys. The output key is a read-only capability (like a ticket token) and is stored as
 * is; the control key drives the show, so only its sha256 (for lookup) and an AES-GCM copy bound
 * to the show id (to show it again in Studio) are stored. Both come from node:crypto, never from
 * a seeded generator.
 */
import { randomBase62, sha256 } from '../../common/crypto.js';

export const OUTPUT_KEY_LENGTH = 32;
export const CONTROL_KEY_LENGTH = 40;

export type Encrypt = (plaintext: string, aad: string) => string;

export const newOutputKey = (): string => randomBase62(OUTPUT_KEY_LENGTH);

export const controlKeyHash = (key: string): string => sha256(key);

/** A fresh control key as the two columns that store it. */
export function newControlKey(
  encrypt: Encrypt,
  showId: string,
): { controlKeyHash: string; controlKeyEnc: string } {
  const key = randomBase62(CONTROL_KEY_LENGTH);
  return { controlKeyHash: controlKeyHash(key), controlKeyEnc: encrypt(key, showId) };
}

/** Both keys for a new show. */
export function newShowKeys(
  encrypt: Encrypt,
  showId: string,
): { outputKey: string; controlKeyHash: string; controlKeyEnc: string } {
  return { outputKey: newOutputKey(), ...newControlKey(encrypt, showId) };
}

/** Postgres unique violation (a key collision is astronomically rare, but we retry anyway). */
export const isUniqueViolation = (err: unknown): boolean => {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
};
