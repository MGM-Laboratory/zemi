'use client';

import type { SiteSettings } from '@zemi/shared';
import { BellRing, ExternalLink, Heart, Radio } from 'lucide-react';
import Link from 'next/link';
import { z } from 'zod';
import { Callout, FormField, Input, Switch, Textarea } from '@/components/admin/ui';
import { useAbility } from '@/lib/admin/ability';
import { useZodForm } from '@/lib/admin/form';
import { adminRoutes } from '@/lib/admin/nav';
import { SettingsForm, SiteBlock, SiteSettingLoader, WithPreview, useSiteSettingSave } from './site-kit';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const schema = z.object({
  replyTo: z.string().trim().max(200).refine((v) => !v || EMAIL.test(v), 'That email looks off. Mind checking it?'),
  senderName: z.string().trim().min(1, 'Emails need a sender name.').max(80),
  signature: z.string().max(300, 'Keep the sign-off under 300 characters.'),
  sendReminders: z.boolean(),
  sendStartingNow: z.boolean(),
  sendThankYou: z.boolean(),
});
type Values = z.infer<typeof schema>;

const toForm = (e: SiteSettings['email']): Values => ({
  replyTo: e.replyTo ?? '',
  senderName: e.senderName,
  signature: e.signature,
  sendReminders: e.sendReminders,
  sendStartingNow: e.sendStartingNow,
  sendThankYou: e.sendThankYou,
});
const toPayload = (v: Values): Partial<SiteSettings['email']> => ({ ...v, replyTo: v.replyTo.trim() || null, senderName: v.senderName.trim() });

const LIFECYCLE = [
  { name: 'sendReminders', icon: BellRing, label: 'Day-before reminder', hint: 'Thursday at 09:00 WIB, with the room, the map and their ticket.' },
  { name: 'sendStartingNow', icon: Radio, label: '“Starting now”', hint: 'About 10 minutes before 13:15, with the livestream link for online folks.' },
  { name: 'sendThankYou', icon: Heart, label: 'Thank you and recording', hint: 'A few hours after the end, with the recording and photos once they are up.' },
] as const;

export function EmailSettings() {
  return <SiteSettingLoader settingKey="email">{(data) => <EmailForm data={data} />}</SiteSettingLoader>;
}

function EmailForm({ data }: { data: SiteSettings['email'] }) {
  const form = useZodForm(schema, { defaultValues: toForm(data) });
  const { save, saving } = useSiteSettingSave({ settingKey: 'email', form, toForm, toPayload });
  const ability = useAbility();
  const [sender, replyTo, signature] = form.watch(['senderName', 'replyTo', 'signature']);

  return (
    <SettingsForm form={form} save={() => void save()} saving={saving}>
      <SiteBlock title="Who it is from" description="Every email goes out from no-reply@labmgm.org. These decide how it looks in an inbox, and where replies land.">
        <WithPreview preview={<InboxPreview sender={sender} replyTo={replyTo} signature={signature} />} previewLabel="In their inbox">
          <FormField control={form.control} name="senderName" label="Sender name" required maxLength={80} hint="The name next to the subject line.">
            {(field) => <Input {...field} placeholder="Zemi" />}
          </FormField>
          <FormField control={form.control} name="replyTo" label="Replies go to" optional hint="When someone hits reply. Empty means replies bounce off no-reply.">
            {(field) => <Input {...field} type="email" inputMode="email" placeholder="zemi@labmgm.org" />}
          </FormField>
          <FormField control={form.control} name="signature" label="Sign-off" maxLength={300} hint="The last lines of every email. Line breaks are kept.">
            {(field) => <Textarea {...field} autosize minRows={2} maxRows={5} />}
          </FormField>
        </WithPreview>
      </SiteBlock>

      <SiteBlock title="Emails that go out on their own" description="Per registrant, per event. Tickets, cancellations and contact replies always send, since people need those.">
        <ul className="grid gap-2.5 md:grid-cols-3">
          {LIFECYCLE.map((l) => (
            <li key={l.name} className="flex gap-3 rounded-2xl border border-line p-4">
              <l.icon className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
              <FormField control={form.control} name={l.name} label={l.label} hideLabel className="min-w-0 flex-1">
                {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} label={l.label} description={l.hint} />}
              </FormField>
            </li>
          ))}
        </ul>
        {ability.isSuperadmin ? (
          <Callout tone="neutral" className="mt-4" icon={<ExternalLink />}>
            Want to see them?{' '}
            <Link href={adminRoutes.system} className="font-medium text-blue-600 hover:underline">
              System has a preview of every email
            </Link>
            , plus a test send.
          </Callout>
        ) : null}
      </SiteBlock>
    </SettingsForm>
  );
}

function InboxPreview({ sender, replyTo, signature }: { sender: string; replyTo: string; signature: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-1)]" aria-label="Email preview">
      <div className="space-y-1 border-b border-line px-4 py-3 text-[0.8125rem]">
        <p className="flex gap-2">
          <span className="w-14 shrink-0 text-ink-3">From</span>
          <span className="min-w-0 truncate text-ink">
            <strong className="font-semibold">{sender.trim() || 'Zemi'}</strong> <span className="text-ink-3">&lt;no-reply@labmgm.org&gt;</span>
          </span>
        </p>
        <p className="flex gap-2">
          <span className="w-14 shrink-0 text-ink-3">Reply to</span>
          <span className="min-w-0 truncate text-ink-2">{replyTo.trim() || <span className="text-ink-3">nobody, it bounces</span>}</span>
        </p>
        <p className="flex gap-2">
          <span className="w-14 shrink-0 text-ink-3">Subject</span>
          <span className="min-w-0 truncate font-medium text-ink">Tomorrow at 13:15 WIB: Zemi #98</span>
        </p>
      </div>
      <div className="space-y-3 px-4 py-4 text-[0.875rem] text-ink-2">
        <p>Hi Rina,</p>
        <p>Quick heads up: Zemi #98 is tomorrow, 13:15 to 15:15 WIB in Theater A. Your ticket is attached.</p>
        <p className="whitespace-pre-line text-ink">{signature.trim() || <span className="text-ink-3">No sign-off</span>}</p>
      </div>
    </div>
  );
}
