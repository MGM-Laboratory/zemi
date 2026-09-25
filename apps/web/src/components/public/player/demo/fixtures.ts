import type { RecordingChapter, VideoRef } from '@zemi/shared';
import { SHAPE_COLORS, SHAPE_ORDER, SHAPE_PATHS_46 } from '@zemi/shared';

/* Demo-only data for /styleguide/player. Generated SVG art so nothing needs hosting. */

export const MUX_HLS = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
export const MUX_DURATION = 634;
export const FLOWER_MP4 = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
export const FLOWER_WEBM = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm';

export const DEMO_CHAPTERS: RecordingChapter[] = [
  { title: 'Doors open, coffee first', startSec: 0 },
  { title: 'Traffic lights that learn', startSec: 45 },
  { title: 'The demo that almost worked', startSec: 190 },
  { title: 'Questions from the back row', startSec: 300 },
  { title: 'Batik patterns meet CNNs', startSec: 430 },
  { title: 'See you next Friday', startSec: 575 },
];

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const pad = (n: number) => String(n).padStart(2, '0');
const INK = '#0e1116';
const TILE_BG = ['#1b2433', '#2a1c22', '#2a2616', '#15271f'];

/**
 * A fake storyboard sprite in the pipeline's format (thumbs every `interval` seconds, 160x90,
 * 10 columns). Each tile shows its timestamp and a brand shape drifting across, so the hover
 * preview visibly changes as you scrub.
 */
export function fakeStoryboard(durationSec = MUX_DURATION, interval = 10): NonNullable<VideoRef['storyboard']> {
  const tileWidth = 160;
  const tileHeight = 90;
  const columns = 10;
  const count = Math.ceil(durationSec / interval);
  const rows = Math.ceil(count / columns);
  const chapterIdx = (t: number) => DEMO_CHAPTERS.reduce((acc, c, i) => (t >= c.startSec ? i : acc), 0);
  let tiles = '';
  for (let i = 0; i < count; i++) {
    const t = i * interval;
    const col = i % columns;
    const row = Math.floor(i / columns);
    const ch = chapterIdx(t);
    const shape = SHAPE_ORDER[ch % 4]!;
    const x = col * tileWidth;
    const y = row * tileHeight;
    const drift = ((i * 37) % 90) + 10;
    const rot = (i * 23) % 360;
    tiles += `<g transform="translate(${x} ${y})">
<rect width="${tileWidth}" height="${tileHeight}" fill="${TILE_BG[ch % 4]}"/>
<rect x="0" y="${tileHeight - 16}" width="${tileWidth}" height="16" fill="${INK}" opacity="0.5"/>
<g transform="translate(${drift} 18) rotate(${rot} 23 23) scale(0.95)"><path d="${SHAPE_PATHS_46[shape]}" fill="${SHAPE_COLORS[shape]}"/></g>
<g transform="translate(${118 - (drift % 30)} 40) scale(0.5)"><path d="${SHAPE_PATHS_46[SHAPE_ORDER[(ch + 1) % 4]!]}" fill="${SHAPE_COLORS[SHAPE_ORDER[(ch + 1) % 4]!]}" opacity="0.8"/></g>
<text x="8" y="${tileHeight - 4}" font-family="ui-monospace, Menlo, monospace" font-size="11" font-weight="700" fill="#fff">${pad(Math.floor(t / 60))}:${pad(t % 60)}</text>
<text x="${tileWidth - 8}" y="${tileHeight - 4}" text-anchor="end" font-family="ui-sans-serif, system-ui" font-size="10" font-weight="700" fill="#fff" opacity="0.7">ch ${ch + 1}</text>
</g>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${columns * tileWidth}" height="${rows * tileHeight}" viewBox="0 0 ${columns * tileWidth} ${rows * tileHeight}">${tiles}</svg>`;
  return { url: svgUrl(svg), interval, columns, tileWidth, tileHeight, count };
}

/** A poster in the brand: dark stage, the four shapes, a big session number. */
export function fakePoster(label: string, accent: keyof typeof ACCENTS = 'blue'): string {
  const a = ACCENTS[accent];
  const shapes = SHAPE_ORDER.map((s, i) => {
    const x = 1180 + (i % 2) * 190;
    const y = 250 + Math.floor(i / 2) * 190;
    return `<g transform="translate(${x} ${y}) scale(3.6)"><path d="${SHAPE_PATHS_46[s]}" fill="${SHAPE_COLORS[s]}"/></g>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
<defs><radialGradient id="g" cx="30%" cy="40%" r="80%"><stop offset="0" stop-color="${a}" stop-opacity="0.35"/><stop offset="1" stop-color="${INK}" stop-opacity="0"/></radialGradient>
<pattern id="p" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#ffffff" stroke-opacity="0.05" stroke-width="2"/></pattern></defs>
<rect width="1920" height="1080" fill="${INK}"/><rect width="1920" height="1080" fill="url(#p)"/><rect width="1920" height="1080" fill="url(#g)"/>
${shapes}
<text x="160" y="620" font-family="ui-sans-serif, system-ui" font-weight="900" font-size="190" fill="#fff" letter-spacing="-8">${label}</text>
<text x="166" y="720" font-family="ui-monospace, Menlo, monospace" font-weight="700" font-size="44" fill="#fff" opacity="0.7">FRIDAY 13:15 WIB</text>
</svg>`;
  return svgUrl(svg);
}

/** Tiny blurred stand-in for the poster (what ImageRef.lqip gives you). */
export function fakeLqip(accent: keyof typeof ACCENTS = 'blue'): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="14" viewBox="0 0 24 14"><rect width="24" height="14" fill="${INK}"/><circle cx="7" cy="6" r="7" fill="${ACCENTS[accent]}" opacity="0.35"/><rect x="15" y="3" width="6" height="6" fill="${SHAPE_COLORS.square}" opacity="0.6"/></svg>`;
  return svgUrl(svg);
}

const ACCENTS = { blue: SHAPE_COLORS.circle, red: SHAPE_COLORS.triangle, yellow: SHAPE_COLORS.square, green: SHAPE_COLORS.arch } as const;

export const FLOWER_VTT = `WEBVTT

00:00.000 --> 00:02.300
A flower, doing flower things.

00:02.300 --> 00:05.000
Nobody expects slides to be perfect.
`;

/** A broken-but-quiet source for the error state (no network request, so no console noise). */
export const BROKEN_MP4 = 'data:video/mp4;base64,AAAAHGZ0eXBpc29tAAACAGlzb21pc28ybXA0MQ==';
