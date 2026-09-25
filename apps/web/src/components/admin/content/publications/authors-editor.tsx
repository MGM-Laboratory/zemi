'use client';

import { slugify, type SpeakerAdmin, type SpeakerRef } from '@zemi/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, ExternalLink, Mail, Trash2, UserPlus } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { DragHandle, ImageUploadCrop, SortableList, SpeakerPicker, useReadOnly } from '@/components/admin/fields';
import { Avatar, Badge, Button, Dialog, Field, IconButton, Input, notify, Switch, Tooltip } from '@/components/admin/ui';
import { api } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { adminRoutes } from '@/lib/admin/nav';
import { adminKeys } from '@/lib/admin/query-keys';
import { emptyManualAuthor, speakerAuthor, type AuthorRow } from './publication-data';

type RowErrors = { speaker?: { message?: string }; fullName?: { message?: string }; url?: { message?: string }; organization?: { message?: string } };

export interface AuthorsEditorProps {
  value: AuthorRow[];
  onChange: (rows: AuthorRow[]) => void;
  errors?: Array<RowErrors | undefined>;
  readOnly?: boolean;
  /** Error on the whole list (like "max 100"). */
  listError?: string;
}

/**
 * Sortable authors: people from the speaker directory (linked, with an optional organization
 * override for this paper) or anyone else typed in by hand (name, photo, organization, link).
 * Order is the byline order. Any number of corresponding authors.
 */
