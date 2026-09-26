import { Logger } from '@nestjs/common';
import { beforeAll, describe, expect, it } from 'vitest';
import { blocksToPlainText } from './blocks.js';
import { sniffBuffer } from './mime.js';
import { likeEscape, paginated, pageToLimitOffset } from './pagination.js';
import { RateLimitService } from './rate-limit.service.js';
import { AllExceptionsFilter } from './exception.filter.js';
import { AppError, notFound, tooManyRequests } from './errors.js';
import { centeredCrop, clampCrop, targetWidths } from '../modules/assets/image-pipeline.js';
import { parseSingleRange } from '../modules/media-serve/media-stream.js';
import { publicMediaKey } from '../modules/media-serve/media-serve.controller.js';
import { clientIp, configureClientIp } from './request.js';
import { stripNul, ZodPipe } from './zod.pipe.js';
import { paginationQuery, speakerListQuery, speakerInput } from '@zemi/shared';
import { z } from 'zod';
import type { Request } from 'express';

describe('blocksToPlainText', () => {
  it('flattens paragraphs, links, lists, tables, captions and nested children', () => {
    const blocks = [
      { type: 'heading', props: { level: 1 }, content: [{ type: 'text', text: 'Robots  that', styles: {} }, { type: 'text', text: ' learn', styles: { bold: true } }], children: [] },
      { type: 'paragraph', content: [{ type: 'link', href: 'https://x.y', content: [{ type: 'text', text: 'paper', styles: {} }] }], children: [{ type: 'bulletListItem', content: 'nested item', children: [] }] },
      { type: 'image', props: { url: 'x', caption: 'Our lab' }, children: [] },
      { type: 'table', content: { type: 'tableContent', rows: [{ cells: [[{ type: 'text', text: 'a' }], { type: 'tableCell', content: [{ type: 'text', text: 'b' }] }] }] }, children: [] },
      { type: 'paragraph', content: [{ type: 'mention', props: { user: 'Rina' } }], children: [] },
      null,
      { type: 'paragraph', content: [], children: [] },
    ];
    expect(blocksToPlainText(blocks as never)).toBe('Robots that learn\npaper\nnested item\nOur lab\na | b\nRina');
  });
  it('handles empty and invalid input', () => {
    expect(blocksToPlainText([])).toBe('');
    expect(blocksToPlainText(null)).toBe('');
    expect(blocksToPlainText('nope' as never)).toBe('');
  });
});

describe('clientIp', () => {
  const req = (headers: Record<string, string>, ip = '::ffff:10.0.0.9') => ({ headers, ip }) as unknown as Request;
  it('prefers the configured header (X-Real-IP by default) over a forgeable X-Forwarded-For', () => {
    configureClientIp('x-real-ip');
    expect(clientIp(req({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '1.2.3.4' }))).toBe('203.0.113.7');
    expect(clientIp(req({}))).toBe('10.0.0.9');
  });
  it('falls back to req.ip when set to none', () => {
    configureClientIp('none');
    expect(clientIp(req({ 'x-real-ip': '203.0.113.7' }))).toBe('10.0.0.9');
    configureClientIp('x-real-ip');
  });
  it('ignores a header value that is not an IP address', () => {
    configureClientIp('x-real-ip');
    for (const bad of ['203.0.113.11330', 'evil', '1.2.3', '', '   ', 'x'.repeat(80), '::ffff:999.1.1.1']) {
      expect(clientIp(req({ 'x-real-ip': bad }))).toBe('10.0.0.9');
    }
    expect(clientIp(req({ 'x-real-ip': ' 198.18.3.4 , 10.1.1.1' }))).toBe('198.18.3.4');
    expect(clientIp(req({ 'x-real-ip': '2001:db8::7' }))).toBe('2001:db8::7');
    expect(clientIp(req({ 'x-real-ip': '::ffff:192.0.2.5' }))).toBe('192.0.2.5');
    // A junk req.ip (misconfigured proxy chain) is refused too.
    expect(clientIp(req({ 'x-real-ip': 'nope' }, 'garbage'))).toBeNull();
  });
});

describe('pagination', () => {
  it('computes limit/offset and clamps', () => {
    expect(pageToLimitOffset({ page: 3, pageSize: 20 })).toEqual({ limit: 20, offset: 40 });
    expect(pageToLimitOffset({ page: 0, pageSize: 1000 })).toEqual({ limit: 100, offset: 0 });
    expect(paginated([1, 2], '7' as unknown as number, { page: 1, pageSize: 2 })).toEqual({ items: [1, 2], total: 7, page: 1, pageSize: 2 });
    expect(likeEscape('50%_off\\')).toBe('50\\%\\_off\\\\');
  });
});

