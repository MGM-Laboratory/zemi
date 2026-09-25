'use client';

import { useQueryClient } from '@tanstack/react-query';
import { assetMetaInput, PURPOSE_ASPECT, type Asset, type AssetPurpose } from '@zemi/shared';
import { Check, Copy, Crop as CropIcon, Download, ExternalLink, Trash2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import type { z } from 'zod';
import {
  AdminImage,
  Badge,
  Button,
  ConfirmDialog,
  DateText,
  ErrorState,
  FormField,
  IconButton,
  Input,
  KeyValue,
  notify,
  Sheet,
  Skeleton,
  SkeletonText,
  Spinner,
  StatusChip,
  Textarea,
  Tooltip,
  useCopy,
} from '@/components/admin/ui';
import { api, errorMessage } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { applyApiErrorToForm, useZodForm } from '@/lib/admin/form';
import { formatBytes, formatDuration } from '@/lib/admin/format';
import { useAdminMutation, useAssetPoll } from '@/lib/admin/hooks';
import { adminKeys } from '@/lib/admin/query-keys';
import { recropAsset } from '@/lib/admin/upload';
import { dimensions, KIND_LABELS, PURPOSE_LABELS } from './media-meta';

const CropDialog = dynamic(() => import('@/components/admin/fields/crop-dialog'), { ssr: false });

type MetaValues = z.input<typeof assetMetaInput>;

/** Detail panel for one asset: preview, alt/caption/credit, facts, every variant URL, re-crop, delete. */
export function AssetSheet({ asset: seed, assetId, onClose }: { asset: Asset | null; assetId: string | null; onClose: () => void }) {
  const poll = useAssetPoll(assetId, { initial: seed });
  const asset = poll.data && poll.data.id === assetId ? poll.data : seed;
  const qc = useQueryClient();
  const [cropOpen, setCropOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const wasProcessing = useRef(false);

  // Tell people when a re-crop they started here finishes.
  useEffect(() => {
    if (!asset || asset.status === 'processing') return;
    if (wasProcessing.current) {
      wasProcessing.current = false;
      if (asset.status === 'ready') notify.success('The new version is live everywhere it is used.', { celebrate: 'circle' });
      else notify.error(asset.error || "We couldn't process that one.");
      void qc.invalidateQueries({ queryKey: adminKeys.assets.lists() });
    }
  }, [asset, asset?.status, qc]);

  const title = asset ? (asset.alt || asset.originalFilename) : 'File';
  return (
    <Sheet
      open={Boolean(assetId)}
      onOpenChange={(o) => !o && onClose()}
      width="lg"
      title={title}
      description={
        asset ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge size="sm" tone="outline" shape={KIND_LABELS[asset.kind]?.shape}>
              {KIND_LABELS[asset.kind]?.one ?? asset.kind}
            </Badge>
            <Badge size="sm">{PURPOSE_LABELS[asset.purpose] ?? asset.purpose}</Badge>
            <StatusChip kind="asset" value={asset.status} size="sm" />
          </span>
        ) : undefined
      }
      footer={
        asset ? (
          <>
            <Button type="button" variant="danger-soft" icon={<Trash2 />} className="sm:mr-auto" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
            {asset.kind === 'image' ? (
              <Button type="button" variant="secondary" icon={<CropIcon />} onClick={() => setCropOpen(true)} disabled={asset.status === 'processing'}>
                Re-crop
              </Button>
            ) : null}
            <Button type="button" variant="secondary" icon={<Download />} asChild>
              <a href={asset.originalUrl} download={asset.originalFilename}>
                Original
              </a>
            </Button>
          </>
        ) : null
      }
    >
      {!asset ? (
        poll.isError ? (
          <ErrorState error={poll.error} size="sm" onRetry={() => void poll.refetch()} />
        ) : (
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="aspect-[4/3] w-full" rounded="lg" />
            <SkeletonText lines={4} />
          </div>
        )
      ) : (
        <div className="space-y-7">
          <Preview asset={asset} />
          {asset.status === 'failed' && asset.error ? (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600" role="alert">
              {asset.error}
            </p>
          ) : null}
          <MetaForm key={asset.id} asset={asset} />
          <section aria-labelledby="asset-facts" className="space-y-3">
            <h3 id="asset-facts" className="font-display text-base font-extrabold [font-variation-settings:'CASL'_0.2]">
              Facts
            </h3>
            <KeyValue
              dense
              items={[
                { label: 'File name', value: <span className="break-all">{asset.originalFilename}</span> },
                { label: 'Type', value: asset.mime, mono: true },
                { label: 'Size', value: formatBytes(asset.sizeBytes) },
                ...(dimensions(asset) ? [{ label: 'Dimensions', value: `${dimensions(asset)} px`, hint: asset.kind === 'image' && asset.crop ? 'After the crop.' : undefined }] : []),
                ...(asset.durationSec ? [{ label: 'Length', value: formatDuration(asset.durationSec) }] : []),
                { label: 'Uploaded', value: <DateText value={asset.createdAt} format="datetime" /> },
                { label: 'Id', value: asset.id, mono: true },
              ]}
            />
          </section>
          <Variants asset={asset} />
        </div>
      )}

      {asset && cropOpen ? (
        <CropDialog
          open={cropOpen}
          onOpenChange={setCropOpen}
          imageUrl={asset.originalUrl}
          aspect={PURPOSE_ASPECT[asset.purpose as AssetPurpose] ?? null}
          round={asset.purpose.endsWith('avatar')}
          initial={{ crop: asset.crop, adjust: asset.adjust }}
          title="Re-crop"
          confirmLabel="Save the new crop"
          onConfirm={async (r) => {
            try {
              const next = await recropAsset(asset.id, { crop: r.crop, adjust: r.adjust }, { wait: false });
              qc.setQueryData(adminKeys.assets.detail(asset.id), next);
              wasProcessing.current = true;
              notify.info('Re-cropping. Every size gets redrawn from the original.');
            } catch (err) {
              notify.error(err);
            }
          }}
        />
      ) : null}

      {asset ? (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          destructive
          title="Delete this file?"
          confirmLabel="Delete file"
          description={
            <>
              Every size of <span className="font-semibold break-all text-ink">{asset.originalFilename}</span> goes away. Wherever it is used right now (a cover, a speaker photo, a PDF
              link, an event gallery), that spot turns empty. This cannot be undone.
            </>
          }
          onConfirm={async () => {
            try {
              await api.delete(`/admin/assets/${asset.id}`);
            } catch (err) {
              notify.error(err);
              throw err;
            }
            qc.removeQueries({ queryKey: adminKeys.assets.detail(asset.id) });
            await qc.invalidateQueries({ queryKey: adminKeys.assets.lists() });
            notify.success('Deleted. Poof.');
            onClose();
          }}
        />
      ) : null}
    </Sheet>
  );
}

function Preview({ asset }: { asset: Asset }) {
  const processing = asset.status === 'processing';
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-line',
        asset.kind === 'image' && 'bg-[conic-gradient(var(--color-surface-muted)_25%,white_0_50%,var(--color-surface-muted)_0_75%,white_0)] bg-[length:20px_20px]',
        asset.kind !== 'image' && 'bg-surface-muted',
      )}
    >
      {asset.kind === 'image' ? (
        asset.image ? (
          <AdminImage image={asset.image} sizes="(min-width: 640px) 40rem, 100vw" fit="contain" className="max-h-[60vh] w-full bg-transparent" imgClassName="max-h-[60vh]" style={{ aspectRatio: `${asset.image.width} / ${asset.image.height}`, backgroundColor: 'transparent', backgroundImage: 'none' }} />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center text-sm text-ink-3">No preview yet.</div>
        )
      ) : asset.kind === 'video' ? (
        asset.video?.mp4 || asset.video?.webm ? (
          <video controls preload="metadata" poster={asset.video.poster ?? undefined} className="aspect-video w-full bg-black" aria-label={asset.alt ?? asset.originalFilename}>
            {asset.video.webm ? <source src={asset.video.webm} type="video/webm" /> : null}
            {asset.video.mp4 ? <source src={asset.video.mp4} type="video/mp4" /> : null}
          </video>
        ) : (
          <div className="flex aspect-video items-center justify-center text-sm text-ink-3">{processing ? 'Transcoding. This can take a few minutes.' : 'No playable version yet.'}</div>
        )
      ) : asset.kind === 'audio' ? (
        asset.file ? (
          <div className="p-5">
            <audio controls preload="metadata" src={asset.file.url} className="w-full">
              <track kind="captions" />
            </audio>
          </div>
        ) : null
      ) : asset.file ? (
        <div className="space-y-0">
          <iframe src={`${asset.file.url}#view=FitH`} title={`Preview of ${asset.originalFilename}`} className="h-[min(60vh,32rem)] w-full bg-white" />
          <div className="flex items-center justify-between gap-3 border-t border-line bg-white px-4 py-2.5 text-sm">
            <span className="truncate text-ink-3">{asset.originalFilename}</span>
            <a href={asset.file.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 font-medium text-blue hover:underline">
              Open <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center text-sm text-ink-3">{processing ? 'Processing...' : 'No preview.'}</div>
      )}
      {processing && asset.kind === 'image' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/60 backdrop-blur-[2px]" role="status">
          <Spinner size={34} label={null} />
          <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-medium text-ink-2">Redrawing every size</span>
        </div>
      ) : null}
    </div>
  );
}

