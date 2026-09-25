import { Button, Heading, Layout, Text } from './components/index.js';
import { DEFAULT_SIGNATURE, EventDetails, Eyebrow, eventLabel, Signature, type EventEmailInfo } from './people-parts.js';

export interface RegistrationCancelledProps {
  firstName: string;
  event: EventEmailInfo;
  ticketCode: string;
  /** Who cancelled: the person themselves, or the organizers. */
  by?: 'self' | 'organizer';
  /** Show "changed your mind?" when the event is still ahead and open. */
  canRegisterAgain?: boolean;
  signature?: string;
}

/** Sent when a seat is released. */
export function RegistrationCancelled({ firstName, event, ticketCode, by = 'self', canRegisterAgain = true, signature = DEFAULT_SIGNATURE }: RegistrationCancelledProps) {
  const label = eventLabel(event);
  return (
    <Layout
      preview={`Your seat for ${label} is released. No hard feelings.`}
      footerNote="You got this because a Zemi seat under this email was cancelled. If that wasn't you, reply and tell us."
    >
      <Eyebrow accent={event.accent}>{label} · Seat released</Eyebrow>
      <Heading>All good, {firstName}.</Heading>
      <Text size="large">
        {by === 'organizer' ? 'The organizers released' : 'We released'} your seat for <strong>{event.title}</strong>. Ticket {ticketCode} won't
        work at the door anymore.
      </Text>
      <Text>No hard feelings. Research happens on its own schedule, we get it.</Text>
      <EventDetails event={event} showMaps={false} />
      {canRegisterAgain ? (
        <>
          <Text>Changed your mind? Sign up again on the event page. If there's still room, the seat is yours.</Text>
          <Button href={event.eventUrl}>Take me back to the event</Button>
        </>
      ) : null}
      <Signature text={signature} />
    </Layout>
  );
}

export default RegistrationCancelled;
