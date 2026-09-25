import { Link, Section, Text as EmailText } from '@react-email/components';
import { Button, Divider, Heading, InfoRow, Layout, Text, colors, fonts, useEmailContext } from '../../mail/templates/components/index.js';

export interface ContactNotificationProps {
  name: string;
  email: string;
  topic: string;
  message: string;
  /** Already formatted, e.g. "Fri, 2 Oct 2026, 13:15 WIB". */
  sentAt: string;
  /** How many earlier messages came from this address. */
  previousMessages?: number;
}

/** Keeps the sender's line breaks, without trusting any HTML in the message. */
export function MessageBody({ message }: { message: string }) {
  const lines = message.replace(/\r\n?/g, '\n').split('\n');
  return (
    <Section style={{ backgroundColor: colors.blue50, borderRadius: 16, padding: '16px 20px', margin: '18px 0' }}>
      <EmailText style={{ margin: 0, fontFamily: fonts.body, fontSize: 16, lineHeight: '25px', color: colors.ink }}>
        {lines.map((line, i) => (
          <span key={i}>
            {line}
            {i < lines.length - 1 ? <br /> : null}
          </span>
        ))}
      </EmailText>
    </Section>
  );
}

/** To the organizers: someone used the contact form. Reply goes straight to the sender (replyTo). */
export function ContactNotificationEmail({ name, email, topic, message, sentAt, previousMessages = 0 }: ContactNotificationProps) {
  const { webUrl } = useEmailContext();
  const firstLine = message.trim().split(/\s+/).slice(0, 12).join(' ');
  return (
    <Layout
      preview={`${name} wrote in: ${firstLine}`.slice(0, 110)}
      footerNote="You got this because your address is on the Zemi contact notification list. Change it in Site settings, Contact."
    >
      <Heading>New message from {name}.</Heading>
      <Text size="large">
        Someone used the contact form. Hit reply and your answer goes straight to them.
      </Text>
      <InfoRow label="From">{name}</InfoRow>
      <InfoRow label="Email">
        <Link href={`mailto:${email}`} style={{ color: colors.blue }}>
          {email}
        </Link>
      </InfoRow>
      <InfoRow label="Topic">{topic}</InfoRow>
      <InfoRow label="Sent">{sentAt}</InfoRow>
      {previousMessages > 0 ? (
        <InfoRow label="History">
          {previousMessages === 1 ? 'They wrote to us once before.' : `They wrote to us ${previousMessages} times before.`}
        </InfoRow>
      ) : null}
      <MessageBody message={message} />
      <Button href={`${webUrl}/admin/inbox`}>Open the inbox</Button>
      <Divider />
      <Text size="small" muted>
        Once you have answered, mark it as replied in the inbox so nobody else answers twice.
      </Text>
    </Layout>
  );
}

export default ContactNotificationEmail;
