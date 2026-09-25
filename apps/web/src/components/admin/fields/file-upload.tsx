'use client';

import type { Asset, AssetPurpose, FileRef, VideoRef } from '@zemi/shared';
import { FileText, FileVideo, File as FileIcon, RefreshCw, Trash2, UploadCloud, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone, type Accept, type FileRejection } from 'react-dropzone';
import { errorMessage, isAbortError } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { formatBytes, formatDuration } from '@/lib/admin/format';
import { useAssetPoll } from '@/lib/admin/hooks';
import { uploadAsset } from '@/lib/admin/upload';
import { Button, IconButton } from '../ui/button';
import { useFieldControlProps } from '../ui/field';
import { Progress } from '../ui/progress';
import { StatusChip } from '../ui/status-chip';
import { useReadOnly } from './read-only';

export interface FileUploadProps {
  value: string | null | undefined;
  onChange: (assetId: string | null, asset: Asset | null) => void;
  purpose: AssetPurpose;
  /** react-dropzone accept map. Presets: FILE_ACCEPT.pdf / .video / .any. */
  accept?: Accept;
  /** Bytes. Default 4 GB for video, 100 MB otherwise. */
  maxSize?: number;
  /** Existing file for display (like `publication.pdf`). */
  initialFile?: FileRef | null;
  initialVideo?: VideoRef | null;
  readOnly?: boolean;
  /** Short line under the drop zone. */
  hint?: string;
  className?: string;
  id?: string;
}

export const FILE_ACCEPT = {
  pdf: { 'application/pdf': ['.pdf'] } satisfies Accept,
  video: { 'video/mp4': ['.mp4'], 'video/quicktime': ['.mov'], 'video/webm': ['.webm'], 'video/x-matroska': ['.mkv'] } satisfies Accept,
  any: {} satisfies Accept,
};

type Phase = { k: 'idle' } | { k: 'uploading'; fraction: number | null; loaded: number; total: number } | { k: 'processing' } | { k: 'failed'; message: string };

function kindIcon(mime: string | undefined) {
  if (mime?.startsWith('video/')) return <FileVideo />;
  if (mime === 'application/pdf') return <FileText />;
  return <FileIcon />;
}

/**
 * PDF, video or any file. Drop or browse, upload with a progress bar (cancellable), then the
 * processing state until the asset is ready (videos get transcoded). Value is the asset id.
 *
 * @example <FileUpload purpose="publication-pdf" accept={FILE_ACCEPT.pdf} value={field.value} initialFile={pub?.pdf} onChange={(id) => field.onChange(id)} />
 */
