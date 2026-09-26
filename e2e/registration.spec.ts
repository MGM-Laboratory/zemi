/**
 * Registration through the real form: open an upcoming published event, save a seat with a unique email,
 * see the success ticket with its QR, open the ticket page, and find the confirmation in the dev outbox.
 */
import type { EventDetail, Paginated, EventCard } from '../packages/shared/dist/index';
import { expect, expectH1, expectImageLoaded, gotoStable, isolateRateLimits, skipSiteLoader, snap, test, waitForMail, watchPage } from './helpers';

test('someone saves a seat and gets a ticket, a ticket page and an email', async ({ page, data, publicApi, clientIp, request }) => {
  const ev = await data.event({ kind: 'reg', visibility: 'published' });
  const who = data.person('reg');

  // It is a real upcoming Friday as far as the public API is concerned.
  const detail = await publicApi.get<EventDetail>(`/public/events/${ev.slug}`);
  expect(detail.status).toBe('scheduled');
  expect(detail.registration.open).toBe(true);
  const upcoming = await publicApi.get<Paginated<EventCard>>('/public/events', { when: 'upcoming', search: ev.slug, pageSize: 10 });
  expect(upcoming.items.map((e) => e.slug)).toContain(ev.slug);

  await skipSiteLoader(page);
  await isolateRateLimits(page, clientIp);
  const watch = watchPage(page);
  const since = Date.now();

  const res = await gotoStable(page, `/events/${ev.slug}`);
  expect(res!.status()).toBe(200);
  await expectH1(page);
  await expect(page.locator('h1').first()).toContainText(ev.title);

  await page.getByRole('button', { name: 'Save my seat' }).first().click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();

  await sheet.getByLabel('What should we call you?').fill(who.fullName);
  await sheet.getByLabel('Where do we send your ticket?').fill(who.email);
  await sheet.getByLabel('Your number, in case plans change').fill(who.phone);
  await sheet.getByText('In the room', { exact: true }).click();
  await snap(page, 'form');

  const registered = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/api\/v1\/public\/events\/[^/]+\/registrations$/.test(new URL(r.url()).pathname),
  );
  await sheet.getByRole('button', { name: 'Save my seat' }).click();
  const answer = await registered;
  expect(answer.status(), await answer.text().catch(() => '')).toBe(200);
  const body = (await answer.json()) as { ticket: { token: string; code: string } };

  // Success view: heading, ticket card with the branded QR image.
  await expect(sheet.getByRole('heading', { name: "You're in. See you Friday." })).toBeVisible();
  await expect(sheet.getByText(body.ticket.code).first()).toBeVisible();
  await expectImageLoaded(page, sheet.getByRole('img', { name: /QR code for ticket/ }).first());
  await snap(page, 'success');

  // Ticket page.
  await sheet.getByRole('link', { name: 'Show my ticket' }).click();
  await expect(page).toHaveURL(new RegExp(`/tickets/${body.ticket.token}$`));
  await expectH1(page);
  await expect(page.getByText(body.ticket.code).first()).toBeVisible();
  await expectImageLoaded(page, page.getByRole('img', { name: /QR code for ticket/ }).first());
  await page.waitForTimeout(1_500); // let the route curtain and confetti settle for the screenshot
  await snap(page, 'ticket-page');

  // The ticket's files: QR as PNG and SVG, and a calendar entry.
  const ticket = await data.ticket(body.ticket.token);
  for (const [url, type] of [
    [ticket.qrPngUrl, 'image/png'],
    [ticket.qrSvgUrl, 'image/svg+xml'],
    [ticket.calendarUrl, 'text/calendar'],
  ] as const) {
    const r = await request.get(url);
    expect(r.status(), url).toBe(200);
    expect(r.headers()['content-type'], url).toContain(type);
  }
  const ics = await (await request.get(ticket.calendarUrl)).text();
  expect(ics).toContain('BEGIN:VEVENT');
  expect(ics).toContain(ev.title);

  // Confirmation email in the dev outbox (RESEND_API_KEY is empty locally).
  const mail = await waitForMail({ to: who.email, template: 'registration-confirmed', since });
  expect(mail.json.eventId).toBe(ev.id);
  const text = `${mail.json.text ?? ''}\n${mail.html}`;
  expect(text.toLowerCase()).toContain(who.firstName.toLowerCase());
  expect(text).toContain(body.ticket.code);
  expect(text).toContain(`/tickets/${body.ticket.token}`);

  await page.waitForTimeout(1_000);
  watch.expectClean();
});
