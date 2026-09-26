/**
 * Door check-in through the admin API: the first scan of a ticket checks the person in, the second one
 * says "already", and the public ticket page turns into the checked-in state.
 */
import type { AttendanceSummary, ScanResult } from '../packages/shared/dist/index';
import { expect, expectH1, gotoStable, snap, test, WEB_URL, watchPage } from './helpers';

test('a scanned ticket checks in once and the ticket page shows it', async ({ page, admin, data }) => {
  const ev = await data.event({ kind: 'door', visibility: 'unlisted' });
  const { result, who } = await data.publicRegistration(ev.id);
  const token = result.ticket.token;

  // The QR encodes the short link `<web>/t/<token>`; scan exactly that.
  const payload = `${WEB_URL}/t/${token}`;
  const first = await admin.post<ScanResult>(`/admin/events/${ev.id}/attendance/scan`, { payload, device: 'e2e door' });
  expect(first.outcome).toBe('checked-in');
  expect(first.registration?.fullName).toBe(who.fullName);
  expect(first.registration?.ticketCode).toBe(result.ticket.code);
  expect(first.counts.checkedIn).toBe(1);

  const second = await admin.post<ScanResult>(`/admin/events/${ev.id}/attendance/scan`, { payload, device: 'e2e door 2' });
  expect(second.outcome).toBe('already');
  expect(second.registration?.checkedInAt).toBeTruthy();
  expect(second.counts.checkedIn).toBe(1);

  // Typing the ticket code by hand finds the same seat.
  const typed = await admin.post<ScanResult>(`/admin/events/${ev.id}/attendance/scan`, { payload: result.ticket.code.toLowerCase() });
  expect(typed.outcome).toBe('already');

  const summary = await admin.get<AttendanceSummary>(`/admin/events/${ev.id}/attendance`);
  expect(JSON.stringify(summary)).toContain(who.fullName);

  const ticket = await data.ticket(token);
  expect(ticket.checkedInAt).toBeTruthy();

  const watch = watchPage(page);
  const res = await gotoStable(page, `/tickets/${token}`);
  expect(res!.status()).toBe(200);
  await expectH1(page);
  await expect(page.getByText("You're checked in. Welcome!").first()).toBeVisible();
  await snap(page, 'ticket-checked-in');
  await page.waitForTimeout(1_500);
  watch.expectClean();
});
