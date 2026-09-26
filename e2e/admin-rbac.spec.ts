/**
 * Least privilege in the studio: a door-crew admin (attendance.scan + attendance.manage on one event)
 * sees only what those powers allow, in the sidebar, in the event workspace tabs and at the API.
 */
import type { Browser, BrowserContext, Page } from '@playwright/test';
import type { AdminSummary, EventAdmin } from '../packages/shared/dist/index';
import { expect, gotoStable, isolateRateLimits, loginThroughForm, skipSiteLoader, snap, test, watchPage, type DataFactory, type PageWatch } from './helpers';

/**
 * Derived from WORKSPACE_TABS in apps/web/src/components/admin/events/lib.ts: the attendance actions imply
 * `view` (Overview, Details, Speakers, Rundown, Publications, Settings); Media needs `media.manage`.
 */
const DOOR_TABS = ['Overview', 'Details', 'Speakers', 'Rundown', 'Publications', 'Attendance', 'Settings'];
const HIDDEN_TABS = ['Registrations', 'Stream', 'Media', 'Emails'];

interface DoorCrew {
  ev: EventAdmin;
  crew: AdminSummary;
  context: BrowserContext;
  page: Page;
  watch: PageWatch;
}

/** An event plus a door-crew admin for it, signed in through the login form in a fresh browser context. */
async function signInDoorCrew(browser: Browser, data: DataFactory, clientIp: string): Promise<DoorCrew> {
  const ev = await data.event({ kind: 'rbac' });
  const { admin: crew, passphrase } = await data.adminUser('door-crew', {
    capabilities: [],
    grants: [{ type: 'event', id: ev.id, actions: ['attendance.scan', 'attendance.manage'] }],
  });
  expect(crew.status).toBe('active');
  // Fresh context: nothing shared with the superadmin session.
  const context = await browser.newContext();
  await isolateRateLimits(context, clientIp);
  await skipSiteLoader(context);
  const page = await context.newPage();
  const watch = watchPage(page);
  await loginThroughForm(page, passphrase);
  return { ev, crew, context, page, watch };
}

test('door crew sees only the door', async ({ browser, admin, data, clientIp }) => {
  const other = await data.event({ kind: 'rbac-other' });
  const { ev, crew, context, page, watch } = await signInDoorCrew(browser, data, clientIp);
  try {
    const me = await page.request.get('/api/v1/auth/me');
    expect(me.status()).toBe(200);
    expect(((await me.json()) as { principal: { id: string } }).principal.id).toBe(crew.id);

    // Sidebar: events yes; speakers, publications, admins and the other powers no.
    const sidebar = page.locator('nav[aria-label="Admin"]');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Events/ })).toBeVisible();
    for (const hidden of [/^Speakers/, /^Publications/, /^Admins and access/, /^Audit log/, /^System/, /^Inbox/, /^Audience/, /^Media library/, /^Site/]) {
      await expect(sidebar.getByRole('link', { name: hidden })).toHaveCount(0);
    }

    // Event workspace: exactly the permitted tabs.
    await gotoStable(page, `/admin/events/${ev.id}`);
    const tabs = page.locator('nav[aria-label="Event sections"]');
    await expect(tabs.getByRole('link', { name: /^Attendance/ })).toBeVisible();
    const labels = (await tabs.getByRole('link').allInnerTexts()).map((t) => t.replace(/\s*\d+$/, '').trim());
    expect(labels).toEqual(DOOR_TABS);
    for (const name of HIDDEN_TABS) await expect(tabs.getByRole('link', { name: new RegExp(`^${name}`) })).toHaveCount(0);
    await snap(page, 'workspace');

    // The attendance board works for them.
    await tabs.getByRole('link', { name: /^Attendance/ }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/events/${ev.id}/attendance$`));
    await expect(page.getByText('At the door').first()).toBeVisible();
    await snap(page, 'attendance');

    // Typing a hidden tab's URL gets the friendly locked door, not the tab.
    for (const tab of ['registrations', 'stream', 'media', 'emails']) {
      await gotoStable(page, `/admin/events/${ev.id}/${tab}`);
      await expect(page.getByText(new RegExp(`You can see this event, but not its ${tab}`))).toBeVisible();
    }
    await snap(page, 'tab-locked');
    // Superadmin rooms say so.
    await gotoStable(page, '/admin/admins');
    await expect(page.getByText('This room is superadmin only.')).toBeVisible();

    // The server enforces it regardless of the UI.
    const forbidden = [
      `/api/v1/admin/events/${ev.id}/registrations`,
      `/api/v1/admin/events/${ev.id}/stream`,
      `/api/v1/admin/events/${other.id}`,
      `/api/v1/admin/events/${other.id}/attendance`,
      '/api/v1/admin/admins',
      '/api/v1/admin/inbox',
    ];
    for (const url of forbidden) {
      const r = await page.request.get(url);
      expect(r.status(), `GET ${url}`).toBe(403);
    }
    const csrf = { 'x-zemi-csrf': '1' };
    const patch = await page.request.patch(`/api/v1/admin/events/${ev.id}`, { data: { title: 'Nope' }, headers: csrf });
    expect(patch.status(), 'PATCH the event').toBe(403);
    const create = await page.request.post('/api/v1/admin/speakers', { data: { fullName: 'Nope Nope' }, headers: csrf });
    expect(create.status(), 'POST a speaker').toBe(403);
    for (const url of [`/api/v1/admin/events/${ev.id}/attendance`, `/api/v1/admin/events/${ev.id}/attendance/roster`]) {
      const r = await page.request.get(url);
      expect(r.status(), `GET ${url}`).toBe(200);
    }
    // Their event list holds this one event only.
    const list = (await (await page.request.get('/api/v1/admin/events?when=all&pageSize=100')).json()) as { items: Array<{ id: string }> };
    expect(list.items.map((e) => e.id)).toEqual([ev.id]);

    watch.expectClean();

    // Deleting the admin (cleanup would too) ends their session on the next request.
    await admin.del(`/admin/admins/${crew.id}`);
    await admin.get(`/admin/admins/${crew.id}`, undefined, { ok: [404] });
    expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
  } finally {
    await context.close();
  }
});

test('door crew opening the speaker or publication directory by URL is told it is not theirs', async ({ browser, data, clientIp }) => {
  // Regression guard: these pages used to greet admins without speaker or publication access with the
  // first-run "No speakers yet. Add the first person..." state while the directory was full.
  const { context, page } = await signInDoorCrew(browser, data, clientIp);
  try {
    await gotoStable(page, '/admin/speakers');
    await expect(page.getByRole('heading', { name: 'Speakers' }).first()).toBeVisible();
    await expect(page.getByText(/in your access|behind a door|not yours/i).first()).toBeVisible();
    await expect(page.getByText('No speakers yet.')).toHaveCount(0);
    await gotoStable(page, '/admin/publications');
    await expect(page.getByText(/in your access|behind a door|not yours/i).first()).toBeVisible();
    await expect(page.getByText('No publications yet.')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
