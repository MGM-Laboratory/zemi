'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  jakartaDateInput,
  PUBLICATION_STATUSES,
  PUBLICATION_TYPE_LABELS,
  PUBLICATION_TYPES,
  publicationInput,
  publicationUpdateInput,
  SLUG_PATTERN,
  type PublicationAdmin,
  type PublicationInput,
  type PublicationStatus,
  type PublicationType,
} from '@zemi/shared';
import { Copy, ExternalLink, MoreHorizontal, Trash2, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Controller, useWatch, type Control, type FieldErrors, type UseFormReturn } from 'react-hook-form';
import { BlockEditor, FILE_ACCEPT, FileUpload, ImageUploadCrop, ReadOnlyScope, SlugField, TagsInput } from '@/components/admin/fields';
import {
  Badge,
  Button,
  Callout,
  Card,
  DateText,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ErrorState,
  FormError,
  FormSaveBar,
  IconButton,
  Input,
  notify,
  NumberInput,
  PageHeader,
  Select,
  StatusChip,
  Textarea,
  useCopy,
} from '@/components/admin/ui';
import { ScopedFormField as FormField } from '../shared/scoped-form-field';
import { useAbility, useRefetchMe } from '@/lib/admin/ability';
import { api, errorMessage } from '@/lib/admin/api';
import { useBreadcrumbs } from '@/lib/admin/breadcrumbs';
import { applyApiErrorToForm, useZodForm } from '@/lib/admin/form';
import { isRevalidatingOnMount, useAdminMutation, useDebouncedValue } from '@/lib/admin/hooks';
import { adminRoutes } from '@/lib/admin/nav';
import { publicPaths, SITE_URL } from '@/lib/admin/paths';
import { adminKeys } from '@/lib/admin/query-keys';
import { EditorCard, EditorSkeleton, FieldGroup, NoCreateAccess, ReadOnlyNote, SectionNav, VisibilityField, type EditorSection } from '../shared/content-ui';
import { cleanDoi, DOI_PATTERN, pickDirty, wordCount } from '../shared/form-utils';
import { effectiveActions } from '../shared/types';
import { useDirtyGuard } from '../shared/use-dirty-guard';
import { AuthorsEditor } from './authors-editor';
import { CitePreview } from './cite-preview';
import { DoiFill } from './doi-fill';
import { PubLinksEditor } from './pub-links-editor';
import { DeletePublicationDialog, RelatedEventsCard } from './publication-activity';
import {
  containerLabel,
  EMPTY_PUBLICATION,
  formToCitation,
  formToInput,
  LANGUAGE_SUGGESTIONS,
  LICENSE_SUGGESTIONS,
  MONTHS,
  publicationFormSchema,
  publicationToForm,
  STATUS_LABELS,
  suggestCitationKey,
  useDoiTwins,
  usePublication,
  type PublicationFormValues,
} from './publication-data';

type Form = UseFormReturn<PublicationFormValues, unknown, PublicationFormValues>;
type Ctl = Control<PublicationFormValues, unknown, PublicationFormValues>;

const TYPE_OPTIONS = PUBLICATION_TYPES.map((t) => ({ value: t, label: PUBLICATION_TYPE_LABELS[t] }));
const STATUS_OPTIONS = PUBLICATION_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }));
const MONTH_OPTIONS = MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));

const SECTION_FIELDS: Record<string, Array<keyof PublicationFormValues>> = {
  basics: ['type', 'status', 'title', 'subtitle', 'slug', 'visibility'],
  authors: ['authors'],
  venue: ['containerTitle', 'volume', 'issue', 'pages', 'publisher', 'publishedYear', 'publishedMonth', 'publishedDay'],
  identifiers: ['doi', 'isbn', 'issn', 'arxivId', 'citationKey'],
  files: ['pdfAssetId', 'coverAssetId', 'url', 'links'],
  content: ['abstract', 'body', 'keywords', 'language', 'license'],
};

