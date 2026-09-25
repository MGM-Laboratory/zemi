import { Button, Callout, Heading, Layout, Text, useEmailContext } from './components/index.js';
import { ButtonRow, DEFAULT_SIGNATURE, Eyebrow, eventLabel, Signature, type EventEmailInfo } from './people-parts.js';

export interface EventThanksProps {
  firstName: string;
  event: EventEmailInfo;
  /** They were checked in at the door (so we know they were in the room). */
  attended: boolean;
  attendanceMode: 'in-person' | 'online';
  /** Event page anchor for the recording, when one is ready and public. */
  recordingUrl: string | null;
  /** Event page anchor for photos, when documentation is up. */
  photosUrl: string | null;
  signature?: string;
}

/** A few hours after it wraps. */
export function EventThanks({ firstName, event, attended, attendanceMode, recordingUrl, photosUrl, signature = DEFAULT_SIGNATURE }: EventThanksProps) {
  const { webUrl } = useEmailContext();
  const label = eventLabel(event);
  const online = attendanceMode === 'online';
  const lead = attended
    ? `Thanks for coming to ${event.title}.`
    : online
      ? `Thanks for tuning in to ${event.title}.`
      : `We saved you a seat at ${event.title}. Missed it? That's fine, it happens.`;
  return (
    <Layout
      preview={recordingUrl ? 'Thanks for coming. The recording is up.' : 'Thanks for coming. See you next Friday.'}
      footerNote="You got this because you saved a seat at Zemi."
    >
      <Eyebrow accent={event.accent}>{label} · Wrapped</Eyebrow>
      <Heading>That's a wrap, {firstName}.</Heading>
      <Text size="large">{lead} Research gets lonely. Fridays don't, and you're part of why.</Text>
      {recordingUrl || photosUrl ? (
        <>
          <Text>{recordingUrl ? 'Want to rewatch a part, or send it to a friend? The recording is up.' : 'The photos are up. Go find yourself in the back row.'}</Text>
          <ButtonRow
            buttons={[
              recordingUrl ? { href: recordingUrl, label: 'Watch the recording', tone: 'red' } : null,
              photosUrl ? { href: photosUrl, label: 'See the photos', tone: recordingUrl ? 'ink' : 'blue' } : null,
            ]}
          />
        </>
      ) : (
        <Callout tone="blue">The recording and photos land on the event page once they're ready. We'll keep it tidy.</Callout>
      )}
      <Text>
        Got a half-finished idea of your own? Fridays need speakers. <a href={`${webUrl}/contact`}>Tell us you want the mic</a>.
      </Text>
      <Button href={`${webUrl}/events`} tone="ink">
        See what's next
      </Button>
      <Signature text={signature} />
    </Layout>
  );
}

export default EventThanks;
