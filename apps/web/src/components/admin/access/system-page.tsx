'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RESET_CONTENT_PHRASE, formatJakarta, type ResetContentResult, type SystemStatus } from '@zemi/shared';
import {
  Activity,
  Briefcase,
  Database,
  ExternalLink,
  HardDrive,
  Mail,
  MailWarning,
  RadioTower,
  RefreshCw,
  Send,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  Callout,
  CopyField,
  DateText,
  ErrorState,
  Field,
  Input,
  KeyValue,
  PageHeader,
  Section,
  Skeleton,
  notify,
  useConfirm,
} from '@/components/admin/ui';
import { api, errorMessage } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { formatNumber } from '@/lib/admin/format';
import { adminKeys, invalidateAdmin } from '@/lib/admin/query-keys';
import { SITE_URL } from '@/lib/admin/paths';

const COUNT_LABELS: Record<string, string> = {
  events: 'Events',
  registrations: 'Registrations',
  checkins: 'Check-ins',
  speakers: 'Speakers',
  publications: 'Publications',
  venues: 'Rooms',
  assets: 'Uploads',
  streamSessions: 'Livestreams',
  contactMessages: 'Messages',
  emailLogs: 'Emails',
  admins: 'Admins',
  auditLogs: 'Audit entries',
};

function uptime(sec: number): string {
  if (sec < 90) return `${sec} seconds`;
  if (sec < 5400) return `${Math.round(sec / 60)} minutes`;
  if (sec < 172_800) return `${Math.round(sec / 3600)} hours`;
  return `${Math.round(sec / 86_400)} days`;
}

interface EmailPreview {
  template: string;
  subject: string;
  description: string | null;
}

