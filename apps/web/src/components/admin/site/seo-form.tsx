'use client';

import type { ImageRef, SiteSettings } from '@zemi/shared';
import { Globe, ImageOff } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { ImageUploadCrop, TagsInput } from '@/components/admin/fields';
import { AdminImage, FormField, Input, SegmentedControl, Textarea } from '@/components/admin/ui';
import { cn } from '@/lib/admin/cn';
import { useZodForm } from '@/lib/admin/form';
import { useAssetPoll } from '@/lib/admin/hooks';
import { SITE_URL } from '@/lib/admin/paths';
import { SettingsForm, SiteBlock, SiteSettingLoader, WithPreview, useSiteSettingSave } from './site-kit';

const TITLE_IDEAL = 60;
const DESC_IDEAL = 160;
/** 1200 x 630, what Facebook, LinkedIn, WhatsApp and X all crop to. */
export const OG_ASPECT = 1200 / 630;

const schema = z.object({
  title: z.string().trim().min(1, 'Search results need a title.').max(120, 'Keep it under 120 characters.'),
  description: z.string().trim().min(1, 'Write a sentence or two. Google shows it under the title.').max(300, 'Keep it under 300 characters.'),
  ogImageAssetId: z.string().nullable(),
  keywords: z.array(z.string().max(60)).max(30, 'Thirty is plenty.'),
});
type Values = z.infer<typeof schema>;

const toForm = (s: SiteSettings['seo']): Values => ({ title: s.title, description: s.description, ogImageAssetId: s.ogImageAssetId ?? null, keywords: s.keywords });
const toPayload = (v: Values): Partial<SiteSettings['seo']> => ({ ...v, title: v.title.trim(), description: v.description.trim() });

export function SeoSettings() {
  return <SiteSettingLoader settingKey="seo">{(data) => <SeoForm data={data} />}</SiteSettingLoader>;
}

function LengthHint({ n, ideal, max }: { n: number; ideal: number; max: number }) {
  const tone = n === 0 ? 'text-ink-4' : n <= ideal ? 'text-green-600' : n <= max ? 'text-[#8a5a00]' : 'text-red-600';
  return (
    <span className={cn('text-[0.8125rem]', tone)}>
      {n <= ideal ? `Fits. Google shows about ${ideal} characters.` : `Google will cut it around character ${ideal}.`}
    </span>
  );
}

function SeoForm({ data }: { data: SiteSettings['seo'] }) {
  const form = useZodForm(schema, { defaultValues: toForm(data) });
  const { save, saving } = useSiteSettingSave({ settingKey: 'seo', form, toForm, toPayload });
  const title = form.watch('title');
  const description = form.watch('description');
  const ogId = form.watch('ogImageAssetId');
  const og = useAssetPoll(ogId);
  const image = og.data?.id === ogId ? (og.data?.image ?? null) : null;

  return (
    <SettingsForm form={form} save={() => void save()} saving={saving}>
      <SiteBlock title="Search results" description="What Google shows for the home page. Pages like events and speakers write their own.">
        <WithPreview preview={<SerpPreview title={title} description={description} />} previewLabel="On Google">
          <FormField control={form.control} name="title" label="Title" required maxLength={120} hint={<LengthHint n={title.length} ideal={TITLE_IDEAL} max={120} />}>
            {(field) => <Input {...field} />}
          </FormField>
          <FormField control={form.control} name="description" label="Description" required maxLength={300} hint={<LengthHint n={description.length} ideal={DESC_IDEAL} max={300} />}>
            {(field) => <Textarea {...field} autosize minRows={3} maxRows={6} />}
          </FormField>
          <FormField control={form.control} name="keywords" label="Keywords" optional hint="Search engines mostly ignore these, but a few directories still read them.">
            {(field) => <TagsInput value={field.value} onChange={field.onChange} max={30} maxLength={60} normalize={false} placeholder="Add a keyword" />}
          </FormField>
        </WithPreview>
      </SiteBlock>

      <SiteBlock title="Share image" description="The picture that shows up when someone pastes the link in WhatsApp, Telegram, LinkedIn or X. 1200 by 630 works everywhere.">
        <WithPreview preview={<SharePreviews title={title} description={description} image={image} />} previewLabel="In chat apps">
          <FormField control={form.control} name="ogImageAssetId" label="Image" hideLabel>
            {(field) => (
              <ImageUploadCrop
                purpose="site"
                aspect={OG_ASPECT}
                value={field.value}
                onChange={(id) => field.onChange(id)}
                alt="Zemi, the Friday seminar"
                hint="PNG or JPG, at least 1200 px wide. Keep text away from the edges, some apps crop a little."
                className="w-full max-w-xl"
              />
            )}
          </FormField>
        </WithPreview>
      </SiteBlock>
    </SettingsForm>
  );
}