function MetaForm({ asset }: { asset: Asset }) {
  const qc = useQueryClient();
  const defaults: MetaValues = { alt: asset.alt ?? '', caption: asset.caption ?? '', credit: asset.credit ?? '' };
  const form = useZodForm(assetMetaInput, { defaultValues: defaults });
  const save = useAdminMutation({
    mutationFn: (body: MetaValues) => api.patch<Asset>(`/admin/assets/${asset.id}`, body),
    successMessage: 'Details saved.',
    errorToast: (err) => (err.hasFieldErrors ? false : errorMessage(err)),
    onError: (err) => void applyApiErrorToForm(form, err),
    onSuccess: (a) => {
      qc.setQueryData(adminKeys.assets.detail(a.id), a);
      void qc.invalidateQueries({ queryKey: adminKeys.assets.lists() });
      form.reset({ alt: a.alt ?? '', caption: a.caption ?? '', credit: a.credit ?? '' });
    },
  });
  const submit = form.handleSubmit((v) =>
    save.mutate({ alt: v.alt?.trim() || null, caption: v.caption?.trim() || null, credit: v.credit?.trim() || null }),
  );
  const dirty = form.formState.isDirty;
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-4"
      aria-labelledby="asset-details"
    >
      <h3 id="asset-details" className="font-display text-base font-extrabold [font-variation-settings:'CASL'_0.2]">
        Details
      </h3>
      {asset.kind === 'image' || asset.kind === 'video' ? (
        <FormField
          control={form.control}
          name="alt"
          label="Alt text"
          maxLength={300}
          hint={asset.kind === 'image' ? 'Describe what is in the picture for people who cannot see it. Skip "image of".' : 'A short description of the clip.'}
        >
          {(field) => <Textarea {...field} value={field.value ?? ''} autosize minRows={2} maxRows={5} placeholder="Rani pointing at a very busy slide while three people laugh" />}
        </FormField>
      ) : null}
      <FormField control={form.control} name="caption" label="Caption" optional maxLength={500}>
        {(field) => <Textarea {...field} value={field.value ?? ''} autosize minRows={1} maxRows={4} placeholder="Q and A ran long. Nobody minded." />}
      </FormField>
      <FormField control={form.control} name="credit" label="Credit" optional maxLength={200}>
        {(field) => <Input {...field} value={field.value ?? ''} placeholder="Photo by the Zemi crew" />}
      </FormField>
      <div className="flex justify-end gap-2">
        {dirty ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => form.reset(defaults)} disabled={save.isPending}>
            Discard
          </Button>
        ) : null}
        <Button type="submit" variant="primary" size="sm" loading={save.isPending} disabled={!dirty}>
          Save details
        </Button>
      </div>
    </form>
  );
}

