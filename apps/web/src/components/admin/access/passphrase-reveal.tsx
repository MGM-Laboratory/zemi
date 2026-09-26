'use client';

import { formatJakarta } from '@zemi/shared';
import { Check, Copy, EyeOff, MessageSquareText } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { Character } from '@/components/admin/characters/character';
import { Button, notify, useCopy } from '@/components/admin/ui';
import { cn } from '@/lib/admin/cn';
import { SITE_URL } from '@/lib/admin/paths';
import { ScrambleText } from './passphrase-field';

/** A ready-to-send note with the passphrase, the login link and the end date. */
export function handoffMessage(name: string, passphrase: string, expiresAt: string | null): string {
  const first = name.trim().split(/\s+/)[0] || 'there';
  const until = expiresAt ? ` It works until ${formatJakarta(expiresAt, 'datetime')} WIB.` : '';
  return `Hi ${first}, here is your Zemi studio passphrase:\n\n${passphrase}\n\nSign in at ${SITE_URL}/admin/login.${until} Please keep it to yourself, it is basically your key.`;
}

export interface PassphraseRevealProps {
  name: string;
  passphrase: string;
  expiresAt: string | null;
  /** "created" for a new admin, "rotated" for a new passphrase. */
  reason: 'created' | 'rotated';
  onCopied?: () => void;
  className?: string;
}

/**
 * Show-once reveal. The passphrase is only in memory here: it is hashed on the server and nobody,
 * the superadmin included, can see it again.
 */
export function PassphraseReveal({ name, passphrase, expiresAt, reason, onCopied, className }: PassphraseRevealProps) {
  const reduce = useReducedMotion();
  const [copy, copied] = useCopy();
  const [copyMsg, copiedMsg] = useCopy();
  const [didCopy, setDidCopy] = useState(false);

  const doCopy = async (text: string, which: 'pass' | 'msg') => {
    const ok = await (which === 'pass' ? copy(text) : copyMsg(text));
    if (ok) {
      setDidCopy(true);
      onCopied?.();
      notify.success(which === 'pass' ? 'Passphrase copied.' : 'Message copied. Paste it into a DM.');
    } else {
      notify.error("Couldn't copy. Select the passphrase and copy it by hand.");
    }
  };

  return (
    <div className={cn('space-y-5', className)}>
      <div className="flex items-end gap-2" aria-hidden="true">
        <Character shape="circle" mood="cheer" size={48} />
        <Character shape="arch" mood="happy" size={40} />
        <Character shape="square" mood="look" size={36} lookAt={{ x: -0.8, y: -0.2 }} />
      </div>
      <div>
        <h2 className="font-display text-[clamp(1.5rem,3vw,2rem)] leading-tight font-extrabold tracking-[-0.03em] [font-variation-settings:'CASL'_0.5]">
          {reason === 'created' ? `${name} is in.` : `New passphrase for ${name}.`}
        </h2>
        <p className="mt-1.5 text-[0.9375rem] text-ink-2">
          {reason === 'created'
            ? 'Send them this passphrase. It is the only thing they need to sign in.'
            : 'Their old passphrase stopped working and every session they had was signed out.'}
        </p>
      </div>

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10, rotate: -0.6 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="relative overflow-hidden rounded-[22px] border border-line bg-[linear-gradient(var(--color-graph)_1px,transparent_1px),linear-gradient(90deg,var(--color-graph)_1px,transparent_1px)] bg-[size:24px_24px] p-5 sm:p-6"
      >
        <p className="label mb-2 text-ink-4">Passphrase</p>
        <p className="mono text-[clamp(1.15rem,3.2vw,1.75rem)] font-semibold tracking-tight break-all text-ink select-all" data-testid="revealed-passphrase">
          <ScrambleText text={passphrase} />
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" icon={copied ? <Check /> : <Copy />} onClick={() => void doCopy(passphrase, 'pass')}>
            {copied ? 'Copied' : 'Copy passphrase'}
          </Button>
          <Button variant="secondary" icon={copiedMsg ? <Check /> : <MessageSquareText />} onClick={() => void doCopy(handoffMessage(name, passphrase, expiresAt), 'msg')}>
            {copiedMsg ? 'Copied' : 'Copy a message to send'}
          </Button>
        </div>
      </motion.div>

      <div role="note" className="flex gap-3 rounded-2xl border border-yellow/50 bg-yellow-50 px-4 py-3 text-[0.875rem] text-[#6b4b00]">
        <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          <strong className="font-semibold">You won&apos;t see this again.</strong> We only keep a scrambled version, so if it gets lost you set a new one. Send it
          somewhere private, not the group chat.
          {didCopy ? <span className="sr-only"> Copied.</span> : null}
        </p>
      </div>
    </div>
  );
}
