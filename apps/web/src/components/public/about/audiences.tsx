import type { ShapeName } from '@zemi/shared';
import { Character, type CharacterMood } from '@/components/brand/character';
import { Reveal } from '@/components/motion/reveal';
import { stagger } from '@/components/motion/stagger';
import { Button } from '@/components/public/ui/button';
import { SectionHeader } from '@/components/public/ui/section-header';
import { cn } from '@/lib/utils';
import styles from './about.module.css';

const TAGS: Array<{ shape: ShapeName; tone: string; mood: CharacterMood }> = [
  { shape: 'circle', tone: styles.tagBlue!, mood: 'happy' },
  { shape: 'triangle', tone: styles.tagRed!, mood: 'surprised' },
  { shape: 'square', tone: styles.tagYellow!, mood: 'thinking' },
  { shape: 'arch', tone: styles.tagGreen!, mood: 'idle' },
];

/**
 * "Who it's for" as conference name tags that swing on hover. The last tag is always for the
 * curious: no badge needed.
 */
export function Audiences({ audiences }: { audiences: Array<{ title: string; body: string }> }) {
  if (!audiences.length) return null;
  return (
    <section className={styles.section} aria-labelledby="audiences-title">
      <div className="container-page">
        <SectionHeader
          id="audiences-title"
          eyebrow="Who it’s for"
          eyebrowShape="circle"
          title="Same table, different name tags."
          description="Master’s, PhD, undergrads, lecturers, people from outside campus. Nobody checks titles at the door."
        />
        <ul className={styles.tags}>
          {audiences.map((a, i) => {
            const t = TAGS[i % TAGS.length]!;
            return (
              <Reveal as="li" key={a.title} delay={stagger(i)} y={40} className={styles.tagSlot}>
                <article
                  className={cn(styles.tag, t.tone)}
                  style={{ ['--tilt' as string]: `${(i % 2 ? 1 : -1) * (1 + (i % 3))}deg` }}
                >
                  <span className={styles.tagHole} aria-hidden="true" />
                  <header className={styles.tagBand}>
                    <span className="label">Hello, I’m</span>
                  </header>
                  <div className="flex flex-1 flex-col gap-3 p-6 pt-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className={styles.tagName}>{a.title}</h3>
                      <Character shape={t.shape} mood={t.mood} size={46} seed={i} className="flex-none" />
                    </div>
                    <p className="text-ink-2">{a.body}</p>
                  </div>
                </article>
              </Reveal>
            );
          })}
          <Reveal as="li" delay={stagger(audiences.length)} y={40} className={styles.tagSlot}>
            <article className={cn(styles.tag, styles.tagBlank)} style={{ ['--tilt' as string]: '2deg' }}>
              <span className={styles.tagHole} aria-hidden="true" />
              <header className={styles.tagBand}>
                <span className="label">Hello, I’m</span>
              </header>
              <div className="flex flex-1 flex-col gap-3 p-6 pt-5">
                <h3 className={cn(styles.tagName, styles.tagScribble)}>just curious</h3>
                <p className="text-ink-2">That counts. No badge needed, no questions asked (unless you have one).</p>
                <div className="mt-auto pt-2">
                  <Button href="/events" size="sm" variant="secondary" shape="square">
                    Find a Friday
                  </Button>
                </div>
              </div>
            </article>
          </Reveal>
        </ul>
      </div>
    </section>
  );
}
