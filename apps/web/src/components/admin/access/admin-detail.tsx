'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminSummary, AuditEntry, Paginated } from '@zemi/shared';
import { History, KeyRound, MoreHorizontal, Power, PowerOff, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useDirtyGuard } from '@/components/admin/content/shared/use-dirty-guard';
import {
  Button,
  Callout,
  DateText,
  Dialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ErrorState,
  FormError,
  FormSaveBar,
  IconButton,
  PageHeader,
  Skeleton,
  Timeline,
  notify,
  useConfirm,
} from '@/components/admin/ui';
import { api, errorMessage } from '@/lib/admin/api';
import { useBreadcrumbs } from '@/lib/admin/breadcrumbs';
import { applyApiErrorToForm, useZodForm } from '@/lib/admin/form';
import { useAdminMutation } from '@/lib/admin/hooks';
import { adminRoutes } from '@/lib/admin/nav';
import { adminKeys } from '@/lib/admin/query-keys';
import { AdminStatusChip, ExpiryHint } from './access-ui';
import { AccessEditor, ExpiryFormField, FormBlock, ProfileFields, adminProfileSchema, type AdminProfileValues } from './admin-form';
import { PassphraseField } from './passphrase-field';
import { PassphraseReveal } from './passphrase-reveal';
import { cleanPolicy, samePolicy } from './policy-model';
import { SessionsList, sessionsKey } from './sessions-list';
import { auditTone } from './audit-meta';

function toValues(a: AdminSummary): AdminProfileValues {
  return { name: a.name, note: a.note ?? '', expiresAt: a.expiresAt, policy: a.policy };
}

export function useAdmin(id: string) {
  return useQuery({
    queryKey: adminKeys.admins.detail(id),
    queryFn: ({ signal }) => api.get<AdminSummary>(`/admin/admins/${encodeURIComponent(id)}`, undefined, signal),
    retry: false,
  });
}

/** /admin/admins/[id]: edit everything, rotate the passphrase, switch off, delete, sessions, activity. */
export function AdminDetail({ id }: { id: string }) {
  const q = useAdmin(id);
  useBreadcrumbs([{ label: 'Admins and access', href: adminRoutes.admins }, { label: q.data?.name ?? 'Admin' }]);

  if (q.isPending) return <DetailSkeleton />;
  if (q.isError)
    return (
      <div className="py-8">
        <ErrorState
          error={q.error}
          onRetry={() => void q.refetch()}
          retrying={q.isFetching}
          action={
            <Button asChild variant="secondary">
              <Link href={adminRoutes.admins}>Back to admins</Link>
            </Button>
          }
        />
      </div>
    );
  return <AdminDetailLoaded admin={q.data} />;
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading admin">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-56 w-full" rounded="lg" />
        <Skeleton className="h-56 w-full" rounded="lg" />
      </div>
      <Skeleton className="h-96 w-full" rounded="lg" />
    </div>
  );
}