/** /admin/publications/new and /admin/publications/[id]. */
export function PublicationEditor({ id }: { id?: string }) {
  const ability = useAbility();
  const q = usePublication(id ?? null);
  useBreadcrumbs([{ label: 'Publications', href: adminRoutes.publications }, { label: id ? (q.data?.title ?? 'Publication') : 'New publication' }]);
  if (!id) {
    if (!ability.has('publications.create')) return <NoCreateAccess what="publications" />;
    return <PublicationForm />;
  }
  if (q.isPending || isRevalidatingOnMount(q)) return <EditorSkeleton aside={false} />;
  if (q.isError)
    return (
      <ErrorState
        error={q.error}
        onRetry={() => void q.refetch()}
        retrying={q.isFetching}
        action={
          <Button asChild variant="ghost">
            <Link href={adminRoutes.publications}>Back to publications</Link>
          </Button>
        }
      />
    );
  return <PublicationForm key={q.data.id} pub={q.data} />;
}

function PublicationForm({ pub }: { pub?: PublicationAdmin }) {
  const isCreate = !pub;
  const router = useRouter();
  const qc = useQueryClient();
  const ability = useAbility();
  const refetchMe = useRefetchMe();
  const [copy] = useCopy();
  const actions = isCreate
    ? new Set(['view', 'edit', 'publish', 'delete'] as const)
    : effectiveActions(pub.permissions, (a) => ability.can('publication', pub.id, a));
  const canEdit = actions.has('edit');
  const canPublish = actions.has('publish');
  const canDelete = !isCreate && actions.has('delete');

  const form = useZodForm(publicationFormSchema, { defaultValues: pub ? publicationToForm(pub) : EMPTY_PUBLICATION }) as unknown as Form;
  const { control } = form;
  const dirty = form.formState.isDirty;
  const errors = form.formState.errors;
  const { release } = useDirtyGuard(dirty && canEdit);
  const [bodyKey, setBodyKey] = useState(0);
  const bodyTouched = useRef(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const create = useAdminMutation({
    mutationFn: (body: PublicationInput) => api.post<PublicationAdmin>('/admin/publications', body),
    invalidate: [adminKeys.publications.lists(), [...adminKeys.publications.all, 'lookup'], adminKeys.speakers.details(), adminKeys.overview()],
    successMessage: 'On the shelf. Nice work.',
    celebrate: true,
    errorToast: (err) => (err.hasFieldErrors ? false : errorMessage(err)),
    onError: (err) => void applyApiErrorToForm(form, err),
    onSuccess: async (p) => {
      qc.setQueryData(adminKeys.publications.detail(p.id), p);
      release();
      await refetchMe().catch(() => undefined);
      router.replace(adminRoutes.publication(p.id));
    },
  });
  const update = useAdminMutation({
    mutationFn: (patch: Partial<PublicationInput>) => api.patch<PublicationAdmin>(`/admin/publications/${pub!.id}`, patch),
    invalidate: [adminKeys.publications.lists(), [...adminKeys.publications.all, 'lookup'], adminKeys.speakers.details()],
    successMessage: 'Saved. The public page updates in a moment.',
    errorToast: (err) => (err.hasFieldErrors ? false : errorMessage(err)),
    onError: (err) => void applyApiErrorToForm(form, err),
    onSuccess: (p) => {
      qc.setQueryData(adminKeys.publications.detail(p.id), p);
      form.reset(publicationToForm(p));
    },
  });
  const saving = create.isPending || update.isPending;

  const submit = form.handleSubmit(
    (values) => {
      const input = formToInput(values);
      if (isCreate) {
        const parsed = publicationInput.safeParse(input);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          notify.error(`${issue?.path.join('.') || 'Something'}: ${issue?.message ?? 'needs a look.'}`);
          return;
        }
        create.mutate(input);
        return;
      }
      const patch = pickDirty(input as unknown as Record<string, unknown>, form.formState.dirtyFields as Record<string, unknown>) as Partial<PublicationInput>;
      // Year, month and day travel together: clearing the year also clears month and day in formToInput,
      // but those two are not "dirty", so without this the server would keep a month with no year.
      if ('publishedYear' in patch || 'publishedMonth' in patch || 'publishedDay' in patch) {
        patch.publishedYear = input.publishedYear;
        patch.publishedMonth = input.publishedMonth;
        patch.publishedDay = input.publishedDay;
      }
      if (!canPublish) delete patch.visibility;
      if (!Object.keys(patch).length) {
        notify.info('Nothing changed, so nothing to save.');
        return;
      }
      const parsed = publicationUpdateInput.safeParse(patch);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        notify.error(`${issue?.path.join('.') || 'Something'}: ${issue?.message ?? 'needs a look.'}`);
        return;
      }
      update.mutate(patch);
    },
    (errs) => {
      const first = Object.keys(errs)[0];
      const section = Object.entries(SECTION_FIELDS).find(([, keys]) => keys.includes(first as keyof PublicationFormValues))?.[0];
      notify.error('A few fields need a look before this saves.', { description: section ? `Start with ${sectionLabel(section)}.` : undefined });
    },
  );

  const onDiscard = () => {
    form.reset();
    bodyTouched.current = false;
    setBodyKey((k) => k + 1);
  };

  const hasErr = (key: string) => SECTION_FIELDS[key]?.some((f) => Boolean((errors as FieldErrors<PublicationFormValues>)[f]));
  const sections: EditorSection[] = [
    { id: 'basics', label: 'Basics', shape: 'circle', invalid: hasErr('basics') },
    { id: 'authors', label: 'Authors', shape: 'arch', invalid: hasErr('authors') },
    { id: 'venue', label: 'Where it appeared', shape: 'square', invalid: hasErr('venue') },
    { id: 'identifiers', label: 'Identifiers', shape: 'triangle', invalid: hasErr('identifiers') },
    { id: 'files', label: 'Files and links', shape: 'square', invalid: hasErr('files') },
    { id: 'content', label: 'Content', shape: 'circle', invalid: hasErr('content') },
    { id: 'cite', label: 'Cite this', shape: 'arch' },
    { id: 'events', label: 'Related events', shape: 'triangle', hidden: isCreate },
  ];

  const publicUrl = `${SITE_URL}${publicPaths.publication(pub?.slug ?? '')}`;
  const isPublic = pub && pub.visibility !== 'draft';

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <PageHeader
        back={{ href: adminRoutes.publications, label: 'Publications' }}
        eyebrow={<HeaderChips control={control} />}
        title={<WatchedTitle control={control} fallback={isCreate ? 'New publication' : pub.title} />}
        description={isCreate ? 'Paste a DOI and let Crossref do the typing, or fill it in by hand. Papers, projects, theses, datasets, anything with a story.' : undefined}
        actions={
          <>
            {isPublic ? (
              <Button variant="secondary" icon={<ExternalLink />} asChild>
                <a href={publicPaths.publication(pub.slug)} target="_blank" rel="noopener noreferrer">
                  View on site
                </a>
              </Button>
            ) : null}
            {pub ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton label="More actions" variant="secondary">
                    <MoreHorizontal />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <DropdownMenuItem icon={<Copy />} onSelect={() => void copy(publicUrl).then((ok) => (ok ? notify.success('Public link copied.') : notify.error("Couldn't copy. Your browser said no.")))}>
                    Copy public link
                  </DropdownMenuItem>
                  {canDelete ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem icon={<Trash2 />} destructive onSelect={() => setDeleteOpen(true)}>
                        Delete publication
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {canEdit ? (
              <Button type="submit" variant="primary" loading={saving} disabled={!isCreate && !dirty}>
                {isCreate ? 'Add publication' : 'Save'}
              </Button>
            ) : null}
          </>
        }
      />

      {!canEdit ? <ReadOnlyNote>You can look around here, but not edit. Ask the superadmin if you need edit access.</ReadOnlyNote> : null}
      <FormError errors={errors} className="mb-5" />

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[11rem_minmax(0,1fr)] 2xl:grid-cols-[11rem_minmax(0,1fr)_25rem]">
        <SectionNav sections={sections} className="min-w-0 lg:sticky lg:top-[calc(var(--admin-topbar-h,60px)+4.5rem)] lg:self-start" />

        <ReadOnlyScope readOnly={!canEdit}>
          <div className="min-w-0 space-y-6">
            {/* Basics */}
            <EditorCard id="basics" title="Basics" description="What it is, what it is called, and who can see it.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField control={control} name="type" label="Type" required>
                  {(field) => <Select<PublicationType> value={field.value} onValueChange={(v) => v && field.onChange(v)} options={TYPE_OPTIONS} />}
                </FormField>
                <FormField control={control} name="status" label="Status" required hint="Where it is on its way to the world.">
                  {(field) => <Select<PublicationStatus> value={field.value} onValueChange={(v) => v && field.onChange(v)} options={STATUS_OPTIONS} />}
                </FormField>
                <FormField control={control} name="title" label="Title" required maxLength={400} className="sm:col-span-2">
                  {(field) => <Textarea {...field} value={field.value ?? ''} autosize minRows={1} maxRows={4} placeholder="Deep learning" className="font-semibold" />}
                </FormField>
                <FormField control={control} name="subtitle" label="Subtitle" optional maxLength={400} className="sm:col-span-2">
                  {(field) => <Input {...field} value={field.value ?? ''} placeholder="The part after the colon" />}
                </FormField>
                <div className="sm:col-span-2">
                  <SlugWithTitle control={control} savedSlug={pub?.slug} isCreate={isCreate} />
                </div>
                <FormField control={control} name="visibility" label="Visibility" className="sm:col-span-2">
                  {(field) => (
                    <VisibilityField
                      noun="publication"
                      value={field.value}
                      onChange={field.onChange}
                      readOnly={!canEdit || !canPublish}
                      lockedReason={canEdit && !canPublish ? 'Changing visibility needs publish access for this publication.' : undefined}
                    />
                  )}
                </FormField>
              </div>
            </EditorCard>

            {/* Authors */}
            <EditorCard id="authors" title="Authors" description="In byline order. Drag to reorder. Speakers link to their Zemi page.">
              {/* A plain Controller, not FormField: a Field would hand one id and one error state to every row. */}
              <Controller
                control={control}
                name="authors"
                render={({ field, fieldState }) => (
                  <FieldGroup label="Authors" hideLabel>
                    <AuthorsEditor
                      value={field.value ?? []}
                      onChange={field.onChange}
                      errors={errors.authors as never}
                      listError={fieldState.error && !Array.isArray(errors.authors) ? fieldState.error.message : undefined}
                    />
                  </FieldGroup>
                )}
              />
            </EditorCard>

            {/* Where it appeared */}
            <EditorCard id="venue" title="Where it appeared" description="The journal, conference or place, and when.">
              <VenueFields control={control} />
            </EditorCard>

            {/* Identifiers */}
            <EditorCard id="identifiers" title="Identifiers" description="The numbers that make it findable. A DOI can fill most of this page for you.">
              <IdentifierFields form={form} readOnly={!canEdit} selfId={pub?.id} />
            </EditorCard>

            {/* Files and links */}
            <EditorCard id="files" title="Files and links" description="A PDF people can read here, a cover for the card, and anywhere else it lives.">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_14rem]">
                <div className="min-w-0 space-y-5">
                  <FormField control={control} name="pdfAssetId" label="PDF mirror" optional hint="Served from Zemi, so the paper stays readable even if the publisher link moves. Only upload what you are allowed to share.">
                    {(field) => <FileUpload purpose="publication-pdf" accept={FILE_ACCEPT.pdf} value={field.value} initialFile={pub?.pdf} onChange={(assetId) => field.onChange(assetId)} />}
                  </FormField>
                  <FormField control={control} name="url" label="Publisher link" optional hint="The official page, like the journal's article page.">
                    {(field) => <UrlInput value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} placeholder="https://www.nature.com/articles/..." />}
                  </FormField>
                  <Controller
                    control={control}
                    name="links"
                    render={({ field, fieldState }) => (
                      <FieldGroup
                        label="More links"
                        optional
                        hint="Code, data, slides, a video. Paste a URL and we guess the kind."
                        error={!Array.isArray(errors.links) ? fieldState.error?.message : undefined}
                      >
                        <PubLinksEditor value={field.value ?? []} onChange={field.onChange} errors={errors.links as never} />
                      </FieldGroup>
                    )}
                  />
                </div>
                <FormField control={control} name="coverAssetId" label="Cover" optional>
                  {(field) => (
                    <ImageUploadCrop
                      purpose="publication-cover"
                      value={field.value}
                      initialImage={pub?.cover}
                      alt={pub?.title ?? null}
                      onChange={(assetId) => field.onChange(assetId)}
                      hint="4:5, like a book. A striking figure works great."
                    />
                  )}
                </FormField>
              </div>
            </EditorCard>

            {/* Content */}
            <EditorCard id="content" title="Content" description="The abstract, and anything else worth saying about it.">
              <div className="space-y-5">
                <FormField control={control} name="abstract" label="Abstract" optional>
                  {(field) => (
                    <div className="space-y-1.5">
                      <Textarea {...field} value={field.value ?? ''} autosize minRows={5} maxRows={18} maxLength={20000} placeholder="Paste the abstract. Plain text is best." />
                      <WordCount text={field.value ?? ''} />
                    </div>
                  )}
                </FormField>
                <FormField control={control} name="body" label="More about it" optional hint="The story behind the paper, figures, what is next. Type / for blocks.">
                  {(field) => (
                    <div
                      onPointerDownCapture={() => (bodyTouched.current = true)}
                      onKeyDownCapture={() => (bodyTouched.current = true)}
                      onPasteCapture={() => (bodyTouched.current = true)}
                      onDropCapture={() => (bodyTouched.current = true)}
                    >
                      <BlockEditor
                        key={bodyKey}
                        value={field.value}
                        onChange={(blocks) => {
                          if (bodyTouched.current) field.onChange(blocks);
                        }}
                        placeholder="What should a curious undergrad know before reading this?"
                        minHeight="12rem"
                      />
                    </div>
                  )}
                </FormField>
                <FormField control={control} name="keywords" label="Keywords" optional hint="Enter or a comma adds one. Up to 30.">
                  {(field) => <TagsInput value={field.value ?? []} onChange={field.onChange} max={30} maxLength={60} normalize={false} placeholder="deep learning, representation learning" />}
                </FormField>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField control={control} name="language" label="Language" optional maxLength={40}>
                    {(field) => <SuggestInput {...field} value={field.value ?? ''} listId="pub-languages" suggestions={LANGUAGE_SUGGESTIONS} placeholder="English" />}
                  </FormField>
                  <FormField control={control} name="license" label="License" optional maxLength={80}>
                    {(field) => <SuggestInput {...field} value={field.value ?? ''} listId="pub-licenses" suggestions={LICENSE_SUGGESTIONS} placeholder="CC BY 4.0" />}
                  </FormField>
                </div>
              </div>
            </EditorCard>

            {pub ? <RelatedEventsCard events={pub.events ?? []} /> : null}

            {pub ? (
              <Card muted padding="sm" className="flex flex-wrap items-center justify-between gap-3 px-5 text-[0.8125rem] text-ink-3">
                <span>
                  Added <DateText value={pub.createdAt} format="date" /> · Last changed <DateText value={pub.updatedAt} format="relative" />
                </span>
                {canDelete ? (
                  <Button type="button" variant="danger-soft" size="sm" icon={<Trash2 />} onClick={() => setDeleteOpen(true)}>
                    Delete publication
                  </Button>
                ) : null}
              </Card>
            ) : null}
          </div>
        </ReadOnlyScope>

        <div className="min-w-0 lg:col-start-2 2xl:col-start-3 2xl:row-start-1">
          <div className="2xl:sticky 2xl:top-[calc(var(--admin-topbar-h,60px)+4.5rem)]">
            <LiveCite control={control} />
          </div>
        </div>
      </div>

      {canEdit ? <FormSaveBar form={form} saving={saving} onSave={() => void submit()} onDiscard={onDiscard} alwaysVisible={isCreate} saveLabel={isCreate ? 'Add publication' : 'Save changes'} /> : null}

      {pub ? (
        <DeletePublicationDialog
          pub={{ id: pub.id, title: pub.title, slug: pub.slug, eventCount: pub.events?.length ?? 0 }}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onDeleted={() => {
            release();
            router.replace(adminRoutes.publications);
          }}
        />
      ) : null}
    </form>
  );
}

