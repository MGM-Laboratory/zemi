'use client';

import type { EventMediaAdminItem } from '@zemi/shared';
import { Check, FileVideo, ImageIcon, RotateCcw, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, IconButton } from '@/components/admin/ui/button';
import { Progress } from '@/components/admin/ui/progress';
import { Spinner } from '@/components/admin/ui/spinner';
import { errorMessage, isAbortError } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { formatBytes } from '@/lib/admin/format';
import { uploadAsset } from '@/lib/admin/upload';
import type { useMediaActions } from './use-media';

export type QueuePhase = 'queued' | 'uploading' | 'attaching' | 'processing' | 'done' | 'failed';

export interface QueueItem {
  key: string;
  file: File;
  kind: 'image' | 'video';
  /** Object URL for a local preview (revoked when the tab unmounts). */
  preview: string;
  phase: QueuePhase;
  fraction: number | null;
  loaded: number;
  error: string | null;
  assetId: string | null;
  mediaId: string | null;
}

/** How many files upload at the same time. */
const PARALLEL = 3;

export const IMAGE_MAX = 100 * 1024 ** 2;
export const VIDEO_MAX = 4 * 1024 ** 3;

export function kindOf(file: File): 'image' | 'video' | null {
  const t = file.type.toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  if (['jpg', 'jpeg', 'png', 'webp', 'avif', 'heic', 'heif', 'gif'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'm4v', 'webm', 'mkv'].includes(ext)) return 'video';
  return null;
}

/**
 * Upload queue for documentation media: up to three uploads in parallel, each with its own
 * progress. As soon as the server has a file it is attached to the event (one POST at a time, so
 * the sort order stays in upload order), then the item follows the gallery until it is ready.
 */
