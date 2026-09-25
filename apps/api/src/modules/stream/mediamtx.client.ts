import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';

/** The bits of MediaMTX 1.21 `/v3/paths/*` we read. Old field names are kept as fallbacks. */
export interface MtxTrack {
  codec: string;
  codecProps?: Record<string, unknown> | null;
}

export interface MtxPath {
  name: string;
  /** 1.21: `online`/`onlineTime`; older: `ready`/`readyTime`. */
  online?: boolean;
  onlineTime?: string | null;
  ready?: boolean;
  readyTime?: string | null;
  available?: boolean;
  source?: { type: string; id: string } | null;
  tracks?: string[];
  tracks2?: MtxTrack[];
  readers?: Array<{ type: string; id: string }>;
  inboundBytes?: number;
  bytesReceived?: number;
}

export const pathOnline = (p: MtxPath | null | undefined): boolean => !!p && (p.online ?? p.ready ?? false) && !!p.source;
export const pathBytes = (p: MtxPath): number => Number(p.inboundBytes ?? p.bytesReceived ?? 0) || 0;
export const pathSince = (p: MtxPath): string | null => p.onlineTime ?? p.readyTime ?? null;

/** Where to kick each kind of publisher (MediaMTX control API). */
const KICK_ROUTES: Record<string, string> = {
  rtmpConn: 'rtmpconns',
  rtmpsConn: 'rtmpsconns',
  rtspSession: 'rtspsessions',
  rtspsSession: 'rtspssessions',
  srtConn: 'srtconns',
  webRTCSession: 'webrtcsessions',
};

export type PathLookup = { ok: true; path: MtxPath | null } | { ok: false };

/**
 * MediaMTX control API (private network) and HLS (private, CDN mode). Every call has a short
 * timeout and reports "unreachable" separately from "not there", so callers never mistake a
 * hiccup for "OBS went offline".
 */
@Injectable()
export class MediaMtxClient {
  private readonly logger = new Logger('MediaMTX');
  private lastWarnAt = 0;

  constructor(private readonly config: AppConfig) {}

  private get api(): string {
    return this.config.env.MEDIA_API_URL;
  }

  private warn(msg: string): void {
    // A down media server would otherwise log every 10s from reconcile.
    if (Date.now() - this.lastWarnAt < 60_000) return;
    this.lastWarnAt = Date.now();
    this.logger.warn(msg);
  }

  /** All paths MediaMTX knows about right now, or null when it can't be reached. */
  async listPaths(): Promise<MtxPath[] | null> {
    try {
      const res = await fetch(`${this.api}/v3/paths/list?itemsPerPage=1000`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) {
        this.warn(`paths/list answered ${res.status}`);
        return null;
      }
      const body = (await res.json()) as { items?: MtxPath[] };
      return body.items ?? [];
    } catch (err) {
      this.warn(`paths/list failed: ${(err as Error).message}`);
      return null;
    }
  }

  /** One path (`live/<key>`). `{ ok: true, path: null }` means MediaMTX has no such path (no publisher). */
  async getPath(name: string): Promise<PathLookup> {
    try {
      const res = await fetch(`${this.api}/v3/paths/get/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(3000) });
      if (res.status === 404) return { ok: true, path: null };
      if (!res.ok) {
        this.warn(`paths/get ${name} answered ${res.status}`);
        return { ok: false };
      }
      return { ok: true, path: (await res.json()) as MtxPath };
    } catch (err) {
      this.warn(`paths/get ${name} failed: ${(err as Error).message}`);
      return { ok: false };
    }
  }

  /** Disconnect whoever publishes `live/<key>`. Returns true when someone was kicked. */
  async kickPublisher(name: string): Promise<boolean> {
    const found = await this.getPath(name);
    if (!found.ok || !found.path?.source) return false;
    const { type, id } = found.path.source;
    const route = KICK_ROUTES[type];
    if (!route) {
      this.logger.warn(`Don't know how to kick a ${type} publisher on ${name}`);
      return false;
    }
    try {
      const res = await fetch(`${this.api}/v3/${route}/kick/${encodeURIComponent(id)}`, {
        method: 'POST',
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) this.logger.warn(`Kick ${type} ${id} on ${name} answered ${res.status}`);
      return res.ok;
    } catch (err) {
      this.logger.warn(`Kick ${type} ${id} on ${name} failed: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * GET a file from MediaMTX HLS as the "CDN": `Authorization: Bearer MEDIA_INTERNAL_SECRET`
   * (hlsCDNSecret) gives one shared cookieless session and skips per-request auth.
   */
  hls(path: string, query: string, signal: AbortSignal): Promise<Response> {
    const url = `${this.config.env.MEDIA_HLS_URL}/${path}${query ? `?${query}` : ''}`;
    return fetch(url, {
      headers: { Authorization: `Bearer ${this.config.env.MEDIA_INTERNAL_SECRET}` },
      redirect: 'manual',
      signal,
    });
  }
}
