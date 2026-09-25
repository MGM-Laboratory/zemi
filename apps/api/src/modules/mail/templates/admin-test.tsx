import { Button, Callout, Divider, Heading, InfoRow, Layout, Text, useEmailContext } from './components/index.js';

export interface AdminTestEmailProps {
  name?: string;
  sentAt: string;
}

/** Proof that mail rendering, fonts and the layout work. Sent from POST /admin/system/test-email. */
export function AdminTestEmail({ name, sentAt }: AdminTestEmailProps) {
  const { webUrl } = useEmailContext();
  return (
    <Layout preview="Good news: Zemi can send email." footerNote="You got this because someone pressed the test button in the Zemi dashboard.">
      <Heading>Mail works.</Heading>
      <Text size="large">{name ? `Hi ${name}, this` : 'This'} is a test from the Zemi dashboard. If you can read it, the pipes are connected.</Text>
      <Callout tone="yellow">Nothing to do here. Coffee's on the left.</Callout>
      <Divider />
      <InfoRow label="Sent at">{sentAt}</InfoRow>
      <InfoRow label="Sessions">Fridays, 13:15 to 15:15 WIB</InfoRow>
      <Button href={`${webUrl}/admin`}>Open the dashboard</Button>
    </Layout>
  );
}

export default AdminTestEmail;
