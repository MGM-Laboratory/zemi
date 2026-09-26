/**
 * Runs once before the suite:
 * 1. Preflight: the web and the API answer, and the superadmin passphrase works. Fails fast with a clear
 *    message instead of 20 confusing timeouts.
 * 2. Sweep: removes e2e leftovers (events, speakers, admins, contact messages, dev-outbox mails to
 *    e2e+...@example.com) older than 20 minutes, from runs that crashed before their cleanup ran.
 *    Younger ones may belong to a run in progress.
 */
import { request, type FullConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { AdminSummary, ContactMessage, EventAdminRow, Paginated, SpeakerAdminRow } from '../packages/shared/dist/index';
import { API_URL, Api, deleteEventDeep, fakeIp, OUTBOX_DIR, sleep, SUPERADMIN_PASSPHRASE, uidTime, WEB_URL } from './helpers';

const STALE_MS = 20 * 60_000;
const isStale = (s: string) => {
  const t = uidTime(s);
  return t !== null && Date.now() - t > STALE_MS;
};

async function reachable(url: string, tries = 10): Promise<number | string> {
  let last: number | string = 'no answer';
  for (let i = 0; i < tries; i++) {
    try {
      const ctx = await request.newContext();
      const res = await ctx.get(url, { timeout: 60_000, failOnStatusCode: false });
      last = res.status();
      await ctx.dispose();
      if (res.status() < 500) return res.status();
    } catch (err) {
      last = err instanceof Error ? err.message.split('\n')[0]! : String(err);
    }
    await sleep(3_000);
  }
  return last;
}

export default async function globalSetup(_config: FullConfig) {
  const api = await reachable(`${API_URL}/api/v1/health`);
  if (api !== 200) throw new Error(`The API at ${API_URL} is not healthy (${api}). Start the dev servers first.`);
  const web = await reachable(`${WEB_URL}/api/v1/public/events/next`);
  if (web !== 200) throw new Error(`The web at ${WEB_URL} (and its /api/v1 rewrite) is not answering (${web}).`);

  const ctx = await request.newContext({ baseURL: WEB_URL, extraHTTPHeaders: { 'x-real-ip': fakeIp() } });
  const admin = new Api(ctx);
  try {
    await admin.login(SUPERADMIN_PASSPHRASE);
  } catch (err) {
    throw new Error(`Superadmin login failed. Set E2E_SUPERADMIN_PASSPHRASE. ${err instanceof Error ? err.message : ''}`);
  }

  const swept: string[] = [];
  try {
    const events = await admin.get<Paginated<EventAdminRow>>('/admin/events', { when: 'all', search: 'e2e', pageSize: 100 });
    for (const e of events.items) {
      if (!/^e2e-/.test(e.slug) || !isStale(e.slug)) continue;
      await deleteEventDeep(admin, e.id);
      swept.push(`event ${e.slug}`);
    }
    const speakers = await admin.get<Paginated<SpeakerAdminRow>>('/admin/speakers', { search: 'E2E', pageSize: 100 });
    for (const s of speakers.items) {
      if (!/^e2e-/.test(s.slug) || !isStale(s.slug)) continue;
      await admin.del(`/admin/speakers/${s.id}`, { ok: [200, 204, 404] });
      swept.push(`speaker ${s.slug}`);
    }
    const admins = await admin.get<Paginated<AdminSummary>>('/admin/admins', { search: 'E2E', pageSize: 100 });
    for (const a of admins.items) {
      if (!/^E2E /.test(a.name) || !isStale(a.name)) continue;
      await admin.del(`/admin/admins/${a.id}`, { ok: [200, 204, 404] });
      swept.push(`admin ${a.name}`);
    }
    const inbox = await admin.get<Paginated<ContactMessage>>('/admin/inbox', { search: 'e2e+', status: 'all', pageSize: 100 });
    for (const m of inbox.items) {
      if (!/^e2e\+/.test(m.email) || !isStale(m.email)) continue;
      await admin.del(`/admin/inbox/${m.id}`, { ok: [200, 204, 404] });
      swept.push(`message ${m.email}`);
    }
  } finally {
    await admin.logout();
    await ctx.dispose();
  }
  swept.push(...(await sweepOutbox()));
  if (swept.length) console.log(`[e2e] swept ${swept.length} leftovers: ${swept.join(', ')}`);
}

/** Outbox mails (json + html + attachments) to e2e addresses, older than the stale cutoff. */
async function sweepOutbox(): Promise<string[]> {
  if (!existsSync(OUTBOX_DIR)) return [];
  const names = await readdir(OUTBOX_DIR);
  let removed = 0;
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    const full = path.join(OUTBOX_DIR, name);
    const s = await stat(full).catch(() => null);
    if (!s || Date.now() - s.mtimeMs < STALE_MS) continue;
    const json = JSON.parse(await readFile(full, 'utf8').catch(() => '{}')) as { to?: string[]; replyTo?: string | null };
    const e2e = (t: string) => /^e2e\+[^@]*@example\.com$/i.test(t);
    const mine = (json.to?.length && json.to.every(e2e)) || (json.replyTo && e2e(json.replyTo));
    if (!mine) continue;
    const base = name.replace(/\.json$/, '');
    for (const other of names.filter((n) => n === name || n.startsWith(`${base}.`))) await rm(path.join(OUTBOX_DIR, other), { force: true });
    removed++;
  }
  return removed ? [`${removed} outbox mails`] : [];
}
