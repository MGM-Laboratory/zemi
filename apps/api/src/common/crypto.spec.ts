import { describe, expect, it } from 'vitest';
import {
  decryptString,
  deriveKey,
  encryptString,
  hmacSha256,
  randomBase62,
  randomToken,
  sha256,
  signToken,
  timingSafeEqualStr,
  verifyToken,
} from './crypto.js';

describe('random', () => {
  it('randomToken is base64url with 256 bits by default', () => {
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken(16)).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(new Set(Array.from({ length: 100 }, () => randomToken())).size).toBe(100);
  });

  it('randomBase62 uses only [0-9A-Za-z] and the requested length', () => {
    const s = randomBase62(2000);
    expect(s).toHaveLength(2000);
    expect(s).toMatch(/^[0-9A-Za-z]+$/);
    // Every symbol should show up in 2000 draws.
    expect(new Set(s).size).toBe(62);
  });
});

describe('hashing', () => {
  it('sha256 and hmac match known vectors', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    // RFC 4231 test case 2
    expect(hmacSha256('Jefe', 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });

  it('timingSafeEqualStr compares any lengths safely', () => {
    expect(timingSafeEqualStr('same', 'same')).toBe(true);
    expect(timingSafeEqualStr('same', 'Same')).toBe(false);
    expect(timingSafeEqualStr('short', 'much-longer-string')).toBe(false);
    expect(timingSafeEqualStr('', '')).toBe(true);
  });
});

describe('AES-256-GCM', () => {
  const key = deriveKey('an-app-secret-with-plenty-of-characters', 'aes-256-gcm:v1');

  it('derives distinct 32-byte keys per purpose', () => {
    expect(key).toHaveLength(32);
    expect(deriveKey('an-app-secret-with-plenty-of-characters', 'other').equals(key)).toBe(false);
  });

  it('round-trips and uses a fresh IV each time', () => {
    const a = encryptString(key, 'private-stream-key');
    const b = encryptString(key, 'private-stream-key');
    expect(a).not.toBe(b);
    expect(a.startsWith('v1.')).toBe(true);
    expect(decryptString(key, a)).toBe('private-stream-key');
    expect(decryptString(key, encryptString(key, ''))).toBe('');
  });

  it('rejects tampering, wrong keys and wrong AAD', () => {
    const enc = encryptString(key, 'hello', 'event-1');
    expect(decryptString(key, enc, 'event-1')).toBe('hello');
    expect(() => decryptString(key, enc, 'event-2')).toThrow();
    expect(() => decryptString(deriveKey('another-secret-another-secret-xx', 'x'), enc, 'event-1')).toThrow();
    const parts = enc.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptString(key, parts.join('.'), 'event-1')).toThrow();
    expect(() => decryptString(key, 'garbage')).toThrow();
  });
});

describe('signed tokens', () => {
  const key = deriveKey('an-app-secret-with-plenty-of-characters', 'token-sign:v1');

  it('verifies purpose, signature and expiry', () => {
    const now = Date.now();
    const t = signToken(key, 'hls-preview', { e: 'event-1' }, 600, now);
    expect(verifyToken(key, 'hls-preview', t, now)?.e).toBe('event-1');
    expect(verifyToken(key, 'other', t, now)).toBeNull();
    expect(verifyToken(key, 'hls-preview', t, now + 601_000)).toBeNull();
    expect(verifyToken(key, 'hls-preview', `${t}x`, now)).toBeNull();
    expect(verifyToken(key, 'hls-preview', 'nope', now)).toBeNull();
  });
});
