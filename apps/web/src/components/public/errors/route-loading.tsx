'use client';

import { useEffect, useState } from 'react';
import { ZemiMark } from '@/components/brand/zemi-mark';
import { TickingDigits } from '@/components/motion/ticking-digits';
import styles from './errors.module.css';

const TICKS = ['13:14', '13:14', '13:15'];
const LINES = ['Pulling up a chair', 'Finding the right room', 'Fighting the projector', 'Pouring the coffee'];

/**
 * Route-level wait state for the public site: the mark's loading loop and a clock that ticks
 * "13:14... 13:15". Fades in after a short delay so fast navigations never flash it.
 */
export function RouteLoading() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => n + 1), 1100);
    return () => window.clearInterval(t);
  }, []);
  const tick = TICKS[i % TICKS.length]!;
  const line = LINES[Math.floor(i / TICKS.length) % LINES.length]!;

  return (
    <div className={styles.loading} role="status">
      <div className={styles.loadingInner}>
        <ZemiMark variant="loading" size="clamp(56px, 7vw, 88px)" decorative />
        {/* The rolling line is decoration; screen readers get the one sentence below. */}
        <p className="mono flex items-center gap-2 text-[0.9375rem] text-ink-2" aria-hidden="true">
          <TickingDigits value={tick} label="Almost 13:15" className="text-ink" />
          <span aria-hidden="true" className="text-ink-4">
            ·
          </span>
          <span>{line}...</span>
        </p>
        <span className="sr-only">Loading the page.</span>
      </div>
    </div>
  );
}
