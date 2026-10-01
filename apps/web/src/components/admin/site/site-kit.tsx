'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SiteSettingKey, SiteSettings } from '@zemi/shared';
import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { useDirtyGuard } from '@/components/admin/content/shared/use-dirty-guard';
import { Button, ErrorState, FormError, FormSaveBar, Skeleton } from '@/components/admin/ui';
import { api, errorMessage } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { applyApiErrorToForm } from '@/lib/admin/form';
import { isRevalidatingOnMount, useAdminMutation } from '@/lib/admin/hooks';
import { SITE_URL } from '@/lib/admin/paths';
import { adminKeys } from '@/lib/admin/query-keys';

/* ------------------------------------------------------------------ sections */

export type SiteSection = 'general' | 'seo' | 'home' | 'about' | 'contact' | 'emails' | 'faq' | 'team';

export const SITE_SECTIONS: Array<{ key: SiteSection; label: string; publicPath: string | null; blurb: string }> = [
  { key: 'general', label: 'General', publicPath: '/', blurb: 'Name, defaults for new Fridays, the announcement bar and the footer.' },
  { key: 'seo', label: 'SEO and sharing', publicPath: '/', blurb: 'What Google and chat apps show when someone shares the site.' },
  { key: 'home', label: 'Home', publicPath: '/', blurb: 'The hero and the Friday clock story on the front page.' },
  { key: 'about', label: 'About', publicPath: '/about', blurb: 'The story, the pillars and how to present.' },
  { key: 'contact', label: 'Contact', publicPath: '/contact', blurb: 'Where people reach you, and who hears about new messages.' },
  { key: 'emails', label: 'Emails', publicPath: null, blurb: 'How our emails sign off, and which ones go out on their own.' },
  { key: 'faq', label: 'FAQ', publicPath: '/about', blurb: 'The questions people keep asking.' },
  { key: 'team', label: 'Team', publicPath: '/about', blurb: 'The crew behind Zemi.' },
];

export function sectionMeta(key: SiteSection) {
  return SITE_SECTIONS.find((s) => s.key === key)!;
}

export function publicUrl(path: string): string {
  return `${SITE_URL}${path}`;
}

export function ViewPageLink({ path, label = 'View page', className }: { path: string; label?: string; className?: string }) {
  return (
    <Button asChild variant="secondary" size="sm" iconRight={<ExternalLink />} className={className}>
      <a href={publicUrl(path)} target="_blank" rel="noopener noreferrer" data-skip-dirty-guard="">
        {label}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </Button>
  );
}

/* ------------------------------------------------------------------ data */

export function settingKey(key: SiteSettingKey) {
  return adminKeys.site.detail(key);
}

export function useSiteSetting<K extends SiteSettingKey>(key: K) {
  return useQuery({
    queryKey: settingKey(key),
    queryFn: ({ signal }) => api.get<SiteSettings[K]>(`/admin/site/settings/${key}`, undefined, signal),
    // A save elsewhere should not yank the form out from under someone typing. Opening the page
    // again always revalidates (see SiteSettingLoader).
    refetchOnWindowFocus: false,
  });
}

/**
 * Loading and error states around a settings form. The form mounts once, with freshly loaded
 * values (a cached copy from an earlier visit is revalidated first, never used as the seed).
 */
export function SiteSettingLoader<K extends SiteSettingKey>({ settingKey: key, children, skeleton }: { settingKey: K; children: (data: SiteSettings[K]) => ReactNode; skeleton?: ReactNode }) {
  const q = useSiteSetting(key);
  if (q.isPending || isRevalidatingOnMount(q)) return <>{skeleton ?? <FormSkeleton />}</>;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />;
  return <>{children(q.data)}</>;
}

export function FormSkeleton({ blocks = 3 }: { blocks?: number }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: blocks }, (_, i) => (
        <Skeleton key={i} className={cn('w-full', i === 0 ? 'h-64' : 'h-48')} rounded="lg" />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ keyed rows */

export type Keyed<T> = T & { _key: string };

let seq = 0;
export function newRowKey(): string {
  seq += 1;
  return `r${Date.now().toString(36)}${seq}`;
}

export function withKeys<T extends object>(rows: readonly T[] | null | undefined): Keyed<T>[] {
  return (rows ?? []).map((r) => ({ ...r, _key: newRowKey() }));
}

export function stripKeys<T extends object>(rows: ReadonlyArray<Keyed<T>>): T[] {
  return rows.map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _key, ...rest } = r;
    return rest as unknown as T;
  });
}

/* ------------------------------------------------------------------ save */

