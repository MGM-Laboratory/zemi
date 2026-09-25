import { Section } from '@react-email/components';
import { Button, Divider, Heading, Layout, Text } from './components/index.js';
import { colors, fonts } from './components/theme.js';
import { DEFAULT_SIGNATURE, EventDetails, Eyebrow, eventLabel, Signature, type EventEmailInfo } from './people-parts.js';

export interface EventUpdateProps {
  subject: string;
  /** Admin HTML, ALREADY sanitized with the broadcast allowlist (see broadcast.ts). */
  html: string;
  event: EventEmailInfo;
  ticketUrl: string | null;
  attendanceMode?: 'in-person' | 'online';
  signature?: string;
  test?: boolean;
}

/** An admin broadcast about one event. The body is the organizers' own words. */
export function EventUpdate({ subject, html, event, ticketUrl, attendanceMode, signature = DEFAULT_SIGNATURE, test }: EventUpdateProps) {
  const label = eventLabel(event);
  return (
    <Layout preview={`${label}: ${subject}`} footerNote={`You got this because you registered for ${event.title}.`}>
      {test ? (
        <Section style={{ backgroundColor: colors.yellow50, borderRadius: 12, padding: '8px 14px', margin: '0 0 16px' }}>
          <Text size="small" style={{ margin: 0, color: colors.ink }}>
            Test send. Only you got this one.
          </Text>
        </Section>
      ) : null}
      <Eyebrow accent={event.accent}>{label} · An update</Eyebrow>
      <Heading>{subject}</Heading>
      <Section style={{ fontFamily: fonts.body, fontSize: 16, lineHeight: '25px', color: colors.ink2 }}>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </Section>
      <Divider />
      <EventDetails event={event} attendanceMode={attendanceMode} />
      {ticketUrl ? <Button href={ticketUrl}>Show my ticket</Button> : <Button href={event.eventUrl}>Open the event page</Button>}
      <Signature text={signature} />
    </Layout>
  );
}

export default EventUpdate;
