'use client';

import { LINK_KINDS, type LinkItem, type LinkKind } from '@zemi/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useId, useRef } from 'react';
import { LinkIcon } from '@/components/icons/link-icon';
import { detectLinkKind, LINK_KIND_LABELS, normalizeLinkUrl } from '@/components/icons/link-kinds';
import { cn } from '@/lib/admin/cn';
import { Button, IconButton } from '../ui/button';
import { FieldIsolate, useFieldContext } from '../ui/field';
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
 *
 * Safe inside a `<Field>`: the Field names the group (its label and hint), and every row wires
 * its own ids and error state instead of sharing the Field's one id.
 */
export function LinksEditor({ value, onChange, max = 20, readOnly: ro, errors, addLabel = 'Add a link', className }: LinksEditorProps) {
  const readOnly = useReadOnly(ro);
  const field = useFieldContext();
  const base = `${field?.id ?? 'links'}-${useId().replace(/:/g, '')}`;
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

  if (readOnly && !value.length) return <p className="text-sm text-ink-3">No links.</p>;

  return (
    <div
      role="group"
      aria-labelledby={field?.labelId}
      aria-describedby={field?.describedBy}
      aria-label={field ? undefined : 'Links'}
      className={cn('space-y-2.5', className)}
    >
      <FieldIsolate>
        <SortableList
        items={value}
        getId={rowKey}
        onReorder={onChange}
        readOnly={readOnly}
        itemLabel={(l) => `${LINK_KIND_LABELS[l.kind]} link`}
        aria-label="Links"
        renderItem={(link, { index, handle }) => {
          const err = errors?.[index];
          // DOM ids come from useId + the row index, never from rowKey: rowKey's counter is
          // module-wide, so it runs ahead on the server and broke hydration where rows SSR.
          const rid = `${base}-${index}`;
          const label = LINK_KIND_LABELS[link.kind];
          return (
            // Container queries, not viewport ones: the same editor sits in a narrow Sheet on a wide screen.
            <div className="@container rounded-2xl border border-line bg-white p-2">
              <div className="flex flex-wrap items-center gap-1.5 @xl:flex-nowrap">
                <DragHandle {...handle} disabled={readOnly} label={`Move ${LINK_KIND_LABELS[link.kind]} link`} />
                <Select
                  size="sm"
                  id={`${rid}-kind`}
                  aria-label={`Link type, row ${index + 1}`}
                  className="w-[11rem] max-w-[calc(100%-5rem)] shrink-0 [&>span>span:last-child]:truncate"
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
                  // The first URL takes the Field's id, so clicking the Field label lands in it.
                  id={index === 0 && field ? field.id : `${rid}-url`}
                  aria-label={`${label} URL`}
                  aria-describedby={err?.url ? `${rid}-err` : undefined}
                  placeholder={link.kind === 'email' ? 'name@example.com' : 'https://'}
                  value={link.url}
                  readOnly={readOnly}
                  inputMode={link.kind === 'email' ? 'email' : 'url'}
                  wrapperClassName="min-w-[12rem] flex-1 @max-xl:order-last @max-xl:basis-full"
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
                  id={`${rid}-label`}
                  aria-label={`${label} label (optional)`}
                  aria-invalid={Boolean(err?.label) || undefined}
                  placeholder="Label"
                  value={link.label ?? ''}
                  readOnly={readOnly}
                  maxLength={120}
                  wrapperClassName="@xl:w-36 @max-xl:order-last @max-xl:basis-full"
                  onChange={(e) => update(index, { label: e.target.value || null })}
                />
                {readOnly ? null : (
                  <IconButton label={`Remove ${label} link`} size="sm" variant="danger" className="@max-xl:ml-auto" onClick={() => onChange(value.filter((_, i) => i !== index))}>
                    <Trash2 />
                  </IconButton>
                )}
              </div>
              {err?.url ? (
                <p id={`${rid}-err`} className="px-2 pt-1.5 text-[0.8125rem] font-medium text-red-600">
                  {err.url}
                </p>
              ) : null}
              {err?.label ? <p className="px-2 pt-1.5 text-[0.8125rem] font-medium text-red-600">{err.label}</p> : null}
            </div>
          );
        }}
      />
      </FieldIsolate>
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
