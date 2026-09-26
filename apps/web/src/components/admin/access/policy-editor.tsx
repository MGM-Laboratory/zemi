'use client';

import {
  CAPABILITIES,
  CAPABILITY_META,
  POLICY_PRESETS,
  type AnyAction,
  type Capability,
  type EventAdminRow,
  type Paginated,
  type Policy,
  type PublicationLookupItem,
  type ResourceType,
  type SpeakerRef,
} from '@zemi/shared';
import { Check, ChevronDown, Lock, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AdminImage,
  Avatar,
  Badge,
  Button,
  Checkbox,
  Combobox,
  IconButton,
  ShapeGlyph,
  Skeleton,
  StatusChip,
  Switch,
  Tooltip,
  useConfirm,
  type ComboOption,
} from '@/components/admin/ui';
import { adminFetch } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import {
  BUNDLES,
  GROUP_META,
  PICK_EVENTS_PRESETS,
  PRESET_SHAPES,
  RESOURCE_META,
  RESOURCE_ORDER,
  actionGroups,
  actionHint,
  actionLabel,
  addScope,
  bundleByKey,
  clonePolicy,
  grantsOf,
  hasScope,
  isEmptyPolicy,
  lockedBy,
  matchingBundle,
  matchingPreset,
  removeScope,
  samePolicy,
  setScopeActions,
  shownActions,
  toggleAction,
  toggleCapability,
  type Bundle,
  type Preset,
} from './policy-model';
import { eventInfo, publicationInfo, speakerInfo, type ItemInfo, type useGrantLabels } from './use-grant-labels';

type Labels = ReturnType<typeof useGrantLabels>;

export interface PolicyEditorProps {
  value: Policy;
  onChange: (policy: Policy) => void;
  labels: Labels;
  readOnly?: boolean;
}

/** Capabilities that touch personal data get a red flag on their card. */
const SENSITIVE_CAPS: Partial<Record<Capability, string>> = {
  'audience.view': 'Personal data',
  'inbox.view': 'Messages',
  'media.library': 'Drafts too',
};

/**
 * The RBAC editor: start from a preset, then fine-tune global powers and per-item scopes.
 * Fully controlled. The parent keeps the policy (and saves it with PATCH).
 */
