'use client';

import type { EventMediaAdminItem } from '@zemi/shared';
import { Camera, ImagePlus, Lock } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { Character } from '@/components/admin/characters/character';
import { Button } from '@/components/admin/ui/button';
import { ConfirmDialog } from '@/components/admin/ui/confirm-dialog';
import { Callout, EmptyState, ErrorState, Skeleton } from '@/components/admin/ui/feedback';
import { notify } from '@/components/admin/ui/toast';
import { cn } from '@/lib/admin/cn';
import { formatBytes } from '@/lib/admin/format';
import { useWorkspaceEvent } from '../events/use-event';
import { MediaLightbox } from './lightbox';
import { MediaGrid } from './media-grid';
import { IMAGE_MAX, kindOf, UploadQueueList, useUploadQueue, VIDEO_MAX } from './upload-queue';
import { useEventMedia, useMediaActions } from './use-media';
import '../stream/stream.css';

/** What `documentation` accepts on the API (apps/api/src/common/mime.ts), incl. phone formats. */
const ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
  'video/x-m4v',
]);
const EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.heic', '.heif', '.gif', '.mp4', '.m4v', '.mov', '.webm', '.mkv'];
// Drops and picks are checked against these extensions (plus `validate`).
const ACCEPT = {
  'image/*': EXTS.filter((e) => !['.mp4', '.m4v', '.mov', '.webm', '.mkv'].includes(e)),
  'video/*': ['.mp4', '.m4v', '.mov', '.webm', '.mkv'],
};

/**
 * The file input's own `accept`. react-dropzone drops `image/*` and `video/*` from the input when
 * extensions are listed, and phones only offer the camera roll for the wildcards.
 */
const INPUT_ACCEPT = 'image/*,video/*';

/** Our copy for a rejected file (react-dropzone's own messages list every extension). */
function rejectionMessage(r: FileRejection) {
  const codes = r.errors.map((e) => e.code);
  if (codes.includes('file-too-large')) {
    const max = kindOf(r.file) === 'video' ? VIDEO_MAX : IMAGE_MAX;
    return `${r.file.name} is over ${formatBytes(max)}.`;
  }
  if (codes.includes('file-invalid-type')) return `${r.file.name}: only photos and videos fit here.`;
  return r.errors[0]?.message ?? "That file doesn't fit here.";
}

function validate(file: File) {
  const kind = kindOf(file);
  const ext = `.${file.name.toLowerCase().split('.').pop() ?? ''}`;
  if (!kind || (file.type && !ALLOWED.has(file.type.toLowerCase()) && !EXTS.includes(ext))) {
    return { code: 'file-invalid-type', message: `${file.name}: only photos and videos fit here.` };
  }
  const max = kind === 'video' ? VIDEO_MAX : IMAGE_MAX;
  if (file.size > max) return { code: 'file-too-large', message: `${file.name} is over ${formatBytes(max)}.` };
  return null;
}

/**
 * The Media tab of the event workspace (`/admin/events/[id]/media`): documentation photos and
 * videos. Drop several at once (or pick from the camera roll), watch each upload, then reorder,
 * star, caption, preview and remove. Viewers can look; changes need `media.manage`.
 */
