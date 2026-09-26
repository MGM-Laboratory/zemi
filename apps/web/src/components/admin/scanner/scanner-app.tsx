'use client';

import './scanner.css';
import {
  formatJakarta,
  parseTicketPayload,
  type EventAdmin,
  type ScanResult,
} from '@zemi/shared';
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Check,
  ChevronDown,
  Flashlight,
  FlashlightOff,
  History,
  Keyboard,
  RefreshCw,
  Settings2,
  SwitchCamera,
  Volume2,
  VolumeX,
  WifiOff,
  X,
  ZoomIn,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentPropsWithRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { AdminMark } from '@/components/admin/brand/admin-mark';
import { Character } from '@/components/admin/characters/character';
import { useAttendanceStream } from '@/components/admin/people/use-attendance-stream';
import { useEventAdmin, useLiveStatus, usePermSet } from '@/components/admin/events/use-event';
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/admin/ui/popover';
import { Spinner } from '@/components/admin/ui/spinner';
import { adminFetch, isApiError, formatWait } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { adminRoutes } from '@/lib/admin/nav';
import { createQrDetector, type QrDetector } from './detector-client';
import type { EnginePreference } from './detect-core';
import { FeedbackCard, type FeedbackKind, type ScanFeedback } from './feedback-card';
import { buzz, deviceLabel, playTone, unlockAudio, type Tone } from './feedback';
import { ManualEntry } from './manual-entry';
import { useCamera, type CameraStatus } from './use-camera';
import { GUIDE_SHARE, useScanLoop } from './use-scan-loop';

/* ------------------------------------------------------------------ prefs */

const MUTE_KEY = 'zemi.scanner.muted';
const NAME_KEY = 'zemi.scanner.name';
const DEDUPE_MS = 3000;

