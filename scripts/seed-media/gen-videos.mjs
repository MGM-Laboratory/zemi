#!/usr/bin/env node
/**
 * Seed videos with ffmpeg:
 *   videos/doc-clip-0N.mp4   4 documentation clips, 12 s, 1280x720 30 fps, Ken Burns over the docs photos,
 *                            soft chord pad audio (AAC)
 *   videos/recording-01.mp4  about 4 minutes, 1280x720 30 fps, a slide-style talk recording made from covers,
 *                            figures and docs photos, with a quiet pink-noise room tone
 *
 *   node scripts/seed-media/gen-videos.mjs [--only clips|recording]
 *
 * Needs ffmpeg + ffprobe, and the docs photos, covers and pub covers (run the other generators first).
 * Zoompan runs on a 4x upscaled, 16:9 pre-cropped frame so the motion is smooth (no integer jitter).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ASSETS, BRAND as B, SHAPES_46, bytes, ensureDir, ffprobeDuration, readManifest, rel, rng, scratch, sharp, writeSection } from './lib/common.mjs';
import { character, f, shape } from './lib/svg.mjs';

const FPS = 30;
const OUT = ensureDir(join(ASSETS, 'videos'));
const TMP = ensureDir(scratch('video-work'));
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

function ff(argv, label) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) {
    console.error(r.stderr);
    throw new Error(`ffmpeg failed: ${label}`);
  }
}

const X264 = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS)];

/**
 * One Ken Burns shot from a 3:2 photo: 16:9 crop, 4x upscale, then zoompan to 1280x720.
 * JPEG input decodes as full range, so convert to limited (tv) range: otherwise the clips come out as
 * yuvj420p, which some players and hardware decoders show with crushed or washed-out levels.
 */
function kenBurns(photo, seconds, move, out) {
  const d = Math.round(seconds * FPS);
  const moves = {
    in: { z: `1+0.14*on/${d}`, x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)' },
    out: { z: `1.14-0.14*on/${d}`, x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)' },
    right: { z: '1.12', x: `(iw-iw/zoom)*on/${d}`, y: '(ih-ih/zoom)/2' },
    left: { z: '1.12', x: `(iw-iw/zoom)*(1-on/${d})`, y: '(ih-ih/zoom)/2' },
    up: { z: `1.08+0.06*on/${d}`, x: 'iw/2-(iw/zoom/2)', y: `(ih-ih/zoom)*(1-on/${d})` },
  }[move];
  ff(
    [
      '-i', photo,
      '-vf',
      `crop=iw:iw*9/16,scale=5120:2880:flags=lanczos,zoompan=z='${moves.z}':x='${moves.x}':y='${moves.y}':d=${d}:s=1280x720:fps=${FPS},scale=out_range=tv,format=yuv420p`,
      '-frames:v', String(d), ...X264, '-an', out,
    ],
    `kenburns ${photo}`,
  );
}

// ------------------------------------------------------------------ documentation clips

