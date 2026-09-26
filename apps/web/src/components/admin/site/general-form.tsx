'use client';

import { hhmmSchema, type SiteSettings } from '@zemi/shared';
import { X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { z } from 'zod';
import { VenueSelect } from '@/components/admin/fields';
import { FormField, Input, NumberInput, Select, ShapeGlyph, Switch, Textarea } from '@/components/admin/ui';
import { cn } from '@/lib/admin/cn';
import { useZodForm } from '@/lib/admin/form';
import { SettingsForm, SiteBlock, SiteSettingLoader, WithPreview, useSiteSettingSave } from './site-kit';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SAFE_HREF = /^(\/(?!\/)|https?:\/\/|mailto:)/i;

const schema = z
  .object({
    siteName: z.string().trim().min(1, 'The site needs a name.').max(80, 'Keep it under 80 characters.'),
    tagline: z.string().max(200, 'Keep it under 200 characters.'),
    labName: z.string().max(120),
    labUrl: z.string().max(300).refine((v) => !v || /^https?:\/\/\S+\.\S+/.test(v), 'That link looks off. Start it with https://'),
    defaultWeekday: z.number().int().min(0).max(6),
    defaultStart: hhmmSchema,
    defaultEnd: hhmmSchema,
    defaultVenueId: z.string().nullable(),
    defaultCapacity: z.number().int().min(1, 'At least one seat.').max(100_000).nullable(),
    announcement: z.object({
      active: z.boolean(),
      text: z.string().max(200, 'Keep it under 200 characters. It is a bar, not a letter.'),
      href: z.string().max(500).refine((v) => !v || SAFE_HREF.test(v), 'Use a path like /events/... or a full https:// link.'),
    }),
    footerNote: z.string().max(300),
  })
  .superRefine((v, ctx) => {
    if (v.defaultEnd <= v.defaultStart) ctx.addIssue({ code: 'custom', path: ['defaultEnd'], message: 'The end has to come after the start.' });
    if (v.announcement.active && !v.announcement.text.trim())
      ctx.addIssue({ code: 'custom', path: ['announcement', 'text'], message: 'Write something, or switch the bar off.' });
  });
type Values = z.infer<typeof schema>;

function toForm(g: SiteSettings['general']): Values {
  return {
    siteName: g.siteName,
    tagline: g.tagline,
    labName: g.labName,
    labUrl: g.labUrl,
    defaultWeekday: g.defaultWeekday,
    defaultStart: g.defaultStart,
    defaultEnd: g.defaultEnd,
    defaultVenueId: g.defaultVenueId ?? null,
    defaultCapacity: g.defaultCapacity ?? null,
    announcement: { active: g.announcement.active, text: g.announcement.text, href: g.announcement.href ?? '' },
    footerNote: g.footerNote,
  };
}

function toPayload(v: Values): Partial<SiteSettings['general']> {
  return {
    ...v,
    siteName: v.siteName.trim(),
    tagline: v.tagline.trim(),
    announcement: { active: v.announcement.active, text: v.announcement.text.trim(), href: v.announcement.href.trim() || null },
  };
}

export function GeneralSettings() {
  return <SiteSettingLoader settingKey="general">{(data) => <GeneralForm data={data} />}</SiteSettingLoader>;
}

function GeneralForm({ data }: { data: SiteSettings['general'] }) {
  const form = useZodForm(schema, { defaultValues: toForm(data) });
  const { save, saving } = useSiteSettingSave({ settingKey: 'general', form, toForm, toPayload });
  const ann = form.watch('announcement');
  const start = form.watch('defaultStart');
  const end = form.watch('defaultEnd');
  const weekday = form.watch('defaultWeekday');

  return (
    <SettingsForm form={form} save={() => void save()} saving={saving}>
      <SiteBlock title="Announcement bar" description="A thin yellow bar above every public page. For room changes, a special guest, or the last Friday of the semester.">
        <WithPreview preview={<AnnouncementPreview active={ann.active} text={ann.text} href={ann.href} />}>
          <FormField control={form.control} name="announcement.active" label="Show the bar" hideLabel>
            {(field) => (
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                label="Show the bar"
                description={field.value ? 'Live on every public page. Visitors can dismiss it, a new message shows again.' : 'Off. Nothing shows.'}
              />
            )}
          </FormField>
          <FormField control={form.control} name="announcement.text" label="Message" maxLength={200} hint="One short line. Say what changed and where.">
            {(field) => <Input {...field} placeholder="Zemi #98 moves to Theater A. Same coffee." />}
          </FormField>
          <FormField control={form.control} name="announcement.href" label="Link" optional hint="Where a click goes. A path on this site (/events/...) or a full link.">
            {(field) => <Input {...field} placeholder="/events/zemi-98" spellCheck={false} />}
          </FormField>
        </WithPreview>
      </SiteBlock>

      <div className="grid gap-5 lg:grid-cols-2">
        <SiteBlock title="Name and lab" description="Shown in the nav, the footer, emails and browser tabs.">
          <div className="grid gap-4">
            <FormField control={form.control} name="siteName" label="Site name" required maxLength={80}>
              {(field) => <Input {...field} />}
            </FormField>
            <FormField control={form.control} name="tagline" label="Tagline" maxLength={200}>
              {(field) => <Textarea {...field} autosize minRows={2} maxRows={4} />}
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="labName" label="Lab name" maxLength={120}>
                {(field) => <Input {...field} />}
              </FormField>
              <FormField control={form.control} name="labUrl" label="Lab website">
                {(field) => <Input {...field} type="url" inputMode="url" spellCheck={false} placeholder="https://labmgm.org" />}
              </FormField>
            </div>
            <FormField control={form.control} name="footerNote" label="Footer note" maxLength={300} hint="The small line at the very bottom of every page.">
              {(field) => <Input {...field} />}
            </FormField>
          </div>
        </SiteBlock>

        <SiteBlock title="Defaults for a new Friday" description="What the “New event” form fills in. Every event can still change them.">
          <div className="grid gap-4">
            <FormField control={form.control} name="defaultWeekday" label="Day">
              {(field) => (
                <Select
                  value={String(field.value)}
                  onValueChange={(v) => field.onChange(Number(v ?? 5))}
                  options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d, description: i === 5 ? 'The classic' : undefined }))}
                />
              )}
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="defaultStart" label="Starts (WIB)">
                {(field) => <Input {...field} type="time" />}
              </FormField>
              <FormField control={form.control} name="defaultEnd" label="Ends (WIB)">
                {(field) => <Input {...field} type="time" />}
              </FormField>
            </div>
            <p className="-mt-1 text-[0.8125rem] text-ink-3">
              New events land on {WEEKDAYS[weekday] ?? 'Friday'}s, {start || '13:15'} to {end || '15:15'} WIB.
            </p>
            <FormField control={form.control} name="defaultVenueId" label="Room" optional hint="The usual room. Pick nothing if it moves around.">
              {(field) => <VenueSelect value={field.value} onChange={(id) => field.onChange(id)} />}
            </FormField>
            <FormField control={form.control} name="defaultCapacity" label="Seats" optional hint="Registration closes when it is full. Empty means no limit.">
              {(field) => <NumberInput value={field.value} onChange={field.onChange} min={1} unit="seats" />}
            </FormField>
          </div>
        </SiteBlock>
      </div>
    </SettingsForm>
  );
}

