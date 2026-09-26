'use client';

import { useQueryClient } from '@tanstack/react-query';
import { speakerInput, type ImageRef, type SpeakerAdmin, type SpeakerInput } from '@zemi/shared';
import { Copy, ExternalLink, MoreHorizontal, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller } from 'react-hook-form';
import { BlockEditor, ImageUploadCrop, LinksEditor, ReadOnlyScope, SlugField } from '@/components/admin/fields';
import {
  Avatar,
  Badge,
  Button,
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
  PageHeader,
  StatusChip,
  useCopy,
} from '@/components/admin/ui';
import { ScopedFormField as FormField } from '../shared/scoped-form-field';
import { useAbility, useRefetchMe } from '@/lib/admin/ability';
import { api, errorMessage } from '@/lib/admin/api';
import { useBreadcrumbs } from '@/lib/admin/breadcrumbs';
import { applyApiErrorToForm, useZodForm } from '@/lib/admin/form';
import { useAdminMutation } from '@/lib/admin/hooks';
import { adminRoutes } from '@/lib/admin/nav';
import { publicPaths, SITE_URL } from '@/lib/admin/paths';
import { adminKeys } from '@/lib/admin/query-keys';
import { EditorCard, EditorSkeleton, FieldGroup, NoCreateAccess, ReadOnlyNote, VisibilityField } from '../shared/content-ui';
import { blankToNull, pickDirty } from '../shared/form-utils';
import { effectiveActions } from '../shared/types';
import { useDirtyGuard } from '../shared/use-dirty-guard';
import { DeleteSpeakerDialog } from './delete-speaker-dialog';
import { EMPTY_SPEAKER, SPEAKER_NULLABLE, speakerToForm, useSpeaker } from './speaker-data';
import { SpeakerPublicationsCard, SpeakerTalksCard } from './speaker-activity';

/** /admin/speakers/new and /admin/speakers/[id]. */
export function SpeakerEditor({ id }: { id?: string }) {
  const ability = useAbility();
  const q = useSpeaker(id ?? null);
  useBreadcrumbs(
    id
      ? [{ label: 'Speakers', href: adminRoutes.speakers }, { label: q.data?.fullName ?? 'Speaker' }]
      : [{ label: 'Speakers', href: adminRoutes.speakers }, { label: 'New speaker' }],
  );

  if (!id) {
    if (!ability.has('speakers.create')) return <NoCreateAccess what="speakers" />;
    return <SpeakerForm />;
  }
  if (q.isPending) return <EditorSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} action={<Button asChild variant="ghost"><Link href={adminRoutes.speakers}>Back to speakers</Link></Button>} />;
  return <SpeakerForm key={q.data.id} speaker={q.data} />;
}

