import { Button as EmailButton, Img, Link, Section, Text as EmailText } from '@react-email/components';
import type { ReactNode } from 'react';
import { Button, InfoRow, Text } from './components/index.js';
import { colors, fonts, toneColor, type Tone } from './components/theme.js';

/**
 * Pieces shared by the people emails (registration, reminders, broadcasts). Props are plain,
 * preformatted strings: templates never format dates themselves, the sender does (always WIB).
 */

export type EmailAccent = 'blue' | 'yellow' | 'red' | 'green';

export interface EventEmailInfo {
  title: string;
  number: number | null;
  /** "Friday, 2 October 2026" */
  dateLabel: string;
  /** "13:15 to 15:15 WIB" */
  timeLabel: string;
  /** "13:15" */
  startTime: string;
  /** "Theater A, Building B, floor 3" */
  venueLabel: string | null;
  address: string | null;
  roomNote: string | null;
  mapsUrl: string | null;
  mode: 'hybrid' | 'offline' | 'online';
  onlineNote: string | null;
  eventUrl: string;
  accent: EmailAccent;
}

const ACCENT: Record<EmailAccent, { solid: string; soft: string }> = {
  blue: { solid: colors.blue, soft: colors.blue50 },
  yellow: { solid: colors.yellow, soft: colors.yellow50 },
  red: { solid: colors.red, soft: colors.red50 },
  green: { solid: colors.green, soft: colors.green50 },
};

/** Small mono label above the heading: "ZEMI #12 · FRIDAY". */
export function Eyebrow({ children, accent = 'blue' }: { children: ReactNode; accent?: EmailAccent }) {
  return (
    <EmailText
      style={{
        margin: '0 0 10px',
        fontFamily: fonts.mono,
        fontSize: 12,
        lineHeight: '16px',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: colors.ink3,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 10,
          height: 10,
          borderRadius: 999,
          backgroundColor: ACCENT[accent].solid,
          marginRight: 8,
          verticalAlign: 'middle',
        }}
      />
      {children}
    </EmailText>
  );
}

export const eventLabel = (e: Pick<EventEmailInfo, 'number' | 'title'>) => (e.number != null ? `Zemi #${e.number}` : 'Zemi');

/** When / Where / How you're joining, plus the maps button when there is a room to walk to. */
export function EventDetails({
  event,
  attendanceMode,
  showMaps = true,
  extra,
}: {
  event: EventEmailInfo;
  attendanceMode?: 'in-person' | 'online';
  showMaps?: boolean;
  extra?: ReactNode;
}) {
  const inRoom = event.mode !== 'online';
  const where = [event.venueLabel, event.roomNote].filter(Boolean).join('. ');
  return (
    <Section
      style={{
        backgroundColor: ACCENT[event.accent].soft,
        borderRadius: 20,
        padding: '18px 20px 6px',
        margin: '20px 0',
      }}
    >
      <InfoRow label="When">
        {event.dateLabel}
        <br />
        {event.timeLabel}
      </InfoRow>
      {inRoom ? (
        <InfoRow label="Where">
          {where || 'Room to be announced. We will email you.'}
          {event.address ? (
            <>
              <br />
              <span style={{ color: colors.ink3, fontSize: 14 }}>{event.address}</span>
            </>
          ) : null}
        </InfoRow>
      ) : (
        <InfoRow label="Where">Online, on the event page</InfoRow>
      )}
      {attendanceMode ? (
        <InfoRow label="You're joining">{attendanceMode === 'online' ? 'Online, from wherever you are' : 'In person'}</InfoRow>
      ) : null}
      {extra}
      {showMaps && inRoom && event.mapsUrl ? (
        <Section style={{ margin: '4px 0 14px' }}>
          <Link
            href={event.mapsUrl}
            style={{
              display: 'inline-block',
              fontFamily: fonts.body,
              fontWeight: 700,
              fontSize: 14,
              lineHeight: '18px',
              color: colors.ink,
              backgroundColor: '#ffffff',
              border: `1px solid ${colors.line}`,
              borderRadius: 999,
              padding: '9px 16px',
              textDecoration: 'none',
            }}
          >
            Open in Google Maps
          </Link>
        </Section>
      ) : null}
    </Section>
  );
}

