'use client';

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  BumperControlInput,
  BumperLiveState,
  BumperPresence,
  BumperPublicShow,
  BumperShowDetail,
  BumperSlide,
  BumperStreamMessage,
} from '@zemi/shared';
import { createContext, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { adminFetch, errorMessage, isApiError } from '@/lib/admin/api';
import { adminLiveStreamUrl, bumperKeys, bumpersApi, newBumperId, publicBumpers } from '../api';
import type { DirectorTarget } from '../transitions/director';

/**
 * Playback state over SSE. The server is the authority: every screen (player, controller, dock,
 * OBS outputs) shows whatever the newest state says, so a press only ever changes the screens
 * through the server. Nothing here moves a slide optimistically; `pending` just lets buttons
 * show that a press is on its way.
 */

export type LiveStatus = 'connecting' | 'open' | 'reconnecting' | 'forbidden' | 'revoked';
export type LiveRevokedReason = 'rotated' | 'deleted' | 'archived';

export interface LiveSnapshot {
  status: LiveStatus;
  /** Newest playback state (highest seq wins). */
  state: BumperLiveState | null;
  /** Who is connected (controllers and docks only; outputs never get presence). */
  presence: BumperPresence | null;
  /** Server clock minus this clock, in ms (for countdowns on a drifting machine). */
  offsetMs: number;
  revoked: LiveRevokedReason | null;
  /** Presses in flight or queued. */
  pending: number;
  /** The last press that failed, in plain words. Cleared after a few seconds. */
  error: string | null;
}

const PING_MS = 15_000;
/** No message for this long means the connection is dead even if the socket says otherwise. */
const SILENCE_MS = PING_MS * 2.6;
const ERROR_MS = 5000;
const MAX_QUEUE = 4;

type ProbeResult = { kind: 'ok' } | { kind: 'gone'; reason: LiveRevokedReason } | { kind: 'forbidden' } | { kind: 'retry' };

interface ChannelConfig {
  url: (cid: string) => string;
  withCredentials: boolean;
  /** Called when the stream fails: decides between reconnecting, stopping and "revoked". */
  probe: (signal: AbortSignal) => Promise<ProbeResult>;
  /** The show content changed (or a state refers to a newer version than the one we hold). */
  onShowChanged?: (version: number) => void;
  post: (input: BumperControlInput) => Promise<BumperLiveState>;
  describeError: (err: unknown) => string;
  cidPrefix: string;
}

const IDLE: LiveSnapshot = { status: 'connecting', state: null, presence: null, offsetMs: 0, revoked: null, pending: 0, error: null };

function isObs(): boolean {
  return typeof window !== 'undefined' && 'obsstudio' in window;
}

/**
 * One SSE connection with its own reconnect loop (backoff with jitter, a silence watchdog, and a
 * fast retry when the browser comes back online), the reducer for playback state, and the
 * ordered press queue. Framework free; the hooks below adapt it with useSyncExternalStore.
 */
export class LiveChannel {
  readonly cid: string;
  readonly obs: boolean;
  private snap: LiveSnapshot = IDLE;
  private listeners = new Set<() => void>();
  private es: EventSource | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private watchTimer: ReturnType<typeof setInterval> | null = null;
  private errorTimer: ReturnType<typeof setTimeout> | null = null;
  private probeAbort: AbortController | null = null;
  private attempt = 0;
  private lastMessageAt = 0;
  private running = false;
  private stopped = false;
  private knownVersion = -1;
  private queue: Promise<unknown> = Promise.resolve();
  private queued = 0;

  constructor(private readonly config: ChannelConfig) {
    this.cid = newBumperId(config.cidPrefix);
    this.obs = isObs();
  }

  /* ------------------------------------------------------------ store */

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.snap;

  getServerSnapshot = () => IDLE;

  private patch(p: Partial<LiveSnapshot>) {
    this.snap = { ...this.snap, ...p };
    this.listeners.forEach((l) => l());
  }

  /** Accept a state from anywhere (SSE, a press response, the show payload). Newest seq wins. */
  accept = (state: BumperLiveState | null | undefined) => {
    if (!state) return;
    const cur = this.snap.state;
    const offset = this.offsetFrom(state.serverNow);
    if (cur && state.seq <= cur.seq) {
      if (offset !== this.snap.offsetMs) this.patch({ offsetMs: offset });
      return;
    }
    this.patch({ state, offsetMs: offset });
    if (state.version > this.knownVersion && this.knownVersion >= 0) this.config.onShowChanged?.(state.version);
  };

  /** The show version the page currently renders (so newer states trigger a refetch). */
  setKnownVersion(v: number) {
    this.knownVersion = v;
  }

  /** Rounded, and only moved when it drifts by more than 250 ms, so countdown timers stay put. */
  private offsetFrom(iso: string | undefined): number {
    const t = iso ? Date.parse(iso) : NaN;
    if (!Number.isFinite(t)) return this.snap.offsetMs;
    const raw = t - Date.now();
    return Math.abs(raw - this.snap.offsetMs) > 250 ? Math.round(raw / 50) * 50 : this.snap.offsetMs;
  }

  /* ------------------------------------------------------------ lifecycle */

  start() {
    if (this.running) return;
    this.running = true;
    this.stopped = false;
    this.attempt = 0;
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    window.addEventListener('online', this.onWake);
    document.addEventListener('visibilitychange', this.onWake);
    this.watchTimer = setInterval(this.watch, 5000);
    this.connect();
  }

  stop() {
    this.running = false;
    this.closeSocket();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.watchTimer) clearInterval(this.watchTimer);
    this.retryTimer = null;
    this.watchTimer = null;
    this.probeAbort?.abort();
    this.probeAbort = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onWake);
      document.removeEventListener('visibilitychange', this.onWake);
    }
  }

  private closeSocket() {
    if (!this.es) return;
    this.es.onopen = null;
    this.es.onmessage = null;
    this.es.onerror = null;
    this.es.close();
    this.es = null;
  }

  private connect = () => {
    this.retryTimer = null;
    if (!this.running || this.stopped) return;
    this.closeSocket();
    let es: EventSource;
    try {
      es = new EventSource(this.config.url(this.cid), { withCredentials: this.config.withCredentials });
    } catch {
      this.schedule();
      return;
    }
    this.es = es;
    this.lastMessageAt = Date.now();
    es.onopen = () => {
      this.lastMessageAt = Date.now();
    };
    es.onmessage = (e) => {
      this.lastMessageAt = Date.now();
      let msg: BumperStreamMessage;
      try {
        msg = JSON.parse(e.data as string) as BumperStreamMessage;
      } catch {
        return;
      }
      this.handle(msg);
    };
    es.onerror = () => {
      // We run our own reconnects (with backoff), so the browser's instant retry never hammers the API.
      this.closeSocket();
      if (!this.running || this.stopped) return;
      if (this.snap.status === 'open') this.patch({ status: 'reconnecting' });
      else if (this.snap.status === 'connecting' && this.attempt > 0) this.patch({ status: 'reconnecting' });
      void this.recover();
    };
  };

  private handle(msg: BumperStreamMessage) {
    switch (msg.type) {
      case 'state':
        this.attempt = 0;
        if (this.snap.status !== 'open') this.patch({ status: 'open' });
        this.accept(msg.state);
        return;
      case 'presence':
        this.patch({ presence: msg.presence, ...(this.snap.status !== 'open' ? { status: 'open' as const } : null) });
        return;
      case 'show':
        if (msg.version > this.knownVersion) this.config.onShowChanged?.(msg.version);
        return;
      case 'revoked':
        this.stopped = true;
        this.closeSocket();
        this.patch({ status: 'revoked', revoked: msg.reason });
        return;
      case 'ping': {
        const offset = this.offsetFrom(msg.t);
        if (offset !== this.snap.offsetMs || this.snap.status !== 'open') this.patch({ offsetMs: offset, status: 'open' });
        return;
      }
      default:
        return;
    }
  }

  /** The stream dropped: ask the server what is going on before trying again. */
  private async recover() {
    this.probeAbort?.abort();
    const ctrl = new AbortController();
    this.probeAbort = ctrl;
    let res: ProbeResult;
    try {
      res = await this.config.probe(ctrl.signal);
    } catch {
      res = { kind: 'retry' };
    }
    if (ctrl.signal.aborted || !this.running || this.stopped) return;
    this.probeAbort = null;
    if (res.kind === 'gone') {
      this.stopped = true;
      this.patch({ status: 'revoked', revoked: res.reason });
      return;
    }
    if (res.kind === 'forbidden') {
      this.stopped = true;
      this.patch({ status: 'forbidden' });
      return;
    }
    this.schedule(res.kind === 'ok');
  }

  private schedule(reachable = false) {
    if (!this.running || this.stopped || this.retryTimer) return;
    this.attempt += 1;
    // The API answered, so the stream itself hiccuped: come back quickly. Otherwise back off.
    const base = reachable ? 600 : Math.min(30_000, 800 * 2 ** Math.min(this.attempt, 6));
    const delay = Math.round(base * (0.7 + Math.random() * 0.6));
    this.retryTimer = setTimeout(this.connect, delay);
  }

  private onWake = () => {
    if (!this.running || this.stopped) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (this.es && this.snap.status === 'open') return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.attempt = 0;
    this.connect();
  };

  /** A half-open connection (laptop wifi dropped) never errors: reconnect after a long silence. */
  private watch = () => {
    if (!this.running || this.stopped || !this.es) return;
    if (Date.now() - this.lastMessageAt > SILENCE_MS) {
      this.closeSocket();
      this.patch({ status: 'reconnecting' });
      this.schedule(true);
    }
  };

  /* ------------------------------------------------------------ presses */

  /**
   * Send a control input. Presses go out one at a time, in order: next and prev pick up
   * `fromSlideId` from the newest state when their turn comes, so one person pressing twice moves
   * two steps while two clickers pressing at the same moment still move one.
   */
  send = (input: BumperControlInput): Promise<BumperLiveState | null> => {
    if (this.queued >= MAX_QUEUE) return Promise.resolve(null);
    this.queued += 1;
    this.patch({ pending: this.queued });
    const run = async (): Promise<BumperLiveState | null> => {
      const step = input.action === 'next' || input.action === 'prev';
      const body: BumperControlInput = step && input.fromSlideId === undefined ? { ...input, fromSlideId: this.snap.state?.slideId ?? null } : input;
      try {
        const state = await this.config.post(body);
        this.accept(state);
        return state;
      } catch (err) {
        this.fail(this.config.describeError(err));
        return null;
      } finally {
        this.queued -= 1;
        this.patch({ pending: this.queued });
      }
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  };

  /** The key answered 404 (rotated, archived or deleted): stop for good. */
  markGone(reason: LiveRevokedReason) {
    this.stopped = true;
    this.closeSocket();
    this.patch({ status: 'revoked', revoked: reason });
  }

  private fail(message: string) {
    this.patch({ error: message });
    if (this.errorTimer) clearTimeout(this.errorTimer);
    this.errorTimer = setTimeout(() => this.patch({ error: null }), ERROR_MS);
  }
}

