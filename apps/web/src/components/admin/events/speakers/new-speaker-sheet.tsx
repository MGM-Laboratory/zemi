'use client';

import { useQueryClient } from '@tanstack/react-query';
import { slugify, type SpeakerAdmin, type SpeakerRef } from '@zemi/shared';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/admin/ui/button';
import { Sheet } from '@/components/admin/ui/dialog';
import { FormError, FormField } from '@/components/admin/ui/form';
import { Input } from '@/components/admin/ui/input';
import { Avatar } from '@/components/admin/ui/media';
import { notify } from '@/components/admin/ui/toast';
import { useRefetchMe } from '@/lib/admin/ability';
import { api, errorMessage, isApiError } from '@/lib/admin/api';
import { applyApiErrorToForm, useZodForm } from '@/lib/admin/form';
import { adminKeys } from '@/lib/admin/query-keys';
import { nullIfEmpty } from '../lib';

const schema = z.object({
  fullName: z.string().trim().min(1, 'What should we call them?').max(160),
  nickname: z.string().max(60),
  headline: z.string().max(200),
  defaultOrganization: z.string().max(200),
  defaultPosition: z.string().max(200),
  email: z.string().refine((s) => s === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), 'That email looks off. Mind checking it?'),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = { fullName: '', nickname: '', headline: '', defaultOrganization: '', defaultPosition: '', email: '' };

export interface NewSpeakerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill (the name typed into the picker). */
  initialName?: string;
  onCreated: (speaker: SpeakerRef) => void;
}

/**
 * Minimal "add a person" form (POST /admin/speakers). The full profile (bio, links, photo)
 * lives in the speakers area; this is just enough to put them on the lineup.
 */
export function NewSpeakerSheet({ open, onOpenChange, initialName = '', onCreated }: NewSpeakerSheetProps) {
  const qc = useQueryClient();
  const refetchMe = useRefetchMe();
  const [saving, setSaving] = useState(false);
  const form = useZodForm(schema, { defaultValues: { ...EMPTY, fullName: initialName } });

  useEffect(() => {
    if (open) form.reset({ ...EMPTY, fullName: initialName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialName]);

  const name = form.watch('fullName');

  const submit = form.handleSubmit(async (v) => {
    setSaving(true);
    const base = slugify(v.fullName);
    const body = {
      fullName: v.fullName.trim(),
      nickname: nullIfEmpty(v.nickname),
      headline: nullIfEmpty(v.headline),
      defaultOrganization: nullIfEmpty(v.defaultOrganization),
      defaultPosition: nullIfEmpty(v.defaultPosition),
      email: nullIfEmpty(v.email),
      bio: [],
      links: [],
      visibility: 'published' as const,
    };
    try {
      let created: SpeakerAdmin | null = null;
      let lastErr: unknown = null;
      for (let i = 0; i < 3 && !created; i++) {
        try {
          created = await api.post<SpeakerAdmin>('/admin/speakers', { ...body, slug: i ? `${base.slice(0, 90)}-${i + 1}` : base });
        } catch (err) {
          lastErr = err;
          const slugTaken = isApiError(err) && err.isConflict && (Boolean(err.fieldErrors.slug) || /slug/i.test(err.message));
          if (!slugTaken) throw err;
        }
      }
      if (!created) throw lastErr;
      void qc.invalidateQueries({ queryKey: adminKeys.speakers.all });
      await refetchMe().catch(() => undefined);
      notify.success(`${created.fullName} is in the directory.`, { celebrate: 'circle' });
      onCreated(created);
      onOpenChange(false);
    } catch (err) {
      if (!applyApiErrorToForm(form, err)) notify.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !saving && onOpenChange(o)}
      title="Add a new speaker"
      description="Just the essentials. Photo, bio and links can come later in Speakers."
      dismissible={!form.formState.isDirty}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            Add to the lineup
          </Button>
        </>
      }
    >
      <form
        className="space-y-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex items-center gap-3 rounded-2xl bg-surface-muted p-3">
          <Avatar name={name || '?'} size={44} variant="shape" />
          <p className="text-sm text-ink-3">{name ? `Hi, ${name.split(' ')[0]}.` : 'Type a name and they get a shape.'}</p>
        </div>
        <FormError errors={form.formState.errors} />
        <FormField control={form.control} name="fullName" label="Full name" required maxLength={160}>
          {(field) => <Input {...field} autoFocus autoComplete="off" placeholder="Rani Wijaya" />}
        </FormField>
        <FormField control={form.control} name="nickname" label="Nickname" optional hint="What people call them on Fridays.">
          {(field) => <Input {...field} placeholder="Rani" />}
        </FormField>
        <FormField control={form.control} name="headline" label="Headline" optional maxLength={200}>
          {(field) => <Input {...field} placeholder="PhD student, loves messy traffic data" />}
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField control={form.control} name="defaultOrganization" label="Organization" optional>
            {(field) => <Input {...field} placeholder="MGM Laboratory" />}
          </FormField>
          <FormField control={form.control} name="defaultPosition" label="Position" optional>
            {(field) => <Input {...field} placeholder="PhD candidate" />}
          </FormField>
        </div>
        <FormField control={form.control} name="email" label="Email" optional hint="Private. Only admins see it.">
          {(field) => <Input {...field} type="email" inputMode="email" autoComplete="off" placeholder="rani@example.com" />}
        </FormField>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Sheet>
  );
}
