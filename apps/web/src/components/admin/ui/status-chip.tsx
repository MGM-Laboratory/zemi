import { EVENT_STATUS_LABEL, type EventStatus, type StreamState, type Visibility } from '@zemi/shared';
import { cn } from '@/lib/admin/cn';
import { ShapeGlyph } from './badge';

export type StatusChipProps =
  | { kind: 'event'; value: EventStatus; className?: string; size?: 'sm' | 'md' }
  | { kind: 'visibility'; value: Visibility; className?: string; size?: 'sm' | 'md' }
  | { kind: 'stream'; value: StreamState; className?: string; size?: 'sm' | 'md' }
  | { kind: 'asset'; value: 'processing' | 'ready' | 'failed'; className?: string; size?: 'sm' | 'md' }
  | { kind: 'registration'; value: 'registered' | 'cancelled' | 'checked-in'; className?: string; size?: 'sm' | 'md' };

interface ChipStyle {
  label: string;
  cls: string;
  glyph: 'circle' | 'triangle' | 'square' | 'arch' | 'dot' | 'live' | 'spin';
}

const EVENT: Record<EventStatus, ChipStyle> = {
  scheduled: { label: EVENT_STATUS_LABEL.scheduled, cls: 'bg-blue-50 text-blue-600', glyph: 'circle' },
  ongoing: { label: EVENT_STATUS_LABEL.ongoing, cls: 'bg-red text-white', glyph: 'live' },
  past: { label: EVENT_STATUS_LABEL.past, cls: 'bg-surface-muted text-ink-3', glyph: 'arch' },
  cancelled: { label: EVENT_STATUS_LABEL.cancelled, cls: 'bg-surface-muted text-ink-3 line-through decoration-ink-4', glyph: 'triangle' },
};

const VISIBILITY: Record<Visibility, ChipStyle> = {
  draft: { label: 'Draft', cls: 'bg-yellow-50 text-[#7a5600]', glyph: 'square' },
  published: { label: 'Published', cls: 'bg-green-50 text-green-600', glyph: 'arch' },
  unlisted: { label: 'Unlisted', cls: 'border border-dashed border-line-strong bg-white text-ink-2', glyph: 'circle' },
};

const STREAM: Record<StreamState, ChipStyle> = {
  idle: { label: 'No signal', cls: 'bg-surface-muted text-ink-3', glyph: 'dot' },
  preview: { label: 'Preview', cls: 'bg-yellow-50 text-[#7a5600]', glyph: 'dot' },
  live: { label: 'Live', cls: 'bg-red text-white', glyph: 'live' },
  ended: { label: 'Ended', cls: 'bg-surface-muted text-ink-2', glyph: 'square' },
};

const ASSET: Record<'processing' | 'ready' | 'failed', ChipStyle> = {
  processing: { label: 'Processing', cls: 'bg-blue-50 text-blue-600', glyph: 'spin' },
  ready: { label: 'Ready', cls: 'bg-green-50 text-green-600', glyph: 'arch' },
  failed: { label: 'Failed', cls: 'bg-red-50 text-red-600', glyph: 'triangle' },
};

const REGISTRATION: Record<'registered' | 'cancelled' | 'checked-in', ChipStyle> = {
  registered: { label: 'Registered', cls: 'bg-blue-50 text-blue-600', glyph: 'circle' },
  'checked-in': { label: 'Checked in', cls: 'bg-green-50 text-green-600', glyph: 'arch' },
  cancelled: { label: 'Cancelled', cls: 'bg-surface-muted text-ink-3', glyph: 'triangle' },
};

/**
 * Status chips from DESIGN.md: scheduled blue-50, live red with a pulsing dot, past ink-3 on
 * surface-muted, draft yellow-50, published green-50.
 *
 * @example <StatusChip kind="event" value={row.status} />
 * @example <StatusChip kind="stream" value="live" />
 */
export function StatusChip(props: StatusChipProps) {
  const style: ChipStyle =
    props.kind === 'event'
      ? EVENT[props.value]
      : props.kind === 'visibility'
        ? VISIBILITY[props.value]
        : props.kind === 'stream'
          ? STREAM[props.value]
          : props.kind === 'asset'
            ? ASSET[props.value]
            : REGISTRATION[props.value];
  const sm = props.size === 'sm';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold whitespace-nowrap',
        sm ? 'h-5 px-2 text-[0.6875rem]' : 'h-6 px-2.5 text-xs',
        style.cls,
        props.className,
      )}
    >
      {style.glyph === 'live' ? (
        <span className="relative flex size-2" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/80" />
          <span className="relative inline-flex size-2 rounded-full bg-white" />
        </span>
      ) : style.glyph === 'spin' ? (
        <svg viewBox="0 0 8 8" className="size-2 animate-spin" aria-hidden="true">
          <path d="M4 .5 A3.5 3.5 0 1 1 .5 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ) : (
        <ShapeGlyph shape={style.glyph} />
      )}
      {style.label}
    </span>
  );
}
