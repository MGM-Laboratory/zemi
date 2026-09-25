import { Button, Heading, Layout, Text } from './components/index.js';
import { DEFAULT_SIGNATURE, EventDetails, Eyebrow, eventLabel, Signature, type EventEmailInfo } from './people-parts.js';

export interface EventStartingProps {
  firstName: string;
  event: EventEmailInfo;
  attendanceMode: 'in-person' | 'online';
  ticketUrl: string;
  /** Minutes until the start (0 or less means it already started). */
  minutesToStart: number;
  signature?: string;
}

/** At start time: the room is open, the stream is up. */
export function EventStarting({ firstName, event, attendanceMode, ticketUrl, minutesToStart, signature = DEFAULT_SIGNATURE }: EventStartingProps) {
  const label = eventLabel(event);
  const soon = minutesToStart > 1 ? `in ${minutesToStart} minutes` : 'now';
  const streams = event.mode !== 'offline';
  const online = attendanceMode === 'online' && streams;
  const where = [event.venueLabel, event.roomNote].filter(Boolean).join(', ');
  return (
    <Layout preview={online ? `We're going live ${soon}. Grab a coffee and tune in.` : `We're starting ${soon}. See you in the room.`} footerNote="You got this because you saved a seat at Zemi.">
      <Eyebrow accent={event.accent}>{label} · Starting {soon}</Eyebrow>
      <Heading>{online ? `We're going live, ${firstName}.` : `We're starting, ${firstName}.`}</Heading>
      {online ? (
        <>
          <Text size="large">
            <strong>{event.title}</strong> starts {soon}. The stream is right on the event page, no login needed.
          </Text>
          <Button href={event.eventUrl} tone="red">
            Watch live
          </Button>
          <Text size="small" muted>
            Stream looks stuck? Refresh the page. If the room loses signal we show a slate and come back.
          </Text>
        </>
      ) : (
        <>
          <Text size="large">
            <strong>{event.title}</strong> starts {soon}
            {where ? ` in ${where}` : ''}. Doors are open, seats are warm.
          </Text>
          <Button href={ticketUrl}>Show my ticket</Button>
          {streams ? (
            <Text size="small" muted>
              Running late or stuck somewhere? <a href={event.eventUrl}>Watch the livestream</a> until you get here.
            </Text>
          ) : null}
        </>
      )}
      <EventDetails event={event} showMaps={!online} />
      <Signature text={signature} />
    </Layout>
  );
}

export default EventStarting;
