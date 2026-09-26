import { formatJakarta } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { Reveal } from '@/components/motion/reveal';
import { Card } from '@/components/public/ui/card';
import { SectionHeader } from '@/components/public/ui/section-header';
import styles from './about.module.css';

/**
 * Where the name comes from, as a dictionary entry: in Japanese universities a "zemi" (ゼミ)
 * is the small seminar that meets every week. Ours meets on Fridays.
 */
export function ZemiWord({ firstEventAt }: { firstEventAt: string | null }) {
  const since = firstEventAt ? formatJakarta(firstEventAt, 'month-year') : null;
  return (
    <section className={styles.section} aria-labelledby="word-title">
      <div className={`container-page ${styles.wordGrid}`}>
        <SectionHeader
          id="word-title"
          eyebrow="The name"
          eyebrowShape="square"
          title="Why “zemi”?"
          description="We borrowed it. In Japan, a zemi is the small group that meets every week to talk research. It felt right, so we kept it."
          className={styles.wordHead}
        />
        <Reveal y={36} className={styles.wordCardWrap}>
          <Card className={styles.wordCard} maxTilt={4}>
            <div className="flex flex-col gap-5 p-[clamp(22px,4vw,48px)]">
              <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className={styles.wordHeadword}>zemi</span>
                <span className={styles.wordKana} lang="ja">
                  ゼミ
                </span>
              </p>
              <p className="mono flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.9375rem] text-ink-3">
                <span>zeh-mee</span>
                <span aria-hidden="true">·</span>
                <em className="not-italic">noun</em>
                <span aria-hidden="true">·</span>
                <span>from the German “Seminar”</span>
              </p>
              <ol className={styles.senses}>
                <li>
                  <ShapeIcon shape="circle" size="0.85em" className={styles.senseShape} />
                  <span>
                    At Japanese universities: a small seminar that meets <strong>every week</strong>. A professor, a handful of
                    students, and research that is still in progress.
                  </span>
                </li>
                <li>
                  <ShapeIcon shape="arch" size="0.85em" className={styles.senseShape} />
                  <span>
                    At MGM Laboratory: <strong>Fridays, 13:15 to 15:15 WIB.</strong> Hybrid, free, a little chaotic. Bring the
                    messy version.
                  </span>
                </li>
              </ol>
              <p className="border-t border-line pt-4 text-[0.9375rem] text-ink-3">
                <span className="label mr-2 text-ink-3">See also</span>
                coffee, questions, “just one more slide”.
              </p>
            </div>
            {since ? (
              <span className={styles.wordStamp} aria-label={`Since ${since}`}>
                <span className="label">since</span>
                <span className="mono text-[0.8125rem] font-bold">{since}</span>
              </span>
            ) : null}
          </Card>
        </Reveal>
      </div>
    </section>
  );
}
