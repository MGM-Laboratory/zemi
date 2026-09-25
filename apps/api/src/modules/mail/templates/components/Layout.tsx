import { Body, Column, Container, Head, Html, Img, Link, Preview, Row, Section, Text } from '@react-email/components';
import type { ReactNode } from 'react';
import { useEmailContext } from './context.js';
import { colors, fonts, GOOGLE_FONTS_URL, LOGO } from './theme.js';

export interface LayoutProps {
  /** Inbox preview line (hidden in the body). Keep it under ~90 chars. */
  preview: string;
  children: ReactNode;
  /** Extra line above the standard footer, e.g. why they got this email. */
  footerNote?: ReactNode;
}

const STRIP = [colors.blue, colors.red, colors.yellow, colors.green];

/**
 * Branded shell for every Zemi email: logo header, four-color strip, white card, friendly footer.
 * Fonts load from Google Fonts where clients allow it, with Arial as the fallback.
 */
export function Layout({ preview, children, footerNote }: LayoutProps) {
  const { webUrl } = useEmailContext();
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href={GOOGLE_FONTS_URL} rel="stylesheet" />
        <style>{`
          body { margin: 0; padding: 0; }
          a { color: ${colors.blue}; }
          @media (max-width: 600px) {
            .zemi-card { padding: 20px 22px 28px !important; border-radius: 20px !important; }
            .zemi-outer { padding: 16px 10px !important; }
          }
        `}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: colors.bg, margin: 0, padding: 0, fontFamily: fonts.body, color: colors.ink }}>
        <Container className="zemi-outer" style={{ maxWidth: 600, width: '100%', padding: '32px 16px' }}>
          <Section
            className="zemi-card"
            style={{
              backgroundColor: colors.surface,
              borderRadius: 28,
              border: `1px solid ${colors.line}`,
              padding: '28px 40px 36px',
            }}
          >
            {/* The logo PNG has a white background, so it sits on the white card, centered like the file. */}
            <Section style={{ margin: '0 0 24px' }}>
              <Link href={webUrl} style={{ display: 'block', textDecoration: 'none' }}>
                <Img
                  src={`${webUrl}${LOGO.path}`}
                  width={String(LOGO.width)}
                  height={String(LOGO.height)}
                  alt="Zemi"
                  style={{ display: 'block', margin: '0 auto', border: 0, maxWidth: '100%', height: 'auto' }}
                />
              </Link>
            </Section>
            {children}
          </Section>

          <Section style={{ padding: '18px 8px 0' }}>
            <Row>
              {STRIP.map((c) => (
                <Column key={c} style={{ height: 6, backgroundColor: c, width: '25%' }} />
              ))}
            </Row>
          </Section>

          <Section style={{ padding: '18px 8px 0' }}>
            {footerNote ? (
              <Text style={{ margin: '0 0 10px', fontSize: 13, lineHeight: '20px', color: colors.ink3 }}>{footerNote}</Text>
            ) : null}
            <Text style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: colors.ink3 }}>
              <span style={{ fontFamily: fonts.display, fontWeight: 800, color: colors.ink }}>Zemi</span> by{' '}
              <Link href="https://labmgm.org" style={{ color: colors.ink3, textDecoration: 'underline' }}>
                MGM Laboratory
              </Link>
              . Fridays 13:15 WIB, bring the messy version.
            </Text>
            <Text style={{ margin: '6px 0 0', fontSize: 12, lineHeight: '18px', color: colors.ink4 }}>
              <Link href={webUrl} style={{ color: colors.ink4 }}>
                {webUrl.replace(/^https?:\/\//, '')}
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