function sectionLabel(id: string) {
  return (
    {
      basics: 'Basics',
      authors: 'Authors',
      venue: 'Where it appeared',
      identifiers: 'Identifiers',
      files: 'Files and links',
      content: 'Content',
    } as Record<string, string>
  )[id] ?? id;
}

/* ------------------------------------------------------------------ small watchers (keep re-renders local) */

function WatchedTitle({ control, fallback }: { control: Ctl; fallback: string }) {
  const title = useWatch({ control, name: 'title' });
  return <>{title?.trim() || fallback}</>;
}

function HeaderChips({ control }: { control: Ctl }) {
  const [visibility, type, status] = useWatch({ control, name: ['visibility', 'type', 'status'] });
  return (
    <>
      <StatusChip kind="visibility" value={visibility ?? 'published'} size="sm" />
      <Badge size="sm" tone="outline">
        {PUBLICATION_TYPE_LABELS[type as PublicationType] ?? type}
      </Badge>
      {status && status !== 'published' ? (
        <Badge size="sm" tone="yellow" shape="square">
          {STATUS_LABELS[status as PublicationStatus]}
        </Badge>
      ) : null}
    </>
  );
}

function SlugWithTitle({ control, savedSlug, isCreate }: { control: Ctl; savedSlug?: string; isCreate: boolean }) {
  const title = useWatch({ control, name: 'title' }) ?? '';
  return (
    <FormField control={control} name="slug" label="Page link" required>
      {(field) => (
        <SlugField value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} source={title} basePath="/publications/" savedSlug={savedSlug} auto={isCreate ? undefined : false} />
      )}
    </FormField>
  );
}

