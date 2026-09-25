import { Button, Callout, Divider, Heading, InfoRow, Layout, Text, useEmailContext } from '../../mail/templates/components/index.js';
import { MessageBody } from './contact-notification.js';

export interface ContactAutoReplyProps {
  name: string;
  topic: string;
  message: string;
  officeHours: string;
  /** From the email settings, e.g. "See you Friday,\nThe Zemi crew". */
  signature: string;
  nextEvent?: {
    title: string;
    number: number | null;
    /** Already formatted, e.g. "Fri, 2 Oct 2026". */
    date: string;
    /** "13:15 to 15:15 WIB" */
    time: string;
    venue: string | null;
    url: string;
  } | null;
}

const MAX_ECHO = 1500;

/** One friendly paragraph per contact topic. Unknown topics get the general one. */
function topicLine(topic: string): string {
  const t = topic.toLowerCase();
  if (t.includes('present')) {
    return 'Presenting? We love that. Bring the messy version. We will ask for a working title, a couple of Fridays that suit you, and whether you want 20 or 40 minutes.';
  }
  if (t.includes('collab')) {
    return 'Collaboration is our favorite kind of message. We will pass it to the people in the lab who work closest to what you described, and someone will get back to you.';
  }
  if (t.includes('question')) {
    return 'Good question, probably. If it is about a specific Friday, the event page usually has the room, the map and the livestream link too.';
  }
  return 'We read everything that comes in, even the slightly random ones. Especially those, honestly.';
}

function firstName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? '';
  // Balinese birth-order names and honorifics make a bad greeting on their own.
  if (parts.length > 1 && /^(i|ni|dr\.?|prof\.?|ir\.?|mr\.?|ms\.?|mrs\.?)$/i.test(first)) return parts[1]!;
  return first || 'there';
}

/** To the sender, right after they use the contact form. */
export function ContactAutoReplyEmail({ name, topic, message, officeHours, signature, nextEvent }: ContactAutoReplyProps) {
  const { webUrl } = useEmailContext();
  const echo = message.length > MAX_ECHO ? `${message.slice(0, MAX_ECHO).trimEnd()}...` : message;
  const signatureLines = signature.split(/\r?\n/);
  return (
    <Layout
      preview="Got your message. A real human will read it soon."
      footerNote="You got this because someone, hopefully you, used the contact form on the Zemi site. If that wasn't you, you can ignore this email."
    >
      <Heading>Got it, {firstName(name)}.</Heading>
      <Text size="large">Thanks for writing to Zemi. A real human reads every message, usually within two working days.</Text>
      <Text>{topicLine(topic)}</Text>
      <Callout tone="yellow">
        We are around {officeHours.charAt(0).toLowerCase() + officeHours.slice(1)}. Need to add something? Just reply to this email.
      </Callout>
      <Text size="small" muted>
        Here is what you sent us:
      </Text>
      <MessageBody message={echo} />
      {nextEvent ? (
        <>
          <Divider />
          <Heading level={2}>Meanwhile, next up at Zemi</Heading>
          <InfoRow label={nextEvent.number ? `Zemi #${nextEvent.number}` : 'Next up'}>{nextEvent.title}</InfoRow>
          <InfoRow label="When">
            {nextEvent.date}, {nextEvent.time}
          </InfoRow>
          {nextEvent.venue ? <InfoRow label="Where">{nextEvent.venue}, and on the livestream</InfoRow> : null}
          <Button href={nextEvent.url}>Save me a seat</Button>
        </>
      ) : (
        <Button href={`${webUrl}/events`}>See what is coming up</Button>
      )}
      <Divider />
      <Text>
        {signatureLines.map((line, i) => (
          <span key={i}>
            {line}
            {i < signatureLines.length - 1 ? <br /> : null}
          </span>
        ))}
      </Text>
    </Layout>
  );
}

export default ContactAutoReplyEmail;
