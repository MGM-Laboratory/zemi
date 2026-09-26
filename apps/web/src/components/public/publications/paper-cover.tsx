import type { PublicationType } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { cn } from '@/lib/utils';
import { typeLook } from './lib';
import styles from './publications.module.css';

export interface PaperCoverProps {
  title: string;
  type: PublicationType;
  year: number | null;
  className?: string;
}

/**
 * Stand-in cover for papers without one: a sheet of graph paper with the title set in
 * Recursive and the type's brand shape poking in from the corner. Decorative (the real title
 * is always on the page).
 */
export function PaperCover({ title, type, year, className }: PaperCoverProps) {
  const look = typeLook(type);
  return (
    <span className={cn(styles.paper, 'block', className)} aria-hidden="true">
      <span className="label relative z-[1] flex items-center justify-between gap-2 text-ink-3">
        <span className="inline-flex items-center gap-1.5 truncate">
          <ShapeIcon shape={look.shape} size="0.9em" />
          {look.label}
        </span>
        {year ? <span>{year}</span> : null}
      </span>
      <span className={cn(styles.paperTitle, 'relative z-[1] text-ink')}>{title}</span>
      <span className="relative z-[1] flex flex-col gap-1.5">
        <span className="block h-1.5 w-3/5 rounded-full bg-line-strong" />
        <span className="block h-1.5 w-2/5 rounded-full bg-line" />
      </span>
      <span className={styles.paperShape}>
        <ShapeIcon shape={look.shape} size="100%" color={look.hex} />
      </span>
    </span>
  );
}
