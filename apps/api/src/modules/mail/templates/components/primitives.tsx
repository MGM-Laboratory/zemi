import { Button as EmailButton, Heading as EmailHeading, Hr, Section, Text as EmailText } from '@react-email/components';
import type { CSSProperties, ReactNode } from 'react';
import { colors, fonts, toneColor, type Tone } from './theme.js';

export interface HeadingProps {
  children: ReactNode;
  /** 1 = the big line at the top, 2 = section titles. */
  level?: 1 | 2;
  style?: CSSProperties;
}

/** Display heading in Recursive (falls back to Arial Black / Arial). */
export function Heading({ children, level = 1, style }: HeadingProps) {
  const big = level === 1;
  return (
    <EmailHeading
      as={big ? 'h1' : 'h2'}
      style={{
        margin: big ? '0 0 16px' : '28px 0 10px',
        fontFamily: fonts.display,
        fontWeight: big ? 900 : 800,
        fontSize: big ? 34 : 22,
        lineHeight: big ? '38px' : '28px',
        letterSpacing: '-0.02em',
        color: colors.ink,
        ...style,
      }}
    >
      {children}
    </EmailHeading>
  );
}

export interface TextProps {
  children: ReactNode;
  muted?: boolean;
  size?: 'body' | 'small' | 'large';
  style?: CSSProperties;
}

export function Text({ children, muted, size = 'body', style }: TextProps) {
  const fontSize = size === 'large' ? 19 : size === 'small' ? 14 : 16;
  const lineHeight = size === 'large' ? '28px' : size === 'small' ? '21px' : '25px';
  return (
    <EmailText style={{ margin: '0 0 14px', fontFamily: fonts.body, fontSize, lineHeight, color: muted ? colors.ink3 : colors.ink2, ...style }}>
      {children}
    </EmailText>
  );
}

export interface ButtonProps {
  href: string;
  children: ReactNode;
  tone?: Tone;
  style?: CSSProperties;
}

/** Pill button. Say what happens: "Show my ticket", "Watch the recording". */
export function Button({ href, children, tone = 'blue', style }: ButtonProps) {
  const t = toneColor[tone];
  return (
    <Section style={{ margin: '22px 0 8px' }}>
      <EmailButton
        href={href}
        style={{
          display: 'inline-block',
          backgroundColor: t.bg,
          color: t.fg,
          fontFamily: fonts.body,
          fontWeight: 700,
          fontSize: 16,
          lineHeight: '20px',
          padding: '14px 26px',
          borderRadius: 999,
          textDecoration: 'none',
          ...style,
        }}
      >
        {children}
      </EmailButton>
    </Section>
  );
}

export interface InfoRowProps {
  label: string;
  children: ReactNode;
}

/** Label/value pair for event details: WHEN, WHERE, TICKET... */
export function InfoRow({ label, children }: InfoRowProps) {
  return (
    <Section style={{ margin: '0 0 12px' }}>
      <EmailText
        style={{
          margin: 0,
          fontFamily: fonts.mono,
          fontSize: 11,
          lineHeight: '16px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: colors.ink3,
        }}
      >
        {label}
      </EmailText>
      <EmailText style={{ margin: '2px 0 0', fontFamily: fonts.body, fontSize: 16, lineHeight: '24px', color: colors.ink }}>{children}</EmailText>
    </Section>
  );
}

export function Divider({ style }: { style?: CSSProperties }) {
  return <Hr style={{ border: 'none', borderTop: `1px solid ${colors.line}`, margin: '24px 0', ...style }} />;
}

/** Soft colored box for callouts ("Doors open at 13:15", "Signal lost, hang tight"). */
export function Callout({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'yellow' | 'red' | 'green' }) {
  const bg = { blue: colors.blue50, yellow: colors.yellow50, red: colors.red50, green: colors.green50 }[tone];
  return (
    <Section style={{ backgroundColor: bg, borderRadius: 16, padding: '14px 18px', margin: '18px 0' }}>
      <EmailText style={{ margin: 0, fontFamily: fonts.body, fontSize: 15, lineHeight: '23px', color: colors.ink }}>{children}</EmailText>
    </Section>
  );
}
