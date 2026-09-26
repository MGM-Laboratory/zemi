'use client';

import type { StreamHealth } from '@zemi/shared';
import { Activity, AudioLines, Clock3, Film, HardDriveDownload, MonitorPlay } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { Card } from '@/components/admin/ui/card';
import { Skeleton } from '@/components/admin/ui/feedback';
import { cn } from '@/lib/admin/cn';
import { formatBytes } from '@/lib/admin/format';
import { useNow } from '@/lib/admin/hooks';
import { bitrateVerdict, clock, codecLabel, secondsSince } from './lib';
import type { HealthSample } from './use-stream';

const VERDICT = {
  none: { label: 'No data', cls: 'bg-surface-muted text-ink-3' },
  low: { label: 'Too low', cls: 'bg-red-50 text-red-600' },
  ok: { label: 'Healthy', cls: 'bg-green-50 text-green-600' },
  high: { label: 'Very high', cls: 'bg-yellow-50 text-[#7a5600]' },
} as const;

/**
 * Ingest health from GET /stream/health (polled every 3 s): bitrate with a sparkline, resolution,
 * codecs, bytes received and uptime. Frame rate is not reported by the media server yet.
 */
export function HealthPanel({
  health,
  history,
  loading,
  className,
}: {
  health: StreamHealth | undefined;
  history: HealthSample[];
  loading: boolean;
  className?: string;
}) {
  const now = useNow(1000);
  const online = Boolean(health?.online);
  const kbps = health?.bitrateKbps ?? null;
  const height = health?.video?.height ?? null;
  const width = health?.video?.width ?? null;
  const verdict = online ? bitrateVerdict(kbps, height) : 'none';
  const uptime = online && health?.since ? clock(secondsSince(health.since, now)) : null;

  return (
    <Card padding="none" className={cn('@container overflow-hidden', className)} aria-labelledby="stream-health-title">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Activity className="size-4 text-ink-3" aria-hidden="true" />
          <h3 id="stream-health-title" className="font-display text-[1.0625rem] font-extrabold tracking-[-0.015em] [font-variation-settings:'CASL'_0.2]">
            Signal health
          </h3>
        </div>
        <span className="flex items-center gap-2 text-xs text-ink-3">
          <span className={cn('size-1.5 rounded-full', online ? 'bg-green' : 'bg-ink-4')} aria-hidden="true" />
          {online ? 'Checking every 3 s' : 'Waiting for OBS'}
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-px bg-line @2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* Bitrate */}
        <div className="bg-white px-5 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-ink-3">Bitrate</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold', VERDICT[verdict].cls)}>{VERDICT[verdict].label}</span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            {loading && !health ? (
              <Skeleton className="h-9 w-28" />
            ) : (
              <>
                <span className="font-display text-[2.25rem] leading-none font-extrabold tracking-[-0.04em] tabular-nums [font-variation-settings:'CASL'_0.2]">
                  {online && kbps != null ? kbps.toLocaleString('en-US') : '0'}
                </span>
                <span className="text-sm text-ink-3">kbps</span>
              </>
            )}
          </div>
          <BitrateChart samples={history} online={online} verdict={verdict} />
          <p className="mt-1 text-xs text-ink-3">
            {verdict === 'low'
              ? 'Pictures may get blocky. Check the upload speed or lower the OBS bitrate to match it.'
              : verdict === 'high'
                ? 'That is a lot. 3500 to 4500 kbps is plenty for 1080p.'
                : 'We suggest 3500 to 4500 kbps for 1080p, or 2500 for 720p.'}
          </p>
        </div>

        {/* Facts */}
        <dl className="grid grid-cols-2 gap-px bg-line @md:grid-cols-3 @2xl:grid-cols-2">
          <Fact icon={<MonitorPlay />} label="Resolution" value={online && width && height ? `${width} x ${height}` : null} loading={loading && !health} />
          <Fact icon={<Film />} label="Video" value={online && health?.video ? codecLabel(health.video.codec) : null} loading={loading && !health} />
          <Fact
            icon={<AudioLines />}
            label="Audio"
            value={
              online && health?.audio
                ? [
                    codecLabel(health.audio.codec),
                    health.audio.sampleRate ? `${Math.round(health.audio.sampleRate / 100) / 10} kHz` : null,
                    health.audio.channels === 2 ? 'stereo' : health.audio.channels === 1 ? 'mono' : null,
                  ]
                    .filter(Boolean)
                    .join(', ')
                : null
            }
            warn={online && !health?.audio ? 'No audio track' : undefined}
            loading={loading && !health}
          />
          <Fact icon={<Clock3 />} label="Uptime" value={uptime} mono loading={loading && !health} />
          <Fact
            icon={<HardDriveDownload />}
            label="Received"
            value={online && health ? formatBytes(health.bytesReceived) : null}
            loading={loading && !health}
            className="col-span-2"
          />
        </dl>
      </div>
    </Card>
  );
}

function Fact({
  icon,
  label,
  value,
  warn,
  mono,
  loading,
  className,
}: {
  icon: ReactNode;
  label: string;
  value: string | null;
  warn?: string;
  mono?: boolean;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 bg-white px-4 py-3 sm:px-5', className)}>
      <dt className="flex items-center gap-1.5 text-xs text-ink-3 [&_svg]:size-3.5">
        {icon}
        {label}
      </dt>
      <dd className={cn('mt-1 text-[0.9375rem] leading-snug font-semibold break-words text-ink tabular-nums', mono && 'mono', warn && !value && 'text-red-600')}>
        {loading ? <Skeleton className="h-5 w-20" /> : (value ?? warn ?? <span className="font-normal text-ink-4">No data</span>)}
      </dd>
    </div>
  );
}

/** Bitrate over the last ~2 minutes. Flat dashed line when there is no signal. */
function BitrateChart({ samples, online, verdict }: { samples: HealthSample[]; online: boolean; verdict: keyof typeof VERDICT }) {
  const reduce = useReducedMotion();
  const w = 240;
  const h = 56;
  const data = samples.map((s) => s.kbps);
  const max = Math.max(5000, ...data) * 1.1;
  const color = verdict === 'low' ? 'var(--color-red)' : verdict === 'high' ? 'var(--color-yellow-600)' : 'var(--color-blue)';
  const pts = data.map((v, i) => [data.length < 2 ? w : (i / (data.length - 1)) * w, h - 2 - (v / max) * (h - 6)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = pts.length > 1 ? `${line} L${w} ${h} L0 ${h} Z` : '';
  const target = h - 2 - (4000 / max) * (h - 6);
  const last = pts[pts.length - 1];
  return (
    <div className="relative mt-3 h-14 w-full" aria-hidden="true">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="size-full overflow-visible">
        <line x1={0} x2={w} y1={target} y2={target} stroke="var(--color-line-strong)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        {!online || pts.length < 2 ? (
          <line x1={0} x2={w} y1={h - 2} y2={h - 2} stroke="var(--color-ink-4)" strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />
        ) : (
          <>
            <path d={area} fill={color} opacity={0.1} />
            <motion.path
              d={line}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              initial={false}
              animate={{ d: line }}
              transition={{ duration: reduce ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
            />
          </>
        )}
      </svg>
      {online && last ? (
        <span
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
          style={{ left: `${(last[0] / w) * 100}%`, top: `${(last[1] / h) * 100}%`, background: color }}
        >
          <span className="absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:animate-none" style={{ background: color }} />
        </span>
      ) : null}
      <span className="mono absolute top-0 right-0 -translate-y-full pb-0.5 text-[0.625rem] text-ink-4">4000 kbps</span>
    </div>
  );
}