interface VariantRow {
  key: string;
  label: string;
  meta?: string;
  url: string;
}

function variantRows(a: Asset): VariantRow[] {
  const rows: VariantRow[] = [];
  if (a.image) {
    const widths = [...new Set([...a.image.avif.map((s) => s.width), ...a.image.webp.map((s) => s.width)])].sort((x, y) => x - y);
    for (const w of widths) {
      const webp = a.image.webp.find((s) => s.width === w);
      const avif = a.image.avif.find((s) => s.width === w);
      if (webp) rows.push({ key: `webp${w}`, label: `WebP ${w}w`, meta: 'Everywhere', url: webp.url });
      if (avif) rows.push({ key: `avif${w}`, label: `AVIF ${w}w`, meta: 'Smaller, newer browsers', url: avif.url });
    }
  }
  if (a.video) {
    if (a.video.mp4) rows.push({ key: 'mp4', label: 'MP4 (H.264)', url: a.video.mp4 });
    if (a.video.webm) rows.push({ key: 'webm', label: 'WebM (VP9)', url: a.video.webm });
    if (a.video.hls) rows.push({ key: 'hls', label: 'HLS playlist', url: a.video.hls });
    if (a.video.poster) rows.push({ key: 'poster', label: 'Poster', meta: 'WebP', url: a.video.poster });
    if (a.video.storyboard) rows.push({ key: 'storyboard', label: 'Storyboard', meta: `${a.video.storyboard.count} frames, every ${a.video.storyboard.interval}s`, url: a.video.storyboard.url });
  }
  if (a.file) rows.push({ key: 'file', label: a.kind === 'document' ? 'Public file' : 'File', meta: formatBytes(a.file.sizeBytes), url: a.file.url });
  return rows;
}

