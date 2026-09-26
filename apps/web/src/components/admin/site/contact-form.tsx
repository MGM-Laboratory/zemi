'use client';

import { linkSchema, type LinkItem, type SiteSettings } from '@zemi/shared';
import { ExternalLink, MapPin } from 'lucide-react';
import { Controller } from 'react-hook-form';
import { z } from 'zod';
import { LinksEditor, TagsInput } from '@/components/admin/fields';
import { Field, FormField, Input, Textarea } from '@/components/admin/ui';
import { useZodForm } from '@/lib/admin/form';
import { SettingsForm, SiteBlock, SiteSettingLoader, useSiteSettingSave } from './site-kit';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const schema = z.object({
  title: z.string().trim().min(1, 'The page needs a title.').max(160),
  intro: z.string().max(600),
  email: z.string().trim().max(200).refine((v) => !v || EMAIL.test(v), 'That email looks off. Mind checking it?'),
  whatsapp: z
    .string()
    .max(40)
    .refine((v) => !v || /^\+?[\d\s-]{8,20}$/.test(v), 'Use the full number with the country code, like +62 812 3456 7890.'),
  address: z.string().max(400),
  mapsUrl: z.string().max(2048).refine((v) => !v || /^https?:\/\/\S+$/.test(v), 'Paste the full Google Maps link, starting with https://'),
  officeHours: z.string().max(200),
  socials: z.array(linkSchema).max(12, 'Twelve links at most.'),
  topics: z.array(z.string().max(60)).min(1, 'Keep at least one topic, the form needs it.').max(10, 'Ten topics at most.'),
  notifyEmails: z.array(z.string().refine((v) => EMAIL.test(v), 'One of these is not an email.')).max(10, 'Ten people at most.'),
});
type Values = z.infer<typeof schema>;

const toForm = (c: SiteSettings['contact']): Values => ({
  title: c.title,
  intro: c.intro,
  email: c.email,
  whatsapp: c.whatsapp ?? '',
  address: c.address,
  mapsUrl: c.mapsUrl ?? '',
  officeHours: c.officeHours,
  socials: c.socials as LinkItem[],
  topics: c.topics,
  notifyEmails: c.notifyEmails,
});
const toPayload = (v: Values): Partial<SiteSettings['contact']> => ({
  ...v,
  email: v.email.trim(),
  whatsapp: v.whatsapp.trim() || null,
  mapsUrl: v.mapsUrl.trim() || null,
  topics: v.topics.map((t) => t.trim()).filter(Boolean),
});

function waLink(num: string) {
  const digits = num.replace(/[^\d]/g, '');
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}

export function ContactSettings() {
  return <SiteSettingLoader settingKey="contact">{(data) => <ContactForm data={data} />}</SiteSettingLoader>;
}

function ContactForm({ data }: { data: SiteSettings['contact'] }) {
  const form = useZodForm(schema, { defaultValues: toForm(data) });
  const { save, saving } = useSiteSettingSave({ settingKey: 'contact', form, toForm, toPayload });
  const [whatsapp, mapsUrl, notify] = form.watch(['whatsapp', 'mapsUrl', 'notifyEmails']);
  const wa = waLink(whatsapp);

  return (
    <SettingsForm form={form} save={() => void save()} saving={saving}>
      <SiteBlock title="Top of the page" description="What people read before the form.">
        <div className="grid gap-4">
          <FormField control={form.control} name="title" label="Title" required maxLength={160}>
            {(field) => <Input {...field} />}
          </FormField>
          <FormField control={form.control} name="intro" label="Intro" maxLength={600}>
            {(field) => <Textarea {...field} autosize minRows={2} maxRows={6} />}
          </FormField>
        </div>
      </SiteBlock>

      <div className="grid gap-5 lg:grid-cols-2">
        <SiteBlock title="How to reach you" description="Shown next to the form. Leave a field empty to hide it.">
          <div className="grid gap-4">
            <FormField control={form.control} name="email" label="Email" maxLength={200}>
              {(field) => <Input {...field} type="email" inputMode="email" autoComplete="off" placeholder="zemi@labmgm.org" />}
            </FormField>
            <FormField
              control={form.control}
              name="whatsapp"
              label="WhatsApp"
              optional
              hint="With the country code. The page turns it into a chat link."
              action={
                wa ? (
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-blue-600 hover:underline">
                    Test it <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                ) : null
              }
            >
              {(field) => <Input {...field} type="tel" inputMode="tel" placeholder="+62 812 3456 7890" />}
            </FormField>
            <FormField control={form.control} name="officeHours" label="Office hours" maxLength={200}>
              {(field) => <Input {...field} placeholder="Weekdays, 09:00 to 16:00 WIB" />}
            </FormField>
            <FormField control={form.control} name="address" label="Address" maxLength={400}>
              {(field) => <Textarea {...field} autosize minRows={2} maxRows={5} />}
            </FormField>
            <FormField
              control={form.control}
              name="mapsUrl"
              label="Google Maps link"
              optional
              action={
                /^https?:\/\//.test(mapsUrl) ? (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-blue-600 hover:underline">
                    <MapPin className="size-3" aria-hidden="true" /> Open
                  </a>
                ) : null
              }
            >
              {(field) => <Input {...field} type="url" inputMode="url" spellCheck={false} placeholder="https://maps.app.goo.gl/..." />}
            </FormField>
          </div>
        </SiteBlock>

        <div className="space-y-5">
          <SiteBlock title="Topics" description="The choices in the form's topic menu. “I want to present” is the one the about page links to.">
            <FormField control={form.control} name="topics" label="Topics" hideLabel>
              {(field) => <TagsInput value={field.value} onChange={field.onChange} max={10} maxLength={60} normalize={false} placeholder="Add a topic" />}
            </FormField>
          </SiteBlock>
          <SiteBlock
            title="Who hears about new messages"
            description={
              notify.length
                ? `We email ${notify.length === 1 ? 'this person' : `these ${notify.length} people`} the moment a message arrives. Replies go straight to the sender.`
                : 'Nobody yet. Messages still land in the inbox, but nobody gets pinged.'
            }
          >
            <Controller
              control={form.control}
              name="notifyEmails"
              render={({ field, fieldState }) => {
                const err = fieldState.error?.message ?? (Array.isArray(fieldState.error) ? (fieldState.error as Array<{ message?: string } | undefined>).find(Boolean)?.message : undefined);
                return (
                  <Field label="Emails" hideLabel error={err}>
                    <TagsInput value={field.value} onChange={field.onChange} max={10} maxLength={254} placeholder="name@labmgm.org" />
                  </Field>
                );
              }}
            />
          </SiteBlock>
        </div>
      </div>

      <SiteBlock title="Socials" description="Instagram, YouTube, LinkedIn and friends. The icon comes from the link.">
        <Controller
          control={form.control}
          name="socials"
          render={({ field, fieldState }) => {
            const rowErrors = (fieldState.error as unknown as Record<number, { url?: { message?: string }; label?: { message?: string } }> | undefined) ?? undefined;
            const errors = rowErrors
              ? Object.fromEntries(Object.entries(rowErrors).filter(([k]) => /^\d+$/.test(k)).map(([k, v]) => [Number(k), { url: v?.url?.message, label: v?.label?.message }]))
              : undefined;
            return <LinksEditor value={field.value} onChange={field.onChange} max={12} errors={errors} addLabel="Add a social link" />;
          }}
        />
      </SiteBlock>
    </SettingsForm>
  );
}
