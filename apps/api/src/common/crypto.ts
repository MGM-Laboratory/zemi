import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomInt,
  timingSafeEqual as nodeTimingSafeEqual,
} from 'node:crypto';

/**
 * Small, dependency-free crypto toolbox. Pure functions; `CryptoService` binds them to APP_SECRET.
 */

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** URL-safe random token (default 32 bytes = 256 bits, 43 chars). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Uniform random string from [0-9A-Za-z] (no modulo bias). */
export function randomBase62(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += BASE62[randomInt(62)];
  return out;
}

/** Uniform random string from a custom alphabet. */
export function randomFromAlphabet(alphabet: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hmacSha256(secret: string | Buffer, data: string | Buffer, encoding: 'hex' | 'base64url' = 'hex'): string {
  return createHmac('sha256', secret).update(data).digest(encoding);
}

/**
 * Constant-time string comparison. Both sides are hashed first so the comparison does not leak
 * the length of the secret.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return nodeTimingSafeEqual(ha, hb) && a.length === b.length;
}

/** Derive a 32-byte subkey from APP_SECRET for one purpose (HKDF-SHA256). */
export function deriveKey(secret: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.from('zemi', 'utf8'), Buffer.from(purpose, 'utf8'), 32));
}

const ENC_VERSION = 'v1';

/**
 * AES-256-GCM. Output: `v1.<iv>.<tag>.<ciphertext>` (base64url parts). Safe to store in a text column.
 * `aad` binds the ciphertext to a context (e.g. the row id) so it can't be swapped between rows.
 */
export function encryptString(key: Buffer, plaintext: string, aad?: string): string {
  if (key.length !== 32) throw new Error('AES-256-GCM needs a 32-byte key');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENC_VERSION, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptString(key: Buffer, payload: string, aad?: string): string {
  const [version, ivB64, tagB64, ctB64] = payload.split('.');
  if (version !== ENC_VERSION || !ivB64 || !tagB64 || ctB64 === undefined) throw new Error('Unrecognised ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
  if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8');
}

/**
 * Compact signed token: `<payload b64url>.<hmac b64url>`. Payload is JSON with `p` (purpose) and
 * `exp` (unix seconds). Used for short-lived capability links such as HLS preview tokens.
 */
export function signToken(key: Buffer, purpose: string, data: Record<string, unknown>, ttlSec: number, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...data, p: purpose, exp: Math.floor(now / 1000) + ttlSec }), 'utf8').toString('base64url');
  return `${body}.${hmacSha256(key, body, 'base64url')}`;
}

export function verifyToken<T extends Record<string, unknown> = Record<string, unknown>>(
  key: Buffer,
  purpose: string,
  token: string,
  now = Date.now(),
): (T & { exp: number }) | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!timingSafeEqualStr(sig, hmacSha256(key, body, 'base64url'))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { p?: unknown; exp?: unknown };
    if (data.p !== purpose || typeof data.exp !== 'number' || data.exp * 1000 < now) return null;
    return data as T & { exp: number };
  } catch {
    return null;
  }
}