export function MediaDocsTab() {
  const { id, can } = useWorkspaceEvent();
  const canManage = can('media.manage');
  const media = useEventMedia(id);
  const actions = useMediaActions(id);
  const queue = useUploadQueue(actions, media.data);
  const reduce = useReducedMotion();
  const [openId, setOpenId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<EventMediaAdminItem | null>(null);
  const [cheer, setCheer] = useState(0);

  const items = media.data ?? [];
  const photos = items.filter((m) => m.kind === 'image').length;
  const videos = items.length - photos;
  const featured = items.filter((m) => m.featured).length;

  const onDrop = useCallback(
    (ok: File[], bad: FileRejection[]) => {
      const added = queue.addFiles(ok);
      if (added) setCheer((c) => c + 1);
      if (bad.length) {
        const first = rejectionMessage(bad[0]!);
        notify.error(bad.length === 1 ? first : `${bad.length} files were skipped. ${first}`);
      }
    },
    [queue],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: true,
    noClick: true,
    noKeyboard: true,
    validator: validate,
    disabled: !canManage,
  });

  const toggleFeatured = (m: EventMediaAdminItem) => void actions.update.mutateAsync({ id: m.id, patch: { featured: !m.featured } }).catch(() => {});

  return (
    // Without media.manage the tab is a plain div: a disabled dropzone root would mark the whole gallery aria-disabled.
    <div {...(canManage ? getRootProps({ className: 'relative space-y-5 outline-none' }) : { className: 'relative space-y-5' })}>
      {canManage ? <input {...getInputProps({ 'aria-label': 'Add photos and videos', accept: INPUT_ACCEPT })} /> : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.2]">Documentation</h2>
          <p className="text-sm text-ink-3">
            Photos and videos from the day. The event page shows them in this order, starred ones get the big spots.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {items.length ? (
            <span className="mono text-xs text-ink-3 tabular-nums">
              {photos} {photos === 1 ? 'photo' : 'photos'}, {videos} {videos === 1 ? 'video' : 'videos'}
              {featured ? `, ${featured} starred` : ''}
            </span>
          ) : null}
          {canManage ? (
            <Button variant="primary" icon={<ImagePlus />} onClick={open}>
              Add photos and videos
            </Button>
          ) : null}
        </div>
      </div>

      {!canManage ? (
        <Callout tone="neutral" icon={<Lock />}>
          You can look around. Adding, starring and reordering need media access for this event.
        </Callout>
      ) : null}

      {canManage && (items.length > 0 || queue.items.length > 0) ? (
        <button
          type="button"
          onClick={open}
          className={cn(
            'group flex w-full items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface-muted px-4 py-3 text-left transition',
            'hover:border-ink-4 hover:bg-white focus-visible:border-blue focus-visible:outline-none focus-visible:shadow-[0_0_0_5px_rgba(58,109,197,0.14)] active:scale-[0.995]',
          )}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-ink-2 ring-1 ring-line transition-transform group-hover:-rotate-6">
            <Camera className="size-[18px]" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-[0.9375rem] font-medium text-ink">Drop more here, or tap to pick</span>
            <span className="block text-[0.8125rem] text-ink-3">Photos up to {formatBytes(IMAGE_MAX)}, videos up to {formatBytes(VIDEO_MAX)}. Several at once is fine.</span>
          </span>
        </button>
      ) : null}

      <UploadQueueList items={queue.items} onCancel={queue.cancel} onRetry={queue.retry} onClear={queue.clearFinished} />

      {media.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/3] w-full" rounded="lg" />
          ))}
        </div>
      ) : media.isError ? (
        <ErrorState error={media.error} onRetry={() => void media.refetch()} retrying={media.isFetching} />
      ) : items.length === 0 && queue.items.length === 0 ? (
        canManage ? (
          <BigDropZone onPick={open} cheer={cheer} />
        ) : (
          <EmptyState title="No photos yet" description="Once someone adds the photos from this Friday, they show up here and on the event page." />
        )
      ) : (
        <>
          <MediaGrid
            items={items}
            canManage={canManage}
            onReorder={(ids) => void actions.reorder.mutateAsync(ids).catch(() => {})}
            onOpen={setOpenId}
            onToggleFeatured={toggleFeatured}
            onCaption={(m, caption) => actions.update.mutateAsync({ id: m.id, patch: { caption } })}
            onRemove={setRemoving}
            previewFor={queue.previewFor}
          />
          {canManage && items.length > 1 ? (
            <p className="text-[0.8125rem] text-ink-3">
              Drag a tile to move it (long-press on a phone). With a keyboard: focus the handle, press Space, use the arrows, press Space again.
            </p>
          ) : null}
        </>
      )}

      <MediaLightbox
        items={items}
        openId={openId}
        onOpenChange={(o) => !o && setOpenId(null)}
        onNavigate={setOpenId}
        canManage={canManage}
        onToggleFeatured={toggleFeatured}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        destructive
        title={removing?.kind === 'video' ? 'Take this video out?' : 'Take this photo out?'}
        description="It disappears from the gallery and the event page. The file stays in the media library, so nothing is lost."
        confirmLabel="Take it out"
        onConfirm={() => (removing ? actions.remove.mutateAsync(removing.id) : undefined)}
      />

      <AnimatePresence>
        {isDragActive ? (
          <motion.div
            key="drop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.1 : 0.18 }}
            className="pointer-events-none fixed inset-0 z-[55] flex items-center justify-center bg-blue/12 p-6 backdrop-blur-[2px]"
          >
            <motion.div
              initial={reduce ? false : { scale: 0.92, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22 }}
              className="flex flex-col items-center gap-3 rounded-[28px] border-2 border-dashed border-blue bg-white px-10 py-8 text-center shadow-[var(--shadow-3)]"
            >
              <div className="flex items-end gap-1" aria-hidden="true">
                <Character shape="circle" mood="cheer" size={52} replayKey={1} />
                <Character shape="square" mood="happy" size={40} />
              </div>
              <p className="font-display text-2xl font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.5]">Let go, we&apos;ve got it.</p>
              <p className="text-sm text-ink-3">Photos and videos go straight into this event&apos;s gallery.</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** The empty state doubles as the drop zone. */
function BigDropZone({ onPick, cheer }: { onPick: () => void; cheer: number }) {
  return (
    <div className="relative overflow-hidden rounded-[20px] border-2 border-dashed border-line-strong bg-white sm:rounded-[var(--radius-card)]">
      <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(var(--color-graph)_1px,transparent_1px),linear-gradient(90deg,var(--color-graph)_1px,transparent_1px)] [background-size:24px_24px]" aria-hidden="true" />
      <div className="relative flex flex-col items-center gap-4 px-6 py-14 text-center sm:py-20">
        <div className="flex items-end gap-1.5" aria-hidden="true">
          <Character shape="square" mood="look" size={60} lookAt={{ x: 0.6, y: 0.4 }} replayKey={cheer} />
          <Character shape="circle" mood="idle" size={44} follow />
          <Character shape="triangle" mood="sleep" size={38} />
        </div>
        <div className="max-w-md">
          <h3 className="font-display text-2xl font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.4]">No photos yet. Were you all hiding?</h3>
          <p className="mt-2 text-[0.9375rem] text-ink-3">
            Drop the photos and clips from this Friday here, or pick them from your camera roll. Several at once is fine.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" size="lg" icon={<ImagePlus />} onClick={onPick}>
            Pick photos and videos
          </Button>
        </div>
        <p className="text-xs text-ink-4">
          JPG, PNG, HEIC, WebP up to {formatBytes(IMAGE_MAX)}. MP4, MOV, WebM up to {formatBytes(VIDEO_MAX)}.
        </p>
      </div>
    </div>
  );
}
