'use client';

import { useQueryClient } from '@tanstack/react-query';
import { formatJakarta, type BroadcastResult, type Blocks, type EventAdmin } from '@zemi/shared';
import { Check, FlaskConical, Send } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { Character } from '@/components/admin/characters/character';
import { BlockEditor } from '@/components/admin/fields/block-editor';
import { Button } from '@/components/admin/ui/button';
import { useConfirm } from '@/components/admin/ui/confirm-dialog';
import { Callout } from '@/components/admin/ui/feedback';
import { Field } from '@/components/admin/ui/field';
import { Input } from '@/components/admin/ui/input';
import { notify } from '@/components/admin/ui/toast';
import { RadioGroup } from '@/components/admin/ui/toggles';
import { adminFetch, errorMessage, formatWait, isApiError } from '@/lib/admin/api';
import { peopleKeys } from '../lib';
import { blocksHaveContent, blocksToEmailHtml } from './blocks-to-html';

export type Audience = 'all' | 'in-person' | 'online' | 'checked-in' | 'not-checked-in';

const TEST_KEY = 'zemi.emails.testTo';
const noopSubscribe = () => () => {};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function readTestTo(): string {
  try {
    return window.localStorage.getItem(TEST_KEY) ?? '';
  } catch {
    return '';
  }
}
function writeTestTo(v: string) {
  try {
    window.localStorage.setItem(TEST_KEY, v);
  } catch {
    /* private mode */
  }
}

export function audienceCounts(event: EventAdmin): Record<Audience, number> {
  const c = event.counts;
  return {
    all: c.registrations,
    'in-person': c.inPerson,
    online: c.online,
    'checked-in': c.checkedIn,
    'not-checked-in': Math.max(0, c.registrations - c.checkedIn),
  };
}

const AUDIENCE_LABEL: Record<Audience, string> = {
  all: 'Everyone with a seat',
  'in-person': 'Coming in person',
  online: 'Joining online',
  'checked-in': 'Checked in',
  'not-checked-in': 'Not checked in',
};

const AUDIENCE_PHRASE: Record<Audience, string> = {
  all: 'everyone with a seat',
  'in-person': 'people coming in person',
  online: 'people joining online',
  'checked-in': 'people who checked in',
  'not-checked-in': "people who haven't checked in",
};

