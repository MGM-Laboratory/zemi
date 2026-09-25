'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Select as RSelect } from 'radix-ui';
import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';
import { useFieldControlProps } from './field';
import { controlClass, controlSizes, type ControlSize } from './input';

export interface SelectOption<V extends string = string> {
  value: V;
  label: ReactNode;
  /** Plain text for type-ahead when `label` is not a string. */
  textValue?: string;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SelectGroup<V extends string = string> {
  label: string;
  options: SelectOption<V>[];
}

export interface SelectProps<V extends string = string> {
  value: V | null | undefined;
  onValueChange: (value: V | null) => void;
  options: Array<SelectOption<V> | SelectGroup<V>>;
  placeholder?: string;
  /** Adds a "None" item that sets null. Pass the label, like "No room yet". */
  clearable?: string | boolean;
  size?: ControlSize;
  disabled?: boolean;
  readOnly?: boolean;
  id?: string;
  name?: string;
  className?: string;
  contentClassName?: string;
  'aria-label'?: string;
}

const NONE = '__zemi_none__';

function isGroup<V extends string>(o: SelectOption<V> | SelectGroup<V>): o is SelectGroup<V> {
  return 'options' in o;
}

/**
 * Accessible select (Radix). Works inside `<Field>`.
 * @example <Select value={mode} onValueChange={setMode} options={[{ value: 'hybrid', label: 'Hybrid' }]} />
 */
export function Select<V extends string = string>({
  value,
  onValueChange,
  options,
  placeholder = 'Pick one',
  clearable,
  size = 'md',
  disabled,
  readOnly,
  id,
  name,
  className,
  contentClassName,
  'aria-label': ariaLabel,
}: SelectProps<V>) {
  const aria = useFieldControlProps({ id, disabled, readOnly });
  const flat = options.flatMap((o) => (isGroup(o) ? o.options : [o]));
  const current = flat.find((o) => o.value === value);
  const locked = aria.disabled || aria.readOnly;

  return (
    <RSelect.Root
      value={value ?? ''}
      onValueChange={(v) => onValueChange(v === NONE ? null : (v as V))}
      disabled={locked}
      name={name}
    >
      <SelectTrigger
        id={aria.id}
        aria-describedby={aria['aria-describedby']}
        aria-invalid={aria['aria-invalid']}
        aria-label={ariaLabel}
        size={size}
        readOnly={Boolean(aria.readOnly)}
        className={className}
      >
        <span className="flex min-w-0 items-center gap-2">
          {current?.icon ? <span className="flex shrink-0 items-center text-ink-3 [&_svg]:size-4">{current.icon}</span> : null}
          <RSelect.Value placeholder={<span className="text-ink-4">{placeholder}</span>} />
        </span>
      </SelectTrigger>
      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            'z-[70] max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl border border-line bg-white p-1 shadow-[var(--shadow-3)]',
            'origin-[var(--radix-select-content-transform-origin)] animate-[zemi-pop_160ms_var(--ease-out)]',
            contentClassName,
          )}
        >
          <RSelect.Viewport className="p-0.5">
            {clearable ? (
              <SelectItem value={NONE} textValue={typeof clearable === 'string' ? clearable : 'None'}>
                <span className="text-ink-3">{typeof clearable === 'string' ? clearable : 'None'}</span>
              </SelectItem>
            ) : null}
            {options.map((o, i) =>
              isGroup(o) ? (
                <RSelect.Group key={`g${i}`}>
                  <RSelect.Label className="label px-2.5 pt-2.5 pb-1 text-ink-4">{o.label}</RSelect.Label>
                  {o.options.map((opt) => (
                    <OptionItem key={opt.value} opt={opt} />
                  ))}
                </RSelect.Group>
              ) : (
                <OptionItem key={o.value} opt={o} />
              ),
            )}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

function OptionItem<V extends string>({ opt }: { opt: SelectOption<V> }) {
  return (
    <SelectItem value={opt.value} disabled={opt.disabled} textValue={opt.textValue ?? (typeof opt.label === 'string' ? opt.label : opt.value)}>
      <span className="flex min-w-0 items-start gap-2.5">
        {opt.icon ? <span className="mt-0.5 flex shrink-0 items-center text-ink-3 [&_svg]:size-4">{opt.icon}</span> : null}
        <span className="min-w-0">
          <RSelect.ItemText>{opt.label}</RSelect.ItemText>
          {opt.description ? <span className="block text-[0.8125rem] leading-snug text-ink-3">{opt.description}</span> : null}
        </span>
      </span>
    </SelectItem>
  );
}

const SelectItem = forwardRef<HTMLDivElement, { value: string; disabled?: boolean; textValue?: string; children: ReactNode }>(function SelectItem(
  { children, ...props },
  ref,
) {
  return (
    <RSelect.Item
      ref={ref}
      {...props}
      className={cn(
        'relative flex cursor-pointer select-none items-center justify-between gap-3 rounded-xl py-2 pr-8 pl-2.5 text-[0.9375rem] text-ink outline-none',
        'data-[highlighted]:bg-surface-muted data-[state=checked]:font-semibold data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
      )}
    >
      {children}
      <RSelect.ItemIndicator className="absolute right-2.5 flex items-center text-blue">
        <Check className="size-4" strokeWidth={2.5} />
      </RSelect.ItemIndicator>
    </RSelect.Item>
  );
});

const SelectTrigger = forwardRef<
  HTMLButtonElement,
  {
    id?: string;
    size: ControlSize;
    readOnly: boolean;
    className?: string;
    children: ReactNode;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling';
    'aria-label'?: string;
  }
>(function SelectTrigger({ size, readOnly, className, children, ...props }, ref) {
  return (
    <RSelect.Trigger
      ref={ref}
      {...props}
      className={cn(
        controlClass,
        controlSizes[size],
        'flex cursor-pointer items-center justify-between gap-2 text-left data-[placeholder]:text-ink-4',
        'data-[state=open]:border-blue data-[state=open]:ring-4 data-[state=open]:ring-blue/15',
        readOnly && 'cursor-default bg-surface-muted disabled:text-ink',
        className,
      )}
    >
      {children}
      {readOnly ? null : (
        <RSelect.Icon className="shrink-0 text-ink-4">
          <ChevronDown className="size-4" />
        </RSelect.Icon>
      )}
    </RSelect.Trigger>
  );
});