/* ---------------------------------------------------------------- admin */

export interface AdminLive extends LiveSnapshot {
  showId: string;
  /** The show detail (React Query, `bumperKeys.detail`), kept in step with the stream. */
  show: BumperShowDetail | undefined;
  showError: unknown;
  showLoading: boolean;
  refetchShow: () => void;
  send: (input: BumperControlInput) => Promise<BumperLiveState | null>;
  cid: string;
}

/**
 * The player and the controller: the show detail plus its live state over the admin SSE
 * (same origin, cookie auth). Pass `{ show: false }` when only presence and state are needed
 * (the OBS guide), so the detail cache the builder owns is left alone.
 */
export function useAdminLive(showId: string, opts: { enabled?: boolean; show?: boolean } = {}): AdminLive {
  const enabled = opts.enabled ?? true;
  const withShow = opts.show ?? true;
  const qc = useQueryClient();
  const channel = useMemo(() => adminChannel(qc, showId, withShow), [qc, showId, withShow]);
  const snap = useSyncExternalStore(channel.subscribe, channel.getSnapshot, channel.getServerSnapshot);

  const detail = useQuery({
    queryKey: bumperKeys.detail(showId),
    queryFn: ({ signal }) => bumpersApi.get(showId, signal),
    enabled: enabled && withShow,
    // The stream says when the content changes; no polling, no focus refetch.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: 'always',
  });
  const show = withShow ? detail.data : undefined;

  useEffect(() => {
    if (!enabled) return;
    channel.start();
    return () => channel.stop();
  }, [channel, enabled]);

  useEffect(() => {
    if (!show) return;
    channel.setKnownVersion(show.version);
    channel.accept(show.state);
  }, [channel, show]);

  const refetch = detail.refetch;
  const refetchShow = useCallback(() => void refetch(), [refetch]);

  return {
    ...snap,
    showId,
    show,
    showError: detail.error,
    showLoading: withShow && detail.isPending,
    refetchShow,
    send: channel.send,
    cid: channel.cid,
  };
}