export function AuthorsEditor({ value, onChange, errors, readOnly: ro, listError }: AuthorsEditorProps) {
  const readOnly = useReadOnly(ro);
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  const focusKey = useRef<string | null>(null);
  // Uploads call back after a delay; always patch the latest rows, never a stale copy.
  const latest = useRef(value);
  latest.current = value;
  const update = (key: string, patch: Partial<AuthorRow>) => onChange(latest.current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => onChange(latest.current.filter((r) => r.key !== key));
  const speakerIds = value.flatMap((r) => (r.kind === 'speaker' && r.speaker ? [r.speaker.id] : []));
  const photoRow = value.find((r) => r.key === photoFor) ?? null;

  const createSpeaker = async (name: string): Promise<SpeakerRef | void> => {
    const fullName = name.trim();
    if (!fullName) return;
    try {
      const s = await api.post<SpeakerAdmin>('/admin/speakers', { fullName, slug: slugify(fullName), visibility: 'published', bio: [], links: [] });
      void qc.invalidateQueries({ queryKey: adminKeys.speakers.all });
      notify.success(`${s.fullName} is in the speaker directory now.`, { celebrate: 'circle' });
      return s;
    } catch (err) {
      notify.error(err);
    }
  };

  return (
    <div className="space-y-3">
      {value.length ? (
        <SortableList
          items={value}
          getId={(r) => r.key}
          onReorder={onChange}
          readOnly={readOnly}
          aria-label="Authors, in byline order"
          itemLabel={(r) => (r.kind === 'speaker' ? r.speaker?.fullName : r.fullName) || 'author'}
          renderItem={(row, { index, handle, isDragging }) => {
            const err = errors?.[index];
            const name = row.kind === 'speaker' ? (row.speaker?.fullName ?? '') : row.fullName;
            const image = row.kind === 'speaker' ? (row.speaker?.avatar ?? null) : row.avatar;
            return (
              <motion.div
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'rounded-2xl border bg-white p-2.5 transition-[border-color,box-shadow] sm:p-3',
                  isDragging ? 'border-blue shadow-[var(--shadow-2)]' : 'border-line',
                  (err?.speaker || err?.fullName || err?.url) && 'border-red/40',
                )}
              >
                <div className="flex items-start gap-2 sm:gap-3">
                  <div className="flex shrink-0 items-center gap-0.5 pt-1">
                    <DragHandle {...handle} disabled={readOnly} label={`Move ${name || 'author'}`} />
                    <span className="mono w-5 text-center text-xs text-ink-4" aria-hidden="true">
                      {index + 1}
                    </span>
                  </div>

                  {row.kind === 'manual' && !readOnly ? (
                    <Tooltip content={image ? 'Change photo' : 'Add a photo'}>
                      <button
                        type="button"
                        onClick={() => setPhotoFor(row.key)}
                        className="group relative mt-0.5 shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                        aria-label={`${image ? 'Change' : 'Add'} photo for ${name || 'this author'}`}
                      >
                        <Avatar name={name || '?'} image={image} size={40} />
                        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                          <Camera className="size-4" aria-hidden="true" />
                        </span>
                      </button>
                    </Tooltip>
                  ) : (
                    <Avatar name={name || '?'} image={image} size={40} className="mt-0.5 shrink-0" />
                  )}

                  <div className="min-w-0 flex-1 space-y-2">
                    {row.kind === 'speaker' ? (
                      <>
                        <div className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1">
                          {row.speaker ? (
                            <Link href={adminRoutes.speaker(row.speaker.id)} className="truncate font-semibold text-ink hover:text-blue focus-visible:outline-2 focus-visible:outline-focus">
                              {row.speaker.fullName}
                            </Link>
                          ) : (
                            <span className="text-red-600">Pick a speaker</span>
                          )}
                          <Badge size="sm" tone="blue" shape="circle">
                            Speaker
                          </Badge>
                          {row.speaker?.defaultOrganization ? <span className="truncate text-sm text-ink-3">{row.speaker.defaultOrganization}</span> : null}
                        </div>
                        <Input
                          size="sm"
                          aria-label={`Organization on this paper for ${name}`}
                          placeholder={row.speaker?.defaultOrganization ? `Same as their profile: ${row.speaker.defaultOrganization}` : 'Organization on this paper'}
                          value={row.organization}
                          readOnly={readOnly}
                          maxLength={200}
                          onChange={(e) => update(row.key, { organization: e.target.value })}
                        />
                        {err?.speaker?.message ? <p className="text-[0.8125rem] font-medium text-red-600">{err.speaker.message}</p> : null}
                      </>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <Input
                            size="sm"
                            aria-label="Full name"
                            aria-invalid={Boolean(err?.fullName) || undefined}
                            placeholder="Full name"
                            value={row.fullName}
                            readOnly={readOnly}
                            maxLength={160}
                            ref={(el) => {
                              if (el && focusKey.current === row.key) {
                                focusKey.current = null;
                                el.focus();
                              }
                            }}
                            onChange={(e) => update(row.key, { fullName: e.target.value })}
                          />
                          {err?.fullName?.message ? <p className="mt-1 text-[0.8125rem] font-medium text-red-600">{err.fullName.message}</p> : null}
                        </div>
                        <Input size="sm" aria-label="Organization" placeholder="Organization" value={row.organization} readOnly={readOnly} maxLength={200} onChange={(e) => update(row.key, { organization: e.target.value })} />
                        <div>
                          <Input
                            size="sm"
                            aria-label="Profile link"
                            aria-invalid={Boolean(err?.url) || undefined}
                            placeholder="Profile link, like ORCID"
                            inputMode="url"
                            value={row.url}
                            readOnly={readOnly}
                            onChange={(e) => update(row.key, { url: e.target.value })}
                            trailing={
                              row.url && /^https?:\/\//.test(row.url) ? (
                                <a href={row.url} target="_blank" rel="noopener noreferrer" aria-label="Open profile link" className="mr-2 flex text-ink-4 hover:text-blue">
                                  <ExternalLink className="size-4" />
                                </a>
                              ) : null
                            }
                          />
                          {err?.url?.message ? <p className="mt-1 text-[0.8125rem] font-medium text-red-600">{err.url.message}</p> : null}
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Switch
                        size="sm"
                        checked={row.isCorresponding}
                        onCheckedChange={(c) => update(row.key, { isCorresponding: c })}
                        disabled={readOnly}
                        label={
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            <Mail className="size-3.5 text-ink-4" aria-hidden="true" /> Corresponding author
                          </span>
                        }
                      />
                    </div>
                  </div>

                  {readOnly ? null : (
                    <IconButton label={`Remove ${name || 'author'}`} size="sm" variant="danger" className="shrink-0" onClick={() => remove(row.key)}>
                      <Trash2 />
                    </IconButton>
                  )}
                </div>
              </motion.div>
            );
          }}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface-muted px-4 py-6 text-center text-sm text-ink-3">
          {readOnly ? 'No authors listed.' : 'No authors yet. Pull people from the speaker directory so their names link to their pages, or type anyone else in.'}
        </div>
      )}

      {listError ? <p className="text-[0.8125rem] font-medium text-red-600">{listError}</p> : null}

      {readOnly ? null : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label="Add from the speaker directory" hint="Linked authors show their photo and link to their page.">
            <SpeakerPicker
              value={null}
              exclude={speakerIds}
              placeholder="Find a speaker"
              onChange={(s) => {
                if (s) onChange([...value, speakerAuthor(s)]);
              }}
              onCreate={createSpeaker}
            />
          </Field>
          <Button
            type="button"
            variant="secondary"
            icon={<UserPlus />}
            className="sm:mb-[1.6rem]"
            onClick={() => {
              const row = emptyManualAuthor();
              focusKey.current = row.key;
              onChange([...value, row]);
            }}
          >
            Add someone else
          </Button>
        </div>
      )}

      <AnimatePresence>
        {photoRow ? (
          <Dialog
            open
            onOpenChange={(o) => !o && setPhotoFor(null)}
            title={photoRow.fullName ? `Photo for ${photoRow.fullName}` : 'Author photo'}
            description="Square and friendly. It shows next to their name on the paper page."
            size="sm"
            footer={
              <Button variant="primary" onClick={() => setPhotoFor(null)}>
                Done
              </Button>
            }
          >
            <div className="flex justify-center py-2">
              <ImageUploadCrop
                purpose="author-avatar"
                value={photoRow.avatarAssetId}
                initialImage={photoRow.avatar}
                alt={photoRow.fullName || null}
                onChange={(id, asset) => update(photoRow.key, { avatarAssetId: id, avatar: asset?.image ?? (id ? photoRow.avatar : null) })}
              />
            </div>
          </Dialog>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
