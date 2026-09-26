/**
 * Public smoke: every public page type answers with the right status, has an h1, and runs without
 * uncaught errors or console errors. Seeded content is discovered through the public API (never
 * hard-coded slugs, and never another test's e2e records), one test per page so one failure
 * doesn't hide the rest.
 */
import type { EventCard, Paginated, PublicationCard, SpeakerRef } from '../packages/shared/dist/index';
import { expect, expectH1, expectPageBasics, gotoStable, snap, test, uid, watchPage, WEB_URL, type Api } from './helpers';

const notE2e = (slug: string) => !slug.startsWith('e2e-');

async function findEvent(api: Api, when: string, match: (e: EventCard & { hasRecording?: boolean }) => boolean, what: string) {
  for (let page = 1; page <= 10; page++) {
    const res = await api.get<Paginated<EventCard & { hasRecording?: boolean }>>('/public/events', { when, page, pageSize: 50 });
    const hit = res.items.find((e) => notE2e(e.slug) && match(e));
    if (hit) return `/events/${hit.slug}`;
    if (page * 50 >= res.total) break;
  }
  throw new Error(`No ${what} in the seeded data (public /events?when=${when}).`);
}

interface Target {
  name: string;
  path: string | ((api: Api) => Promise<string> | string);
  status?: number;
}

const TARGETS: Target[] = [
  { name: 'home', path: '/' },
  { name: 'about', path: '/about' },
  { name: 'events index', path: '/events' },
  { name: 'scheduled event', path: (api) => findEvent(api, 'upcoming', (e) => e.status === 'scheduled', 'scheduled event') },
  { name: 'past event with a recording', path: (api) => findEvent(api, 'past', (e) => e.hasRecording === true, 'past event with a recording') },
  { name: 'cancelled event', path: (api) => findEvent(api, 'all', (e) => e.status === 'cancelled', 'cancelled event') },
  { name: 'speakers index', path: '/speakers' },
  {
    name: 'speaker page',
    path: async (api) => {
      const res = await api.get<Paginated<SpeakerRef>>('/public/speakers', { pageSize: 20 });
      const s = res.items.find((x) => notE2e(x.slug));
      if (!s) throw new Error('No public speaker in the seeded data.');
      return `/speakers/${s.slug}`;
    },
  },
  { name: 'publications index', path: '/publications' },
  {
    name: 'publication page',
    path: async (api) => {
      const res = await api.get<Paginated<PublicationCard>>('/public/publications', { pageSize: 20 });
      const p = res.items.find((x) => notE2e(x.slug));
      if (!p) throw new Error('No public publication in the seeded data.');
      return `/publications/${p.slug}`;
    },
  },
  { name: 'contact', path: '/contact' },
  { name: 'unknown path (404)', path: () => `/e2e-no-such-page-${uid()}`, status: 404 },
  { name: 'unknown event slug (404)', path: () => `/events/e2e-missing-${uid()}`, status: 404 },
];

test.describe('public smoke', () => {
  for (const t of TARGETS) {
    test(`${t.name} renders cleanly`, async ({ page, publicApi }) => {
      const url = typeof t.path === 'string' ? t.path : await t.path(publicApi);
      const expected = t.status ?? 200;
      // The browser logs the 404 document itself as a failed resource; that line is the point of the test.
      const watch = watchPage(page, expected === 404 ? [/status of 404/] : []);
      const res = await gotoStable(page, url);
      expect(res, `no response for ${url}`).not.toBeNull();
      expect(res!.status(), `HTTP status of ${url}`).toBe(expected);
      await expectH1(page);
      // Give hydration, effects and lazy chunks a moment to surface errors.
      await page.waitForLoadState('load');
      await page.waitForTimeout(2_500);
      await expectPageBasics(page);
      await snap(page, 'page');
      watch.expectClean(url);
    });
  }

  test('legacy and short links redirect where the spec says', async ({ request, publicApi }) => {
    const speakers = await publicApi.get<Paginated<SpeakerRef>>('/public/speakers', { pageSize: 20 });
    const speaker = speakers.items.find((x) => notE2e(x.slug))!;
    const hop = async (path: string) => {
      const r = await request.get(path, { maxRedirects: 0, failOnStatusCode: false });
      return { status: r.status(), to: new URL(r.headers()['location'] ?? '/', WEB_URL).pathname };
    };
    expect(await hop('/home')).toEqual({ status: 308, to: '/' });
    expect(await hop(`/speaker/${speaker.slug}`)).toEqual({ status: 308, to: `/speakers/${speaker.slug}` });
    expect(await hop('/t/AbCdEfGhIjKlMnOpQrStUv')).toEqual({ status: 307, to: '/tickets/AbCdEfGhIjKlMnOpQrStUv' });
    // /live goes to the live Friday, else the next one, else the archive.
    const live = await hop('/live');
    expect(live.status).toBe(307);
    expect(live.to).toMatch(/^\/events(\/[a-z0-9-]+)?$/);
  });

  test('ticket page for a real registration renders cleanly', async ({ page, data }) => {
    const ev = await data.event({ kind: 'smoke', visibility: 'unlisted' });
    const { result, who } = await data.publicRegistration(ev.id);
    const url = `/tickets/${result.ticket.token}`;
    const watch = watchPage(page);
    const res = await gotoStable(page, url);
    expect(res!.status()).toBe(200);
    await expectH1(page);
    await expect(page.getByText(result.ticket.code).first()).toBeVisible();
    await expect(page.getByText(who.firstName, { exact: false }).first()).toBeVisible();
    await page.waitForTimeout(2_500);
    await expectPageBasics(page);
    await snap(page, 'ticket');
    watch.expectClean(url);
  });
});