/**
 * The page's own live connection (the controller provides it), so the OBS guide opened from
 * there reuses it instead of opening a second stream.
 */
export const AdminLiveContext = createContext<AdminLive | null>(null);

function adminChannel(qc: QueryClient, showId: string, withShow: boolean): LiveChannel {
  let refetching = false;
  return new LiveChannel({
    cidPrefix: 'c',
    url: (cid) => adminLiveStreamUrl(showId, cid),
    withCredentials: true,
    probe: async (signal) => {
      try {
        await adminFetch(`/admin/bumpers/${showId}/live`, { signal });
        return { kind: 'ok' };
      } catch (err) {
        if (isApiError(err) && (err.status === 403 || err.status === 404)) return { kind: 'forbidden' };
        return { kind: 'retry' };
      }
    },
    onShowChanged: () => {
      if (!withShow || refetching) return;
      refetching = true;
      void qc.refetchQueries({ queryKey: bumperKeys.detail(showId), exact: true }).finally(() => {
        refetching = false;
      });
    },
    post: (input) => bumpersApi.control(showId, input),
    describeError: (err) => errorMessage(err, "That press didn't go through. Try again."),
  });
}

/* ---------------------------------------------------------------- public (keys) */

export interface PublicLive extends LiveSnapshot {
  show: BumperPublicShow | null;
  /** The first load finished (successfully or not). */
  loaded: boolean;
  send: (input: BumperControlInput) => Promise<BumperLiveState | null>;
  cid: string;
}

