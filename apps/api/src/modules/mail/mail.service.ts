import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { render, toPlainText } from '@react-email/render';
import { createElement, type ReactElement } from 'react';
import { Resend } from 'resend';
import { AppConfig } from '../../config/app-config.js';
import { apiPath } from '../../config/paths.js';
import { DB, type Db } from '../../db/client.js';
import { emailLogs } from '../../db/schema.js';
import { AdminTestEmail } from './templates/admin-test.js';
import { EmailContext } from './templates/components/context.js';

export interface MailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
  /** Set to embed inline and reference it as `<img src="cid:<contentId>">`. */
  contentId?: string;
}

export interface SendMailInput {
  to: string | string[];
  subject: string;
  /** A React Email element, e.g. `<RegistrationConfirmed ... />`. Rendered to HTML + text. */
  react?: ReactElement;
  /** Raw HTML instead of `react` (broadcasts). */
  html?: string;
  /** Plain text part. Derived from the HTML when omitted. */
  text?: string;
  attachments?: MailAttachment[];
  /** Template key for logs and the outbox filename: `registration-confirmed`, `event-reminder`... */
  template: string;
  eventId?: string | null;
  registrationId?: string | null;
  replyTo?: string | string[];
  /** Resend tags (ASCII letters, numbers, `_` and `-`). */
  tags?: Array<{ name: string; value: string }>;
}

export type MailStatus = 'sent' | 'failed' | 'logged';

export interface SendMailResult {
  status: MailStatus;
  /** email_logs row id. */
  logId: string | null;
  providerId: string | null;
  error: string | null;
  /** Where the HTML went in outbox mode. */
  outboxFile?: string;
}

const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80);

/**
 * A template with sample props, viewable at `GET /api/v1/admin/system/email-preview/<template>`
 * (superadmin). Register yours from your module's `onModuleInit`:
 *
 *   this.mail.registerPreview({ template: 'registration-confirmed', subject: 'Your seat is saved',
 *     render: () => <RegistrationConfirmed name="Rina" ticketUrl="https://..." /> });
 */
export interface EmailPreview {
  /** Template key, the same string you pass to `send({ template })`. Lowercase letters, digits, dashes. */
  template: string;
  subject: string;
  /** One line for the preview list, e.g. "Sent right after someone registers". */
  description?: string;
  /** Build the element with realistic sample props. */
  render: () => ReactElement | Promise<ReactElement>;
}

export interface EmailPreviewSummary {
  template: string;
  subject: string;
  description: string | null;
}