/* ------------------------------------------------------------------ preview */

function AnnouncementPreview({ active, text, href }: { active: boolean; text: string; href: string }) {
  const reduce = useReducedMotion();
  const t = text.trim();
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-1)]" aria-label="Announcement preview">
      <div className="flex items-center gap-1.5 border-b border-line bg-surface-muted/70 px-3 py-2" aria-hidden="true">
        <span className="size-2.5 rounded-full bg-red/70" />
        <span className="size-2.5 rounded-full bg-yellow/80" />
        <span className="size-2.5 rounded-full bg-green/70" />
        <span className="mono ml-2 truncate text-[0.6875rem] text-ink-4">zemi.labmgm.org</span>
      </div>
      <AnimatePresence initial={false}>
        {active && t ? (
          <motion.div
            key="bar"
            initial={reduce ? { opacity: 0 } : { height: 0 }}
            animate={reduce ? { opacity: 1 } : { height: 'auto' }}
            exit={reduce ? { opacity: 0 } : { height: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="overflow-hidden"
          >
            <div className="flex h-9 items-center gap-2.5 bg-yellow px-3 text-[0.8125rem] font-bold text-ink">
              <ShapeGlyph shape="triangle" className="size-2 shrink-0 rotate-90" />
              <span className={cn('min-w-0 flex-1 truncate', href && 'underline decoration-ink/30 underline-offset-4')}>{t}</span>
              <X className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="space-y-3 p-4" aria-hidden="true">
        <div className="flex items-center justify-between">
          <span className="font-display text-sm font-black tracking-[-0.04em]">zemı</span>
          <span className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-8 rounded-full bg-line" />
            ))}
          </span>
        </div>
        <div className="h-5 w-3/4 rounded-md bg-surface-muted" />
        <div className="h-5 w-1/2 rounded-md bg-surface-muted" />
        <div className="h-16 rounded-xl bg-blue-50" />
      </div>
      {!active || !t ? <p className="border-t border-line px-4 py-2.5 text-[0.8125rem] text-ink-3">{active ? 'Type a message to see the bar.' : 'The bar is off, so the page starts with the nav.'}</p> : null}
    </div>
  );
}

