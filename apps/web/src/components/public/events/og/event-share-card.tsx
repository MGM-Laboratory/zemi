/**
 * The 1200x630 PNG link preview for an event page (used by the segment's opengraph-image.tsx and
 * twitter-image.tsx). Server only: next/og (Satori + resvg), no client code.
 *
 * Why not the cover itself: covers are 4:5 WebP/AVIF, `summary_large_image` crops them to about
 * 1.9:1, and some scrapers (LinkedIn) reject WebP. This card is a PNG in the right ratio with the
 * number, title, date, and the cover's accent frame. The frame holds the brand shape and the number
 * rather than the photo: next/og can't decode WebP or AVIF (it throws), and the upload pipeline
 * emits nothing else. A JPEG/PNG variant from the API would let the photo go in the frame.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { formatJakarta, type Accent, type EventDetail } from '@zemi/shared';
import { getEvent } from '@/lib/api/server';
import {
  ACCENT_FRIEND,
  ACCENT_HEX,
  ACCENT_SHAPE,
  ACCENT_TEXT,
  ACCENT_TINT,
  eventLabel,
} from '../lib';

export const SHARE_SIZE = { width: 1200, height: 630 };
export const SHARE_CONTENT_TYPE = 'image/png';
export const SHARE_ALT = 'A Zemi Friday: the number, title, date and time';

// Relative to the app root (apps/web), as next/og's docs place local assets.
const FONT_DIR = join(process.cwd(), 'src/components/public/events/og/fonts');

type Font = NonNullable<ConstructorParameters<typeof ImageResponse>[1]>['fonts'];

let fontsPromise: Promise<Font> | null = null;
/** Recursive Display Black + Mono Bold, read once per process. Falls back to next/og's default font. */
function loadFonts(): Promise<Font> {
  fontsPromise ??= Promise.all([
    readFile(join(FONT_DIR, 'Recursive-Display-Black.ttf')),
    readFile(join(FONT_DIR, 'Recursive-Mono-Bold.ttf')),
  ])
    .then(
      ([display, mono]) =>
        [
          { name: 'Display', data: display, weight: 900, style: 'normal' },
          { name: 'Mono', data: mono, weight: 700, style: 'normal' },
        ] satisfies Font,
    )
    .catch((err: unknown) => {
      console.warn(`[zemi og] fonts missing, using the default font: ${String(err)}`);
      fontsPromise = null;
      return undefined;
    });
  return fontsPromise;
}

const MARK = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M23 0 A23 23 0 1 1 22.99 0 Z" fill="#3a6dc5"/><path d="M73.76 7.2 Q77 1 80.24 7.2L96.76 38.8 Q100 45 93 45L61 45 Q54 45 57.24 38.8 Z" fill="#f94141"/><path d="M10 54 H36 Q46 54 46 64 V90 Q46 100 36 100 H10 Q0 100 0 90 V64 Q0 54 10 54 Z" fill="#f7bf33"/><path d="M54 100 V77 A23 23 0 0 1 100 77 V100 Z" fill="#0f8657"/></svg>',
)}`;

const SHAPE_PATH: Record<string, string> = {
  circle: '<circle cx="50" cy="50" r="50"/>',
  triangle: '<path d="M44.6 6.4 Q50 -2 55.4 6.4 L98 82 Q102 92 90 92 H10 Q-2 92 2 82 Z"/>',
  square: '<rect width="100" height="100" rx="22"/>',
  arch: '<path d="M0 100 V50 A50 50 0 0 1 100 50 V100 Z"/>',
};

function shapeSrc(accent: Accent, color: string): string {
  const shape = SHAPE_PATH[ACCENT_SHAPE[accent]] ?? SHAPE_PATH.circle!;
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 104 104" fill="${color}">${shape}</svg>`,
  )}`;
}

const INK = '#0e1116';
const INK_3 = '#6b7280';

function titleSize(title: string): number {
  const n = title.length;
  if (n <= 24) return 84;
  if (n <= 44) return 68;
  if (n <= 70) return 56;
  return 46;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}...` : text;
}

