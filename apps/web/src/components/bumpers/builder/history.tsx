'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BumperRevision } from '@zemi/shared';
import { Bookmark, BookmarkPlus, CopyPlus, History, RotateCcw, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/admin/ui/button';
import { useConfirm } from '@/components/admin/ui/confirm-dialog';
import { Sheet } from '@/components/admin/ui/dialog';
import { DateText } from '@/components/admin/ui/display';
import { EmptyState, ErrorState, Skeleton } from '@/components/admin/ui/feedback';
import { Input } from '@/components/admin/ui/input';
import { notify } from '@/components/admin/ui/toast';
import { errorMessage, isApiError } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { formatRelative } from '@/lib/admin/format';
import { bumperKeys, bumpersApi } from '../api';
import { countLabel } from '../library/labels';
import { useBuilder, useBuilderUi } from './store';
import { BumperThumb, useSeen } from './thumb';

/** "Before the rehearsal" for named checkpoints, plain words for the rest. */
function reasonLabel(reason: string): { title: string; named: boolean; icon: typeof History } {
  if (reason.startsWith('checkpoint:')) return { title: reason.slice('checkpoint:'.length) || 'Checkpoint', named: true, icon: Bookmark };
  switch (reason) {
    case 'checkpoint':
      return { title: 'Checkpoint', named: true, icon: Bookmark };
    case 'generate':
      return { title: 'Generated from the event', named: false, icon: Sparkles };
    case 'restore':
      return { title: 'Saved before a restore', named: false, icon: RotateCcw };
    case 'duplicate':
      return { title: 'Copied from another show', named: false, icon: CopyPlus };
    default:
      return { title: 'Autosave', named: false, icon: History };
  }
}

/** Revisions: a preview of each, restore (after a confirm), and named checkpoints. */
export function HistorySheet() {
  const { panel, openPanel } = useBuilderUi();
  const open = panel === 'history';
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => openPanel(o ? 'history' : null)}
      title="History"
      description="A copy every few minutes of editing, plus the checkpoints you name. Restoring keeps what you have now, too."
      width="md"
    >
      {open ? <HistoryBody onDone={() => openPanel(null)} /> : null}
    </Sheet>
  );
}

function HistoryBody({ onDone }: { onDone: () => void }) {
  const { state, canEdit, saveNow, snapshot, load } = useBuilder();
  const { showId } = state;
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const list = useQuery({
    queryKey: bumperKeys.revisions(showId),
    queryFn: ({ signal }) => bumpersApi.revisions(showId, signal),
    staleTime: 10_000,
  });

  const checkpoint = async (e: FormEvent) => {
    e.preventDefault();
    const label = name.trim();
    if (!label || saving) return;
    setSaving(true);
    const res = await saveNow(label);
    setSaving(false);
    if (res) {
      setName('');
      notify.success(`Checkpoint "${label}" saved.`, { celebrate: 'square' });
    } else {
      notify.error(snapshot().state.save === 'conflict' ? 'Someone else saved first. Sort that out at the top of the page, then try again.' : "Couldn't save the checkpoint. Check the save status at the top and try again.");
    }
  };

  const restore = async (rev: BumperRevision) => {
    const ok = await confirm({
      title: `Go back to version ${rev.version}?`,
      description: `The show changes back to how it was ${formatRelative(rev.createdAt)} (${countLabel(rev.slideCount)}). What you have now is saved in the history first, so you can come back to it.`,
      confirmLabel: 'Restore this version',
    });
    if (!ok) return;
    setRestoring(rev.id);
    try {
      // Pending edits go in first, so the restore starts from the newest version (and keeps them in the history).
      const before = snapshot().state.save;
      if (before === 'conflict') throw new Error('Someone else saved first. Sort that out at the top of the page, then restore.');
      if (before !== 'saved' && !(await saveNow())) throw new Error("Your latest changes didn't save, so nothing was restored. Try again in a moment.");
      const res = await bumpersApi.restore(showId, rev.id, snapshot().version);
      load(res, { keepView: true });
      void qc.invalidateQueries({ queryKey: bumperKeys.revisions(showId) });
      void qc.invalidateQueries({ queryKey: bumperKeys.lists() });
      notify.success(`Back to version ${rev.version}.`, { celebrate: 'circle' });
      onDone();
    } catch (err) {
      notify.error(isApiError(err) && err.status === 409 ? 'Someone saved this show a moment ago. Reload their version, then try again.' : errorMessage(err));
    } finally {
      setRestoring(null);
    }
  };

  const clean = state.save === 'saved';
  return (
    <div className="space-y-6">
      {canEdit ? (
        <form onSubmit={checkpoint} className="rounded-2xl border border-line bg-surface-muted/60 p-4">
          <label htmlFor="bumper-checkpoint" className="block text-[0.9375rem] font-semibold text-ink">
            Save a checkpoint
          </label>
          <p className="mt-0.5 text-[0.8125rem] text-ink-3">Name this moment so it is easy to find later.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input id="bumper-checkpoint" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Before the rehearsal" wrapperClassName="flex-1" className="flex-1" />
            <Button type="submit" variant="primary" icon={<BookmarkPlus />} loading={saving} disabled={!name.trim()}>
              Save checkpoint
            </Button>
          </div>
        </form>
      ) : null}

      {list.isLoading ? (
        <ul className="space-y-3" aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="rounded-2xl border border-line p-3">
              <Skeleton className="aspect-[3/0.56] w-full" rounded="lg" />
              <Skeleton className="mt-3 h-4 w-2/5" />
              <Skeleton className="mt-2 h-3 w-3/5" />
            </li>
          ))}
        </ul>
      ) : list.isError ? (
        <ErrorState size="sm" error={list.error} onRetry={() => void list.refetch()} retrying={list.isFetching} />
      ) : !list.data?.length ? (
        <EmptyState
          size="sm"
          title="No history yet."
          description="Keep editing and a copy lands here every few minutes. Name one above to find it easily."
          cast={[
            { shape: 'arch', mood: 'look', size: 40, lookAt: { x: 0.8, y: -0.3 } },
            { shape: 'circle', mood: 'idle', size: 36 },
          ]}
        />
      ) : (
        <ol className="space-y-3" aria-label="Saved versions, newest first">
          {list.data.map((rev) => (
            <RevisionRow key={rev.id} rev={rev} current={clean && rev.version === state.baseVersion} canRestore={canEdit} busy={restoring === rev.id} disabled={!!restoring} onRestore={() => void restore(rev)} />
          ))}
        </ol>
      )}
    </div>
  );
}