/** Structural equality for plain JSON values (key order does not matter). */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => sameJson(x, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) if (!sameJson(ao[k], bo[k])) return false;
  return true;
}

/**
 * Save a settings section: sends only the top-level fields that changed (the API merges them
 * over what is stored), then resets the form to what the server saved.
 *
 * "Changed" is a deep compare against the values the form was loaded with, not RHF's
 * `dirtyFields`: field-array moves and removes (beats, pillars, steps) only update `dirtyFields`
 * when something subscribed to it during render, so relying on it silently dropped a reorder or a
 * removed row whenever another field changed in the same save.
 */
export function useSiteSettingSave<K extends SiteSettingKey, F extends FieldValues>(opts: {
  settingKey: K;
  form: UseFormReturn<F, unknown, F>;
  toPayload: (values: F) => Partial<SiteSettings[K]>;
  toForm: (saved: SiteSettings[K]) => F;
  successMessage?: string;
}) {
  const qc = useQueryClient();
  const { settingKey: key, form, toPayload, toForm } = opts;
  const mutation = useAdminMutation({
    mutationFn: (values: F) => {
      const full = toPayload(values) as Record<string, unknown>;
      const defaults = form.formState.defaultValues as F | undefined;
      const base = defaults ? (toPayload(defaults) as Record<string, unknown>) : null;
      const changed = base ? Object.keys(full).filter((k) => !sameJson(full[k], base[k])) : Object.keys(full);
      if (!changed.length) {
        // Only whitespace changed (it trims back to what is stored): no PUT, so we never write stale
        // copies of fields someone else just edited. The form resets to the stored values.
        const cached = qc.getQueryData<SiteSettings[K]>(settingKey(key));
        if (cached) return Promise.resolve(cached);
      }
      const body = changed.length ? Object.fromEntries(changed.map((k) => [k, full[k]])) : full;
      return api.put<SiteSettings[K]>(`/admin/site/settings/${key}`, body);
    },
    invalidate: [adminKeys.site.all],
    successMessage: opts.successMessage ?? 'Saved. The public site catches up in a few seconds.',
    errorToast: (err) => (err.hasFieldErrors ? false : errorMessage(err)),
    onError: (err) => {
      if (!applyApiErrorToForm(form, err)) return;
    },
    onSuccess: (saved) => {
      qc.setQueryData(settingKey(key), saved);
      form.reset(toForm(saved));
    },
  });
  const save = form.handleSubmit((v) => mutation.mutate(v));
  return { save, saving: mutation.isPending };
}

/** The form element, the page-level error, the floating save bar and the "leave without saving?" guard. */
export function SettingsForm<F extends FieldValues>({
  form,
  save,
  saving,
  children,
  onDiscard,
}: {
  form: UseFormReturn<F, unknown, F>;
  save: () => void;
  saving: boolean;
  children: ReactNode;
  onDiscard?: () => void;
}) {
  useDirtyGuard(form.formState.isDirty);
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-5"
    >
      <FormError errors={form.formState.errors} />
      {children}
      <FormSaveBar form={form} saving={saving} onSave={save} onDiscard={onDiscard} />
    </form>
  );
}

/* ------------------------------------------------------------------ layout */

export function SiteBlock({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn('scroll-mt-32 rounded-[20px] border border-line bg-white p-4 sm:rounded-[var(--radius-card)] sm:p-6', className)}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="font-display text-lg leading-tight font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.25]">{title}</h2>
          {description ? <p className="mt-1 max-w-[62ch] text-sm text-ink-3">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Two columns on wide screens: fields on the left, a live preview on the right. */
export function WithPreview({ children, preview, previewLabel = 'Preview' }: { children: ReactNode; preview: ReactNode; previewLabel?: string }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-8">
      <div className="min-w-0 space-y-4">{children}</div>
      <div className="min-w-0">
        <p className="label mb-2 text-ink-3">{previewLabel}</p>
        <div className="xl:sticky xl:top-[calc(var(--admin-topbar-h,60px)+6rem)]">{preview}</div>
      </div>
    </div>
  );
}

/**
 * Turn SortableList's reordered array into one `move(from, to)` for react-hook-form's
 * useFieldArray, so rows keep their ids (and focus) while you drag with the keyboard.
 */
export function reorderToMove<T extends { id: string }>(before: readonly T[], after: readonly T[]): [number, number] | null {
  let i = 0;
  while (i < before.length && before[i]!.id === after[i]!.id) i++;
  if (i >= before.length) return null;
  let j = before.length - 1;
  while (j > i && before[j]!.id === after[j]!.id) j--;
  return after[j]!.id === before[i]!.id ? [i, j] : [j, i];
}