async function clips(docs) {
  const plan = [
    { id: 'doc-clip-01', title: 'Talk highlights', shots: [['doc-01', 'in'], ['doc-07', 'right'], ['doc-03', 'out']] },
    { id: 'doc-clip-02', title: 'Questions from the room', shots: [['doc-02', 'left'], ['doc-14', 'in'], ['doc-16', 'right']] },
    { id: 'doc-clip-03', title: 'Coffee after the session', shots: [['doc-04', 'in'], ['doc-12', 'left'], ['doc-24', 'out']] },
    { id: 'doc-clip-04', title: 'Group photo and goodbyes', shots: [['doc-18', 'up'], ['doc-05', 'in'], ['doc-20', 'right']] },
  ];
  const items = [];
  const shotLen = 4.6;
  const xf = 0.8;
  for (const [ci, c] of plan.entries()) {
    const parts = c.shots.map(([photo, move], i) => {
      const p = join(TMP, `${c.id}-${i}.mp4`);
      kenBurns(join(ASSETS, 'docs', `${photo}.jpg`), shotLen, move, p);
      return p;
    });
    const total = shotLen * parts.length - xf * (parts.length - 1);
    // chord pad: three soft partials with a slow swell, a little lowpassed noise for air
    const roots = [[220, 277.18, 329.63], [196, 246.94, 293.66], [174.61, 220, 261.63], [246.94, 311.13, 369.99]][ci];
    const pad = roots.map((hz) => `0.05*sin(2*PI*${hz}*t)*(0.6+0.4*sin(2*PI*0.21*t))`).join('+');
    const out = join(OUT, `${c.id}.mp4`);
    const fc = [
      `[0:v][1:v]xfade=transition=fade:duration=${xf}:offset=${shotLen - xf}[v01]`,
      `[v01][2:v]xfade=transition=fade:duration=${xf}:offset=${2 * shotLen - 2 * xf}[vx]`,
      `[vx]fade=t=in:st=0:d=0.5,fade=t=out:st=${f(total - 0.6)}:d=0.6[v]`,
      `aevalsrc='${pad}':s=48000:d=${f(total)}[pad]`,
      `anoisesrc=color=pink:amplitude=0.02:d=${f(total)}:r=48000,lowpass=f=900[air]`,
      `[pad][air]amix=inputs=2:normalize=0,afade=t=in:st=0:d=1.2,afade=t=out:st=${f(total - 1.5)}:d=1.5,volume=0.8,aformat=channel_layouts=stereo[a]`,
    ].join(';');
    ff(
      [...parts.flatMap((p) => ['-i', p]), '-filter_complex', fc, '-map', '[v]', '-map', '[a]', ...X264, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-t', f(total).toString(), out],
      c.id,
    );
    parts.forEach((p) => rmSync(p, { force: true }));
    items.push({
      id: c.id,
      path: rel(out),
      type: 'video',
      mime: 'video/mp4',
      width: 1280,
      height: 720,
      fps: FPS,
      durationSec: ffprobeDuration(out),
      bytes: bytes(out),
      title: c.title,
      sourcePhotos: c.shots.map(([p]) => `docs/${p}.jpg`),
      audio: 'soft synth chord pad (generated)',
      usage: 'event documentation video (event_media, kind video)',
      credit: 'Ken Burns edit of the AI-generated docs photos, scripts/seed-media/gen-videos.mjs.',
    });
    console.log(`${c.id}: ${items.at(-1).durationSec}s ${Math.round(items.at(-1).bytes / 1024)} KB`);
  }
  writeSection('videos', {
    purpose: 'documentation',
    note: 'Short H.264 + AAC MP4 clips (faststart). Upload as documentation videos so the pipeline makes WebM, poster and storyboard.',
    credit: 'Generated from the docs photos.',
    items,
  });
}

// ------------------------------------------------------------------ recording (slide-style talk)

const SW = 1280;
const SH = 720;

function bars(x, y, w, n, { gap = 34, h = 16, color = B.lineStrong, r } = {}) {
  const rr = r ?? rng(x * 7 + y);
  return Array.from({ length: n }, (_, i) => `<rect x="${x}" y="${y + i * gap}" width="${f(i === n - 1 ? w * rr.range(0.35, 0.7) : w * rr.range(0.82, 1))}" height="${h}" rx="${h / 2}" fill="${color}"/>`).join('');
}

function frame(inner, { bg = '#ffffff', n = 1, total = 12 } = {}) {
  // a tiny Zemi template: mark bottom-left, slide dots bottom-right
  const mark = ['circle', 'triangle', 'square', 'arch']
    .map((s, i) => `<path d="${SHAPES_46[s]}" fill="${[B.blue, B.red, B.yellow, B.green][i]}" transform="translate(${40 + (i % 2) * 15} ${660 + Math.floor(i / 2) * 15}) scale(0.28)"/>`)
    .join('');
  const dots = Array.from({ length: total }, (_, i) => `<circle cx="${SW - 60 - (total - 1 - i) * 14}" cy="${676}" r="${i === n - 1 ? 5 : 3}" fill="${i === n - 1 ? B.ink : B.lineStrong}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}"><rect width="${SW}" height="${SH}" fill="${bg}"/>${inner}${mark}${dots}</svg>`;
}

async function imageData(file, w, h, fit = 'cover', position = 'centre') {
  const buf = await sharp(file).resize(w, h, { fit, position }).jpeg({ quality: 88 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

async function slides(accent) {
  const cov = (n) => join(ASSETS, 'covers', `cover-${String(n).padStart(2, '0')}.jpg`);
  const pub = (n) => join(ASSETS, 'pub-covers', `pub-cover-${String(n).padStart(2, '0')}.jpg`);
  const doc = (n) => join(ASSETS, 'docs', `doc-${String(n).padStart(2, '0')}.jpg`);
  const r = rng(77);
  const clip = (id, x, y, w, h, rad = 24) => `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rad}"/></clipPath>`;
  const img = (href, x, y, w, h, clipId) => `<image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"${clipId ? ` clip-path="url(#${clipId})"` : ''}/>`;
  const title = (x, y, w, color = B.ink) => `<rect x="${x}" y="${y}" width="${w}" height="42" rx="21" fill="${color}"/>`;
  const total = 12;
  const S = [];
  // 1 title
  S.push(frame(`<defs>${clip('c1', 700, 70, 480, 580)}</defs>${img(await imageData(cov(6), 480, 600), 700, 60, 480, 600, 'c1')}
    <rect x="80" y="210" width="120" height="30" rx="15" fill="${accent}"/>${title(80, 270, 520)}${title(80, 330, 380)}${bars(80, 420, 420, 2, { r })}`, { n: 1, total }));
  // 2 agenda
  S.push(frame(`${title(80, 80, 360)}${['circle', 'triangle', 'square', 'arch'].map((s, i) => shape(s, 110, 220 + i * 100, 44, [B.blue, B.red, B.yellow, B.green][i]) + bars(160, 208 + i * 100, 560, 1, { h: 22, color: '#c9ccd2', r })).join('')}
    ${character('circle', 1000, 380, 260, B.blue, { look: [-0.8, 0.1] })}`, { n: 2, total }));
  // 3 problem photo
  S.push(frame(`<defs>${clip('c3', 60, 60, 1160, 520)}</defs>${img(await imageData(doc(22), 1160, 520), 60, 60, 1160, 520, 'c3')}${bars(60, 610, 520, 1, { h: 18, r })}`, { n: 3, total }));
  // 4 figure + bullets
  S.push(frame(`<defs>${clip('c4', 640, 80, 560, 520, 12)}</defs>${title(80, 80, 420)}${bars(80, 180, 460, 6, { r, gap: 44 })}${img(await imageData(pub(2), 560, 700), 640, 50, 560, 580, 'c4')}`, { n: 4, total }));
  // 5 big figure
  S.push(frame(`<defs>${clip('c5', 180, 110, 920, 500, 12)}</defs>${title(80, 50, 460)}${img(await imageData(pub(4), 920, 1150), 180, 0, 920, 720, 'c5')}`, { n: 5, total }));
  // 6 method diagram with characters
  S.push(frame(`${title(80, 70, 380)}
    ${[['square', B.yellow], ['arch', B.green], ['triangle', B.red]].map(([s, c], i) => `<rect x="${110 + i * 380}" y="230" width="300" height="260" rx="28" fill="${B.muted}"/>${character(s, 260 + i * 380, 330, 130, c, { look: [1, 0] })}${bars(150 + i * 380, 430, 220, 1, { r })}`).join('')}
    <path d="M420 360H480M800 360H860" stroke="${B.ink}" stroke-width="10" stroke-linecap="round"/><path d="M470 340l20 20-20 20M850 340l20 20-20 20" fill="none" stroke="${B.ink}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`, { n: 6, total }));
  // 7 two figures
  S.push(frame(`<defs>${clip('c7a', 80, 150, 540, 460, 12)}${clip('c7b', 660, 150, 540, 460, 12)}</defs>${title(80, 60, 520)}${img(await imageData(pub(1), 540, 675), 80, 80, 540, 600, 'c7a')}${img(await imageData(pub(9), 540, 675), 660, 80, 540, 600, 'c7b')}`, { n: 7, total }));
  // 8 big number
  S.push(frame(`${shape('circle', 360, 340, 380, accent)}<rect x="250" y="310" width="220" height="60" rx="30" fill="#ffffff"/>${title(700, 250, 400)}${bars(700, 330, 440, 4, { r, gap: 40 })}`, { n: 8, total }));
  // 9 table-ish
  S.push(frame(`${title(80, 70, 420)}${Array.from({ length: 5 }, (_, i) => `<rect x="80" y="${180 + i * 80}" width="1120" height="64" rx="14" fill="${i === 4 ? B.yellow50 : i % 2 ? '#ffffff' : B.muted}"/>${bars(110, 204 + i * 80, 300, 1, { r, h: 16 })}${[0, 1, 2].map((k) => `<rect x="${560 + k * 220}" y="${204 + i * 80}" width="${f(r.range(60, 140))}" height="16" rx="8" fill="${i === 4 ? B.yellow600 : '#c9ccd2'}"/>`).join('')}`).join('')}`, { n: 9, total }));
  // 10 photo of the demo
  S.push(frame(`<defs>${clip('c10', 60, 60, 1160, 560)}</defs>${img(await imageData(doc(17), 1160, 560), 60, 60, 1160, 560, 'c10')}`, { n: 10, total }));
  // 11 takeaways
  S.push(frame(`${title(80, 70, 360)}${[B.blue, B.red, B.green].map((c, i) => `<rect x="${80 + i * 380}" y="190" width="340" height="380" rx="28" fill="${c}"/>${shape(['circle', 'triangle', 'arch'][i], 150 + i * 380, 260, 60, '#ffffff')}${bars(120 + i * 380, 360, 260, 4, { r, color: 'rgba(255,255,255,0.75)', gap: 40 })}`).join('')}`, { n: 11, total }));
  // 12 thanks
  S.push(frame(`${['circle', 'triangle', 'square', 'arch'].map((s, i) => character(s, 290 + i * 230, 330, 170, [B.blue, B.red, B.yellow, B.green][i], { look: [0, 0.3], blink: i === 2 })).join('')}${title(440, 500, 400)}${bars(480, 570, 320, 1, { r })}`, { n: 12, total }));
  const files = [];
  for (const [i, svg] of S.entries()) {
    const p = join(TMP, `slide-${String(i + 1).padStart(2, '0')}.png`);
    await sharp(Buffer.from(svg)).png().toFile(p);
    files.push(p);
  }
  return files;
}

async function recording() {
  const slideFiles = await slides(B.blue);
  // 16 segments x 15 s = 240 s. Camera shots (docs photos) interleave with the slides.
  const seq = [
    ['slide', 0], ['cam', 'doc-03'], ['slide', 1], ['slide', 2], ['cam', 'doc-19'], ['slide', 3], ['slide', 4], ['slide', 5],
    ['cam', 'doc-07'], ['slide', 6], ['slide', 7], ['slide', 8], ['slide', 9], ['cam', 'doc-14'], ['slide', 10], ['slide', 11],
  ];
  const seg = 15;
  const parts = [];
  for (const [i, [kind, ref]] of seq.entries()) {
    const p = join(TMP, `rec-${String(i).padStart(2, '0')}.mp4`);
    if (kind === 'slide') {
      ff(['-loop', '1', '-framerate', String(FPS), '-t', String(seg), '-i', slideFiles[ref], '-vf', 'format=yuv420p', ...X264, '-tune', 'stillimage', '-an', p], `slide ${ref}`);
    } else {
      kenBurns(join(ASSETS, 'docs', `${ref}.jpg`), seg, i % 2 ? 'in' : 'right', p);
    }
    parts.push(p);
  }
  const list = join(TMP, 'rec-list.txt');
  writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
  const total = seg * seq.length;
  const out = join(OUT, 'recording-01.mp4');
  ff(
    [
      '-f', 'concat', '-safe', '0', '-i', list,
      '-f', 'lavfi', '-i', `anoisesrc=color=pink:amplitude=0.03:d=${total}:r=48000`,
      '-filter_complex', `[1:a]lowpass=f=1400,highpass=f=80,volume=0.6,afade=t=in:d=2,afade=t=out:st=${total - 3}:d=3,aformat=channel_layouts=stereo[a]`,
      '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-t', String(total), out,
    ],
    'recording',
  );
  parts.forEach((p) => rmSync(p, { force: true }));
  const durationSec = ffprobeDuration(out);
  writeSection('recordings', {
    purpose: 'recording',
    note: 'A fake talk recording for past events (stream_sessions.recordingAssetId / external recording upload). Chapters line up with a 13:15 rundown.',
    credit: 'Slides generated from the covers and figures, camera shots from the docs photos, quiet pink-noise room tone.',
    items: [
      {
        id: 'recording-01',
        path: rel(out),
        type: 'video',
        mime: 'video/mp4',
        width: 1280,
        height: 720,
        fps: FPS,
        durationSec,
        bytes: bytes(out),
        audio: 'pink-noise room tone, low volume',
        segments: seq.map(([kind, ref], i) => ({ startSec: i * seg, kind, source: kind === 'slide' ? `slide ${ref + 1}` : `docs/${ref}.jpg` })),
        suggestedChapters: [
          { startSec: 0, title: 'Opening' },
          { startSec: 30, title: 'Why this problem' },
          { startSec: 75, title: 'Method' },
          { startSec: 150, title: 'Results' },
          { startSec: 195, title: 'Questions' },
          { startSec: 225, title: 'Wrap up' },
        ],
        usage: 'past-event recording (purpose recording)',
        credit: 'Generated, scripts/seed-media/gen-videos.mjs.',
      },
    ],
  });
  console.log(`recording-01: ${durationSec}s ${Math.round(bytes(out) / 1048576)} MB`);
}

const m = readManifest();
if (!m?.sections?.docs?.items?.length || !existsSync(join(ASSETS, 'covers', 'cover-06.jpg'))) {
  console.error('run build-docs.mjs, gen-covers.mjs and gen-pub-covers.mjs first');
  process.exit(1);
}
if (!only || only === 'clips') await clips(m.sections.docs.items);
if (!only || only === 'recording') await recording();
