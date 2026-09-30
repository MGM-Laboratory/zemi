/**
 * Who is connected to a show right now (in memory, one API instance): OBS outputs, docks and admin
 * controllers. One entry per SSE connection; a page that reconnects with the same client id shows
 * up once.
 */
import type { BumperClientKind, BumperPresence, BumperPresenceClient } from '@zemi/shared';

/**
 * A short browser label from the user agent: "OBS 32 (Chromium 127)" for the OBS browser source and
 * docks, else "Chrome 131", "Safari", "Firefox", or null when it can't be told.
 */
export function parseAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const chromium = /(?:Chrome|Chromium|CriOS)\/(\d+)/.exec(ua);
  const obs = /\bOBS\/(\d+)/.exec(ua);
  if (obs) return chromium ? `OBS ${obs[1]} (Chromium ${chromium[1]})` : `OBS ${obs[1]}`;
  if (chromium) return `Chrome ${chromium[1]}`;
  if (/\b(Firefox|FxiOS)\//.test(ua)) return 'Firefox';
  if (/\bSafari\//.test(ua) && /\bVersion\//.test(ua)) return 'Safari';
  return null;
}

interface Entry extends BumperPresenceClient {
  at: number;
}

export class PresenceRegistry {
  private readonly shows = new Map<string, Map<string, Entry>>();
  private seq = 0;

  /** Register one connection; returns the function that removes it again. */
  add(
    showId: string,
    client: { cid: string | null; kind: BumperClientKind; obs: boolean; agent: string | null },
    now = new Date(),
  ): () => void {
    const conn = `c${++this.seq}`;
    let map = this.shows.get(showId);
    if (!map) {
      map = new Map();
      this.shows.set(showId, map);
    }
    map.set(conn, {
      id: client.cid ?? conn,
      kind: client.kind,
      obs: client.obs,
      agent: client.agent,
      since: now.toISOString(),
      at: now.getTime(),
    });
    return () => {
      const m = this.shows.get(showId);
      if (!m) return;
      m.delete(conn);
      if (!m.size) this.shows.delete(showId);
    };
  }

  snapshot(showId: string): BumperPresence {
    const byId = new Map<string, Entry>();
    for (const e of this.shows.get(showId)?.values() ?? []) {
      const prev = byId.get(e.id);
      if (!prev || prev.at < e.at) byId.set(e.id, e);
    }
    const clients = [...byId.values()]
      .sort((a, b) => a.at - b.at)
      .map(({ id, kind, obs, agent, since }) => ({ id, kind, obs, agent, since }));
    return {
      outputs: clients.filter((c) => c.kind === 'output').length,
      docks: clients.filter((c) => c.kind === 'dock').length,
      controllers: clients.filter((c) => c.kind === 'controller').length,
      clients,
    };
  }

  outputs(showId: string): number {
    return this.snapshot(showId).outputs;
  }

  /** Forget a show (deleted). Open streams complete on their own. */
  clear(showId: string): void {
    this.shows.delete(showId);
  }
}