function Variants({ asset }: { asset: Asset }) {
  const rows = variantRows(asset);
  return (
    <section aria-labelledby="asset-variants" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="asset-variants" className="font-display text-base font-extrabold [font-variation-settings:'CASL'_0.2]">
          Files
        </h3>
        {rows.length ? <span className="text-sm text-ink-4">{rows.length} public URLs</span> : null}
      </div>
      {rows.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {rows.map((r) => (
            <VariantItem key={r.key} row={r} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-3">{asset.status === 'processing' ? 'Sizes show up here once processing finishes.' : 'No public versions.'}</p>
      )}
      <p className="text-[0.8125rem] text-ink-4">The original stays private. It keeps camera data like GPS, so it is only for the crew.</p>
    </section>
  );
}

function VariantItem({ row }: { row: VariantRow }) {
  const [copy, copied] = useCopy();
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">
          {row.label}
          {row.meta ? <span className="ml-2 font-normal text-ink-4">{row.meta}</span> : null}
        </p>
        <p className="mono truncate text-xs text-ink-3" title={row.url}>
          {row.url.replace(/^https?:\/\//, '')}
        </p>
      </div>
      <IconButton label={copied ? 'Copied' : `Copy ${row.label} URL`} size="sm" onClick={() => void copy(row.url).then((ok) => !ok && notify.error("Couldn't copy. Your browser said no."))}>
        {copied ? <Check className="text-green" /> : <Copy />}
      </IconButton>
      <Tooltip content={`Open ${row.label}`}>
        <a
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${row.label} in a new tab`}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-3 transition hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus active:scale-90"
        >
          <ExternalLink className="size-4" />
        </a>
      </Tooltip>
    </li>
  );
}
