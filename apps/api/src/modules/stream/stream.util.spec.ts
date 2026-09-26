import { describe, expect, it } from 'vitest';
import { ByteLru } from './byte-lru.js';
import { chaptersFor } from './recordings.service.js';
import { describeTracks } from './stream.service.js';
import { hasMediaSecret } from './media-secret.guard.js';
import {
  bitrateFromSamples,
  coverageGaps,
  isSafeHlsPath,
  keptSeconds,
  newPrivateKey,
  newStreamKey,
  parseDurationSec,
  parseLivePath,
  parseSegmentFilename,
  planCuts,
  pushSample,
  queryParam,
  rewritePlaylist,
  segmentsCover,
  STREAM_KEY_RE,
} from './stream.util.js';

describe('keys and paths', () => {
  it('makes keys in the SPEC shape', () => {
    expect(newStreamKey()).toMatch(STREAM_KEY_RE);
    expect(newPrivateKey()).toMatch(/^[0-9A-Za-z]{32}$/);
    expect(newStreamKey()).not.toBe(newStreamKey());
  });

  it('parses live paths only', () => {
    expect(parseLivePath('live/zmABC')).toBe('zmABC');
    expect(parseLivePath('/live/zmABC')).toBe('zmABC');
    expect(parseLivePath('live/zm/x')).toBeNull();
    expect(parseLivePath('other/zm')).toBeNull();
    expect(parseLivePath('live/external:123')).toBeNull();
    expect(parseLivePath('')).toBeNull();
  });

  it('reads the private key from the RTMP query', () => {
    expect(queryParam('key=abc', 'key')).toBe('abc');
    expect(queryParam('?x=1&key=a%2Bb', 'key')).toBe('a+b');
    expect(queryParam('', 'key')).toBeNull();
  });
});

describe('segment filenames and durations', () => {
  it('parses MediaMTX filenames as UTC', () => {
    expect(parseSegmentFilename('2026-10-02_06-15-00-123456.mp4')?.toISOString()).toBe('2026-10-02T06:15:00.123Z');
    expect(parseSegmentFilename('2026-02-31_06-15-00-000000.mp4')).toBeNull();
    expect(parseSegmentFilename('../../etc/passwd')).toBeNull();
    expect(parseSegmentFilename('2026-10-02_06-15-00.mp4')).toBeNull();
  });

  it('reads plain seconds and Go durations', () => {
    expect(parseDurationSec('60.021')).toBeCloseTo(60.021);
    expect(parseDurationSec('1m0.5s')).toBeCloseTo(60.5);
    expect(parseDurationSec('500ms')).toBeCloseTo(0.5);
    expect(parseDurationSec('1h2m3s')).toBe(3723);
    expect(parseDurationSec('')).toBeNull();
    expect(parseDurationSec('abc')).toBeNull();
    expect(parseDurationSec('0')).toBeNull();
  });
});

describe('HLS proxy helpers', () => {
  it('only allows plain HLS files', () => {
    expect(isSafeHlsPath('index.m3u8')).toBe(true);
    expect(isSafeHlsPath('969ee17b5509_video1_seg6.mp4')).toBe(true);
    expect(isSafeHlsPath('../other/index.m3u8')).toBe(false);
    expect(isSafeHlsPath('a//b.m3u8')).toBe(false);
    expect(isSafeHlsPath('a/./b.m3u8')).toBe(false);
    expect(isSafeHlsPath('index.html')).toBe(false);
    expect(isSafeHlsPath('%2e%2e/index.m3u8')).toBe(false);
    expect(isSafeHlsPath('')).toBe(false);
  });

  it('appends pt to URI lines and URI attributes', () => {
    const body = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio2_stream.m3u8"',
      '#EXT-X-MAP:URI="abc_video1_init.mp4"',
      '#EXTINF:2.00000,',
      'abc_video1_seg6.mp4',
      'x.m3u8?a=1',
      'https://elsewhere.example/seg.mp4',
      '',
    ].join('\n');
    const out = rewritePlaylist(body, 'tok.en');
    expect(out).toContain('URI="audio2_stream.m3u8?pt=tok.en"');
    expect(out).toContain('URI="abc_video1_init.mp4?pt=tok.en"');
    expect(out).toContain('\nabc_video1_seg6.mp4?pt=tok.en\n');
    expect(out).toContain('\nx.m3u8?a=1&pt=tok.en\n');
    expect(out).toContain('\nhttps://elsewhere.example/seg.mp4\n');
    expect(out.startsWith('#EXTM3U\n')).toBe(true);
  });
});

