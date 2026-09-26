'use client';

import { formatJakarta, type RecordingStatus, type StreamSessionAdmin, type VideoRef } from '@zemi/shared';
import { Check, Download, EyeOff, Film, MoreHorizontal, Play, RotateCcw, Star, Trash2, Upload, Users, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useRef, useState, type PointerEvent } from 'react';
import { Character } from '@/components/admin/characters/character';
import { FILE_ACCEPT, FileUpload } from '@/components/admin/fields/file-upload';
import { Button, IconButton } from '@/components/admin/ui/button';
import { Card } from '@/components/admin/ui/card';
import { ConfirmDialog } from '@/components/admin/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/admin/ui/dropdown-menu';
import { EmptyState, ErrorState, Skeleton } from '@/components/admin/ui/feedback';
import { Input } from '@/components/admin/ui/input';
import { Spinner } from '@/components/admin/ui/spinner';
import { Switch } from '@/components/admin/ui/toggles';
import { cn } from '@/lib/admin/cn';
import { formatBytes, formatDuration } from '@/lib/admin/format';
import { useNow } from '@/lib/admin/hooks';
import { InlineEdit } from './inline-edit';
import { clock, isRecordingBusy, PIPELINE, pipelineIndex, RECORDING_STATUS, secondsSince } from './lib';
import { useRecordingActions, useRecordings } from './use-stream';

/**
 * Recordings of this event: one per Go live, plus uploaded ones. Status chips with a pipeline
 * track while a recording is being built (polled + pushed over SSE), a video preview with a
 * storyboard scrub when ready, title edit, public/hidden, primary, reprocess, delete, upload.
 */
