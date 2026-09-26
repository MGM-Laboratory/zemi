'use client';

import { linkSchema, type LinkItem, type TeamMember } from '@zemi/shared';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { Controller } from 'react-hook-form';
import { z } from 'zod';
import { Character } from '@/components/admin/characters/character';
import { DragHandle, ImageUploadCrop, LinksEditor, SortableList } from '@/components/admin/fields';
import { Avatar, Button, EmptyState, ErrorState, Field, FormError, FormField, IconButton, Input, Kbd, Skeleton, Switch, Textarea, notify, useConfirm } from '@/components/admin/ui';
import { LinkIcon } from '@/components/icons';
import { api, errorMessage } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { applyApiErrorToForm, useZodForm } from '@/lib/admin/form';
import { useHotkeys } from '@/lib/admin/hooks';
import { adminKeys } from '@/lib/admin/query-keys';
import { CollectionCounts, EditorSheet, VisibilitySwitch, linkRowErrors, useOrderedCollection } from './collection-kit';
import { SiteBlock, WithPreview } from './site-kit';

const PATH = '/admin/site/team';
const QUERY_KEY = adminKeys.team.list();

const schema = z.object({
  name: z.string().trim().min(1, 'Who is it? A name, please.').max(160, 'Keep the name under 160 characters.'),
  role: z.string().max(160, 'Keep the role under 160 characters.'),
  bio: z.string().max(1000, 'Keep the bio under 1000 characters.'),
  avatarAssetId: z.string().nullable(),
  links: z.array(linkSchema).max(12, 'Twelve links at most.'),
  visibility: z.enum(['published', 'draft']),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = { name: '', role: '', bio: '', avatarAssetId: null, links: [], visibility: 'published' };

const toForm = (m: TeamMember): Values => ({
  name: m.name,
  role: m.role ?? '',
  bio: m.bio ?? '',
  avatarAssetId: m.avatarAssetId ?? null,
  links: (m.links ?? []) as LinkItem[],
  visibility: m.visibility,
});

/** /admin/site/team: the crew behind Zemi, in the order the about page shows them. */
export function TeamManager() {
  const confirm = useConfirm();
  const { query, items, reorder, setVisibility, remove, upsert } = useOrderedCollection<TeamMember>({ path: PATH, queryKey: QUERY_KEY });
  const [editing, setEditing] = useState<TeamMember | 'new' | null>(null);
  useHotkeys({ n: () => setEditing('new') }, { enabled: editing === null });

  const onDelete = async (m: TeamMember) => {
    const ok = await confirm({
      title: `Remove ${m.name} from the team?`,
      description: `${m.name} disappears from the about page, photo and links included. Switch them to draft instead if they are only taking a break.`,
      confirmLabel: 'Remove from team',
      destructive: true,
    });
    if (!ok) return;
    if (await remove(m)) notify.success(`${m.name} is off the team page.`);
  };

  const published = items.filter((m) => m.visibility === 'published');

  return (
    <div className="space-y-5">
      <SiteBlock
        title="The crew"
        description="The people who book rooms, fix the projector and buy the coffee. The about page shows them in this order."
        actions={
          <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setEditing('new')}>
            Add someone
          </Button>
        }
      >
        {query.isPending ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading the team">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[4.5rem] w-full" rounded="lg" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} size="sm" />
        ) : items.length === 0 ? (
          <EmptyState
            size="sm"
            title="Nobody on the team page yet"
            description="Add the organizers, so people know who to wave at on Friday."
            cast={[
              { shape: 'arch', mood: 'look', size: 44 },
              { shape: 'circle', mood: 'happy', size: 36 },
            ]}
            action={
              <Button variant="primary" icon={<Plus />} onClick={() => setEditing('new')}>
                Add the first person
              </Button>
            }
          />
        ) : (
          <WithPreview previewLabel="On the about page" preview={<TeamPreview items={published} />}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CollectionCounts total={items.length} published={published.length} one="person" many="people" />
              <p className="hidden text-[0.8125rem] text-ink-3 sm:block">
                Press <Kbd>n</Kbd> to add someone.
              </p>
            </div>
            <SortableList
              aria-label="Team members"
              items={items}
              getId={(m) => m.id}
              itemLabel={(m) => m.name}
              onReorder={(next) => void reorder(next)}
              renderItem={(m, { handle, isDragging }) => (
                <MemberRow
                  member={m}
                  handle={<DragHandle {...handle} label={`Move ${m.name}`} />}
                  dragging={isDragging}
                  onEdit={() => setEditing(m)}
                  onDelete={() => void onDelete(m)}
                  onVisibility={(v) => void setVisibility(m, v, v === 'published' ? `${m.name} is on the team page.` : `${m.name} is hidden for now.`)}
                />
              )}
            />
          </WithPreview>
        )}
      </SiteBlock>

      <MemberEditor
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        member={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          upsert(saved);
          setEditing(null);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ row */

function MemberRow({
  member: m,
  handle,
  dragging,
  onEdit,
  onDelete,
  onVisibility,
}: {
  member: TeamMember;
  handle: ReactNode;
  dragging: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onVisibility: (v: TeamMember['visibility']) => void;
}) {
  const draft = m.visibility === 'draft';
  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-2xl border bg-white p-3 transition-[border-color,box-shadow] duration-150 sm:gap-3 sm:p-3.5',
        dragging ? 'shadow-[var(--shadow-3)]' : 'border-line hover:border-line-strong hover:shadow-[var(--shadow-1)]',
        draft && !dragging && 'border-dashed bg-surface-muted/40',
      )}
    >
      {handle}
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">
          <span className={cn('shrink-0 transition-transform duration-300 group-hover:-rotate-6', draft && 'opacity-60 grayscale')}>
            <Avatar name={m.name} image={m.avatar} size={48} />
          </span>
          <span className="min-w-0">
            <span className={cn('block truncate font-semibold', draft ? 'text-ink-2' : 'text-ink')}>{m.name}</span>
            <span className="block truncate text-[0.8125rem] text-ink-3">{m.role || 'No role yet'}</span>
            {m.links.length ? (
              <span className="mt-1 flex items-center gap-1.5 text-ink-4" aria-label={`${m.links.length} ${m.links.length === 1 ? 'link' : 'links'}`}>
                {m.links.slice(0, 6).map((l, i) => (
                  <LinkIcon key={`${l.kind}-${i}`} kind={l.kind} className="size-3.5" aria-hidden="true" />
                ))}
              </span>
            ) : null}
          </span>
          <span className="sr-only">. Edit</span>
        </button>
        <div className="flex shrink-0 items-center justify-between gap-1 sm:justify-end">
          <VisibilitySwitch value={m.visibility} onChange={onVisibility} subject={m.name} />
          <span className="flex items-center">
            <IconButton label={`Edit ${m.name}`} size="sm" variant="ghost" onClick={onEdit}>
              <Pencil />
            </IconButton>
            <IconButton label={`Remove ${m.name}`} size="sm" variant="danger" onClick={onDelete}>
              <Trash2 />
            </IconButton>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ editor */

function MemberEditor({ member, onClose, onSaved }: { member: TeamMember | 'new' | null; onClose: () => void; onSaved: (saved: TeamMember) => void }) {
  const isNew = member === 'new';
  const current = member && member !== 'new' ? member : null;
  const form = useZodForm(schema, { defaultValues: current ? toForm(current) : EMPTY });
  const [saving, setSaving] = useState(false);
  const name = form.watch('name');

  const save = form.handleSubmit(async (v) => {
    setSaving(true);
    try {
      const body = {
        name: v.name.trim(),
        role: v.role.trim() || null,
        bio: v.bio.trim() || null,
        avatarAssetId: v.avatarAssetId,
        links: v.links,
        visibility: v.visibility,
      };
      const saved = current ? await api.patch<TeamMember>(`${PATH}/${current.id}`, body) : await api.post<TeamMember>(PATH, body);
      notify.success(current ? 'Saved.' : v.visibility === 'published' ? `${saved.name} is on the team. Welcome aboard.` : `${saved.name} is saved as a draft.`, { celebrate: !current });
      form.reset(v);
      onSaved(saved);
    } catch (err) {
      if (!applyApiErrorToForm(form, err)) notify.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  });

  return (
    <EditorSheet
      open={member !== null}
      dirty={form.formState.isDirty}
      onClose={onClose}
      title={isNew ? 'Add to the team' : `Edit ${current?.name ?? ''}`}
      description={isNew ? 'A face, a name and what they do on Fridays.' : undefined}
      footer={(requestClose) => (
        <>
          <Button variant="ghost" onClick={requestClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {isNew ? 'Add to the team' : 'Save'}
          </Button>
        </>
      )}
    >
      <form
        noValidate
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <FormError errors={form.formState.errors} />
        <FormField control={form.control} name="avatarAssetId" label="Photo" optional>
          {(field) => (
            <ImageUploadCrop
              purpose="team-avatar"
              round
              value={field.value}
              initialImage={current?.avatar ?? null}
              onChange={(id) => field.onChange(id)}
              alt={name.trim() || 'Team member'}
              hint="Square, at least 400 px wide. A friendly face beats a formal one."
            />
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField control={form.control} name="name" label="Name" required maxLength={160}>
            {(field) => <Input {...field} autoComplete="off" autoFocus={isNew} placeholder="Rani Pratiwi" />}
          </FormField>
          <FormField control={form.control} name="role" label="Role" optional maxLength={160}>
            {(field) => <Input {...field} placeholder="Coordinator, keeper of the clicker" />}
          </FormField>
        </div>
        <FormField control={form.control} name="bio" label="Short bio" optional maxLength={1000} hint="Two lines is plenty. What they study, what they bring to Friday.">
          {(field) => <Textarea {...field} autosize minRows={3} maxRows={8} placeholder="PhD student in computer vision. Brings the extension cords." />}
        </FormField>
        <Controller
          control={form.control}
          name="links"
          render={({ field, fieldState }) => (
            <Field label="Links" optional hint="Email, LinkedIn, Scholar, a personal site. The icon comes from the link.">
              <LinksEditor value={field.value} onChange={field.onChange} max={12} errors={linkRowErrors(fieldState.error)} addLabel="Add a link" />
            </Field>
          )}
        />
        <FormField control={form.control} name="visibility" label="Visibility" hideLabel>
          {(field) => (
            <Switch
              checked={field.value === 'published'}
              onCheckedChange={(c) => field.onChange(c ? 'published' : 'draft')}
              label="Show them on the site"
              description={field.value === 'published' ? 'Visible on the about page.' : 'Draft. Only admins see them here.'}
            />
          )}
        </FormField>
      </form>
    </EditorSheet>
  );
}

/* ------------------------------------------------------------------ preview */

function TeamPreview({ items }: { items: TeamMember[] }) {
  const reduce = useReducedMotion();
  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center">
        <Character shape="arch" mood="sleep" size={40} />
        <p className="text-sm text-ink-3">Everyone is a draft, so the team section hides itself.</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-1)] sm:p-5" aria-label="Team preview">
      <p className="font-display text-lg leading-none font-black tracking-[-0.03em] [font-variation-settings:'CASL'_0.5]">The people behind Friday</p>
      <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 min-[480px]:grid-cols-3">
        {items.map((m, i) => (
          <motion.li
            key={m.id}
            layout={!reduce}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="group/member flex min-w-0 flex-col items-center text-center"
          >
            <span className={cn('transition-transform duration-300 group-hover/member:-translate-y-1', i % 2 ? 'group-hover/member:rotate-3' : 'group-hover/member:-rotate-3')}>
              <Avatar name={m.name} image={m.avatar} size={64} />
            </span>
            <span className="mt-2 line-clamp-1 text-[0.8125rem] font-semibold text-ink">{m.name}</span>
            {m.role ? <span className="line-clamp-2 text-xs leading-snug text-ink-3">{m.role}</span> : null}
            {m.links.length ? (
              <span className="mt-1 flex items-center gap-1 text-ink-4">
                {m.links.slice(0, 4).map((l, j) => (
                  <LinkIcon key={`${l.kind}-${j}`} kind={l.kind} className="size-3" aria-hidden="true" />
                ))}
              </span>
            ) : null}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
