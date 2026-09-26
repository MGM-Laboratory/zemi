'use client';

import { Check, Pencil } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/admin/ui/spinner';
import { cn } from '@/lib/admin/cn';

export interface InlineEditProps {
  value: string | null;
  /** Save the new text (trimmed, `null` when empty). Reject to stay in edit mode. */
  onSave: (next: string | null) => Promise<unknown>;
  /** Accessible name, like "Recording title". */
  label: string;
  placeholder: string;
  maxLength?: number;
  readOnly?: boolean;
  /** Shown when read-only and empty. */
  emptyText?: string;
  className?: string;
  textClassName?: string;
  inputClassName?: string;
}

/**
 * Click-to-edit text. Enter or blur saves, Escape cancels. Shows a spinner while saving and a
 * tiny check when done. Used for recording titles and documentation captions.
 */
export function InlineEdit({
  value,
  onSave,
  label,
  placeholder,
  maxLength = 200,
  readOnly,
  emptyText,
  className,
  textClassName,
  inputClassName,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const cancelled = useRef(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = async () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const next = draft.trim() || null;
    if (next === (value?.trim() || null)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 1400);
      requestAnimationFrame(() => buttonRef.current?.focus());
    } catch {
      // The mutation shows the error; stay here so nothing typed is lost.
      requestAnimationFrame(() => inputRef.current?.focus());
    } finally {
      setSaving(false);
    }
  };

  if (readOnly) {
    return (
      <span className={cn('block min-w-0 truncate', !value && 'text-ink-4', textClassName, className)}>{value || emptyText || placeholder}</span>
    );
  }

  if (editing) {
    return (
      <span className={cn('relative flex min-w-0 items-center', className)}>
        <input
          ref={inputRef}
          value={draft}
          maxLength={maxLength}
          aria-label={label}
          placeholder={placeholder}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              cancelled.current = true;
              setDraft(value ?? '');
              setEditing(false);
              requestAnimationFrame(() => buttonRef.current?.focus());
            }
          }}
          className={cn(
            'h-9 w-full min-w-0 rounded-[10px] border border-blue bg-white px-2.5 pr-9 text-[0.9375rem] text-ink shadow-[0_0_0_4px_rgba(58,109,197,0.14)] outline-none',
            inputClassName,
          )}
        />
        <span className="pointer-events-none absolute right-2.5 flex items-center text-[0.6875rem] text-ink-4">
          {saving ? <Spinner size={14} label={null} /> : maxLength - draft.length <= 20 ? maxLength - draft.length : null}
        </span>
      </span>
    );
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => {
        cancelled.current = false;
        setDraft(value ?? '');
        setEditing(true);
      }}
      aria-label={`${label}: ${value || 'empty'}. Edit`}
      className={cn(
        'group/inline -mx-1.5 flex max-w-full min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-left transition-colors hover:bg-surface-muted',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
        className,
      )}
    >
      <span className={cn('min-w-0 truncate', !value && 'text-ink-4 italic', textClassName)}>{value || placeholder}</span>
      <AnimatePresence mode="wait" initial={false}>
        {saved ? (
          <motion.span key="ok" initial={{ scale: 0.3, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ opacity: 0 }} className="flex shrink-0 text-green">
            <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
          </motion.span>
        ) : (
          <motion.span
            key="pen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex shrink-0 text-ink-4 opacity-60 transition-[opacity,transform] group-hover/inline:rotate-[-12deg] group-hover/inline:opacity-100 group-focus-visible/inline:opacity-100"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
