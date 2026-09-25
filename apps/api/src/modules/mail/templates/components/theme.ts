/** Email-safe brand tokens (docs/DESIGN.md). Keep in sync with the web tokens. */
export const colors = {
  bg: '#f7f7f5',
  surface: '#ffffff',
  ink: '#0e1116',
  ink2: '#3b4150',
  ink3: '#6b7280',
  ink4: '#9aa1ad',
  line: '#ececea',
  blue: '#3a6dc5',
  blue600: '#2f5aa6',
  blue50: '#ecf1fa',
  yellow: '#f7bf33',
  yellow50: '#fef6e0',
  red: '#f94141',
  red600: '#d92f2f',
  red50: '#fee5e5',
  green: '#0f8657',
  green600: '#0b6b45',
  green50: '#e2f1ea',
} as const;

export const fonts = {
  display: "'Recursive', 'Arial Black', Arial, Helvetica, sans-serif",
  body: "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', Arial, Helvetica, sans-serif",
  mono: "'Recursive', 'Courier New', Courier, monospace",
} as const;

export const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;700&family=Recursive:wght@400..900&display=swap';

/**
 * The hosted header logo (`PUBLIC_WEB_URL + LOGO.path`, owned by apps/web). The file is 720x160 (9:2) on an
 * opaque white background with the lockup centered, so the Layout shows it centered on the white card at the
 * same ratio. If the web ever changes the PNG's ratio, update these numbers or it will look stretched.
 */
export const LOGO = { path: '/brand/email-logo.png', width: 270, height: 60 } as const;

export type Tone = 'blue' | 'ink' | 'red' | 'green';

export const toneColor: Record<Tone, { bg: string; fg: string }> = {
  blue: { bg: colors.blue, fg: '#ffffff' },
  ink: { bg: colors.ink, fg: '#ffffff' },
  red: { bg: colors.red600, fg: '#ffffff' },
  green: { bg: colors.green, fg: '#ffffff' },
};
