import type { ReactNode } from 'react';
import type { ShapeName } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { CaslHeading, type DisplaySize } from '@/components/motion/casl-heading';
import { cn } from '@/lib/utils';

export interface EyebrowProps {
  children: ReactNode;
  shape?: ShapeName | false;
  className?: string;
  /** Paper tone for dark sections. */
  inverse?: boolean;
}

/** Mono uppercase label with a tiny shape. */
export function Eyebrow({ children, shape = 'circle', className, inverse }: EyebrowProps) {
  return (
    <p className={cn('label inline-flex items-center gap-2', inverse ? 'text-ink-inverse/70' : 'text-ink-3', className)}>
      {shape ? <ShapeIcon shape={shape} size="0.95em" /> : null}
      <span>{children}</span>
    </p>
  );
}

export interface SectionHeaderProps {
  eyebrow?: ReactNode;
  eyebrowShape?: ShapeName | false;
  title: ReactNode;
  /** Heading level. Default h2. */
  as?: 'h1' | 'h2' | 'h3';
  size?: DisplaySize;
  description?: ReactNode;
  /** Right side (desktop) / below (mobile): usually a Button. */
  action?: ReactNode;
  align?: 'start' | 'center';
  /** Masked line reveal on the title. Default true. */
  reveal?: boolean;
  inverse?: boolean;
  className?: string;
  id?: string;
}

/**
 * Eyebrow + CaslHeading + optional description and action.
 * @example <SectionHeader eyebrow="Coming up" title="This Friday" action={<Button href="/events">All Fridays</Button>} />
 */
export function SectionHeader({
  eyebrow,
  eyebrowShape = 'circle',
  title,
  as = 'h2',
  size = 'l',
  description,
  action,
  align = 'start',
  reveal = true,
  inverse,
  className,
  id,
}: SectionHeaderProps) {
  const center = align === 'center';
  return (
    <header
      className={cn(
        'flex flex-col gap-6 md:flex-row md:items-end md:justify-between',
        center && 'items-center text-center md:flex-col md:items-center',
        className,
      )}
    >
      <div className={cn('flex max-w-[52rem] flex-col gap-4', center && 'items-center')}>
        {eyebrow ? (
          <Eyebrow shape={eyebrowShape} inverse={inverse}>
            {eyebrow}
          </Eyebrow>
        ) : null}
        <CaslHeading as={as} size={size} reveal={reveal} id={id} className={inverse ? 'text-ink-inverse' : 'text-ink'}>
          {title}
        </CaslHeading>
        {description ? (
          <div className={cn('text-body-l max-w-[40rem]', inverse ? 'text-ink-inverse/75' : 'text-ink-2')}>{description}</div>
        ) : null}
      </div>
      {action ? <div className="flex-none">{action}</div> : null}
    </header>
  );
}
