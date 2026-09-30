import type {
  BumperGeneratePreview,
  BumperLiveState,
  BumperOutputLinks,
  BumperPublicShow,
  BumperShowDetail,
  BumperShowRow,
  Paginated,
} from '../packages/shared/dist/index';
import { Api, expect, gotoStable, isolateRateLimits, loginThroughForm, newApiContext, relativeWindow, test, watchPage } from './helpers';

/**
 * Bumpers: generate a show from an event, edit it with optimistic concurrency, drive playback
 * from the admin API and from the dock key, and check that the OBS output page (no session)
 * follows along. Shows cascade with their e2e event, so cleanup is the event's.
 */

async function eventWithLineup(data: import('./helpers').DataFactory, admin: Api) {
  const [a, b, mod] = await Promise.all([data.speaker('bump-a'), data.speaker('bump-b'), data.speaker('bump-mod')]);
  const ev = await data.event({ kind: 'bumpers', visibility: 'unlisted', ...relativeWindow(-30, 90) });
  await admin.put(`/admin/events/${ev.id}/speakers`, {
    speakers: [
      { speakerId: a.id, role: 'speaker', talkTitle: 'Teaching tiny models to say I do not know' },
      { speakerId: b.id, role: 'speaker', talkTitle: 'Counting rice fields from space' },
      { speakerId: mod.id, role: 'moderator' },
    ],
  });
  await admin.put(`/admin/events/${ev.id}/rundown`, {
    items: [
      { time: '13:15', agenda: 'Doors open and welcome' },
      { time: '13:20', agenda: 'Opening remarks', speakerId: mod.id },
      { time: '13:30', agenda: 'Teaching tiny models', speakerId: a.id },
      { time: '14:00', agenda: 'Counting rice fields', speakerId: b.id },
      { time: '14:30', agenda: 'Q and A' },
      { time: '14:50', agenda: 'Coffee and networking' },
      { time: '15:10', agenda: 'Group photo and wrap' },
    ],
  });
  return { ev, a, b, mod };
}