function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}
function writePref(key: string, value: string | null) {
  try {
    if (value == null || value === '') window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

/* ------------------------------------------------------------------ types */

type RecentStatus = 'pending' | FeedbackKind;
interface RecentScan {
  id: number;
  payload: string;
  at: number;
  status: RecentStatus;
  name: string | null;
  code: string | null;
  source: 'camera' | 'typed';
}

const RECENT_TONE: Record<RecentStatus, string> = {
  pending: 'bg-white/40',
  'checked-in': 'bg-green',
  already: 'bg-yellow',
  'wrong-event': 'bg-red',
  cancelled: 'bg-red',
  'not-found': 'bg-red',
  slow: 'bg-blue',
  offline: 'bg-white/40',
  error: 'bg-red',
};
const RECENT_LABEL: Record<RecentStatus, string> = {
  pending: 'Checking',
  'checked-in': 'Checked in',
  already: 'Already in',
  'wrong-event': 'Wrong event',
  cancelled: 'Cancelled',
  'not-found': 'Not found',
  slow: 'Too fast',
  offline: 'Not sent',
  error: 'Failed',
};

const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;

/* ------------------------------------------------------------------ entry */

/**
 * /admin/scan/[eventId]: full-screen door scanner. The layout already checked the session;
 * here we load the event and make sure this person may scan for it.
 */
export function ScannerApp({ eventId }: { eventId: string }) {
  const query = useEventAdmin(eventId);
  const event = query.data;
  const perms = usePermSet(event?.permissions);

  if (query.isPending) {
    return (
      <Centered>
        <AdminMark size={40} variant="loading" tone="paper" label="Loading the event" />
        <p className="text-white/70">Finding this Friday...</p>
      </Centered>
    );
  }
  if (!event) {
    const notFound = isApiError(query.error) && query.error.isNotFound;
    const forbidden = isApiError(query.error) && query.error.isForbidden;
    return (
      <Centered>
        <Character shape="triangle" mood="oops" size={88} color="#f94141" />
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">
          {notFound ? "We couldn't find that event." : forbidden ? 'This door is not yours to watch.' : "We can't reach the server."}
        </h1>
        <p className="max-w-sm text-white/70">
          {notFound
            ? 'The link may be off by a character, or the event was deleted.'
            : forbidden
              ? 'Ask the superadmin for door access (Door crew) on this event.'
              : 'Check the wifi and try again. Your session is fine.'}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {!notFound && !forbidden ? (
            <DarkButton onClick={() => void query.refetch()} icon={<RefreshCw className="size-4" />}>
              Try again
            </DarkButton>
          ) : null}
          <DarkButton asLink href={adminRoutes.events} variant="ghost">
            All events
          </DarkButton>
        </div>
      </Centered>
    );
  }
  if (!perms.has('attendance.scan')) {
    return (
      <Centered>
        <Character shape="square" mood="look" lookAt={{ x: 0.6, y: -0.2 }} size={88} color="#f7bf33" />
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">You can see this event, but not scan for it.</h1>
        <p className="max-w-sm text-white/70">Scanning needs door access (attendance) on {event.title}. The superadmin can add it.</p>
        <DarkButton asLink href={adminRoutes.event(eventId)} variant="ghost">
          Back to the event
        </DarkButton>
      </Centered>
    );
  }
  return <ScannerScreen event={event} canSeeBoard={perms.has('attendance.scan')} />;
}

/* ------------------------------------------------------------------ screen */

function ScannerScreen({ event, canSeeBoard }: { event: EventAdmin; canSeeBoard: boolean }) {
  const params = useSearchParams();
  const pref = (['native', 'zxing'].includes(params?.get('detector') ?? '') ? params!.get('detector') : 'auto') as EnginePreference;
  const debug = params?.get('debug') === '1';
  const reduce = useReducedMotion();
  const status = useLiveStatus(event);

  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const camera = useCamera(videoRef);
  const [detector, setDetector] = useState<QrDetector | null>(null);
  const [detectorError, setDetectorError] = useState<string | null>(null);
  const detectorRef = useRef<QrDetector | null>(null);
  const [paused, setPaused] = useState(false);
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const feedbackRef = useRef<{ fb: ScanFeedback; payload: string } | null>(null);
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const [scanCounts, setScanCounts] = useState<{ value: { checkedIn: number; registered: number }; at: number } | null>(null);
  // Per-device prefs. This screen only renders in the browser (after the event query), so lazy init is safe.
  const [muted, setMuted] = useState(() => readPref(MUTE_KEY) === '1');
  const [name, setName] = useState(() => readPref(NAME_KEY) ?? '');
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [manualOpen, setManualOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [focusRing, setFocusRing] = useState<{ x: number; y: number; key: number } | null>(null);
  const [announce, setAnnounce] = useState('');
  const seen = useRef(new Map<string, number>());
  const seq = useRef(0);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live counts from any device. Whichever is newer wins: the counts from our own scan answer, or the live stream.
  const stream = useAttendanceStream(event.id, { enabled: canSeeBoard });
  const counts: { checkedIn: number; registered: number } =
    scanCounts && scanCounts.at >= (stream.lastMessageAt ?? 0)
      ? scanCounts.value
      : stream.counts
        ? { checkedIn: stream.counts.checkedIn, registered: stream.counts.registered }
        : (scanCounts?.value ?? { checkedIn: event.counts.checkedIn, registered: event.counts.registrations });

  // Hidden tab or leaving the page: camera off, back to the "Enable camera" step.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden' && (camera.status === 'live' || camera.status === 'starting')) {
        camera.stop();
        setPaused(true);
      }
    };
    const onHide = () => camera.stop();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
    };
  }, [camera]);

  // Keep the screen awake while scanning (where supported).
  useEffect(() => {
    if (camera.status !== 'live') return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    wl?.request('screen')
      .then((l) => {
        if (cancelled) void l.release();
        else lock = l;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      void lock?.release().catch(() => undefined);
    };
  }, [camera.status]);

  // Detector lives as long as the page.
  useEffect(
    () => () => {
      detectorRef.current?.dispose();
      detectorRef.current = null;
    },
    [],
  );

  const ensureDetector = useCallback(async () => {
    if (detectorRef.current) return detectorRef.current;
    try {
      const d = await createQrDetector(pref);
      detectorRef.current = d;
      setDetector(d);
      setDetectorError(null);
      return d;
    } catch (err) {
      setDetectorError(err instanceof Error ? err.message : 'The QR reader did not load.');
      return null;
    }
  }, [pref]);

  const enable = useCallback(() => {
    unlockAudio();
    setPaused(false);
    void ensureDetector();
    void camera.start();
  }, [camera, ensureDetector]);

  const device = useMemo(() => deviceLabel(name), [name]);

  const sound = useCallback(
    (tone: Tone) => {
      if (!muted) playTone(tone);
      buzz(tone);
    },
    [muted],
  );

  const showHint = (text: string) => {
    setHint(text);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 2600);
  };

  const present = useCallback((fb: Omit<ScanFeedback, 'id'>, payload: string) => {
    const full = { ...fb, id: ++seq.current };
    feedbackRef.current = { fb: full, payload };
    setFeedback(full);
    setAnnounce(`${fb.title}. ${fb.body ?? ''}`);
  }, []);

  const dismiss = useCallback(() => {
    if (feedbackRef.current) seen.current.set(feedbackRef.current.payload, Date.now());
    feedbackRef.current = null;
    setFeedback(null);
  }, []);

  const updateRecent = (id: number, patch: Partial<RecentScan>) => setRecent((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // Retry buttons call the latest submit through a ref (a callback can't name itself before it exists).
  const submitRef = useRef<(payload: string, source: 'camera' | 'typed', reuseId?: number) => Promise<void>>(async () => undefined);
  const submit = useCallback(
    async (payload: string, source: 'camera' | 'typed', reuseId?: number) => {
      const id = reuseId ?? ++seq.current;
      if (reuseId) updateRecent(id, { status: 'pending', at: Date.now() });
      else setRecent((list) => [{ id, payload, at: Date.now(), status: 'pending' as const, name: null, code: null, source }, ...list].slice(0, 40));
      setPending((n) => n + 1);
      try {
        const res = await adminFetch<ScanResult>(`/admin/events/${event.id}/attendance/scan`, { method: 'POST', body: { payload, device } });
        setScanCounts({ value: { checkedIn: res.counts.checkedIn, registered: res.counts.registered }, at: Date.now() });
        const reg = res.registration;
        updateRecent(id, { status: res.outcome, name: reg?.fullName ?? null, code: reg?.ticketCode ?? null });
        present(feedbackFor(res), payload);
        sound(res.outcome === 'checked-in' ? 'ok' : res.outcome === 'already' ? 'already' : 'bad');
      } catch (err) {
        if (isApiError(err) && err.isNetwork) {
          updateRecent(id, { status: 'offline' });
          present(
            {
              kind: 'offline',
              title: "That scan didn't go through",
              body: navigator.onLine ? "We couldn't reach the server. Try again in a second." : "You're offline. Try again once the wifi is back.",
              closeAfter: null,
              retry: () => {
                dismiss();
                void submitRef.current(payload, source, id);
              },
            },
            payload,
          );
          sound('bad');
        } else if (isApiError(err) && err.isRateLimited) {
          updateRecent(id, { status: 'slow' });
          present(
            {
              kind: 'slow',
              title: 'Slow down a sec',
              body: `That's a lot of scans in one minute. Try again in ${formatWait(err.retryAfterSec ?? 10)}.`,
              closeAfter: 4000,
            },
            payload,
          );
          sound('already');
        } else if (isApiError(err) && err.isForbidden) {
          updateRecent(id, { status: 'error' });
          present({ kind: 'error', title: "You can't scan here anymore", body: 'Your door access for this event changed. Ask the superadmin.', closeAfter: null }, payload);
          sound('bad');
        } else if (isApiError(err) && (err.isValidation || err.isNotFound)) {
          updateRecent(id, { status: 'not-found' });
          present({ kind: 'not-found', title: "We don't know this ticket", body: "It doesn't look like a Zemi ticket. Try the code under the QR.", closeAfter: 4500 }, payload);
          sound('bad');
        } else {
          updateRecent(id, { status: 'error' });
          present(
            {
              kind: 'error',
              title: 'The server tripped',
              body: 'Nothing was saved. Try that one again.',
              closeAfter: null,
              retry: () => {
                dismiss();
                void submitRef.current(payload, source, id);
              },
            },
            payload,
          );
          sound('bad');
        }
      } finally {
        setPending((n) => Math.max(0, n - 1));
      }
    },
    [device, dismiss, event.id, present, sound],
  );
  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  const onValue = useCallback(
    (value: string) => {
      const key = value.trim();
      if (!key) return;
      const now = Date.now();
      const current = feedbackRef.current;
      if (current) {
        if (current.payload === key) seen.current.set(key, now);
        return;
      }
      const last = seen.current.get(key);
      seen.current.set(key, now);
      if (last && now - last < DEDUPE_MS) return;
      if (!parseTicketPayload(key)) {
        showHint("That QR isn't a Zemi ticket.");
        sound('tick');
        return;
      }
      void submit(key, 'camera');
    },
    [sound, submit],
  );

  const live = camera.status === 'live';
  const loop = useScanLoop(videoRef, detector, live, onValue);

  // Debug overlay numbers.
  const [dbg, setDbg] = useState('');
  useEffect(() => {
    if (!debug || !live) return;
    let prev = loop.current.frames;
    const t = setInterval(() => {
      const s = loop.current;
      setDbg(`${detector?.kind ?? '...'} in ${detector?.where ?? '...'} · ${s.frames - prev} fps · ${Math.round(s.lastMs)} ms · hits ${JSON.stringify(s.hits)}`);
      prev = s.frames;
    }, 1000);
    return () => clearInterval(t);
  }, [debug, live, loop, detector]);

  const onStagePointer = async (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!camera.focusSupported || !videoRef.current || !stageRef.current) return;
    if ((e.target as HTMLElement).closest('button, a, input, [role="slider"]')) return;
    const rect = stageRef.current.getBoundingClientRect();
    const v = videoRef.current;
    const vw = v.videoWidth || rect.width;
    const vh = v.videoHeight || rect.height;
    const scale = Math.max(rect.width / vw, rect.height / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    let x = (e.clientX - rect.left - (rect.width - dw) / 2) / dw;
    const y = (e.clientY - rect.top - (rect.height - dh) / 2) / dh;
    if (camera.facing === 'user') x = 1 - x;
    const ok = await camera.focusAt(Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y)));
    if (ok) setFocusRing({ x: e.clientX - rect.left, y: e.clientY - rect.top, key: Date.now() });
  };

  const switchTo = (deviceId: string) => {
    unlockAudio();
    void camera.start(deviceId);
  };

  const nextCamera = () => {
    if (camera.devices.length < 2) return;
    const i = camera.devices.findIndex((d) => d.deviceId === camera.deviceId);
    const next = camera.devices[(i + 1) % camera.devices.length]!;
    switchTo(next.deviceId);
  };

  const blocked = (['denied', 'insecure', 'unavailable', 'busy', 'error'] as CameraStatus[]).includes(camera.status);
  const showIntro = !live && camera.status !== 'starting';
  const percent = counts && counts.registered ? Math.min(1, counts.checkedIn / counts.registered) : 0;

  return (
    <div className="zemi-scan relative flex h-dvh flex-col overflow-hidden select-none">
      <p className="sr-only" aria-live="assertive" aria-atomic="true">
        {announce}
      </p>

      {/* Camera stage */}
      <div
        ref={stageRef}
        className={cn('absolute inset-0 transition-opacity duration-300', live ? 'opacity-100' : 'opacity-0')}
        onPointerDown={onStagePointer}
        aria-hidden={!live}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          disablePictureInPicture
          className={cn('size-full object-cover', camera.facing === 'user' && '-scale-x-100')}
          aria-label="Camera preview"
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(14,17,22,0.55)_100%)]" aria-hidden="true" />
        <Guide pending={pending > 0} reduce={Boolean(reduce)} />
        {focusRing ? (
          <span
            key={focusRing.key}
            className="zemi-scan-focus pointer-events-none absolute size-16 rounded-full border-2 border-yellow"
            style={{ left: focusRing.x, top: focusRing.y }}
            aria-hidden="true"
          />
        ) : null}
      </div>

      {/* Top bar */}
      <header className="relative z-20 flex items-center gap-2 bg-gradient-to-b from-[#0e1116]/85 to-transparent px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-6 sm:px-5">
        <DarkIcon asLink href={adminRoutes.event(event.id, 'attendance')} label="Back to the attendance board">
          <ArrowLeft />
        </DarkIcon>
        <div className="min-w-0 flex-1 pl-1">
          <p className="truncate font-display text-[1.0625rem] leading-tight font-extrabold tracking-[-0.02em]">{event.title}</p>
          <p className="mono truncate text-xs text-white/65">
            <span className="hidden sm:inline">{formatJakarta(event.startsAt, 'date')}</span>
            <span className="sm:hidden">{formatJakarta(event.startsAt, 'date-short')}</span> · {formatJakarta(event.startsAt, 'time')} to{' '}
            {formatJakarta(event.endsAt, 'time')} WIB
          </p>
        </div>
        <Counter counts={counts} percent={percent} pulse={stream.pulse} reduce={Boolean(reduce)} />
        <DarkIcon
          label={muted ? 'Turn sound on' : 'Mute sounds'}
          pressed={!muted}
          onClick={() => {
            const next = !muted;
            setMuted(next);
            writePref(MUTE_KEY, next ? '1' : null);
            if (!next) {
              unlockAudio();
              playTone('tick');
            }
          }}
        >
          {muted ? <VolumeX /> : <Volume2 />}
        </DarkIcon>
        <SettingsPopover name={name} onName={(v) => { setName(v); writePref(NAME_KEY, v.trim() || null); }} device={device} />
      </header>

      {/* Banners */}
      <div className="relative z-20 space-y-2 px-3 sm:px-5">
        {!online ? (
          <Banner tone="red" icon={<WifiOff className="size-4" />}>
            You&apos;re offline. Scans won&apos;t go through until the wifi is back.
          </Banner>
        ) : null}
        {status === 'cancelled' ? <Banner tone="red">This event was cancelled. Scans still get logged.</Banner> : null}
        {status === 'past' ? <Banner tone="yellow">This Friday already wrapped. Late check-ins still count.</Banner> : null}
        {stream.status === 'reconnecting' && live ? <Banner tone="ink">Live counts are reconnecting. Scanning still works.</Banner> : null}
        {detectorError && live ? (
          <Banner tone="red">The QR reader did not load ({detectorError}). Type codes by hand for now.</Banner>
        ) : null}
      </div>

      {/* Intro, paused and blocked states */}
      <AnimatePresence>
        {showIntro ? (
          <motion.section
            key="intro"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative z-10 flex flex-1 flex-col items-center overflow-y-auto px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center"
          >
            {/* my-auto centers when it fits and scrolls from the top when it doesn't (phones in landscape). */}
            <div className="my-auto flex w-full flex-col items-center py-2">
              {blocked ? (
                <BlockedHelp status={camera.status} message={camera.message} onRetry={enable} onManual={() => setManualOpen(true)} />
              ) : (
                <Intro paused={paused} onEnable={enable} onManual={() => setManualOpen(true)} device={device} />
              )}
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

      {camera.status === 'starting' ? (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 text-center" role="status">
          <AdminMark size={44} variant="loading" tone="paper" label="Starting the camera" />
          <p className="text-white/80">Asking for the camera...</p>
          <p className="max-w-xs text-sm text-white/55">If your browser asks, tap Allow. We only use it while this screen is open.</p>
        </div>
      ) : null}

      {/* Live controls */}
      {live ? (
        <>
          <div className="relative z-10 flex-1" aria-hidden="true" />
          <div className="relative z-20 flex flex-col items-center gap-3 bg-gradient-to-t from-[#0e1116]/90 via-[#0e1116]/60 to-transparent px-3 pt-10 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5 landscape:max-sm:pt-4 [@media(max-height:32rem)]:gap-2 [@media(max-height:32rem)]:pt-3 [@media(max-height:32rem)]:pb-[max(0.625rem,env(safe-area-inset-bottom))]">
            <AnimatePresence>
              {hint ? (
                <motion.p
                  key={hint}
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 8, opacity: 0 }}
                  className="rounded-full bg-white/15 px-4 py-2 text-sm font-medium backdrop-blur"
                  role="status"
                >
                  {hint}
                </motion.p>
              ) : (
                <motion.p key="aim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-full bg-[#0e1116]/45 px-3.5 py-1.5 text-sm text-white/90 backdrop-blur-sm [@media(max-height:32rem)]:hidden">
                  {pending ? 'Checking the ticket...' : camera.focusSupported ? 'Point at the QR. Tap the picture to focus.' : 'Point at the QR on their ticket.'}
                </motion.p>
              )}
            </AnimatePresence>
            {camera.zoomRange ? (
              <label className="flex w-full max-w-sm items-center gap-3 text-white/80">
                <ZoomIn className="size-4 shrink-0" aria-hidden="true" />
                <span className="sr-only">Zoom</span>
                <input
                  type="range"
                  min={camera.zoomRange.min}
                  max={camera.zoomRange.max}
                  step={camera.zoomRange.step}
                  value={camera.zoom ?? camera.zoomRange.min}
                  onChange={(e) => void camera.setZoom(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer accent-white"
                  aria-valuetext={`${(camera.zoom ?? 1).toFixed(1)}x`}
                />
                <span className="mono w-10 text-right text-xs tabular-nums">{(camera.zoom ?? 1).toFixed(1)}x</span>
              </label>
            ) : null}
            <div className="grid w-full max-w-md grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="flex items-center justify-start gap-2">
                {camera.torchSupported ? (
                  <DarkIcon label={camera.torch ? 'Turn the light off' : 'Turn the light on'} pressed={camera.torch} onClick={() => void camera.setTorch(!camera.torch)} size="lg">
                    {camera.torch ? <Flashlight /> : <FlashlightOff />}
                  </DarkIcon>
                ) : null}
                {camera.devices.length > 1 ? <CameraPicker camera={camera} onPick={switchTo} onNext={nextCamera} /> : null}
              </div>
              <DarkButton onClick={() => setManualOpen(true)} icon={<Keyboard className="size-4" />} variant="solid">
                Type a code
              </DarkButton>
              <div className="flex items-center justify-end gap-2">
                <DarkIcon label={`Recent scans (${recent.length})`} onClick={() => setHistoryOpen((o) => !o)} pressed={historyOpen} size="lg" badge={recent.length || undefined}>
                  <History />
                </DarkIcon>
                <DarkIcon
                  label="Stop the camera"
                  onClick={() => {
                    camera.stop();
                    setPaused(false);
                  }}
                  size="lg"
                >
                  <CameraOff />
                </DarkIcon>
              </div>
            </div>
            {/* Phones in landscape: keep the guide clear. The history button keeps its count. */}
            <RecentStrip recent={recent} onOpen={() => setHistoryOpen(true)} className="[@media(max-height:32rem)]:hidden" />
            {debug ? <p className="mono w-full max-w-md truncate text-[0.6875rem] text-white/60">{dbg || 'warming up'} · {camera.resolution ? `${camera.resolution.width}x${camera.resolution.height}` : ''}</p> : null}
          </div>
        </>
      ) : null}

      <AnimatePresence>{historyOpen ? <HistoryPanel recent={recent} onClose={() => setHistoryOpen(false)} onRetry={(r) => void submit(r.payload, r.source, r.id)} /> : null}</AnimatePresence>

      <ManualEntry
        open={manualOpen}
        onOpenChange={setManualOpen}
        busy={pending > 0}
        onSubmit={(payload) => {
          unlockAudio();
          setManualOpen(false);
          seen.current.set(payload, Date.now());
          void submit(payload, 'typed');
        }}
      />

      <AnimatePresence>{feedback ? <FeedbackCard key={feedback.id} feedback={feedback} onDismiss={dismiss} /> : null}</AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ outcome copy */

function feedbackFor(res: ScanResult): Omit<ScanFeedback, 'id'> {
  const reg = res.registration;
  switch (res.outcome) {
    case 'checked-in':
      return {
        kind: 'checked-in',
        title: `Welcome, ${reg ? firstName(reg.fullName) : 'friend'}!`,
        body: reg ? reg.fullName : res.message,
        meta: reg
          ? `${reg.attendanceMode === 'online' ? 'Signed up for online, came anyway' : 'In person'} · ${reg.ticketCode} · #${res.counts.checkedIn} through the door`
          : undefined,
        closeAfter: 1800,
      };
    case 'already':
      return {
        kind: 'already',
        title: reg?.checkedInAt ? `Already in since ${formatJakarta(reg.checkedInAt, 'time')} WIB` : 'Already checked in',
        body: reg ? `${reg.fullName}${reg.checkedInBy ? `, let in by ${reg.checkedInBy}` : ''}. Wave them through.` : res.message,
        meta: reg?.ticketCode,
        closeAfter: 2600,
      };
    case 'wrong-event':
      return {
        kind: 'wrong-event',
        title: 'Wrong Friday',
        body: res.otherEvent
          ? `This ticket is for "${res.otherEvent.title}" on ${formatJakarta(res.otherEvent.startsAt, 'date')}. Add them as a walk-in if there's room.`
          : res.message,
        meta: reg ? `${reg.fullName} · ${reg.ticketCode}` : undefined,
        closeAfter: null,
      };
    case 'cancelled':
      return {
        kind: 'cancelled',
        title: 'This ticket was cancelled',
        body: `${reg ? reg.fullName : 'They'} released the seat earlier. Add them as a walk-in if there's room.`,
        meta: reg?.ticketCode,
        closeAfter: null,
      };
    case 'not-found':
    default:
      return {
        kind: 'not-found',
        title: "We don't know this ticket",
        body: 'Maybe a typo, or a ticket from somewhere else. Try the code under the QR.',
        closeAfter: 4500,
      };
  }
}

/* ------------------------------------------------------------------ pieces */

function Centered({ children }: { children: ReactNode }) {
  return <div className="zemi-scan flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">{children}</div>;
}

function Guide({ pending, reduce }: { pending: boolean; reduce: boolean }) {
  const size = `min(${GUIDE_SHARE * 100}vmin, 26rem)`;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
      <div className="zemi-scan-guide relative" style={{ width: size, height: size }}>
        {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
          <span
            key={c}
            className={cn(
              'absolute size-12 border-white transition-colors duration-200',
              pending && 'border-yellow',
              c === 'tl' && 'top-0 left-0 rounded-tl-[22px] border-t-4 border-l-4',
              c === 'tr' && 'top-0 right-0 rounded-tr-[22px] border-t-4 border-r-4',
              c === 'bl' && 'bottom-0 left-0 rounded-bl-[22px] border-b-4 border-l-4',
              c === 'br' && 'right-0 bottom-0 rounded-br-[22px] border-r-4 border-b-4',
            )}
          />
        ))}
        {!reduce ? (
          <div className="absolute inset-x-4 inset-y-3 overflow-hidden">
            <div className="zemi-scan-sweep h-full w-full">
              <div className="h-0.5 w-full rounded-full bg-gradient-to-r from-transparent via-white/80 to-transparent shadow-[0_0_16px_rgba(255,255,255,0.6)]" />
            </div>
          </div>
        ) : null}
        {pending ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <Spinner size={28} tone="paper" label="Checking" />
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Counter({ counts, percent, pulse, reduce }: { counts: { checkedIn: number; registered: number } | null; percent: number; pulse: number; reduce: boolean }) {
  const r = 13;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-full bg-white/10 py-1 pr-3 pl-1 backdrop-blur" aria-label={counts ? `${counts.checkedIn} of ${counts.registered} checked in` : 'Loading counts'} role="status">
      <svg width={32} height={32} viewBox="0 0 32 32" className="-rotate-90" aria-hidden="true">
        <circle cx={16} cy={16} r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={4} />
        <motion.circle
          cx={16}
          cy={16}
          r={r}
          fill="none"
          stroke="var(--color-green)"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - percent) }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 22 }}
        />
      </svg>
      <motion.span
        key={pulse}
        initial={reduce ? false : { scale: 1.25 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 18 }}
        className="mono text-sm font-semibold tabular-nums"
      >
        {counts ? (
          <>
            {counts.checkedIn}
            <span className="text-white/55">/{counts.registered}</span>
          </>
        ) : (
          '...'
        )}
      </motion.span>
    </div>
  );
}

