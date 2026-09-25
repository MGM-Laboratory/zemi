import { Callout, Heading, Layout, Text } from './components/index.js';
import { ButtonRow, DEFAULT_SIGNATURE, EventDetails, Eyebrow, eventLabel, OnlineHelp, Signature, type EventEmailInfo } from './people-parts.js';

export interface EventReminderProps {
  firstName: string;
  event: EventEmailInfo;
  ticketCode: string;
  ticketUrl: string;
  cancelUrl: string;
  attendanceMode: 'in-person' | 'online';
  /** Relative day in Jakarta: the reminder normally goes out the day before at 09:00 WIB. */
  when: 'tomorrow' | 'today';
  signature?: string;
}

/** The day before, 09:00 WIB. */
export function EventReminder({ firstName, event, ticketCode, ticketUrl, cancelUrl, attendanceMode, when, signature = DEFAULT_SIGNATURE }: EventReminderProps) {
  const label = eventLabel(event);
  const day = when === 'today' ? 'Today' : 'Tomorrow';
  const online = attendanceMode === 'online' && event.mode !== 'offline';
  return (
    <Layout
      preview={`${day} at ${event.startTime} WIB: ${event.title}. Your ticket is ${ticketCode}.`}
      footerNote="You got this because you saved a seat at Zemi. Can't come anymore? Release your seat from your ticket page."
    >
      <Eyebrow accent={event.accent}>
        {label} · {day}
      </Eyebrow>
      <Heading>
        {day} at {event.startTime}, {firstName}.
      </Heading>
      <Text size="large">
        Quick nudge: <strong>{event.title}</strong> is {when === 'today' ? 'today' : 'tomorrow'}. Half-finished ideas welcome, as always.
      </Text>
      <EventDetails event={event} attendanceMode={attendanceMode} />
      {online ? (
        <OnlineHelp event={event} lead="You're watching online." />
      ) : (
        <>
          <Callout tone="yellow">
            Your ticket code is <strong>{ticketCode}</strong>. Have the QR ready at the door and you're through in two seconds.
          </Callout>
          <ButtonRow
            buttons={[
              { href: ticketUrl, label: 'Show my ticket' },
              event.mapsUrl ? { href: event.mapsUrl, label: 'Get directions', tone: 'ink' } : null,
            ]}
          />
        </>
      )}
      <Text size="small" muted>
        Something came up? <a href={cancelUrl}>Release your seat</a> so someone on the fence can take it.
      </Text>
      <Signature text={signature} />
    </Layout>
  );
}

export default EventReminder;