export const PREVIEW_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Email (SPEC section 10). With RESEND_API_KEY it sends through Resend; without it every email is
 * rendered to `apps/api/.mail-outbox/<timestamp>-<template>.html` (+ `.json` metadata, + inline
 * attachments) and logged with status `logged`. Every attempt writes an `email_logs` row.
 * `send()` never throws: check `result.status`.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly resend: Resend | null;
  private readonly previews = new Map<string, EmailPreview>();
  readonly outboxDir: string;

  constructor(
    private readonly config: AppConfig,
    @Inject(DB) private readonly db: Db,
  ) {
    this.resend = config.env.RESEND_API_KEY ? new Resend(config.env.RESEND_API_KEY) : null;
    this.outboxDir = config.env.MAIL_OUTBOX_DIR ?? apiPath('.mail-outbox');
    this.registerPreview({
      template: 'admin-test',
      subject: 'Zemi can send email',
      description: 'The test email from the System page.',
      render: () => createElement(AdminTestEmail, { name: 'Rina', sentAt: 'Fri, 2 Oct 2026, 13:15 WIB' }),
    });
  }

  /** Make a template viewable in the superadmin email preview. Re-registering a key replaces it. */
  registerPreview(preview: EmailPreview): void {
    if (!PREVIEW_KEY.test(preview.template)) throw new Error(`Email preview key "${preview.template}" must be kebab-case`);
    this.previews.set(preview.template, preview);
  }

  listPreviews(): EmailPreviewSummary[] {
    return [...this.previews.values()]
      .map((p) => ({ template: p.template, subject: p.subject, description: p.description ?? null }))
      .sort((a, b) => a.template.localeCompare(b.template));
  }

  /** Render a registered preview with its sample props, or null when the key is unknown. */
  async renderPreview(template: string): Promise<{ template: string; subject: string; html: string; text: string } | null> {
    const preview = this.previews.get(template);
    if (!preview) return null;
    const { html, text } = await this.render(await preview.render());
    return { template, subject: preview.subject, html, text };
  }

  get provider(): 'resend' | 'outbox' {
    return this.resend ? 'resend' : 'outbox';
  }

  get from(): string {
    return this.config.env.MAIL_FROM;
  }

  /** Render a React Email element to `{ html, text }` with the brand context applied. */
  async render(element: ReactElement): Promise<{ html: string; text: string }> {
    const wrapped = createElement(
      EmailContext.Provider,
      { value: { webUrl: this.config.env.PUBLIC_WEB_URL, apiUrl: this.config.env.PUBLIC_API_URL } },
      element,
    );
    const html = await render(wrapped);
    const text = toPlainText(html);
    return { html, text };
  }

  async send(input: SendMailInput): Promise<SendMailResult> {
    const to = Array.isArray(input.to) ? input.to : [input.to];
    let html = input.html ?? '';
    let text = input.text ?? '';
    try {
      if (input.react) {
        const out = await this.render(input.react);
        html = out.html;
        text = input.text ?? out.text;
      } else if (html && !text) {
        text = toPlainText(html);
      }
      if (!html && !text) throw new Error('Nothing to send: pass react, html or text');
    } catch (err) {
      const error = `Render failed: ${(err as Error).message}`;
      this.logger.error(`${input.template} to ${to.join(', ')}: ${error}`);
      return { status: 'failed', logId: await this.writeLog(input, to, 'failed', null, error), providerId: null, error };
    }

    if (!this.resend) return this.toOutbox(input, to, html, text);

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to,
        subject: input.subject,
        html,
        text,
        replyTo: input.replyTo ?? this.config.env.MAIL_REPLY_TO,
        tags: input.tags,
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
          contentId: a.contentId,
        })),
      });
      if (error || !data) throw new Error(error?.message ?? 'Resend returned no id');
      const logId = await this.writeLog(input, to, 'sent', data.id, null);
      this.logger.log(`Sent ${input.template} to ${to.join(', ')} (${data.id})`);
      return { status: 'sent', logId, providerId: data.id, error: null };
    } catch (err) {
      const error = (err as Error).message.slice(0, 500);
      this.logger.error(`Could not send ${input.template} to ${to.join(', ')}: ${error}`);
      return { status: 'failed', logId: await this.writeLog(input, to, 'failed', null, error), providerId: null, error };
    }
  }

  /** Send several emails with gentle pacing (Resend allows a few requests per second). */
  async sendMany(inputs: SendMailInput[], opts: { concurrency?: number; delayMs?: number } = {}): Promise<SendMailResult[]> {
    const concurrency = Math.max(1, opts.concurrency ?? 2);
    const delayMs = opts.delayMs ?? (this.resend ? 300 : 0);
    const results = new Array<SendMailResult>(inputs.length);
    let next = 0;
    const worker = async () => {
      while (next < inputs.length) {
        const i = next++;
        results[i] = await this.send(inputs[i]);
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, worker));
    return results;
  }

  private async toOutbox(input: SendMailInput, to: string[], html: string, text: string): Promise<SendMailResult> {
    try {
      await mkdir(this.outboxDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const base = `${stamp}-${safe(input.template)}-${Math.random().toString(36).slice(2, 6)}`;
      let previewHtml = html;
      const files: string[] = [];
      for (const a of input.attachments ?? []) {
        const name = `${base}.${safe(a.filename)}`;
        await writeFile(join(this.outboxDir, name), a.content);
        files.push(name);
        if (a.contentId) previewHtml = previewHtml.split(`cid:${a.contentId}`).join(`./${name}`);
      }
      const htmlFile = join(this.outboxDir, `${base}.html`);
      await writeFile(htmlFile, previewHtml, 'utf8');
      await writeFile(
        join(this.outboxDir, `${base}.json`),
        JSON.stringify(
          {
            from: this.from,
            to,
            subject: input.subject,
            template: input.template,
            eventId: input.eventId ?? null,
            registrationId: input.registrationId ?? null,
            replyTo: input.replyTo ?? this.config.env.MAIL_REPLY_TO ?? null,
            attachments: (input.attachments ?? []).map((a, i) => ({ filename: a.filename, contentType: a.contentType, contentId: a.contentId, file: files[i] })),
            text,
            createdAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        'utf8',
      );
      const logId = await this.writeLog(input, to, 'logged', null, null);
      this.logger.log(`[outbox] ${input.template} to ${to.join(', ')}: "${input.subject}" -> ${htmlFile}`);
      return { status: 'logged', logId, providerId: null, error: null, outboxFile: htmlFile };
    } catch (err) {
      const error = `Outbox write failed: ${(err as Error).message}`;
      this.logger.error(error);
      return { status: 'failed', logId: await this.writeLog(input, to, 'failed', null, error), providerId: null, error };
    }
  }

  private async writeLog(input: SendMailInput, to: string[], status: MailStatus, providerId: string | null, error: string | null): Promise<string | null> {
    try {
      const [row] = await this.db
        .insert(emailLogs)
        .values({
          to: to.join(', ').slice(0, 1000),
          template: input.template.slice(0, 100),
          subject: input.subject.slice(0, 500),
          status,
          providerId,
          error,
          eventId: input.eventId ?? null,
          registrationId: input.registrationId ?? null,
        })
        .returning({ id: emailLogs.id });
      return row?.id ?? null;
    } catch (err) {
      this.logger.error(`Could not write email_logs: ${(err as Error).message}`);
      return null;
    }
  }
}