function Intro({ paused, onEnable, onManual, device }: { paused: boolean; onEnable: () => void; onManual: () => void; device: string }) {
  return (
    <div className="flex max-w-md flex-col items-center gap-6 [@media(max-height:32rem)]:gap-4">
      <div className="flex items-end gap-2 [@media(max-height:32rem)]:hidden" aria-hidden="true">
        <Character shape="circle" mood={paused ? 'sleep' : 'look'} follow size={72} />
        <Character shape="square" mood={paused ? 'sleep' : 'idle'} size={52} />
        <Character shape="arch" mood={paused ? 'sleep' : 'look'} follow size={60} />
      </div>
      <div>
        <h1 className="font-display text-[clamp(2rem,8vw,3rem)] leading-[0.95] font-black tracking-[-0.035em] [font-variation-settings:'CASL'_0.5]">
          {paused ? 'Camera paused.' : 'Door duty, ready?'}
        </h1>
        <p className="mt-3 text-[1.0625rem] text-white/75">
          {paused
            ? 'We switched it off when you left the screen. Tap below to keep scanning.'
            : 'We only turn the camera on when you tap, and it switches off the moment you leave.'}
        </p>
      </div>
      <button
        type="button"
        onClick={onEnable}
        className="group inline-flex h-16 items-center gap-3 rounded-full bg-white px-8 text-lg font-bold text-ink shadow-[0_18px_50px_-12px_rgba(58,109,197,0.7)] transition-transform duration-150 hover:scale-[1.02] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-white active:scale-[0.96]"
      >
        <Camera className="size-6 transition-transform duration-300 group-hover:-rotate-12" aria-hidden="true" />
        {paused ? 'Turn the camera back on' : 'Enable camera'}
      </button>
      <button type="button" onClick={onManual} className="rounded-full px-4 py-2 text-[0.9375rem] font-medium text-white/80 underline-offset-4 hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-white">
        No camera? Type ticket codes instead
      </button>
      <p className="mono text-xs text-white/45">Scans are signed as: {device}</p>
    </div>
  );
}

