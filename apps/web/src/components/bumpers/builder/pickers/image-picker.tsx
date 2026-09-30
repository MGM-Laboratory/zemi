'use client';

import type { BumperImagePick, ImageRef } from '@zemi/shared';
import { useQuery } from '@tanstack/react-query';
import { Check, ImagePlus, Upload, X } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { DragHandle, SortableList } from '@/components/admin/fields/sortable-list';
import { Button, IconButton } from '@/components/admin/ui/button';
import { Dialog } from '@/components/admin/ui/dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/admin/ui/feedback';
import { SearchInput } from '@/components/admin/ui/filters';
import { AdminImage } from '@/components/admin/ui/media';
import { ProgressRing } from '@/components/admin/ui/progress';
import { notify } from '@/components/admin/ui/toast';
import { SegmentedControl } from '@/components/admin/ui/toggles';
import { cn } from '@/lib/admin/cn';
import { uploadAsset } from '@/lib/admin/upload';
import { bumperKeys, bumpersApi } from '../../api';
import { useBuilder } from '../store';

type SourceFilter = 'all' | BumperImagePick['source'];

const SOURCE_LABEL: Record<BumperImagePick['source'], string> = { event: 'Event photo', upload: 'Upload', library: 'Library' };

export interface ImagePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Event photos and covers of this event come first. */
  eventId: string | null;
  multiple?: boolean;
  max?: number;
  /** Already chosen (multi mode keeps their order). */
  selected: string[];
  onPick: (ids: string[]) => void;
}

/**
 * Pick from event documentation photos, event covers, earlier bumper uploads and (with media
 * access) the library, or upload a new one (purpose "bumper"). Every image that shows up here is
 * merged into the builder's data bundle, so the canvas can paint it the moment it is picked.
 */
