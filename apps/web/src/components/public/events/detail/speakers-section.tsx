'use client';

import type { EventSpeaker } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { Reveal } from '@/components/motion/reveal';
import { stagger } from '@/components/motion/stagger';
import { Avatar, shapeForName } from '@/components/public/ui/avatar';
import { Card, CardLink } from '@/components/public/ui/card';
import { Chip } from '@/components/public/ui/chip';
import { SectionHeader } from '@/components/public/ui/section-header';
import { cn } from '@/lib/utils';

const ROLE_LABEL: Record<EventSpeaker['role'], string> = {
  speaker: 'Talk',
  keynote: 'Keynote',
  moderator: 'Moderator',
  panelist: 'Panel',
};

export function SpeakersSection({
  speakers,
  title = "Who's talking",
  eyebrow = 'Speakers',
  past,
  description,
  className,
}: {
  speakers: EventSpeaker[];
  title?: string;
  eyebrow?: string;
  past?: boolean;
  description?: string;
  className?: string;
}) {
  if (!speakers.length) return null;
  const solo = speakers.length === 1;
  return (
    <section className={cn('container-page', className)} aria-labelledby="speakers-title">
      <SectionHeader
        eyebrow={eyebrow}
        eyebrowShape="circle"
        id="speakers-title"
        title={title}
        size="m"
        description={
          description ??
          (past
            ? 'The brave ones who brought the messy version.'
            : 'Bring questions. They asked for them, promise.')
        }
      />
      {/* Rows always fill: cards share the row and grow into any gap, a wide card lays out sideways. */}
      <ul className={cn('mt-10 flex flex-wrap gap-[var(--gutter)]', solo && 'max-w-[56rem]')}>
        {speakers.map((s, i) => {
          const shape = shapeForName(s.fullName);
          const org = [s.position, s.organization].filter(Boolean).join(', ');
          return (
            <Reveal
              as="li"
              key={`${s.id}-${s.role}`}
              delay={stagger(i, 0.08)}
              className="@container min-w-0 flex-[1_1_300px]"
            >
              <Card className="h-full" cursor="open" maxTilt={4}>
                <div className="flex h-full flex-col gap-5 p-6 sm:p-7 @min-[36rem]:flex-row @min-[36rem]:items-start @min-[36rem]:gap-7">
                  <div className="flex items-start justify-between gap-4 @min-[36rem]:contents">
                    <div className="relative flex-none">
                      <Avatar name={s.fullName} image={s.avatar} size={84} />
                      <ShapeIcon
                        shape={shape}
                        size={26}
                        className="absolute -bottom-1 -right-2 transition-transform duration-500 [transition-timing-function:cubic-bezier(.34,1.56,.64,1)] group-hover/card:rotate-[200deg] group-hover/card:scale-110"
                      />
                    </div>
                    <Chip
                      tone="outline"
                      mono
                      className="@min-[36rem]:absolute @min-[36rem]:right-7 @min-[36rem]:top-7"
                    >
                      {ROLE_LABEL[s.role]}
                    </Chip>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-5 @min-[36rem]:self-stretch @min-[36rem]:pr-24">
                    <div className="flex flex-col gap-1.5">
                      <h3 className="text-[1.5rem] font-extrabold leading-tight text-ink">
                        <CardLink href={`/speakers/${s.slug}`}>{s.fullName}</CardLink>
                      </h3>
                      {org ? <p className="text-[0.9375rem] text-ink-3">{org}</p> : null}
                    </div>
                    {s.talkTitle ? (
                      <p
                        className="display mt-auto text-balance text-[1.25rem] leading-[1.15] text-ink-2"
                        style={{ fontVariationSettings: "'CASL' 0.6, 'MONO' 0", fontWeight: 700 }}
                      >
                        &ldquo;{s.talkTitle}&rdquo;
                      </p>
                    ) : null}
                  </div>
                </div>
              </Card>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}
