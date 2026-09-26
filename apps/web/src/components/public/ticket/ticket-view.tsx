'use client';

import { ArrowLeft, Download, Sun } from 'lucide-react';
import { motion, useSpring } from 'motion/react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { computeEventStatus, formatJakarta, type Ticket } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { CaslHeading } from '@/components/motion/casl-heading';
import { shapeConfetti } from '@/components/motion/shape-confetti';
import { Button } from '@/components/public/ui/button';
import { Dialog } from '@/components/public/ui/dialog';
import { cancelTicket, fetchTicket } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { useNow } from '@/lib/hooks/use-now';
import { prefersReducedMotion, useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import { CalendarButton } from '../events/detail/actions';
import { accentVars, asAccent, eventLabel, labelAndTitle } from '../events/lib';
import { downloadTicketPng } from './save-ticket';
import { MODE_TICKET_LABEL, TicketCard } from './ticket-card';

const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** The code resolves from noise, left to right. Real text for screen readers via aria-label. */
function ScrambleCode({ value }: { value: string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const total = 22;
    const id = window.setInterval(() => {
      frame += 1;
      const lock = Math.floor((frame / total) * value.length);
      setShown(
        value
          .split('')
          .map((ch, i) =>
            i < lock || ch === '-' ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
          )
          .join(''),
      );
      if (frame >= total) {
        window.clearInterval(id);
        setShown(value);
      }
    }, 38);
    return () => window.clearInterval(id);
  }, [value, reduced]);
  return (
    <>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true">{shown}</span>
    </>
  );
}

type WakeLockSentinelLike = { release: () => Promise<void>; released?: boolean };

/** Keep the screen awake while the ticket is showing (door queues are slow). */
function useWakeLock(enabled: boolean) {
  const [state, setState] = useState<'on' | 'off'>('off');
  useEffect(() => {
    const wl = (
      navigator as Navigator & {
        wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> };
      }
    ).wakeLock;
    if (!wl || !enabled) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let disposed = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        sentinel = await wl.request('screen');
        if (disposed) {
          void sentinel.release();
          return;
        }
        setState('on');
      } catch {
        setState('off');
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVis);
      void sentinel?.release().catch(() => {});
    };
  }, [enabled]);
  return state;
}

function TiltTicket({ children, glow }: { children: ReactNode; glow?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const rx = useSpring(0, { stiffness: 160, damping: 18 });
  const ry = useSpring(0, { stiffness: 160, damping: 18 });
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || prefersReducedMotion()) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 10);
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 8);
  };
  const reset = () => {
    rx.set(0);
    ry.set(0);
  };
  return (
    <motion.div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={reset}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1200 }}
      className={cn('relative rounded-[28px] transition-shadow duration-500', glow)}
    >
      {children}
    </motion.div>
  );
}