const people = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'person' : 'people'}`;

/**
 * Compose a broadcast: subject, rich body (BlockNote, sent as sanitized HTML), who gets it with
 * live counts, a test to yourself first, then a confirm that says the exact number.
 * One email per person, never a shared To line (the API does the pacing and the dedupe).
 */
export function ComposeBroadcast({ event }: { event: EventAdmin }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const reduce = useReducedMotion();
  const counts = audienceCounts(event);
  const hybrid = event.mode === 'hybrid';
  const [subject, setSubject] = useState('');
  const [blocks, setBlocks] = useState<Blocks>([]);
  const [editorKey, setEditorKey] = useState(0);
  const [audience, setAudience] = useState<Audience>('all');
  const storedTestTo = useSyncExternalStore(noopSubscribe, readTestTo, () => '');
  const [typedTestTo, setTestTo] = useState<string | null>(null);
  const testTo = typedTestTo ?? storedTestTo;
  const [errors, setErrors] = useState<{ subject?: string; body?: string; testTo?: string }>({});
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastTest, setLastTest] = useState<{ to: string; at: Date; subject: string; outbox: boolean } | null>(null);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const recipients = counts[audience];
  const hasBody = useMemo(() => blocksHaveContent(blocks), [blocks]);
  const cancelled = Boolean(event.cancelledAt);

  const audienceOptions = (['all', ...(hybrid ? (['in-person', 'online'] as const) : []), 'checked-in', 'not-checked-in'] as Audience[]).map((a) => ({
    value: a,
    label: AUDIENCE_LABEL[a],
    description: counts[a] ? people(counts[a]) : 'Nobody yet',
    disabled: counts[a] === 0 && a !== 'all',
  }));

  /** Validate, build the HTML, and report what the email will lose. */
  const prepare = async (): Promise<string | null> => {
    const next: typeof errors = {};
    if (!subject.trim()) next.subject = 'Give it a subject. Something they would open.';
    if (!hasBody) next.body = 'Write a few words first.';
    setErrors(next);
    if (next.subject || next.body) return null;
    try {
      const out = await blocksToEmailHtml(blocks);
      if (!out.text && !/<img/i.test(out.html)) {
        setErrors({ body: 'Write a few words first.' });
        return null;
      }
      const warn: string[] = [];
      if (out.droppedImages) warn.push(`${out.droppedImages} ${out.droppedImages === 1 ? 'image is' : 'images are'} not on an https address, so email clients would never see ${out.droppedImages === 1 ? 'it' : 'them'}. We leave ${out.droppedImages === 1 ? 'it' : 'them'} out.`);
      if (out.lossy.length) warn.push(`Email keeps it simple: ${out.lossy.join(', ')} turn into plain text or drop out.`);
      setWarnings(warn);
      return out.html;
    } catch (err) {
      notify.error(`We couldn't turn that into an email (${errorMessage(err)}).`);
      return null;
    }
  };

  const handleApiError = (err: unknown) => {
    if (isApiError(err) && err.isRateLimited) {
      notify.error(`That's three broadcasts in ten minutes. Try again in ${formatWait(err.retryAfterSec ?? 60)}.`);
    } else if (isApiError(err) && err.fieldErrors.html) {
      setErrors((e) => ({ ...e, body: "After cleaning it up for email, nothing was left. Add some text (images need https links)." }));
    } else if (isApiError(err) && err.fieldErrors.subject) {
      setErrors((e) => ({ ...e, subject: err.fieldErrors.subject }));
    } else if (isApiError(err) && err.fieldErrors.testEmail) {
      setErrors((e) => ({ ...e, testTo: 'That email looks off. Mind checking it?' }));
    } else notify.error(errorMessage(err));
  };

  const sendTest = async () => {
    const to = testTo.trim();
    if (!EMAIL_RE.test(to)) {
      setErrors((e) => ({ ...e, testTo: 'Where should the test go? Type your email.' }));
      return;
    }
    setErrors((e) => ({ ...e, testTo: undefined }));
    const html = await prepare();
    if (!html) return;
    setTesting(true);
    try {
      const res = await adminFetch<BroadcastResult>(`/admin/events/${event.id}/broadcast`, {
        method: 'POST',
        body: { subject: subject.trim(), html, audience, testEmail: to },
      });
      writeTestTo(to);
      if (!res.failed) setLastTest({ to, at: new Date(), subject: subject.trim(), outbox: res.logged > 0 });
      void qc.invalidateQueries({ queryKey: peopleKeys.emails(event.id) });
      if (res.failed) notify.error(`The test to ${to} failed. Check the address, or the mail settings.`);
      else notify.success(res.logged ? `Test saved to the dev outbox for ${to}.` : `Test sent to ${to}. Go peek at your inbox.`);
    } catch (err) {
      handleApiError(err);
    } finally {
      setTesting(false);
    }
  };

  const sendReal = async () => {
    const html = await prepare();
    if (!html) return;
    const tested = lastTest && lastTest.subject === subject.trim();
    const ok = await confirm({
      title: `Email ${people(recipients)}?`,
      description: (
        <span className="block space-y-2">
          <span className="block">
            &quot;{subject.trim()}&quot; goes to {AUDIENCE_PHRASE[audience]}, one email each. This can&apos;t be unsent.
          </span>
          {!tested ? <span className="block font-medium text-ink">You haven&apos;t sent yourself a test of this one yet.</span> : null}
        </span>
      ),
      confirmLabel: `Send to ${people(recipients)}`,
    });
    if (!ok) return;
    setSending(true);
    setResult(null);
    try {
      const res = await adminFetch<BroadcastResult>(`/admin/events/${event.id}/broadcast`, {
        method: 'POST',
        body: { subject: subject.trim(), html, audience },
      });
      setResult(res);
      void qc.invalidateQueries({ queryKey: peopleKeys.emails(event.id) });
      if (res.failed && !res.sent && !res.logged) notify.error(`None of the ${people(res.recipients)} got it. Check the mail settings.`);
      else {
        notify.success(`On its way to ${people(res.sent + res.logged)}.`, { celebrate: 'circle' });
        setSubject('');
        setBlocks([]);
        setEditorKey((k) => k + 1);
        setLastTest(null);
        setWarnings([]);
      }
    } catch (err) {
      handleApiError(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <section aria-labelledby="compose-title" className="rounded-[24px] border border-line bg-white">
      <header className="flex items-start justify-between gap-3 border-b border-line p-4 sm:p-5">
        <div>
          <h2 id="compose-title" className="font-display text-xl font-extrabold tracking-[-0.02em]">
            Write to everyone
          </h2>
          <p className="text-sm text-ink-3">Room change, slides link, a nudge to come early. We add the date, room and their ticket button below your words.</p>
        </div>
        <Character shape="circle" mood={sending ? 'look' : result ? 'cheer' : 'idle'} follow size={44} replayKey={result ? 1 : 0} />
      </header>

      <div className="space-y-5 p-4 sm:p-5">
        {cancelled ? (
          <Callout tone="yellow" title="This Friday was cancelled">
            People already got the cancellation email. Broadcasts still work if you have more to say.
          </Callout>
        ) : null}

        <Field label="Subject" required error={errors.subject} count={{ value: subject.length, max: 200 }}>
          <Input
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value.slice(0, 200));
              if (errors.subject) setErrors((x) => ({ ...x, subject: undefined }));
            }}
            placeholder="Moving to Theater B this Friday"
            autoComplete="off"
          />
        </Field>

        <Field label="Who gets it">
          <RadioGroup<Audience> aria-label="Who gets it" variant="cards" className="grid-cols-2" value={audience} onValueChange={setAudience} options={audienceOptions} />
        </Field>

        <Field label="Message" required error={errors.body} hint="Write {{name}} for their first name. Tables and checklists turn into plain text. Images need an https address.">
          <BlockEditor
            key={editorKey}
            value={null}
            onChange={(b) => {
              setBlocks(b);
              if (errors.body) setErrors((x) => ({ ...x, body: undefined }));
            }}
            placeholder="Hi {{name}}, quick heads up..."
            minHeight="14rem"
          />
        </Field>

        <AnimatePresence initial={false}>
          {warnings.length ? (
            <motion.div initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Callout tone="yellow" title="Heads up">
                <ul className="list-disc space-y-1 pl-4">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Callout>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="rounded-2xl bg-surface-muted p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Send a test to" error={errors.testTo} className="min-w-0 flex-1" hint="Only this address. Nobody on the list sees tests.">
              <Input
                type="email"
                inputMode="email"
                value={testTo}
                onChange={(e) => {
                  setTestTo(e.target.value);
                  if (errors.testTo) setErrors((x) => ({ ...x, testTo: undefined }));
                }}
                placeholder="you@labmgm.org"
                autoComplete="email"
              />
            </Field>
            <Button variant="secondary" icon={<FlaskConical />} loading={testing} onClick={() => void sendTest()} className="sm:mb-[1.625rem]">
              Send me a test
            </Button>
          </div>
          {lastTest ? (
            <p className="mt-2 flex items-center gap-1.5 text-[0.8125rem] text-green-600" role="status">
              <Check className="size-4" strokeWidth={3} aria-hidden="true" />
              Test {lastTest.outbox ? 'saved to the dev outbox for' : 'sent to'} {lastTest.to} at {formatJakarta(lastTest.at, 'time')} WIB.
              {lastTest.subject !== subject.trim() ? <span className="text-ink-3"> The subject changed since.</span> : null}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-3">
            {recipients ? (
              <>
                Goes to <span className="font-semibold text-ink">{people(recipients)}</span>, one email each.
              </>
            ) : (
              'Nobody in this group yet.'
            )}
          </p>
          <Button variant="primary" size="lg" icon={<Send />} loading={sending} disabled={!recipients} onClick={() => void sendReal()}>
            {recipients ? `Send to ${people(recipients)}` : 'Nobody to send to'}
          </Button>
        </div>

        <AnimatePresence initial={false}>
          {result ? (
            <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Callout tone={result.failed ? 'yellow' : 'green'} title={result.failed ? 'Sent, with a few bumps' : 'Sent. Nice one.'}>
                {result.sent ? `${people(result.sent)} delivered to the mail service. ` : ''}
                {result.logged ? `${people(result.logged)} saved to the dev outbox (no mail key set). ` : ''}
                {result.failed ? `${people(result.failed)} failed. The log below says why.` : ''}
              </Callout>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}
