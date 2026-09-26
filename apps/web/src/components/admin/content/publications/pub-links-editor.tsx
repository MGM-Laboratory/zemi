'use client';

import { PUBLICATION_LINK_KINDS, type PublicationLinkKind } from '@zemi/shared';
import { Code2, Database, FileText, Globe, Link2, MonitorPlay, Plus, Presentation, ScrollText, Trash2, type LucideIcon } from 'lucide-react';
import { useRef } from 'react';
import { DragHandle, SortableList, useReadOnly } from '@/components/admin/fields';
import { Button, IconButton, Input, Select } from '@/components/admin/ui';
import { newKey } from '../shared/form-utils';
import { LINK_KIND_LABELS, type LinkRow } from './publication-data';

const KIND_ICON: Record<PublicationLinkKind, LucideIcon> = {
  pdf: FileText,
  publisher: Globe,
  code: Code2,
  dataset: Database,
  slides: Presentation,
  video: MonitorPlay,
  poster: ScrollText,
  website: Globe,
  other: Link2,
};

const OPTIONS = PUBLICATION_LINK_KINDS.map((k) => {
  const Icon = KIND_ICON[k];
  return { value: k, label: LINK_KIND_LABELS[k], icon: <Icon /> };
});

/** Guess the kind from a URL: github.com is code, zenodo is a dataset, .pdf is a PDF. */
export function guessLinkKind(url: string): PublicationLinkKind | null {
  const u = url.toLowerCase();
  if (/\.pdf(\?|#|$)/.test(u)) return 'pdf';
  if (/github\.com|gitlab\.com|bitbucket\.org|huggingface\.co\/spaces/.test(u)) return 'code';
  if (/zenodo\.org|kaggle\.com|figshare|huggingface\.co\/datasets|dataverse/.test(u)) return 'dataset';
  if (/youtube\.com|youtu\.be|vimeo\.com/.test(u)) return 'video';
  if (/speakerdeck|slideshare|docs\.google\.com\/presentation/.test(u)) return 'slides';
  if (/doi\.org|springer|elsevier|sciencedirect|ieee|acm\.org|wiley|nature\.com|mdpi|tandfonline/.test(u)) return 'publisher';
  return null;
}

export interface PubLinksEditorProps {
  value: LinkRow[];
  onChange: (rows: LinkRow[]) => void;
  errors?: Array<{ url?: { message?: string }; label?: { message?: string } } | undefined>;
  readOnly?: boolean;
  max?: number;
}

/** Extra links for a publication (code, dataset, slides...). Every link needs a label on the site. */
export function PubLinksEditor({ value, onChange, errors, readOnly: ro, max = 30 }: PubLinksEditorProps) {
  const readOnly = useReadOnly(ro);
  const touched = useRef(new Set<string>());
  const latest = useRef(value);
  latest.current = value;
  const update = (key: string, patch: Partial<LinkRow>) => onChange(latest.current.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  if (readOnly && !value.length) return <p className="text-sm text-ink-4">No extra links.</p>;

  return (
    <div className="space-y-2.5">
      <SortableList
        items={value}
        getId={(r) => r.key}
        onReorder={onChange}
        readOnly={readOnly}
        aria-label="Links"
        itemLabel={(r) => `${LINK_KIND_LABELS[r.kind]} link`}
        renderItem={(row, { index, handle }) => {
          const err = errors?.[index];
          return (
            <div className="rounded-2xl border border-line bg-white p-2 sm:p-1.5">
              <div className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap">
                <DragHandle {...handle} disabled={readOnly} label={`Move ${LINK_KIND_LABELS[row.kind]} link`} />
                <Select<PublicationLinkKind>
                  size="sm"
                  aria-label="Link type"
                  className="w-[10rem] shrink-0 max-sm:w-auto max-sm:min-w-0 max-sm:flex-1"
                  value={row.kind}
                  readOnly={readOnly}
                  onValueChange={(k) => {
                    if (!k) return;
                    touched.current.add(row.key);
                    const autoLabel = !row.label || row.label === LINK_KIND_LABELS[row.kind];
                    update(row.key, { kind: k, ...(autoLabel ? { label: LINK_KIND_LABELS[k] } : {}) });
                  }}
                  options={OPTIONS}
                />
                <Input
                  size="sm"
                  aria-label="Label"
                  placeholder="Label on the site"
                  value={row.label}
                  readOnly={readOnly}
                  maxLength={120}
                  // Phones: kind and delete on the first row, then the URL, then the label, each full width.
                  wrapperClassName="sm:w-40 max-sm:order-2 max-sm:basis-full"
                  onChange={(e) => update(row.key, { label: e.target.value })}
                />
                <Input
                  size="sm"
                  aria-label="URL"
                  aria-invalid={Boolean(err?.url) || undefined}
                  placeholder="https://"
                  inputMode="url"
                  value={row.url}
                  readOnly={readOnly}
                  wrapperClassName="min-w-[12rem] flex-1 max-sm:order-1 max-sm:basis-full"
                  onChange={(e) => {
                    const url = e.target.value;
                    const guess = !touched.current.has(row.key) ? guessLinkKind(url) : null;
                    const autoLabel = !row.label || row.label === LINK_KIND_LABELS[row.kind];
                    update(row.key, guess ? { url, kind: guess, ...(autoLabel ? { label: LINK_KIND_LABELS[guess] } : {}) } : { url });
                  }}
                />
                {readOnly ? null : (
                  <IconButton label="Remove link" size="sm" variant="danger" className="max-sm:ml-auto" onClick={() => onChange(latest.current.filter((r) => r.key !== row.key))}>
                    <Trash2 />
                  </IconButton>
                )}
              </div>
              {err?.url?.message ? <p className="px-2 pt-1.5 text-[0.8125rem] font-medium text-red-600">{err.url.message}</p> : null}
            </div>
          );
        }}
      />
      {readOnly ? null : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          icon={<Plus />}
          disabled={value.length >= max}
          onClick={() => onChange([...value, { key: newKey('l'), kind: 'code', label: LINK_KIND_LABELS.code, url: '' }])}
        >
          {value.length >= max ? `That's ${max}, the max` : 'Add a link'}
        </Button>
      )}
    </div>
  );
}
