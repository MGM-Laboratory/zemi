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
      <ul
        className={cn(
          'mt-10 grid grid-cols-1 gap-[var(--gutter)]',
          solo ? 'max-w-[44rem]' : 'sm:grid-cols-2 xl:grid-cols-3',
        )}
      >
        {speakers.map((s, i) => {
          const shape = shapeForName(s.fullName);
          const org = [s.position, s.organization].filter(Boolean).join(', ');
          return (
            <Reveal as="li" key={`${s.id}-${s.role}`} delay={stagger(i, 0.08)}>
              <Card className="h-full" cursor="open" maxTilt={4}>
                <div className="flex h-full flex-col gap-5 p-6 sm:p-7">
                  <div className="flex items-start justify-between gap-4">
                    <div className="relative">
                      <Avatar name={s.fullName} image={s.avatar} size={84} />
                      <ShapeIcon
                        shape={shape}
                        size={26}
                        className="absolute -bottom-1 -right-2 transition-transform duration-500 [transition-timing-function:cubic-bezier(.34,1.56,.64,1)] group-hover/card:rotate-[200deg] group-hover/card:scale-110"
                      />
                    </div>
                    <Chip tone="outline" mono>
                      {ROLE_LABEL[s.role]}
                    </Chip>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-[1.5rem] font-extrabold leading-tight text-ink">
                      <CardLink href={`/speakers/${s.slug}`}>{s.fullName}</CardLink>
                    </h3>
                    {org ? <p className="text-[0.9375rem] text-ink-3">{org}</p> : null}
                  </div>
                  {s.talkTitle ? (
                    <p
                      className="display mt-auto text-[1.25rem] leading-[1.15] text-ink-2"
                      style={{ fontVariationSettings: "'CASL' 0.6, 'MONO' 0", fontWeight: 700 }}
                    >
                      &ldquo;{s.talkTitle}&rdquo;
                    </p>
                  ) : null}
                </div>
              </Card>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}