test.describe('bumpers', () => {
  test('generate, edit, control and rotate a show', async ({ admin, data, playwright }) => {
    const { ev, a, b, mod } = await eventWithLineup(data, admin);

    const preview = await admin.post<BumperGeneratePreview>('/admin/bumpers/generate', { eventId: ev.id, create: false });
    const kinds = preview.slides.map((s) => s.kind);
    for (const k of ['standby', 'welcome', 'mc', 'speaker', 'thanks-speaker', 'qna', 'break', 'closing'] as const) expect(kinds).toContain(k);
    expect(kinds.filter((k) => k === 'speaker')).toHaveLength(2);
    expect(preview.slides.find((s) => s.kind === 'mc')?.refs.speakerId).toBe(mod.id);
    const speakerOrder = preview.slides.filter((s) => s.kind === 'speaker').map((s) => s.refs.speakerId);
    expect(speakerOrder).toEqual([a.id, b.id]);
    expect(preview.data.events[ev.id]?.title).toBe(ev.title);

    const show = await admin.post<BumperShowDetail>('/admin/bumpers/generate', { eventId: ev.id, create: true });
    expect(show.eventId).toBe(ev.id);
    expect(show.permissions).toEqual(expect.arrayContaining(['run', 'edit']));

    // Listed under the event.
    const list = await admin.get<Paginated<BumperShowRow>>('/admin/bumpers', { eventId: ev.id, status: 'all' });
    expect(list.items.map((r) => r.id)).toContain(show.id);

    // Optimistic concurrency: a stale baseVersion is a 409 version_conflict.
    const renamed = await admin.patch<BumperShowDetail>(`/admin/bumpers/${show.id}`, { baseVersion: show.version, title: `${show.title} (edited)` });
    expect(renamed.version).toBe(show.version + 1);
    const stale = await admin.raw('PATCH', `/admin/bumpers/${show.id}`, { body: { baseVersion: show.version, title: 'Nope' } });
    expect(stale.status()).toBe(409);
    expect(((await stale.json()) as { error: { code: string } }).error.code).toBe('version_conflict');

    // Playback: first, next twice from the same slide moves once (idempotent clickers).
    const first = await admin.post<BumperLiveState>(`/admin/bumpers/${show.id}/live`, { action: 'first' });
    expect(first.position).toBe(0);
    const next = await admin.post<BumperLiveState>(`/admin/bumpers/${show.id}/live`, { action: 'next', fromSlideId: first.slideId });
    const again = await admin.post<BumperLiveState>(`/admin/bumpers/${show.id}/live`, { action: 'next', fromSlideId: first.slideId });
    expect(next.position).toBe(1);
    expect(again.slideId).toBe(next.slideId);
    expect(next.transition).toBeTruthy();
    expect(next.seq).toBeGreaterThan(first.seq);

    // Public output and dock, no session.
    const links = await admin.get<BumperOutputLinks>(`/admin/bumpers/${show.id}/output`);
    const anon = new Api(await newApiContext(playwright));
    const out = await anon.get<BumperPublicShow>(`/public/bumpers/out/${links.outputKey}`);
    expect(out.canControl).toBe(false);
    expect(out.state.slideId).toBe(next.slideId);
    expect(out.slides.every((s) => !s.hidden)).toBe(true);
    // Public-safe: people carry no email fields and nothing about registrants leaks.
    const people = JSON.stringify({ speakers: out.data.speakers, team: out.data.team, publications: out.data.publications });
    expect(people).not.toMatch(/"email"|"phone"|ticket/i);
    expect(JSON.stringify(out)).not.toMatch(/registrations|qrToken|ticketCode/);
    const dock = await anon.post<BumperLiveState>(`/public/bumpers/control/${links.controlKey}`, { action: 'black' });
    expect(dock.mode).toBe('black');
    await anon.post(`/public/bumpers/control/${links.controlKey}`, { action: 'show' });

    // Rotating the links retires the old output key.
    const rotated = await admin.post<BumperOutputLinks>(`/admin/bumpers/${show.id}/output/rotate`, { which: 'both' });
    expect(rotated.outputKey).not.toBe(links.outputKey);
    expect((await anon.raw('GET', `/public/bumpers/out/${links.outputKey}`)).status()).toBe(404);
    expect((await anon.raw('POST', `/public/bumpers/control/${links.controlKey}`, { body: { action: 'next' } })).status()).toBe(404);

    // Archived shows go dark for OBS.
    const archived = await admin.patch<BumperShowDetail>(`/admin/bumpers/${show.id}`, { baseVersion: renamed.version, status: 'archived' });
    expect(archived.status).toBe('archived');
    const gone = await anon.raw('GET', `/public/bumpers/out/${rotated.outputKey}`);
    expect(gone.status()).toBe(404);
    expect(((await gone.json()) as { error: { code: string } }).error.code).toBe('archived');
    await anon.ctx.dispose();
  });

  test('the OBS output page follows the controller', async ({ admin, data, browser }) => {
    const { ev } = await eventWithLineup(data, admin);
    const show = await admin.post<BumperShowDetail>('/admin/bumpers/generate', { eventId: ev.id, create: true, preshow: false });
    const links = await admin.get<BumperOutputLinks>(`/admin/bumpers/${show.id}/output`);
    await admin.post(`/admin/bumpers/${show.id}/live`, { action: 'first' });

    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const watch = watchPage(page, [/EventSource/i, /net::ERR_ABORTED/]);
    await gotoStable(page, new URL(links.outputUrl).pathname);
    const visible = () => page.locator('[data-director] [data-bumper-slide]').last().getAttribute('data-bumper-slide');
    await expect.poll(visible, { timeout: 30_000 }).toBe(show.slides.find((s) => !s.hidden)!.id);

    const next = await admin.post<BumperLiveState>(`/admin/bumpers/${show.id}/live`, { action: 'next' });
    await expect.poll(visible, { timeout: 20_000 }).toBe(next.slideId);
    await expect.poll(() => page.locator('[data-director] [data-bumper-slide]').count(), { timeout: 10_000 }).toBe(1);

    const jump = show.slides.filter((s) => !s.hidden)[4]!;
    await admin.post(`/admin/bumpers/${show.id}/live`, { action: 'goto', slideId: jump.id });
    await expect.poll(visible, { timeout: 20_000 }).toBe(jump.id);

    // The admin sees the output as connected.
    await expect
      .poll(async () => (await admin.get<{ presence: { outputs: number } }>(`/admin/bumpers/${show.id}/live`)).presence.outputs, { timeout: 15_000 })
      .toBeGreaterThan(0);
    watch.expectClean();
    await context.close();
  });

  test('stream operators build bumpers for their events only; show runners only run them', async ({ admin, data, browser, clientIp }) => {
    const { ev } = await eventWithLineup(data, admin);
    const other = await data.event({ kind: 'bumpers-other', visibility: 'unlisted' });
    const theirs = await admin.post<BumperShowDetail>('/admin/bumpers/generate', { eventId: ev.id, create: true, preshow: false });
    const notTheirs = await admin.post<BumperShowDetail>('/admin/bumpers/generate', { eventId: other.id, create: true, preshow: false });

    const { passphrase } = await data.adminUser('stream-op', { capabilities: [], grants: [{ type: 'event', id: ev.id, actions: ['stream.view', 'stream.control'] }] });
    const context = await browser.newContext();
    await isolateRateLimits(context, clientIp);
    const page = await context.newPage();
    await loginThroughForm(page, passphrase);
    const sidebar = page.locator('nav[aria-label="Admin"]');
    await expect(sidebar.getByRole('link', { name: /^Bumpers/ })).toBeVisible();

    const req = page.request;
    const h = { 'x-zemi-csrf': '1' };
    const list = (await (await req.get('/api/v1/admin/bumpers?status=all')).json()) as Paginated<BumperShowRow>;
    expect(list.items.map((r) => r.id)).toContain(theirs.id);
    expect(list.items.map((r) => r.id)).not.toContain(notTheirs.id);
    expect((await req.get(`/api/v1/admin/bumpers/${notTheirs.id}`)).status()).toBe(403);
    expect((await req.post('/api/v1/admin/bumpers/generate', { headers: h, data: { eventId: other.id, create: false } })).status()).toBe(403);
    expect((await req.post('/api/v1/admin/bumpers', { headers: h, data: { title: 'Standalone', eventId: null } })).status()).toBe(403);
    const ok = await req.post('/api/v1/admin/bumpers/generate', { headers: h, data: { eventId: ev.id, create: false } });
    expect(ok.status()).toBe(200);
    expect((await req.post(`/api/v1/admin/bumpers/${theirs.id}/live`, { headers: h, data: { action: 'next' } })).status()).toBe(200);
    await context.close();

    const runner = await data.adminUser('show-runner', { capabilities: [], grants: [{ type: 'event', id: ev.id, actions: ['bumpers.run'] }] });
    const ctx2 = await browser.newContext();
    await isolateRateLimits(ctx2, clientIp);
    const p2 = await ctx2.newPage();
    await loginThroughForm(p2, runner.passphrase);
    const r2 = p2.request;
    expect((await r2.post(`/api/v1/admin/bumpers/${theirs.id}/live`, { headers: h, data: { action: 'next' } })).status()).toBe(200);
    expect((await r2.get(`/api/v1/admin/bumpers/${theirs.id}/output`)).status()).toBe(200);
    expect((await r2.patch(`/api/v1/admin/bumpers/${theirs.id}`, { headers: h, data: { baseVersion: theirs.version, title: 'Nope' } })).status()).toBe(403);
    expect((await r2.delete(`/api/v1/admin/bumpers/${theirs.id}`, { headers: h })).status()).toBe(403);
    await ctx2.close();
  });

  test('library, builder, player and controller load cleanly', async ({ admin, data, browser, adminState }) => {
    const { ev } = await eventWithLineup(data, admin);
    const show = await admin.post<BumperShowDetail>('/admin/bumpers/generate', { eventId: ev.id, create: true });
    const context = await browser.newContext({ storageState: adminState });
    const page = await context.newPage();
    const watch = watchPage(page, [/EventSource/i]);
    await gotoStable(page, `/admin/bumpers?search=${encodeURIComponent(ev.title)}`);
    await expect(page.getByText(show.title).first()).toBeVisible();
    await gotoStable(page, `/admin/bumpers/${show.id}`);
    await expect(page.locator('[data-bumper-canvas]').first()).toBeVisible();
    await gotoStable(page, `/admin/stage/bumpers/${show.id}/control`);
    await expect(page.locator('[data-director]').first()).toBeVisible();
    await gotoStable(page, `/admin/stage/bumpers/${show.id}/play`);
    await expect(page.locator('[data-director]').first()).toBeVisible();
    await gotoStable(page, `/admin/events/${ev.id}/bumpers`);
    await expect(page.getByText(show.title).first()).toBeVisible();
    watch.expectClean();
    await context.close();
  });
});