function RevisionRow({ rev, current, canRestore, busy, disabled, onRestore }: { rev: BumperRevision; current: boolean; canRestore: boolean; busy: boolean; disabled: boolean; onRestore: () => void }) {
  const { state } = useBuilder();
  const [ref, seen] = useSeen<HTMLLIElement>();
  const detail = useQuery({
    queryKey: bumperKeys.revision(state.showId, rev.id),
    queryFn: ({ signal }) => bumpersApi.revision(state.showId, rev.id, signal),
    enabled: seen,
    staleTime: Infinity,
  });
  const { title, named, icon: Icon } = reasonLabel(rev.reason);
  const first = detail.data?.slides.slice(0, 3) ?? [];
  return (
    <li ref={ref} className={cn('rounded-2xl border p-3', current ? 'border-ink/20 bg-surface-muted/50' : 'border-line')}>
      <div className="grid grid-cols-3 gap-1.5" aria-hidden="true">
        {detail.data
          ? Array.from({ length: 3 }, (_, i) =>
              first[i] ? (
                <BumperThumb key={first[i]!.id} slide={first[i]!} theme={detail.data.theme} data={state.data} showEventId={state.doc.eventId} className="aspect-video w-full rounded-md ring-1 ring-line" />
              ) : (
                <span key={i} className="aspect-video rounded-md border border-dashed border-line" />
              ),
            )
          : Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="aspect-video w-full" rounded="sm" />)}
      </div>
      <div className="mt-3 flex items-start gap-3">
        <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full', named ? 'bg-yellow-50 text-yellow-600' : 'bg-surface-muted text-ink-3')}>
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-[0.9375rem] text-ink', named ? 'font-semibold' : 'font-medium')}>{title}</p>
          <p className="mt-0.5 text-[0.8125rem] text-ink-3">
            <span className="mono tabular-nums">v{rev.version}</span> · {countLabel(rev.slideCount)} · <DateText value={rev.createdAt} format="relative" />
            {rev.createdByName ? ` · ${rev.createdByName}` : ''}
          </p>
        </div>
        {current ? (
          <span className="shrink-0 self-center rounded-full bg-ink px-2.5 py-0.5 text-[0.75rem] font-medium text-white">Now</span>
        ) : canRestore ? (
          <Button size="sm" variant="secondary" icon={<RotateCcw />} loading={busy} disabled={disabled && !busy} onClick={onRestore} className="shrink-0 self-center" aria-label={`Restore version ${rev.version}, ${title}`}>
            Restore
          </Button>
        ) : null}
      </div>
    </li>
  );
}
