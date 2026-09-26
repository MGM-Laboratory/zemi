'use client';

import { Copy, Dices, Eye, EyeOff, PencilLine } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Input, SegmentedControl, notify, useCopy } from '@/components/admin/ui';
import { api, errorMessage } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';

/* ------------------------------------------------------------------ strength */

export interface Strength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  tip: string;
}

const WEAK_BITS = ['password', 'passphrase', 'qwerty', 'zemi', 'admin', 'letmein', '123456', 'friday', 'labmgm'];

/**
 * A rough, honest strength estimate. Word-style passphrases (friday-coffee-hypothesis-42) are
 * scored by words; everything else by length and character mix. Penalties for repeats,
 * keyboard runs and the obvious words.
 */
export function passphraseStrength(p: string): Strength {
  if (!p) return { score: 0, label: 'Empty', tip: 'Type one, or roll the dice.' };
  if (p.trim() !== p) return { score: 0, label: 'Oops', tip: 'No spaces at the start or end.' };
  if (p.length < 12) return { score: 0, label: 'Too short', tip: `${12 - p.length} more ${12 - p.length === 1 ? 'character' : 'characters'} to go. 12 at least.` };
  const words = p.split(/[\s\-_.,+]+/).filter((w) => w.length >= 3);
  let bits: number;
  if (words.length >= 3) {
    bits = words.length * 11 + (/\d/.test(p) ? 6 : 0) + (/[A-Z]/.test(p) ? 3 : 0);
  } else {
    let pool = 0;
    if (/[a-z]/.test(p)) pool += 26;
    if (/[A-Z]/.test(p)) pool += 26;
    if (/\d/.test(p)) pool += 10;
    if (/[^a-zA-Z0-9]/.test(p)) pool += 33;
    bits = p.length * Math.log2(Math.max(pool, 2)) * 0.62;
  }
  const lower = p.toLowerCase();
  if (/(.)\1{3,}/.test(p)) bits -= 18;
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|qwer|asdf|zxcv)/.test(lower)) bits -= 14;
  if (WEAK_BITS.some((w) => lower.includes(w))) bits -= 12;
  if (bits < 40) return { score: 1, label: 'Guessable', tip: 'Add a couple of unrelated words. Length beats symbols.' };
  if (bits < 55) return { score: 2, label: 'Okay', tip: 'One more random word would make it solid.' };
  if (bits < 75) return { score: 3, label: 'Strong', tip: 'Good. Hard to guess, easy to type.' };
  return { score: 4, label: 'Very strong', tip: 'Excellent. Nobody is guessing that.' };
}

const METER_TONES = ['bg-line-strong', 'bg-red', 'bg-yellow', 'bg-green', 'bg-green'] as const;

export function StrengthMeter({ value, className }: { value: string; className?: string }) {
  const s = passphraseStrength(value);
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
            <motion.span
              className={cn('block h-full rounded-full', METER_TONES[s.score])}
              initial={false}
              animate={{ width: s.score >= i ? '100%' : '0%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          </span>
        ))}
      </div>
      <p className="text-[0.8125rem] text-ink-3" aria-live="polite">
        <span className="font-semibold text-ink-2">{s.label}.</span> {s.tip}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ scramble */

const SCRAMBLE = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Slot-machine reveal: each character spins through random letters, then settles left to right.
 * Dashes stay put so the words keep their shape. Screen readers get the plain text.
 */
export function ScrambleText({ text, className }: { text: string; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(text);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (reduce || !text) return;
    const start = performance.now();
    const settleAt = (i: number) => 160 + i * 22;
    const tick = (now: number) => {
      const t = now - start;
      let done = true;
      const out = text
        .split('')
        .map((ch, i) => {
          if (ch === '-' || ch === ' ' || t >= settleAt(i)) return ch;
          done = false;
          return SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)]!;
        })
        .join('');
      setShown(out);
      if (!done) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [text, reduce]);

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{reduce || !text ? text : shown}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ field */

export interface PassphraseFieldProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  /** Fetch a generated one on mount when empty. Default true. */
  autoGenerate?: boolean;
  id?: string;
}

/**
 * Passphrase picker: roll a generated one (GET /admin/passphrase/generate, four themed words and
 * two digits) with a shuffle animation, or type your own with a strength meter. The value lives in
 * component state only, never in the URL, the query cache or logs.
 */
export function PassphraseField({ value, onChange, error, autoGenerate = true, id }: PassphraseFieldProps) {
  const [mode, setMode] = useState<'generate' | 'custom'>('generate');
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(true);
  const [spins, setSpins] = useState(0);
  const [copy, copied] = useCopy();
  const reduce = useReducedMotion();
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });

  const roll = useCallback(async () => {
    setLoading(true);
    setSpins((s) => s + 1);
    try {
      const res = await api.get<{ passphrase: string }>('/admin/passphrase/generate');
      onChange(res.passphrase);
    } catch (err) {
      notify.error(`${errorMessage(err)} You can type one instead.`);
    } finally {
      setLoading(false);
    }
  }, [onChange]);

  const didAuto = useRef(false);
  useEffect(() => {
    if (!autoGenerate || didAuto.current || valueRef.current) return;
    didAuto.current = true;
    void roll();
  }, [autoGenerate, roll]);

  const switchMode = (m: 'generate' | 'custom') => {
    setMode(m);
    if (m === 'custom') onChange('');
    else void roll();
  };

  return (
    <div className="space-y-3">
      <SegmentedControl
        aria-label="How to pick the passphrase"
        value={mode}
        onValueChange={switchMode}
        size="sm"
        options={[
          { value: 'generate', label: 'Generate one', icon: <Dices /> },
          { value: 'custom', label: 'Type my own', icon: <PencilLine /> },
        ]}
      />
      {mode === 'generate' ? (
        <div
          className={cn(
            'relative overflow-hidden rounded-2xl border bg-[linear-gradient(var(--color-graph)_1px,transparent_1px),linear-gradient(90deg,var(--color-graph)_1px,transparent_1px)] bg-[size:24px_24px] p-4 sm:p-5',
            error ? 'border-red-600' : 'border-line',
          )}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <p id={id} className="mono min-h-[1.75rem] min-w-0 flex-1 text-[clamp(1.05rem,2.2vw,1.35rem)] font-semibold tracking-tight break-all text-ink" aria-live="polite">
              {value ? <ScrambleText text={value} /> : <span className="text-ink-3">{loading ? 'Rolling...' : 'Nothing yet'}</span>}
            </p>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void roll()}
                loading={false}
                disabled={loading}
                icon={
                  <motion.span animate={reduce ? undefined : { rotate: spins * 360 }} transition={{ type: 'spring', stiffness: 160, damping: 14 }} className="inline-flex">
                    <Dices />
                  </motion.span>
                }
              >
                Roll again
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Copy />}
                disabled={!value}
                onClick={() => void copy(value).then((ok) => (ok ? notify.success('Copied. Paste it somewhere safe.') : notify.error("Couldn't copy. Select it and copy by hand.")))}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
          <p className="mt-2 text-[0.8125rem] text-ink-3">Four words and two digits. Easy to say out loud, hard to guess.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            type={visible ? 'text' : 'password'}
            autoComplete="new-password"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            mono
            placeholder="at-least-twelve-characters"
            aria-invalid={error ? true : undefined}
            trailing={
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? 'Hide passphrase' : 'Show passphrase'}
                className="flex size-7 items-center justify-center rounded-full text-ink-3 transition hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
              >
                {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            }
          />
          <StrengthMeter value={value} />
        </div>
      )}
      {error ? (
        <p className="text-[0.8125rem] font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