function BlockedHelp({ status, message, onRetry, onManual }: { status: CameraStatus; message: string | null; onRetry: () => void; onManual: () => void }) {
  const title =
    status === 'denied'
      ? 'The camera is blocked.'
      : status === 'insecure'
        ? 'The camera needs https.'
        : status === 'unavailable'
          ? 'No camera here.'
          : status === 'busy'
            ? 'The camera is busy.'
            : 'The camera hiccuped.';
  return (
    <div className="flex max-w-md flex-col items-center gap-5 [@media(max-height:32rem)]:gap-4">
      <Character shape="triangle" mood="oops" size={84} color="#f94141" className="[@media(max-height:32rem)]:hidden" />
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">{title}</h1>
        <p className="mt-2 text-white/75">{message}</p>
      </div>
      {status === 'denied' ? (
        <ul className="w-full space-y-2 rounded-[20px] bg-white/8 p-4 text-left text-[0.9375rem] text-white/85">
          <li>
            <strong className="font-semibold text-white">iPhone or iPad:</strong> tap <span className="mono">aA</span> in the address bar, then Website Settings, then Camera: Allow.
          </li>
          <li>
            <strong className="font-semibold text-white">Android Chrome:</strong> tap the icon left of the address, then Permissions, then Camera.
          </li>
          <li>
            <strong className="font-semibold text-white">Laptop:</strong> click the camera icon in the address bar and allow it.
          </li>
        </ul>
      ) : status === 'insecure' ? (
        <p className="rounded-[20px] bg-white/8 p-4 text-left text-[0.9375rem] text-white/85">
          Browsers only share cameras with secure pages. Open the https address of the studio (or localhost on this computer).
        </p>
      ) : null}
      <div className="flex flex-wrap justify-center gap-2">
        {status !== 'insecure' && status !== 'unavailable' ? (
          <DarkButton onClick={onRetry} icon={<RefreshCw className="size-4" />} variant="solid">
            Try again
          </DarkButton>
        ) : null}
        <DarkButton onClick={onManual} icon={<Keyboard className="size-4" />} variant="ghost">
          Type codes instead
        </DarkButton>
      </div>
    </div>
  );
}

