import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import type { Db } from '../../db/client.js';
import { MailService } from './mail.service.js';
import { AdminTestEmail } from './templates/admin-test.js';

let dir: string;
const logs: unknown[] = [];
const db = {
  insert: () => ({ values: (v: unknown) => ({ returning: async () => (logs.push(v), [{ id: `log-${logs.length}` }]) }) }),
} as unknown as Db;

beforeAll(async () => {
  Logger.overrideLogger(false);
  dir = await mkdtemp(join(tmpdir(), 'zemi-mail-'));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('MailService (outbox mode)', () => {
  it('renders React Email with the brand layout, writes the outbox and logs', async () => {
    const config = {
      env: {
        PUBLIC_WEB_URL: 'https://zemi.example.org',
        PUBLIC_API_URL: 'https://api.zemi.example.org',
        MAIL_FROM: 'Zemi <no-reply@labmgm.org>',
        MAIL_OUTBOX_DIR: dir,
      },
    } as unknown as AppConfig;
    const mail = new MailService(config, db);
    expect(mail.provider).toBe('outbox');

    const result = await mail.send({
      to: 'someone@example.com',
      subject: 'Zemi can send email',
      template: 'admin-test',
      react: <AdminTestEmail name="Rina" sentAt="Fri, 2 Oct 2026, 13:15 WIB" />,
      attachments: [{ filename: 'qr.png', content: Buffer.from('png'), contentType: 'image/png', contentId: 'qr' }],
    });
    expect(result.status).toBe('logged');
    expect(result.logId).toBe('log-1');
    expect(logs[0]).toMatchObject({ status: 'logged', template: 'admin-test', to: 'someone@example.com' });

    const html = await readFile(result.outboxFile!, 'utf8');
    expect(html).toContain('Mail works.');
    expect(html).toContain('Hi Rina');
    expect(html).toContain('https://zemi.example.org/brand/email-logo.png');
    expect(html).toContain('Fridays 13:15 WIB');
    expect(html).not.toMatch(/[\u2013\u2014]/); // no en or em dashes in copy
    const files = await readdir(dir);
    expect(files.some((f) => f.endsWith('.json'))).toBe(true);
    expect(files.some((f) => f.endsWith('.qr.png'))).toBe(true);
  });

  it('reports failures instead of throwing', async () => {
    const config = { env: { PUBLIC_WEB_URL: 'x', PUBLIC_API_URL: 'y', MAIL_FROM: 'z', MAIL_OUTBOX_DIR: dir } } as unknown as AppConfig;
    const result = await new MailService(config, db).send({ to: 'a@b.c', subject: 's', template: 'empty' });
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/Nothing to send/);
  });
});
