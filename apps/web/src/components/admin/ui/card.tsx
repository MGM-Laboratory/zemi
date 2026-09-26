import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Inner padding. Default 'md'. */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Muted fill instead of white. */
  muted?: boolean;
  /** Hover lift for clickable cards. */
  interactive?: boolean;
  as?: 'div' | 'section' | 'article' | 'li';
}

const PAD = { none: '', sm: 'p-4', md: 'p-5 sm:p-6', lg: 'p-6 sm:p-8' } as const;

/** White surface with a hairline border and the 28px card radius (20px on phones). */
export function Card({ padding = 'md', muted, interactive, as = 'div', className, ...props }: CardProps) {
  const Tag = as as 'div';
  return (
    <Tag
      className={cn(
        'min-w-0 rounded-[20px] border border-line sm:rounded-[var(--radius-card)]',
        muted ? 'bg-surface-muted' : 'bg-white',
        interactive && 'transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-2)]',
        PAD[padding],
        className,
      )}
      {...props}
    />
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Small icon or shape before the title. */
  icon?: ReactNode;
  /**
   * Heading level. Default 2: most cards sit right under the page h1. Use 3 for a card
   * that lives inside a titled Section (h2).
   */
  level?: 2 | 3;
  className?: string;
}

export function CardHeader({ title, description, actions, icon, level = 2, className }: CardHeaderProps) {
  const Heading = level === 3 ? 'h3' : 'h2';
  return (
    <div className={cn('mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <div className="mt-0.5 shrink-0">{icon}</div> : null}
        <div className="min-w-0">
          <Heading className="font-display text-[1.0625rem] leading-tight font-extrabold tracking-[-0.015em] [font-variation-settings:'CASL'_0.2]">{title}</Heading>
          {description ? <p className="mt-1 text-sm text-ink-3">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export interface SectionProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Two-column settings layout: text on the left, content on the right (lg+). */
  aside?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}

/**
 * A titled block inside a page. `aside` gives the calm settings layout
 * (heading + description in a left column).
 */
export function Section({ title, description, actions, aside, id, className, children }: SectionProps) {
  if (aside) {
    return (
      <section id={id} className={cn('grid gap-4 border-t border-line pt-8 first:border-t-0 first:pt-0 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-10', className)}>
        <div className="min-w-0">
          {title ? <h2 className="font-display text-lg leading-tight font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.2]">{title}</h2> : null}
          {description ? <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{description}</p> : null}
          {actions ? <div className="mt-3 flex gap-2">{actions}</div> : null}
        </div>
        <div className="min-w-0">{children}</div>
      </section>
    );
  }
  return (
    <section id={id} className={cn('min-w-0 space-y-4', className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            {title ? <h2 className="font-display text-lg leading-tight font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.2]">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-ink-3">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Hairline divider. */
export function Divider({ className, label }: { className?: string; label?: ReactNode }) {
  if (!label) return <hr className={cn('border-0 border-t border-line', className)} />;
  return (
    <div className={cn('flex items-center gap-3', className)} role="separator">
      <span className="h-px flex-1 bg-line" />
      <span className="label text-ink-3">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
