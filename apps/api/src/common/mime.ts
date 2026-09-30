import { open } from 'node:fs/promises';
import type { AssetKind, AssetPurpose } from '@zemi/shared';

/**
 * File type detection from magic bytes (never trust the browser's Content-Type alone), plus the
 * purpose -> allowed kinds policy for uploads.
 */

export interface SniffResult {
  mime: string;
  ext: string;
  kind: AssetKind;
}

const IMAGE_MIMES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif': 'gif',
};
const VIDEO_MIMES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
};
const AUDIO_MIMES: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/webm': 'weba',
};
const DOC_MIMES: Record<string, string> = { 'application/pdf': 'pdf' };

export const EXT_BY_MIME: Record<string, string> = { ...IMAGE_MIMES, ...VIDEO_MIMES, ...AUDIO_MIMES, ...DOC_MIMES };

export function kindOfMime(mime: string): AssetKind | null {
  if (mime in IMAGE_MIMES) return 'image';
  if (mime in VIDEO_MIMES) return 'video';
  if (mime in AUDIO_MIMES) return 'audio';
  if (mime in DOC_MIMES) return 'document';
  return null;
}

function result(mime: string): SniffResult | null {
  const kind = kindOfMime(mime);
  const ext = EXT_BY_MIME[mime];
  return kind && ext ? { mime, ext, kind } : null;
}

/** Detect the type of a buffer holding at least the first ~64 bytes of a file. */
export function sniffBuffer(buf: Buffer): SniffResult | null {
  const at = (offset: number, bytes: number[]) => bytes.every((b, i) => buf[offset + i] === b);
  const ascii = (offset: number, len: number) => buf.subarray(offset, offset + len).toString('latin1');

  if (at(0, [0xff, 0xd8, 0xff])) return result('image/jpeg');
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return result('image/png');
  if (ascii(0, 4) === 'GIF8') return result('image/gif');
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return result('image/webp');
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return result('audio/wav');
  if (ascii(0, 5) === '%PDF-') return result('application/pdf');
  if (ascii(0, 4) === 'OggS') return result('audio/ogg');
  if (ascii(0, 4) === 'fLaC') return result('audio/flac');
  if (ascii(0, 3) === 'ID3' || (buf[0] === 0xff && ((buf[1] ?? 0) & 0xe0) === 0xe0 && ((buf[1] ?? 0) & 0x06) !== 0)) {
    return result('audio/mpeg');
  }
  if (at(0, [0x1a, 0x45, 0xdf, 0xa3])) {
    // EBML: the DocType string sits in the header.
    const head = ascii(0, Math.min(buf.length, 64));
    return result(head.includes('webm') ? 'video/webm' : 'video/x-matroska');
  }
  if (ascii(4, 4) === 'ftyp') {
    const major = ascii(8, 4);
    const brands = [major];
    const boxSize = buf.readUInt32BE(0);
    for (let o = 16; o + 4 <= Math.min(boxSize, buf.length); o += 4) brands.push(ascii(o, 4));
    const has = (...names: string[]) => brands.some((b) => names.includes(b));
    if (major === 'avif' || major === 'avis') return result('image/avif');
    if (has('heic', 'heix', 'heim', 'heis', 'hevc', 'hevx')) return result('image/heic');
    if (major === 'mif1' || major === 'msf1') return result(has('avif') ? 'image/avif' : 'image/heif');
    if (major === 'qt  ') return result('video/quicktime');
    if (major === 'M4A ' || major === 'M4B ') return result('audio/mp4');
    return result('video/mp4');
  }
  return null;
}

/** Read the head of a file and sniff it. */
export async function sniffFile(path: string): Promise<SniffResult | null> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(4096);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    return sniffBuffer(buf.subarray(0, bytesRead));
  } finally {
    await fh.close();
  }
}

/** Which kinds of files each upload purpose accepts. */
export const PURPOSE_KINDS: Record<AssetPurpose, AssetKind[]> = {
  'event-cover': ['image'],
  'speaker-avatar': ['image'],
  'author-avatar': ['image'],
  'team-avatar': ['image'],
  'publication-cover': ['image'],
  documentation: ['image', 'video'],
  'publication-pdf': ['document'],
  recording: ['video', 'audio'],
  editor: ['image', 'video', 'audio', 'document'],
  site: ['image', 'video'],
  bumper: ['image'],
};

const KIND_LABEL: Record<AssetKind, string> = {
  image: 'a photo (JPEG, PNG, WebP, AVIF, HEIC or GIF)',
  video: 'a video (MP4, MOV, WebM or MKV)',
  audio: 'an audio file (MP3, M4A, WAV, OGG or FLAC)',
  document: 'a PDF',
};

/** Friendly "we need X or Y" copy for a purpose. */
export function acceptedLabel(purpose: AssetPurpose): string {
  const kinds = PURPOSE_KINDS[purpose];
  const labels = kinds.map((k) => KIND_LABEL[k]);
  return labels.length <= 1 ? (labels[0] ?? 'a file') : `${labels.slice(0, -1).join(', ')} or ${labels.at(-1)}`;
}

/** Content-Type by file extension, for serving keys whose object has no stored type. */
export function mimeFromKey(key: string): string {
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    avif: 'image/avif',
    webp: 'image/webp',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    heic: 'image/heic',
    heif: 'image/heif',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    m4v: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    weba: 'audio/webm',
    pdf: 'application/pdf',
    vtt: 'text/vtt; charset=utf-8',
    json: 'application/json',
    m3u8: 'application/vnd.apple.mpegurl',
    ts: 'video/mp2t',
    m4s: 'video/iso.segment',
  };
  return map[ext] ?? 'application/octet-stream';
}