export function useUploadQueue(actions: ReturnType<typeof useMediaActions>, media: EventMediaAdminItem[] | undefined) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const itemsRef = useRef(items);
  const controllers = useRef(new Map<string, AbortController>());
  const running = useRef(new Set<string>());
  const attachChain = useRef<Promise<unknown>>(Promise.resolve());
  const previews = useRef(new Map<string, string>());
  const addRef = useRef(actions.add);
  const discardRef = useRef(actions.discard);
  const refreshRef = useRef(actions.refreshEvent);
  useEffect(() => {
    itemsRef.current = items;
    addRef.current = actions.add;
    discardRef.current = actions.discard;
    refreshRef.current = actions.refreshEvent;
  });

  // Leaving the page mid-upload would cancel it: ask first.
  const uploading = items.some((i) => i.phase === 'queued' || i.phase === 'uploading' || i.phase === 'attaching');
  useEffect(() => {
    if (!uploading) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers only ask when returnValue is set.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [uploading]);

  const patch = useCallback((key: string, p: Partial<QueueItem>) => {
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...p } : it)));
  }, []);

  /** Attach an uploaded asset to the gallery. One attach at a time: the server appends at max(sortOrder) + 1. */
  const attach = useCallback(
    async (key: string, assetId: string) => {
      patch(key, { phase: 'attaching', assetId, fraction: 1, error: null });
      try {
        const attached = (attachChain.current = attachChain.current
          .catch(() => {})
          .then(() => addRef.current.mutateAsync({ assetId })));
        const media = (await attached) as EventMediaAdminItem;
        patch(key, { phase: media.status === 'ready' ? 'done' : 'processing', mediaId: media.id });
        refreshRef.current();
      } catch (err) {
        // The file is safe on the server: retry only attaches it again.
        patch(key, { phase: 'failed', error: errorMessage(err) });
      }
    },
    [patch],
  );

  const run = useCallback(
    async (item: QueueItem) => {
      running.current.add(item.key);
      const ctrl = new AbortController();
      controllers.current.set(item.key, ctrl);
      patch(item.key, { phase: 'uploading', fraction: 0, loaded: 0, error: null });
      try {
        const asset = await uploadAsset(item.file, { purpose: 'documentation', signal: ctrl.signal, wait: false }, (p) => {
          if (p.phase === 'uploading') patch(item.key, { fraction: p.fraction, loaded: p.loaded });
        });
        previews.current.set(asset.id, item.preview);
        await attach(item.key, asset.id);
      } catch (err) {
        if (isAbortError(err)) {
          setItems((list) => list.filter((it) => it.key !== item.key));
          URL.revokeObjectURL(item.preview);
        } else {
          patch(item.key, { phase: 'failed', error: errorMessage(err) });
        }
      } finally {
        running.current.delete(item.key);
        controllers.current.delete(item.key);
      }
    },
    [patch, attach],
  );

  // Start queued items while fewer than PARALLEL are uploading.
  useEffect(() => {
    const uploading = items.filter((i) => i.phase === 'uploading').length;
    let free = PARALLEL - uploading;
    for (const it of items) {
      if (free <= 0) break;
      if (it.phase === 'queued' && !running.current.has(it.key)) {
        free -= 1;
        void run(it);
      }
    }
  }, [items, run]);

  // Follow the gallery: a processing item reads as done (or failed) once its media item says so.
  const view = useMemo(() => {
    if (!media) return items;
    const byId = new Map(media.map((m) => [m.id, m]));
    return items.map((it): QueueItem => {
      if (it.phase !== 'processing' || !it.mediaId) return it;
      const m = byId.get(it.mediaId);
      if (m?.status === 'ready') return { ...it, phase: 'done' };
      if (m?.status === 'failed') return { ...it, phase: 'failed', error: m.error || "It uploaded, but we couldn't process it. Try another copy." };
      return it;
    });
  }, [items, media]);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  });

  // Done items fade out after a moment.
  const doneKeys = view
    .filter((i) => i.phase === 'done')
    .map((i) => i.key)
    .join('|');
  useEffect(() => {
    if (!doneKeys) return;
    const keys = new Set(doneKeys.split('|'));
    const t = setTimeout(() => setItems((list) => list.filter((it) => !keys.has(it.key))), 3200);
    return () => clearTimeout(t);
  }, [doneKeys]);

  // Revoke every preview URL when the tab goes away.
  useEffect(() => {
    const ctrls = controllers.current;
    const urls = previews.current;
    const list = itemsRef;
    return () => {
      for (const c of ctrls.values()) c.abort();
      for (const it of list.current) URL.revokeObjectURL(it.preview);
      for (const url of urls.values()) URL.revokeObjectURL(url);
    };
  }, []);

  const addFiles = useCallback((files: File[]) => {
    const fresh: QueueItem[] = [];
    for (const file of files) {
      const kind = kindOf(file);
      if (!kind) continue;
      fresh.push({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        kind,
        preview: URL.createObjectURL(file),
        phase: 'queued',
        fraction: null,
        loaded: 0,
        error: null,
        assetId: null,
        mediaId: null,
      });
    }
    if (fresh.length) setItems((list) => [...list, ...fresh]);
    return fresh.length;
  }, []);

  const cancel = useCallback((key: string) => {
    const c = controllers.current.get(key);
    if (c) c.abort();
    else
      setItems((list) => {
        const it = list.find((i) => i.key === key);
        if (it && !it.assetId) URL.revokeObjectURL(it.preview);
        return list.filter((i) => i.key !== key);
      });
  }, []);

  const retry = useCallback(
    (key: string) => {
      const it = viewRef.current.find((i) => i.key === key);
      if (!it) return;
      // Uploaded but the attach failed: attach it again, no second upload.
      if (it.assetId && !it.mediaId) {
        void attach(key, it.assetId);
        return;
      }
      // Attached but failed to process: take the broken tile out, then upload a fresh copy.
      if (it.mediaId) void discardRef.current.mutateAsync(it.mediaId).catch(() => {});
      patch(key, { phase: 'queued', error: null, fraction: null, loaded: 0, assetId: null, mediaId: null });
    },
    [patch, attach],
  );

  const clearFinished = useCallback(() => {
    const finished = new Set(viewRef.current.filter((i) => i.phase === 'done' || i.phase === 'failed').map((i) => i.key));
    setItems((list) => list.filter((i) => !finished.has(i.key)));
  }, []);

  /** Local preview for an asset the queue uploaded (used by processing tiles). */
  const previewFor = useCallback((assetId: string) => previews.current.get(assetId) ?? null, []);

  return { items: view, uploading, addFiles, cancel, retry, clearFinished, previewFor };
}

const PHASE_TEXT: Record<QueuePhase, string> = {
  queued: 'Waiting for a free lane',
  uploading: 'Uploading',
  attaching: 'Adding to the gallery',
  processing: 'Processing',
  done: 'In the gallery',
  failed: 'Did not work',
};

