'use client';

import { PUBLICATION_TYPE_LABELS, type DoiLookupResult, type SpeakerRef } from '@zemi/shared';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Checkbox, Dialog, notify } from '@/components/admin/ui';
import { adminFetch, isApiError } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { cleanDoi, DOI_PATTERN } from '../shared/form-utils';
import { emptyManualAuthor, MONTHS, speakerAuthor, STATUS_LABELS, type AuthorRow, type PublicationFormValues } from './publication-data';

type Key = keyof PublicationFormValues;

interface DiffRow {
  key: Key;
  label: string;
  current: string;
  incoming: string;
  /** The value written into the form when applied. */
  value: unknown;
  /** Current value is empty: safe to fill, checked by default. */
  fills: boolean;
}

const TEXT_FIELDS: Array<{ key: Key; label: string }> = [
  { key: 'title', label: 'Title' },
  { key: 'subtitle', label: 'Subtitle' },
  { key: 'containerTitle', label: 'Where it appeared' },
  { key: 'volume', label: 'Volume' },
  { key: 'issue', label: 'Issue' },
  { key: 'pages', label: 'Pages' },
  { key: 'publisher', label: 'Publisher' },
  { key: 'doi', label: 'DOI' },
  { key: 'isbn', label: 'ISBN' },
  { key: 'issn', label: 'ISSN' },
  { key: 'arxivId', label: 'arXiv id' },
  { key: 'url', label: 'Publisher link' },
  { key: 'abstract', label: 'Abstract' },
  { key: 'language', label: 'Language' },
  { key: 'license', label: 'License' },
  { key: 'citationKey', label: 'Citation key' },
];

const NUM_FIELDS: Array<{ key: Key; label: string; show: (n: number) => string }> = [
  { key: 'publishedYear', label: 'Year', show: (n) => String(n) },
  { key: 'publishedMonth', label: 'Month', show: (n) => MONTHS[n - 1] ?? String(n) },
  { key: 'publishedDay', label: 'Day', show: (n) => String(n) },
];

const clip = (s: string, max = 220) => (s.length > max ? `${s.slice(0, max).trimEnd()}...` : s);
const authorName = (a: AuthorRow) => (a.kind === 'speaker' ? (a.speaker?.fullName ?? '') : a.fullName);
const normName = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();

function buildDiff(current: PublicationFormValues, r: DoiLookupResult): { rows: DiffRow[]; same: number } {
  const rows: DiffRow[] = [];
  let same = 0;
  if (r.type && r.type !== current.type) {
    rows.push({ key: 'type', label: 'Type', current: PUBLICATION_TYPE_LABELS[current.type], incoming: PUBLICATION_TYPE_LABELS[r.type] ?? r.type, value: r.type, fills: false });
  } else if (r.type) same++;
  if (r.status && r.status !== current.status) {
    rows.push({ key: 'status', label: 'Status', current: STATUS_LABELS[current.status], incoming: STATUS_LABELS[r.status] ?? r.status, value: r.status, fills: false });
  }
  for (const f of TEXT_FIELDS) {
    const raw = (r as Record<string, unknown>)[f.key];
    if (raw == null || raw === '') continue;
    const incoming = f.key === 'doi' ? cleanDoi(String(raw)) : String(raw).trim();
    const now = String(current[f.key] ?? '').trim();
    if ((f.key === 'doi' ? cleanDoi(now) : now) === incoming) {
      same++;
      continue;
    }
    rows.push({ key: f.key, label: f.label, current: now, incoming, value: incoming, fills: !now });
  }
  for (const f of NUM_FIELDS) {
    const raw = (r as Record<string, unknown>)[f.key];
    if (typeof raw !== 'number') continue;
    const now = current[f.key] as number | null;
    if (now === raw) {
      same++;
      continue;
    }
    rows.push({ key: f.key, label: f.label, current: now == null ? '' : f.show(now), incoming: f.show(raw), value: raw, fills: now == null });
  }
  if (Array.isArray(r.keywords) && r.keywords.length) {
    const incoming = r.keywords.slice(0, 30).map((k) => k.slice(0, 60));
    const now = current.keywords;
    if (incoming.join('|').toLowerCase() !== now.join('|').toLowerCase()) {
      rows.push({ key: 'keywords', label: 'Keywords', current: now.join(', '), incoming: incoming.join(', '), value: incoming, fills: !now.length });
    } else same++;
  }
  if (Array.isArray(r.authorsRaw) && r.authorsRaw.length) {
    const now = current.authors.map(authorName).filter(Boolean);
    const incoming = r.authorsRaw.map((a) => a.fullName).filter(Boolean);
    if (normName(now.join('|')) !== normName(incoming.join('|'))) {
      rows.push({ key: 'authors', label: `Authors (${incoming.length})`, current: now.join(', '), incoming: incoming.join(', '), value: r.authorsRaw, fills: !now.length });
    } else same++;
  }
  return { rows, same };
}