function AdminDetailLoaded({ admin }: { admin: AdminSummary }) {
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [rotateOpen, setRotateOpen] = useState(false);

  const form = useZodForm(adminProfileSchema, { defaultValues: toValues(admin) });
  const guard = useDirtyGuard(form.formState.isDirty);
  const name = form.watch('name');

  // Fresh data from the server (another tab, disable/enable) resets the form when nothing is pending.
  useEffect(() => {
    if (!form.formState.isDirty) form.reset(toValues(admin));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin.updatedAt]);

  const save = useAdminMutation({
    mutationFn: (v: AdminProfileValues) => {
      const d = form.formState.dirtyFields;
      const body: Record<string, unknown> = {};
      if (d.name) body.name = v.name.trim();
      if (d.note) body.note = v.note.trim() || null;
      if (d.expiresAt) body.expiresAt = v.expiresAt;
      if (d.policy && !samePolicy(v.policy, admin.policy)) body.policy = cleanPolicy(v.policy);
      if (!Object.keys(body).length) return Promise.resolve(admin);
      return api.patch<AdminSummary>(`/admin/admins/${admin.id}`, body);
    },
    invalidate: [adminKeys.admins.all, sessionsKey(admin.id)],
    successMessage: 'Saved. It applies right away, even if they are signed in.',
    errorToast: (err) => (err.hasFieldErrors ? false : errorMessage(err)),
    onError: (err) => applyApiErrorToForm(form, err),
    onSuccess: (data) => {
      qc.setQueryData(adminKeys.admins.detail(admin.id), data);
      form.reset(toValues(data));
    },
  });

  const toggle = useAdminMutation({
    mutationFn: (disabled: boolean) => api.patch<AdminSummary>(`/admin/admins/${admin.id}`, { disabled }),
    invalidate: [adminKeys.admins.all, sessionsKey(admin.id)],
    successMessage: (_d, disabled) => (disabled ? `${admin.name} is switched off and signed out everywhere.` : `${admin.name} is back on.`),
    onSuccess: (data) => qc.setQueryData(adminKeys.admins.detail(admin.id), data),
  });

  const switchOff = async () => {
    const ok = await confirm({
      title: `Switch ${admin.name} off?`,
      description: `They are signed out everywhere right now${admin.activeSessions ? ` (${admin.activeSessions} ${admin.activeSessions === 1 ? 'session' : 'sessions'})` : ''}, and the passphrase stops working. Their access stays saved, so switching back on is one click.`,
      confirmLabel: 'Switch off',
      destructive: true,
    });
    if (ok) toggle.mutate(true);
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${admin.name}?`,
      description: 'Their passphrase stops working, every session ends, and their access setup is gone for good. The audit log keeps what they did. If you might need them again, switch them off instead.',
      confirmLabel: 'Delete admin',
      destructive: true,
      typeToConfirm: admin.name,
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/admins/${admin.id}`);
      guard.release();
      qc.removeQueries({ queryKey: adminKeys.admins.detail(admin.id) });
      void qc.invalidateQueries({ queryKey: adminKeys.admins.all });
      notify.success(`${admin.name} is gone. Their passphrase no longer works.`);
      router.push(adminRoutes.admins);
    } catch (err) {
      notify.error(errorMessage(err));
    }
  };

  const submit = form.handleSubmit((v) => save.mutate(v));
  const disabled = admin.status === 'disabled';

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <PageHeader
        back={{ href: adminRoutes.admins, label: 'Admins and access' }}
        eyebrow={<AdminStatusChip status={admin.status} />}
        title={admin.name}
        meta={
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-ink-3">
            <span>
              Added <DateText value={admin.createdAt} format="date" />
            </span>
            <span>{admin.lastLoginAt ? <>Last signed in <DateText value={admin.lastLoginAt} format="relative" /></> : 'Never signed in'}</span>
            <ExpiryHint expiresAt={admin.expiresAt} />
          </span>
        }
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<KeyRound />} onClick={() => setRotateOpen(true)}>
              <span className="max-sm:sr-only">New passphrase</span>
            </Button>
            {disabled ? (
              <Button variant="secondary" size="sm" icon={<Power />} loading={toggle.isPending} onClick={() => toggle.mutate(false)}>
                <span className="max-sm:sr-only">Switch on</span>
              </Button>
            ) : (
              <Button variant="danger-soft" size="sm" icon={<PowerOff />} loading={toggle.isPending} onClick={() => void switchOff()}>
                <span className="max-sm:sr-only">Switch off</span>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton label="More" variant="ghost" size="sm">
                  <MoreHorizontal />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem icon={<History />} href={`${adminRoutes.audit}?actor=${admin.id}`}>
                  Everything they did
                </DropdownMenuItem>
                <DropdownMenuItem icon={<Trash2 />} destructive onSelect={() => void remove()}>
                  Delete admin
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="space-y-5">
        {admin.status === 'expired' ? (
          <Callout tone="yellow" title="Their access ended.">
            It ran out on <DateText value={admin.expiresAt} format="datetime" />. Pick a new end date below and save to let them back in with the same passphrase.
          </Callout>
        ) : disabled ? (
          <Callout tone="red" title="Switched off.">
            Their passphrase does not open anything right now. Switch them on to restore the access below as it is.
          </Callout>
        ) : null}
        <FormError errors={form.formState.errors} />

        <div className="grid gap-5 lg:grid-cols-2">
          <FormBlock title="Who">
            <ProfileFields form={form} />
          </FormBlock>
          <FormBlock title="Access ends" description="They are signed out the moment it ends.">
            <ExpiryFormField form={form} />
          </FormBlock>
        </div>

        <FormBlock title="What they can do" description="Changes apply on their very next click, no need for them to sign in again.">
          <AccessEditor form={form} name={name} />
        </FormBlock>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <FormBlock title="Where they are signed in" description="Sign out a device you do not recognize. A new passphrase signs them out everywhere.">
            <SessionsList owner={admin.id} name={admin.name} />
          </FormBlock>
          <FormBlock title="Lately">
            <RecentActivity admin={admin} />
          </FormBlock>
        </div>
      </div>

      <FormSaveBar form={form} saving={save.isPending} onSave={() => void submit()} />
      <RotateDialog admin={admin} open={rotateOpen} onOpenChange={setRotateOpen} />
    </form>
  );
}