describe('RateLimitService', () => {
  it('allows `limit` hits per window, then reports retryAfter', () => {
    const rl = new RateLimitService();
    const rule = { limit: 3, windowMs: 10_000 };
    const t = 1_000_000;
    expect([1, 2, 3].map(() => rl.hit('k', rule, t).allowed)).toEqual([true, true, true]);
    const over = rl.hit('k', rule, t + 1000);
    expect(over.allowed).toBe(false);
    expect(over.retryAfterSec).toBe(9);
    expect(rl.hit('k', rule, t + 10_001).allowed).toBe(true); // new window
    rl.reset('k');
    expect(rl.peek('k', rule).remaining).toBe(3);
    expect(() => {
      for (let i = 0; i < 5; i++) rl.consume('c', rule);
    }).toThrow();
    rl.onModuleDestroy();
  });
  it('refund gives back one hit in the current window, never below zero', () => {
    const rl = new RateLimitService();
    const rule = { limit: 2, windowMs: 10_000 };
    const t = 2_000_000;
    rl.hit('r', rule, t);
    rl.hit('r', rule, t);
    rl.refund('r', t + 1);
    expect(rl.hit('r', rule, t + 2)).toMatchObject({ allowed: true, count: 2 });
    expect(rl.hit('r', rule, t + 3).allowed).toBe(false);
    rl.refund('missing', t);
    rl.refund('r', t + 20_000); // expired window: nothing to refund
    expect(rl.peek('r', rule, t + 3).count).toBe(3);
    rl.onModuleDestroy();
  });
});

