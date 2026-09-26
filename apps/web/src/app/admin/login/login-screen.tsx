'use client';

import type { Me } from '@zemi/shared';
import { formatJakarta } from '@zemi/shared';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { motion, useAnimate, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { AdminMark } from '@/components/admin/brand/admin-mark';
import { AdminWordmark } from '@/components/admin/brand/admin-wordmark';
import { Character, type CharacterMood } from '@/components/admin/characters/character';
import { adminFetch, formatWait, isApiError } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';

export type LoginReason = 'expired' | 'signed-out' | null;

type Phase = 'idle' | 'checking' | 'success' | 'error';

interface LoginError {
  kind: 'wrong' | 'expired' | 'disabled' | 'rate' | 'network' | 'other';
  message: string;
  retryAt?: number;
}

/**
 * Map the API's login errors to precise copy. Contract (see docs/foundation/web-admin.md):
 * 401 invalid_passphrase, 403 admin_expired (details.expiresAt), 403 admin_disabled,
 * 429 rate_limited (Retry-After header or details.retryAfterSec).
 */
function toLoginError(err: unknown): LoginError {
  if (!isApiError(err)) return { kind: 'other', message: 'Something went sideways. Try again in a moment.' };
  if (err.isNetwork) return { kind: 'network', message: "We can't reach the server. Check your connection and try again." };
  if (err.isRateLimited) {
    const sec = err.retryAfterSec ?? 60;
    return { kind: 'rate', message: 'Too many tries in a row. Take a breather.', retryAt: Date.now() + sec * 1000 };
  }
  const code = err.code.toLowerCase();
  if (code.includes('expired')) {
    const at = (err.details as { expiresAt?: string; expiredAt?: string } | undefined)?.expiresAt ?? (err.details as { expiredAt?: string } | undefined)?.expiredAt;
    return {
      kind: 'expired',
      message: at
        ? `Your access ended on ${formatJakarta(at, 'date')}. Ask the superadmin to extend it.`
        : 'Your access has ended. Ask the superadmin to extend it.',
    };
  }
  if (code.includes('disabled')) return { kind: 'disabled', message: "This passphrase was switched off. Ask the superadmin if that's a surprise." };
  if (err.status === 401 || err.status === 400 || code.includes('invalid')) {
    return { kind: 'wrong', message: "That passphrase didn't open the door. Check for typos and try again." };
  }
  // No JSON error body (the rewrite answering for an API that is down) or a gateway error: unreachable.
  if (err.status >= 502 || (err.status >= 500 && err.code === 'server_error')) {
    return { kind: 'network', message: "We can't reach the server right now. Give it a few seconds and try again." };
  }
  if (err.status >= 500) return { kind: 'other', message: 'The server tripped over something. Try again in a moment.' };
  return { kind: 'other', message: err.message };
}

export function LoginScreen({ next, reason }: { next: string; reason: LoginReason }) {
  const reduce = useReducedMotion() ?? false;
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [shown, setShown] = useState(false);
  const [focused, setFocused] = useState(false);
  const [caps, setCaps] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<LoginError | null>(null);
  const [shake, setShake] = useState(0);
  const [welcome, setWelcome] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [shakeScope, animateShake] = useAnimate<HTMLDivElement>();
  // autoFocus runs before hydration attaches onFocus, so read the real focus state on mount.
  useEffect(() => {
    if (document.activeElement === inputRef.current) setFocused(true);
  }, []);
  useEffect(() => {
    if (!shake || reduce || !shakeScope.current) return;
    void animateShake(shakeScope.current, { x: [0, -10, 9, -6, 4, 0] }, { duration: 0.42 });
  }, [shake, reduce, animateShake, shakeScope]);

  // Countdown for rate limiting.
  const waitMs = error?.retryAt ? Math.max(0, error.retryAt - now) : 0;
  useEffect(() => {
    if (!error?.retryAt) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [error?.retryAt]);
  useEffect(() => {
    if (error?.kind === 'rate' && waitMs === 0) setError(null);
  }, [error?.kind, waitMs]);

  const busy = phase === 'checking' || phase === 'success';
  const locked = busy || waitMs > 0;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (locked) return;
    const passphrase = value.trim();
    if (!passphrase) {
      setError({ kind: 'wrong', message: 'Type your passphrase first. It is the only key you need.' });
      setShake((n) => n + 1);
      inputRef.current?.focus();
      return;
    }
    setPhase('checking');
    setError(null);
    try {
      const started = Date.now();
      const me = await adminFetch<Partial<Me> | undefined>('/auth/login', { method: 'POST', body: { passphrase }, redirectOn401: false });
      // Let the loading mark do at least one turn so the moment registers.
      const elapsed = Date.now() - started;
      if (elapsed < 450) await new Promise((r) => setTimeout(r, 450 - elapsed));
      setWelcome(me?.principal?.name ?? null);
      setPhase('success');
      setTimeout(() => window.location.assign(next), reduce ? 200 : 1100);
    } catch (err) {
      const le = toLoginError(err);
      setError(le);
      setPhase('error');
      setShake((n) => n + 1);
      if (le.kind === 'wrong') {
        requestAnimationFrame(() => inputRef.current?.select());
      }
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') setCaps(e.getModifierState('CapsLock'));
  };

  // Q: peeks while typing, closes its eyes while the passphrase is hidden, cheers on success.
  const typing = focused && value.length > 0;
  const qMood: CharacterMood =
    phase === 'success' ? 'cheer' : phase === 'error' && error?.kind === 'wrong' ? 'oops' : typing ? (shown ? 'look' : 'closed') : 'idle';
  const caret = Math.min(1, value.length / 26);
  // Q stands at the right end of the field, so it looks left toward the caret.
  const qLook = qMood === 'look' ? { x: -1 + caret * 0.8, y: 0.85 } : null;
  const peek = phase === 'success' ? -20 : typing ? 0 : focused ? 6 : 12;

  const friendsMood = (i: number): CharacterMood => {
    if (phase === 'success') return 'cheer';
    if (phase === 'error' && error?.kind === 'wrong' && i === 0) return 'oops';
    if (phase === 'checking') return 'look';
    if (typing && !shown) return i === 1 ? 'closed' : 'look';
    return 'idle';
  };

  const banner =
    reason === 'expired'
      ? 'Your session ended. Log in again to pick up where you left off.'
      : reason === 'signed-out'
        ? "You're logged out. See you Friday."
        : null;

  return (
    <div className="zemi-admin relative grid min-h-dvh bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="relative flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 pt-5 sm:px-8 sm:pt-7">
        <Link href="/" className="-m-1 flex items-center gap-2.5 rounded-xl p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" aria-label="Zemi home">
          <AdminMark size={30} variant={phase === 'success' ? 'cheer' : 'idle'} />
          <AdminWordmark className="text-[1.55rem]" />
        </Link>
        <span className="label rounded-full bg-surface-muted px-2.5 py-1 text-ink-3">Studio</span>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pt-10 pb-16 sm:px-8">
        <div className="w-full max-w-[32rem]">
          <motion.h1
            className="font-display text-[clamp(2.5rem,7vw,4.25rem)] leading-[0.92] font-black tracking-[-0.045em] text-ink"
            // Same initial style on the server and the client: `reduce` is only known in the browser,
            // so branching `initial` on it made the SSR markup disagree for reduced-motion users.
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{ fontVariationSettings: `'CASL' ${phase === 'success' ? 1 : 0.15}` }}
            whileHover={reduce ? undefined : { fontVariationSettings: "'CASL' 1" }}
          >
            {phase === 'success' ? (welcome ? `Hey, ${welcome.split(' ')[0]}.` : 'Come on in.') : 'Knock knock.'}
          </motion.h1>
          <p className="mt-4 max-w-[26rem] text-[1.0625rem] leading-relaxed text-ink-3" aria-live="polite">
            {phase === 'success' ? 'Opening the studio. Coffee is on the left.' : "Type your passphrase. It's the only key you need, so keep it to yourself."}
          </p>

          {banner && phase !== 'success' ? (
            <div className="mt-6 flex items-center gap-3 rounded-2xl bg-surface-muted px-4 py-3 text-[0.9375rem] text-ink-2" role="status">
              <Character shape={reason === 'expired' ? 'square' : 'arch'} mood={reason === 'expired' ? 'sleep' : 'happy'} size={30} />
              {banner}
            </div>
          ) : null}

          <form onSubmit={submit} className="mt-10" noValidate>
            <label htmlFor={inputId} className="mb-2.5 block text-sm font-semibold text-ink">
              Passphrase
            </label>
            <div ref={shakeScope} className="relative">
              {/* Q sits behind the field and peeks over its top edge. */}
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute -top-[46px] right-[68px] z-0"
                animate={{ y: peek }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 22 }}
              >
                <Character shape="circle" mood={qMood} lookAt={qLook} follow={qMood === 'idle'} size={58} replayKey={shake} />
              </motion.div>
              <div
                className={cn(
                  'relative z-10 flex items-center rounded-[20px] border-[1.5px] bg-white transition-[border-color,box-shadow] duration-200',
                  error && phase === 'error' ? 'border-red-600 shadow-[0_0_0_5px_rgba(249,65,65,0.12)]' : focused ? 'border-blue shadow-[0_0_0_5px_rgba(58,109,197,0.14)]' : 'border-line-strong hover:border-ink-4',
                  phase === 'success' && 'border-green shadow-[0_0_0_5px_rgba(15,134,87,0.14)]',
                )}
              >
                <input
                  ref={inputRef}
                  id={inputId}
                  name="passphrase"
                  type={shown ? 'text' : 'password'}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    if (phase === 'error' && error?.kind !== 'rate') {
                      setPhase('idle');
                      setError(null);
                    }
                  }}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onKeyDown={onKey}
                  onKeyUp={onKey}
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  disabled={busy}
                  aria-invalid={Boolean(error) || undefined}
                  aria-describedby={`${inputId}-help`}
                  placeholder="friday-coffee-hypothesis-42"
                  className={cn(
                    'h-16 min-w-0 flex-1 rounded-[20px] bg-transparent pr-2 pl-5 text-xl text-ink outline-none placeholder:text-ink-4/70 disabled:text-ink-3 sm:h-[4.5rem] sm:text-[1.375rem]',
                    shown ? 'mono tracking-normal' : 'tracking-[0.12em]',
                  )}
                />
                <button
                  type="button"
                  onClick={() => {
                    setShown((s) => !s);
                    inputRef.current?.focus();
                  }}
                  aria-label={shown ? 'Hide passphrase' : 'Show passphrase'}
                  aria-pressed={shown}
                  aria-controls={inputId}
                  disabled={busy}
                  className="mr-2 flex size-12 shrink-0 items-center justify-center rounded-2xl text-ink-3 transition hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus active:scale-90"
                >
                  {shown ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
            </div>

            <div id={`${inputId}-help`} className="mt-3 min-h-[1.5rem] text-[0.9375rem]" aria-live="assertive">
              {error ? (
                <p className={cn('font-medium', error.kind === 'rate' ? 'text-ink-2' : 'text-red-600')}>
                  {error.message}
                  {error.kind === 'rate' && waitMs > 0 ? (
                    <>
                      {' '}
                      You can try again in <span className="mono font-semibold tabular-nums">{formatWait(waitMs / 1000)}</span>.
                    </>
                  ) : null}
                </p>
              ) : caps ? (
                <p className="flex items-center gap-2 font-medium text-[#7a5600]">
                  <span className="mono rounded-md bg-yellow-50 px-1.5 text-xs">⇪</span>
                  Caps Lock is on. Passphrases care about that.
                </p>
              ) : (
                <p className="text-ink-3">Press Enter to go in.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={locked}
              className={cn(
                'group relative mt-6 flex h-14 w-full items-center justify-center gap-3 overflow-hidden rounded-full text-[1.0625rem] font-semibold text-white transition-[background-color,transform] duration-200 active:scale-[0.98]',
                'focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus disabled:cursor-not-allowed',
                phase === 'success' ? 'bg-green' : 'bg-ink hover:bg-ink-2 disabled:bg-ink-3',
              )}
            >
              {phase === 'checking' ? (
                <>
                  <AdminMark size={22} variant="loading" tone="paper" />
                  <span>Checking the key</span>
                </>
              ) : phase === 'success' ? (
                <>
                  <AdminMark size={22} variant="cheer" tone="paper" />
                  <span>You&apos;re in</span>
                </>
              ) : waitMs > 0 ? (
                <span className="mono tabular-nums">Wait {formatWait(waitMs / 1000)}</span>
              ) : (
                <>
                  <span>Open the studio</span>
                  <ArrowRight className="size-5 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          <div className="mt-12 flex items-end justify-between gap-4 border-t border-line pt-5">
            <p className="max-w-[16rem] text-[0.8125rem] leading-snug text-ink-3">Lost your passphrase? The superadmin can give you a new one.</p>
            <div className="flex items-end gap-1.5 lg:hidden" aria-hidden="true">
              {(['triangle', 'square', 'arch'] as const).map((s, i) => (
                <motion.div
                  key={s}
                  animate={phase === 'success' && !reduce ? { y: [0, -14, 0] } : { y: 0 }}
                  transition={{ duration: 0.6, delay: 0.08 * (i + 1), ease: [0.22, 1, 0.36, 1] }}
                >
                  <Character shape={s} mood={friendsMood(i)} follow size={[34, 30, 36][i]} lookAt={phase === 'checking' ? { x: -0.9, y: -0.4 } : null} replayKey={shake} />
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </main>
      </div>
      <FridayPanel phase={phase} errorKind={error?.kind ?? null} typing={typing} shown={shown} />
    </div>
  );
}

/**
 * Desktop panel: the mark as a 2x2 of characters. Q's cell is empty (a dashed outline)
 * because Q wandered off to peek at the passphrase field.
 */
function FridayPanel({ phase, errorKind, typing, shown }: { phase: Phase; errorKind: LoginError['kind'] | null; typing: boolean; shown: boolean }) {
  const reduce = useReducedMotion() ?? false;
  const mood = (s: 'triangle' | 'square' | 'arch'): CharacterMood => {
    if (phase === 'success') return 'cheer';
    if (phase === 'error' && errorKind === 'wrong') return s === 'triangle' ? 'oops' : 'look';
    if (phase === 'checking') return 'look';
    if (typing && !shown) return 'closed';
    return s === 'square' ? 'idle' : 'idle';
  };
  const look = phase === 'checking' || (phase === 'error' && errorKind === 'wrong') ? { x: -0.9, y: 0.1 } : typing && shown ? { x: -1, y: 0.35 } : null;
  return (
    <aside className="hidden p-4 lg:flex" aria-hidden="true">
      <div className="relative flex flex-1 flex-col overflow-hidden rounded-[32px] bg-surface-muted">
        <div className="flex items-center justify-between px-8 pt-7">
          <span className="label text-ink-3">Fridays</span>
          <span className="mono text-sm text-ink-3">13:15 to 15:15 WIB</span>
        </div>
        <div className="flex flex-1 items-center justify-center p-10">
          <div className="grid w-[min(26rem,70%)] grid-cols-2 gap-[8%]">
            <div className="relative aspect-square">
              <motion.svg
                viewBox="0 0 46 46"
                className="absolute inset-[6%] overflow-visible"
                animate={reduce ? undefined : { rotate: phase === 'success' ? 360 : 0 }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              >
                <circle cx="23" cy="23" r="22" fill="none" stroke="var(--color-line-strong)" strokeWidth="1.2" strokeDasharray="3 4" />
              </motion.svg>
              <span className="mono absolute inset-0 flex items-center justify-center text-center text-[0.8125rem] leading-snug text-ink-3">
                Q is
                <br />
                peeking
              </span>
            </div>
            {(['triangle', 'square', 'arch'] as const).map((s, i) => (
              <motion.div
                key={s}
                className="aspect-square"
                animate={phase === 'success' && !reduce ? { y: [0, -26, 0] } : { y: 0 }}
                transition={{ duration: 0.7, delay: 0.07 * (i + 1), ease: [0.22, 1, 0.36, 1] }}
              >
                <Character shape={s} mood={mood(s)} follow lookAt={look} size={400} className="size-full" />
              </motion.div>
            ))}
          </div>
        </div>
        <p className="px-8 pb-8 text-[0.9375rem] leading-relaxed text-ink-3">
          Research is lonely. Fridays aren&apos;t.
          <br />
          <span className="text-ink-3">The studio runs every piece of Zemi, from the cover art to the last check-in.</span>
        </p>
      </div>
    </aside>
  );
}
