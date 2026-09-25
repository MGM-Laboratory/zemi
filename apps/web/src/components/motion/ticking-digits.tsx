import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import styles from './motion.module.css';

export interface TickingDigitsProps {
  /** Any string. Digits roll, everything else is static (":", "-", spaces, letters). */
  value: string;
  className?: string;
  style?: CSSProperties;
  /** Accessible text. Default: the value. */
  label?: string;
}

const COLUMN = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Mono digits that roll to their new value (odometer). Server-safe, CSS transitions only.
 * Each position keeps its own slot, so "13:59" to "14:00" rolls every changed digit.
 *
 * @example <TickingDigits value="13:15" className="text-2xl" />
 */
export function TickingDigits({ value, className, style, label }: TickingDigitsProps) {
  return (
    <span className={cn(styles.digits, className)} style={style} role="img" aria-label={label ?? value}>
      {Array.from(value).map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={`d${i}`} className={styles.digitSlot} aria-hidden="true">
            <span className={styles.digitColumn} style={{ '--d': Number(ch) } as CSSProperties}>
              {COLUMN.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={`s${i}`} className={cn(styles.digitStatic, ch === ':' && styles.digitColon)} aria-hidden="true">
            {ch === ' ' ? ' ' : ch}
          </span>
        ),
      )}
    </span>
  );
}
