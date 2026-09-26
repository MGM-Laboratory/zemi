/**
 * The studio's content loop, driven through the admin UI: add a speaker, create a draft event, put the
 * speaker on the lineup, publish, see it on the public site, move the slug (the old link keeps working
 * with a 308), then delete the event and the speaker.
 */
import type { EventAdmin } from '../packages/shared/dist/index';
import { deleteEventDeep, expect, expectH1, farFutureFriday, gotoStable, skipSiteLoader, snap, test, uid, watchPage } from './helpers';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

test('speaker, draft, lineup, publish, public page, slug move and delete', async ({ page, admin, adminState, cleanup, request }) => {
  test.setTimeout(240_000);
  const id = uid();
  const speakerName = `E2E Speaker ${id}`;
  const speakerSlug = `e2e-speaker-${id}`;
  const title = `E2E content ${id}`;
  const slug = `e2e-content-${id}`;
  const moved = `e2e-moved-${id}`;

  await page.context().addCookies(adminState.cookies);
  await skipSiteLoader(page);
  const watch = watchPage(page);

  /* ---- speaker */
  await gotoStable(page, '/admin/speakers/new');
  await page.getByRole('textbox', { name: 'Full name' }).fill(speakerName);
  await expect(page.getByRole('textbox', { name: 'Page link' })).toHaveValue(speakerSlug);
  const createdSpeaker = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/admin/speakers');
  await page.getByRole('button', { name: 'Add speaker' }).first().click();
  const speakerRes = await createdSpeaker;
  expect(speakerRes.status(), await speakerRes.text()).toBe(201);
  const speaker = (await speakerRes.json()) as { id: string; slug: string; visibility: string };
  cleanup.add(`speaker ${speakerSlug}`, () => admin.del(`/admin/speakers/${speaker.id}`, { ok: [200, 204, 404] }));
  expect(speaker.slug).toBe(speakerSlug);
  expect(speaker.visibility).toBe('published');
  await page.waitForURL(new RegExp(`/admin/speakers/${speaker.id}$`));

  /* ---- draft event */
  await gotoStable(page, '/admin/events/new');
  await page.getByRole('textbox', { name: 'Title' }).fill(title);
  const createdEvent = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/admin/events');
  await page.getByRole('button', { name: 'Create draft' }).click();
  const eventRes = await createdEvent;
  expect(eventRes.status(), await eventRes.text()).toBe(201);
  const created = (await eventRes.json()) as EventAdmin;
  cleanup.add(`event ${created.slug}`, () => deleteEventDeep(admin, created.id));
  expect(created.visibility).toBe('draft');
  expect(created.slug).toBe(slug);
  await page.waitForURL(new RegExp(`/admin/events/${UUID}/details$`));
  expect(page.url()).toContain(created.id);
  // The form picked the next free Friday. Park it far in the future (and drop the Zemi number) so it never
  // shows up as "the next Friday" on the real site while this test has it published.
  await admin.patch(`/admin/events/${created.id}`, { ...farFutureFriday(), number: null });

  /* ---- lineup */
  await gotoStable(page, `/admin/events/${created.id}/speakers`);
  await page.getByRole('combobox', { name: 'Add someone' }).click();
  await page.getByPlaceholder('Type a name').fill(speakerName);
  // The directory hit, not the "Add "<name>" as a new speaker" item that shows while the lookup runs.
  await page.getByRole('option', { name: new RegExp(`^${speakerName}`) }).click();
  await expect(page.getByRole('button', { name: `Remove ${speakerName}` })).toBeVisible();
  await snap(page, 'lineup');
  const lineup = page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/v1/admin/events/${created.id}/speakers`);
  await page.getByRole('button', { name: 'Save lineup' }).click();
  expect((await lineup).status()).toBe(200);
  const withSpeaker = await admin.get<EventAdmin>(`/admin/events/${created.id}`);
  expect(withSpeaker.speakers.map((s) => s.slug)).toContain(speakerSlug);

  /* ---- publish */
  const published = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/v1/admin/events/${created.id}/publish`);
  await page.getByRole('button', { name: 'Publish', exact: true }).first().click();
  expect((await published).status()).toBe(200);
  await expect.poll(async () => (await admin.get<EventAdmin>(`/admin/events/${created.id}`)).visibility).toBe('published');

  /* ---- public page */
  const pub = await gotoStable(page, `/events/${slug}`);
  expect(pub!.status()).toBe(200);
  await expectH1(page);
  await expect(page.locator('h1').first()).toContainText(title);
  await expect(page.locator(`a[href="/speakers/${speakerSlug}"]`).first()).toBeVisible();
  await snap(page, 'public-page');

  /* ---- slug move */
  await gotoStable(page, `/admin/events/${created.id}/details`);
  const link = page.getByRole('textbox', { name: 'Link', exact: true });
  await expect(link).toHaveValue(slug);
  await link.fill(moved);
  const saved = page.waitForResponse((r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname === `/api/v1/admin/events/${created.id}`);
  await page.getByRole('button', { name: /^Save (details|changes)$/ }).click();
  const savedRes = await saved;
  expect(savedRes.status(), await savedRes.text()).toBe(200);
  expect(((await savedRes.json()) as EventAdmin).slug).toBe(moved);

  // Old links keep working: a permanent redirect to the new slug.
  await expect
    .poll(
      async () => {
        const r = await request.get(`/events/${slug}`, { maxRedirects: 0, failOnStatusCode: false });
        return `${r.status()} ${r.headers()['location'] ?? ''}`;
      },
      { timeout: 30_000, message: 'old slug answers 308 to the new one' },
    )
    .toMatch(new RegExp(`^308 .*/events/${moved}$`));
  await gotoStable(page, `/events/${slug}`);
  await expect(page).toHaveURL(new RegExp(`/events/${moved}$`));
  await expect(page.locator('h1').first()).toContainText(title);

  /* ---- delete the event */
  await gotoStable(page, `/admin/events/${created.id}/settings`);
  await page.getByRole('button', { name: 'Delete event' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox').fill(title);
  const deleted = page.waitForResponse((r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === `/api/v1/admin/events/${created.id}`);
  await dialog.getByRole('button', { name: 'Delete event' }).click();
  expect((await deleted).status()).toBe(200);
  await page.waitForURL((u) => u.pathname === '/admin/events');
  await admin.get(`/admin/events/${created.id}`, undefined, { ok: [404] });
  await expect
    .poll(async () => (await request.get(`/events/${moved}`, { failOnStatusCode: false })).status(), { timeout: 30_000, message: 'public page is gone' })
    .toBe(404);

  /* ---- delete the speaker */
  await gotoStable(page, `/admin/speakers/${speaker.id}`);
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete speaker' }).click();
  const speakerDialog = page.getByRole('alertdialog');
  const speakerDeleted = page.waitForResponse((r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === `/api/v1/admin/speakers/${speaker.id}`);
  await speakerDialog.getByRole('button', { name: 'Delete speaker' }).click();
  expect((await speakerDeleted).status()).toBe(200);
  await page.waitForURL((u) => u.pathname === '/admin/speakers');
  await expect
    .poll(async () => (await request.get(`/speakers/${speakerSlug}`, { failOnStatusCode: false })).status(), { timeout: 30_000 })
    .toBe(404);

  watch.expectClean();
});
