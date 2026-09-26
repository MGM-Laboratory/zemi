'use client';

import { Check, ChevronRight } from 'lucide-react';
import { DropdownMenu as RMenu } from 'radix-ui';
import Link from 'next/link';
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';

export const DropdownMenu = RMenu.Root;
export const DropdownMenuTrigger = RMenu.Trigger;
export const DropdownMenuGroup = RMenu.Group;
export const DropdownMenuSub = RMenu.Sub;
export const DropdownMenuRadioGroup = RMenu.RadioGroup;

const surface =
  'z-[70] min-w-[12rem] overflow-hidden rounded-2xl border border-line bg-white p-1 shadow-[var(--shadow-3)] outline-none origin-[var(--radix-dropdown-menu-content-transform-origin)] data-[state=open]:animate-[zemi-pop_150ms_var(--ease-out)]';

const itemBase =
  'relative flex cursor-pointer select-none items-center gap-2.5 rounded-xl px-2.5 py-2 text-[0.9375rem] text-ink outline-none data-[highlighted]:bg-surface-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-3';

export const DropdownMenuContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof RMenu.Content>>(function DropdownMenuContent(
  { className, sideOffset = 6, align = 'end', collisionPadding = 12, ...props },
  ref,
) {
  return (
    <RMenu.Portal>
      <RMenu.Content ref={ref} sideOffset={sideOffset} align={align} collisionPadding={collisionPadding} className={cn(surface, className)} {...props} />
    </RMenu.Portal>
  );
});

export interface DropdownMenuItemProps extends Omit<ComponentPropsWithoutRef<typeof RMenu.Item>, 'asChild'> {
  icon?: ReactNode;
  shortcut?: string;
  destructive?: boolean;
  /** Render as a link. */
  href?: string;
  /** Open `href` in a new tab. */
  external?: boolean;
}

export const DropdownMenuItem = forwardRef<HTMLDivElement, DropdownMenuItemProps>(function DropdownMenuItem(
  { className, icon, shortcut, destructive, href, external, children, ...props },
  ref,
) {
  const cls = cn(itemBase, destructive && 'text-red-600 data-[highlighted]:bg-red-50 [&_svg]:text-red-600', className);
  const inner = (
    <>
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut ? <span className="mono text-xs text-ink-3">{shortcut}</span> : null}
    </>
  );
  if (href) {
    return (
      <RMenu.Item ref={ref} className={cls} asChild {...props}>
        {external ? (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {inner}
          </a>
        ) : (
          <Link href={href}>{inner}</Link>
        )}
      </RMenu.Item>
    );
  }
  return (
    <RMenu.Item ref={ref} className={cls} {...props}>
      {inner}
    </RMenu.Item>
  );
});

export const DropdownMenuCheckboxItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof RMenu.CheckboxItem>>(
  function DropdownMenuCheckboxItem({ className, children, ...props }, ref) {
    return (
      <RMenu.CheckboxItem ref={ref} className={cn(itemBase, 'pl-8', className)} onSelect={(e) => e.preventDefault()} {...props}>
        <RMenu.ItemIndicator className="absolute left-2.5 flex items-center">
          <Check className="!text-blue" strokeWidth={2.5} />
        </RMenu.ItemIndicator>
        {children}
      </RMenu.CheckboxItem>
    );
  },
);

export const DropdownMenuRadioItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof RMenu.RadioItem>>(function DropdownMenuRadioItem(
  { className, children, ...props },
  ref,
) {
  return (
    <RMenu.RadioItem ref={ref} className={cn(itemBase, 'pl-8', className)} {...props}>
      <RMenu.ItemIndicator className="absolute left-3 flex items-center">
        <span className="size-2 rounded-full bg-blue" />
      </RMenu.ItemIndicator>
      {children}
    </RMenu.RadioItem>
  );
});

export function DropdownMenuLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <RMenu.Label className={cn('label px-2.5 pt-2 pb-1 text-ink-3', className)}>{children}</RMenu.Label>;
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <RMenu.Separator className={cn('mx-1 my-1 h-px bg-line', className)} />;
}

export function DropdownMenuSubTrigger({ children, icon, className }: { children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <RMenu.SubTrigger className={cn(itemBase, 'data-[state=open]:bg-surface-muted', className)}>
      {icon}
      <span className="flex-1">{children}</span>
      <ChevronRight />
    </RMenu.SubTrigger>
  );
}

export const DropdownMenuSubContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof RMenu.SubContent>>(function DropdownMenuSubContent(
  { className, ...props },
  ref,
) {
  return (
    <RMenu.Portal>
      <RMenu.SubContent ref={ref} sideOffset={4} className={cn(surface, className)} {...props} />
    </RMenu.Portal>
  );
});
