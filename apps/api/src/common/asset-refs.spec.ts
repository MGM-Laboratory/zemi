import { describe, expect, it } from 'vitest';
import { toAssetDto, toFileRef, toImageRef, toVideoRef, type AssetRow } from './asset-refs.js';

const url = (key: string, rev?: string | null) => `https://api.example.com/media/${key}${rev ? `?v=${rev}` : ''}`;

function row(over: Partial<AssetRow>): AssetRow {
  return {
    id: 'a1',
    kind: 'image',
    purpose: 'event-cover',
    status: 'ready',
    error: null,
    originalFilename: 'cover.jpg',
    mime: 'image/jpeg',
    sizeBytes: 1234,
    originalKey: 'assets/a1/original.jpg',
    variants: {},
    width: null,
    height: null,
    durationSec: null,
    lqip: null,
    color: null,
    crop: null,
    adjust: null,
    alt: null,
    caption: null,
    credit: null,
    createdBy: 'admin-1',
    createdAt: new Date('2026-09-25T06:15:00.000Z'),
    updatedAt: new Date('2026-09-25T06:15:00.000Z'),
    ...over,
  };
}

const image = row({
  width: 1600,
  height: 2000,
  alt: 'Friday crowd',
  lqip: 'data:image/webp;base64,xx',
  color: '#3a6dc5',
  variants: {
    rev: 'r1',
    webp: { '1600': 'assets/a1/w1600.webp', '320': 'assets/a1/w320.webp', '960': 'assets/a1/w960.webp' },
    avif: { '960': 'assets/a1/w960.avif', '320': 'assets/a1/w320.avif', '1600': 'assets/a1/w1600.avif' },
  },
});

describe('toImageRef', () => {
  it('builds absolute, width-sorted sources with the cache-busting rev', () => {
    const ref = toImageRef(image, url)!;
    expect(ref.webp.map((s) => s.width)).toEqual([320, 960, 1600]);
    expect(ref.avif.map((s) => s.width)).toEqual([320, 960, 1600]);
    expect(ref.webp[0].url).toBe('https://api.example.com/media/assets/a1/w320.webp?v=r1');
    expect(ref.src).toBe('https://api.example.com/media/assets/a1/w1600.webp?v=r1');
    expect(ref).toMatchObject({ id: 'a1', width: 1600, height: 2000, alt: 'Friday crowd', color: '#3a6dc5' });
  });

  it('is null unless the asset is an image with variants', () => {
    expect(toImageRef(null, url)).toBeNull();
    expect(toImageRef({ ...image, status: 'processing', variants: {} }, url)).toBeNull();
    expect(toImageRef({ ...image, status: 'failed', variants: {} }, url)).toBeNull();
    expect(toImageRef({ ...image, kind: 'video' }, url)).toBeNull();
    expect(toImageRef({ ...image, variants: {} }, url)).toBeNull();
  });

  it('keeps the previous variants while a re-crop is processing or after it failed', () => {
    expect(toImageRef({ ...image, status: 'processing' }, url)?.src).toBe('https://api.example.com/media/assets/a1/w1600.webp?v=r1');
    expect(toImageRef({ ...image, status: 'failed' }, url)?.src).toBe('https://api.example.com/media/assets/a1/w1600.webp?v=r1');
  });
});

describe('toVideoRef', () => {
  const video = row({
    kind: 'video',
    mime: 'video/mp4',
    width: 1920,
    height: 1080,
    durationSec: 25,
    variants: {
      rev: 'r2',
      mp4: 'assets/a1/video.mp4',
      webm: 'assets/a1/video.webm',
      poster: 'assets/a1/poster.webp',
      storyboard: { key: 'assets/a1/storyboard.webp', interval: 10, columns: 3, tileWidth: 160, tileHeight: 90, count: 3 },
    },
  });

  it('maps every variant to an absolute URL', () => {
    const ref = toVideoRef(video, url)!;
    expect(ref.mp4).toBe('https://api.example.com/media/assets/a1/video.mp4?v=r2');
    expect(ref.webm).toBe('https://api.example.com/media/assets/a1/video.webm?v=r2');
    expect(ref.poster).toBe('https://api.example.com/media/assets/a1/poster.webp?v=r2');
    expect(ref.hls).toBeNull();
    expect(ref.storyboard).toEqual({
      url: 'https://api.example.com/media/assets/a1/storyboard.webp?v=r2',
      interval: 10,
      columns: 3,
      tileWidth: 160,
      tileHeight: 90,
      count: 3,
    });
    expect(ref).toMatchObject({ width: 1920, height: 1080, durationSec: 25 });
  });

  it('is null for images and unfinished videos', () => {
    expect(toVideoRef(image, url)).toBeNull();
    expect(toVideoRef({ ...video, status: 'processing' }, url)).toBeNull();
  });
});

describe('toFileRef and toAssetDto', () => {
  it('serves documents from their original key', () => {
    const pdf = row({ kind: 'document', mime: 'application/pdf', originalFilename: 'paper.pdf', originalKey: 'assets/a1/original.pdf', variants: { rev: 'r3' } });
    expect(toFileRef(pdf, url)).toEqual({
      id: 'a1',
      url: 'https://api.example.com/media/assets/a1/original.pdf?v=r3',
      filename: 'paper.pdf',
      mime: 'application/pdf',
      sizeBytes: 1234,
    });
    expect(toFileRef(image, url)).toBeNull();
  });

  it('admin dto points originals at the private admin route', () => {
    const dto = toAssetDto(image, url);
    expect(dto.originalUrl).toBe('/api/v1/admin/assets/a1/original');
    expect(dto.image?.src).toContain('/media/assets/a1/w1600.webp');
    expect(dto.video).toBeNull();
    expect(dto.file).toBeNull();
    expect(dto.createdAt).toBe('2026-09-25T06:15:00.000Z');
  });
});