function Banner({ tone, icon, children }: { tone: 'red' | 'yellow' | 'ink'; icon?: ReactNode; children: ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        'mx-auto flex max-w-md items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium shadow-lg',
        tone === 'red' && 'bg-red-600 text-white',
        tone === 'yellow' && 'bg-yellow text-ink',
        tone === 'ink' && 'bg-white/15 text-white backdrop-blur',
      )}
    >
      {icon}
      <span>{children}</span>
    </div>
  );
}

function RecentStrip({ recent, onOpen, className }: { recent: RecentScan[]; onOpen: () => void; className?: string }) {
  if (!recent.length) return null;
  return (
    <button type="button" onClick={onOpen} className={cn('flex w-full max-w-md items-center gap-2 overflow-hidden rounded-full bg-white/10 px-3 py-2 text-left backdrop-blur transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white', className)} aria-label="Open recent scans">
      <AnimatePresence initial={false}>
        {recent.slice(0, 3).map((r) => (
          <motion.span
            key={r.id}
            layout
            initial={{ opacity: 0, x: -12, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            className="flex min-w-0 shrink items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[0.8125rem]"
          >
            <span className={cn('size-2 shrink-0 rounded-full', RECENT_TONE[r.status])} aria-hidden="true" />
            <span className="truncate">{r.name ? firstName(r.name) : r.code ?? RECENT_LABEL[r.status]}</span>
          </motion.span>
        ))}
      </AnimatePresence>
      <ChevronDown className="ml-auto size-4 shrink-0 rotate-180 text-white/60" aria-hidden="true" />
    </button>
  );
}

function HistoryPanel({ recent, onClose, onRetry }: { recent: RecentScan[]; onClose: () => void; onRetry: (r: RecentScan) => void }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A scan result card on top handles its own Escape (and stops it); never close under it.
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('[data-scan-feedback]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <motion.aside
      initial={reduce ? { opacity: 0 } : { y: '100%' }}
      animate={reduce ? { opacity: 1 } : { y: 0 }}
      exit={reduce ? { opacity: 0 } : { y: '100%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      className="absolute inset-x-0 bottom-0 z-40 flex max-h-[70dvh] flex-col rounded-t-[28px] bg-white text-ink shadow-[0_-20px_60px_rgba(0,0,0,0.35)] sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[24rem] sm:rounded-[28px]"
      aria-label="Recent scans"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <h2 className="font-display text-lg font-extrabold tracking-[-0.02em]">Recent scans</h2>
          <p className="text-sm text-ink-3">This device, this session.</p>
        </div>
        <button type="button" onClick={onClose} className="flex size-9 items-center justify-center rounded-full text-ink-3 hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus" aria-label="Close recent scans">
          <X className="size-5" />
        </button>
      </div>
      <ol className="min-h-0 flex-1 divide-y divide-line overflow-y-auto px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {recent.length === 0 ? <li className="px-3 py-6 text-center text-ink-3">Nothing scanned yet. The first one is always the best.</li> : null}
        {recent.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-3 py-3">
            <span className={cn('size-2.5 shrink-0 rounded-full', RECENT_TONE[r.status] === 'bg-white/40' ? 'bg-ink-4' : RECENT_TONE[r.status])} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.name ?? r.code ?? (r.payload.startsWith('ZM-') ? r.payload : 'Ticket')}</p>
              <p className="text-[0.8125rem] text-ink-3">
                {RECENT_LABEL[r.status]} · {formatJakarta(new Date(r.at), 'time')} WIB{r.source === 'typed' ? ' · typed' : ''}
              </p>
            </div>
            {r.status === 'pending' ? <Spinner size={16} label="Checking" /> : null}
            {r.status === 'offline' || r.status === 'error' ? (
              <button type="button" onClick={() => onRetry(r)} className="rounded-full bg-ink px-3 py-1.5 text-[0.8125rem] font-semibold text-white active:scale-95">
                Retry
              </button>
            ) : r.status === 'checked-in' ? (
              <Check className="size-4 text-green" aria-hidden="true" />
            ) : null}
          </li>
        ))}
      </ol>
    </motion.aside>
  );
}

function CameraPicker({ camera, onPick, onNext }: { camera: ReturnType<typeof useCamera>; onPick: (id: string) => void; onNext: () => void }) {
  const [open, setOpen] = useState(false);
  if (camera.devices.length === 2) {
    return (
      <DarkIcon label="Switch camera" onClick={onNext} size="lg">
        <SwitchCamera />
      </DarkIcon>
    );
  }
  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <DarkIcon label="Pick a camera" size="lg" pressed={open}>
          <SwitchCamera />
        </DarkIcon>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 p-1.5">
        <p className="px-3 pt-2 pb-1 text-xs font-semibold tracking-[0.08em] text-ink-3 uppercase">Cameras</p>
        <ul role="listbox" aria-label="Cameras">
          {camera.devices.map((d) => {
            const active = d.deviceId === camera.deviceId;
            return (
              <li key={d.deviceId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setOpen(false);
                    if (!active) onPick(d.deviceId);
                  }}
                  className={cn('flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-focus', active && 'font-semibold')}
                >
                  <span className="min-w-0 flex-1 truncate">{d.label}</span>
                  {d.facing ? <span className="text-xs text-ink-3">{d.facing === 'environment' ? 'Back' : 'Front'}</span> : null}
                  {active ? <Check className="size-4 text-green" aria-hidden="true" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </PopoverRoot>
  );
}

function SettingsPopover({ name, onName, device }: { name: string; onName: (v: string) => void; device: string }) {
  const [draft, setDraft] = useState(name);
  const [draftFor, setDraftFor] = useState(name);
  if (name !== draftFor) {
    setDraftFor(name);
    setDraft(name);
  }
  return (
    <PopoverRoot onOpenChange={(o) => !o && draft !== name && onName(draft)}>
      <PopoverTrigger asChild>
        <DarkIcon label="Scanner settings">
          <Settings2 />
        </DarkIcon>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-80">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onName(draft);
          }}
        >
          <label htmlFor="zemi-scan-name" className="block text-sm font-semibold text-ink">
            Name this device
          </label>
          <p className="mt-0.5 text-[0.8125rem] text-ink-3">Shows on the live board, so the team knows which door let who in.</p>
          <input
            id="zemi-scan-name"
            value={draft}
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => draft !== name && onName(draft)}
            placeholder="Door A phone"
            className="mt-2 h-11 w-full rounded-[14px] border border-line-strong px-3.5 text-[0.9375rem] outline-none focus:border-blue focus:ring-4 focus:ring-blue/15"
          />
          <p className="mono mt-2 text-xs text-ink-3">Signed as: {device}</p>
        </form>
      </PopoverContent>
    </PopoverRoot>
  );
}

/* ------------------------------------------------------------------ dark controls */

type DarkIconProps = Omit<ComponentPropsWithRef<'button'>, 'children'> & {
  label: string;
  children: ReactNode;
  pressed?: boolean;
  size?: 'md' | 'lg';
  asLink?: boolean;
  href?: string;
  badge?: number;
};

/** Round icon button for the dark scanner chrome. Works as a Radix `asChild` target (ref and props pass through). */
function DarkIcon({ label, children, pressed, size = 'md', asLink, href, badge, className, ...rest }: DarkIconProps) {
  const cls = cn(
    'relative inline-flex shrink-0 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-[background-color,transform] duration-150 hover:bg-white/20 active:scale-[0.92] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [&_svg]:size-5',
    size === 'lg' ? 'size-12' : 'size-10',
    pressed && 'bg-white/25',
    className,
  );
  if (asLink && href) {
    return (
      <Link href={href} className={cls} aria-label={label} title={label}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} aria-label={label} title={label} aria-pressed={pressed} {...rest}>
      {children}
      {badge ? (
        <span className="mono absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[0.6875rem] font-bold text-ink tabular-nums">{badge > 99 ? '99+' : badge}</span>
      ) : null}
    </button>
  );
}

function DarkButton({
  children,
  onClick,
  icon,
  variant = 'solid',
  asLink,
  href,
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  variant?: 'solid' | 'ghost';
  asLink?: boolean;
  href?: string;
}) {
  const cls = cn(
    'inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-[0.9375rem] font-semibold whitespace-nowrap transition-transform duration-150 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
    variant === 'solid' ? 'bg-white text-ink hover:bg-ink-inverse' : 'bg-white/10 text-white hover:bg-white/20',
  );
  if (asLink && href) {
    return (
      <Link href={href} className={cls}>
        {icon}
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {icon}
      {children}
    </button>
  );
}
