import { SHAPE_ORDER } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { HighlightSwipe } from '@/components/motion/highlight-swipe';
import { Reveal } from '@/components/motion/reveal';
import { stagger } from '@/components/motion/stagger';
import { Button } from '@/components/public/ui/button';
import { Eyebrow } from '@/components/public/ui/section-header';
import { CaslHeading } from '@/components/motion/casl-heading';
import styles from './about.module.css';
import { PRESENT_HREF } from './lib';

/** "Want to present?": the steps from settings as a path of shapes, and the button to say hi. */
export function PresentSteps({ steps, cta }: { steps: Array<{ title: string; body: string }>; cta: string }) {
  if (!steps.length) return null;
  return (
    <section className={styles.section} aria-labelledby="present-title">
      <div className={`container-page ${styles.presentGrid}`}>
        <div className={styles.presentHead}>
          <Eyebrow shape="triangle">Want to present?</Eyebrow>
          <CaslHeading as="h2" id="present-title" size="l" reveal className="text-ink">
            Bring the messy version.
          </CaslHeading>
          <p className="text-body-l max-w-[32rem] text-ink-2">
            Master’s and PhD students are our main speakers, but anyone with research in progress is welcome.{' '}
            <HighlightSwipe>Nobody expects slides to be perfect.</HighlightSwipe>
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Button href={PRESENT_HREF} size="lg" cursor="register">
              {cta}
            </Button>
            <span className="flex items-end gap-1.5" aria-hidden="true">
              <Character shape="triangle" mood="happy" size={40} seed={7} />
              <Character shape="circle" mood="idle" size={32} seed={8} />
            </span>
          </div>
        </div>

        <ol className={styles.steps}>
          {steps.map((s, i) => {
            const shape = SHAPE_ORDER[i % 4]!;
            return (
              <Reveal as="li" key={`${s.title}-${i}`} className={styles.step} delay={stagger(i)} y={30}>
                <span className={styles.stepMarker} aria-hidden="true">
                  <ShapeIcon shape={shape} size="100%" />
                </span>
                <div className="flex flex-col gap-1.5">
                  <h3 className={styles.stepTitle}>{s.title}</h3>
                  <p className="text-ink-2">{s.body}</p>
                </div>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