export function PolicyEditor({ value, onChange, labels, readOnly }: PolicyEditorProps) {
  const confirm = useConfirm();
  const [pendingBundle, setPendingBundle] = useState<Record<ResourceType, string>>({ event: 'read-only', speaker: 'read-only', publication: 'read-only' });
  const [openPickerFor, setOpenPickerFor] = useState<ResourceType | null>(null);
  const active = matchingPreset(value);

  const applyPreset = async (preset: Preset) => {
    const bundleKey = PICK_EVENTS_PRESETS[preset.key];
    const next: Policy = bundleKey
      ? {
          capabilities: [],
          // Keep the events already picked, re-cut to the preset's bundle. Everything else goes.
          grants: value.grants
            .filter((g) => g.type === 'event' && g.id !== '*')
            .map((g) => ({ ...g, actions: [...(bundleByKey('event', bundleKey)?.actions ?? ['view'])] })),
        }
      : clonePolicy(preset.policy);
    if (!isEmptyPolicy(value) && !samePolicy(value, next)) {
      const ok = await confirm({
        title: `Start over as ${preset.label}?`,
        description: bundleKey
          ? `This clears the global powers and every speaker and publication scope. Events you picked stay, set to ${preset.label.toLowerCase()}.`
          : 'This replaces everything you set up below with the preset. You can fine-tune again after.',
        confirmLabel: `Use ${preset.label}`,
        cancelLabel: 'Keep mine',
      });
      if (!ok) return;
    }
    onChange(next);
    if (bundleKey) {
      setPendingBundle((b) => ({ ...b, event: bundleKey }));
      setOpenPickerFor('event');
    }
  };

  return (
    <div className="space-y-10">
      <PresetPicker active={active} onPick={applyPreset} readOnly={readOnly} empty={isEmptyPolicy(value)} />
      <CapabilityCards value={value} onChange={onChange} readOnly={readOnly} />
      {RESOURCE_ORDER.map((type) => (
        <ScopeSection
          key={type}
          type={type}
          policy={value}
          onChange={onChange}
          labels={labels}
          readOnly={readOnly}
          bundleKey={pendingBundle[type]}
          onBundleKey={(k) => setPendingBundle((b) => ({ ...b, [type]: k }))}
          pickerOpen={openPickerFor === type}
          onPickerOpenChange={(o) => setOpenPickerFor(o ? type : null)}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ presets */

function PresetPicker({ active, onPick, readOnly, empty }: { active: Preset | null; onPick: (p: Preset) => void; readOnly?: boolean; empty: boolean }) {
  const reduce = useReducedMotion();
  return (
    <section aria-labelledby="preset-title">
      <SectionTitle id="preset-title" title="Start from a preset" description="Pick the closest one, then fine-tune below. Nothing is saved until you press save." />
      <div role="group" aria-labelledby="preset-title" className="grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 2xl:grid-cols-3">
        {POLICY_PRESETS.map((p) => {
          const on = active?.key === p.key;
          const look = PRESET_SHAPES[p.key] ?? { shape: 'circle', tone: 'text-ink-3' };
          const pick = Boolean(PICK_EVENTS_PRESETS[p.key]);
          return (
            <motion.button
              key={p.key}
              type="button"
              aria-pressed={on}
              disabled={readOnly}
              onClick={() => onPick(p)}
              whileHover={reduce || readOnly ? undefined : { y: -2 }}
              whileTap={reduce || readOnly ? undefined : { scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 420, damping: 26 }}
              className={cn(
                'group relative flex min-h-[5.75rem] items-start gap-3 rounded-2xl border bg-white p-4 text-left transition-[border-color,box-shadow,background-color] duration-200',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60',
                on ? 'border-ink shadow-[0_0_0_1px_var(--color-ink)]' : 'border-line hover:border-line-strong hover:shadow-[var(--shadow-1)]',
              )}
            >
              <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface-muted transition-transform duration-300 group-hover:rotate-[-8deg]', look.tone)}>
                <ShapeGlyph shape={look.shape} className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-display text-[0.9875rem] leading-tight font-extrabold tracking-[-0.01em] [font-variation-settings:'CASL'_0.3]">{p.label}</span>
                  {pick ? (
                    <Badge size="sm" tone="outline">
                      pick events
                    </Badge>
                  ) : null}
                </span>
                <span className="mt-1 block text-[0.8125rem] leading-snug text-ink-3">{p.description}</span>
              </span>
              <AnimatePresence>
                {on ? (
                  <motion.span
                    initial={reduce ? false : { scale: 0, rotate: -40 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={reduce ? undefined : { scale: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                    className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-ink text-white"
                    aria-hidden="true"
                  >
                    <Check className="size-3" strokeWidth={3} />
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>
      <p className="mt-2.5 text-[0.8125rem] text-ink-3" aria-live="polite">
        {active ? (
          <>
            Matches <strong className="font-semibold text-ink-2">{active.label}</strong>.
          </>
        ) : empty ? (
          'No access yet. Default deny: they only get what you tick.'
        ) : (
          'Custom mix. That is fine, the summary says exactly what it adds up to.'
        )}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ capabilities */

function CapabilityCards({ value, onChange, readOnly }: { value: Policy; onChange: (p: Policy) => void; readOnly?: boolean }) {
  const set = new Set(value.capabilities);
  return (
    <section aria-labelledby="caps-title">
      <SectionTitle id="caps-title" title="Global powers" description="Things that are not about one event or person. Off by default." />
      <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 2xl:grid-cols-3">
        {CAPABILITIES.map((cap) => {
          const on = set.has(cap);
          const meta = CAPABILITY_META[cap];
          const flag = SENSITIVE_CAPS[cap];
          return (
            <li key={cap}>
              <div
                className={cn(
                  'flex h-full items-start gap-3 rounded-2xl border p-4 transition-[border-color,background-color] duration-200',
                  on ? 'border-green/35 bg-green-50/60' : 'border-line bg-white hover:border-line-strong',
                )}
              >
                <Switch
                  checked={on}
                  disabled={readOnly}
                  onCheckedChange={(c) => onChange(toggleCapability(value, cap, c))}
                  label={
                    <span className="flex flex-wrap items-center gap-1.5">
                      {meta.label}
                      {flag ? (
                        <Badge size="sm" tone={cap === 'audience.view' ? 'red' : 'neutral'}>
                          {flag}
                        </Badge>
                      ) : null}
                    </span>
                  }
                  description={meta.hint}
                  className="w-full"
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ scopes */

const SECTION_COPY: Record<ResourceType, string> = {
  event: 'Per-Friday access. Add every event, or only the ones they help with.',
  speaker: 'The speaker directory. Most helpers do not need this at all.',
  publication: 'Papers, projects and articles.',
};

function ScopeSection({
  type,
  policy,
  onChange,
  labels,
  readOnly,
  bundleKey,
  onBundleKey,
  pickerOpen,
  onPickerOpenChange,
}: {
  type: ResourceType;
  policy: Policy;
  onChange: (p: Policy) => void;
  labels: Labels;
  readOnly?: boolean;
  bundleKey: string;
  onBundleKey: (key: string) => void;
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
}) {
  const meta = RESOURCE_META[type];
  const grants = grantsOf(policy, type);
  const wildcard = grants.some((g) => g.id === '*');
  const bundle = bundleByKey(type, bundleKey) ?? BUNDLES[type][0]!;
  const titleId = useId();
  const reduce = useReducedMotion();

  const add = (id: string, info?: ItemInfo) => {
    if (info) labels.remember(type, id, info);
    onChange(addScope(policy, type, id, bundle.actions));
  };

  return (
    <section aria-labelledby={titleId}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 id={titleId} className="flex items-center gap-2 font-display text-lg leading-tight font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.2]">
            <ShapeGlyph shape={meta.shape} className={cn('size-3', meta.tone)} />
            {meta.title}
            {grants.length ? (
              <span className="mono rounded-full bg-surface-muted px-2 py-0.5 text-[0.6875rem] font-medium text-ink-3 tabular-nums">{grants.length}</span>
            ) : null}
          </h3>
          <p className="mt-1 text-sm text-ink-3">{SECTION_COPY[type]}</p>
        </div>
      </div>

      <ul className="space-y-2.5">
        <AnimatePresence initial={false}>
          {grants.map((g) => (
            <motion.li
              key={`${g.type}:${g.id}`}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24, transition: { duration: 0.16 } }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            >
              <ScopeRow
                type={type}
                id={g.id}
                actions={g.actions}
                labels={labels}
                readOnly={readOnly}
                onActions={(a) => onChange(setScopeActions(policy, type, g.id, a))}
                onRemove={() => onChange(removeScope(policy, type, g.id))}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {!grants.length ? (
        <p className="rounded-2xl border border-dashed border-line-strong px-4 py-3.5 text-sm text-ink-3">
          No {meta.many} yet. {type === 'event' ? 'They will not see any Fridays.' : `They will not see any ${meta.many}.`}
        </p>
      ) : null}

      {!readOnly ? (
        <div className="mt-3 flex flex-col gap-2.5 rounded-2xl bg-surface-muted p-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="min-w-0 flex-1 sm:min-w-[16rem]">
            <ItemPicker type={type} policy={policy} onPick={add} open={pickerOpen} onOpenChange={onPickerOpenChange} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BundleSelect type={type} value={bundle.key} onChange={onBundleKey} />
            {!wildcard ? (
              <Button size="sm" variant="secondary" icon={<Sparkles />} onClick={() => add('*')}>
                {meta.all}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function BundleSelect({ type, value, onChange }: { type: ResourceType; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-[0.8125rem] text-ink-3">
      <span className="whitespace-nowrap">New ones get</span>
      <span className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 appearance-none rounded-full border border-line-strong bg-white pr-8 pl-3 text-[0.8125rem] font-medium text-ink transition hover:border-ink-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {BUNDLES[type].map((b) => (
            <option key={b.key} value={b.key}>
              {b.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden="true" />
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ item picker */

function ItemPicker({
  type,
  policy,
  onPick,
  open,
  onOpenChange,
}: {
  type: ResourceType;
  policy: Policy;
  onPick: (id: string, info: ItemInfo) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [nonce, setNonce] = useState(0);
  const meta = RESOURCE_META[type];
  const loadOptions = useMemo(() => {
    return async (q: string, signal: AbortSignal): Promise<ComboOption<ItemInfo>[]> => {
      if (type === 'event') {
        const page = await adminFetch<Paginated<EventAdminRow>>('/admin/events', { query: { search: q || undefined, pageSize: 20, when: 'all' }, signal });
        return page.items
          .filter((e) => !hasScope(policy, 'event', e.id))
          .map((e) => {
            const info = eventInfo(e);
            return {
              value: e.id,
              label: e.number != null && !e.title.toLowerCase().includes(`zemi #${e.number}`) ? `Zemi #${e.number} · ${e.title}` : e.title,
              description: `${info.sub}${e.visibility === 'draft' ? ' · draft' : ''}`,
              keywords: [String(e.number ?? '')],
              data: info,
            };
          });
      }
      if (type === 'speaker') {
        const list = await adminFetch<SpeakerRef[]>('/admin/speakers/lookup', { query: { q, limit: 20 }, signal });
        return list
          .filter((s) => !hasScope(policy, 'speaker', s.id))
          .map((s) => ({ value: s.id, label: s.fullName, description: s.headline ?? s.defaultOrganization ?? undefined, icon: <Avatar name={s.fullName} image={s.avatar} size={24} />, data: speakerInfo(s) }));
      }
      const list = await adminFetch<PublicationLookupItem[]>('/admin/publications/lookup', { query: { q, limit: 20 }, signal });
      return list
        .filter((p) => !hasScope(policy, 'publication', p.id))
        .map((p) => ({ value: p.id, label: p.title, description: [p.publishedYear, p.containerTitle].filter(Boolean).join(' · ') || undefined, data: publicationInfo(p) }));
    };
  }, [type, policy]);

  // Opening from a preset: bring the picker into view and open it, so picking events is the next step.
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });
  useEffect(() => {
    if (!open) return;
    onOpenChangeRef.current(false);
    const btn = wrap.current?.querySelector<HTMLButtonElement>('button');
    if (!btn) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    btn.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
    // Not cleared when `open` flips back to false (that happens right away, on purpose).
    setTimeout(() => {
      if (!btn.isConnected) return;
      btn.focus();
      btn.click();
    }, smooth ? 380 : 0);
  }, [open]);

  return (
    <div ref={wrap}>
      <Combobox<ItemInfo>
        key={nonce}
        value={null}
        onValueChange={(id, option) => {
          if (id && option?.data) {
            onPick(id, option.data);
            setNonce((n) => n + 1);
          }
        }}
        loadOptions={loadOptions}
        placeholder={`Add ${type === 'event' ? 'an event' : `a ${meta.one}`}`}
        searchPlaceholder={type === 'event' ? 'Search by title or number' : `Search ${meta.many}`}
        emptyText={`No ${meta.many} match that. Already added ones are hidden.`}
        aria-label={`Add ${meta.one} scope`}
        size="sm"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ scope row */

function ScopeRow({
  type,
  id,
  actions,
  labels,
  readOnly,
  onActions,
  onRemove,
}: {
  type: ResourceType;
  id: string;
  actions: AnyAction[];
  labels: Labels;
  readOnly?: boolean;
  onActions: (a: AnyAction[]) => void;
  onRemove: () => void;
}) {
  const meta = RESOURCE_META[type];
  const wildcard = id === '*';
  const state = wildcard ? null : labels.state(type, id);
  const shown = shownActions(type, actions);
  const bundle = matchingBundle(type, actions);
  const isEvent = type === 'event';
  const [open, setOpen] = useState(() => !isEvent || !bundle);
  const matrixId = useId();
  const empty = actions.length === 0;
  const riskyWildcard = wildcard && isEvent && (shown.has('registrations.view') || shown.has('emails.send'));

  const title = wildcard ? (
    <span className="flex items-center gap-2">
      <span className="mono inline-flex size-7 items-center justify-center rounded-lg bg-ink text-sm font-bold text-white" aria-hidden="true">
        *
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-ink">{meta.all}</span>
        <span className="block text-[0.8125rem] text-ink-3">Including the ones added later.</span>
      </span>
    </span>
  ) : state?.kind === 'ready' ? (
    <span className="flex min-w-0 items-center gap-2.5">
      {type === 'speaker' ? (
        <Avatar name={state.info.title} image={state.info.image} size={32} />
      ) : state.info.image ? (
        <span className={cn('relative block shrink-0 overflow-hidden rounded-lg bg-surface-muted', type === 'event' ? 'h-9 w-7' : 'h-9 w-7')}>
          <AdminImage image={state.info.image} sizes="40px" alt="" className="absolute inset-0 size-full" />
        </span>
      ) : (
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted', meta.tone)}>
          <ShapeGlyph shape={meta.shape} className="size-3" />
        </span>
      )}
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold text-ink">
            {type === 'event' && state.info.short.startsWith('Zemi #') && !state.info.title.toLowerCase().includes(state.info.short.toLowerCase()) ? (
              <>
                <span className="mono mr-1.5 text-ink-3">{state.info.short.replace('Zemi ', '')}</span>
                {state.info.title}
              </>
            ) : (
              state.info.title
            )}
          </span>
          {state.info.status ? <StatusChip kind="event" value={state.info.status} size="sm" /> : null}
        </span>
        {state.info.sub ? <span className="block truncate text-[0.8125rem] text-ink-3">{state.info.sub}</span> : null}
      </span>
    </span>
  ) : state?.kind === 'missing' ? (
    <span className="flex items-center gap-2 text-ink-3">
      <TriangleAlert className="size-4 text-red-600" aria-hidden="true" />
      <span>
        <span className="block font-semibold text-ink">Deleted {meta.one}</span>
        <span className="block text-[0.8125rem]">It is gone, so this scope does nothing. Remove it.</span>
      </span>
    </span>
  ) : state?.kind === 'error' ? (
    <span className="text-sm text-ink-3">Could not load this {meta.one}. The access still applies.</span>
  ) : (
    <span className="flex items-center gap-2.5">
      <Skeleton className="size-8" rounded="md" />
      <span className="space-y-1.5">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-3 w-24" />
      </span>
    </span>
  );

  return (
    <div
      className={cn(
        'rounded-2xl border bg-white transition-[border-color,box-shadow] duration-200',
        empty ? 'border-yellow' : riskyWildcard ? 'border-red/30' : 'border-line hover:border-line-strong',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 p-3 sm:p-4">
        <div className="min-w-0 flex-1 basis-[14rem]">{title}</div>
        <div className="flex items-center gap-1">
          {isEvent ? (
            <Button
              size="xs"
              variant="ghost"
              aria-expanded={open}
              aria-controls={matrixId}
              onClick={() => setOpen((o) => !o)}
              iconRight={<ChevronDown className={cn('size-3.5 transition-transform duration-200', open && 'rotate-180')} />}
            >
              {open ? 'Hide actions' : 'Fine-tune'}
            </Button>
          ) : null}
          {!readOnly ? (
            <IconButton label={wildcard ? `Remove ${meta.all.toLowerCase()}` : `Remove this ${meta.one}`} size="sm" variant="danger" onClick={onRemove}>
              <Trash2 />
            </IconButton>
          ) : null}
        </div>
        <BundleBar type={type} current={bundle} readOnly={readOnly} onPick={(b) => onActions(b.actions)} />
        {isEvent && !open ? <ActionChips type={type} shown={shown} /> : null}
      </div>
      {isEvent ? (
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              id={matrixId}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <ActionMatrix type={type} actions={actions} readOnly={readOnly} onActions={onActions} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      ) : (
        <ActionMatrix type={type} actions={actions} readOnly={readOnly} onActions={onActions} />
      )}
      {empty ? (
        <p className="border-t border-yellow/50 bg-yellow-50 px-4 py-2 text-[0.8125rem] text-[#7a5600]">
          Nothing ticked, so this scope grants nothing. It is dropped on save.
        </p>
      ) : null}
    </div>
  );
}

function BundleBar({ type, current, readOnly, onPick }: { type: ResourceType; current: Bundle | null; readOnly?: boolean; onPick: (b: Bundle) => void }) {
  return (
    <div className="flex w-full flex-wrap items-center gap-1.5" role="group" aria-label="Shortcuts">
      <span className="label mr-1 text-ink-4">Shortcuts</span>
      {BUNDLES[type].map((b) => {
        const on = current?.key === b.key;
        return (
          <Tooltip key={b.key} content={b.hint}>
            <button
              type="button"
              disabled={readOnly}
              aria-pressed={on}
              onClick={() => onPick(b)}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[0.8125rem] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-95',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50',
                on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white text-ink-2 hover:border-ink-4 hover:text-ink',
              )}
            >
              {on ? <Check className="size-3" strokeWidth={3} aria-hidden="true" /> : null}
              {b.label}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

function ActionChips({ type, shown }: { type: ResourceType; shown: Set<AnyAction> }) {
  if (!shown.size) return null;
  return (
    <ul className="flex w-full flex-wrap gap-1" aria-label="What this scope allows">
      {[...shown].map((a) => (
        <li key={a} className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-2">
          {actionLabel(type, a)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Checkbox matrix. Events: grouped fieldsets (Content, People, Door, Stream, Media) that sit in
 * a row on wide screens and stack on phones. Implied actions show checked and locked.
 */
function ActionMatrix({ type, actions, readOnly, onActions }: { type: ResourceType; actions: AnyAction[]; readOnly?: boolean; onActions: (a: AnyAction[]) => void }) {
  const groups = actionGroups(type);
  const shown = shownActions(type, actions);
  return (
    <div
      className={cn(
        'grid gap-px border-t border-line bg-line',
        type === 'event' ? 'grid-cols-1 min-[560px]:grid-cols-2 xl:grid-cols-5' : 'grid-cols-1',
      )}
    >
      {groups.map((g) => {
        const gm = GROUP_META[g.group]!;
        return (
          <fieldset key={g.group} className="min-w-0 bg-white px-4 pt-3 pb-4 first:rounded-bl-2xl last:rounded-br-2xl">
            {type === 'event' ? (
              <legend className="float-left mb-2.5 flex w-full items-center gap-1.5">
                <ShapeGlyph shape={gm.shape} className={cn('size-2.5', gm.tone)} />
                <span className="label text-ink-3">{g.group}</span>
                <span className="text-xs text-ink-4">{gm.blurb}</span>
              </legend>
            ) : (
              <legend className="sr-only">Actions</legend>
            )}
            <ul className={cn('clear-both', type === 'event' ? 'space-y-2.5' : 'grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 lg:grid-cols-4')}>
              {g.actions.map((a) => {
                const by = lockedBy(a, actions);
                const locked = by.length > 0;
                const checked = shown.has(a);
                return (
                  <li key={a}>
                    <Checkbox
                      checked={checked}
                      disabled={readOnly || locked}
                      onCheckedChange={(c) => onActions(toggleAction(actions, a, c))}
                      label={
                        <span className="flex items-center gap-1.5">
                          {actionLabel(type, a)}
                          {locked ? <Lock className="size-3 text-ink-4" aria-hidden="true" /> : null}
                        </span>
                      }
                      description={locked ? `Comes with ${by.map((b) => actionLabel(type, b)).join(', ')}.` : actionHint(type, a)}
                    />
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ bits */

function SectionTitle({ id, title, description }: { id: string; title: string; description?: string }) {
  return (
    <div className="mb-3">
      <h3 id={id} className="font-display text-lg leading-tight font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.2]">
        {title}
      </h3>
      {description ? <p className="mt-1 text-sm text-ink-3">{description}</p> : null}
    </div>
  );
}

