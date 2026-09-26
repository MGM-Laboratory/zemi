'use client';

import type { CSSProperties, ReactNode, Ref } from 'react';
import { formatJakarta, formatTimeRange, type Ticket } from '@zemi/shared';
import { ZemiMark } from '@/components/brand/zemi-mark';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { cn } from '@/lib/utils';
import { ACCENT_SHAPE, accentVars, asAccent, eventLabel, labelAndTitle } from '../events/lib';
import styles from './ticket.module.css';

export interface TicketCardProps {
  ticket: Ticket;
  /** Big QR (ticket page) or compact (register success). */
  size?: 'md' | 'lg';
  /** Rendered in the stub instead of the default status line. */
  status?: ReactNode;
  /** Scrambled code element (ticket page) instead of plain text. */
  code?: ReactNode;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
  /** Dim the QR (cancelled ticket). */
  void?: boolean;
}

export const MODE_TICKET_LABEL = { 'in-person': 'In the room', online: 'Online' } as const;

/**
 * The Zemi ticket: graph paper, accent stripe, perforated stub, branded QR from the API.
 * Pure presentation; the page decides what goes around it.
 */
export function TicketCard({
  ticket,
  size = 'md',
  status,
  code,
  className,
  style,
  ref,
  void: isVoid,
}: TicketCardProps) {
  const accent = asAccent(ticket.event.accent);
  const e = ticket.event;
  const place = [e.venue, e.roomNote].filter(Boolean).join('. ');
  return (
    <div
      ref={ref}
      className={cn(styles.ticket, size === 'lg' && styles.lg, className)}
      style={{ ...accentVars(accent), ...style }}
      data-void={isVoid ? '' : undefined}
    >
      <div className={styles.stripe} aria-hidden="true">
        <ShapeIcon shape={ACCENT_SHAPE[accent]} size={18} color="#fff" />
      </div>
      <div className={styles.head}>
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2">
            <ZemiMark size={26} decorative />
            {/* Titles like "Zemi #100: the big one" already carry the number. */}
            {labelAndTitle(e) === e.title ? null : (
              <span className="label text-ink-2">{eventLabel(e)}</span>
            )}
          </span>
          <span className="label rounded-full bg-ink px-2.5 py-1 text-white">Admit one</span>
        </div>
        <p
          className="display mt-4 text-[clamp(1.5rem,5.4vw,2.25rem)] leading-[0.98] text-ink"
          style={{ fontVariationSettings: "'CASL' 0.5, 'MONO' 0" }}
        >
          {e.title}
        </p>
        <dl className="mt-4 grid gap-1.5 text-[0.9375rem]">
          <div className="flex flex-wrap gap-x-2">
            <dt className="sr-only">When</dt>
            <dd className="font-bold text-ink">
              <time dateTime={e.startsAt}>{formatJakarta(e.startsAt, 'date')}</time>
            </dd>
            <dd className="mono text-ink-2">{formatTimeRange(e.startsAt, e.endsAt)}</dd>
          </div>
          {place && ticket.attendanceMode === 'in-person' ? (
            <div>
              <dt className="sr-only">Where</dt>
              <dd className="text-ink-2">{place}</dd>
            </div>
          ) : ticket.attendanceMode === 'online' ? (
            <div>
              <dt className="sr-only">Where</dt>
              <dd className="text-ink-2">Livestream on the event page. No link hunting.</dd>
            </div>
          ) : null}
        </dl>
      </div>
      <div className={styles.perf} aria-hidden="true" />
      <div className={styles.stub}>
        <div className={styles.qr}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ticket.qrSvgUrl}
            alt={`QR code for ticket ${ticket.code}. Show it at the door.`}
            width={size === 'lg' ? 320 : 176}
            height={size === 'lg' ? 320 : 176}
            className="size-full"
            draggable={false}
          />
        </div>
        <dl className="flex min-w-0 flex-col gap-3">
          <div>
            <dt className="label text-ink-3">Name</dt>
            <dd className="mt-1 break-words text-[1.0625rem] font-bold leading-snug text-ink">
              {ticket.fullName}
            </dd>
          </div>
          <div>
            <dt className="label text-ink-3">Ticket</dt>
            <dd className="mono mt-1 text-[1.25rem] font-bold tracking-[0.06em] text-ink">
              {code ?? ticket.code}
            </dd>
          </div>
          <div>
            <dt className="label text-ink-3">Joining</dt>
            <dd className="mt-1 font-semibold text-ink-2">
              {status ?? MODE_TICKET_LABEL[ticket.attendanceMode]}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