/** The per-file list under the drop zone. */
export function UploadQueueList({
  items,
  onCancel,
  onRetry,
  onClear,
}: {
  items: QueueItem[];
  onCancel: (key: string) => void;
  onRetry: (key: string) => void;
  onClear: () => void;
}) {
  if (!items.length) return null;
  const active = items.filter((i) => i.phase === 'queued' || i.phase === 'uploading' || i.phase === 'attaching').length;
  const processing = items.filter((i) => i.phase === 'processing').length;
  const failed = items.filter((i) => i.phase === 'failed').length;
  return (
    <section aria-label="Uploads" className="rounded-[20px] border border-line bg-white sm:rounded-[24px]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <p className="text-sm text-ink-2" role="status" aria-live="polite">
          {active ? `${active} uploading` : processing ? 'Uploads finished' : failed ? 'Some did not make it' : 'All done'}
          {processing ? `, ${processing} still processing` : ''}
          {failed ? `, ${failed} failed` : ''}.
        </p>
        {items.some((i) => i.phase === 'done' || i.phase === 'failed') ? (
          <Button size="xs" variant="ghost" onClick={onClear}>
            Clear finished
          </Button>
        ) : null}
      </div>
      <ul className="max-h-[22rem] divide-y divide-line overflow-y-auto">
        <AnimatePresence initial={false}>
          {items.map((it) => (
            <motion.li
              key={it.key}
              layout="position"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <QueueRow item={it} onCancel={onCancel} onRetry={onRetry} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

function QueueRow({ item, onCancel, onRetry }: { item: QueueItem; onCancel: (key: string) => void; onRetry: (key: string) => void }) {
  const [thumbBroken, setThumbBroken] = useState(false);
  const pct = item.fraction == null ? null : Math.round(item.fraction * 100);
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
      <div className="relative size-11 shrink-0 overflow-hidden rounded-xl bg-surface-muted text-ink-3">
        {!thumbBroken ? (
          item.kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.preview} alt="" className="size-full object-cover" onError={() => setThumbBroken(true)} />
          ) : (
            <video src={`${item.preview}#t=0.5`} muted playsInline preload="metadata" className="size-full object-cover" onError={() => setThumbBroken(true)} aria-hidden="true" />
          )
        ) : (
          <span className="flex size-full items-center justify-center">{item.kind === 'image' ? <ImageIcon className="size-5" /> : <FileVideo className="size-5" />}</span>
        )}
        {item.phase === 'done' ? (
          <motion.span
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 18 }}
            className="absolute inset-0 flex items-center justify-center bg-green/85 text-white"
          >
            <Check className="size-5" strokeWidth={3} aria-hidden="true" />
          </motion.span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-ink" title={item.file.name}>
            {item.file.name}
          </span>
          <span className="mono shrink-0 text-xs text-ink-3 tabular-nums">
            {item.phase === 'uploading' && pct != null ? `${pct}%` : formatBytes(item.file.size)}
          </span>
        </div>
        {item.phase === 'uploading' ? (
          <Progress value={item.fraction} size="sm" className="mt-1.5" label={`Uploading ${item.file.name}`} />
        ) : (
          <p className={cn('mt-0.5 flex items-center gap-1.5 text-xs', item.phase === 'failed' ? 'font-medium text-red-600' : 'text-ink-3')}>
            {item.phase === 'attaching' || item.phase === 'processing' ? <Spinner size={12} label={null} /> : null}
            {item.phase === 'failed' && item.error ? item.error : PHASE_TEXT[item.phase]}
            {item.phase === 'processing' && item.kind === 'video' ? '. Videos take a few minutes' : ''}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {item.phase === 'failed' ? (
          <IconButton label={`Try ${item.file.name} again`} size="sm" onClick={() => onRetry(item.key)}>
            <RotateCcw />
          </IconButton>
        ) : null}
        {item.phase === 'queued' || item.phase === 'uploading' || item.phase === 'failed' ? (
          <IconButton label={item.phase === 'failed' ? `Dismiss ${item.file.name}` : `Cancel ${item.file.name}`} size="sm" onClick={() => onCancel(item.key)}>
            <X />
          </IconButton>
        ) : null}
      </div>
    </div>
  );
}
