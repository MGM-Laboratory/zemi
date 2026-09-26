'use client';

import { parseTicketPayload } from '@zemi/shared';
import { Keyboard } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/admin/ui/button';
import { Dialog } from '@/components/admin/ui/dialog';
import { cn } from '@/lib/admin/cn';

/** Characters a ticket code can hold (no 0/O, 1/I lookalikes). */
const CODE_CHARS = /[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g;

/** Normalize whatever was typed or pasted into a scan payload (code, ticket URL or token). */
export function normalizeManual(raw: string): { payload: string | null; code: string } {
  const s = raw.trim();
  if (/^https?:\/\//i.test(s) || s.includes('/t/') || s.includes('/tickets/')) {
    return { payload: parseTicketPayload(s) ? s : null, code: '' };
  }
  const code = s.toUpperCase().replace(/^ZM-?/, '').replace(CODE_CHARS, '').slice(0, 6);
  return { payload: code.length === 6 ? `ZM-${code}` : null, code };
}

/**
 * "Type a code" fallback for cracked screens, printed tickets with smudged QR, or no camera.
 * Accepts the 6 characters after ZM-, a full ticket link, or a pasted token.
 */
export function ManualEntry({
  open,
  onOpenChange,
  onSubmit,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: string) => void;
  busy?: boolean;
}) {
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { payload, code } = normalizeManual(value);
  const isLink = value.includes('/');

  // Empty field every time it opens (state adjusted on the prop change), then focus it.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValue('');
      setTouched(false);
    }
  }
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => input.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!payload) return;
    onSubmit(payload);
  };

  const error = touched && !payload ? (isLink ? "That link isn't a Zemi ticket." : 'Ticket codes have 6 characters after ZM-.') : null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      accent="blue"
      title="Type a ticket code"
      description="It sits under the QR on their ticket, like ZM-7K3F9Q. Links work too."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Back to the camera
          </Button>
          <Button variant="primary" type="submit" form="zemi-manual-code" loading={busy} disabled={!payload}>
            Check them in
          </Button>
        </>
      }
    >
      <form id="zemi-manual-code" onSubmit={submit} noValidate>
        <label htmlFor="zemi-code-input" className="sr-only">
          Ticket code
        </label>
        <div
          className={cn(
            'flex h-16 items-center rounded-[var(--radius-input,14px)] border bg-white px-4 transition-[border-color,box-shadow] focus-within:border-blue focus-within:ring-4 focus-within:ring-blue/15',
            error ? 'border-red-600' : 'border-line-strong',
          )}
        >
          {!isLink ? <span className="mono mr-1 text-2xl font-semibold text-ink-3 select-none">ZM-</span> : <Keyboard className="mr-2 size-5 text-ink-4" aria-hidden="true" />}
          <input
            ref={input}
            id="zemi-code-input"
            value={isLink ? value : code}
            onChange={(e) => setValue(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              if (text) {
                e.preventDefault();
                setValue(text);
              }
            }}
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'zemi-code-error' : 'zemi-code-hint'}
            placeholder={isLink ? '' : '7K3F9Q'}
            className="mono min-w-0 flex-1 bg-transparent text-2xl font-semibold tracking-[0.12em] text-ink uppercase outline-none placeholder:text-ink-4/60"
          />
          {!isLink ? <span className="mono ml-2 text-sm text-ink-3 tabular-nums">{code.length}/6</span> : null}
        </div>
        {error ? (
          <p id="zemi-code-error" className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : (
          <p id="zemi-code-hint" className="mt-2 text-sm text-ink-3">
            Codes skip 0, 1, I and O, so there is no guessing.
          </p>
        )}
      </form>
    </Dialog>
  );
}
