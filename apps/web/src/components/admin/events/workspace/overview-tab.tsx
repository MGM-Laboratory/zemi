'use client';

import {
  ArrowRight,
  Check,
  CircleDashed,
  Clock3,
  Film,
  Images,
  Mail,
  Radio,
  ScanLine,
  Users,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Character } from '@/components/admin/characters/character';
import { Card, CardHeader } from '@/components/admin/ui/card';
import { DateText, StatCard } from '@/components/admin/ui/display';
import { AvatarStack } from '@/components/admin/ui/media';
import { ProgressRing } from '@/components/admin/ui/progress';
import { cn } from '@/lib/admin/cn';
import { formatPercent } from '@/lib/admin/format';
import { adminRoutes } from '@/lib/admin/nav';
import { readinessChecklist, WORKSPACE_TABS, type WorkspaceTabKey } from '../lib';
import { CoverThumb, SeatsBar } from '../parts';
import { useWorkspaceEvent } from '../use-event';

/** Workspace root: readiness checklist, key numbers and quick links. */
export function EventOverviewTab() {
  const { event, id, perms, status } = useWorkspaceEvent();
  const reduce = useReducedMotion();
  const items = readinessChecklist(event);
  const known = items.filter((i) => i.done !== null);
  const done = known.filter((i) => i.done).length;
  const allDone = known.length > 0 && done === known.length;
  const tabVisible = (k: WorkspaceTabKey) =>
    WORKSPACE_TABS.find((t) => t.key === k)?.visible(perms) ?? false;
  const canFix = perms.has('edit') || perms.has('publish');
  const rate = event.counts.registrations
    ? event.counts.checkedIn / event.counts.registrations
    : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-6">
        {/* Key numbers */}
        <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
          <StatCard
            label="Registered"
            value={event.counts.registrations.toLocaleString('en-US')}
            accent="blue"
            hint={event.capacity ? `of ${event.capacity} seats` : 'no seat cap'}
            icon={<Users />}
          />
          <StatCard
            label="Checked in"
            value={event.counts.checkedIn.toLocaleString('en-US')}
            accent="green"
            hint={
              status === 'scheduled' && !event.counts.checkedIn
                ? 'doors open on the day'
                : rate != null
                  ? `${formatPercent(rate)} of registrations`
                  : 'nobody to check in'
            }
            icon={<ScanLine />}
          />
          <StatCard
            label="In the room"
            value={event.counts.inPerson.toLocaleString('en-US')}
            accent="yellow"
            hint="planned in person"
          />
          <StatCard
            label="On the stream"
            value={event.counts.online.toLocaleString('en-US')}
            accent="red"
            hint="planned online"
            icon={<Radio />}
          />
        </section>

        {/* Readiness */}
        <Card>
          <CardHeader
            title={
              status === 'cancelled'
                ? 'The checklist, on pause'
                : status === 'past'
                  ? allDone
                    ? 'It was good to go'
                    : 'What the page still misses'
                  : allDone
                    ? 'Good to go'
                    : 'Getting it ready'
            }
            description={
              status === 'cancelled'
                ? 'This Friday is cancelled. The list is still here if you restore it.'
                : status === 'past'
                  ? allDone
                    ? 'Everything was in place. The page stays up for people who find it later.'
                    : 'It wrapped, but the page stays up. Filling these in helps people who find it later.'
                  : allDone
                    ? 'Everything on the list is done. Enjoy your coffee.'
                    : 'Tick these off and the Friday page looks its best.'
            }
            icon={
              <ProgressRing
                value={known.length ? done / known.length : 0}
                size={44}
                stroke={4}
                tone="green"
                label="Readiness"
              />
            }
          />
          <ul className="divide-y divide-line">
            {items.map((it, i) => {
              const fixHref = adminRoutes.event(
                id,
                WORKSPACE_TABS.find((t) => t.key === it.tab)?.path || undefined,
              );
              const canOpen =
                tabVisible(it.tab) && it.done !== true && (canFix || it.tab === 'stream');
              return (
                <motion.li
                  key={it.key}
                  initial={reduce ? false : { opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full border',
                      it.done === true
                        ? 'border-green bg-green text-white'
                        : it.done === null
                          ? 'border-dashed border-line-strong text-ink-4'
                          : 'border-line-strong bg-white text-ink-4',
                    )}
                    aria-hidden="true"
                  >
                    {it.done === true ? (
                      <Check className="size-4" strokeWidth={3} />
                    ) : it.done === null ? (
                      <CircleDashed className="size-4" />
                    ) : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-[0.9375rem] font-medium',
                        it.done ? 'text-ink-2' : 'text-ink',
                      )}
                    >
                      {it.label}
                      <span className="sr-only">
                        {it.done === true
                          ? ', done'
                          : it.done === null
                            ? ', not sure yet'
                            : ', not done yet'}
                      </span>
                    </p>
                    <p className="text-[0.8125rem] text-ink-3">
                      {it.done === null ? 'Not sure yet. ' : ''}
                      {it.hint}
                    </p>
                  </div>
                  {canOpen ? (
                    <Link
                      href={fixHref}
                      className="group inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium text-blue transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      {it.done === null ? 'Check' : 'Fix it'}
                      <ArrowRight
                        className="size-3.5 transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </Link>
                  ) : null}
                </motion.li>
              );
            })}
          </ul>
        </Card>

        {/* Quick links */}
        <section aria-label="Quick links" className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {tabVisible('registrations') ? (
            <QuickLink
              href={adminRoutes.event(id, 'registrations')}
              icon={<Users />}
              title="Registrations"
              text={`${event.counts.registrations} people. Search, export, resend tickets.`}
              tone="blue"
            />
          ) : null}
          {tabVisible('attendance') && event.mode !== 'online' ? (
            <QuickLink
              href={adminRoutes.event(id, 'attendance')}
              icon={<ScanLine />}
              title="Door scanner"
              text="Scan tickets at the door. Works on a phone."
              tone="green"
            />
          ) : null}
          {tabVisible('stream') && event.mode !== 'offline' ? (
            <QuickLink
              href={adminRoutes.event(id, 'stream')}
              icon={<Radio />}
              title="Stream"
              text="OBS keys, preview, go live, recordings."
              tone="red"
              live={event.stream.state === 'live'}
            />
          ) : null}
          {tabVisible('media') ? (
            <QuickLink
              href={adminRoutes.event(id, 'media')}
              icon={<Images />}
              title="Documentation"
              text={
                event.media.length
                  ? `${event.media.length} photos and videos.`
                  : 'Photos and videos from the day.'
              }
              tone="yellow"
            />
          ) : null}
          {tabVisible('emails') ? (
            <QuickLink
              href={adminRoutes.event(id, 'emails')}
              icon={<Mail />}
              title="Email registrants"
              text="Room change? Slides? Tell everyone at once."
              tone="blue"
            />
          ) : null}
          {event.recordings.length ? (
            <QuickLink
              href={adminRoutes.event(id, 'stream')}
              icon={<Film />}
              title="Recording"
              text="The recording is ready to watch."
              tone="green"
              hidden={!tabVisible('stream')}
            />
          ) : null}
        </section>
      </div>

      {/* Side: site preview + lineup */}
      <aside className="min-w-0 space-y-6" aria-label="Summary">
        <Card padding="sm" className="group">
          <p className="label mb-3 px-1 text-ink-3">On the site</p>
          <div className="flex gap-4">
            <CoverThumb
              image={event.cover}
              accent={event.accent}
              title={event.title}
              width={96}
              rounded="lg"
              sizes="192px"
            />
            <div className="min-w-0 py-1">
              <p className="line-clamp-3 font-display text-[1.0625rem] leading-tight font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.3]">
                {event.title}
              </p>
              <p className="mt-1.5 text-[0.8125rem] text-ink-3">
                <DateText value={event.startsAt} format="date" />
              </p>
              {event.summary ? (
                <p className="mt-1.5 line-clamp-3 text-[0.8125rem] text-ink-2">{event.summary}</p>
              ) : (
                <p className="mt-1.5 text-[0.8125rem] text-ink-3">No summary yet.</p>
              )}
            </div>
          </div>
          <div className="mt-4 px-1">
            <SeatsBar registrations={event.counts.registrations} capacity={event.capacity} />
          </div>
        </Card>

        <Card padding="sm">
          <div className="mb-3 flex items-center justify-between px-1">
            <p className="label text-ink-3">Lineup</p>
            {tabVisible('speakers') ? (
              <Link
                href={adminRoutes.event(id, 'speakers')}
                className="text-sm font-medium text-blue hover:underline"
              >
                {perms.has('edit') ? 'Edit' : 'See all'}
              </Link>
            ) : null}
          </div>
          {event.speakersFull.length ? (
            <div className="space-y-3 px-1">
              <AvatarStack
                people={event.speakersFull.map((s) => ({ name: s.fullName, image: s.avatar }))}
                size={32}
                max={6}
              />
              <ul className="space-y-1.5">
                {event.speakersFull.map((s) => (
                  <li key={s.id} className="text-sm">
                    <span className="font-medium text-ink">{s.fullName}</span>
                    {s.talkTitle ? <span className="text-ink-3">, {s.talkTitle}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-1 text-sm text-ink-3">
              <Character shape="circle" mood="look" size={34} lookAt={{ x: 0.9, y: 0 }} />
              Nobody on the lineup yet.
            </div>
          )}
          {event.rundown.length ? (
            <div className="mt-4 border-t border-line px-1 pt-3">
              <p className="label mb-2 text-ink-3">Rundown</p>
              <ol className="space-y-1">
                {event.rundown.slice(0, 6).map((r) => (
                  <li key={r.id} className="flex gap-3 text-sm">
                    <span className="mono w-11 shrink-0 text-ink-3">{r.time}</span>
                    <span className="min-w-0 truncate text-ink-2">{r.agenda}</span>
                  </li>
                ))}
                {event.rundown.length > 6 ? (
                  <li className="text-xs text-ink-3">and {event.rundown.length - 6} more</li>
                ) : null}
              </ol>
            </div>
          ) : null}
        </Card>

        <p className="flex items-center gap-2 px-1 text-xs text-ink-3">
          <Clock3 className="size-3.5" aria-hidden="true" />
          Last edited <DateText value={event.updatedAt} format="relative" />
        </p>
      </aside>
    </div>
  );
}

const TONE = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-green-50 text-green-600',
  red: 'bg-red-50 text-[#b42525]',
  yellow: 'bg-yellow-50 text-[#7a5600]',
} as const;

function QuickLink({
  href,
  icon,
  title,
  text,
  tone,
  live,
  hidden,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  text: string;
  tone: keyof typeof TONE;
  live?: boolean;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <Link
      href={href}
      className="group relative flex items-start gap-3 rounded-[20px] border border-line bg-white p-4 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.99]"
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:rotate-[-8deg] [&_svg]:size-5',
          TONE[tone],
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-semibold text-ink">
          {title}
          {live ? (
            <span className="relative flex size-2" aria-label="Live">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-red/70" />
              <span className="relative inline-flex size-2 rounded-full bg-red" />
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[0.8125rem] leading-snug text-ink-3">{text}</span>
      </span>
      <ArrowRight
        className="mt-1 size-4 shrink-0 text-ink-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink"
        aria-hidden="true"
      />
    </Link>
  );
}