export function FileUpload({ value, onChange, purpose, accept, maxSize, initialFile, initialVideo, readOnly: ro, hint, className, id }: FileUploadProps) {
  const readOnly = useReadOnly(ro);
  const aria = useFieldControlProps({ id });
  const isVideo = purpose === 'recording' || purpose === 'documentation' || Boolean(accept && Object.keys(accept).some((k) => k.startsWith('video/')));
  const limit = maxSize ?? (isVideo ? 4 * 1024 ** 3 : 100 * 1024 ** 2);
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const [picked, setPicked] = useState<{ name: string; size: number; type: string } | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const poll = useAssetPoll(value && (!asset || asset.status === 'processing') ? value : null, { initial: asset });
  const current = poll.data && poll.data.id === value ? poll.data : asset && asset.id === value ? asset : null;
  useEffect(() => {
    if (phase.k === 'processing' && current && current.status !== 'processing') {
      setPhase(current.status === 'failed' ? { k: 'failed', message: current.error || "We couldn't process that file." } : { k: 'idle' });
      if (current.status === 'ready') onChange(current.id, current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.status]);

  const start = useCallback(
    async (f: File) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setError(null);
      setPicked({ name: f.name, size: f.size, type: f.type });
      setPhase({ k: 'uploading', fraction: 0, loaded: 0, total: f.size });
      try {
        // Do not block on processing here: the poll above tracks it, so the form can save meanwhile.
        const created = await uploadAsset(f, { purpose, signal: ctrl.signal, wait: false }, (p) => {
          if (p.phase === 'uploading') setPhase({ k: 'uploading', fraction: p.fraction, loaded: p.loaded, total: p.total });
        });
        setAsset(created);
        onChange(created.id, created);
        setPhase(created.status === 'processing' ? { k: 'processing' } : { k: 'idle' });
      } catch (err) {
        if (isAbortError(err)) {
          setPhase({ k: 'idle' });
          setPicked(null);
          return;
        }
        setPhase({ k: 'failed', message: errorMessage(err) });
      }
    },
    [purpose, onChange],
  );

  const onDrop = useCallback(
    (ok: File[], bad: FileRejection[]) => {
      if (ok[0]) void start(ok[0]);
      else if (bad[0]) {
        const code = bad[0].errors[0]?.code;
        setError(code === 'file-too-large' ? `That file is too big. Keep it under ${formatBytes(limit)}.` : "That file type doesn't fit here.");
      }
    },
    [start, limit],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: accept && Object.keys(accept).length ? accept : undefined,
    multiple: false,
    maxSize: limit,
    disabled: readOnly || phase.k === 'uploading',
    noClick: Boolean(value),
    noKeyboard: Boolean(value),
  });

  const name = current?.originalFilename ?? picked?.name ?? initialFile?.filename ?? (value ? 'Uploaded file' : null);
  const size = current?.sizeBytes ?? picked?.size ?? initialFile?.sizeBytes ?? null;
  const mime = current?.mime ?? picked?.type ?? initialFile?.mime;
  const poster = current?.video?.poster ?? initialVideo?.poster ?? null;
  const duration = current?.video?.durationSec ?? current?.durationSec ?? initialVideo?.durationSec ?? null;
  const has = Boolean(value || phase.k === 'uploading' || phase.k === 'failed');

  return (
    <div className={cn('space-y-2', className)}>
      {has ? (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3">
          <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-muted text-ink-3 [&_svg]:size-6">
            {poster ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={poster} alt="" className="size-full object-cover" />
            ) : (
              kindIcon(mime)
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[0.9375rem] font-medium text-ink" title={name ?? undefined}>
                {name}
              </span>
              {phase.k === 'processing' || current?.status === 'processing' ? <StatusChip kind="asset" value="processing" size="sm" /> : null}
              {phase.k === 'failed' || current?.status === 'failed' ? <StatusChip kind="asset" value="failed" size="sm" /> : null}
            </div>
            {phase.k === 'uploading' ? (
              <Progress value={phase.fraction} size="sm" label={`Uploading, ${formatBytes(phase.loaded)} of ${formatBytes(phase.total)}`} />
            ) : (
              <p className="text-[0.8125rem] text-ink-3">
                {[size != null ? formatBytes(size) : null, duration ? formatDuration(duration) : null, phase.k === 'processing' ? (isVideo ? 'Transcoding, this can take a few minutes' : 'Processing') : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
            {phase.k === 'uploading' ? (
              <p className="text-xs text-ink-4 tabular-nums">
                {formatBytes(phase.loaded)} of {formatBytes(phase.total)}
              </p>
            ) : null}
            {phase.k === 'failed' ? <p className="text-[0.8125rem] font-medium text-red-600">{phase.message}</p> : null}
          </div>
          {!readOnly ? (
            <div className="flex shrink-0 gap-1">
              {phase.k === 'uploading' ? (
                <IconButton label="Cancel upload" size="sm" onClick={() => abortRef.current?.abort()}>
                  <X />
                </IconButton>
              ) : (
                <>
                  <IconButton label="Replace" size="sm" onClick={open}>
                    <RefreshCw />
                  </IconButton>
                  <IconButton
                    label="Remove"
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setAsset(null);
                      setPicked(null);
                      setPhase({ k: 'idle' });
                      onChange(null, null);
                    }}
                  >
                    <Trash2 />
                  </IconButton>
                </>
              )}
            </div>
          ) : null}
          <input {...getInputProps()} />
        </div>
      ) : readOnly ? (
        <p className="text-sm text-ink-4">No file.</p>
      ) : (
        <div
          {...getRootProps({ 'aria-describedby': aria['aria-describedby'] })}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong bg-surface-muted px-4 py-7 text-center outline-none transition',
            'hover:border-ink-4 hover:bg-white focus-visible:border-blue focus-visible:shadow-[0_0_0_5px_rgba(58,109,197,0.14)]',
            isDragActive && 'border-blue bg-blue-50',
          )}
        >
          <input {...getInputProps({ id: aria.id })} />
          <UploadCloud className="size-6 text-ink-3" />
          <p className="text-[0.9375rem] font-medium text-ink">{isDragActive ? 'Drop it.' : 'Drop a file here'}</p>
          <p className="text-[0.8125rem] text-ink-3">
            or <span className="font-medium text-blue underline underline-offset-2">browse</span>. Up to {formatBytes(limit)}.
          </p>
        </div>
      )}
      {error ? (
        <p className="text-[0.8125rem] font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[0.8125rem] text-ink-3">{hint}</p>
      ) : null}
      {phase.k === 'failed' && !readOnly ? (
        <Button size="sm" variant="secondary" onClick={open}>
          Pick another file
        </Button>
      ) : null}
    </div>
  );
}
