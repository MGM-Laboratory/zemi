import { Link } from '@react-email/components';
import { Callout, Divider, Heading, Layout, Text } from './components/index.js';
import { colors } from './components/theme.js';
import {
  ButtonRow,
  DEFAULT_SIGNATURE,
  EventDetails,
  Eyebrow,
  eventLabel,
  OnlineHelp,
  Signature,
  TicketBlock,
  type EventEmailInfo,
} from './people-parts.js';

export interface RegistrationConfirmedProps {
  firstName: string;
  event: EventEmailInfo;
  ticketCode: string;
  ticketUrl: string;
  cancelUrl: string;
  calendarUrl: string;
  attendanceMode: 'in-person' | 'online';
  /** `cid:qr` in real sends (inline attachment), a hosted/data URL in previews. */
  qrSrc?: string;
  /** Someone asked for their ticket again (duplicate sign-up or an admin resend). */
  resend?: boolean;
  /** Why it's a resend: they signed up twice (default), or an organizer sent it again. */
  resendReason?: 'duplicate' | 'organizer';
  /** Added at the door by the crew. */
  walkIn?: boolean;
  checkedIn?: boolean;
  signature?: string;
}

/** Sent right after someone saves a seat (and on resends). */
export function RegistrationConfirmed({
  firstName,
  event,
  ticketCode,
  ticketUrl,
  cancelUrl,
  calendarUrl,
  attendanceMode,
  qrSrc = 'cid:qr',
  resend,
  resendReason = 'duplicate',
  walkIn,
  checkedIn,
  signature = DEFAULT_SIGNATURE,
}: RegistrationConfirmedProps) {
  const label = eventLabel(event);
  const heading = walkIn ? `Welcome in, ${firstName}.` : resend ? `Here's your ticket again, ${firstName}.` : `You're in, ${firstName}.`;
  const preview = walkIn
    ? `You're on the list for ${label}. Your ticket is inside.`
    : resend
      ? `Your ticket for ${label}, one more time.`
      : `Your seat for ${label} is saved. Ticket inside.`;
  const online = attendanceMode === 'online' && event.mode !== 'offline';
  return (
    <Layout preview={preview} footerNote="You got this because you saved a seat at Zemi.">
      <Eyebrow accent={event.accent}>
        {label} · {event.dateLabel.split(',')[0]}
      </Eyebrow>
      <Heading>{heading}</Heading>
      {walkIn ? (
        <Text size="large">
          The door crew put you on the list for <strong>{event.title}</strong>
          {checkedIn ? ' and checked you in' : ''}. Keep this email, it has your ticket for the records.
        </Text>
      ) : resend && resendReason === 'organizer' ? (
        <Text size="large">
          Here's your ticket for <strong>{event.title}</strong> one more time, in case the first one got lost in your inbox. Same seat, same code.
        </Text>
      ) : resend ? (
        <Text size="large">
          You already have a seat for <strong>{event.title}</strong>, so no need to sign up twice. Here's the same ticket so it's easy to find.
        </Text>
      ) : (
        <Text size="large">
          Your seat for <strong>{event.title}</strong> is saved. Bring the messy version, nobody expects the slides to be perfect.
        </Text>
      )}

      {online ? null : <TicketBlock qrSrc={qrSrc} code={ticketCode} ticketUrl={ticketUrl} />}

      <EventDetails event={event} attendanceMode={attendanceMode} />

      <ButtonRow
        buttons={[
          { href: ticketUrl, label: 'Show my ticket' },
          { href: calendarUrl, label: 'Add to calendar', tone: 'ink' },
        ]}
      />
      <Text size="small" muted>
        The calendar file is attached too, if your mail app likes those better.
      </Text>

      {online ? (
        <OnlineHelp event={event} lead="You're joining online, nice." />
      ) : event.mode === 'hybrid' ? (
        <OnlineHelp event={event} lead="Can't make it to the room after all?" />
      ) : null}

      {online ? (
        <TicketBlock
          qrSrc={qrSrc}
          code={ticketCode}
          ticketUrl={ticketUrl}
          note="You won't need this online, but if you end up coming to the room, show it at the door."
        />
      ) : (
        <Callout tone="yellow">
          We start at {event.startTime} WIB, sharp-ish. Come a few minutes early, grab a seat, say hi to someone new.
        </Callout>
      )}

      <Divider />
      <Text size="small" muted>
        Plans changed? No stress.{' '}
        <Link href={cancelUrl} style={{ color: colors.ink3, textDecoration: 'underline' }}>
          Cancel my seat
        </Link>{' '}
        so someone else can have it.
      </Text>
      <Signature text={signature} />
    </Layout>
  );
}

export default RegistrationConfirmed;