export function TicketView({ initial, openCancel }: { initial: Ticket; openCancel?: boolean }) {
  const [ticket, setTicket] = useState(initial);
  // `?cancel=1` (from the emails) only opens the confirm when there is a seat left to release.
  const [confirm, setConfirm] = useState(
    !!openCancel &&
      initial.status === 'registered' &&
      !initial.checkedInAt &&
      initial.event.status !== 'past' &&
      initial.event.status !== 'cancelled',
  );
  const [cancelling, setCancelling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cheer, setCheer] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const now = useNow(30_000);

  const e = ticket.event;
  const status =
    e.status === 'cancelled' ? 'cancelled' : now ? computeEventStatus(e, null, now) : e.status;
  const eventOver = status === 'past' || status === 'cancelled';
  const cancelled = ticket.status === 'cancelled';
  const checkedIn = !!ticket.checkedInAt && !cancelled;
  const doorTime = !cancelled && !checkedIn && !eventOver;
  // Check-in flips live: poll while the ticket is waiting at the door (event day only).
  const near = now
    ? Math.abs(Date.parse(e.startsAt) - now.getTime()) < 14 * 3600_000 || status === 'ongoing'
    : false;
  // Keep the screen awake at the door, not while someone checks the ticket a week early.
  const wake = useWakeLock(doorTime && near && ticket.attendanceMode === 'in-person');
  useEffect(() => {
    if (!doorTime || !near) return;
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const t = await fetchTicket(ticket.token);
        if (!stop) setTicket(t);
      } catch {
        /* keep the last one */
      }
    };
    const id = window.setInterval(tick, 12_000);
    const onVis = () => document.visibilityState === 'visible' && void tick();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [doorTime, near, ticket.token]);

  // Celebrate the moment the door scans you (and once when you open a checked-in ticket).
  const celebrated = useRef(false);
  useEffect(() => {
    if (!checkedIn || celebrated.current) return;
    celebrated.current = true;
    const fresh = !initial.checkedInAt;
    const t = window.setTimeout(() => {
      setCheer((c) => c + 1);
      void shapeConfetti({ from: cardRef.current, count: fresh ? 160 : 80, spread: 100 });
    }, 300);
    return () => window.clearTimeout(t);
  }, [checkedIn, initial.checkedInAt]);

  const doCancel = async () => {
    setCancelling(true);
    try {
      const t = await cancelTicket(ticket.token);
      setTicket(t ?? { ...ticket, status: 'cancelled' });
      setConfirm(false);
      toast.success('Seat released. Thanks for letting someone else have it.');
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('cancel');
        window.history.replaceState(window.history.state, '', url.toString());
      } catch {
        /* ignore */
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCancelling(false);
    }
  };

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await downloadTicketPng(ticket);
      toast.success('Ticket saved to your downloads.');
    } catch {
      toast.error("Couldn't draw the ticket image. This page works at the door too.");
    } finally {
      setSaving(false);
    }
  }, [ticket]);

  const accent = asAccent(e.accent);
  let headline: string;
  let sub: string;
  if (cancelled) {
    headline = 'You released this seat.';
    sub = eventOver
      ? 'This Friday is behind us anyway.'
      : 'Someone else can have it now. Changed your mind? Sign up again, it takes 20 seconds.';
  } else if (checkedIn) {
    headline = "You're checked in. Welcome!";
    sub = `Scanned at ${formatJakarta(ticket.checkedInAt!, 'time')} WIB. Grab a coffee and a seat, the good questions start soon.`;
  } else if (status === 'cancelled') {
    headline = 'This Friday got cancelled.';
    sub = 'Sorry about that. Your seat is released, nothing else to do.';
  } else if (status === 'past') {
    headline = 'This Friday is a wrap.';
    sub = 'Thanks for signing up. The recording and photos live on the event page.';
  } else if (ticket.attendanceMode === 'online') {
    headline = 'See you on the stream.';
    sub =
      status === 'ongoing'
        ? 'The livestream is on the event page right now. No link hunting, no app.'
        : `The livestream plays on the event page at ${formatJakarta(e.startsAt, 'time')} WIB. No link hunting, no app.`;
  } else {
    headline = status === 'ongoing' ? 'Doors are open. Show this.' : 'Show this at the door.';
    sub = 'We scan the QR, or just tell us your name. Either way you are in.';
  }

  return (
    <section
      className="relative isolate overflow-clip pb-[var(--section-y)] pt-[calc(var(--nav-h)+clamp(20px,4vw,56px))]"
      style={accentVars(accent)}
      aria-labelledby="ticket-title"
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 -z-10 h-[70vh] transition-colors duration-700',
          checkedIn
            ? 'bg-gradient-to-b from-green-50 to-white'
            : 'bg-gradient-to-b from-[var(--accent-tint)] to-white',
        )}
        aria-hidden="true"
      />
      <div className="container-page grid gap-10 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-start">
        <div className="mx-auto w-full max-w-[40rem] lg:order-2">
          {checkedIn ? (
            <p
              className="mb-4 flex items-center justify-center gap-2 rounded-full bg-green-600 px-4 py-2.5 text-center font-bold text-white lg:hidden"
              aria-hidden="true"
            >
              <ShapeIcon shape="arch" size="0.9em" color="#fff" /> Checked in. Welcome!
            </p>
          ) : null}
          <TiltTicket
            glow={
              checkedIn
                ? 'shadow-[0_0_0_4px_#0f8657,0_30px_80px_-30px_rgb(15_134_87/0.6)]'
                : undefined
            }
          >
            <TicketCard
              ref={cardRef}
              ticket={ticket}
              size="lg"
              void={cancelled || status === 'cancelled'}
              code={<ScrambleCode value={ticket.code} />}
              status={
                checkedIn ? (
                  <span className="inline-flex items-center gap-1.5 font-bold text-green-600">
                    <ShapeIcon shape="arch" size="0.9em" /> Checked in
                  </span>
                ) : cancelled ? (
                  <span className="font-bold text-red-600">Released</span>
                ) : (
                  MODE_TICKET_LABEL[ticket.attendanceMode]
                )
              }
            />
          </TiltTicket>
          {doorTime && ticket.attendanceMode === 'in-person' ? (
            <p className="mt-4 flex items-center justify-center gap-2 text-center text-[0.9375rem] text-ink-3">
              <Sun className="size-4 flex-none" aria-hidden="true" />
              Turn your screen brightness up, scanners love it bright.
              {wake === 'on' ? ' We keep the screen awake while this is open.' : ''}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-7 lg:order-1 lg:pt-6">
          <Link
            href={`/events/${e.slug}`}
            className="label inline-flex min-h-11 w-fit items-center gap-2 rounded-full pr-2 text-ink-3 transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {labelAndTitle(e)}
          </Link>
          <div className="flex items-end gap-2" aria-hidden="true">
            <Character
              shape="circle"
              mood={checkedIn ? 'happy' : cancelled ? 'sleepy' : 'idle'}
              size={60}
              cheer={cheer}
              seed={1}
            />
            <Character
              shape="triangle"
              mood={checkedIn ? 'happy' : cancelled ? 'sleepy' : 'idle'}
              size={48}
              cheer={cheer}
              seed={2}
            />
            <Character
              shape="square"
              mood={checkedIn ? 'happy' : cancelled ? 'sleepy' : 'thinking'}
              size={56}
              cheer={cheer}
              seed={3}
            />
            <Character
              shape="arch"
              mood={checkedIn ? 'happy' : cancelled ? 'sleepy' : 'idle'}
              size={50}
              cheer={cheer}
              seed={4}
            />
          </div>
          <div
            className="flex flex-col gap-4"
            role={checkedIn ? 'status' : undefined}
            aria-live="polite"
          >
            <CaslHeading
              as="h1"
              id="ticket-title"
              size="m"
              key={headline}
              className={checkedIn ? 'text-green-600' : 'text-ink'}
            >
              {headline}
            </CaslHeading>
            <p className="max-w-[36rem] text-body-l text-ink-2">{sub}</p>
          </div>

          <dl className="grid max-w-[36rem] grid-cols-2 gap-4 rounded-[24px] border border-line bg-white p-5">
            <div>
              <dt className="label text-ink-3">When</dt>
              <dd className="mt-1 font-bold text-ink">{formatJakarta(e.startsAt, 'date')}</dd>
              <dd className="mono text-[0.875rem] text-ink-2">
                {formatJakarta(e.startsAt, 'time')} to {formatJakarta(e.endsAt, 'time')} WIB
              </dd>
            </div>
            <div>
              <dt className="label text-ink-3">
                {ticket.attendanceMode === 'online' ? 'Where' : 'Room'}
              </dt>
              <dd className="mt-1 font-bold text-ink">
                {ticket.attendanceMode === 'online' ? 'Livestream' : (e.venue ?? 'On campus')}
              </dd>
              {ticket.attendanceMode === 'in-person' && e.mapsUrl ? (
                <dd>
                  <a
                    href={e.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[0.875rem] font-bold text-blue-600 underline underline-offset-2"
                  >
                    Open in Maps<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </dd>
              ) : null}
            </div>
            <div className="col-span-2">
              <dt className="label text-ink-3">Sent to</dt>
              <dd className="mt-1 text-ink-2">{ticket.email}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-3">
            {!cancelled && !eventOver ? <CalendarButton href={ticket.calendarUrl} /> : null}
            {!cancelled && !eventOver ? (
              <Button
                variant="secondary"
                shape={false}
                icon={<Download className="size-full" />}
                onClick={save}
                loading={saving}
              >
                Save ticket
              </Button>
            ) : null}
            {cancelled && !eventOver ? (
              <Button href={`/events/${e.slug}#register`} cursor="register">
                Sign up again
              </Button>
            ) : null}
            <Button
              href={`/events/${e.slug}`}
              variant={cancelled && !eventOver ? 'secondary' : 'primary'}
              shape="circle"
              magnetic={false}
            >
              {status === 'past'
                ? 'Recording and photos'
                : status === 'ongoing' && ticket.attendanceMode === 'online'
                  ? 'Watch live'
                  : 'Event page'}
            </Button>
          </div>

          {!cancelled && !checkedIn && !eventOver ? (
            <div className="border-t border-line pt-6">
              <p className="text-[0.9375rem] text-ink-3">
                Plans changed? No drama.{' '}
                <button
                  type="button"
                  onClick={() => setConfirm(true)}
                  className="font-bold text-red-600 underline decoration-red/40 underline-offset-2 hover:decoration-red"
                >
                  Cancel my seat
                </button>{' '}
                so someone else can have it.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Release your seat?"
        description={`${eventLabel(e)}, ${formatJakarta(e.startsAt, 'date')}. Your ticket ${ticket.code} stops working and the seat goes back to the pool.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" shape={false} onClick={() => setConfirm(false)}>
              Keep my seat
            </Button>
            <Button variant="danger" shape={false} onClick={doCancel} loading={cancelling}>
              Yes, release it
            </Button>
          </>
        }
      >
        <div className="flex items-center gap-4 py-2">
          <Character shape="triangle" mood="surprised" size={56} seed={6} />
          <p className="text-ink-2">
            We will miss you. You can sign up again later if there is still room.
          </p>
        </div>
      </Dialog>
    </section>
  );
}
