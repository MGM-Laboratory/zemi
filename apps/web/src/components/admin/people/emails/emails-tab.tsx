'use client';

import { BellRing, CalendarClock, Clapperboard, Mail, Ticket } from 'lucide-react';
import type { ReactNode } from 'react';
import { useWorkspaceEvent } from '@/components/admin/events/use-event';
import { ComposeBroadcast } from './compose-broadcast';
import { EmailLog } from './email-log';

/**
 * /admin/events/[id]/emails (emails.send): write a broadcast, and see every email that went out
 * for this Friday. The automatic ones are listed on the side so nobody sends a reminder twice.
 */
export function EmailsTab() {
  const { event, id } = useWorkspaceEvent();
  return (
    <div className="space-y-10">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ComposeBroadcast event={event} />
        <aside aria-labelledby="auto-mails" className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-[24px] border border-line bg-surface-muted p-5">
            <h2 id="auto-mails" className="font-display text-lg font-extrabold tracking-[-0.02em]">
              Already on autopilot
            </h2>
            <p className="mt-1 text-sm text-ink-3">These go out by themselves. No need to write them.</p>
            <ul className="mt-4 space-y-3.5">
              <Auto icon={<Ticket />} tone="bg-blue text-white" title="Ticket">
                Right after sign-up, with the QR and a calendar file.
              </Auto>
              <Auto icon={<CalendarClock />} tone="bg-yellow text-ink" title="Reminder">
                09:00 WIB the day before.
              </Auto>
              <Auto icon={<BellRing />} tone="bg-red text-white" title="Starting now">
                Ten minutes before the start, with the room or the stream link.
              </Auto>
              <Auto icon={<Clapperboard />} tone="bg-green text-white" title="Thank you">
                After it wraps, with the recording when it is ready.
              </Auto>
            </ul>
          </section>
          <section className="rounded-[24px] border border-line bg-white p-5 text-sm text-ink-2">
            <h2 className="flex items-center gap-2 font-semibold text-ink">
              <Mail className="size-4 text-blue" aria-hidden="true" />
              How broadcasts go out
            </h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-ink-3">
              <li>One email per person, so nobody sees anyone else&apos;s address.</li>
              <li>Only people with an active seat. Cancelled seats never hear from us.</li>
              <li>Up to three broadcasts per event every ten minutes, so a double click can&apos;t spam anyone.</li>
              <li>Replies go to the reply-to address in Site settings, when one is set.</li>
            </ul>
          </section>
        </aside>
      </div>
      <EmailLog eventId={id} />
    </div>
  );
}

function Auto({ icon, tone, title, children }: { icon: ReactNode; tone: string; title: string; children: ReactNode }) {
  return (
    <li className="group flex items-start gap-3">
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110 [&_svg]:size-4 ${tone}`} aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-ink">{title}</span>
        <span className="block text-[0.8125rem] leading-snug text-ink-3">{children}</span>
      </span>
    </li>
  );
}
