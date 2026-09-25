import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../config/app-config.js';
import type { Db } from '../db/client.js';
import { generatePassphrase, normalizePassphrase, PassphraseService, passphraseLookup } from './passphrase.service.js';
import { WORDLIST } from './wordlist.js';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const config = { env: { APP_SECRET: SECRET, SUPERADMIN_PASSPHRASE: 'super-secret-passphrase-123' } } as unknown as AppConfig;
const service = new PassphraseService(config, {} as Db);

describe('wordlist', () => {
  it('has about 400+ unique, lowercase, friendly words', () => {
    expect(WORDLIST.length).toBeGreaterThanOrEqual(400);
    expect(new Set(WORDLIST).size).toBe(WORDLIST.length);
    for (const w of WORDLIST) expect(w).toMatch(/^[a-z]{3,10}$/);
  });
});

describe('generatePassphrase', () => {
  it('returns 4 distinct words and 2 digits, dash separated', () => {
    for (let i = 0; i < 200; i++) {
      const p = generatePassphrase();
      const parts = p.split('-');
      expect(parts).toHaveLength(5);
      expect(parts[4]).toMatch(/^\d{2}$/);
      const words = parts.slice(0, 4);
      expect(new Set(words).size).toBe(4);
      for (const w of words) expect(WORDLIST).toContain(w);
      expect(p.length).toBeGreaterThanOrEqual(12); // passes passphraseSchema min length
    }
  });

  it('is deterministic with an injected picker (and pads digits)', () => {
    let n = 0;
    const pick = (max: number) => (max === 100 ? 7 : n++ % max);
    expect(generatePassphrase(['alpha', 'beta', 'gamma', 'delta', 'omega'], pick)).toBe('alpha-beta-gamma-delta-07');
  });
});

describe('normalize + lookup', () => {
  it('trims and NFC-normalizes but keeps case', () => {
    expect(normalizePassphrase('  Friday-Coffee  ')).toBe('Friday-Coffee');
    expect(normalizePassphrase('café')).toBe('café');
  });

  it('lookup is a stable HMAC of the normalized passphrase', () => {
    const a = passphraseLookup(SECRET, 'friday-coffee-hypothesis-42');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(passphraseLookup(SECRET, '  friday-coffee-hypothesis-42\n')).toBe(a);
    expect(passphraseLookup(SECRET, 'friday-coffee-hypothesis-43')).not.toBe(a);
    expect(passphraseLookup(`${SECRET}x`, 'friday-coffee-hypothesis-42')).not.toBe(a);
    expect(service.lookup('friday-coffee-hypothesis-42')).toBe(a);
  });
});

describe('PassphraseService', () => {
  it('hashes with argon2id and verifies (normalized)', async () => {
    const hash = await service.hash('friday-coffee-hypothesis-42');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await service.verify(hash, ' friday-coffee-hypothesis-42 ')).toBe(true);
    expect(await service.verify(hash, 'friday-coffee-hypothesis-41')).toBe(false);
    expect(await service.verify('not-a-hash', 'x')).toBe(false);
  });

  it('recognizes the superadmin passphrase in constant time', () => {
    expect(service.isSuperadmin('super-secret-passphrase-123')).toBe(true);
    expect(service.isSuperadmin(' super-secret-passphrase-123 ')).toBe(true);
    expect(service.isSuperadmin('super-secret-passphrase-12')).toBe(false);
    expect(service.isSuperadmin('')).toBe(false);
  });
});
