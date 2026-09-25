import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { decryptString, deriveKey, encryptString, hmacSha256, signToken, verifyToken } from './crypto.js';

/**
 * APP_SECRET-bound crypto. Keys are derived per purpose with HKDF, so rotating one use never
 * affects another, and the raw secret is never used as a key directly.
 *
 *   crypto.encrypt(privateKey, eventId)       // AES-256-GCM, bound to the event id
 *   crypto.sign('hls-preview', { e: id }, 600) // short-lived capability token
 */
@Injectable()
export class CryptoService {
  private readonly encKey: Buffer;
  private readonly signKey: Buffer;

  constructor(private readonly config: AppConfig) {
    this.encKey = deriveKey(config.env.APP_SECRET, 'aes-256-gcm:v1');
    this.signKey = deriveKey(config.env.APP_SECRET, 'token-sign:v1');
  }

  encrypt(plaintext: string, aad?: string): string {
    return encryptString(this.encKey, plaintext, aad);
  }

  decrypt(payload: string, aad?: string): string {
    return decryptString(this.encKey, payload, aad);
  }

  /** HMAC-SHA256 (hex) keyed with APP_SECRET itself. Used for passphrase lookups. */
  hmac(data: string): string {
    return hmacSha256(this.config.env.APP_SECRET, data);
  }

  sign(purpose: string, data: Record<string, unknown>, ttlSec: number): string {
    return signToken(this.signKey, purpose, data, ttlSec);
  }

  verify<T extends Record<string, unknown> = Record<string, unknown>>(purpose: string, token: string): (T & { exp: number }) | null {
    return verifyToken<T>(this.signKey, purpose, token);
  }
}
