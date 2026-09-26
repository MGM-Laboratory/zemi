import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { tooManyRequests } from './errors.js';

export interface RateLimitRule {
  /** Max hits per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Hits counted in the current window, this one included (`peek`: without one). */
  count: number;
  remaining: number;
  /** Epoch ms when the window resets. */
  resetAt: number;
  retryAfterSec: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Tiny in-memory fixed-window rate limiter (per process). Good enough for one API instance on
 * Railway; swap for Postgres/Redis if we ever scale out horizontally.
 *
 *   rateLimit.consume(`login:${ip}`, { limit: 8, windowMs: 10 * 60_000 }); // throws 429 when over
 *   const r = rateLimit.hit(`react:${ip}:${eventId}`, { limit: 30, windowMs: 10_000 }); // check r.allowed
 *
 * Key prefixes in use: `login:`, `login-fail:`, `register:`, `contact:`, `react:`, `heartbeat:`, `upload:`.
 */
@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly buckets = new Map<string, Bucket>();
  private readonly sweeper: NodeJS.Timeout;
  /** Hard cap so a flood of unique keys can't eat memory. */
  private readonly maxKeys = 100_000;

  constructor() {
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  /** Count one hit and report whether it is within the limit. Never throws. */
  hit(key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      if (!b && this.buckets.size >= this.maxKeys) this.sweep(now, true);
      b = { count: 0, resetAt: now + rule.windowMs };
      this.buckets.set(key, b);
    }
    b.count += 1;
    const allowed = b.count <= rule.limit;
    return {
      allowed,
      count: b.count,
      remaining: Math.max(0, rule.limit - b.count),
      resetAt: b.resetAt,
      retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
    };
  }

  /** Like `hit`, but throws 429 (with Retry-After) when over the limit. */
  consume(key: string, rule: RateLimitRule, message?: string): RateLimitResult {
    const r = this.hit(key, rule);
    if (!r.allowed) throw tooManyRequests(r.retryAfterSec, message);
    return r;
  }

  /** Look without counting. */
  peek(key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
    const b = this.buckets.get(key);
    if (!b || b.resetAt <= now) return { allowed: true, count: 0, remaining: rule.limit, resetAt: now + rule.windowMs, retryAfterSec: 0 };
    return {
      allowed: b.count < rule.limit,
      count: b.count,
      remaining: Math.max(0, rule.limit - b.count),
      resetAt: b.resetAt,
      retryAfterSec: b.count < rule.limit ? 0 : Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
    };
  }

  /**
   * Give back one hit in the current window (never below zero). Count first with `consume`/`hit`,
   * which is safe under concurrency, then refund the attempts that turned out fine: a successful
   * login costs nothing, while the failures before it stay counted.
   */
  refund(key: string, now = Date.now()): void {
    const b = this.buckets.get(key);
    if (b && b.resetAt > now && b.count > 0) b.count -= 1;
  }

  /** Forget a key entirely. */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  private sweep(now = Date.now(), aggressive = false): void {
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
    if (aggressive && this.buckets.size >= this.maxKeys) {
      // Drop the oldest tenth (Map iterates in insertion order).
      let n = Math.ceil(this.maxKeys / 10);
      for (const k of this.buckets.keys()) {
        if (n-- <= 0) break;
        this.buckets.delete(k);
      }
    }
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
  }
}