describe('bitrate samples', () => {
  it('computes kbps over the window and resets on a counter drop', () => {
    let s = pushSample([], { t: 0, bytes: 0 });
    expect(bitrateFromSamples(s)).toBeNull();
    s = pushSample(s, { t: 2000, bytes: 500_000 });
    expect(bitrateFromSamples(s)).toBe(2000);
    s = pushSample(s, { t: 3000, bytes: 100 });
    expect(s).toHaveLength(1);
    s = pushSample(s, { t: 60_000, bytes: 200 });
    s = pushSample(s, { t: 90_000, bytes: 300 });
    expect(s.every((x) => x.t >= 70_000)).toBe(true);
  });
});

describe('recording cuts', () => {
  const t0 = Date.parse('2026-10-02T06:00:00Z');
  const seg = (id: string, startSec: number, dur = 60) => ({ id, startedAt: new Date(t0 + startSec * 1000), durationSec: dur });

  it('trims the edges and keeps the middle whole', () => {
    const plans = planCuts([seg('c', 120), seg('a', 0), seg('b', 60)], new Date(t0 + 30_000), new Date(t0 + 150_000));
    expect(plans.map((p) => [p.segment.id, p.from, p.to])).toEqual([
      ['a', 30, null],
      ['b', 0, null],
      ['c', 0, 30],
    ]);
  });

  it('cuts one segment on both sides and ignores gaps', () => {
    expect(planCuts([seg('a', 0)], new Date(t0 + 10_000), new Date(t0 + 20_000)).map((p) => [p.from, p.to])).toEqual([[10, 20]]);
    // OBS dropped between 60s and 200s: each side is cut by its own clock.
    const plans = planCuts([seg('a', 0), seg('b', 200)], new Date(t0 + 30_000), new Date(t0 + 230_000));
    expect(plans.map((p) => [p.segment.id, p.from, p.to])).toEqual([
      ['a', 30, null],
      ['b', 0, 30],
    ]);
  });

  it('pulls a late-named first segment back onto the next one', () => {
    // Real run: first file named 16:36:52.361 with 60.021s, second named 16:37:50.335.
    const a = { id: 'a', startedAt: new Date('2026-09-25T16:36:52.361Z'), durationSec: 60.021 };
    const b = { id: 'b', startedAt: new Date('2026-09-25T16:37:50.335Z'), durationSec: 60.011 };
    const plans = planCuts([a, b], new Date('2026-09-25T16:37:31.736Z'), new Date('2026-09-25T16:38:00.000Z'));
    // 16:37:31.736 is 41.4s into a (which really started at 16:36:50.314), not 39.4s.
    expect(plans[0]!.from).toBeCloseTo(41.422, 2);
    expect(plans[1]!.to).toBeCloseTo(9.665, 2);
  });

  it('drops slivers and knows when the end is covered', () => {
    expect(planCuts([seg('a', 0), seg('b', 60)], new Date(t0 + 59_800), new Date(t0 + 90_000)).map((p) => p.segment.id)).toEqual(['b']);
    expect(segmentsCover([seg('a', 0), seg('b', 60)], new Date(t0 + 119_500))).toBe(true);
    expect(segmentsCover([seg('a', 0)], new Date(t0 + 90_000))).toBe(false);
  });

  it('finds holes a late upload could still fill', () => {
    const start = new Date(t0 + 30_000);
    const end = new Date(t0 + 230_000);
    expect(coverageGaps([seg('a', 0), seg('b', 60), seg('c', 120), seg('d', 180)], start, end)).toEqual([]);
    // b never arrived: one hole from 60s to 120s.
    expect(coverageGaps([seg('a', 0), seg('c', 120), seg('d', 180)], start, end).map((g) => [g.from.getTime() - t0, g.to.getTime() - t0])).toEqual([
      [60_000, 120_000],
    ]);
    // The end isn't there yet, and a 2s wobble between files is not a hole.
    expect(coverageGaps([seg('a', 0), seg('b', 62)], start, end).map((g) => [g.from.getTime() - t0, g.to.getTime() - t0])).toEqual([[122_000, 230_000]]);
    expect(coverageGaps([], start, end)).toHaveLength(1);
  });

  it('adds up what the cuts keep', () => {
    const plans = planCuts([seg('a', 0), seg('b', 60), seg('c', 120)], new Date(t0 + 30_000), new Date(t0 + 150_000));
    expect(keptSeconds(plans)).toBeCloseTo(120, 5);
  });
});