/* ------------------------------------------------------------------ previews */

function cut(text: string, n: number) {
  const t = text.trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}...` : t;
}

function SerpPreview({ title, description }: { title: string; description: string }) {
  const host = SITE_URL.replace(/^https?:\/\//, '');
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-1)] sm:p-5" aria-label="Search result preview">
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 items-center justify-center rounded-full border border-line bg-surface-muted" aria-hidden="true">
          <Globe className="size-3.5 text-ink-3" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[0.875rem] text-ink">Zemi</span>
          <span className="block truncate text-[0.75rem] text-ink-3">{host}</span>
        </span>
      </div>
      <p className="mt-2 text-[1.25rem] leading-snug text-[#1a0dab] [overflow-wrap:anywhere]">{cut(title || 'Your title', TITLE_IDEAL)}</p>
      <p className="mt-1 text-[0.875rem] leading-relaxed text-[#4d5156] [overflow-wrap:anywhere]">{cut(description || 'Your description.', DESC_IDEAL)}</p>
    </div>
  );
}

function SharePreviews({ title, description, image }: { title: string; description: string; image: ImageRef | null }) {
  const [app, setApp] = useState<'chat' | 'card'>('chat');
  const host = SITE_URL.replace(/^https?:\/\//, '');
  const pic = (
    <div className="relative aspect-[1200/630] w-full overflow-hidden bg-surface-muted">
      {image ? (
        <AdminImage image={image} sizes="420px" alt="" className="absolute inset-0 size-full" />
      ) : (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-[0.8125rem] text-ink-4">
          <ImageOff className="size-5" aria-hidden="true" />
          No share image yet
        </span>
      )}
    </div>
  );
  return (
    <div className="space-y-3">
      <SegmentedControl
        aria-label="Preview style"
        size="sm"
        value={app}
        onValueChange={setApp}
        options={[
          { value: 'chat', label: 'Chat bubble' },
          { value: 'card', label: 'Social card' },
        ]}
      />
      {app === 'chat' ? (
        <div className="rounded-2xl bg-[#e7f7e1] p-2 sm:max-w-sm" aria-label="Chat preview">
          <div className="overflow-hidden rounded-xl bg-white/80">
            {pic}
            <div className="space-y-0.5 px-3 py-2">
              <p className="line-clamp-2 text-[0.875rem] font-semibold text-ink">{title || 'Your title'}</p>
              <p className="line-clamp-2 text-[0.8125rem] text-ink-3">{description}</p>
              <p className="text-[0.75rem] text-ink-4">{host}</p>
            </div>
          </div>
          <p className="px-1.5 pt-1.5 text-[0.875rem] text-[#1a7f37] underline">{SITE_URL}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-1)]" aria-label="Social card preview">
          {pic}
          <div className="border-t border-line bg-surface-muted/60 px-4 py-3">
            <p className="text-[0.75rem] tracking-wide text-ink-4 uppercase">{host}</p>
            <p className="mt-0.5 line-clamp-1 font-semibold text-ink">{title || 'Your title'}</p>
            <p className="line-clamp-1 text-[0.8125rem] text-ink-3">{description}</p>
          </div>
        </div>
      )}
    </div>
  );
}