function SpeakerForm({ speaker }: { speaker?: SpeakerAdmin }) {
  const isCreate = !speaker;
  const router = useRouter();
  const qc = useQueryClient();
  const ability = useAbility();
  const refetchMe = useRefetchMe();
  const [copy] = useCopy();
  const actions = isCreate
    ? new Set(['view', 'edit', 'publish', 'delete'] as const)
    : effectiveActions(speaker.permissions, (a) => ability.can('speaker', speaker.id, a));
  const canEdit = actions.has('edit');
  const canPublish = actions.has('publish');
  const canDelete = !isCreate && actions.has('delete');

  const form = useZodForm(speakerInput, { defaultValues: speaker ? speakerToForm(speaker) : EMPTY_SPEAKER });
  const { control, watch } = form;
  const fullName = watch('fullName') ?? '';
  const nickname = watch('nickname') ?? '';
  const headline = watch('headline') ?? '';
  const visibility = watch('visibility') ?? 'published';
  const slug = watch('slug') ?? '';
  const dirty = form.formState.isDirty;
  const { release } = useDirtyGuard(dirty && canEdit);

  // Focus the name on create, but only where it is the first thing on screen. Below lg the photo and
  // visibility cards come first, and autofocus would scroll past them and pop the phone keyboard.
  useEffect(() => {
    if (isCreate && window.matchMedia('(min-width: 1024px)').matches) form.setFocus('fullName');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [avatarImage, setAvatarImage] = useState<ImageRef | null>(speaker?.avatar ?? null);
  const [bioKey, setBioKey] = useState(0);
  const bioTouched = useRef(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const create = useAdminMutation({
    mutationFn: (body: SpeakerInput) => api.post<SpeakerAdmin>('/admin/speakers', body),
    invalidate: [adminKeys.speakers.lists(), [...adminKeys.speakers.all, 'lookup'], adminKeys.overview()],
    successMessage: (s) => `${s.fullName} is in the directory.`,
    celebrate: true,
    errorToast: (err) => (err.hasFieldErrors ? false : errorMessage(err)),
    onError: (err) => void applyApiErrorToForm(form, err),
    onSuccess: async (s) => {
      qc.setQueryData(adminKeys.speakers.detail(s.id), s);
      release();
      // The API adds an ownership grant for the creator: pick it up before opening the record.
      await refetchMe().catch(() => undefined);
      router.replace(adminRoutes.speaker(s.id));
    },
  });

  const update = useAdminMutation({
    mutationFn: (patch: Partial<SpeakerInput>) => api.patch<SpeakerAdmin>(`/admin/speakers/${speaker!.id}`, patch),
    invalidate: [adminKeys.speakers.lists(), [...adminKeys.speakers.all, 'lookup']],
    successMessage: 'Saved. The public page updates in a moment.',
    errorToast: (err) => (err.hasFieldErrors ? false : errorMessage(err)),
    onError: (err) => void applyApiErrorToForm(form, err),
    onSuccess: (s) => {
      qc.setQueryData(adminKeys.speakers.detail(s.id), s);
      form.reset(speakerToForm(s));
      setAvatarImage(s.avatar ?? null);
    },
  });
  const saving = create.isPending || update.isPending;

  const submit = form.handleSubmit((values) => {
    const clean = blankToNull(values as unknown as Record<string, unknown>, SPEAKER_NULLABLE) as unknown as SpeakerInput;
    clean.links = (values.links ?? []).filter((l) => l.url.trim());
    if (isCreate) {
      create.mutate(clean);
      return;
    }
    const patch = pickDirty(clean as unknown as Record<string, unknown>, form.formState.dirtyFields as Record<string, unknown>) as Partial<SpeakerInput>;
    if (!canPublish) delete patch.visibility;
    if (!Object.keys(patch).length) {
      notify.info('Nothing changed, so nothing to save.');
      return;
    }
    update.mutate(patch);
  });

  const onSave = () => {
    const links = form.getValues('links') ?? [];
    const kept = links.filter((l) => l.url.trim());
    if (kept.length !== links.length) form.setValue('links', kept, { shouldDirty: true });
    void submit();
  };

  const onDiscard = () => {
    form.reset();
    setAvatarImage(speaker?.avatar ?? null);
    bioTouched.current = false;
    setBioKey((k) => k + 1);
  };

  const linkErrors = useMemo(() => {
    const raw = form.formState.errors.links as unknown as Array<{ url?: { message?: string } } | undefined> | undefined;
    if (!Array.isArray(raw)) return undefined;
    const out: Record<number, { url?: string }> = {};
    raw.forEach((e, i) => {
      if (e?.url?.message) out[i] = { url: e.url.message === 'Too small: expected string to have >=1 characters' ? 'Add a link here, or remove the row.' : e.url.message };
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.formState.errors.links]);

  const publicUrl = `${SITE_URL}${publicPaths.speaker(speaker?.slug ?? slug)}`;
  const isPublic = speaker && speaker.visibility !== 'draft';

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <PageHeader
        back={{ href: adminRoutes.speakers, label: 'Speakers' }}
        eyebrow={
          <>
            <StatusChip kind="visibility" value={visibility} size="sm" />
            {speaker ? (
              <Badge size="sm" tone="outline">
                {speaker.talkCount === 1 ? '1 talk' : `${speaker.talkCount ?? 0} talks`}
              </Badge>
            ) : null}
          </>
        }
        title={fullName.trim() || (isCreate ? 'New speaker' : speaker.fullName)}
        description={isCreate ? 'Name, face and a line about them. Talks attach themselves later, when you add this person to an event.' : undefined}
        actions={
          <>
            {isPublic ? (
              <Button variant="secondary" icon={<ExternalLink />} asChild>
                <a href={publicPaths.speaker(speaker.slug)} target="_blank" rel="noopener noreferrer">
                  View on site
                </a>
              </Button>
            ) : null}
            {speaker ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton label="More actions" variant="secondary">
                    <MoreHorizontal />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <DropdownMenuItem
                    icon={<Copy />}
                    onSelect={() =>
                      void copy(publicUrl).then((ok) => (ok ? notify.success('Public link copied.') : notify.error("Couldn't copy. Your browser said no.")))
                    }
                  >
                    Copy public link
                  </DropdownMenuItem>
                  {canDelete ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem icon={<Trash2 />} destructive onSelect={() => setDeleteOpen(true)}>
                        Delete speaker
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {canEdit ? (
              <Button type="submit" variant="primary" loading={saving} disabled={!isCreate && !dirty}>
                {isCreate ? 'Add speaker' : 'Save'}
              </Button>
            ) : null}
          </>
        }
      />

      {!canEdit ? (
        <ReadOnlyNote>You can look around here, but not edit. Ask the superadmin if you need edit access.</ReadOnlyNote>
      ) : null}
      <FormError errors={form.formState.errors} className="mb-5" />

      <ReadOnlyScope readOnly={!canEdit}>
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:grid-rows-[auto_1fr] lg:items-start xl:grid-cols-[minmax(0,1fr)_23rem]">
          {/* Aside, top: photo + visibility (first on phones) */}
          <div className="space-y-6 lg:col-start-2 lg:row-start-1">
            <Card className="flex flex-col items-center gap-4 text-center">
              <FormField control={control} name="avatarAssetId" label="Photo" hideLabel className="items-center">
                {(field) => (
                  <ImageUploadCrop
                    purpose="speaker-avatar"
                    value={field.value}
                    initialImage={speaker?.avatar}
                    alt={fullName || null}
                    onChange={(assetId, asset) => {
                      field.onChange(assetId);
                      setAvatarImage(asset?.image ?? (assetId ? avatarImage : null));
                    }}
                    hint="Square, face in the middle. 800px or more looks crisp."
                  />
                )}
              </FormField>
              <div className="w-full border-t border-line pt-4">
                <p className="label mb-2 text-ink-4">On the site</p>
                <div className="flex items-center justify-center gap-3 text-left">
                  <Avatar name={fullName || 'New speaker'} image={avatarImage} size={44} />
                  <div className="min-w-0">
                    <p className="truncate font-display text-base leading-tight font-extrabold [font-variation-settings:'CASL'_0.5]">{fullName || 'Their name'}</p>
                    <p className="truncate text-sm text-ink-3">{headline || (nickname ? `aka ${nickname}` : 'A line about them')}</p>
                  </div>
                </div>
              </div>
            </Card>
            <Card>
              <FormField control={control} name="visibility" label="Visibility">
                {(field) => (
                  <VisibilityField
                    noun="speaker"
                    value={field.value}
                    onChange={field.onChange}
                    readOnly={!canEdit || !canPublish}
                    lockedReason={canEdit && !canPublish ? 'Changing visibility needs publish access for this speaker.' : undefined}
                  />
                )}
              </FormField>
            </Card>
          </div>

          {/* Main column */}
          <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <EditorCard id="basics" title="The basics" description="How they show up everywhere on the site.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField control={control} name="fullName" label="Full name" required maxLength={160} className="sm:col-span-2">
                  {(field) => <Input {...field} value={field.value ?? ''} autoComplete="off" placeholder="Rani Prameswari" />}
                </FormField>
                <FormField control={control} name="nickname" label="Nickname" optional maxLength={60} hint="What people actually call them.">
                  {(field) => <Input {...field} value={field.value ?? ''} autoComplete="off" placeholder="Rani" />}
                </FormField>
                <FormField control={control} name="headline" label="Headline" optional maxLength={200} hint="One line under their name.">
                  {(field) => <Input {...field} value={field.value ?? ''} placeholder="Teaching robots to say sorry" />}
                </FormField>
                <FormField control={control} name="slug" label="Page link" required className="sm:col-span-2">
                  {(field) => (
                    <SlugField
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      source={fullName}
                      basePath="/speakers/"
                      savedSlug={speaker?.slug}
                      auto={isCreate ? undefined : false}
                    />
                  )}
                </FormField>
              </div>
            </EditorCard>

            <EditorCard id="work" title="Where they work" description="The default for new talks. Each talk can say something different.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField control={control} name="defaultOrganization" label="Organization" optional maxLength={200}>
                  {(field) => <Input {...field} value={field.value ?? ''} placeholder="MGM Laboratory" />}
                </FormField>
                <FormField control={control} name="defaultPosition" label="Position" optional maxLength={200}>
                  {(field) => <Input {...field} value={field.value ?? ''} placeholder="PhD candidate" />}
                </FormField>
              </div>
            </EditorCard>

            <EditorCard id="bio" title="Bio" description="A few friendly paragraphs. Type / for headings, lists and images.">
              <FormField control={control} name="bio" label="Bio" hideLabel>
                {(field) => (
                  <div
                    onPointerDownCapture={() => (bioTouched.current = true)}
                    onKeyDownCapture={() => (bioTouched.current = true)}
                    onPasteCapture={() => (bioTouched.current = true)}
                    onDropCapture={() => (bioTouched.current = true)}
                  >
                    <BlockEditor
                      key={bioKey}
                      value={field.value}
                      onChange={(blocks) => {
                        // BlockNote can normalize on load; only real edits should dirty the form.
                        if (bioTouched.current) field.onChange(blocks);
                      }}
                      placeholder="Where they study, what keeps them up at night, what they want feedback on."
                      minHeight="11rem"
                    />
                  </div>
                )}
              </FormField>
            </EditorCard>

            <EditorCard id="links" title="Links" description="Paste a URL and we pick the icon. Drag to reorder.">
              {/* A plain Controller, not FormField: a Field would hand one id and one error state to every row. */}
              <Controller
                control={control}
                name="links"
                render={({ field, fieldState }) => (
                  <FieldGroup label="Links" hideLabel error={!Array.isArray(form.formState.errors.links) ? fieldState.error?.message : undefined}>
                    <LinksEditor value={field.value ?? []} onChange={field.onChange} errors={linkErrors} />
                  </FieldGroup>
                )}
              />
            </EditorCard>

            <EditorCard id="private" title="Private" description="Only the crew sees this. It never shows on the site.">
              <FormField control={control} name="email" label="Email" optional hint="For slide reminders and thank-you notes.">
                {(field) => <Input {...field} value={field.value ?? ''} type="email" inputMode="email" autoComplete="off" placeholder="rani@example.ac.id" />}
              </FormField>
            </EditorCard>
          </div>

          {/* Aside, bottom: activity */}
          <div className="space-y-6 lg:col-start-2 lg:row-start-2">
            {speaker ? (
              <>
                <SpeakerTalksCard talks={speaker.talks ?? []} />
                <SpeakerPublicationsCard publications={speaker.publications ?? []} />
                <Card muted padding="sm" className="space-y-1 px-5 text-[0.8125rem] text-ink-3">
                  <p>
                    Added <DateText value={speaker.createdAt} format="date" />
                  </p>
                  <p>
                    Last changed <DateText value={speaker.updatedAt} format="relative" />
                  </p>
                </Card>
                {canDelete ? (
                  <Card className="border-red/20">
                    <p className="font-display text-base font-extrabold [font-variation-settings:'CASL'_0.2]">Delete this speaker</p>
                    <p className="mt-1 text-sm text-ink-3">Takes them off every event line-up. The events stay. Papers keep their name as a plain author.</p>
                    <Button type="button" variant="danger-soft" size="sm" className="mt-3" icon={<Trash2 />} onClick={() => setDeleteOpen(true)}>
                      Delete speaker
                    </Button>
                  </Card>
                ) : null}
              </>
            ) : (
              <Card muted className="text-sm text-ink-3">
                Talks show up here on their own once this person is on an event. Papers too, once they are listed as an author.
              </Card>
            )}
          </div>
        </div>
      </ReadOnlyScope>

      {canEdit ? <FormSaveBar form={form} saving={saving} onSave={onSave} onDiscard={onDiscard} alwaysVisible={isCreate} saveLabel={isCreate ? 'Add speaker' : 'Save changes'} /> : null}

      {speaker ? (
        <DeleteSpeakerDialog
          speaker={{ ...speaker, publicationCount: speaker.publications?.length ?? 0 }}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onDeleted={() => {
            release();
            router.replace(adminRoutes.speakers);
          }}
        />
      ) : null}
    </form>
  );
}