interface PublicShowStore {
  show: BumperPublicShow | null;
  loaded: boolean;
}

/**
 * OBS outputs (`output`, the output key) and docks (`dock`, the control key). Reconnects
 * forever, refetches the show when it changes, stops for good on `revoked` (or when the key
 * answers 404). Expected network failures are swallowed: an OBS source must stay quiet.
 */
export function usePublicLive(key: string, kind: 'output' | 'dock'): PublicLive {
  const [store] = useState(() => new PublicShowLoader());
  const channel = useMemo(() => publicChannel(key, kind, store), [key, kind, store]);
  const snap = useSyncExternalStore(channel.subscribe, channel.getSnapshot, channel.getServerSnapshot);
  const data = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  useEffect(() => {
    store.bind(key, kind, channel);
    let alive = true;
    void store.load().then((ok) => {
      if (alive && ok) channel.start();
    });
    return () => {
      alive = false;
      store.unbind();
      channel.stop();
    };
  }, [store, channel, key, kind]);

  return { ...snap, show: data.show, loaded: data.loaded, send: channel.send, cid: channel.cid };
}

/** Holds the public show payload and refetches it (coalesced) when the stream says it changed. */
class PublicShowLoader {
  private value: PublicShowStore = { show: null, loaded: false };
  private listeners = new Set<() => void>();
  private key = '';
  private kind: 'output' | 'dock' = 'output';
  private channel: LiveChannel | null = null;
  private abort: AbortController | null = null;
  private inflight: Promise<boolean> | null = null;
  private again = false;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.value;
  getServerSnapshot = () => this.value;

  bind(key: string, kind: 'output' | 'dock', channel: LiveChannel) {
    this.key = key;
    this.kind = kind;
    this.channel = channel;
  }