function LiveCite({ control }: { control: Ctl }) {
  const values = useWatch({ control }) as Partial<PublicationFormValues>;
  // Same options the public page passes: its own URL when there is no DOI or publisher link, and today's date.
  const [accessedAt] = useState(() => jakartaDateInput(new Date()));
  const slug = values.slug?.trim();
  const fallbackUrl = slug && SLUG_PATTERN.test(slug) ? `${SITE_URL}${publicPaths.publication(slug)}` : null;
  return <CitePreview source={formToCitation(values, { fallbackUrl, accessedAt })} />;
}

function WordCount({ text }: { text: string }) {
  const n = wordCount(text);
  return (
    <p className="flex justify-between gap-3 text-[0.8125rem] text-ink-3" aria-live="off">
      <span>
        <span className="mono font-medium text-ink-2 tabular-nums">{n.toLocaleString('en-US')}</span> {n === 1 ? 'word' : 'words'}
        {n > 0 && n < 50 ? '. A bit short for an abstract.' : n > 400 ? '. On the long side. Most journals stop around 250.' : null}
      </span>
      <span className="mono text-xs text-ink-3 tabular-nums">{text.length.toLocaleString('en-US')}/20,000</span>
    </p>
  );
}

function VenueFields({ control }: { control: Ctl }) {
  const type = useWatch({ control, name: 'type' });
  const year = useWatch({ control, name: 'publishedYear' });
  const month = useWatch({ control, name: 'publishedMonth' });
  const c = containerLabel(type);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
      <FormField control={control} name="containerTitle" label={c.label} optional maxLength={300} className="sm:col-span-6">
        {(field) => <Input {...field} value={field.value ?? ''} placeholder={c.placeholder} />}
      </FormField>
      <FormField control={control} name="volume" label="Volume" optional className="sm:col-span-2">
        {(field) => <Input {...field} value={field.value ?? ''} placeholder="521" mono />}
      </FormField>
      <FormField control={control} name="issue" label="Issue" optional className="sm:col-span-2">
        {(field) => <Input {...field} value={field.value ?? ''} placeholder="7553" mono />}
      </FormField>
      <FormField control={control} name="pages" label="Pages" optional className="sm:col-span-2">
        {(field) => <Input {...field} value={field.value ?? ''} placeholder="436-444" mono />}
      </FormField>
      <FormField control={control} name="publisher" label="Publisher" optional maxLength={200} className="sm:col-span-6">
        {(field) => <Input {...field} value={field.value ?? ''} placeholder="Springer Nature" />}
      </FormField>
      <FormField control={control} name="publishedYear" label="Year" optional className="sm:col-span-2">
        {(field) => <NumberInput value={field.value ?? null} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} min={1900} max={2200} placeholder={String(new Date().getFullYear())} />}
      </FormField>
      <FormField control={control} name="publishedMonth" label="Month" optional className="sm:col-span-2" hint={!year ? 'Add a year first.' : undefined}>
        {(field) => (
          <Select
            value={field.value ? String(field.value) : null}
            onValueChange={(v) => field.onChange(v ? Number(v) : null)}
            options={MONTH_OPTIONS}
            placeholder="Any month"
            clearable="No month"
            disabled={!year}
          />
        )}
      </FormField>
      <FormField control={control} name="publishedDay" label="Day" optional className="sm:col-span-2">
        {(field) => <NumberInput value={field.value ?? null} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} min={1} max={31} disabled={!year || !month} />}
      </FormField>
    </div>
  );
}

