import type { ShapeName } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { ZemiMark } from '@/components/brand/zemi-mark';
import { CaslHeading } from '@/components/motion/casl-heading';
import { Marquee } from '@/components/motion/marquee';
import { Button } from '@/components/public/ui/button';
import { Eyebrow } from '@/components/public/ui/section-header';
import styles from './about.module.css';

const MARQUEE: Array<{ shape: ShapeName; text: string }> = [
  { shape: 'circle', text: 'Fridays, 13:15 WIB' },
  { shape: 'triangle', text: 'Bring the messy version' },
  { shape: 'square', text: 'Coffee on the side table' },
  { shape: 'arch', text: 'Questions welcome' },
];

/** The lab behind Zemi, with the way over to labmgm.org. */
export function Lab({ name, url }: { name: string; url: string }) {
  const host = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return (
    <section className={styles.labSection} aria-labelledby="lab-title">
      <Marquee speed={40} reactToScroll className={styles.labMarquee} label="Fridays, 13:15 WIB. Bring the messy version.">
        {MARQUEE.map((m) => (
          <span key={m.text} className={styles.labMarqueeItem}>
            <ShapeIcon shape={m.shape} size="0.7em" />
            {m.text}
          </span>
        ))}
      </Marquee>
      <div className="container-page">
        <div className={styles.labCard}>
          <div className={styles.labMark}>
            <ZemiMark size="100%" interactive variant="idle" title={`Zemi, at ${name}`} />
          </div>
          <div className="flex flex-col gap-5">
            <Eyebrow shape="square">The lab</Eyebrow>
            <CaslHeading as="h2" id="lab-title" size="m" className="text-ink">
              Made at {name}.
            </CaslHeading>
            <p className="text-body-l max-w-[36rem] text-ink-2">
              Zemi is run by {name}. The lab hosts the seminar, lends the rooms and the gear, and keeps the coffee budget alive.
              Curious what else happens there?
            </p>
            <div className="flex flex-wrap gap-3">
              <Button href={url} size="lg" shape="arch">
                Visit {host}
              </Button>
              <Button href="/events" size="lg" variant="secondary" shape="circle">
                See the Fridays
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
