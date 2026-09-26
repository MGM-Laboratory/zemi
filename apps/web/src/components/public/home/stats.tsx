'use client';

import { formatJakarta, type PublicSite, type ShapeName } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { CountUp } from '@/components/motion/count-up';
import { Parallax } from '@/components/motion/reveal';
import { SectionHeader } from '@/components/public/ui/section-header';
import { cn } from '@/lib/utils';
import styles from './stats.module.css';

interface Stat {
  key: string;
  value: number;
  label: string;
  shape: ShapeName;
  speed: number;
}

/** "1 coffee machine we keep blaming" -> { n: 1, rest: "coffee machine we keep blaming" } */
function splitFun(text: string): { n: number | null; rest: string } {
  const m = /^\s*([\d.,]+)\s+(.*)$/.exec(text);
  if (!m) return { n: null, rest: text };
  const n = Number(m[1]!.replace(/,/g, ''));
  return Number.isFinite(n) ? { n, rest: m[2]! } : { n: null, rest: text };
}

/**
 * Numbers that matter: the site stats, each held by a character, counted up as they scroll in,
 * plus the one number we cannot count (the admin's fun stat) on a sticky note.
 */
export function Stats({
  stats,
  funStat,
  enabled,
  offline,
}: {
  stats: PublicSite['stats'];
  funStat: string;
  enabled: boolean;
  offline: boolean;
}) {
  const list: Stat[] = [
    {
      key: 'sessions',
      value: stats.sessions,
      label: stats.sessions === 1 ? 'Friday so far' : 'Fridays so far',
      shape: 'arch',
      speed: 0.12,
    },
    {
      key: 'talks',
      value: stats.talks,
      label: stats.talks === 1 ? 'talk given' : 'talks given',
      shape: 'triangle',
      speed: 0.22,
    },
    {
      key: 'speakers',
      value: stats.speakers,
      label: stats.speakers === 1 ? 'brave speaker' : 'brave speakers',
      shape: 'circle',
      speed: 0.05,
    },
    { key: 'seats', value: stats.seatsFilled, label: 'seats filled', shape: 'square', speed: 0.18 },
    {
      key: 'pubs',
      value: stats.publications,
      label: stats.publications === 1 ? 'paper born here' : 'papers born here',
      shape: 'circle',
      speed: 0.26,
    },
  ];
  const shown = list.filter((s) => s.value > 0);
  if (!enabled || offline || shown.length < 2) return null;
  const fun = funStat?.trim() ? splitFun(funStat) : null;
  const since = stats.firstEventAt ? formatJakarta(stats.firstEventAt, 'month-year') : null;

  return (
    <section className={styles.stats} aria-labelledby="stats-title">
      <div className="container-page">
        <SectionHeader
          id="stats-title"
          eyebrow="Numbers that matter"
          eyebrowShape="arch"
          title="Every Friday, counted."
          description={
            since
              ? `Since ${since}. We count everything except the coffee.`
              : 'We count everything except the coffee.'
          }
        />
        <ul className={styles.grid}>
          {shown.map((s, i) => (
            <li key={s.key} className={cn(styles.cell, styles[`cell${i}`])}>
              <Parallax speed={s.speed}>
                <div className={cn(styles.holder, styles[s.shape])}>
                  <Character shape={s.shape} size="100%" seed={i * 3 + 2} className={styles.body} />
                  <span className={styles.num}>
                    <CountUp value={s.value} duration={1.8} />
                  </span>
                </div>
                <p className={styles.label}>{s.label}</p>
              </Parallax>
            </li>
          ))}
          {fun ? (
            <li className={cn(styles.cell, styles.funCell)}>
              <Parallax speed={0.1}>
                <div className={styles.note}>
                  <span className="label text-ink-3">The one we cannot count</span>
                  <p className={styles.noteText}>
                    {fun.n != null ? (
                      <span className={styles.noteNum}>
                        <CountUp value={fun.n} duration={1.2} />
                      </span>
                    ) : null}{' '}
                    {fun.rest}
                  </p>
                </div>
              </Parallax>
            </li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}
