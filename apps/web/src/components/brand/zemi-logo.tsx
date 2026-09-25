'use client';

import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import styles from './brand.module.css';
import { ZemiMark, type MarkTone, type MarkVariant } from './zemi-mark';
import { ZemiWordmark } from './zemi-wordmark';

export interface ZemiLogoProps {
  className?: string;
  style?: CSSProperties;
  /** Mark tone. The wordmark always follows currentColor (its idea dot keeps brand colors unless `tone="ink"|"paper"`). */
  tone?: MarkTone;
  markVariant?: MarkVariant;
  /** Hover shuffles the mark. Default true. */
  interactive?: boolean;
  /** Replay the mark shuffle when this changes (route changes). */
  trigger?: unknown;
  /** Hide the wordmark under 380px. Default true. */
  collapse?: boolean;
  title?: string;
}

/**
 * Lockup: mark + live wordmark. Size it with font-size (the mark is 1.12em).
 * Wrap it in a Link yourself; it renders no anchor.
 *
 * @example <Link href="/" aria-label="Zemi home"><ZemiLogo className="text-[1.6rem]" decorative /></Link>
 */
export function ZemiLogo({
  className,
  style,
  tone = 'color',
  markVariant = 'idle',
  interactive = true,
  trigger,
  collapse = true,
  title = 'Zemi',
}: ZemiLogoProps) {
  return (
    <span
      className={cn(styles.logo, collapse && styles.collapse, className)}
      style={style}
      role="img"
      aria-label={title}
    >
      <ZemiMark
        decorative
        tone={tone}
        variant={markVariant}
        interactive={interactive}
        trigger={trigger}
        size="1.12em"
        className={styles.logoMark}
      />
      <ZemiWordmark decorative dot={tone === 'color' ? 'color' : 'current'} className={styles.logoWord} />
    </span>
  );
}
