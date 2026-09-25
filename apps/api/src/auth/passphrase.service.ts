import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { and, eq, ne } from 'drizzle-orm';
import { conflict } from '../common/errors.js';
import { hmacSha256, timingSafeEqualStr } from '../common/crypto.js';
import { AppConfig } from '../config/app-config.js';
import { DB, type Db, type DbOrTx } from '../db/client.js';
import { admins } from '../db/schema.js';
import { WORDLIST } from './wordlist.js';

/** argon2id parameters (OWASP 2024 baseline: 19 MiB, t=2, p=1). The algorithm default is argon2id. */
const ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/** Trim and Unicode-normalize so copy-pasted passphrases match. Case is preserved. */
export function normalizePassphrase(input: string): string {
  return input.normalize('NFC').trim();
}

/** `friday-coffee-hypothesis-42`: 4 themed words + 2 digits, dash separated. */
export function generatePassphrase(words: readonly string[] = WORDLIST, pick: (n: number) => number = randomInt): string {
  const chosen: string[] = [];
  while (chosen.length < 4) {
    const w = words[pick(words.length)];
    if (!chosen.includes(w)) chosen.push(w);
  }
  const digits = String(pick(100)).padStart(2, '0');
  return [...chosen, digits].join('-');
}

/** HMAC-SHA256(APP_SECRET, normalized passphrase), hex. Unique index on `admins.passphrase_lookup`. */
export function passphraseLookup(secret: string, passphrase: string): string {
  return hmacSha256(secret, normalizePassphrase(passphrase));
}

/**
 * Passphrase-only auth primitives (SPEC section 5). A passphrase is found by its HMAC lookup and
 * then verified with argon2id, so login is one indexed query plus one hash check.
 */
@Injectable()
export class PassphraseService {
  constructor(
    private readonly config: AppConfig,
    @Inject(DB) private readonly db: Db,
  ) {}

  normalize(input: string): string {
    return normalizePassphrase(input);
  }

  lookup(passphrase: string): string {
    return passphraseLookup(this.config.env.APP_SECRET, passphrase);
  }

  hash(passphrase: string): Promise<string> {
    return hash(normalizePassphrase(passphrase), ARGON);
  }

  async verify(passphraseHash: string, passphrase: string): Promise<boolean> {
    try {
      return await verify(passphraseHash, normalizePassphrase(passphrase));
    } catch {
      return false;
    }
  }

  /** Constant-time check against SUPERADMIN_PASSPHRASE. */
  isSuperadmin(passphrase: string): boolean {
    return timingSafeEqualStr(normalizePassphrase(passphrase), normalizePassphrase(this.config.env.SUPERADMIN_PASSPHRASE));
  }

  generate(): string {
    return generatePassphrase();
  }

  /** 409 if the passphrase is the superadmin's or already belongs to another admin. */
  async assertAvailable(passphrase: string, excludeAdminId?: string | null, db: DbOrTx = this.db): Promise<void> {
    const message = 'That passphrase is already in use. Pick another one, or generate one.';
    const taken = () => conflict(message, { details: { field: 'passphrase', issues: [{ path: ['passphrase'], message, code: 'custom' }] } });
    if (this.isSuperadmin(passphrase)) throw taken();
    const lookup = this.lookup(passphrase);
    const rows = await db
      .select({ id: admins.id })
      .from(admins)
      .where(excludeAdminId ? and(eq(admins.passphraseLookup, lookup), ne(admins.id, excludeAdminId)) : eq(admins.passphraseLookup, lookup))
      .limit(1);
    if (rows.length) throw taken();
  }

  /** Lookup + hash, ready to store. */
  async prepare(passphrase: string): Promise<{ passphraseLookup: string; passphraseHash: string }> {
    return { passphraseLookup: this.lookup(passphrase), passphraseHash: await this.hash(passphrase) };
  }
}