function statusLine(e: EventDetail): string {
  if (e.status === 'cancelled') return 'This one got cancelled.';
  if (e.status === 'past') return e.hasRecording ? 'Missed it? The recording is up.' : "That's a wrap.";
  if (e.status === 'ongoing') return 'Happening right now. Come in.';
  return 'Free, hybrid. Save a seat.';
}

function Card({ e }: { e: EventDetail }) {
  const accent = ACCENT_HEX[e.accent];
  const friend = ACCENT_HEX[ACCENT_FRIEND[e.accent]];
  const title = clip(e.title, 96);
  const where = e.mode === 'online' ? 'Online' : (e.venueFull?.name ?? e.venue?.name ?? null);
  const when = `${formatJakarta(e.startsAt, 'time')} WIB${where ? ` · ${where}` : ''}`;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        backgroundColor: '#ffffff',
        backgroundImage:
          'linear-gradient(#f0f0ec 1px, transparent 1px), linear-gradient(90deg, #f0f0ec 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        fontFamily: 'Display',
        color: INK,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: 720,
          padding: '64px 0 60px 72px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              fontFamily: 'Mono',
              fontSize: 24,
              letterSpacing: 2,
              color: INK_3,
              textTransform: 'uppercase',
            }}
          >
            <span
              style={{
                display: 'flex',
                padding: '8px 16px',
                borderRadius: 999,
                backgroundColor: e.accent === 'yellow' ? ACCENT_TINT.yellow : accent,
                color: e.accent === 'yellow' ? INK : '#ffffff',
              }}
            >
              {formatJakarta(e.startsAt, 'date')}
            </span>
            <span>{e.number != null ? eventLabel(e) : 'MGM Laboratory'}</span>
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize(title),
              lineHeight: 1.02,
              letterSpacing: -1,
              textDecoration: e.status === 'cancelled' ? 'line-through' : 'none',
            }}
          >
            {title}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div
            style={{
              display: 'flex',
              fontFamily: 'Mono',
              fontSize: 28,
              color: ACCENT_TEXT[e.accent],
            }}
          >
            {clip(when, 38)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MARK} width={52} height={52} alt="" />
            <span style={{ fontSize: 46, lineHeight: 1 }}>zemi</span>
            <span
              style={{
                display: 'flex',
                marginLeft: 8,
                fontFamily: 'Mono',
                fontSize: 22,
                color: INK_3,
              }}
            >
              {statusLine(e)}
            </span>
          </div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            right: 44,
            top: 40,
            width: 112,
            height: 112,
            borderRadius: 999,
            backgroundColor: friend,
          }}
        />
        <div
          style={{
            display: 'flex',
            padding: 14,
            borderRadius: 32,
            backgroundColor: accent,
            transform: 'rotate(-3deg)',
            boxShadow: '0 24px 60px rgba(14,17,22,0.18)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 18,
              width: 340,
              height: 425,
              borderRadius: 20,
              backgroundColor: ACCENT_TINT[e.accent],
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shapeSrc(e.accent, accent)} width={170} height={170} alt="" />
            <div
              style={{
                display: 'flex',
                fontSize: e.number != null && e.number >= 100 ? 92 : 108,
                lineHeight: 1,
                color: INK,
              }}
            >
              {e.number != null ? `#${e.number}` : 'zemi'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The brand card when the event is missing or the API is down (never a broken preview). */
function Fallback() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 24,
        padding: 72,
        backgroundColor: '#ffffff',
        fontFamily: 'Display',
        color: INK,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MARK} width={120} height={120} alt="" />
      <div style={{ display: 'flex', fontSize: 120, lineHeight: 1 }}>zemi</div>
      <div style={{ display: 'flex', fontFamily: 'Mono', fontSize: 32, color: ACCENT_TEXT.blue }}>
        Fridays, 13:15 WIB.
      </div>
    </div>
  );
}

export async function renderEventShareCard(slug: string): Promise<ImageResponse> {
  const [lookup, fonts] = await Promise.all([getEvent(slug), loadFonts()]);
  const e = lookup.kind === 'found' ? lookup.data : null;
  return new ImageResponse(e ? <Card e={e} /> : <Fallback />, {
    ...SHARE_SIZE,
    fonts,
  });
}
