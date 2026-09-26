'use client';

import type { Faq } from '@zemi/shared';
import { ChevronDown, MessageCircleQuestion, Pencil, Plus, Trash2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { z } from 'zod';
import { Character } from '@/components/admin/characters/character';
import { DragHandle, SortableList } from '@/components/admin/fields';
import { Button, EmptyState, ErrorState, FormError, FormField, IconButton, Kbd, Skeleton, Switch, Textarea, notify, useConfirm } from '@/components/admin/ui';
import { api, errorMessage } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { applyApiErrorToForm, useZodForm } from '@/lib/admin/form';
import { useHotkeys } from '@/lib/admin/hooks';
import { adminKeys } from '@/lib/admin/query-keys';
import { CollectionCounts, EditorSheet, VisibilitySwitch, useOrderedCollection } from './collection-kit';
import { SiteBlock, WithPreview } from './site-kit';

const PATH = '/admin/site/faqs';
const QUERY_KEY = adminKeys.faqs.list();

const schema = z.object({
  question: z.string().trim().min(1, 'Write the question people ask.').max(300, 'Keep the question under 300 characters.'),
  answer: z.string().trim().min(1, 'Every question needs an answer.').max(3000, 'Keep the answer under 3000 characters.'),
  visibility: z.enum(['published', 'draft']),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = { question: '', answer: '', visibility: 'published' };

function quote(q: string, n = 60) {
  const t = q.trim();
  return `“${t.length > n ? `${t.slice(0, n - 3)}...` : t}”`;
}

/** /admin/site/faq: the questions people keep asking. Drag to reorder, switch drafts on and off. */
export function FaqManager() {
  const confirm = useConfirm();
  const { query, items, reorder, setVisibility, remove, upsert } = useOrderedCollection<Faq>({ path: PATH, queryKey: QUERY_KEY });
  const [editing, setEditing] = useState<Faq | 'new' | null>(null);
  useHotkeys({ n: () => setEditing('new') }, { enabled: editing === null });

  const onDelete = async (f: Faq) => {
    const ok = await confirm({
      title: 'Delete this question?',
      description: `${quote(f.question, 90)} and its answer disappear from the site for good. Switch it to draft instead if you might want it back.`,
      confirmLabel: 'Delete question',
      destructive: true,
    });
    if (!ok) return;
    if (await remove(f)) notify.success('Question deleted.');
  };

  const published = items.filter((f) => f.visibility === 'published');

  return (
    <div className="space-y-5">
      <SiteBlock
        title="Questions and answers"
        description="Shown on the about page in this order. Put the ones people ask on Thursday night at the top."
        actions={
          <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setEditing('new')}>
            Add a question
          </Button>
        }
      >
        {query.isPending ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading questions">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-[4.75rem] w-full" rounded="lg" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} size="sm" />
        ) : items.length === 0 ? (
          <EmptyState
            size="sm"
            title="No questions yet"
            description="Start with the classics: do I need to register, is it recorded, can undergrads come?"
            cast={[
              { shape: 'circle', mood: 'look', size: 44 },
              { shape: 'triangle', mood: 'idle', size: 36 },
            ]}
            action={
              <Button variant="primary" icon={<Plus />} onClick={() => setEditing('new')}>
                Add the first question
              </Button>
            }
          />
        ) : (
          <WithPreview previewLabel="On the about page" preview={<FaqPreview items={published} />}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CollectionCounts total={items.length} published={published.length} one="question" many="questions" />
              <p className="hidden text-[0.8125rem] text-ink-4 sm:block">
                Press <Kbd>n</Kbd> for a new one. Drag the handle, or focus it and use Space and the arrows.
              </p>
            </div>
            <SortableList
              aria-label="Questions"
              items={items}
              getId={(f) => f.id}
              itemLabel={(f) => `question ${quote(f.question, 40)}`}
              onReorder={(next) => void reorder(next)}
              renderItem={(f, { handle, index, isDragging }) => (
                <FaqRow
                  faq={f}
                  index={index}
                  handle={<DragHandle {...handle} label={`Move ${quote(f.question, 40)}`} className="mt-0.5" />}
                  dragging={isDragging}
                  onEdit={() => setEditing(f)}
                  onDelete={() => void onDelete(f)}
                  onVisibility={(v) => void setVisibility(f, v, v === 'published' ? 'On the site now.' : 'Hidden. It stays here as a draft.')}
                />
              )}
            />
          </WithPreview>
        )}
      </SiteBlock>

      <FaqEditor
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        faq={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved, again) => {
          upsert(saved);
          setEditing(again ? 'new' : null);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ row */

function FaqRow({
  faq,
  index,
  handle,
  dragging,
  onEdit,
  onDelete,
  onVisibility,
}: {
  faq: Faq;
  index: number;
  handle: ReactNode;
  dragging: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onVisibility: (v: Faq['visibility']) => void;
}) {
  const draft = faq.visibility === 'draft';
  return (
    <div
      className={cn(
        'group flex items-start gap-2 rounded-2xl border bg-white p-3 transition-[border-color,box-shadow] duration-150 sm:gap-3 sm:p-4',
        dragging ? 'shadow-[var(--shadow-3)]' : 'border-line hover:border-line-strong hover:shadow-[var(--shadow-1)]',
        draft && !dragging && 'border-dashed bg-surface-muted/40',
      )}
    >
      <div className="flex flex-col items-center gap-1">
        {handle}
        <span className="mono text-xs text-ink-4 tabular-nums" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
        <button
          type="button"
          onClick={onEdit}
          className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
        >
          <span className={cn('line-clamp-2 font-semibold leading-snug', draft ? 'text-ink-2' : 'text-ink')}>{faq.question}</span>
          <span className="mt-1 line-clamp-2 text-[0.8125rem] leading-snug text-ink-3">{faq.answer}</span>
          <span className="sr-only">. Edit</span>
        </button>
        <div className="flex shrink-0 items-center justify-between gap-1 sm:justify-end">
          <VisibilitySwitch value={faq.visibility} onChange={onVisibility} subject={quote(faq.question, 40)} />
          <span className="flex items-center">
            <IconButton label="Edit" size="sm" variant="ghost" onClick={onEdit}>
              <Pencil />
            </IconButton>
            <IconButton label="Delete" size="sm" variant="danger" onClick={onDelete}>
              <Trash2 />
            </IconButton>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ editor */

function FaqEditor({ faq, onClose, onSaved }: { faq: Faq | 'new' | null; onClose: () => void; onSaved: (saved: Faq, again: boolean) => void }) {
  const isNew = faq === 'new';
  const current = faq && faq !== 'new' ? faq : null;
  const form = useZodForm(schema, { defaultValues: current ? { question: current.question, answer: current.answer, visibility: current.visibility } : EMPTY });
  const [saving, setSaving] = useState<false | 'save' | 'again'>(false);

  const save = (again: boolean) =>
    form.handleSubmit(async (v) => {
      setSaving(again ? 'again' : 'save');
      try {
        const body = { question: v.question.trim(), answer: v.answer.trim(), visibility: v.visibility };
        const saved = current ? await api.patch<Faq>(`${PATH}/${current.id}`, body) : await api.post<Faq>(PATH, body);
        notify.success(current ? 'Saved.' : again ? 'Added. Next one.' : v.visibility === 'published' ? 'Added. It shows on the about page.' : 'Added as a draft.');
        if (again) {
          form.reset(EMPTY);
          requestAnimationFrame(() => form.setFocus('question'));
        } else {
          form.reset(v);
        }
        onSaved(saved, again);
      } catch (err) {
        if (!applyApiErrorToForm(form, err)) notify.error(errorMessage(err));
      } finally {
        setSaving(false);
      }
    })();

  return (
    <EditorSheet
      open={faq !== null}
      dirty={form.formState.isDirty}
      onClose={onClose}
      title={isNew ? 'New question' : 'Edit question'}
      description="Plain words. Line breaks are kept."
      footer={(requestClose) => (
        <>
          <Button variant="ghost" onClick={requestClose} disabled={!!saving}>
            Cancel
          </Button>
          {isNew ? (
            <Button variant="secondary" loading={saving === 'again'} disabled={!!saving} onClick={() => void save(true)}>
              Save and add another
            </Button>
          ) : null}
          <Button variant="primary" loading={saving === 'save'} disabled={!!saving} onClick={() => void save(false)}>
            {isNew ? 'Add question' : 'Save question'}
          </Button>
        </>
      )}
    >
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
      >
        <FormError errors={form.formState.errors} />
        <FormField control={form.control} name="question" label="Question" required maxLength={300}>
          {(field) => <Textarea {...field} autosize minRows={2} maxRows={4} autoFocus placeholder="Do I need to register to come?" className="font-semibold" />}
        </FormField>
        <FormField control={form.control} name="answer" label="Answer" required maxLength={3000} hint="Short is kind. Two or three sentences usually does it.">
          {(field) => <Textarea {...field} autosize minRows={5} maxRows={14} placeholder="For the room, yes, it keeps the chairs honest. The livestream is open to anyone." />}
        </FormField>
        <FormField control={form.control} name="visibility" label="Visibility" hideLabel>
          {(field) => (
            <Switch
              checked={field.value === 'published'}
              onCheckedChange={(c) => field.onChange(c ? 'published' : 'draft')}
              label="Show it on the site"
              description={field.value === 'published' ? 'Visible on the about page.' : 'Draft. Only admins see it here.'}
            />
          )}
        </FormField>
      </form>
    </EditorSheet>
  );
}

/* ------------------------------------------------------------------ preview */

function FaqPreview({ items }: { items: Faq[] }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState<string | null>(null);
  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center">
        <Character shape="square" mood="sleep" size={40} />
        <p className="text-sm text-ink-3">Every question is a draft, so the FAQ hides itself on the page.</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-1)] sm:p-5" aria-label="FAQ preview">
      <p className="flex items-center gap-2 font-display text-lg leading-none font-black tracking-[-0.03em] [font-variation-settings:'CASL'_0.5]">
        <MessageCircleQuestion className="size-4 text-blue" aria-hidden="true" />
        Questions, answered
      </p>
      <ul className="mt-3 divide-y divide-line">
        {items.map((f) => {
          const isOpen = open === f.id;
          return (
            <li key={f.id}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : f.id)}
                className="flex w-full items-start justify-between gap-3 py-2.5 text-left text-[0.875rem] font-semibold text-ink transition-colors hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <span className="min-w-0">{f.question}</span>
                <ChevronDown className={cn('mt-0.5 size-4 shrink-0 text-ink-3 transition-transform duration-200', isOpen && 'rotate-180')} aria-hidden="true" />
              </button>
              <AnimatePresence initial={false}>
                {isOpen ? (
                  <motion.div
                    initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                    exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <p className="pb-3 text-[0.8125rem] leading-relaxed whitespace-pre-line text-ink-2">{f.answer}</p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
