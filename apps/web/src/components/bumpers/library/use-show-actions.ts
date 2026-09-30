'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { BumperShowRow, BumperShowStatus } from '@zemi/shared';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useConfirm } from '@/components/admin/ui/confirm-dialog';
import { notify } from '@/components/admin/ui/toast';
import { isApiError } from '@/lib/admin/api';
import { useAdminMutation } from '@/lib/admin/hooks';
import { adminRoutes } from '@/lib/admin/nav';
import { bumperKeys, bumpersApi } from '../api';
import { countLabel } from './labels';

/** A status change with the row's version; if the builder saved in the meantime, once more on top of that save. */
async function setStatus(row: BumperShowRow, status: BumperShowStatus) {
  try {
    return await bumpersApi.update(row.id, { baseVersion: row.version, status });
  } catch (err) {
    const latest = isApiError(err) && err.code === 'version_conflict' ? (err.details as { version?: unknown } | null)?.version : undefined;
    if (typeof latest === 'number') return bumpersApi.update(row.id, { baseVersion: latest, status });
    throw err;
  }
}

/**
 * Duplicate, archive, restore and delete for show cards, with the confirmations and toasts.
 * Every write refreshes every show list (the library and the event tab share the prefix).
 */
export function useShowActions() {
  const qc = useQueryClient();
  const router = useRouter();
  const confirm = useConfirm();
  const lists = [bumperKeys.lists()];

  const duplicate = useAdminMutation({
    mutationFn: (row: BumperShowRow) => bumpersApi.duplicate(row.id, {}),
    invalidate: lists,
    onSuccess: (copy) => {
      notify.success(`Copied. "${copy.title}" is at the top of the list.`, {
        celebrate: 'square',
        action: { label: 'Open it', onClick: () => router.push(adminRoutes.bumper(copy.id)) },
      });
    },
  });

  const status = useAdminMutation({
    mutationFn: (v: { row: BumperShowRow; status: BumperShowStatus }) => setStatus(v.row, v.status),
    invalidate: (_d, v) => [...lists, bumperKeys.detail(v.row.id)],
    successMessage: (_d, v) => (v.status === 'archived' ? 'Archived. Its OBS links are paused until you restore it.' : 'Restored. The OBS links work again.'),
  });

  const remove = useAdminMutation({
    mutationFn: (row: BumperShowRow) => bumpersApi.remove(row.id),
    invalidate: lists,
    successMessage: 'Deleted. The show and its OBS links are gone.',
    onSuccess: (_d, row) => {
      qc.removeQueries({ queryKey: bumperKeys.detail(row.id) });
    },
  });

  const dup = duplicate.mutate;
  const setShowStatus = status.mutate;
  const del = remove.mutate;
  const actions = useMemo(
    () => ({
      duplicate: (row: BumperShowRow) => dup(row),
      restore: (row: BumperShowRow) => setShowStatus({ row, status: 'active' }),
      async archive(row: BumperShowRow) {
        const onAir = row.live.onAir;
        const ok = await confirm({
          title: `Archive "${row.title}"?`,
          description: onAir
            ? 'It is on air right now. The OBS output and docks go dark straight away, and the links stop working until you restore it. Nothing is deleted.'
            : 'Its OBS links stop working until you restore it. The bumpers and their history stay put.',
          confirmLabel: 'Archive show',
          destructive: onAir,
        });
        if (ok) setShowStatus({ row, status: 'archived' });
      },
      async remove(row: BumperShowRow) {
        const ok = await confirm({
          title: 'Delete this show?',
          description: `${countLabel(row.slideCount)}, the saved history and both OBS links go with it. Any screen still showing it goes quiet. This cannot be undone.`,
          destructive: true,
          confirmLabel: 'Delete show',
          typeToConfirm: row.title,
        });
        if (ok) del(row);
      },
    }),
    [dup, setShowStatus, del, confirm],
  );

  /** The show with a write in flight (its card dims while it runs). */
  const pendingId = duplicate.isPending ? duplicate.variables?.id : status.isPending ? status.variables?.row.id : remove.isPending ? remove.variables?.id : undefined;
  return { actions, pendingId };
}

export type ShowActions = ReturnType<typeof useShowActions>['actions'];
