'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import Link from 'next/link';
import { Slot } from 'radix-ui';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import type { ShapeName } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { ZemiMark } from '@/components/brand/zemi-mark';
import { Magnetic } from '@/components/motion/magnetic';
import { cn } from '@/lib/utils';
import styles from './ui.module.css';

export const buttonVariants = cva(
  [
    styles.btn,
    'relative inline-flex select-none items-center justify-center gap-[0.6em] whitespace-nowrap rounded-full font-body font-bold',
    'transition-[background-color,color,border-color,transform,box-shadow] duration-200 ease-[cubic-bezier(.22,1,.36,1)]',
    'active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    'focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-ink text-white hover:bg-[#1c2230] shadow-[0_1px_0_rgb(255_255_255/0.08)_inset]',
        secondary: 'bg-white text-ink border border-line-strong hover:border-ink hover:bg-surface-muted',
        ghost: 'bg-transparent text-ink hover:bg-ink/[0.06]',
        paper: 'bg-white text-ink hover:bg-ink-inverse',
        outlinePaper: 'bg-transparent text-white border border-white/35 hover:border-white hover:bg-white/10',
        accent: 'bg-blue text-white hover:bg-blue-600',
        danger: 'bg-red-600 text-white hover:bg-[#b82424]',
      },
      size: {
        sm: 'h-10 px-4 text-[0.9375rem]',
        md: 'h-12 px-6 text-base',
        lg: 'h-14 px-7 text-[1.0625rem] sm:h-16 sm:px-8 sm:text-lg',
        icon: 'size-12 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

type Variant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;

interface CommonProps extends VariantProps<typeof buttonVariants> {
  children?: ReactNode;
  className?: string;
  /** Brand shape shown after the label; it spins on hover. `false` hides it. Primary defaults to a right-pointing triangle. */
  shape?: ShapeName | false;
  /** Any icon before the label (lucide etc). */
  icon?: ReactNode;
  /** Shows the loading mark and disables the button. */
  loading?: boolean;
  /** Magnetic hover pull. Default true for primary. */
  magnetic?: boolean;
  /** Custom cursor label: play, drag, open, register. */
  cursor?: 'play' | 'drag' | 'open' | 'register';
}

export type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
    href?: undefined;
    asChild?: boolean;
    ref?: Ref<HTMLButtonElement>;
  };

export type ButtonLinkProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'href'> & {
    href: string;
    /** Opens in a new tab with safe rel. Auto for absolute http(s) URLs. */
    external?: boolean;
    ref?: Ref<HTMLAnchorElement>;
  };

const defaultShape = (variant: Variant | null | undefined): ShapeName | false =>
  variant === 'primary' || variant === undefined || variant === null || variant === 'accent' || variant === 'paper'
    ? 'triangle'
    : false;

function Inner({
  children,
  icon,
  shape,
  loading,
  variant,
}: Pick<CommonProps, 'children' | 'icon' | 'loading' | 'variant'> & { shape: ShapeName | false }) {
  const onDark = variant === 'primary' || variant === 'accent' || variant === 'danger' || variant === 'outlinePaper';
  return (
    <>
      {loading ? (
        <ZemiMark variant="loading" size="1.15em" decorative tone={onDark ? 'paper' : 'color'} />
      ) : icon ? (
        <span className="inline-flex size-[1.1em] items-center justify-center" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children != null ? <span className={styles.btnLabel}>{children}</span> : null}
      {shape && !loading ? (
        <ShapeIcon
          shape={shape}
          size="0.72em"
          color={variant === 'secondary' || variant === 'ghost' ? 'brand' : 'current'}
          className={styles.btnShape}
          style={shape === 'triangle' ? { rotate: '90deg' } : undefined}
        />
      ) : null}
    </>
  );
}

/**
 * Public button. Primary is the ink pill with a spinning shape; pass `href` to render a Link.
 *
 * @example <Button size="lg">Save my seat</Button>
 * @example <Button href="/events" variant="secondary" shape="circle">All Fridays</Button>
 * @example <Button loading>Sending</Button>
 */
export function Button(props: ButtonProps | ButtonLinkProps) {
  const { variant, size, className, shape, icon, loading, magnetic, cursor, children } = props;
  const resolvedShape = shape === undefined ? defaultShape(variant) : shape;
  const cls = cn(buttonVariants({ variant, size }), className);
  const useMagnet = magnetic ?? (variant === 'primary' || variant === undefined);
  const inner = <Inner icon={icon} shape={resolvedShape} loading={loading} variant={variant}>{children}</Inner>;

  let node: ReactNode;
  if ('href' in props && props.href !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { href, external, variant: _v, size: _s, className: _c, shape: _sh, icon: _i, loading: _l, magnetic: _m, cursor: _cu, children: _ch, ref, ...rest } = props;
    const isExternal = external ?? /^https?:\/\//.test(href);
    node = isExternal ? (
      <a ref={ref} href={href} className={cls} target="_blank" rel="noopener noreferrer" data-cursor={cursor ?? 'open'} {...rest}>
        {inner}
      </a>
    ) : (
      <Link ref={ref} href={href} className={cls} data-cursor={cursor} {...rest}>
        {inner}
      </Link>
    );
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { asChild, variant: _v, size: _s, className: _c, shape: _sh, icon: _i, loading: _l, magnetic: _m, cursor: _cu, children: _ch, ref, type, disabled, ...rest } = props as ButtonProps;
    const Comp = asChild ? Slot.Root : 'button';
    node = (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        className={cls}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        data-loading={loading ? '' : undefined}
        data-cursor={cursor}
        {...rest}
      >
        {asChild ? children : inner}
      </Comp>
    );
  }

  return useMagnet ? (
    <Magnetic strength={0.28} padding={0}>
      {node}
    </Magnetic>
  ) : (
    node
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Required: what the button does, read by screen readers. */
  label: string;
  children: ReactNode;
  variant?: Variant;
  size?: 'sm' | 'md';
  ref?: Ref<HTMLButtonElement>;
}

/** Round icon-only button with an accessible label. */
export function IconButton({ label, children, variant = 'secondary', size = 'md', className, ref, type, ...rest }: IconButtonProps) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      className={cn(buttonVariants({ variant, size: 'icon' }), size === 'sm' && 'size-10', className)}
      {...rest}
    >
      <span className="inline-flex size-5 items-center justify-center" aria-hidden="true">
        {children}
      </span>
    </button>
  );
}
