'use client';

import type { AdminSummary, Policy } from '@zemi/shared';
import { ArrowRight, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useDirtyGuard } from '@/components/admin/content/shared/use-dirty-guard';
import { Button, FormError, PageHeader, useConfirm } from '@/components/admin/ui';
import { api, errorMessage } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { useBreadcrumbs } from '@/lib/admin/breadcrumbs';
import { applyApiErrorToForm, useZodForm } from '@/lib/admin/form';
import { useAdminMutation, useHotkeys } from '@/lib/admin/hooks';
import { useLeaveGuard } from '@/lib/admin/leave-guard';
import { adminRoutes } from '@/lib/admin/nav';
import { adminKeys } from '@/lib/admin/query-keys';
import { AccessEditor, ExpiryFormField, FormBlock, PassphraseFormField, ProfileFields, adminCreateSchema, type AdminCreateValues } from './admin-form';
import { EXPIRY_PRESETS } from './expiry-field';
import { PassphraseReveal } from './passphrase-reveal';
import { cleanPolicy, isEmptyPolicy, matchingPreset } from './policy-model';
import { compactAccess } from './policy-summary';

/** /admin/admins/new: who, how long, passphrase, access. Then a show-once reveal. */
export function AdminCreate() {
  useBreadcrumbs([{ label: 'Admins and access', href: adminRoutes.admins }, { label: 'New admin' }]);
  const router = useRouter();
  const confirm = useConfirm();
  const [created, setCreated] = useState<{ admin: AdminSummary; passphrase: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const form = useZodForm(adminCreateSchema, {
    defaultValues: {
      name: '',
      note: '',
      // Least privilege starts with time: a week unless you say otherwise.
      expiresAt: EXPIRY_PRESETS[1]!.at(new Date()).toISOString(),
      passphrase: '',
      policy: { capabilities: [], grants: [] },
    },
  });
  // The auto-rolled passphrase alone is not "unsaved work".
  const touched = Object.keys(form.formState.dirtyFields).some((k) => k !== 'passphrase');
  const guard = useDirtyGuard(touched && !created);
  // The passphrase exists only in this tab until someone copies it: guard links, shortcuts,
  // the palette, reload and the Back button while it is on screen and not copied yet.
  const revealGuard = useLeaveGuard(Boolean(created) && !copied, {
    backButton: true,
    confirm: {
      title: 'Leave without copying the passphrase?',
      description: `Nobody can see it again once you go, you included. If ${created ? created.admin.name.trim().split(/\s+/)[0] : 'they'} never gets it, you will have to set a new one.`,
      confirmLabel: 'Leave anyway',
      cancelLabel: 'Stay and copy it',
    },
  });
  const [formKey, setFormKey] = useState(0);
  const name = form.watch('name');

  const create = useAdminMutation({
    mutationFn: (v: AdminCreateValues) =>
      api.post<AdminSummary>('/admin/admins', {
        name: v.name.trim(),
        note: v.note.trim() || null,
        expiresAt: v.expiresAt,
        passphrase: v.passphrase,
        policy: cleanPolicy(v.policy),
      }),
    invalidate: [adminKeys.admins.all],
    errorToast: (err) => (err.hasFieldErrors ? false : errorMessage(err)),
    onError: (err) => applyApiErrorToForm(form, err),
  });

  const submit = form.handleSubmit(async (v) => {
    if (isEmptyPolicy(cleanPolicy(v.policy))) {
      const ok = await confirm({
        title: 'Create them with no access?',
        description: 'They could sign in and see an empty dashboard. You can add access later from their page.',
        confirmLabel: 'Create anyway',
        cancelLabel: 'Add access first',
      });
      if (!ok) return;
    }
    const admin = await create.mutateAsync(v).catch(() => null);
    if (!admin) return;
    guard.release();
    setCreated({ admin, passphrase: v.passphrase });
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });

  const finish = async () => {
    if (!created) return;
    if (!copied) {
      const ok = await confirm({
        title: 'Saved the passphrase somewhere?',
        description: 'Once you leave, it is gone for good. If you did not copy it, you will have to set a new one.',
        confirmLabel: 'Yes, I have it',
        cancelLabel: 'Go back',
      });
      if (!ok) return;
    }
    const id = created.admin.id;
    // Not copied means the Back-button guard still has its extra history entry on top: replace
    // it, so Back from their page lands on this form once, not twice.
    const armed = !copied;
    revealGuard.release();
    setCreated(null);
    if (armed) router.replace(adminRoutes.admin(id));
    else router.push(adminRoutes.admin(id));
  };

  if (created) {
    return (
      <div className="mx-auto max-w-2xl py-4 sm:py-10">
        <PassphraseReveal name={created.admin.name} passphrase={created.passphrase} expiresAt={created.admin.expiresAt} reason="created" onCopied={() => setCopied(true)} />
        <div className="mt-8 flex flex-wrap gap-2">
          <Button variant="primary" iconRight={<ArrowRight />} onClick={() => void finish()}>
            Done, show their page
          </Button>
          <Button
            variant="ghost"
            icon={<UserPlus />}
            onClick={async () => {
              if (!copied) {
                const ok = await confirm({ title: 'Leave without copying?', description: 'The passphrase disappears when you go.', confirmLabel: 'Leave', destructive: true });
                if (!ok) return;
              }
              setCreated(null);
              setCopied(false);
              // A blank passphrase makes the field roll a fresh one; the last one is taken now.
              form.reset({ name: '', note: '', expiresAt: EXPIRY_PRESETS[1]!.at(new Date()).toISOString(), passphrase: '', policy: { capabilities: [], grants: [] } });
              setFormKey((k) => k + 1);
            }}
          >
            Add another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      key={formKey}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <PageHeader
        back={{ href: adminRoutes.admins, label: 'Admins and access' }}
        title="Add an admin"
        description="Give someone exactly what they need, for as long as they need it. Nothing more."
      />
      <div className="space-y-5">
        <FormError errors={form.formState.errors} />
        <div className="grid gap-5 lg:grid-cols-2">
          <FormBlock step={1} title="Who is it?">
            <ProfileFields form={form} />
          </FormBlock>
          <FormBlock step={2} title="Until when?" description="Access ends on its own. Helpers for one Friday should not keep a key for a year.">
            <ExpiryFormField form={form} />
          </FormBlock>
        </div>
        <FormBlock step={3} title="Their passphrase" description="The only thing they type to sign in. You see it once, right after you create them.">
          <PassphraseFormField form={form} />
        </FormBlock>
        <FormBlock step={4} title="What they can do" description="Default deny. Start from a preset, then untick or add until the summary reads right.">
          <AccessEditor form={form} name={name} />
        </FormBlock>
      </div>
      <CreateBar name={name} policy={form.watch('policy')} saving={create.isPending} dirty={touched} onCreate={() => void submit()} onDiscard={() => form.reset()} />
    </form>
  );
}

/** Sticky footer for the create form: who, what they get so far, and the button. Cmd/Ctrl+S creates. */
function CreateBar({ name, policy, saving, dirty, onCreate, onDiscard }: { name: string; policy: Policy; saving: boolean; dirty: boolean; onCreate: () => void; onDiscard: () => void }) {
  useHotkeys({ 'mod+s': () => !saving && onCreate() }, { allowInInputs: true });
  const access = compactAccess(cleanPolicy(policy), matchingPreset(policy)?.label ?? null);
  return (
    <div
      role="region"
      aria-label="Create admin"
      className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mt-8 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-line bg-white/95 py-2.5 pr-2.5 pl-4 shadow-[var(--shadow-3)] backdrop-blur"
    >
      <span className="flex min-w-0 items-center gap-2 text-sm text-ink-2" aria-live="polite">
        <span className={cn('size-2 shrink-0 rounded-full', access.empty ? 'bg-line-strong' : 'bg-green')} aria-hidden="true" />
        <span className="min-w-0 truncate">
          <strong className="font-semibold text-ink">{name.trim() || 'New admin'}</strong>
          <span className="text-ink-3">
            {' '}
            · {access.empty ? 'no access yet' : `${access.label}: ${access.detail.charAt(0).toLowerCase()}${access.detail.slice(1)}`}
          </span>
        </span>
      </span>
      <div className="flex items-center gap-2">
        {dirty ? (
          <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
            Start over
          </Button>
        ) : null}
        <Button variant="primary" size="sm" onClick={onCreate} loading={saving}>
          Create admin
        </Button>
      </div>
    </div>
  );
}