export function useSystemStatus() {
  return useQuery({
    queryKey: adminKeys.system.detail('status'),
    queryFn: ({ signal }) => api.get<SystemStatus>('/admin/system', undefined, signal),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

/** /admin/system: health of every moving part, counts, environment, email tools, the content reset. */
export function SystemPage() {
  const q = useSystemStatus();
  return (
    <div>
      <PageHeader
        title="System"
        description="How the machine room is doing. Refreshes every 30 seconds."
        meta={q.data ? <Badge tone="outline">v{q.data.version}</Badge> : null}
        actions={
          <Button variant="secondary" icon={<RefreshCw className={cn(q.isFetching && 'animate-spin')} />} onClick={() => void q.refetch()} disabled={q.isFetching}>
            Check again
          </Button>
        }
      />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        <div className="space-y-12">
          <StatusGrid status={q.data} />
          <Counts status={q.data} />
          <Environment status={q.data} />
          <EmailTools status={q.data} />
          <DangerZone />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ status cards */

type Health = 'ok' | 'warn' | 'down';

function StatusCard({ icon: Icon, title, health, headline, children, index }: { icon: LucideIcon; title: string; health: Health; headline: ReactNode; children?: ReactNode; index: number }) {
  const reduce = useReducedMotion();
  const tone = { ok: 'bg-green-50 text-green-600', warn: 'bg-yellow-50 text-[#7a5600]', down: 'bg-red-50 text-red-600' }[health];
  const word = { ok: 'Healthy', warn: 'Heads up', down: 'Down' }[health];
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, type: 'spring', stiffness: 300, damping: 28 }}
      className={cn(
        'group flex min-w-0 flex-col rounded-[20px] border bg-white p-4 transition-[border-color,box-shadow] duration-200 hover:shadow-[var(--shadow-1)] sm:p-5',
        health === 'down' ? 'border-red/30' : health === 'warn' ? 'border-yellow/60' : 'border-line',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-surface-muted text-ink-2 transition-transform duration-300 group-hover:rotate-[-8deg]" aria-hidden="true">
            <Icon className="size-4" />
          </span>
          <span className="font-semibold text-ink">{title}</span>
        </span>
        <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold', tone)}>
          <span className={cn('size-1.5 rounded-full', health === 'ok' ? 'bg-green' : health === 'warn' ? 'bg-yellow' : 'animate-pulse bg-red')} aria-hidden="true" />
          {word}
        </span>
      </div>
      <p className="mt-4 font-display text-[1.375rem] leading-tight font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.25]">{headline}</p>
      {children ? <div className="mt-1.5 space-y-1 text-[0.8125rem] text-ink-3">{children}</div> : null}
    </motion.li>
  );
}

function StatusGrid({ status: s }: { status: SystemStatus | undefined }) {
  if (!s) {
    return (
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-busy="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-40 w-full" rounded="lg" />
        ))}
      </ul>
    );
  }
  const outbox = s.email.provider === 'outbox';
  const slowDb = s.database.ok && (s.database.latencyMs ?? 0) > 150;
  return (
    <section aria-label="Health" className="space-y-3">
      {outbox ? (
        <Callout tone="yellow" icon={<MailWarning />} title="Emails are not leaving the building.">
          <code className="mono text-[0.8125rem]">RESEND_API_KEY</code> is not set on the API, so tickets, reminders and replies are written to{' '}
          <code className="mono text-[0.8125rem]">apps/api/.mail-outbox/</code> instead of being sent. Nobody gets them. Fine for development, not for a real Friday.
        </Callout>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatusCard index={0} icon={Database} title="Database" health={s.database.ok ? (slowDb ? 'warn' : 'ok') : 'down'} headline={s.database.ok ? `${s.database.latencyMs ?? '?'} ms` : 'No answer'}>
          <p>{s.database.ok ? (slowDb ? 'Answering, but slowly.' : 'Round trip for a tiny query.') : 'Postgres is not answering. Everything else will fail too.'}</p>
        </StatusCard>
        <StatusCard index={1} icon={HardDrive} title="Storage" health={s.storage.ok ? 'ok' : 'down'} headline={s.storage.ok ? 'Reachable' : 'Unreachable'}>
          <p className="truncate">
            Bucket <span className="mono text-ink-2">{s.storage.bucket}</span>
          </p>
          <p className="mono truncate">{s.storage.endpoint}</p>
        </StatusCard>
        <StatusCard index={2} icon={outbox ? MailWarning : Mail} title="Email" health={outbox ? 'warn' : s.email.ok ? 'ok' : 'down'} headline={outbox ? 'Outbox only' : 'Resend'}>
          <p className="truncate">{s.email.from}</p>
          <p>{outbox ? 'Written to files, not sent.' : 'Sending for real.'}</p>
        </StatusCard>
        <StatusCard index={3} icon={RadioTower} title="Media server" health={s.media.ok ? 'ok' : 'down'} headline={s.media.ok ? `${s.media.activePaths} live ${s.media.activePaths === 1 ? 'input' : 'inputs'}` : 'Not reachable'}>
          <p>{s.media.ok ? 'MediaMTX is up. OBS can connect.' : 'The API cannot reach MediaMTX. Livestreams will not start.'}</p>
        </StatusCard>
        <StatusCard index={4} icon={Briefcase} title="Jobs" health={!s.jobs.ok ? 'down' : s.jobs.failed24h > 0 ? 'warn' : 'ok'} headline={`${formatNumber(s.jobs.queued)} queued`}>
          <p>
            {s.jobs.failed24h > 0 ? `${s.jobs.failed24h} failed in the last 24 hours.` : s.jobs.ok ? 'Nothing failed in the last 24 hours.' : 'The job worker is not answering.'}
          </p>
        </StatusCard>
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ counts */

function Counts({ status: s }: { status: SystemStatus | undefined }) {
  const entries = s ? Object.keys(COUNT_LABELS).filter((k) => k in s.counts).map((k) => [k, s.counts[k]!] as const) : [];
  return (
    <Section aside title="What is in here" description="Row counts, straight from the database.">
      {s ? (
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[20px] border border-line bg-line sm:grid-cols-3 2xl:grid-cols-4">
          {entries.map(([k, n]) => (
            <div key={k} className="bg-white px-4 py-3.5">
              <dt className="text-[0.8125rem] text-ink-3">{COUNT_LABELS[k]}</dt>
              <dd className="mono mt-0.5 text-xl font-semibold text-ink tabular-nums">{n < 0 ? '?' : formatNumber(n)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <Skeleton className="h-48 w-full" rounded="lg" />
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ environment */

function Environment({ status: s }: { status: SystemStatus | undefined }) {
  const apiUrl = (process.env.NEXT_PUBLIC_API_PUBLIC_URL ?? '').replace(/\/$/, '') || 'Not set';
  const browserTz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'unknown';
  return (
    <Section aside title="Environment" description="Handy when something works on your laptop and not on the server.">
      {s ? (
        <div className="space-y-5">
          <KeyValue
            items={[
              { label: 'API version', value: s.version, mono: true },
              { label: 'Server time', value: <DateText value={s.now} format="datetime" />, hint: `API up for ${uptime(s.uptimeSec)}.` },
              {
                label: 'Your browser',
                value: browserTz,
                hint: browserTz === 'Asia/Jakarta' ? 'Same as WIB.' : 'Not Jakarta. The studio still shows every time in WIB.',
              },
              { label: 'Public site', value: <span className="mono text-sm">{SITE_URL}</span> },
              { label: 'Public API', value: <span className="mono text-sm">{apiUrl}</span>, hint: 'Images, video, the livestream and the live feed come from here.' },
            ]}
          />
          <div className="max-w-xl">
            <Field label="OBS server" hint="What stream operators paste into OBS, Settings, Stream, Server.">
              <CopyField value={s.media.rtmpUrl} />
            </Field>
          </div>
        </div>
      ) : (
        <Skeleton className="h-56 w-full" rounded="lg" />
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ email tools */

function EmailTools({ status: s }: { status: SystemStatus | undefined }) {
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previews = useQuery({
    queryKey: adminKeys.system.detail('email-previews'),
    queryFn: ({ signal }) => api.get<{ items: EmailPreview[] }>('/admin/system/email-preview', undefined, signal),
    staleTime: 5 * 60_000,
  });

  const send = async () => {
    if (!/^\S+@\S+\.\S+$/.test(to.trim())) {
      setError('That email looks off. Mind checking it?');
      return;
    }
    setError(null);
    setSending(true);
    try {
      const r = await api.post<{ status: string; error?: string | null; outboxFile?: string | null }>('/admin/system/test-email', { to: to.trim() });
      if (r.status === 'sent') notify.success(`Sent. Check ${to.trim()} in a minute.`, { celebrate: true });
      else if (r.status === 'logged') notify.info(`Written to the outbox${r.outboxFile ? ` as ${r.outboxFile.split('/').pop()}` : ''}. Nothing left the building.`);
      else notify.error(r.error || 'That did not send.');
    } catch (err) {
      notify.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Section aside title="Email" description="Send yourself the test email, or see how each message looks without registering for anything.">
      <div className="space-y-6">
        <form
          className="flex max-w-xl flex-col gap-2 sm:flex-row sm:items-start"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Field label="Send a test email to" error={error ?? undefined} className="min-w-0 flex-1">
            <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@labmgm.org" autoComplete="email" />
          </Field>
          <Button type="submit" variant="secondary" icon={<Send />} loading={sending} className="sm:mt-[1.625rem]">
            {s?.email.provider === 'outbox' ? 'Write to outbox' : 'Send test'}
          </Button>
        </form>
        <div>
          <p className="label mb-2 text-ink-4">Email previews</p>
          {previews.isPending ? (
            <Skeleton className="h-40 w-full" rounded="lg" />
          ) : previews.isError ? (
            <ErrorState size="sm" error={previews.error} onRetry={() => void previews.refetch()} />
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
              {previews.data.items.map((p) => (
                <li key={p.template}>
                  <a
                    href={`/api/v1/admin/system/email-preview/${encodeURIComponent(p.template)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{p.subject}</span>
                      <span className="block truncate text-[0.8125rem] text-ink-3">{p.description ?? p.template}</span>
                    </span>
                    <ExternalLink className="size-4 shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ danger zone */

function DangerZone() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [result, setResult] = useState<ResetContentResult | null>(null);

  const reset = async () => {
    const ok = await confirm({
      title: 'Delete all content?',
      description: (
        <>
          Every event, registration and ticket, speaker, publication, room, FAQ, team member, inbox message and uploaded file goes, including the files in the bucket.
          Admins, sessions, the audit log and site settings stay. <strong>There is no undo.</strong>
        </>
      ),
      confirmLabel: 'Delete everything',
      destructive: true,
      typeToConfirm: RESET_CONTENT_PHRASE,
    });
    if (!ok) return;
    try {
      const r = await api.post<ResetContentResult>('/admin/system/reset-content', { confirm: RESET_CONTENT_PHRASE });
      setResult(r);
      void invalidateAdmin(qc);
      notify.success('Clean slate. The site is empty now.');
    } catch (err) {
      notify.error(errorMessage(err));
    }
  };

  const total = result ? Object.values(result.deleted).reduce((a, b) => a + b, 0) : 0;
  return (
    <Section
      aside
      title={
        <span className="flex items-center gap-2 text-red-600">
          <TriangleAlert className="size-4" aria-hidden="true" /> Danger zone
        </span>
      }
      description="For the day the demo data goes and the real Fridays start."
    >
      <div className="rounded-[20px] border border-red/30 bg-red-50/40 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-semibold text-ink">Reset all content</p>
            <p className="mt-1 text-sm text-ink-2">
              Removes events, people, papers, registrations, media and messages. Keeps admins, the audit log and site settings. You will type{' '}
              <span className="mono font-semibold">{RESET_CONTENT_PHRASE}</span> to confirm.
            </p>
          </div>
          <Button variant="danger" className="shrink-0" onClick={() => void reset()}>
            Reset content
          </Button>
        </div>
        {result ? (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-white px-3 py-2.5 text-[0.8125rem] text-ink-2">
            <Activity className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
            Removed {formatNumber(total)} rows and {formatNumber(result.bucketObjects)} files, and trimmed the access of {result.adminsPruned}{' '}
            {result.adminsPruned === 1 ? 'admin' : 'admins'}. Done at {formatJakarta(new Date(), 'time')} WIB.
          </p>
        ) : null}
      </div>
    </Section>
  );
}
