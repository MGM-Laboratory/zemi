'use client';

import { PURPOSE_ASPECT, type Asset, type AssetPurpose, type ImageRef } from '@zemi/shared';
import { Crop as CropIcon, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState, type ClipboardEvent } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { errorMessage, isAbortError } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { formatBytes } from '@/lib/admin/format';
import { useAssetPoll } from '@/lib/admin/hooks';
import { canEditAsset, recropAsset, uploadAsset } from '@/lib/admin/upload';
import { Character } from '../characters/character';
import { Button, IconButton } from '../ui/button';
import { useFieldControlProps } from '../ui/field';
import { AdminImage } from '../ui/media';
import { ProgressRing } from '../ui/progress';
import { Spinner } from '../ui/spinner';
import { adjustToCssFilter, renderCropPreview, SharpenFilterDefs, type CropResult } from './crop-utils';
import { useReadOnly } from './read-only';

const CropDialog = dynamic(() => import('./crop-dialog'), { ssr: false });

export interface ImageUploadCropProps {
  /** Asset id (the form value, like `coverAssetId`). */
  value: string | null | undefined;
  /** Called with the new asset id (null when removed) and the asset record. */
  onChange: (assetId: string | null, asset: Asset | null) => void;
  purpose: AssetPurpose;
  /** Current image for display when editing (like `event.cover`). */
  initialImage?: ImageRef | null;
  /** Alt text sent with the upload. */
  alt?: string | null;
  /** Max upload size in bytes. Default 40 MB. */
  maxSize?: number;
  readOnly?: boolean;
  /** Round preview and crop mask (avatars). Default: true for avatar purposes. */
  round?: boolean;
  /** Width of the preview frame. Default depends on the aspect. */
  className?: string;
  /** Short hint under the drop zone. */
  hint?: string;
  id?: string;
  /** Override the crop aspect (width / height) for free-shape purposes, like 1.91 for a share image. */
  aspect?: number | null;
}

type Phase =
  | { k: 'idle' }
  | { k: 'uploading'; fraction: number | null }
  | { k: 'processing' }
  | { k: 'failed'; message: string };

const ACCEPT = { 'image/jpeg': [], 'image/png': [], 'image/webp': [], 'image/avif': [], 'image/heic': [], 'image/heif': [], 'image/gif': [] };

/**
 * Image field with drop, paste and browse; crop locked to PURPOSE_ASPECT[purpose] (4:5 covers,
 * 1:1 avatars); zoom, rotate and adjustments with a live preview. Uploads the ORIGINAL file
 * plus crop/adjust params (the server renders the variants), shows a progress ring, then the
 * processing state. Existing assets can be re-cropped (POST /admin/assets/:id/recrop).
 *
 * @example
 * <ImageUploadCrop purpose="event-cover" value={field.value} initialImage={event?.cover} onChange={(id) => field.onChange(id)} />
 */
