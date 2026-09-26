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

type ThanksVariant = 'came' | 'tuned-in' | 'missed';

function thanksVariant(attended: boolean, attendanceMode: 'in-person' | 'online'): ThanksVariant {
  return attended ? 'came' : attendanceMode === 'online' ? 'tuned-in' : 'missed';
}

/** Subject line that matches the body: no "thanks for coming" to someone who didn't make it. */
export function thanksSubject(title: string, attended: boolean, attendanceMode: 'in-person' | 'online', hasRecording: boolean): string {
  const v = thanksVariant(attended, attendanceMode);
  if (v === 'missed') return hasRecording ? `Missed ${title}? The recording is up` : `We saved you a seat at ${title}`;
  const thanks = v === 'came' ? 'Thanks for coming' : 'Thanks for tuning in';
  return hasRecording ? `${thanks}. The recording is up` : `${thanks} to ${title}`;
}

/** A few hours after it wraps. */
export function EventThanks({ firstName, event, attended, attendanceMode, recordingUrl, photosUrl, signature = DEFAULT_SIGNATURE }: EventThanksProps) {
  const { webUrl } = useEmailContext();
  const label = eventLabel(event);
  const variant = thanksVariant(attended, attendanceMode);
  const lead =
    variant === 'came'
      ? `Thanks for coming to ${event.title}.`
      : variant === 'tuned-in'
        ? `Thanks for tuning in to ${event.title}.`
        : `We saved you a seat at ${event.title}. Missed it? That's fine, it happens.`;
  const hello = variant === 'came' ? 'Thanks for coming.' : variant === 'tuned-in' ? 'Thanks for tuning in.' : 'We missed you.';
  return (
    <Layout
      preview={recordingUrl ? `${hello} The recording is up.` : `${hello} See you next Friday.`}
      footerNote="You got this because you saved a seat at Zemi."
    >
      <Eyebrow accent={event.accent}>{label} · Wrapped</Eyebrow>
      <Heading>That's a wrap, {firstName}.</Heading>
      <Text size="large">
        {lead} {variant === 'missed' ? "There's another one next Friday, same time. Come say hi." : "Research gets lonely. Fridays don't, and you're part of why."}
      </Text>
      {recordingUrl || photosUrl ? (
        <>
          <Text>
            {recordingUrl
              ? 'Want to rewatch a part, or send it to a friend? The recording is up.'
              : variant === 'came'
                ? 'The photos are up. Go find yourself in the back row.'
                : 'The photos are up. Come see what the room looked like.'}
          </Text>
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
