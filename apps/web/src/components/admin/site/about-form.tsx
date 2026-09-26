'use client';

import type { Blocks, SiteSettings } from '@zemi/shared';
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { z } from 'zod';
import { BlockEditor } from '@/components/admin/fields';
import { Field, FormField, Input, Textarea } from '@/components/admin/ui';
import { useZodForm } from '@/lib/admin/form';
import { RowsField } from './rows-field';
import { SettingsForm, SiteBlock, SiteSettingLoader, useSiteSettingSave } from './site-kit';

const card = (titleMsg: string) =>
  z.object({
    title: z.string().trim().min(1, titleMsg).max(80, 'Keep the title under 80 characters.'),
    body: z.string().max(400, 'Keep it under 400 characters.'),
  });

const schema = z.object({
  title: z.string().trim().min(1, 'The page needs a title.').max(200),
  intro: z.string().max(1200),
  story: z.array(z.record(z.string(), z.unknown())),
  pillars: z.array(card('Give the pillar a title.').extend({ shape: z.enum(['circle', 'triangle', 'square', 'arch']) })).max(8, 'Eight pillars at most.'),
  audiences: z.array(card('Who is it for?')).max(6, 'Six at most.'),
  presentSteps: z.array(card('Give the step a title.')).max(8, 'Eight steps at most.'),
  presentCta: z.string().max(80),
});
type Values = z.infer<typeof schema>;

const toForm = (a: SiteSettings['about']): Values => ({
  title: a.title,
  intro: a.intro,
  story: a.story as Blocks,
  pillars: a.pillars.map((p) => ({ ...p })),
  audiences: a.audiences.map((p) => ({ ...p })),
  presentSteps: a.presentSteps.map((p) => ({ ...p })),
  presentCta: a.presentCta,
});
const trimRows = <T extends { title: string; body: string }>(rows: T[]) => rows.map((r) => ({ ...r, title: r.title.trim(), body: r.body.trim() }));
const toPayload = (v: Values): Partial<SiteSettings['about']> => ({
  ...v,
  title: v.title.trim(),
  pillars: trimRows(v.pillars),
  audiences: trimRows(v.audiences),
  presentSteps: trimRows(v.presentSteps),
});

export function AboutSettings() {
  return <SiteSettingLoader settingKey="about">{(data) => <AboutForm data={data} />}</SiteSettingLoader>;
}

function AboutForm({ data }: { data: SiteSettings['about'] }) {
  const form = useZodForm(schema, { defaultValues: toForm(data) });
  // BlockEditor reads its value once; a new key remounts it after save or discard.
  const [storyKey, setStoryKey] = useState(0);
  const { save, saving } = useSiteSettingSave({
    settingKey: 'about',
    form,
    toForm: (saved) => {
      setStoryKey((k) => k + 1);
      return toForm(saved);
    },
    toPayload,
  });

  return (
    <SettingsForm
      form={form}
      save={() => void save()}
      saving={saving}
      onDiscard={() => {
        form.reset();
        setStoryKey((k) => k + 1);
      }}
    >
      <SiteBlock title="Top of the page" description="A headline and a short intro. Plain words, no mission statement.">
        <div className="grid gap-4">
          <FormField control={form.control} name="title" label="Title" required maxLength={200}>
            {(field) => <Textarea {...field} autosize minRows={1} maxRows={3} className="font-display text-lg font-extrabold" />}
          </FormField>
          <FormField control={form.control} name="intro" label="Intro" maxLength={1200}>
            {(field) => <Textarea {...field} autosize minRows={3} maxRows={10} />}
          </FormField>
        </div>
      </SiteBlock>

      <SiteBlock title="The story" description="How Zemi started and why it keeps going. Headings, lists, quotes and photos all work. Type / for blocks.">
        <Controller
          control={form.control}
          name="story"
          render={({ field }) => (
            <Field label="Story" hideLabel>
              <BlockEditor key={storyKey} value={field.value as Blocks} onChange={(b) => field.onChange(b)} minHeight="16rem" uploadPurpose="site" placeholder="It started with four people and one projector..." />
            </Field>
          )}
        />
      </SiteBlock>

      <div className="grid gap-5 2xl:grid-cols-2">
        <SiteBlock title="Pillars" description="What Zemi stands on. Each one gets a brand shape and its character on the page.">
          <RowsField
            control={form.control}
            name="pillars"
            max={8}
            noun="pillar"
            withShape
            titlePlaceholder="Messy is welcome"
            bodyPlaceholder="Bring the version with the bugs."
            newRow={() => ({ title: '', body: '', shape: (['circle', 'triangle', 'square', 'arch'] as const)[form.getValues('pillars').length % 4]! })}
          />
        </SiteBlock>
        <SiteBlock title="Who it is for" description="Short cards for the people who show up.">
          <RowsField control={form.control} name="audiences" max={6} noun="audience" titlePlaceholder="Undergrads" bodyPlaceholder="See what research looks like before it is polished." newRow={() => ({ title: '', body: '' })} />
        </SiteBlock>
      </div>

      <SiteBlock title="How to present" description="The steps from “I have an idea” to “I am on the calendar”. Numbered on the page in this order.">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
          <RowsField control={form.control} name="presentSteps" max={8} noun="step" numbered titlePlaceholder="Say hi" bodyPlaceholder="Use the contact form and pick “I want to present”." newRow={() => ({ title: '', body: '' })} />
          <FormField control={form.control} name="presentCta" label="Button under the steps" maxLength={80} hint="It opens the contact page with the presenting topic picked.">
            {(field) => <Input {...field} />}
          </FormField>
        </div>
      </SiteBlock>
    </SettingsForm>
  );
}
