'use client';

import { LINK_KINDS, type LinkItem, type LinkKind } from '@zemi/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { LinkIcon } from '@/components/icons/link-icon';
import { detectLinkKind, LINK_KIND_LABELS, normalizeLinkUrl } from '@/components/icons/link-kinds';
import { cn } from '@/lib/admin/cn';
import { Button, IconButton } from '../ui/button';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { useReadOnly } from './read-only';
import { DragHandle, SortableList } from './sortable-list';

export interface LinksEditorProps {
  value: LinkItem[];
  onChange: (links: LinkItem[]) => void;
  max?: number;
  readOnly?: boolean;
  /** Per-row errors from the form, keyed by index: { 0: { url: '...' } }. */
  errors?: Record<number, { url?: string; label?: string } | undefined>;
  addLabel?: string;
  className?: string;
}

// Stable client-side keys so rows keep identity while reordering.
let keySeq = 0;
const keyOf = new WeakMap<LinkItem, string>();
function rowKey(item: LinkItem) {
  let k = keyOf.get(item);
  if (!k) {
    k = `l${++keySeq}`;
    keyOf.set(item, k);
  }
  return k;
}

const KIND_OPTIONS = LINK_KINDS.map((k) => ({ value: k, label: LINK_KIND_LABELS[k], icon: <LinkIcon kind={k} /> }));

/**
 * Sortable list of profile links (speakers, team, contact socials). Paste a URL and the kind
 * is detected (linkedin.com becomes LinkedIn). Emails become mailto: links on blur.
 */
export function LinksEditor({ value, onChange, max = 20, readOnly: ro, errors, addLabel = 'Add a link', className }: LinksEditorProps) {
  const readOnly = useReadOnly(ro);
  const touchedKind = useRef(new WeakSet<LinkItem>());
  const update = (i: number, patch: Partial<LinkItem>) => {
    const next = value.slice();
    const prev = next[i]!;
    const row = { ...prev, ...patch };
    keyOf.set(row, rowKey(prev));
    if (touchedKind.current.has(prev)) touchedKind.current.add(row);
    next[i] = row;
    onChange(next);
  };

  if (readOnly && !value.length) return <p className="text-sm text-ink-4">No links.</p>;

  return (
    <div className={cn('space-y-2.5', className)}>
      <SortableList
        items={value}
        getId={rowKey}
        onReorder={onChange}
        readOnly={readOnly}
        itemLabel={(l) => `${LINK_KIND_LABELS[l.kind]} link`}
        aria-label="Links"
        renderItem={(link, { index, handle }) => {
          const err = errors?.[index];
          return (
            <div className="rounded-2xl border border-line bg-white p-2 sm:p-1.5">
              <div className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap">
                <DragHandle {...handle} disabled={readOnly} label={`Move ${LINK_KIND_LABELS[link.kind]} link`} />
                <Select
                  size="sm"
                  aria-label="Link type"
                  className="w-[11rem] shrink-0 [&>span>span:last-child]:truncate"
                  value={link.kind}
                  readOnly={readOnly}
                  onValueChange={(k) => {
                    if (!k) return;
                    touchedKind.current.add(link);
                    update(index, { kind: k as LinkKind });
                  }}
                  options={KIND_OPTIONS}
                />
                <Input
                  size="sm"
                  aria-label="URL"
                  placeholder={link.kind === 'email' ? 'name@example.com' : 'https://'}
                  value={link.url}
                  readOnly={readOnly}
                  inputMode={link.kind === 'email' ? 'email' : 'url'}
                  wrapperClassName="min-w-[12rem] flex-1 max-sm:order-last max-sm:basis-full"
                  aria-invalid={Boolean(err?.url) || undefined}
                  onChange={(e) => {
                    const url = e.target.value;
                    const auto = !touchedKind.current.has(link);
                    update(index, auto && url.length > 4 ? { url, kind: detectLinkKind(url) } : { url });
                  }}
                  onBlur={() => {
                    if (link.url) update(index, { url: normalizeLinkUrl(link.kind, link.url) });
                  }}
                />
                <Input
                  size="sm"
                  aria-label="Label (optional)"
                  placeholder="Label"
                  value={link.label ?? ''}
                  readOnly={readOnly}
                  maxLength={120}
                  wrapperClassName="sm:w-36 max-sm:order-last max-sm:basis-full"
                  onChange={(e) => update(index, { label: e.target.value || null })}
                />
                {readOnly ? null : (
                  <IconButton label="Remove link" size="sm" variant="danger" className="max-sm:ml-auto" onClick={() => onChange(value.filter((_, i) => i !== index))}>
                    <Trash2 />
                  </IconButton>
                )}
              </div>
              {err?.url ? <p className="px-2 pt-1.5 text-[0.8125rem] font-medium text-red-600">{err.url}</p> : null}
            </div>
          );
        }}
      />
      {readOnly ? null : (
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus />}
          disabled={value.length >= max}
          onClick={() => onChange([...value, { kind: 'website', url: '', label: null }])}
        >
          {value.length >= max ? `That's ${max}, the max` : addLabel}
        </Button>
      )}
    </div>
  );
}
