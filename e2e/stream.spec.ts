/**
 * @stream The whole livestream loop against the real MediaMTX: OBS-like ffmpeg push, preview, Go live,
 * public HLS (playlist + a segment), End, the stitched recording, and the recording on the event page.
 * Slow by nature (the push runs 45 s, stitching can take a few minutes).
 */
import type { EventDetail, StreamConfig, StreamSessionAdmin } from '../packages/shared/dist/index';
import { API_URL, expect, gotoStable, pushTestStream, relativeWindow, skipSiteLoader, snap, StopWaiting, streamConfig, test, waitFor, watchPage, type FfmpegRun } from './helpers';

const PUSH_SECONDS = 45;
/** Live at least this long before End, so the recording check means something. */
const MIN_LIVE_MS = 18_000;

/** Non-comment lines and URI="..." attributes of an m3u8, resolved against its URL. */
function playlistUris(text: string, base: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim();
    if (!l) continue;
    if (l.startsWith('#')) {
      for (const m of l.matchAll(/URI="([^"]+)"/g)) out.push(new URL(m[1]!, base).toString());
    } else out.push(new URL(l, base).toString());
  }
  return out;
}

test('@stream push, preview, go live, public HLS, end, recording on the event page', async ({ page, admin, data, publicApi, request }) => {
  test.setTimeout(9 * 60_000);
  // Happening now by the clock (a future event with an ended stream shows the scheduled page instead).
  // Unlisted: works by link, stays out of the public lists and /live while the test runs.
  const ev = await data.event({ kind: 'stream', visibility: 'unlisted', ...relativeWindow(-30, 90) });
  const cfg = await streamConfig(admin, ev.id);
  expect(cfg.state).toBe('idle');
  expect(cfg.obs?.obsStreamKey).toContain('?key=');
  const hls = `${API_URL}/api/v1/public/live/${ev.id}/index.m3u8`;

  // Nothing is public before Go live.
  const early = await request.get(hls, { failOnStatusCode: false });
  expect(early.status()).toBe(404);

  let push: FfmpegRun | null = pushTestStream(cfg.obs!.obsStreamKey, PUSH_SECONDS);
  try {
    const preview = await waitFor(
      async () => {
        if (push!.proc.exitCode !== null) throw new StopWaiting(`ffmpeg exited early: ${push!.stderr()}`);
        const s = await streamConfig(admin, ev.id);
        return s.state === 'preview' && s.ingestOnline ? s : null;
      },
      { timeout: 30_000, interval: 1_000, message: 'the stream to reach preview (OBS connected)' },
    );
    expect(preview.ingestOnline).toBe(true);
    // Still private in preview.
    expect((await request.get(hls, { failOnStatusCode: false })).status()).toBe(404);

    const live = await admin.post<StreamConfig>(`/admin/events/${ev.id}/stream/live`);
    expect(live.state).toBe('live');
    expect(live.currentSessionId).toBeTruthy();

    const detail = await publicApi.get<EventDetail>(`/public/events/${ev.slug}`);
    expect(detail.stream.state).toBe('live');
    expect(detail.stream.hlsUrl).toBe(hls);

    // Public HLS: master, then a media playlist, then one segment.
    const master = await waitFor(
      async () => {
        const r = await request.get(hls, { failOnStatusCode: false });
        return r.status() === 200 ? r : null;
      },
      { timeout: 30_000, message: 'the public master playlist' },
    );
    expect(master.headers()['content-type']).toContain('mpegurl');
    // SPEC 9: playlists cached 1 s, segments 60 s, open to any origin.
    expect(master.headers()['cache-control']).toContain('max-age=1');
    expect(master.headers()['access-control-allow-origin']).toBe('*');
    const masterText = await master.text();
    expect(masterText).toContain('#EXTM3U');
    const media = playlistUris(masterText, hls).find((u) => new URL(u).pathname.endsWith('.m3u8'));
    expect(media, `a media playlist in:\n${masterText}`).toBeTruthy();
    const mediaText = await waitFor(
      async () => {
        const r = await request.get(media!, { failOnStatusCode: false });
        const t = r.status() === 200 ? await r.text() : '';
        return playlistUris(t, media!).some((u) => /\.(mp4|m4s|ts)$/.test(new URL(u).pathname)) ? t : null;
      },
      { timeout: 30_000, message: 'a media playlist with segments' },
    );
    const segUrl = playlistUris(mediaText, media!).filter((u) => /\.(mp4|m4s|ts)$/.test(new URL(u).pathname)).pop()!;
    const seg = await request.get(segUrl, { failOnStatusCode: false });
    expect(seg.status(), segUrl).toBe(200);
    expect(seg.headers()['content-type']).toMatch(/video\/mp4|video\/mp2t|video\/iso.segment/);
    expect((await seg.body()).byteLength).toBeGreaterThan(1_000);
    expect(seg.headers()['cache-control']).toContain('max-age=60');

    // The event page is on the live stage.
    const watch = watchPage(page);
    await skipSiteLoader(page);
    await gotoStable(page, `/events/${ev.slug}`);
    await expect(page.locator('[data-event-status="ongoing"]')).toBeVisible();
    await expect(page.locator('video').first()).toBeAttached({ timeout: 30_000 });
    await snap(page, 'live-stage');
    // Stop playing it here: a headless player decoding HLS competes with the encoder for CPU.
    await page.goto('about:blank');

    // Stay live long enough for a recording worth checking (the push runs 45 s in total).
    const liveFor = Date.now() - Date.parse(live.liveStartedAt!);
    if (liveFor < MIN_LIVE_MS) await page.waitForTimeout(MIN_LIVE_MS - liveFor);
    const ended = await admin.post<StreamConfig>(`/admin/events/${ev.id}/stream/end`);
    expect(ended.state).toBe('ended');
    const windowSec = (Date.parse(ended.liveEndedAt!) - Date.parse(live.liveStartedAt!)) / 1000;
    expect((await request.get(hls, { failOnStatusCode: false })).status()).toBe(404);

    // Let the push run out (OBS stopping after End is the normal order), so the last segment uploads.
    const code = await Promise.race([push.exited, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), (PUSH_SECONDS + 30) * 1000))]);
    expect(code, push.stderr()).not.toBe('timeout');
    push = null;

    const recording = await waitFor(
      async () => {
        const recs = await admin.get<StreamSessionAdmin[]>(`/admin/events/${ev.id}/recordings`);
        const r = recs[0];
        if (r && (r.recordingStatus === 'failed' || r.recordingStatus === 'none')) throw new StopWaiting(`recording ${r.recordingStatus}: ${r.error}`);
        return r && r.recordingStatus === 'ready' ? r : null;
      },
      // The API waits up to 4 minutes after End for holes to fill (late uploads), then stitches.
      { timeout: 5 * 60_000, interval: 5_000, message: 'the recording to be ready' },
    );
    expect(recording.video).toBeTruthy();
    // Trimmed to [Go live, End], snapped to keyframes (2 s GOP), so within a few seconds of the live window.
    expect(recording.durationSec ?? 0, `recording length vs a ${windowSec.toFixed(1)} s live window`).toBeGreaterThan(windowSec - 3);
    expect(recording.durationSec ?? 0, `recording length vs a ${windowSec.toFixed(1)} s live window`).toBeLessThan(windowSec + 5);
    expect(recording.visibility).toBe('public');

    // The recording shows on the event page (the API revalidates the page when it is ready).
    await expect
      .poll(
        async () => {
          await gotoStable(page, `/events/${ev.slug}`);
          return page.locator('#recording').count();
        },
        { timeout: 90_000, intervals: [2_000, 5_000, 10_000], message: 'the recording section on the event page' },
      )
      .toBeGreaterThan(0);
    await expect(page.getByText('Recording is up').first()).toBeVisible();
    await expect(page.locator('#recording video').first()).toBeAttached();
    await page.locator('#recording').scrollIntoViewIfNeeded();
    await snap(page, 'recording');
    const after = await publicApi.get<EventDetail>(`/public/events/${ev.slug}`);
    expect(after.recordings.length).toBeGreaterThan(0);
    await page.waitForTimeout(2_000);
    watch.expectClean();
  } finally {
    if (push) await push.stop();
  }
});