  unbind() {
    this.abort?.abort();
    this.abort = null;
    this.inflight = null;
    this.again = false;
    this.channel = null;
  }

  private set(v: Partial<PublicShowStore>) {
    this.value = { ...this.value, ...v };
    this.listeners.forEach((l) => l());
  }

  /** Fetch the payload. Resolves false when the key is gone (the channel is told) or the page left. */
  load(): Promise<boolean> {
    if (this.inflight) {
      this.again = true;
      return this.inflight;
    }
    const run = async (): Promise<boolean> => {
      const res = await this.fetch();
      if (res.kind === 'ok') return true;
      if (res.kind === 'gone') {
        this.channel?.markGone(res.reason);
        this.set({ loaded: true });
        return false;
      }
      // Unreachable: keep what we have, the channel's reconnect loop tries again.
      this.set({ loaded: true });
      return res.kind !== 'aborted';
    };
    const p: Promise<boolean> = run().finally(() => {
      if (this.inflight !== p) return;
      this.inflight = null;
      if (this.again) {
        this.again = false;
        void this.load();
      }
    });
    this.inflight = p;
    return p;
  }

  async fetch(): Promise<ProbeResult | { kind: 'aborted' }> {
    this.abort?.abort();
    const ctrl = new AbortController();
    this.abort = ctrl;
    try {
      const show = this.kind === 'output' ? await publicBumpers.output(this.key, ctrl.signal) : await publicBumpers.control(this.key, ctrl.signal);
      if (ctrl.signal.aborted) return { kind: 'aborted' };
      this.channel?.setKnownVersion(show.version);
      this.channel?.accept(show.state);
      this.set({ show, loaded: true });
      return { kind: 'ok' };
    } catch (err) {
      if (ctrl.signal.aborted) return { kind: 'aborted' };
      const e = err as { status?: number; code?: string };
      if (e.status === 404 || e.status === 410) return { kind: 'gone', reason: e.code === 'archived' ? 'archived' : 'rotated' };
      return { kind: 'retry' };
    } finally {
      if (this.abort === ctrl) this.abort = null;
    }
  }
}

function publicChannel(key: string, kind: 'output' | 'dock', loader: PublicShowLoader): LiveChannel {
  return new LiveChannel({
    cidPrefix: kind === 'output' ? 'o' : 'd',
    url: (cid) => (kind === 'output' ? publicBumpers.outputStreamUrl(key, cid, isObs()) : publicBumpers.controlStreamUrl(key, cid, isObs())),
    withCredentials: false,
    probe: async () => {
      const res = await loader.fetch();
      return res.kind === 'aborted' ? { kind: 'retry' } : res;
    },
    onShowChanged: () => {
      void loader.load();
    },
    post: (input) => publicBumpers.send(key, input),
    describeError: (err) => {
      const e = err as { status?: number; message?: string };
      if (e.status === 429) return 'Easy on the buttons. Try again in a few seconds.';
      if (e.status === 404) return 'This link was replaced. Grab the new one in Zemi Studio.';
      if (e.status && e.status < 500 && e.message) return e.message;
      return "That press didn't reach Zemi. Check the connection.";
    },
  });
}

/* ---------------------------------------------------------------- director target */

/**
 * The director target for a state, held back until the show we render knows the state's slide
 * and version (the director drops targets it can't resolve and never retries them). Once the
 * show catches up, the held seq goes through.
 */
export function useDirectorTarget(state: BumperLiveState | null, slides: readonly BumperSlide[] | undefined, showVersion: number | undefined): DirectorTarget | null {
  const [held, setHeld] = useState<DirectorTarget | null>(null);
  const ok =
    !!state &&
    !!slides &&
    showVersion !== undefined &&
    showVersion >= state.version &&
    (state.slideId === null || slides.some((s) => s.id === state.slideId));
  if (ok && state && (!held || state.seq > held.seq)) {
    setHeld({ slideId: state.slideId, seq: state.seq, transition: state.transition, dir: state.dir, since: state.slideSince ? Date.parse(state.slideSince) : null });
  }
  return held;
}