/** The ticket: big QR (inline CID image), the code in mono, a hosted fallback link. */
export function TicketBlock({ qrSrc, code, ticketUrl, note }: { qrSrc: string; code: string; ticketUrl: string; note?: ReactNode }) {
  return (
    <Section
      style={{
        border: `1px solid ${colors.line}`,
        borderRadius: 24,
        padding: '22px 16px 18px',
        margin: '22px 0',
        textAlign: 'center',
        backgroundColor: '#ffffff',
      }}
    >
      <Img
        src={qrSrc}
        width="240"
        height="240"
        alt={`Ticket QR code for ${code}`}
        style={{ display: 'block', margin: '0 auto', border: 0, width: 240, height: 240, maxWidth: '100%' }}
      />
      <EmailText
        style={{
          margin: '12px 0 2px',
          fontFamily: fonts.mono,
          fontSize: 11,
          lineHeight: '16px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: colors.ink3,
        }}
      >
        Ticket code
      </EmailText>
      <EmailText style={{ margin: 0, fontFamily: fonts.mono, fontWeight: 700, fontSize: 26, lineHeight: '32px', letterSpacing: '0.06em', color: colors.ink }}>
        {code}
      </EmailText>
      <EmailText style={{ margin: '10px 0 0', fontFamily: fonts.body, fontSize: 14, lineHeight: '21px', color: colors.ink3 }}>
        {note ?? 'Show this at the door. A screenshot works too.'}
        <br />
        QR not showing?{' '}
        <Link href={ticketUrl} style={{ color: colors.blue, textDecoration: 'underline' }}>
          Open your ticket online
        </Link>
        .
      </EmailText>
    </Section>
  );
}

export interface RowButton {
  href: string;
  label: string;
  tone?: Tone;
}

/**
 * Buttons side by side that wrap onto the next line on narrow screens (inline-block pills, no table
 * columns, so a phone never squeezes the labels onto two lines).
 */
export function ButtonRow({ buttons }: { buttons: Array<RowButton | null | false | undefined> }) {
  const items = buttons.filter((b): b is RowButton => !!b);
  return (
    <Section style={{ margin: '22px 0 4px' }}>
      {items.map((b) => {
        const t = toneColor[b.tone ?? 'blue'];
        return (
          <EmailButton
            key={b.href + b.label}
            href={b.href}
            style={{
              display: 'inline-block',
              backgroundColor: t.bg,
              color: t.fg,
              fontFamily: fonts.body,
              fontWeight: 700,
              fontSize: 16,
              lineHeight: '20px',
              padding: '14px 24px',
              borderRadius: 999,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              margin: '0 10px 10px 0',
            }}
          >
            {b.label}
          </EmailButton>
        );
      })}
    </Section>
  );
}

/** How to join online. Only for hybrid and online events. */
export function OnlineHelp({ event, lead }: { event: EventEmailInfo; lead?: string }) {
  if (event.mode === 'offline') return null;
  return (
    <Section style={{ margin: '4px 0 8px' }}>
      <Text>
        {lead ?? 'Joining online?'} The livestream runs right on the event page, no app or login needed. Open it a few minutes before{' '}
        {event.startTime} WIB.
        {event.onlineNote ? ` ${event.onlineNote}` : ''}
      </Text>
      <Button href={event.eventUrl} tone="ink">
        Open the event page
      </Button>
    </Section>
  );
}

/** "See you Friday,\nThe Zemi crew" from the email settings, with line breaks kept. */
export function Signature({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  return (
    <Text style={{ margin: '26px 0 0' }}>
      {lines.map((line, i) => (
        <span key={i}>
          {line}
          {i < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </Text>
  );
}

export const DEFAULT_SIGNATURE = 'See you Friday,\nThe Zemi crew';
