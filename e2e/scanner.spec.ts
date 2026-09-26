/**
 * @camera The door scanner with a fake camera: Chromium plays a Y4M clip of a real ticket QR as the
 * webcam, the admin taps "Enable camera", and the scanner checks the person in.
 */
import { rm, writeFile } from 'node:fs/promises';
import type { ScanResult } from '../packages/shared/dist/index';
import { API_URL, expect, gotoStable, imageToY4m, snap, test, watchPage, WEB_URL } from './helpers';

test('@camera the scanner reads a real ticket QR from the camera and checks the person in', async ({ playwright, admin, adminState, data, request }, testInfo) => {
  test.setTimeout(180_000);
  const ev = await data.event({ kind: 'scan', visibility: 'unlisted' });
  const { result, who } = await data.publicRegistration(ev.id);
  const firstName = who.firstName;

  // The branded 1024 px QR from the API, turned into a 640x640, 3 s clip.
  const qrUrl = result.ticket.qrPngUrl.startsWith('http') ? result.ticket.qrPngUrl : `${API_URL}${result.ticket.qrPngUrl}`;
  const png = await request.get(qrUrl);
  expect(png.status()).toBe(200);
  expect(png.headers()['content-type']).toContain('image/png');
  const pngPath = testInfo.outputPath('ticket-qr.png');
  const y4mPath = testInfo.outputPath('ticket-qr.y4m');
  await writeFile(pngPath, await png.body());
  await imageToY4m(pngPath, y4mPath, { size: 640, seconds: 3, fps: 10 });

  const browser = await playwright.chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4mPath}`],
  });
  try {
    const context = await browser.newContext({
      baseURL: WEB_URL,
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      permissions: ['camera'],
      storageState: adminState,
    });
    const page = await context.newPage();
    const watch = watchPage(page);
    await gotoStable(page, `/admin/scan/${ev.id}`);
    await expect(page.getByRole('heading', { name: /Door duty, ready\?/ })).toBeVisible();
    await snap(page, 'intro');

    const scanned = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/v1/admin/events/${ev.id}/attendance/scan`,
      { timeout: 60_000 },
    );
    await page.getByRole('button', { name: /Enable camera/ }).click();
    const answer = await scanned;
    expect(answer.status()).toBe(200);
    const body = (await answer.json()) as ScanResult;
    expect(body.outcome).toBe('checked-in');
    expect(body.registration?.fullName).toBe(who.fullName);

    const card = page.getByRole('alertdialog');
    await expect(card).toBeVisible();
    await expect(card).toContainText(`Welcome, ${firstName}!`);
    await snap(page, 'welcome');

    // The seat is really checked in.
    const ticket = await data.ticket(result.ticket.token);
    expect(ticket.checkedInAt).toBeTruthy();
    const again = await admin.post<ScanResult>(`/admin/events/${ev.id}/attendance/scan`, { payload: result.ticket.code });
    expect(again.outcome).toBe('already');

    watch.expectClean();
    await context.close();
  } finally {
    await browser.close();
    await rm(y4mPath, { force: true });
    await rm(pngPath, { force: true });
  }
});
