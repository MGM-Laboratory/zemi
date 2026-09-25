import { spawn } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

/**
 * Reusable ffmpeg / ffprobe helpers. Every function:
 * - takes absolute file paths (work in a tmp dir, see `withTmpDir` in ./tmp.ts),
 * - accepts `{ signal }` (pass pg-boss `job.signal`) and `{ timeoutMs }`,
 * - rejects with an `FfmpegError` carrying the tail of stderr.
 *
 * Binaries default to FFMPEG_PATH / FFPROBE_PATH (see `configureFfmpeg`, called at boot).
 */

let FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
let FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

export function configureFfmpeg(paths: { ffmpeg?: string; ffprobe?: string }): void {
  if (paths.ffmpeg) FFMPEG = paths.ffmpeg;
  if (paths.ffprobe) FFPROBE = paths.ffprobe;
}

export interface RunOptions {
  signal?: AbortSignal;
  /** Kill the process after this long (default 6 hours). */
  timeoutMs?: number;
}

export class FfmpegError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'FfmpegError';
  }
}

/** Spawn a binary, collect stdout, keep the last 8 KB of stderr. */
export function run(bin: string, args: string[], opts: RunOptions = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new FfmpegError('Aborted before start', null, ''));
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    let err = '';
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      fn();
    };
    const kill = (why: string) => {
      child.kill('SIGKILL');
      finish(() => reject(new FfmpegError(why, null, err)));
    };
    const onAbort = () => kill(`${bin} was cancelled`);
    const timer = setTimeout(() => kill(`${bin} timed out`), opts.timeoutMs ?? 6 * 3600_000);
    timer.unref();
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout.on('data', (d: Buffer) => out.push(d));
    child.stderr.on('data', (d: Buffer) => {
      err = (err + d.toString('utf8')).slice(-8192);
    });
    child.on('error', (e) => finish(() => reject(new FfmpegError(`${bin} could not start: ${e.message}`, null, err))));
    child.on('close', (code) => {
      finish(() => {
        if (code === 0) resolve({ stdout: Buffer.concat(out).toString('utf8'), stderr: err });
        else {
          const last = err.trim().split('\n').filter(Boolean).slice(-3).join(' | ');
          reject(new FfmpegError(`${bin} exited with ${code}${last ? `: ${last}` : ''}`, code, err));
        }
      });
    });
  });
}