/** Try to match Crossref names to the speaker directory, so authors link to their pages. */
async function toAuthorRows(raw: DoiLookupResult['authorsRaw']): Promise<{ rows: AuthorRow[]; matched: number }> {
  let matched = 0;
  const rows = await Promise.all(
    raw.slice(0, 100).map(async (a) => {
      const manual = emptyManualAuthor({ fullName: a.fullName.slice(0, 160), organization: (a.organization ?? '').slice(0, 200), url: a.orcid ? `https://orcid.org/${a.orcid.replace(/^https?:\/\/orcid\.org\//, '')}` : '' });
      const orgOverride = (s: SpeakerRef) => (a.organization && a.organization !== s.defaultOrganization ? a.organization.slice(0, 200) : '');
      // The API already matched this name to exactly one speaker.
      if (a.speaker) {
        matched++;
        return speakerAuthor(a.speaker, { organization: orgOverride(a.speaker) });
      }
      // The API looked and found nobody (null): keep it manual. Undefined means it did not look.
      if (a.speaker === null) return manual;
      try {
        const res = await adminFetch<SpeakerRef[] | { items: SpeakerRef[] }>('/admin/speakers/lookup', { query: { q: a.fullName } });
        const list = Array.isArray(res) ? res : (res.items ?? []);
        const hit = list.find((s) => normName(s.fullName) === normName(a.fullName));
        if (hit) {
          matched++;
          return speakerAuthor(hit, { organization: orgOverride(hit) });
        }
      } catch {
        /* lookup is a nice-to-have */
      }
      return manual;
    }),
  );
  return { rows, matched };
}

export interface DoiFillProps {
  doi: string;
  getValues: () => PublicationFormValues;
  apply: (entries: Array<[Key, unknown]>) => void;
  disabled?: boolean;
}

