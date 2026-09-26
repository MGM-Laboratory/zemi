import type { TeamMember } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { LinkIcon } from '@/components/icons/link-icon';
import { LINK_KIND_LABELS } from '@/components/icons/link-kinds';
import { Reveal } from '@/components/motion/reveal';
import { stagger } from '@/components/motion/stagger';
import { ZemiImage } from '@/components/public/media/zemi-image';
import { Avatar, shapeForName } from '@/components/public/ui/avatar';
import { SectionHeader } from '@/components/public/ui/section-header';
import styles from './about.module.css';

const SAFE = /^(https?:|mailto:)/i;

/** The organizers: each photo sits on their own brand shape, with links drawn in the Zemi icon style. */
export function Team({ team }: { team: TeamMember[] }) {
  if (!team.length) return null;
  return (
    <section className={styles.section} aria-labelledby="team-title">
      <div className="container-page">
        <SectionHeader
          id="team-title"
          eyebrow="The crew"
          eyebrowShape="square"
          title="Who keeps Fridays running."
          description="Students and staff at the lab. We book the rooms, fight the projector, run the stream and guard the coffee."
        />
        <ul className={styles.team}>
          {team.map((m, i) => {
            const shape = shapeForName(m.name);
            const links = (m.links ?? []).filter((l) => SAFE.test(l.url));
            return (
              <Reveal as="li" key={m.id} delay={stagger(i % 3)} y={32} className={styles.member} data-shape={shape}>
                <div className={styles.memberPhoto} data-shape={shape}>
                  <span className={styles.memberShape} aria-hidden="true">
                    <ShapeIcon shape={shape} size="100%" />
                  </span>
                  <span className={styles.memberImg}>
                    {m.avatar ? (
                      <ZemiImage image={m.avatar} alt="" fill sizes="136px" className="rounded-full" />
                    ) : (
                      <Avatar name={m.name} size={136} shape={shape} />
                    )}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className={styles.memberName}>{m.name}</h3>
                  {m.role ? <p className="text-[0.9375rem] font-semibold text-ink-3">{m.role}</p> : null}
                </div>
                {m.bio ? <p className="text-ink-2">{m.bio}</p> : null}
                {links.length ? (
                  <ul className="mt-auto flex flex-wrap gap-2 pt-1" aria-label={`${m.name} elsewhere`}>
                    {links.map((l) => {
                      const external = !l.url.startsWith('mailto:');
                      const label = l.label || LINK_KIND_LABELS[l.kind];
                      return (
                        <li key={`${l.kind}-${l.url}`}>
                          <a
                            href={l.url}
                            className={styles.memberLink}
                            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : null)}
                            aria-label={`${m.name} on ${label}${external ? ' (opens in a new tab)' : ''}`}
                            title={label}
                          >
                            <LinkIcon kind={l.kind} size={18} />
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