const ffmpeg = (args: string[], opts?: RunOptions) =>
  run(FFMPEG, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', ...args], opts);

/* --------------------------------------------------------------------------------- probe */

export interface ProbeResult {
  durationSec: number | null;
  formatName: string | null;
  bitRate: number | null;
  sizeBytes: number | null;
  video: {
    codec: string;
    /** Display size (rotation applied). */
    width: number;
    height: number;
    rotation: number;
    fps: number | null;
    pixFmt: string | null;
  } | null;
  audio: { codec: string; sampleRate: number | null; channels: number | null } | null;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  sample_rate?: string;
  channels?: number;
  duration?: string;
  tags?: Record<string, string>;
  side_data_list?: Array<{ rotation?: number | string }>;
  disposition?: { attached_pic?: number };
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

function parseRate(rate: string | undefined): number | null {
  if (!rate) return null;
  const [a, b] = rate.split('/').map(Number);
  if (!a || !b) return null;
  return Math.round((a / b) * 100) / 100;
}

export async function probe(file: string, opts?: RunOptions): Promise<ProbeResult> {
  const { stdout } = await run(
    FFPROBE,
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
    { timeoutMs: 60_000, ...opts },
  );
  const data = JSON.parse(stdout || '{}') as {
    format?: { duration?: string; format_name?: string; bit_rate?: string; size?: string };
    streams?: FfprobeStream[];
  };
  const streams = data.streams ?? [];
  const v = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const a = streams.find((s) => s.codec_type === 'audio');
  let duration = num(data.format?.duration);
  if (duration === null) {
    const ds = streams.map((s) => num(s.duration)).filter((d): d is number => d !== null);
    duration = ds.length ? Math.max(...ds) : null;
  }
  let video: ProbeResult['video'] = null;
  if (v && v.width && v.height) {
    const rotRaw = v.side_data_list?.find((s) => s.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0;
    const rotation = ((Math.round(Number(rotRaw) || 0) % 360) + 360) % 360;
    const swap = rotation === 90 || rotation === 270;
    video = {
      codec: v.codec_name ?? 'unknown',
      width: swap ? v.height : v.width,
      height: swap ? v.width : v.height,
      rotation,
      fps: parseRate(v.avg_frame_rate) ?? parseRate(v.r_frame_rate),
      pixFmt: v.pix_fmt ?? null,
    };
  }
  return {
    durationSec: duration,
    formatName: data.format?.format_name ?? null,
    bitRate: num(data.format?.bit_rate),
    sizeBytes: num(data.format?.size),
    video,
    audio: a ? { codec: a.codec_name ?? 'unknown', sampleRate: num(a.sample_rate), channels: a.channels ?? null } : null,
  };
}

/* ------------------------------------------------------------------------------ transcode */

/** Scale so the SHORT side is at most `max` px (1080p for portrait and landscape), even dimensions. */
export function scaleShortSide(max: number): string {
  const w = `if(gte(iw\\,ih)\\,-2\\,trunc(min(${max}\\,iw)/2)*2)`;
  const h = `if(gte(iw\\,ih)\\,trunc(min(${max}\\,ih)/2)*2\\,-2)`;
  return `scale=w=${w}:h=${h}`;
}

export interface TranscodeOptions extends RunOptions {
  /** Short-side cap in px (default 1080). */
  maxShortSide?: number;
  crf?: number;
}

/** H.264 MP4, CRF 23, <=1080p, yuv420p, AAC 128k stereo, faststart. */
export async function transcodeMp4(input: string, output: string, opts: TranscodeOptions & { preset?: string } = {}): Promise<void> {
  await ffmpeg(
    [
      '-i', input,
      '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn',
      '-vf', scaleShortSide(opts.maxShortSide ?? 1080),
      '-c:v', 'libx264', '-preset', opts.preset ?? 'fast', '-crf', String(opts.crf ?? 23),
      '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
      '-movflags', '+faststart',
      '-max_muxing_queue_size', '2048',
      output,
    ],
    opts,
  );
}

/** VP9 WebM, CRF 34 (constant quality), <=1080p, Opus 96k. */
export async function transcodeWebm(input: string, output: string, opts: TranscodeOptions = {}): Promise<void> {
  await ffmpeg(
    [
      '-i', input,
      '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn',
      '-vf', scaleShortSide(opts.maxShortSide ?? 1080),
      '-c:v', 'libvpx-vp9', '-crf', String(opts.crf ?? 34), '-b:v', '0',
      '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-pix_fmt', 'yuv420p',
      '-c:a', 'libopus', '-b:a', '96k', '-ac', '2', '-ar', '48000',
      '-max_muxing_queue_size', '2048',
      output,
    ],
    opts,
  );
}

/** A good default poster time: a quarter in, at most 5s (first frames are often black). */
export function posterTime(durationSec: number | null | undefined): number {
  if (!durationSec || durationSec <= 0) return 0;
  return Math.max(0, Math.min(durationSec * 0.25, 5));
}

/** Grab one frame as PNG. */
export async function extractFrame(input: string, outputPng: string, atSec = 0, opts: RunOptions = {}): Promise<void> {
  const args = ['-ss', atSec.toFixed(3), '-i', input, '-frames:v', '1', '-an', outputPng];
  try {
    await ffmpeg(args, { timeoutMs: 120_000, ...opts });
  } catch (err) {
    if (atSec === 0) throw err;
    // Seeking past the last keyframe of a very short clip can fail; fall back to the first frame.
    await ffmpeg(['-i', input, '-frames:v', '1', '-an', outputPng], { timeoutMs: 120_000, ...opts });
  }
}

/** Poster frame as WebP (default 1280 wide, never upscaled). Returns the output size. */
export async function poster(
  input: string,
  outputWebp: string,
  opts: RunOptions & { atSec?: number; width?: number; quality?: number } = {},
): Promise<{ width: number; height: number }> {
  const png = join(dirname(outputWebp), `poster-${Date.now()}.png`);
  try {
    await extractFrame(input, png, opts.atSec ?? 0, opts);
    const info = await sharp(png)
      .resize({ width: opts.width ?? 1280, withoutEnlargement: true })
      .webp({ quality: opts.quality ?? 80 })
      .toFile(outputWebp);
    return { width: info.width, height: info.height };
  } finally {
    await rm(png, { force: true });
  }
}

export interface StoryboardResult {
  interval: number;
  columns: number;
  tileWidth: number;
  tileHeight: number;
  count: number;
}

/**
 * Thumbnail sprite for scrubbing: a frame every `interval` seconds, `tileWidth`x`tileHeight`
 * (letterboxed), `columns` per row. Long videos widen the interval to stay under WebP's 16383px.
 * Written as WebP.
 */
export async function storyboard(
  input: string,
  outputWebp: string,
  opts: RunOptions & { durationSec: number; interval?: number; tileWidth?: number; tileHeight?: number; columns?: number },
): Promise<StoryboardResult> {
  const tileWidth = opts.tileWidth ?? 160;
  const tileHeight = opts.tileHeight ?? 90;
  const maxColumns = opts.columns ?? 10;
  const maxRows = Math.floor(16_000 / tileHeight);
  let interval = opts.interval ?? 10;
  const duration = Math.max(0.1, opts.durationSec);
  while (Math.ceil(Math.ceil(duration / interval) / maxColumns) > maxRows) interval += 10;
  const count = Math.max(1, Math.ceil(duration / interval));
  // Short clips get a narrower sprite instead of empty tiles.
  const columns = Math.min(maxColumns, count);
  const rows = Math.max(1, Math.ceil(count / columns));
  const png = join(dirname(outputWebp), `storyboard-${Date.now()}.png`);
  const vf = [
    `fps=1/${interval}`,
    `scale=${tileWidth}:${tileHeight}:force_original_aspect_ratio=decrease`,
    `pad=${tileWidth}:${tileHeight}:(ow-iw)/2:(oh-ih)/2:color=black`,
    `tile=${columns}x${rows}`,
  ].join(',');
  try {
    // Long recordings: decode keyframes only (OBS sends one every ~2s), which is many times faster.
    const fast = duration > 600 ? ['-skip_frame', 'nokey'] : [];
    await ffmpeg([...fast, '-i', input, '-an', '-sn', '-vf', vf, '-frames:v', '1', '-fps_mode', 'passthrough', png], opts);
    await sharp(png).webp({ quality: 70 }).toFile(outputWebp);
  } finally {
    await rm(png, { force: true });
  }
  return { interval, columns, tileWidth, tileHeight, count };
}

/* ---------------------------------------------------------------------------- stream copy */

/** Concatenate files with the concat demuxer (stream copy, no re-encode). Output gets faststart. */
export async function concatCopy(files: string[], output: string, opts: RunOptions = {}): Promise<void> {
  if (!files.length) throw new Error('concatCopy needs at least one file');
  const list = join(dirname(output), `concat-${Date.now()}.txt`);
  await writeFile(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n') + '\n', 'utf8');
  try {
    await ffmpeg(
      ['-f', 'concat', '-safe', '0', '-i', list, '-map', '0:v?', '-map', '0:a?', '-c', 'copy', '-movflags', '+faststart', output],
      opts,
    );
  } finally {
    await rm(list, { force: true });
  }
}

/**
 * Cut `[startSec, endSec]` out of `input` without re-encoding. Cuts snap to keyframes, which is
 * fine for livestream recordings (OBS keyframes every ~2s).
 */
export async function trimCopy(input: string, startSec: number, endSec: number, output: string, opts: RunOptions = {}): Promise<void> {
  const start = Math.max(0, startSec);
  if (!(endSec > start)) throw new Error(`trimCopy: end (${endSec}) must be after start (${start})`);
  await ffmpeg(
    [
      '-ss', start.toFixed(3), '-to', endSec.toFixed(3), '-i', input,
      '-map', '0:v?', '-map', '0:a?', '-c', 'copy',
      '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart',
      output,
    ],
    opts,
  );
}

/** Re-mux into a progressive MP4 with the moov atom up front (stream copy). */
export async function remuxFaststart(input: string, output: string, opts: RunOptions = {}): Promise<void> {
  await ffmpeg(['-i', input, '-map', '0:v?', '-map', '0:a?', '-c', 'copy', '-movflags', '+faststart', output], opts);
}

/** Decode anything ffmpeg can read (e.g. HEIC when libvips can't) into a PNG still. */
export async function decodeToPng(input: string, outputPng: string, opts: RunOptions = {}): Promise<void> {
  await ffmpeg(['-i', input, '-frames:v', '1', '-an', outputPng], { timeoutMs: 120_000, ...opts });
}