/** "Fill from DOI": asks Crossref (through the API), shows a diff, applies only what you tick. */
export function DoiFill({ doi, getValues, apply, disabled }: DoiFillProps) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [diff, setDiff] = useState<{ rows: DiffRow[]; same: number; doi: string } | null>(null);
  const [picked, setPicked] = useState<Set<Key>>(new Set());
  const clean = cleanDoi(doi);
  const valid = DOI_PATTERN.test(clean);

  const lookup = async () => {
    if (!valid) {
      notify.warning('Paste a DOI first, like 10.1038/nature14539.');
      return;
    }
    setLoading(true);
    try {
      const res = await adminFetch<DoiLookupResult>('/admin/publications/doi', { query: { doi: clean } });
      const d = buildDiff(getValues(), { ...res, authorsRaw: res.authorsRaw ?? [] });
      if (!d.rows.length) {
        notify.success(d.same ? 'Crossref agrees with everything here already. Nice.' : 'Crossref had nothing new for this one.');
        return;
      }
      setDiff({ ...d, doi: clean });
      setPicked(new Set(d.rows.filter((r) => r.fills).map((r) => r.key)));
    } catch (err) {
      const msg = isApiError(err)
        ? err.isNotFound
          ? "Crossref doesn't know that DOI. Double-check it, or fill things in by hand."
          : err.isNetwork || err.status >= 500
            ? 'Crossref is not answering right now. Try again in a minute, or fill it in by hand.'
            : err.message
        : 'That lookup went sideways. Try again in a moment.';
      notify.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    if (!diff) return;
    setApplying(true);
    try {
      const entries: Array<[Key, unknown]> = [];
      let matched = 0;
      for (const row of diff.rows) {
        if (!picked.has(row.key)) continue;
        if (row.key === 'authors') {
          const res = await toAuthorRows(row.value as DoiLookupResult['authorsRaw']);
          matched = res.matched;
          entries.push(['authors', res.rows]);
        } else entries.push([row.key, row.value]);
      }
      apply(entries);
      const n = entries.length;
      notify.success(n === 1 ? 'Filled 1 field from Crossref.' : `Filled ${n} fields from Crossref.`, {
        celebrate: 'square',
        description: matched ? `${matched === 1 ? '1 author matches someone' : `${matched} authors match people`} in the speaker directory, so they are linked.` : undefined,
      });
      setDiff(null);
    } finally {
      setApplying(false);
    }
  };

  const allOn = diff ? diff.rows.every((r) => picked.has(r.key)) : false;

  return (
    <>
      <Button type="button" variant="blue" icon={<Sparkles />} onClick={() => void lookup()} loading={loading} disabled={disabled || !clean}>
        Fill from DOI
      </Button>
      <Dialog
        open={Boolean(diff)}
        onOpenChange={(o) => !o && !applying && setDiff(null)}
        size="lg"
        accent="yellow"
        title="Crossref found this"
        description={
          diff ? (
            <>
              For <span className="mono text-ink-2">{diff.doi}</span>. Tick what to bring in. Nothing changes until you press Apply.
              {diff.same ? ` ${diff.same} ${diff.same === 1 ? 'field already matches' : 'fields already match'}.` : ''}
            </>
          ) : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setDiff(null)} disabled={applying}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void confirm()} loading={applying} disabled={!picked.size}>
              {picked.size ? `Apply ${picked.size} ${picked.size === 1 ? 'change' : 'changes'}` : 'Pick something'}
            </Button>
          </>
        }
      >
        {diff ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
              <Checkbox
                checked={allOn ? true : picked.size ? 'indeterminate' : false}
                onCheckedChange={(c) => setPicked(c ? new Set(diff.rows.map((r) => r.key)) : new Set())}
                label="Select everything"
              />
              <span className="text-[0.8125rem] text-ink-3">Empty fields are ticked for you. Anything you already typed is left alone unless you tick it.</span>
            </div>
            <ul className="space-y-2" aria-label="Changes from Crossref">
              {diff.rows.map((row) => {
                const on = picked.has(row.key);
                return (
                  <li key={row.key} className={cn('rounded-2xl border p-3 transition-colors', on ? 'border-blue/40 bg-blue-50/40' : 'border-line bg-white')}>
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={on}
                        aria-label={`Use Crossref's ${row.label.toLowerCase()}`}
                        onCheckedChange={(c) =>
                          setPicked((p) => {
                            const next = new Set(p);
                            if (c) next.add(row.key);
                            else next.delete(row.key);
                            return next;
                          })
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-ink">{row.label}</span>
                          {row.fills ? (
                            <Badge size="sm" tone="green">
                              Empty now
                            </Badge>
                          ) : (
                            <Badge size="sm" tone="yellow">
                              Replaces yours
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-1.5 text-[0.875rem] sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-start sm:gap-3">
                          <p className={cn('min-w-0 break-words', row.current ? (on ? 'text-ink-3 line-through decoration-red/60' : 'text-ink-2') : 'text-ink-4 italic')}>
                            {row.current ? clip(row.current) : 'Nothing yet'}
                          </p>
                          <ArrowRight className="hidden size-4 text-ink-4 sm:mt-0.5 sm:block" aria-hidden="true" />
                          <p className={cn('min-w-0 rounded-lg px-1.5 break-words', on ? 'bg-green-50 text-ink' : 'text-ink-2')}>
                            <span className="sr-only">From Crossref: </span>
                            {clip(row.incoming)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