function IdentifierFields({ form, readOnly, selfId }: { form: Form; readOnly: boolean; selfId?: string }) {
  const control = form.control;
  const doi = useWatch({ control, name: 'doi' }) ?? '';
  const arxiv = useWatch({ control, name: 'arxivId' }) ?? '';
  const clean = cleanDoi(doi);
  const doiOk = DOI_PATTERN.test(clean);
  const twins = useDoiTwins(useDebouncedValue(clean, 400), selfId);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormField
          control={control}
          name="doi"
          label="DOI"
          optional
          hint="Paste it any way: 10.1038/nature14539, doi:10..., or a doi.org link."
          action={
            doiOk ? (
              <a href={`https://doi.org/${clean}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-blue underline-offset-4 hover:underline">
                doi.org <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            ) : null
          }
        >
          {(field) => (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                {...field}
                value={field.value ?? ''}
                mono
                spellCheck={false}
                autoCapitalize="none"
                placeholder="10.1038/nature14539"
                // flex-1 only in the row layout: in a column, a zero flex-basis squashes the input on phones.
                wrapperClassName="min-w-0 sm:flex-1"
                onBlur={() => {
                  if (field.value && cleanDoi(field.value) !== field.value) field.onChange(cleanDoi(field.value));
                  field.onBlur();
                }}
              />
              {readOnly ? null : (
                <DoiFill
                  doi={doi}
                  getValues={() => form.getValues()}
                  apply={(entries) => {
                    for (const [key, value] of entries) form.setValue(key as never, value as never, { shouldDirty: true, shouldValidate: true, shouldTouch: true });
                  }}
                />
              )}
            </div>
          )}
        </FormField>
        {twins.length ? <DoiTwinsNote twins={twins} /> : null}
      </div>
      <FormField control={control} name="isbn" label="ISBN" optional hint="Books and chapters.">
        {(field) => <Input {...field} value={field.value ?? ''} mono placeholder="978-3-16-148410-0" />}
      </FormField>
      <FormField control={control} name="issn" label="ISSN" optional hint="The journal's number.">
        {(field) => <Input {...field} value={field.value ?? ''} mono placeholder="0028-0836" />}
      </FormField>
      <FormField
        control={control}
        name="arxivId"
        label="arXiv id"
        optional
        action={
          arxiv.trim() ? (
            <a href={`https://arxiv.org/abs/${arxiv.trim()}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-blue underline-offset-4 hover:underline">
              arXiv <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          ) : null
        }
      >
        {(field) => <Input {...field} value={field.value ?? ''} mono placeholder="2406.01234" spellCheck={false} />}
      </FormField>
      <FormField control={control} name="citationKey" label="Citation key" optional maxLength={80} hint="Used by BibTeX. No spaces.">
        {(field) => (
          <Input
            {...field}
            value={field.value ?? ''}
            mono
            spellCheck={false}
            autoCapitalize="none"
            placeholder="lecun2015deep"
            trailing={
              readOnly ? null : (
                <button
                  type="button"
                  onClick={() => form.setValue('citationKey', suggestCitationKey(form.getValues()), { shouldDirty: true, shouldValidate: true })}
                  className="mr-1 inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-blue transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <Wand2 className="size-3.5" aria-hidden="true" />
                  Suggest
                </button>
              )
            }
          />
        )}
      </FormField>
    </div>
  );
}

