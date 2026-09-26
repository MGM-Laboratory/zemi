/**
 * Contact: send the form, see the success state, and find the message in the studio inbox.
 */
import type { ContactMessage, Paginated } from '../packages/shared/dist/index';
import { expect, expectH1, gotoStable, isolateRateLimits, skipSiteLoader, snap, test, waitForMail, watchPage } from './helpers';

test('a message sent from /contact lands in the inbox', async ({ page, admin, cleanup, clientIp, data }) => {
  const who = data.person('contact');
  const message = `Hello from the e2e suite (${who.email}). Just checking the plane still flies.`;

  await skipSiteLoader(page);
  await isolateRateLimits(page, clientIp);
  const watch = watchPage(page);

  const res = await gotoStable(page, '/contact');
  expect(res!.status()).toBe(200);
  await expectH1(page);

  await page.getByRole('textbox', { name: 'Your name' }).fill(who.fullName);
  await page.getByRole('textbox', { name: 'Email' }).fill(who.email);
  await page.getByRole('textbox', { name: 'Message' }).fill(message);

  const since = Date.now();
  const sent = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/public/contact');
  await page.getByRole('button', { name: 'Send message' }).click();
  const answer = await sent;
  expect(answer.status(), await answer.text().catch(() => '')).toBeLessThan(300);
  // Registered before asserting the UI, so the row goes even if the success view fails.
  cleanup.add(`contact ${who.email}`, async () => {
    const found = await admin.get<Paginated<ContactMessage>>('/admin/inbox', { search: who.email, status: 'all' });
    for (const m of found.items) await admin.del(`/admin/inbox/${m.id}`, { ok: [200, 204, 404] });
  });

  await expect(page.getByRole('heading', { name: `Plane landed. Thanks, ${who.firstName}.` })).toBeVisible();
  await expect(page.getByText('Message sent').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send another' })).toBeVisible();
  await snap(page, 'success');

  const inbox = await admin.get<Paginated<ContactMessage>>('/admin/inbox', { search: who.email, status: 'all' });
  expect(inbox.items).toHaveLength(1);
  const msg = inbox.items[0]!;
  expect(msg.name).toBe(who.fullName);
  expect(msg.email).toBe(who.email);
  expect(msg.message).toBe(message);
  expect(msg.status).toBe('new');

  // "We sent a little copy to your inbox too": the auto-reply went to the sender.
  const reply = await waitForMail({ to: who.email, template: 'contact-auto-reply', since });
  expect(`${reply.json.text ?? ''}${reply.html}`.toLowerCase()).toContain(who.firstName.toLowerCase());

  // The default (no filter) inbox view shows it too.
  const all = await admin.get<Paginated<ContactMessage>>('/admin/inbox', { pageSize: 50 });
  expect(all.items.map((m) => m.id)).toContain(msg.id);

  await page.waitForTimeout(1_000);
  watch.expectClean();
});
