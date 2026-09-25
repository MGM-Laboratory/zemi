'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';
import { Spinner } from './spinner';
import { Tooltip } from './tooltip';

export const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[var(--ease-out)]',
    'active:scale-[0.96] disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
    '[&_svg:not([class*=size-])]:size-[1.1em]',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-ink text-white shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)] hover:bg-ink-2',
        secondary: 'border border-line-strong bg-white text-ink hover:border-ink-4 hover:bg-surface-muted',
        ghost: 'text-ink-2 hover:bg-surface-muted hover:text-ink',
        danger: 'bg-red-600 text-white hover:bg-[#c02525]',
        'danger-soft': 'bg-red-50 text-red-600 hover:bg-[#fdd3d3]',
        blue: 'bg-blue text-white hover:bg-blue-600',
        link: 'h-auto rounded-md px-0 text-blue underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        xs: 'h-7 px-2.5 text-[0.8125rem]',
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-[0.9375rem]',
        lg: 'h-12 px-6 text-base',
      },
      fullWidth: { true: 'w-full' },
    },
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0' }],
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Shows a spinner, keeps the width, disables the button and sets aria-busy. */
  loading?: boolean;
  /** Leading icon (any 16 to 20px svg). */
  icon?: ReactNode;
  /** Trailing icon. */
  iconRight?: ReactNode;
  /** Render the child element (a Link, an anchor) with button styles. */
  asChild?: boolean;
}

/**
 * Buttons say what happens: "Save event", "Send tickets", never "Submit".
 *
 * @example <Button variant="primary" icon={<Plus />} loading={save.isPending}>Save event</Button>
 * @example <Button asChild variant="ghost"><Link href="/admin/events">All events</Link></Button>
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, fullWidth, loading = false, icon, iconRight, asChild = false, disabled, children, type, ...props },
  ref,
) {
  const classes = cn(buttonVariants({ variant, size, fullWidth }), className);
  if (asChild) {
    return (
      <Slot.Root ref={ref} className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  const spinnerTone = variant === 'primary' || variant === 'danger' || variant === 'blue' ? 'paper' : 'color';
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size={16} tone={spinnerTone} label={null} />
        </span>
      ) : null}
      <span className={cn('inline-flex items-center gap-2', loading && 'invisible')}>
        {icon}
        {children}
        {iconRight}
      </span>
    </button>
  );
});

const iconButtonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform,border-color] duration-150',
    'active:scale-[0.92] disabled:pointer-events-none disabled:opacity-45',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
    '[&_svg:not([class*=size-])]:size-[18px]',
  ],
  {
    variants: {
      variant: {
        ghost: 'text-ink-3 hover:bg-surface-muted hover:text-ink',
        secondary: 'border border-line-strong bg-white text-ink-2 hover:border-ink-4 hover:text-ink',
        primary: 'bg-ink text-white hover:bg-ink-2',
        danger: 'text-red-600 hover:bg-red-50',
      },
      size: { xs: 'size-7', sm: 'size-8', md: 'size-10', lg: 'size-12' },
    },
    defaultVariants: { variant: 'ghost', size: 'md' },
  },
);

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>,
    VariantProps<typeof iconButtonVariants> {
  /** Required: becomes aria-label and the tooltip. */
  label: string;
  children: ReactNode;
  /** Show the label as a tooltip on hover/focus. Default true. */
  tooltip?: boolean;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  loading?: boolean;
}

/** Icon-only button. Always has an accessible label and a tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, variant, size, className, tooltip = true, tooltipSide = 'top', loading, disabled, type, ...props },
  ref,
) {
  const btn = (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      className={cn(iconButtonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner size={16} tone={variant === 'primary' ? 'paper' : 'color'} label={null} /> : children}
    </button>
  );
  if (!tooltip) return btn;
  return (
    <Tooltip content={label} side={tooltipSide}>
      {btn}
    </Tooltip>
  );
});
