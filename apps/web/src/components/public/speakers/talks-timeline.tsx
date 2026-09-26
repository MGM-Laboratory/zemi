import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { formatJakarta, type SpeakerTalk } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { Reveal } from '@/components/motion/reveal';
import { ZemiImage } from '@/components/public/media/zemi-image';
import { Chip, StatusBadge } from '@/components/public/ui/chip';
import { cn } from '@/lib/utils';
import { positionLine, roleLabel } from './lib';
import styles from './speakers.module.css';

const DOT: Record<
  SpeakerTalk['status'],
  { shape: 'circle' | 'square' | 'triangle' | 'arch'; color: string }
> = {
  scheduled: { shape: 'circle', color: '#3a6dc5' },
  ongoing: { shape: 'triangle', color: '#f94141' },
  past: { shape: 'square', color: '#9aa1ad' },
  cancelled: { shape: 'arch', color: '#d8d8d2' },
};

/**
 * Every Friday this person was on, newest first: date and time (WIB), Zemi number, talk title,
 * role, their position at the time, cover thumbnail and status. Each row links to the event.
 */
export function TalksTimeline({ talks }: { talks: SpeakerTalk[] }) {
  return (
    <ol className={styles.timeline}>
      {talks.map((t, i) => {
        const dot = DOT[t.status] ?? DOT.past;
        const where = positionLine(t.position, t.organization);
        const title = t.talkTitle?.trim() || t.eventTitle;
        return (
          <Reveal
            as="li"
            key={t.eventId}
            y={24}
            delay={Math.min(i, 5) * 0.05}
            amount={0.3}
            className={styles.enter}
          >
            <div className={styles.talk}>
              <p className="label order-2 col-start-2 mb-2 text-ink-3 md:order-none md:col-start-1 md:mb-0 md:pt-[9px] md:text-right">
                <time dateTime={t.startsAt}>{formatJakarta(t.startsAt, 'date')}</time>
                <span className="md:block"> {formatJakarta(t.startsAt, 'time')} WIB</span>
              </p>
              <span className={cn(styles.talkDot, 'row-span-2 md:row-span-1')} aria-hidden="true">
                <ShapeIcon shape={dot.shape} size={14} color={dot.color} />
              </span>
              <Link
                href={`/events/${t.eventSlug}`}
                className={cn(styles.talkLink, 'order-3 col-start-2 md:order-none md:col-start-3')}
              >
                <span className="flex min-w-0 flex-col gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="label font-bold text-ink">
                      {t.eventNumber ? `Zemi #${t.eventNumber}` : 'Zemi'}
                    </span>
                    <StatusBadge status={t.status} />
                    <Chip
                      tone="outline"
                      shape={
                        t.role === 'keynote'
                          ? 'triangle'
                          : t.role === 'moderator'
                            ? 'arch'
                            : t.role === 'panelist'
                              ? 'square'
                              : 'circle'
                      }
                    >
                      {roleLabel(t.role)}
                    </Chip>
                  </span>
                  <span
                    className="display text-[clamp(1.25rem,2vw,1.75rem)] tracking-[-0.03em] text-ink"
                    style={{ fontVariationSettings: "'CASL' 0.35, 'MONO' 0", lineHeight: 1.12 }}
                  >
                    {title}
                  </span>
                  {t.talkTitle && t.talkTitle.trim() !== t.eventTitle ? (
                    <span className="text-[0.9375rem] text-ink-2">at {t.eventTitle}</span>
                  ) : null}
                  {where ? (
                    <span className="text-[0.875rem] text-ink-3">At the time: {where}</span>
                  ) : null}
                  <span className="mt-1 inline-flex items-center gap-1.5 text-[0.9375rem] font-bold text-blue-600">
                    See the Friday{' '}
                    <ArrowRight className={cn(styles.talkArrow, 'size-4')} aria-hidden="true" />
                  </span>
                </span>
                <span
                  className={styles.talkCover}
                  style={{ ['--rest' as string]: `${i % 2 ? -3 : 3}deg` }}
                  aria-hidden="true"
                >
                  <ZemiImage
                    image={t.cover}
                    aspect="4/5"
                    sizes="104px"
                    alt=""
                    placeholderShape={dot.shape}
                  />
                </span>
              </Link>
            </div>
          </Reveal>
        );
      })}
    </ol>
  );
}
