'use client';

import type { BumperItem } from '@zemi/shared';
import { Plus, Trash2 } from 'lucide-react';
import { DragHandle, SortableList } from '@/components/admin/fields/sortable-list';
import { Button, IconButton } from '@/components/admin/ui/button';
import { Input, Textarea } from '@/components/admin/ui/input';
import { newBumperId } from '../../api';
import type { ItemFieldKey, ItemsDef } from '../../engine/types';
import { IconGlyph, IconPicker } from '../pickers/icon-picker';
import { ImageField } from '../pickers/image-picker';
import { useBuilder } from '../store';
import type { InspectorCtx } from './context';
import { InspectorSection } from './ui';

const blank = (): BumperItem => ({ id: newBumperId('i'), title: '', body: '', meta: '', icon: null, assetId: null, url: null });

const MAX_LEN: Record<ItemFieldKey, number> = { title: 300, body: 1000, meta: 200, icon: 40, assetId: 60, url: 2048 };

/**
 * Rows for list templates (house rules, sponsors, credits, a hand-written agenda): drag to
 * reorder, add, remove, and per-row fields from the template's ItemsDef.
 */
export function ItemsEditor({ def, ic }: { def: ItemsDef; ic: InspectorCtx }) {
  const b = useBuilder();
  const { slide, ctx, canEdit, data } = ic;
  const items = slide.items;
  const usingFallback = !items.length && ctx.items.length > 0;
  const setItems = (next: BumperItem[], coalesce?: string) => b.updateSlide(slide.id, (s) => ({ ...s, items: next }), coalesce);
  const patch = (id: string, key: ItemFieldKey, value: string | null) =>
    b.updateSlide(slide.id, (s) => ({ ...s, items: s.items.map((it) => (it.id === id ? { ...it, [key]: key === 'title' || key === 'body' || key === 'meta' ? (value ?? '') : value } : it)) }), `item:${slide.id}:${id}:${key}`);
  const iconField = def.fields.find((f) => f.type === 'icon');
  const textFields = def.fields.filter((f) => f.type !== 'icon');

  return (
    <InspectorSection
      title={def.label}
      description={usingFallback ? 'Filled in from the event for now. Write your own to change it.' : `Up to ${def.max}. Drag to reorder.`}
      action={
        canEdit && usingFallback ? (
          <Button size="xs" variant="secondary" onClick={() => setItems(ctx.items.slice(0, def.max).map((it) => ({ ...it, id: newBumperId('i') })))}>
            Write my own
          </Button>
        ) : null
      }
    >
      <div data-focus="items">
        {usingFallback ? (
          <ol className="space-y-1.5">
            {ctx.items.slice(0, def.max).map((it) => (
              <li key={it.id} className="flex items-center gap-2.5 rounded-2xl bg-surface-muted px-3 py-2 text-sm text-ink-2">
                {iconField && it.icon ? <IconGlyph name={it.icon} className="size-6 shrink-0" /> : null}
                <span className="min-w-0 flex-1 truncate">{[it.meta, it.title].filter(Boolean).join('  ')}</span>
              </li>
            ))}
          </ol>
        ) : (
          <SortableList
            items={items}
            getId={(it) => it.id}
            onReorder={(next) => setItems(next)}
            readOnly={!canEdit}
            aria-label={def.label}
            itemLabel={(it) => it.title || def.itemLabel}
            gap="sm"
            renderItem={(it, { handle, index }) => (
              <div className="rounded-2xl border border-line bg-white p-2">
                <div className="flex items-start gap-2">
                  <DragHandle {...handle} disabled={!canEdit} label={`Move ${it.title || `${def.itemLabel} ${index + 1}`}`} className="mt-1" />
                  {iconField ? <IconPicker label={iconField.label} value={it.icon} onChange={(v) => patch(it.id, 'icon', v)} readOnly={!canEdit} /> : null}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {textFields.map((f) =>
                      f.type === 'image' ? (
                        <ImageField key={f.key} label={f.label} value={it.assetId} image={it.assetId ? (data.images[it.assetId] ?? null) : null} eventId={ic.eventId} readOnly={!canEdit} emptyLabel={f.placeholder ?? 'Pick a logo or photo'} onChange={(id) => patch(it.id, 'assetId', id)} />
                      ) : f.type === 'longtext' ? (
                        <Textarea
                          key={f.key}
                          aria-label={`${f.label}, ${def.itemLabel} ${index + 1}`}
                          placeholder={f.placeholder ?? f.label}
                          value={String(it[f.key] ?? '')}
                          maxLength={MAX_LEN[f.key]}
                          minRows={1}
                          maxRows={5}
                          readOnly={!canEdit}
                          onChange={(e) => patch(it.id, f.key, e.target.value)}
                          className="text-sm"
                        />
                      ) : (
                        <Input
                          key={f.key}
                          size="sm"
                          type={f.type === 'url' ? 'url' : 'text'}
                          aria-label={`${f.label}, ${def.itemLabel} ${index + 1}`}
                          placeholder={f.placeholder ?? f.label}
                          value={String(it[f.key] ?? '')}
                          maxLength={MAX_LEN[f.key]}
                          readOnly={!canEdit}
                          onChange={(e) => patch(it.id, f.key, f.type === 'url' ? e.target.value || null : e.target.value)}
                        />
                      ),
                    )}
                  </div>
                  {canEdit ? (
                    <IconButton size="sm" label={`Remove ${it.title || `${def.itemLabel} ${index + 1}`}`} onClick={() => setItems(items.filter((x) => x.id !== it.id))}>
                      <Trash2 />
                    </IconButton>
                  ) : null}
                </div>
              </div>
            )}
          />
        )}
        {canEdit && !usingFallback ? (
          <Button size="sm" variant="secondary" icon={<Plus />} className="mt-2" disabled={items.length >= def.max} onClick={() => setItems([...items, blank()])}>
            {items.length >= def.max ? `That's ${def.max}, the most it fits` : `Add ${def.itemLabel.toLowerCase()}`}
          </Button>
        ) : null}
      </div>
    </InspectorSection>
  );
}