export function ImagePickerDialog({ open, onOpenChange, title, description, eventId, multiple, max = 24, selected, onPick }: ImagePickerDialogProps) {
  const b = useBuilder();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [chosen, setChosen] = useState<string[]>(selected);
  const [seenOpen, setSeenOpen] = useState(open);
  const [uploads, setUploads] = useState<BumperImagePick[]>([]);
  const [progress, setProgress] = useState<number | null | undefined>(undefined);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (seenOpen !== open) {
    setSeenOpen(open);
    if (open) setChosen(selected);
  }

  const list = useQuery({
    queryKey: bumperKeys.source('images', { eventId, q }),
    queryFn: ({ signal }) => bumpersApi.sources.images({ q: q || undefined, eventId: eventId ?? undefined, limit: 50 }, signal),
    enabled: open,
    staleTime: 30_000,
  });

  const all = [...uploads.filter((u) => !(list.data ?? []).some((p) => p.id === u.id)), ...(list.data ?? [])];
  const shown = filter === 'all' ? all : all.filter((p) => p.source === filter);
  const counts = { event: all.filter((p) => p.source === 'event').length, upload: all.filter((p) => p.source === 'upload').length, library: all.filter((p) => p.source === 'library').length };

  const remember = (picks: BumperImagePick[]) => {
    if (!picks.length) return;
    b.mergeData({ images: Object.fromEntries(picks.map((p) => [p.id, p.image])) });
  };

  const finish = (ids: string[]) => {
    remember(all.filter((p) => ids.includes(p.id)));
    onPick(ids);
    onOpenChange(false);
  };

  const toggle = (id: string) => {
    if (!multiple) return finish([id]);
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= max ? c : [...c, id]));
  };

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      notify.error('That file is not an image. Try a JPG, PNG or WebP.');
      return;
    }
    setProgress(0);
    try {
      const asset = await uploadAsset(file, { purpose: 'bumper', alt: file.name.replace(/\.[a-z0-9]+$/i, '') }, (p) => setProgress(p.phase === 'uploading' ? p.fraction : null));
      if (!asset.image) throw new Error('The image did not come through. Try another file.');
      const pick: BumperImagePick = { id: asset.id, image: asset.image, caption: asset.caption, source: 'upload' };
      setUploads((u) => [pick, ...u]);
      b.mergeData({ images: { [pick.id]: pick.image } });
      if (multiple) setChosen((c) => (c.length >= max ? c : [...c, pick.id]));
      else finish([pick.id]);
    } catch (err) {
      notify.error(err);
    } finally {
      setProgress(undefined);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) void upload(f);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="lg"
      footer={
        multiple ? (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => finish(chosen)}>
              {chosen.length ? `Use ${chosen.length} ${chosen.length === 1 ? 'image' : 'images'}` : 'Use no images'}
            </Button>
          </>
        ) : undefined
      }
    >
      <div
        className="space-y-3"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput value={q} onValueChange={setQ} placeholder="Search captions and names" className="sm:flex-1" loading={list.isFetching} aria-label="Search images" />
          <SegmentedControl<SourceFilter>
            aria-label="Where from"
            size="sm"
            value={filter}
            onValueChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'event', label: 'Event', count: counts.event || undefined },
              { value: 'upload', label: 'Uploads', count: counts.upload || undefined },
              ...(counts.library ? [{ value: 'library' as const, label: 'Library', count: counts.library }] : []),
            ]}
          />
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void upload(f);
          }}
        />
        <ul className={cn('grid grid-cols-3 gap-2 sm:grid-cols-4', dragOver && 'rounded-2xl ring-2 ring-blue ring-offset-4')} aria-label="Images">
          <li>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={progress !== undefined}
              className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line-strong bg-surface-muted text-sm font-medium text-ink-2 transition hover:border-ink-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-progress"
            >
              {progress !== undefined ? (
                <ProgressRing value={progress} size={44} stroke={4} label="Uploading" />
              ) : (
                <>
                  <Upload className="size-5 text-ink-3" />
                  <span>Upload</span>
                  <span className="text-xs font-normal text-ink-3">or drop a file</span>
                </>
              )}
            </button>
          </li>
          {list.isLoading
            ? Array.from({ length: 7 }, (_, i) => (
                <li key={i}>
                  <Skeleton className="aspect-[4/3] w-full" rounded="lg" />
                </li>
              ))
            : shown.map((p) => {
                const on = multiple ? chosen.includes(p.id) : selected.includes(p.id);
                const n = multiple ? chosen.indexOf(p.id) + 1 : 0;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => toggle(p.id)}
                      aria-pressed={on}
                      aria-label={`${p.caption || p.image.alt || 'Image'}, ${SOURCE_LABEL[p.source]}`}
                      className={cn(
                        'group relative block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-surface-muted ring-offset-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                        on ? 'ring-2 ring-blue' : 'hover:ring-1 hover:ring-ink-4',
                      )}
                    >
                      <AdminImage image={p.image} sizes="180px" className="size-full" imgClassName="transition-transform duration-300 group-hover:scale-[1.03]" />
                      <span className="absolute inset-x-1.5 bottom-1.5 truncate rounded-full bg-white/90 px-2 py-0.5 text-left text-[0.6875rem] text-ink-2 shadow-[var(--shadow-1)]">{p.caption || SOURCE_LABEL[p.source]}</span>
                      {on ? (
                        <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-blue text-xs font-bold text-white shadow-[var(--shadow-1)]">{n ? n : <Check className="size-3.5" strokeWidth={3} />}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
        </ul>
        {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} size="sm" /> : null}
        {!list.isLoading && !list.isError && !shown.length ? (
          <EmptyState size="sm" framed={false} title={q ? 'Nothing matches that' : 'No photos here yet'} description={q ? 'Try another word, or upload one.' : 'Upload one and it stays here for every show.'} cast={[{ shape: 'square', mood: 'look', size: 40, lookAt: { x: -0.6, y: 0.4 } }]} />
        ) : null}
        {multiple && chosen.length >= max ? <p className="text-sm text-ink-3">That&apos;s the most this bumper can hold ({max}).</p> : null}
      </div>
    </Dialog>
  );
}

/** One image: a preview with Change and Remove. */
export function ImageField({ value, image, onChange, eventId, label, readOnly, emptyLabel = 'Pick an image', focusKey }: { value: string | null | undefined; image: ImageRef | null; onChange: (id: string | null) => void; eventId: string | null; label: string; readOnly?: boolean; emptyLabel?: string; focusKey?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-focus={focusKey}>
      {value && image ? (
        <div className="group relative overflow-hidden rounded-2xl border border-line bg-surface-muted">
          <AdminImage image={image} sizes="320px" className="aspect-video w-full" />
          {readOnly ? null : (
            <div className="absolute inset-x-2 bottom-2 flex justify-end gap-1.5">
              <Button size="xs" variant="secondary" onClick={() => setOpen(true)} icon={<ImagePlus />} aria-label={`Change ${label.toLowerCase()}`}>
                Change
              </Button>
              <IconButton size="xs" variant="secondary" label={`Remove ${label.toLowerCase()}`} onClick={() => onChange(null)}>
                <X />
              </IconButton>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={readOnly}
          className="flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line-strong bg-surface-muted text-sm font-medium text-ink-2 transition hover:border-ink-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-default disabled:opacity-60"
        >
          <ImagePlus className="size-5 text-ink-3" />
          {value ? 'That image is gone. Pick another.' : emptyLabel}
        </button>
      )}
      <ImagePickerDialog open={open} onOpenChange={setOpen} title={label} description="Event photos, covers and your uploads." eventId={eventId} selected={value ? [value] : []} onPick={(ids) => onChange(ids[0] ?? null)} />
    </div>
  );
}

/** Several images in order (logos, sponsors). */
export function ImagesField({ value, images, onChange, eventId, label, max = 24, readOnly, focusKey }: { value: string[]; images: Record<string, ImageRef>; onChange: (ids: string[]) => void; eventId: string | null; label: string; max?: number; readOnly?: boolean; focusKey?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2" data-focus={focusKey}>
      {value.length ? (
        <SortableList
          items={value}
          getId={(id) => id}
          onReorder={onChange}
          readOnly={readOnly}
          aria-label={label}
          itemLabel={(id) => images[id]?.alt || 'image'}
          renderItem={(id, { handle }) => (
            <div className="flex items-center gap-2 rounded-2xl border border-line bg-white p-1.5 pr-2">
              <DragHandle {...handle} disabled={readOnly} />
              {images[id] ? <AdminImage image={images[id]} sizes="96px" className="h-10 w-16 shrink-0 rounded-lg" fit="contain" /> : <span className="h-10 w-16 shrink-0 rounded-lg bg-surface-muted" />}
              <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{images[id]?.alt || 'Image'}</span>
              {readOnly ? null : (
                <IconButton size="sm" label="Remove" onClick={() => onChange(value.filter((x) => x !== id))}>
                  <X />
                </IconButton>
              )}
            </div>
          )}
        />
      ) : null}
      {readOnly ? null : (
        <Button size="sm" variant="secondary" icon={<ImagePlus />} onClick={() => setOpen(true)} disabled={value.length >= max}>
          {value.length ? 'Add or change images' : 'Pick images'}
        </Button>
      )}
      <ImagePickerDialog open={open} onOpenChange={setOpen} title={label} description={`Up to ${max}. The order here is the order on screen.`} eventId={eventId} multiple max={max} selected={value} onPick={onChange} />
    </div>
  );
}
