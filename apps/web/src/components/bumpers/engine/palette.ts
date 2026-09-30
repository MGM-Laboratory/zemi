import { ACCENTS, BRAND, SHAPE_ORDER, type Accent, type BumperBackground, type BumperEventData, type BumperSlide, type BumperTheme, type BumperTone, type ShapeName } from '@zemi/shared';

/** Hex colors only (no color-mix, no CSS vars) so slides paint the same in OBS, the player and thumbnails. */
export const INK = BRAND.colors.ink;
export const PAPER = BRAND.colors.paper;
export const INK_2 = '#3b4150';
export const INK_3 = '#6b7280';
export const LINE = '#ececea';
export const GRAPH = '#eef1f6';
export const MUTED = '#f7f7f5';

export const ACCENT_HEX: Record<Accent, string> = {
  blue: BRAND.colors.blue,
  yellow: BRAND.colors.yellow,
  red: BRAND.colors.red,
  green: BRAND.colors.green,
};
export const ACCENT_50: Record<Accent, string> = { blue: '#ecf1fa', yellow: '#fef6e0', red: '#fee5e5', green: '#e2f1ea' };
export const ACCENT_600: Record<Accent, string> = { blue: '#2f5aa6', yellow: '#d99e12', red: '#d92f2f', green: '#0b6b45' };
/** Text that sits ON the accent color. Yellow needs ink, the others read in white. */
export const ON_ACCENT: Record<Accent, string> = { blue: PAPER, yellow: INK, red: PAPER, green: PAPER };

export const ACCENT_SHAPE: Record<Accent, ShapeName> = { blue: 'circle', red: 'triangle', yellow: 'square', green: 'arch' };
export const SHAPE_ACCENT: Record<ShapeName, Accent> = { circle: 'blue', triangle: 'red', square: 'yellow', arch: 'green' };

export function isAccent(v: unknown): v is Accent {
  return typeof v === 'string' && (ACCENTS as readonly string[]).includes(v);
}

/** The accent a slide paints with: slide override, then theme ('event' = the event's accent), then blue. */
export function slideAccent(slide: Pick<BumperSlide, 'style'>, theme: BumperTheme, event: Pick<BumperEventData, 'accent'> | null): Accent {
  if (isAccent(slide.style.accent)) return slide.style.accent;
  if (isAccent(theme.accent)) return theme.accent;
  return event?.accent ?? 'blue';
}

/** Resolved background kind (never 'auto'). */
export function slideBackground(slide: Pick<BumperSlide, 'style'>, theme: BumperTheme, templateDefault?: BumperBackground): Exclude<BumperBackground, 'auto'> {
  const bg = slide.style.background !== 'auto' ? slide.style.background : templateDefault && templateDefault !== 'auto' ? templateDefault : theme.background;
  if (bg === 'image' && !slide.style.backgroundAssetId) return theme.background;
  return bg;
}

export interface SlideColors {
  accent: Accent;
  accentHex: string;
  accentSoft: string;
  accentDeep: string;
  onAccent: string;
  /** Main background fill (hex, or 'transparent'). */
  bg: string;
  /** Main text color on this background. */
  fg: string;
  /** Secondary text. */
  fg2: string;
  /** Hairlines. */
  line: string;
  dark: boolean;
}

export function slideColors(accent: Accent, background: Exclude<BumperBackground, 'auto'>): SlideColors {
  const accentHex = ACCENT_HEX[accent];
  const dark = background === 'ink' || background === 'image' || (background === 'accent' && accent !== 'yellow');
  const bg =
    background === 'ink' ? INK : background === 'accent' ? accentHex : background === 'transparent' ? 'transparent' : background === 'image' ? INK : PAPER;
  const fg = background === 'accent' ? ON_ACCENT[accent] : dark ? PAPER : INK;
  const fg2 = background === 'accent' ? (accent === 'yellow' ? INK_2 : 'rgba(255,255,255,0.82)') : dark ? 'rgba(245,246,248,0.74)' : INK_2;
  const line = dark ? 'rgba(255,255,255,0.18)' : LINE;
  return { accent, accentHex, accentSoft: ACCENT_50[accent], accentDeep: ACCENT_600[accent], onAccent: ON_ACCENT[accent], bg, fg, fg2, line, dark };
}

/** A tone name to a hex color in the context of a slide. */
export function toneHex(tone: BumperTone | string | null | undefined, colors: SlideColors): string {
  switch (tone) {
    case 'ink':
      return INK;
    case 'paper':
      return PAPER;
    case 'blue':
    case 'red':
    case 'green':
    case 'yellow':
      return ACCENT_HEX[tone];
    case 'accent':
      return colors.accentHex;
    case 'muted':
      return colors.fg2;
    default:
      return colors.fg;
  }
}

/** Deterministic shape for a name (matches the public Avatar's idea of "your shape"). */
export function shapeForName(name: string): ShapeName {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SHAPE_ORDER[h % SHAPE_ORDER.length]!;
}

export { SHAPE_ORDER };