export function RecordingsSection({ eventId, canControl }: { eventId: string; canControl: boolean }) {
  const query = useRecordings(eventId);
  const actions = useRecordingActions(eventId);
  const [uploadOpen, setUploadOpen] = useState(false);
  const list = query.data ?? [];
  // Oldest is "Session 1", so the numbers don't shift when a new one arrives on top.
  const order = [...list].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).map((r) => r.id);

  return (
    <section aria-labelledby="recordings-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="recordings-title" className="font-display text-xl font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.2]">
            Recordings
          </h2>
          <p className="text-sm text-ink-3">Every Go live makes one on its own. Public, ready ones play on the event page, the starred one first.</p>
        </div>
        {canControl ? (
          <Button size="sm" variant={uploadOpen ? 'ghost' : 'secondary'} icon={uploadOpen ? <X /> : <Upload />} onClick={() => setUploadOpen((o) => !o)} aria-expanded={uploadOpen}>
            {uploadOpen ? 'Close upload' : 'Upload a recording'}
          </Button>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {uploadOpen && canControl ? (
          <motion.div
            key="upload"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <UploadRecording
              onAttach={async (assetId, title) => {
                await actions.attach.mutateAsync({ assetId, title });
                setUploadOpen(false);
              }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {query.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" rounded="lg" />
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} size="sm" />
      ) : list.length === 0 ? (
        <EmptyState
          size="sm"
          title="No recordings yet"
          description="Go live and one starts rolling by itself. Got a video from somewhere else? Upload it here."
          cast={[
            { shape: 'arch', mood: 'sleep', size: 48 },
            { shape: 'triangle', mood: 'look', size: 36, lookAt: { x: -0.9, y: 0.2 } },
          ]}
        />
      ) : (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {list.map((rec) => (
              <motion.li
                key={rec.id}
                layout="position"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <RecordingCard rec={rec} number={order.indexOf(rec.id) + 1} total={list.length} canControl={canControl} actions={actions} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

type Actions = ReturnType<typeof useRecordingActions>;

function defaultTitle(n: number, total: number) {
  return total > 1 ? `Session ${n}` : 'Livestream recording';
}

function RecordingCard({ rec, number, total, canControl, actions }: { rec: StreamSessionAdmin; number: number; total: number; canControl: boolean; actions: Actions }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = isRecordingBusy(rec.recordingStatus);
  const ready = rec.recordingStatus === 'ready' && rec.video;
  const meta = RECORDING_STATUS[rec.recordingStatus];
  const fallback = defaultTitle(number, total);
  const pendingVis = actions.update.isPending && actions.update.variables?.id === rec.id && actions.update.variables.patch.visibility !== undefined;
  const pendingPrimary = actions.update.isPending && actions.update.variables?.id === rec.id && actions.update.variables.patch.isPrimary !== undefined;
  const canReprocess = !busy && rec.recordingStatus !== 'none';
  const canDelete = rec.recordingStatus !== 'recording' && rec.recordingStatus !== 'processing';

  return (
    <Card padding="none" className={cn('overflow-hidden', rec.isPrimary && ready && 'border-yellow/70 shadow-[0_0_0_3px_rgba(247,191,51,0.18)]')}>
      <div className="grid gap-0 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <div className="relative bg-surface-inverse md:rounded-none">
          {ready && rec.video ? (
            <RecordingPlayer video={rec.video} title={rec.title || fallback} />
          ) : (
            <PipelineArt rec={rec} />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3 p-4 sm:p-5">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <RecordingChip status={rec.recordingStatus} />
                {rec.isPrimary ? (
                  <span className="inline-flex h-6 items-center gap-1 rounded-full bg-yellow px-2 text-xs font-semibold text-ink">
                    <Star className="size-3 fill-current" aria-hidden="true" />
                    Plays first
                  </span>
                ) : null}
                {rec.visibility === 'hidden' ? (
                  <span className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-line-strong px-2 text-xs text-ink-3">
                    <EyeOff className="size-3" aria-hidden="true" />
                    Hidden
                  </span>
                ) : null}
              </div>
              <div className="mt-2">
                <InlineEdit
                  value={rec.title}
                  placeholder={fallback}
                  label="Recording title"
                  readOnly={!canControl}
                  maxLength={200}
                  textClassName="font-display text-lg font-extrabold tracking-[-0.02em] not-italic text-ink [font-variation-settings:'CASL'_0.2]"
                  onSave={(title) => actions.update.mutateAsync({ id: rec.id, patch: { title } })}
                />
              </div>
            </div>
            {canControl ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton label="More for this recording" size="sm" variant="ghost">
                    <MoreHorizontal />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="min-w-[13rem]">
                  <DropdownMenuItem icon={<RotateCcw />} disabled={!canReprocess || actions.reprocess.isPending} onSelect={() => void actions.reprocess.mutateAsync(rec.id).catch(() => {})}>
                    Rebuild the video
                  </DropdownMenuItem>
                  {rec.video?.mp4 ? (
                    <DropdownMenuItem icon={<Download />} href={rec.video.mp4} external>
                      Download MP4
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem icon={<Trash2 />} destructive disabled={!canDelete} onSelect={() => setConfirmDelete(true)}>
                    Delete recording
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>

          <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-3">
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">When</dt>
              <dd className="tabular-nums">
                {formatJakarta(rec.startedAt, 'date')}, {formatJakarta(rec.startedAt, 'time')}
                {rec.endedAt ? ` to ${formatJakarta(rec.endedAt, 'time')}` : ''} WIB
              </dd>
            </div>
            {rec.durationSec ? (
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">Length</dt>
                <dd className="mono tabular-nums">{formatDuration(rec.durationSec)}</dd>
              </div>
            ) : null}
            {rec.sizeBytes ? (
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">File size</dt>
                <dd className="tabular-nums">{formatBytes(rec.sizeBytes)}</dd>
              </div>
            ) : null}
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Peak viewers</dt>
              <dd className="flex items-center gap-1 tabular-nums">
                <Users className="size-3.5" aria-hidden="true" />
                {rec.peakViewers.toLocaleString('en-US')} at the peak
              </dd>
            </div>
          </dl>

          <p className={cn('text-sm', rec.recordingStatus === 'failed' ? 'text-red-600' : 'text-ink-2')} role={rec.recordingStatus === 'failed' ? 'alert' : undefined}>
            {rec.recordingStatus === 'failed' && rec.error ? rec.error : meta.hint}
          </p>

          <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-3">
            <Switch
              size="sm"
              checked={rec.visibility === 'public'}
              disabled={!canControl || pendingVis}
              onCheckedChange={(on) => void actions.update.mutateAsync({ id: rec.id, patch: { visibility: on ? 'public' : 'hidden' } }).catch(() => {})}
              label={rec.visibility === 'public' ? 'On the event page' : 'Hidden from the event page'}
              description={ready ? undefined : 'Shows up once the video is ready.'}
            />
            {canControl ? (
              rec.isPrimary ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-ink-3">
                  <Star className="size-4 fill-yellow text-yellow-600" aria-hidden="true" />
                  The main recording
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Star />}
                  loading={pendingPrimary}
                  disabled={rec.recordingStatus === 'none' || rec.recordingStatus === 'failed'}
                  onClick={() => void actions.update.mutateAsync({ id: rec.id, patch: { isPrimary: true } }).catch(() => {})}
                >
                  Make it the main one
                </Button>
              )
            ) : null}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        destructive
        title="Delete this recording?"
        description={
          <>
            <b>{rec.title || fallback}</b> disappears from the event page and the video file is deleted for good. The livestream itself is not
            affected.
          </>
        }
        confirmLabel="Delete recording"
        onConfirm={() => actions.remove.mutateAsync(rec.id)}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ status chip */

export function RecordingChip({ status, className }: { status: RecordingStatus; className?: string }) {
  const m = RECORDING_STATUS[status];
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap', m.cls, className)}>
      <ChipGlyph glyph={m.glyph} />
      {m.label}
    </span>
  );
}

function ChipGlyph({ glyph }: { glyph: (typeof RECORDING_STATUS)[RecordingStatus]['glyph'] }) {
  if (glyph === 'live')
    return (
      <span className="relative flex size-2" aria-hidden="true">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/80 motion-reduce:animate-none" />
        <span className="relative inline-flex size-2 rounded-full bg-white" />
      </span>
    );
  if (glyph === 'spin') return <Spinner size={12} label={null} />;
  if (glyph === 'dots')
    return (
      <span className="flex gap-0.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1 animate-pulse rounded-full bg-current motion-reduce:animate-none" style={{ animationDelay: `${i * 160}ms` }} />
        ))}
      </span>
    );
  if (glyph === 'check') return <Check className="size-3" strokeWidth={3} aria-hidden="true" />;
  if (glyph === 'triangle')
    return (
      <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden="true">
        <path d="M5 1 L9.2 8.6 H0.8 Z" fill="currentColor" strokeLinejoin="round" />
      </svg>
    );
  return <span className="h-0.5 w-2 rounded-full bg-current" aria-hidden="true" />;
}

/* ------------------------------------------------------------------ media side */

/** Poster with a storyboard scrub on hover; click plays the MP4 (WebM fallback) inline. */
function RecordingPlayer({ video, title }: { video: VideoRef; title: string }) {
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState<number | null>(null);
  const [pointerX, setPointerX] = useState(0);
  const reduce = useReducedMotion();
  const sb = video.storyboard;

  if (playing) {
    return (
      <video
        className="aspect-video size-full bg-black object-contain"
        controls
        autoPlay
        playsInline
        poster={video.poster ?? undefined}
        aria-label={`${title}, video`}
      >
        {video.mp4 ? <source src={video.mp4} type="video/mp4" /> : null}
        {video.webm ? <source src={video.webm} type="video/webm" /> : null}
      </video>
    );
  }

  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!sb || e.pointerType !== 'mouse' || reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setPointerX(f);
    setFrame(Math.min(sb.count - 1, Math.floor(f * sb.count)));
  };
  const rows = sb ? Math.ceil(sb.count / sb.columns) : 1;
  const col = sb && frame != null ? frame % sb.columns : 0;
  const row = sb && frame != null ? Math.floor(frame / sb.columns) : 0;
  const at = sb && frame != null && video.durationSec ? Math.min(video.durationSec, frame * sb.interval) : null;

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      onPointerMove={onMove}
      onPointerLeave={() => setFrame(null)}
      aria-label={`Play ${title}`}
      className="group/rec relative block aspect-video w-full overflow-hidden bg-black text-left focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-white"
    >
      {video.poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={video.poster} alt="" className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-[var(--ease-out)] group-hover/rec:scale-[1.03]" loading="lazy" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-white/40">
          <Film className="size-10" aria-hidden="true" />
        </span>
      )}
      {sb && frame != null ? (
        <span
          className="absolute inset-0"
          aria-hidden="true"
          style={{
            backgroundImage: `url(${sb.url})`,
            backgroundSize: `${sb.columns * 100}% ${rows * 100}%`,
            backgroundPosition: `${sb.columns > 1 ? (col / (sb.columns - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`,
          }}
        />
      ) : null}
      <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" aria-hidden="true" />
      <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
        <span className="flex size-14 items-center justify-center rounded-full bg-white/92 text-ink shadow-lg transition-transform duration-300 ease-[var(--ease-out)] group-hover/rec:scale-110 group-active/rec:scale-95">
          <Play className="ml-0.5 size-6 fill-current" />
        </span>
      </span>
      {sb && frame != null ? (
        <>
          <span className="absolute bottom-0 left-0 h-1 bg-red" style={{ width: `${pointerX * 100}%` }} aria-hidden="true" />
          {at != null ? (
            <span className="mono absolute top-2 left-2 rounded-full bg-black/65 px-2 py-0.5 text-[0.6875rem] text-white" aria-hidden="true">
              {formatDuration(at)}
            </span>
          ) : null}
        </>
      ) : null}
      {video.durationSec ? (
        <span className="mono absolute right-2 bottom-2 rounded-full bg-black/65 px-2 py-0.5 text-[0.6875rem] text-white">{formatDuration(video.durationSec)}</span>
      ) : null}
    </button>
  );
}

/** What the media side shows while a recording is not playable: the pipeline, a timer, characters. */
function PipelineArt({ rec }: { rec: StreamSessionAdmin }) {
  const now = useNow(1000);
  const reduce = useReducedMotion();
  const s = rec.recordingStatus;
  const idx = pipelineIndex(s);
  const failed = s === 'failed';
  const none = s === 'none';
  return (
    <div className="relative flex aspect-video w-full flex-col justify-between overflow-hidden p-4 text-white">
      <div className="pointer-events-none absolute inset-0 opacity-[0.12]" aria-hidden="true">
        <div className="flex h-1/2">
          {['#3a6dc5', '#f7bf33', '#f94141', '#0f8657', '#f5f6f8', '#3a6dc5'].map((c, i) => (
            <span key={i} className="flex-1" style={{ background: c }} />
          ))}
        </div>
      </div>

      <div className="relative flex items-center justify-between gap-2">
        {s === 'recording' ? (
          <span className="mono inline-flex items-center gap-1.5 rounded-full bg-red px-2.5 py-1 text-xs font-semibold tabular-nums">
            <span className="size-1.5 animate-pulse rounded-full bg-white motion-reduce:animate-none" aria-hidden="true" />
            REC {clock(secondsSince(rec.startedAt, now))}
          </span>
        ) : (
          <span className="mono text-[0.6875rem] tracking-[0.08em] text-white/60 uppercase">{failed ? 'Needs a hand' : none ? 'Nothing recorded' : 'Building'}</span>
        )}
      </div>

      <div className="relative flex items-end justify-center gap-1.5" aria-hidden="true">
        {failed ? (
          <Character shape="triangle" mood="oops" size={52} />
        ) : none ? (
          <Character shape="arch" mood="sleep" size={52} />
        ) : (
          (['circle', 'triangle', 'square', 'arch'] as const).map((shape, i) => (
            <motion.span
              key={shape}
              animate={reduce ? undefined : s === 'processing' ? { x: [0, (1.5 - i) * 6, 0] } : { y: [0, -6, 0] }}
              transition={{ duration: s === 'processing' ? 1.2 : 0.9, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' }}
            >
              <Character shape={shape} mood={i <= idx ? 'look' : 'sleep'} size={30} lookAt={{ x: 0, y: 0.6 }} />
            </motion.span>
          ))
        )}
      </div>

      {!failed && !none ? (
        <ol className="relative grid grid-cols-4 gap-1.5" aria-label="Recording progress">
          {PIPELINE.map((p, i) => {
            const done = i < idx;
            const active = i === idx;
            return (
              <li key={p.status} className="min-w-0" aria-current={active ? 'step' : undefined}>
                <span className="relative block h-1.5 overflow-hidden rounded-full bg-white/15">
                  {done ? <span className="absolute inset-0 bg-green" /> : null}
                  {active ? (
                    <motion.span
                      className="absolute inset-y-0 left-0 bg-white"
                      initial={{ width: '15%' }}
                      animate={reduce ? { width: '60%' } : { width: ['15%', '85%', '15%'] }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  ) : null}
                </span>
                <span className={cn('mt-1 block truncate text-[0.6875rem]', active ? 'font-semibold text-white' : done ? 'text-white/75' : 'text-white/45')}>
                  {done ? <Check className="mr-0.5 inline size-3 align-[-2px]" strokeWidth={3} aria-hidden="true" /> : null}
                  {p.label}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <span />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ upload */

function UploadRecording({ onAttach }: { onAttach: (assetId: string, title: string | null) => Promise<unknown> }) {
  const [title, setTitle] = useState('');
  const [assetId, setAssetId] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [failed, setFailed] = useState(false);
  const attached = useRef(new Set<string>());
  const [resetKey, setResetKey] = useState(0);

  const attach = async (id: string) => {
    if (attached.current.has(id)) return;
    attached.current.add(id);
    setAttaching(true);
    setFailed(false);
    try {
      await onAttach(id, title.trim() || null);
    } catch {
      attached.current.delete(id);
      setFailed(true);
    } finally {
      setAttaching(false);
    }
  };

  return (
    <Card muted padding="sm" className="space-y-3 sm:p-5">
      <div>
        <p className="font-semibold text-ink">Upload a recording</p>
        <p className="text-sm text-ink-3">
          A video from a camera or Zoom. MP4, MOV, WebM or MKV, up to 4 GB. It is added as soon as the upload finishes, then transcodes in the
          background.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:items-start">
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-ink">
            Title <span className="font-normal text-ink-3">(optional)</span>
          </span>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Like: Full session, camera 2" />
        </label>
        <div className="space-y-2">
          <FileUpload
            key={resetKey}
            purpose="recording"
            accept={FILE_ACCEPT.video}
            value={assetId}
            onChange={(id) => {
              setAssetId(id);
              if (id) void attach(id);
            }}
            hint="Keep this tab open while it uploads."
          />
          {attaching ? (
            <p className="flex items-center gap-2 text-sm text-ink-2" role="status">
              <Spinner size={14} label={null} /> Adding it to this event...
            </p>
          ) : null}
          {failed && assetId ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="blue" onClick={() => void attach(assetId)}>
                Try adding it again
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAssetId(null);
                  setFailed(false);
                  setResetKey((k) => k + 1);
                }}
              >
                Start over
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