function DoiTwinsNote({ twins }: { twins: ReturnType<typeof useDoiTwins> }) {
  const [first, ...rest] = twins;
  if (!first) return null;
  return (
    <Callout
      tone="yellow"
      className="mt-3"
      title={twins.length === 1 ? 'This DOI is already on the shelf.' : `This DOI is already on the shelf ${twins.length} times.`}
      action={
        <Button type="button" size="sm" variant="secondary" iconRight={<ExternalLink />} asChild>
          <a href={adminRoutes.publication(first.id)} target="_blank" rel="noopener noreferrer">
            Open it
          </a>
        </Button>
      }
    >
      <span className="font-medium text-ink-2">{first.title}</span>
      {first.publishedYear ? ` (${first.publishedYear})` : null}
      {rest.length ? `, plus ${rest.length} more` : null}. Saving still works, but you may be about to add a twin.
    </Callout>
  );
}

function UrlInput({ value, onChange, onBlur, placeholder }: { value: string; onChange: (v: string) => void; onBlur: () => void; placeholder?: string }) {
  const ok = /^https?:\/\/\S+\.\S+/.test(value.trim());
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      inputMode="url"
      spellCheck={false}
      placeholder={placeholder}
      trailing={
        ok ? (
          <a href={value.trim()} target="_blank" rel="noopener noreferrer" aria-label="Open link in a new tab" className="mr-3 flex text-ink-3 transition hover:text-blue">
            <ExternalLink className="size-4" />
          </a>
        ) : null
      }
    />
  );
}

function SuggestInput({ listId, suggestions, ...props }: ComponentProps<typeof Input> & { listId: string; suggestions: string[] }): ReactNode {
  return (
    <>
      <Input {...props} list={listId} autoComplete="off" />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}
