'use client';

import { passphraseSchema, type Policy } from '@zemi/shared';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { Field, FormField, Input, Textarea } from '@/components/admin/ui';
import { cn } from '@/lib/admin/cn';
import { useMediaQuery } from '@/lib/admin/hooks';
import { ExpiryField } from './expiry-field';
import { PassphraseField } from './passphrase-field';
import { PolicyEditor } from './policy-editor';
import { cleanPolicy } from './policy-model';
import { summarizePolicy } from './policy-summary';
import { PolicySummaryCard } from './policy-summary-card';
import { useGrantLabels } from './use-grant-labels';

/* ------------------------------------------------------------------ schema */

const policyValue = z.custom<Policy>((v) => !!v && typeof v === 'object' && Array.isArray((v as Policy).capabilities) && Array.isArray((v as Policy).grants));

export const adminProfileSchema = z.object({
  name: z.string().trim().min(1, 'Give them a name, so you know who is who.').max(120, 'Keep it under 120 characters.'),
  note: z.string().max(500, 'Keep the note under 500 characters.'),
  expiresAt: z.string().nullable(),
  policy: policyValue,
});
export type AdminProfileValues = z.infer<typeof adminProfileSchema>;

export const adminCreateSchema = adminProfileSchema.extend({ passphrase: passphraseSchema });
export type AdminCreateValues = z.infer<typeof adminCreateSchema>;

/* ------------------------------------------------------------------ layout bits */

export function FormBlock({ step, title, description, children, id }: { step?: number; title: ReactNode; description?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-28 rounded-[20px] border border-line bg-white p-4 sm:rounded-[var(--radius-card)] sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        {step ? (
          <span className="mono mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-[0.8125rem] font-bold text-white" aria-hidden="true">
            {step}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="font-display text-lg leading-tight font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.25]">{title}</h2>
          {description ? <p className="mt-1 text-sm text-ink-3">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ fields */

type AnyAdminForm = UseFormReturn<AdminProfileValues, unknown, AdminProfileValues> | UseFormReturn<AdminCreateValues, unknown, AdminCreateValues>;

export function ProfileFields({ form }: { form: AnyAdminForm }) {
  const f = form as UseFormReturn<AdminProfileValues, unknown, AdminProfileValues>;
  return (
    <div className="grid gap-4">
      <FormField control={f.control} name="name" label="Name" required maxLength={120} hint="Their name, maybe with the job: “Gilang (door crew)”.">
        {(field) => <Input {...field} autoComplete="off" placeholder="Rani Pratiwi" />}
      </FormField>
      <FormField control={f.control} name="note" label="Note" optional maxLength={500} hint="Only you see this. Why they have access, who asked for it.">
        {(field) => <Textarea {...field} autosize minRows={2} maxRows={6} placeholder="Runs the stream for the October Fridays." />}
      </FormField>
    </div>
  );
}

export function ExpiryFormField({ form }: { form: AnyAdminForm }) {
  const f = form as UseFormReturn<AdminProfileValues, unknown, AdminProfileValues>;
  return (
    <Controller
      control={f.control}
      name="expiresAt"
      render={({ field, fieldState }) => <ExpiryField value={field.value} onChange={field.onChange} error={fieldState.error?.message} />}
    />
  );
}

export function PassphraseFormField({ form }: { form: UseFormReturn<AdminCreateValues, unknown, AdminCreateValues> }) {
  return (
    <Controller
      control={form.control}
      name="passphrase"
      render={({ field, fieldState }) => (
        <Field label="Passphrase" hideLabel error={fieldState.error?.message}>
          <PassphraseField
            value={field.value}
            onChange={(v) => {
              // The roll that happens on mount becomes the default, so a fresh form is not "unsaved".
              if (!field.value && !form.formState.defaultValues?.passphrase && !form.getFieldState('passphrase').isDirty) form.resetField('passphrase', { defaultValue: v });
              else field.onChange(v);
            }}
            error={fieldState.error?.message}
          />
        </Field>
      )}
    />
  );
}

/* ------------------------------------------------------------------ access */

/**
 * The RBAC editor with its live summary. Summary sits in a sticky column on large screens and
 * as a collapsible card above the editor on smaller ones (so you see it without scrolling past
 * the whole matrix).
 */
export function AccessEditor({ form, name, readOnly }: { form: AnyAdminForm; name: string; readOnly?: boolean }) {
  const f = form as UseFormReturn<AdminProfileValues, unknown, AdminProfileValues>;
  return (
    <Controller
      control={f.control}
      name="policy"
      render={({ field }) => <AccessEditorInner policy={field.value} onChange={field.onChange} name={name} expiresAt={f.watch('expiresAt')} readOnly={readOnly} />}
    />
  );
}

function AccessEditorInner({
  policy,
  onChange,
  name,
  expiresAt,
  readOnly,
}: {
  policy: Policy;
  onChange: (p: Policy) => void;
  name: string;
  expiresAt: string | null;
  readOnly?: boolean;
}) {
  const labels = useGrantLabels(policy);
  const wide = useMediaQuery('(min-width: 1280px)', true);
  const [open, setOpen] = useState(false);
  const lines = summarizePolicy(cleanPolicy(policy), labels.label).filter((l) => l.tone === 'can');
  const card = (className?: string) => <PolicySummaryCard className={className} policy={policy} expiresAt={expiresAt} label={labels.label} name={name} />;
  if (wide) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)] gap-8">
        <div className="min-w-0">
          <PolicyEditor value={policy} onChange={onChange} labels={labels} readOnly={readOnly} />
        </div>
        <aside className="min-w-0" aria-label="Summary">
          <div className="sticky top-[calc(var(--admin-topbar-h,60px)+5.5rem)]">{card()}</div>
        </aside>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface-muted/60 px-4 py-3 text-left transition hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">What {name.trim().split(/\s+/)[0] || 'they'} can do</span>
            <span className="block truncate text-[0.8125rem] text-ink-3">{lines[0]?.text ?? 'Nothing yet. Pick a preset below.'}</span>
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              {card('mt-2')}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <PolicyEditor value={policy} onChange={onChange} labels={labels} readOnly={readOnly} />
      {open ? null : card()}
    </div>
  );
}
