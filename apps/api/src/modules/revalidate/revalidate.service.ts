import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';

/** Tags the web understands (see apps/web/src/lib/api/tags.ts). */
export const TAG_PATTERN = /^(site|events|speakers|publications|(event|speaker|publication):[A-Za-z0-9_-]{1,96})$/;

export const tags = {
  site: 'site',
  events: 'events',
  event: (id: string) => `event:${id}`,
  speakers: 'speakers',
  speaker: (id: string) => `speaker:${id}`,
  publications: 'publications',
  publication: (id: string) => `publication:${id}`,
} as const;

/**
 * Tell the web to drop cached pages after content changes (SPEC section 7).
 * Fire and forget: `revalidate()` never throws and never blocks longer than the timeout.
 *
 *   this.revalidate.revalidate([tags.events, tags.event(id)]);
 */
@Injectable()
export class RevalidateService {
  private readonly logger = new Logger('Revalidate');
  private readonly timeoutMs = 3000;

  constructor(private readonly config: AppConfig) {}

  get enabled(): boolean {
    return !!this.config.env.WEB_REVALIDATE_URL && !!this.config.env.REVALIDATE_SECRET;
  }

  /** Returns a promise you may await in tests; production code can ignore it. */
  revalidate(input: string[]): Promise<void> {
    const list = [...new Set(input)].filter((t) => TAG_PATTERN.test(t));
    if (!list.length || !this.enabled) return Promise.resolve();
    return this.post(list);
  }

  private async post(list: string[]): Promise<void> {
    try {
      const res = await fetch(this.config.env.WEB_REVALIDATE_URL!, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret: this.config.env.REVALIDATE_SECRET, tags: list }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) this.logger.warn(`Web answered ${res.status} for ${list.join(', ')}`);
      else this.logger.debug(`Revalidated ${list.join(', ')}`);
    } catch (err) {
      this.logger.warn(`Could not reach the web to revalidate ${list.join(', ')}: ${(err as Error).message}`);
    }
  }
}
