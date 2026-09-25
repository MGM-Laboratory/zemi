import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ByteLru } from './byte-lru.js';
import { MediaMtxClient } from './mediamtx.client.js';
import { hlsContentType, isPlaylistPath } from './stream.util.js';

export const PLAYLIST_TTL_MS = 1000;
export const SEGMENT_TTL_MS = 60_000;
const CACHE_BYTES = 200 * 1024 * 1024;
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;

export type HlsFetch =
  | { status: 200; body: Buffer; contentType: string; cached: boolean }
  | { status: 404 | 502; reason: string };

/**
 * The API is MediaMTX's "CDN": every viewer's request lands here, and at most one request per file
 * goes upstream at a time (in-flight requests are shared). Playlists live 1s in memory, init
 * segments and media segments 60s, in an LRU capped at ~200 MB. Only 200s are cached.
 */
@Injectable()
export class HlsProxyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('HlsProxy');
  private readonly cache = new ByteLru(CACHE_BYTES, MAX_ENTRY_BYTES);
  private readonly inflight = new Map<string, Promise<HlsFetch>>();
  private pruneTimer?: NodeJS.Timeout;
  private warnedRedirect = false;

  constructor(private readonly mtx: MediaMtxClient) {}

  onModuleInit(): void {
    this.pruneTimer = setInterval(() => this.cache.prune(), 30_000);
    this.pruneTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.pruneTimer);
    this.cache.clear();
  }

  get stats(): { bytes: number; entries: number; inflight: number } {
    return { bytes: this.cache.bytes, entries: this.cache.size, inflight: this.inflight.size };
  }

  /** `rest` must already be validated with `isSafeHlsPath`. `query` excludes our own `pt`. */
  get(streamKey: string, rest: string, query: string): Promise<HlsFetch> {
    const key = `${streamKey}/${rest}${query ? `?${query}` : ''}`;
    const hit = this.cache.get(key);
    if (hit) return Promise.resolve({ status: 200, body: hit.body, contentType: hit.contentType, cached: true });
    let pending = this.inflight.get(key);
    if (!pending) {
      pending = this.fetchUpstream(streamKey, rest, query, key).finally(() => this.inflight.delete(key));
      this.inflight.set(key, pending);
    }
    return pending;
  }

  /** Forget everything cached for a stream key (after a rotate). */
  evict(streamKey: string): void {
    this.cache.deletePrefix(`${streamKey}/`);
  }

  private async fetchUpstream(streamKey: string, rest: string, query: string, cacheKey: string): Promise<HlsFetch> {
    const playlist = isPlaylistPath(rest);
    try {
      const res = await this.mtx.hls(`live/${streamKey}/${rest}`, query, AbortSignal.timeout(playlist ? 10_000 : 20_000));
      if (res.status !== 200) {
        await res.body?.cancel().catch(() => undefined);
        if (res.status >= 300 && res.status < 400 && !this.warnedRedirect) {
          this.warnedRedirect = true;
          this.logger.error('MediaMTX HLS redirected us (cookieCheck). MEDIA_INTERNAL_SECRET must equal the media server hlsCDNSecret.');
        }
        if (res.status === 404) return { status: 404, reason: 'no_signal' };
        return { status: 502, reason: `upstream_${res.status}` };
      }
      const body = Buffer.from(await res.arrayBuffer());
      const contentType = hlsContentType(rest);
      this.cache.set(cacheKey, { body, contentType, expiresAt: Date.now() + (playlist ? PLAYLIST_TTL_MS : SEGMENT_TTL_MS) });
      return { status: 200, body, contentType, cached: false };
    } catch (err) {
      this.logger.warn(`HLS fetch ${rest} for ${streamKey.slice(0, 6)}... failed: ${(err as Error).message}`);
      return { status: 502, reason: 'upstream_unreachable' };
    }
  }
}