describe('chapters from the rundown', () => {
  it('maps WIB rundown times onto the recording', () => {
    const eventStart = new Date('2026-10-02T06:15:00Z'); // 13:15 WIB
    const recStart = new Date('2026-10-02T06:16:00Z');
    const ch = chaptersFor(
      [
        { time: '13:15', agenda: 'Doors and coffee' },
        { time: '13:30', agenda: 'Talk one' },
        { time: '16:00', agenda: 'After the recording' },
        { time: 'bad', agenda: 'Ignored' },
      ],
      eventStart,
      recStart,
      3600,
    );
    expect(ch).toEqual([
      { title: 'Doors and coffee', startSec: 0 },
      { title: 'Talk one', startSec: 840 },
    ]);
  });
});

describe('MediaMTX track mapping', () => {
  it('reads tracks2 codec props', () => {
    expect(
      describeTracks({
        name: 'live/x',
        tracks2: [
          { codec: 'H264', codecProps: { width: 1280, height: 720, profile: 'High' } },
          { codec: 'MPEG-4 Audio', codecProps: { sampleRate: 48000, channelCount: 2 } },
        ],
      }),
    ).toEqual({
      video: { codec: 'H264', width: 1280, height: 720 },
      audio: { codec: 'MPEG-4 Audio', sampleRate: 48000, channels: 2 },
    });
    expect(describeTracks({ name: 'live/x', tracks: ['H264'] })).toEqual({ video: { codec: 'H264', width: null, height: null }, audio: null });
  });
});

describe('media secret check', () => {
  const secret = 'dev-media-secret';
  const basic = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;
  it('accepts the header, bearer and basic', () => {
    expect(hasMediaSecret({ 'x-media-secret': secret }, secret)).toBe(true);
    expect(hasMediaSecret({ authorization: `Bearer ${secret}` }, secret)).toBe(true);
    expect(hasMediaSecret({ authorization: basic('mediamtx', secret) }, secret)).toBe(true);
  });
  it('rejects everything else', () => {
    expect(hasMediaSecret({}, secret)).toBe(false);
    expect(hasMediaSecret({ 'x-media-secret': 'nope' }, secret)).toBe(false);
    expect(hasMediaSecret({ authorization: 'Bearer nope' }, secret)).toBe(false);
    expect(hasMediaSecret({ authorization: basic('mediamtx', 'nope') }, secret)).toBe(false);
    expect(hasMediaSecret({ authorization: basic('', '') }, secret)).toBe(false);
  });
});

describe('ByteLru', () => {
  const entry = (n: number, ttl = 1000) => ({ body: Buffer.alloc(n), contentType: 'x', expiresAt: Date.now() + ttl });
  it('evicts the least recently used past the byte budget and honours expiry', () => {
    const lru = new ByteLru(100, 60);
    lru.set('a', entry(40));
    lru.set('b', entry(40));
    lru.get('a');
    lru.set('c', entry(40));
    expect(lru.get('b')).toBeUndefined();
    expect(lru.get('a')).toBeDefined();
    expect(lru.bytes).toBe(80);
    lru.set('big', entry(70));
    expect(lru.get('big')).toBeUndefined();
    lru.set('old', entry(10, -1));
    expect(lru.get('old')).toBeUndefined();
    lru.deletePrefix('a');
    expect(lru.get('a')).toBeUndefined();
  });
});
