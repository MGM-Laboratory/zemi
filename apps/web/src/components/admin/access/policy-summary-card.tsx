'use client';

import { createAbility, type Policy } from '@zemi/shared';
import { Check, Info, Minus, TriangleAlert } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo } from 'react';
import { Character } from '@/components/admin/characters/character';
import { ShapeGlyph } from '@/components/admin/ui';
import { cn } from '@/lib/admin/cn';
import { flattenNav, visibleNav } from '@/lib/admin/nav';
import { RESOURCE_META, cleanPolicy, emptyScopes } from './policy-model';
import { policyHints, summarizePolicy, type LabelFn } from './policy-summary';

export interface PolicySummaryCardProps {
  policy: Policy;
  expiresAt: string | null | undefined;
  label: LabelFn;
  /** The admin's name, for "Rani can..." */
  name?: string;
  className?: string;
}

/**
 * Live plain-English summary of a policy, the sidebar they will get, and least-privilege hints.
 * Announced politely to screen readers as it changes.
 */
export function PolicySummaryCard({ policy, expiresAt, label, name, className }: PolicySummaryCardProps) {
  const reduce = useReducedMotion();
  const lines = useMemo(() => summarizePolicy(policy, label), [policy, label]);
  const hints = useMemo(() => policyHints(policy, { expiresAt }), [policy, expiresAt]);
  const nav = useMemo(() => {
    const ability = createAbility({ kind: 'admin', id: 'preview', name: name || 'Preview', expiresAt: expiresAt ?? null }, cleanPolicy(policy));
    return flattenNav(visibleNav(ability)).filter((i) => !i.parent);
  }, [policy, name, expiresAt]);
  const empties = emptyScopes(policy).length;
  const nothing = lines.length === 1 && lines[0]!.tone === 'cannot' && lines[0]!.area === 'none' && !policy.capabilities.length;
  const who = name?.trim().split(/\s+/)[0] || 'They';

  return (
    <section aria-labelledby="summary-title" className={cn('overflow-hidden rounded-[20px] border border-line bg-white sm:rounded-[var(--radius-card)]', className)}>
      <div className="flex items-center gap-3 border-b border-line bg-surface-muted/60 px-5 py-4">
        <Character shape={nothing ? 'square' : 'circle'} mood={nothing ? 'sleep' : 'look'} size={34} />
        <div className="min-w-0">
          <h3 id="summary-title" className="font-display text-base leading-tight font-extrabold [font-variation-settings:'CASL'_0.4]">
            What {who === 'They' ? 'they' : who} can do
          </h3>
          <p className="text-[0.8125rem] text-ink-3">Updates as you tick things.</p>
        </div>
      </div>

      <div className="space-y-5 px-5 py-4">
        <ul className="space-y-2" aria-live="polite">
          <AnimatePresence initial={false} mode="popLayout">
            {lines.map((l) => (
              <motion.li
                key={l.text}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: 6, transition: { duration: 0.12 } }}
                className="flex gap-2.5 text-[0.9375rem] leading-snug"
              >
                <span
                  className={cn(
                    'mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full',
                    l.tone === 'can' ? 'bg-green-50 text-green-600' : 'bg-surface-muted text-ink-3',
                  )}
                  aria-hidden="true"
                >
                  {l.tone === 'can' ? <Check className="size-3" strokeWidth={3} /> : <Minus className="size-3" strokeWidth={3} />}
                </span>
                <span className={cn(l.tone === 'can' ? 'text-ink' : 'text-ink-3')}>
                  <span className="sr-only">{l.tone === 'can' ? 'Allowed: ' : 'Not allowed: '}</span>
                  {l.text}
                  {l.area !== 'none' && l.area !== 'capability' ? (
                    <ShapeGlyph shape={RESOURCE_META[l.area].shape} className={cn('ml-1.5 inline size-2 align-middle', RESOURCE_META[l.area].tone)} />
                  ) : null}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        <div>
          <p className="label mb-2 text-ink-4">Their sidebar</p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Sections they will see">
            {nav.map((n) => (
              <li key={n.key} className="rounded-full border border-line bg-white px-2.5 py-1 text-[0.8125rem] text-ink-2">
                {n.label}
              </li>
            ))}
          </ul>
        </div>

        {hints.length || empties ? (
          <div className="space-y-2">
            <p className="label text-ink-4">Worth a second look</p>
            {empties ? (
              <Hint tone="info" title={`${empties} empty ${empties === 1 ? 'scope' : 'scopes'}`} body="Scopes with nothing ticked are dropped when you save." />
            ) : null}
            {hints.map((h) => (
              <Hint key={h.key} tone={h.tone} title={h.title} body={h.body} />
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2 text-[0.8125rem] text-green-600">
            <Check className="size-3.5" aria-hidden="true" /> Tight and tidy. Nothing broad or risky in here.
          </p>
        )}
      </div>
    </section>
  );
}

function Hint({ tone, title, body }: { tone: 'warn' | 'info'; title: string; body: string }) {
  return (
    <div className={cn('flex gap-2.5 rounded-xl px-3 py-2.5 text-[0.8125rem] leading-snug', tone === 'warn' ? 'bg-red-50' : 'bg-blue-50')}>
      {tone === 'warn' ? <TriangleAlert className="mt-px size-4 shrink-0 text-red-600" aria-hidden="true" /> : <Info className="mt-px size-4 shrink-0 text-blue-600" aria-hidden="true" />}
      <span>
        <span className="block font-semibold text-ink">{title}</span>
        <span className="text-ink-2">{body}</span>
      </span>
    </div>
  );
}