describe('mime sniffing', () => {
  const b = (...parts: Array<string | number[]>) =>
    Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p))));
  it('detects common formats from magic bytes', () => {
    expect(sniffBuffer(b([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe('image/jpeg');
    expect(sniffBuffer(b([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mime).toBe('image/png');
    expect(sniffBuffer(b('RIFF', [0, 0, 0, 0], 'WEBPVP8 '))?.mime).toBe('image/webp');
    expect(sniffBuffer(b([0, 0, 0, 0x18], 'ftypheic', [0, 0, 0, 0], 'mif1heic'))?.mime).toBe('image/heic');
    expect(sniffBuffer(b([0, 0, 0, 0x1c], 'ftypavif', [0, 0, 0, 0], 'avifmif1'))?.mime).toBe('image/avif');
    expect(sniffBuffer(b([0, 0, 0, 0x18], 'ftypisom', [0, 0, 2, 0], 'isomiso2'))?.mime).toBe('video/mp4');
    expect(sniffBuffer(b([0, 0, 0, 0x14], 'ftypqt  ', [0, 0, 0, 0], 'qt  '))?.mime).toBe('video/quicktime');
    expect(sniffBuffer(b([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84], 'webm'))?.mime).toBe('video/webm');
    expect(sniffBuffer(b('%PDF-1.7'))?.kind).toBe('document');
    expect(sniffBuffer(b('ID3', [3, 0]))?.mime).toBe('audio/mpeg');
    expect(sniffBuffer(b('<html>'))).toBeNull();
  });
});

describe('image pipeline math', () => {
  it('targetWidths never upscales and includes the master width', () => {
    expect(targetWidths(3000)).toEqual([320, 480, 640, 960, 1280, 1600, 1920, 2560]);
    expect(targetWidths(1000)).toEqual([320, 480, 640, 960, 1000]);
    expect(targetWidths(640)).toEqual([320, 480, 640]);
    expect(targetWidths(200)).toEqual([200]);
  });
  it('centeredCrop fits the aspect inside the frame', () => {
    expect(centeredCrop(4000, 3000, 4 / 5)).toEqual({ x: 800, y: 0, width: 2400, height: 3000, rotation: 0 });
    expect(centeredCrop(1000, 3000, 1)).toEqual({ x: 0, y: 1000, width: 1000, height: 1000, rotation: 0 });
  });
  it('clampCrop keeps crops inside the image', () => {
    expect(clampCrop({ x: -5, y: 10.4, width: 5000, height: 50, rotation: 0 }, 800, 600)).toEqual({ x: 0, y: 10, width: 800, height: 50, rotation: 0 });
  });
});

describe('media keys and ranges', () => {
  it('only serves processed files under assets/', () => {
    expect(publicMediaKey(['assets', 'a1', 'w320.webp'])).toBe('assets/a1/w320.webp');
    expect(publicMediaKey('assets/a1/original.pdf')).toBe('assets/a1/original.pdf');
    expect(publicMediaKey('assets/a1/original.jpg')).toBeNull();
    expect(publicMediaKey('assets/a1/original.MOV')).toBeNull();
    expect(publicMediaKey('segments/x.mp4')).toBeNull();
    expect(publicMediaKey('assets/../secrets')).toBeNull();
    expect(publicMediaKey('assets//x')).toBeNull();
    // NUL and control bytes are refused before S3 sees them (it answers those with a 500).
    expect(publicMediaKey('assets/a1/w320.webp\u0000')).toBeNull();
    expect(publicMediaKey('assets/a1/original.jpg\u0000.webp')).toBeNull();
    expect(publicMediaKey('assets/a1/w320\n.webp')).toBeNull();
    expect(publicMediaKey('assets/a1\\w320.webp')).toBeNull();
  });
  it('forwards a single well-formed range only', () => {
    expect(parseSingleRange('bytes=0-99')).toBe('bytes=0-99');
    expect(parseSingleRange('bytes=100-')).toBe('bytes=100-');
    expect(parseSingleRange('bytes=-500')).toBe('bytes=-500');
    expect(parseSingleRange('bytes=0-1,5-9')).toBeUndefined();
    expect(parseSingleRange('bytes=9-1')).toBeUndefined();
    expect(parseSingleRange(undefined)).toBeUndefined();
  });
});

describe('AllExceptionsFilter', () => {
  beforeAll(() => Logger.overrideLogger(false));
  function run(err: unknown) {
    const res = {
      headersSent: false,
      statusCode: 0,
      body: undefined as unknown,
      headers: {} as Record<string, string>,
      setHeader(k: string, v: string) {
        this.headers[k] = v;
      },
      removeHeader() {},
      status(c: number) {
        this.statusCode = c;
        return this;
      },
      json(b: unknown) {
        this.body = b;
      },
      end() {},
    };
    const host = {
      getType: () => 'http',
      switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ method: 'GET', originalUrl: '/x' }) }),
    };
    new AllExceptionsFilter().catch(err, host as never);
    return res;
  }
  it('keeps AppError bodies and headers', () => {
    const r = run(tooManyRequests(30));
    expect(r.statusCode).toBe(429);
    expect(r.headers['Retry-After']).toBe('30');
    expect(r.body).toMatchObject({ error: { code: 'rate_limited' } });
    expect(run(notFound('Nope.')).body).toEqual({ error: { code: 'not_found', message: 'Nope.' } });
  });
  it('maps Postgres unique violations (wrapped by drizzle) to 409', () => {
    const pg = Object.assign(new Error('duplicate key'), { name: 'PostgresError', code: '23505', constraint_name: 'speakers_slug_unique' });
    const wrapped = Object.assign(new Error('Failed query'), { cause: pg });
    const r = run(wrapped);
    expect(r.statusCode).toBe(409);
    expect(r.body).toMatchObject({ error: { code: 'conflict', details: { constraint: 'speakers_slug_unique' } } });
  });
  it('maps NUL bytes (22021, 22P05) and numbers out of range (22003) to a 400', () => {
    for (const code of ['22021', '22P05', '22003']) {
      const pg = Object.assign(new Error('invalid byte sequence'), { name: 'PostgresError', code });
      const r = run(Object.assign(new Error('Failed query'), { cause: pg }));
      expect(r.statusCode).toBe(400);
      expect(r.body).toMatchObject({ error: { code: 'validation' } });
      expect(JSON.stringify(r.body)).not.toMatch(/[\u2013\u2014]/);
    }
  });
  it('hides unknown errors behind a 500', () => {
    const r = run(new Error('secret internals'));
    expect(r.statusCode).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('secret');
  });
});

describe('NUL bytes in input', () => {
  it('strips them from nested strings and keys, keeping untouched values as the same reference', () => {
    const clean = { a: 'x', list: ['y'] };
    expect(stripNul(clean)).toBe(clean);
    const dirty = { search: 'a\u0000b', nested: { deep: ['c\u0000', 1, null, true] }, 'k\u0000ey': 'v' };
    expect(stripNul(dirty)).toEqual({ search: 'ab', nested: { deep: ['c', 1, null, true] }, key: 'v' });
    // The caller's object is not mutated.
    expect(dirty.search).toBe('a\u0000b');
    // Null-prototype objects (Express 5 query strings, multer bodies) are walked too.
    const query = Object.assign(Object.create(null) as Record<string, unknown>, { search: '\u0000\u0000hi' });
    expect(stripNul(query)).toEqual({ search: 'hi' });
  });

  it('leaves Dates, buffers and class instances alone', () => {
    const d = new Date(0);
    const buf = Buffer.from('a\u0000b');
    class Thing {
      label = 'x\u0000';
    }
    const t = new Thing();
    expect(stripNul(d)).toBe(d);
    expect(stripNul(buf)).toBe(buf);
    expect(stripNul(t)).toBe(t);
  });

  it('ZodPipe parses searches with NUL instead of passing them to Postgres', () => {
    const q = new ZodPipe(speakerListQuery).transform({ search: 'rin\u0000a', page: '2' });
    expect(q.search).toBe('rina');
    expect(q.page).toBe(2);
    const body = new ZodPipe(speakerInput).transform({
      slug: 'rina',
      fullName: 'Rina\u0000 S',
      bio: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi\u0000' }] }],
    });
    expect(body.fullName).toBe('Rina S');
    expect(JSON.stringify(body.bio)).not.toContain('\\u0000');
    // Still a 400 for real validation problems.
    expect(() => new ZodPipe(paginationQuery.extend({ q: z.string().min(2) })).transform({ q: '\u0000a' })).toThrow(AppError);
  });
});