export function ImageUploadCrop({ value, onChange, purpose, initialImage, alt, maxSize = 40 * 1024 * 1024, readOnly: ro, round: roundProp, className, hint, id, aspect: aspectProp }: ImageUploadCropProps) {
  const readOnly = useReadOnly(ro);
  const aria = useFieldControlProps({ id });
  const aspect = aspectProp !== undefined ? aspectProp : PURPOSE_ASPECT[purpose];
  const round = roundProp ?? purpose.endsWith('avatar');
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const [file, setFile] = useState<{ file: File; url: string } | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [recropMode, setRecropMode] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Know the asset for re-crop and preview when we only have an id.
  const poll = useAssetPoll(value && !asset ? value : null);
  const known = asset && asset.id === value ? asset : poll.data && poll.data.id === value ? poll.data : null;
  const image = known?.image ?? (value ? initialImage : null) ?? null;

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (file) URL.revokeObjectURL(file.url);
      if (localPreview) URL.revokeObjectURL(localPreview);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const pick = useCallback(
    (f: File) => {
      setError(null);
      if (!f.type.startsWith('image/')) {
        setError("That file isn't an image. Try a JPG, PNG, WebP or HEIC.");
        return;
      }
      if (f.size > maxSize) {
        setError(`That image is ${formatBytes(f.size)}. Keep it under ${formatBytes(maxSize)}.`);
        return;
      }
      if (file) URL.revokeObjectURL(file.url);
      setFile({ file: f, url: URL.createObjectURL(f) });
      setRecropMode(false);
      setCropOpen(true);
    },
    [file, maxSize],
  );

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      if (accepted[0]) pick(accepted[0]);
      else if (rejected[0]) {
        const code = rejected[0].errors[0]?.code;
        setError(code === 'file-too-large' ? `That image is too big. Keep it under ${formatBytes(maxSize)}.` : "That file isn't an image we can use. Try a JPG, PNG, WebP or HEIC.");
      }
    },
    [pick, maxSize],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: false,
    maxSize,
    disabled: readOnly || phase.k === 'uploading',
    noClick: Boolean(image),
    noKeyboard: Boolean(image),
  });

  const onPaste = (e: ClipboardEvent) => {
    if (readOnly) return;
    const item = Array.from(e.clipboardData.items).find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    const f = item?.getAsFile();
    if (f) {
      e.preventDefault();
      pick(new File([f], f.name || `pasted-${Date.now()}.${f.type.split('/')[1] ?? 'png'}`, { type: f.type }));
    }
  };

  const upload = async (result: CropResult) => {
    if (!file) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    const preview = await renderCropPreview(file.url, result.crop, result.adjust);
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(preview);
    setPhase({ k: 'uploading', fraction: 0 });
    try {
      const done = await uploadAsset(file.file, { purpose, crop: result.crop, adjust: result.adjust, alt, signal: ctrl.signal }, (p) => {
        if (p.phase === 'uploading') setPhase({ k: 'uploading', fraction: p.fraction });
        else if (p.phase === 'processing') {
          setPhase({ k: 'processing' });
          // Hand the id to the form as soon as the server has it (uploadAsset keeps polling).
          if (p.asset) {
            setAsset(p.asset);
            onChange(p.asset.id, p.asset);
          }
        }
      });
      setAsset(done);
      setPhase({ k: 'idle' });
      onChange(done.id, done);
    } catch (err) {
      if (isAbortError(err)) {
        setPhase({ k: 'idle' });
        return;
      }
      setPhase({ k: 'failed', message: errorMessage(err) });
    }
  };

  const recrop = async (result: CropResult) => {
    const target = known;
    if (!target) return;
    setError(null);
    setPhase({ k: 'processing' });
    try {
      const done = await recropAsset(target.id, { crop: result.crop, adjust: result.adjust });
      setAsset(done);
      if (localPreview) URL.revokeObjectURL(localPreview);
      setLocalPreview(null);
      setPhase({ k: 'idle' });
      onChange(done.id, done);
    } catch (err) {
      setPhase({ k: 'failed', message: errorMessage(err) });
    }
  };

  const remove = () => {
    abortRef.current?.abort();
    setAsset(null);
    setFile(null);
    setLocalPreview(null);
    setPhase({ k: 'idle' });
    onChange(null, null);
  };

  const busy = phase.k === 'uploading' || phase.k === 'processing';
  const showLocal = localPreview && (busy || phase.k === 'failed' || !image);
  const frameAspect = aspect ?? 16 / 10;
  const widthCls = round ? 'w-40' : aspect && aspect < 1 ? 'w-full max-w-[18rem]' : 'w-full max-w-[28rem]';
  const empty = !image && !showLocal;

  return (
    <div className={cn('space-y-2', className)}>
      <SharpenFilterDefs />
      <div
        {...getRootProps({
          onPaste,
          ref: rootRef,
          'aria-label': empty ? 'Add an image: drop, paste or press Enter to browse' : undefined,
          'aria-describedby': aria['aria-describedby'],
        })}
        className={cn(
          'group relative overflow-hidden border bg-surface-muted outline-none transition-[border-color,box-shadow,background-color] duration-200',
          widthCls,
          round ? 'rounded-full' : 'rounded-[var(--radius-cover)]',
          empty ? 'cursor-pointer border-dashed border-line-strong hover:border-ink-4 hover:bg-white' : 'border-line',
          isDragActive && 'border-blue bg-blue-50 shadow-[0_0_0_5px_rgba(58,109,197,0.14)]',
          'focus-visible:border-blue focus-visible:shadow-[0_0_0_5px_rgba(58,109,197,0.14)]',
          readOnly && 'cursor-default',
        )}
        style={{ aspectRatio: String(frameAspect) }}
      >
        <input {...getInputProps({ id: aria.id })} />
        {showLocal ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={localPreview!} alt="" className="absolute inset-0 size-full object-cover" />
        ) : image ? (
          <AdminImage image={image} sizes="(min-width: 640px) 28rem, 90vw" alt={image.alt ?? ''} className="absolute inset-0 size-full" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
            <div className="relative">
              <Character shape={round ? 'circle' : 'square'} mood={isDragActive ? 'cheer' : 'look'} follow={!isDragActive} size={round ? 38 : 46} />
            </div>
            {readOnly ? (
              <p className="text-sm text-ink-3">No image yet.</p>
            ) : (
              <>
                <p className={cn('font-medium text-ink', round ? 'text-[0.8125rem]' : 'text-[0.9375rem]')}>{isDragActive ? 'Drop it.' : round ? 'Add a photo' : 'Drop an image here'}</p>
                {round ? null : (
                  <p className="text-[0.8125rem] text-ink-3">
                    or paste it, or <span className="font-medium text-blue underline underline-offset-2">browse</span>
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {busy ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/60 backdrop-blur-[2px]" role="status">
            {phase.k === 'uploading' ? (
              <ProgressRing value={phase.fraction} size={round ? 48 : 64} label="Uploading" />
            ) : (
              <Spinner size={round ? 26 : 34} label={null} />
            )}
            <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-medium text-ink-2">{phase.k === 'uploading' ? 'Uploading' : 'Processing'}</span>
          </div>
        ) : null}

        {phase.k === 'failed' ? (
          <div className="absolute inset-x-2 bottom-2 flex items-start gap-2 rounded-2xl bg-white/95 p-2.5 text-[0.8125rem] text-red-600 shadow-[var(--shadow-2)]" role="alert">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 flex-1">{phase.message}</span>
          </div>
        ) : null}

        {!readOnly && !empty && !busy ? (
          <div className={cn('absolute flex gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100', round ? 'inset-x-0 bottom-2 justify-center' : 'top-2.5 right-2.5')}>
            {/* Re-cropping someone else's file needs the media library (Asset.canEdit); a local file can always be framed. */}
            {file || (known?.originalUrl && canEditAsset(known)) ? (
              <IconButton
                label="Crop and adjust"
                size="sm"
                variant="secondary"
                className="shadow-[var(--shadow-1)]"
                onClick={(e) => {
                  e.stopPropagation();
                  setRecropMode(Boolean(known && !(file && phase.k === 'failed')));
                  setCropOpen(true);
                }}
              >
                <CropIcon />
              </IconButton>
            ) : null}
            <IconButton label="Replace" size="sm" variant="secondary" className="shadow-[var(--shadow-1)]" onClick={(e) => { e.stopPropagation(); open(); }}>
              <RefreshCw />
            </IconButton>
            <IconButton label="Remove" size="sm" variant="secondary" className="text-red-600 shadow-[var(--shadow-1)] hover:text-red-600" onClick={(e) => { e.stopPropagation(); remove(); }}>
              <Trash2 />
            </IconButton>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="text-[0.8125rem] font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : !readOnly ? (
        <p className="text-[0.8125rem] text-ink-3">
          {hint ?? (aspect === 0.8 ? '4:5 portrait. At least 1600px tall looks crisp.' : aspect === 1 ? 'Square. At least 800px wide looks crisp.' : 'Any shape. Big and sharp is best.')}
        </p>
      ) : null}

      {phase.k === 'failed' && file ? (
        <Button size="sm" variant="secondary" onClick={() => setCropOpen(true)}>
          Try the upload again
        </Button>
      ) : null}

      {cropOpen ? (
        <CropDialog
          open={cropOpen}
          onOpenChange={setCropOpen}
          imageUrl={recropMode ? (known?.originalUrl ?? null) : (file?.url ?? known?.originalUrl ?? null)}
          aspect={aspect}
          round={round}
          initial={recropMode ? { crop: known?.crop, adjust: known?.adjust } : undefined}
          title={recropMode ? 'Re-crop' : 'Frame it'}
          confirmLabel={recropMode ? 'Save the new crop' : 'Upload'}
          onConfirm={(r) => {
            // Close right away; upload progress shows on the field.
            if (recropMode) void recrop(r);
            else void upload(r);
          }}
        />
      ) : null}
    </div>
  );
}

export { adjustToCssFilter };