/* ------------------------------------------------------------------ activity */

function RecentActivity({ admin }: { admin: AdminSummary }) {
  const q = useQuery({
    queryKey: adminKeys.audit.list({ actor: admin.id, pageSize: 8 }),
    queryFn: ({ signal }) => api.get<Paginated<AuditEntry>>('/admin/audit', { actor: admin.id, pageSize: 8 }, signal),
    staleTime: 30_000,
  });
  if (q.isPending) return <Skeleton className="h-40 w-full" rounded="lg" />;
  if (q.isError) return <ErrorState size="sm" error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <div className="space-y-4">
      <Timeline
        items={q.data.items.map((e) => ({ id: e.id, title: e.summary, description: <span className="mono text-xs">{e.action}</span>, at: e.createdAt, tone: auditTone(e.action) }))}
        empty={<p className="text-sm text-ink-3">Nothing yet. {admin.lastLoginAt ? 'They have only looked around.' : 'They have not signed in.'}</p>}
      />
      {q.data.total > q.data.items.length ? (
        <Button asChild variant="link" size="sm">
          <Link href={`${adminRoutes.audit}?actor=${admin.id}`}>See all {q.data.total}</Link>
        </Button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ rotate */

function RotateDialog({ admin, open, onOpenChange }: { admin: AdminSummary; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);

  const reset = () => {
    setValue('');
    setError(undefined);
    setDone(null);
    setCopied(false);
  };

  const close = async () => {
    if (done && !copied) {
      const ok = await confirm({ title: 'Close without copying?', description: 'The new passphrase disappears when this closes.', confirmLabel: 'Close', destructive: true });
      if (!ok) return;
    }
    onOpenChange(false);
    reset();
  };

  const submit = async () => {
    if (value.length < 12) {
      setError('Make it at least 12 characters.');
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      await api.post(`/admin/admins/${admin.id}/passphrase`, { passphrase: value });
      setDone(value);
      void qc.invalidateQueries({ queryKey: adminKeys.admins.all });
      void qc.invalidateQueries({ queryKey: sessionsKey(admin.id) });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : void close())}
      dismissible={!done}
      size="md"
      accent="yellow"
      title={done ? 'Here it is' : `New passphrase for ${admin.name}`}
      description={done ? undefined : `The old one stops working right away and ${admin.activeSessions ? `their ${admin.activeSessions} ${admin.activeSessions === 1 ? 'session ends' : 'sessions end'}` : 'any session they have ends'}.`}
      footer={
        done ? (
          <Button variant="primary" onClick={() => void close()}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => void close()}>
              Cancel
            </Button>
            <Button variant="primary" loading={pending} onClick={() => void submit()} disabled={!value}>
              Set new passphrase
            </Button>
          </>
        )
      }
    >
      {done ? (
        <PassphraseReveal name={admin.name} passphrase={done} expiresAt={admin.expiresAt} reason="rotated" onCopied={() => setCopied(true)} />
      ) : open ? (
        <PassphraseField value={value} onChange={setValue} error={error} />
      ) : null}
    </Dialog>
  );
}
