import { Button, Callout, Heading, Layout, Text, useEmailContext } from './components/index.js';
import { DEFAULT_SIGNATURE, Eyebrow, eventLabel, Signature, type EventEmailInfo } from './people-parts.js';

export interface EventCancelledProps {
  firstName: string;
  event: EventEmailInfo;
  reason: string | null;
  signature?: string;
}

/** The organizers called the whole event off. */
export function EventCancelled({ firstName, event, reason, signature = DEFAULT_SIGNATURE }: EventCancelledProps) {
  const { webUrl } = useEmailContext();
  const label = eventLabel(event);
  return (
    <Layout preview={`${label} on ${event.dateLabel} is cancelled. Sorry about that.`} footerNote="You got this because you had a seat at this Zemi.">
      <Eyebrow accent="red">{label} · Cancelled</Eyebrow>
      <Heading>This Friday is off, {firstName}.</Heading>
      <Text size="large">
        Sorry. We had to cancel <strong>{event.title}</strong> on {event.dateLabel}, {event.timeLabel}.
      </Text>
      {reason ? (
        <Callout tone="red">
          <strong>What happened:</strong> {reason}
        </Callout>
      ) : null}
      <Text>Your ticket won't be needed and there's nothing you have to do. If we move it to another day, you'll hear from us first.</Text>
      <Button href={`${webUrl}/events`}>See what's coming up</Button>
      <Signature text={signature} />
    </Layout>
  );
}

export default EventCancelled;
