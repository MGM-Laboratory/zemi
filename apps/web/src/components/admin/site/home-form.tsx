'use client';

import { useQuery } from '@tanstack/react-query';
import { formatJakarta, hhmmSchema, type EventAdmin, type EventAdminRow, type Paginated, type SiteSettings } from '@zemi/shared';
import { ArrowDownUp, Plus, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useFieldArray, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { DragHandle, SortableList } from '@/components/admin/fields';
import { Button, Callout, Combobox, FormField, IconButton, Input, StatusChip, Switch, Textarea, type ComboOption } from '@/components/admin/ui';
import { useAbility } from '@/lib/admin/ability';
import { api } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { useZodForm } from '@/lib/admin/form';
import { adminKeys } from '@/lib/admin/query-keys';
import { FridayClockPreview, SESSION_END, SESSION_START, toMinutes } from './friday-clock-preview';
import { SettingsForm, SiteBlock, SiteSettingLoader, reorderToMove, useSiteSettingSave } from './site-kit';

const MAX_BEATS = 12;

const beatSchema = z.object({
  time: hhmmSchema,
  title: z.string().trim().min(1, 'Every beat needs a title.').max(160),
  body: z.string().max(600, 'Keep it under 600 characters.'),
});

const schema = z.object({
  heroEyebrow: z.string().max(120),
  heroTitle: z.string().trim().min(1, 'The big line cannot be empty.').max(200),
  heroBody: z.string().max(400),
  heroPrimaryCta: z.string().trim().min(1, 'The main button needs words.').max(40),
  heroSecondaryCta: z.string().max(40),
  beats: z.array(beatSchema).max(MAX_BEATS, `${MAX_BEATS} beats at most. It is a two hour session.`),
  statsEnabled: z.boolean(),
  funStat: z.string().max(120),
  featuredEventId: z.string().nullable(),
  closingTitle: z.string().max(160),
  closingBody: z.string().max(300),
});
type Values = z.infer<typeof schema>;

const toForm = (h: SiteSettings['home']): Values => ({
  heroEyebrow: h.heroEyebrow,
  heroTitle: h.heroTitle,
  heroBody: h.heroBody,
  heroPrimaryCta: h.heroPrimaryCta,
  heroSecondaryCta: h.heroSecondaryCta,
  beats: h.beats.map((b) => ({ time: b.time, title: b.title, body: b.body })),
  statsEnabled: h.statsEnabled,
  funStat: h.funStat,
  featuredEventId: h.featuredEventId ?? null,
  closingTitle: h.closingTitle,
  closingBody: h.closingBody,
});
const toPayload = (v: Values): Partial<SiteSettings['home']> => ({
  ...v,
  beats: v.beats.map((b) => ({ time: b.time, title: b.title.trim(), body: b.body.trim() })),
});

export function HomeSettings() {
  return <SiteSettingLoader settingKey="home">{(data) => <HomeForm data={data} />}</SiteSettingLoader>;
}

function HomeForm({ data }: { data: SiteSettings['home'] }) {
  const form = useZodForm(schema, { defaultValues: toForm(data) });
  const { save, saving } = useSiteSettingSave({ settingKey: 'home', form, toForm, toPayload });

  return (
    <SettingsForm form={form} save={() => void save()} saving={saving}>
      <SiteBlock title="Hero" description="The first thing anyone sees. Short and warm beats clever.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid content-start gap-4">
            <FormField control={form.control} name="heroEyebrow" label="Small line above" maxLength={120}>
              {(field) => <Input {...field} placeholder="Fridays, 13:15 WIB" />}
            </FormField>
            <FormField control={form.control} name="heroTitle" label="Big line" required maxLength={200}>
              {(field) => <Textarea {...field} autosize minRows={2} maxRows={4} className="font-display text-lg font-extrabold" />}
            </FormField>
            <FormField control={form.control} name="heroBody" label="Under it" maxLength={400}>
              {(field) => <Textarea {...field} autosize minRows={3} maxRows={6} />}
            </FormField>
          </div>
          <div className="grid content-start gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="heroPrimaryCta" label="Main button" required maxLength={40} hint="Goes to the next Friday.">
                {(field) => <Input {...field} />}
              </FormField>
              <FormField control={form.control} name="heroSecondaryCta" label="Second button" maxLength={40} hint="Scrolls into the story.">
                {(field) => <Input {...field} />}
              </FormField>
            </div>
            <HeroPreview form={form} />
          </div>
        </div>
      </SiteBlock>

      <BeatsEditor form={form} />

      <div className="grid gap-5 lg:grid-cols-2">
        <SiteBlock title="Numbers and the featured Friday" description="The stats strip counts sessions, talks and seats filled for you.">
          <div className="grid gap-4">
            <FormField control={form.control} name="statsEnabled" label="Show the stats" hideLabel>
              {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} label="Show the stats strip" description="Sessions, talks, speakers and seats filled, counted live." />}
            </FormField>
            <FormField control={form.control} name="funStat" label="Fun stat" maxLength={120} hint="The one number we cannot count. Keep it true-ish.">
              {(field) => <Input {...field} placeholder="1 coffee machine we keep blaming" />}
            </FormField>
            <FormField control={form.control} name="featuredEventId" label="Featured event" optional hint="Leave empty and the home page features the next Friday on its own.">
              {(field) => <EventPicker value={field.value} onChange={field.onChange} />}
            </FormField>
          </div>
        </SiteBlock>
        <SiteBlock title="Closing" description="The last thing on the page, right before the footer.">
          <div className="grid gap-4">
            <FormField control={form.control} name="closingTitle" label="Title" maxLength={160}>
              {(field) => <Input {...field} />}
            </FormField>
            <FormField control={form.control} name="closingBody" label="Line" maxLength={300}>
              {(field) => <Textarea {...field} autosize minRows={2} maxRows={4} />}
            </FormField>
          </div>
        </SiteBlock>
      </div>
    </SettingsForm>
  );
}

/* ------------------------------------------------------------------ hero preview */

function HeroPreview({ form }: { form: UseFormReturn<Values, unknown, Values> }) {
  const [eyebrow, title, body, primary, secondary] = form.watch(['heroEyebrow', 'heroTitle', 'heroBody', 'heroPrimaryCta', 'heroSecondaryCta']);
  return (
    <div aria-label="Hero preview" className="group overflow-hidden rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-1)]">
      <p className="mono text-[0.6875rem] tracking-[0.08em] text-ink-3 uppercase">{eyebrow || ' '}</p>
      <p className="mt-2 font-display text-[clamp(1.5rem,2.6vw,2.25rem)] leading-[0.95] font-black tracking-[-0.04em] text-ink transition-[font-variation-settings] duration-500 [font-variation-settings:'CASL'_0.2] group-hover:[font-variation-settings:'CASL'_1]">
        {title || 'Your big line'}
      </p>
      <p className="mt-3 line-clamp-3 text-sm text-ink-2">{body}</p>
      <div className="mt-4 flex flex-wrap gap-2" aria-hidden="true">
        <span className="rounded-full bg-ink px-3.5 py-1.5 text-[0.8125rem] font-semibold text-white">{primary || 'Button'}</span>
        {secondary ? <span className="rounded-full border border-line-strong px-3.5 py-1.5 text-[0.8125rem] font-semibold text-ink">{secondary}</span> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ beats */

function BeatsEditor({ form }: { form: UseFormReturn<Values, unknown, Values> }) {
  const { fields, append, remove, move, replace } = useFieldArray({ control: form.control, name: 'beats' });
  const beats = form.watch('beats');
  const [active, setActive] = useState(0);
  const onActive = useCallback((i: number) => setActive(i), []);

  const issues = useMemo(() => {
    const mins = beats.map((b) => toMinutes(b.time));
    const outOfOrder = mins.some((m, i) => i > 0 && m != null && mins[i - 1] != null && m < mins[i - 1]!);
    const outside = beats.filter((b) => {
      const m = toMinutes(b.time);
      return m != null && (m < SESSION_START || m > SESSION_END);
    }).length;
    const dupes = new Set(mins.filter((m, i) => m != null && mins.indexOf(m) !== i)).size;
    return { outOfOrder, outside, dupes };
  }, [beats]);

  const sortByTime = () => {
    const sorted = [...beats].sort((a, b) => (toMinutes(a.time) ?? 0) - (toMinutes(b.time) ?? 0));
    replace(sorted);
    setActive(0);
  };

  const add = () => {
    const last = toMinutes(beats[beats.length - 1]?.time ?? '') ?? SESSION_START - 15;
    const next = Math.min(SESSION_END, last + 15);
    const time = `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`;
    append({ time, title: '', body: '' }, { shouldFocus: false });
    setActive(beats.length);
    requestAnimationFrame(() => form.setFocus(`beats.${beats.length}.title`));
  };

  const errors = form.formState.errors.beats;
  return (
    <SiteBlock
      title="The Friday clock"
      description="The home page runs one real session, 13:15 to 15:15, as you scroll. Each beat is a moment of it, stamped with its time. Keep them in order."
      actions={
        <span className="mono rounded-full bg-surface-muted px-2.5 py-1 text-xs text-ink-3 tabular-nums">
          {fields.length} / {MAX_BEATS}
        </span>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:gap-8">
        <div className="min-w-0 space-y-3 xl:order-1">
          {issues.outOfOrder || issues.outside || issues.dupes ? (
            <Callout
              tone="yellow"
              icon={<TriangleAlert />}
              title={issues.outOfOrder ? 'The clock runs backwards somewhere.' : 'Check the times.'}
              action={
                issues.outOfOrder ? (
                  <Button size="sm" variant="secondary" icon={<ArrowDownUp />} onClick={sortByTime}>
                    Sort by time
                  </Button>
                ) : undefined
              }
            >
              {[
                issues.outOfOrder ? 'A beat comes before the one above it.' : null,
                issues.outside ? `${issues.outside} ${issues.outside === 1 ? 'beat is' : 'beats are'} outside 13:15 to 15:15.` : null,
                issues.dupes ? 'Two beats share a time.' : null,
              ]
                .filter(Boolean)
                .join(' ')}
            </Callout>
          ) : null}
          {typeof errors?.message === 'string' ? <p className="text-sm font-medium text-red-600">{errors.message}</p> : null}

          {fields.length ? (
            <SortableList
              aria-label="Beats"
              items={fields}
              getId={(f) => f.id}
              itemLabel={(f) => {
                const i = fields.findIndex((x) => x.id === f.id);
                return `beat ${beats[i]?.time ?? ''} ${beats[i]?.title ?? ''}`.trim();
              }}
              onReorder={(next) => {
                const mv = reorderToMove(fields, next);
                if (mv) {
                  move(mv[0], mv[1]);
                  setActive(mv[1]);
                }
              }}
              renderItem={(_f, { handle, index, isDragging }) => (
                <div
                  onFocusCapture={() => setActive(index)}
                  className={cn(
                    'rounded-2xl border bg-white p-3 transition-[border-color,box-shadow] duration-150 sm:p-4',
                    index === active ? 'border-ink shadow-[0_0_0_1px_var(--color-ink)]' : 'border-line hover:border-line-strong',
                    isDragging && 'shadow-[var(--shadow-3)]',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <DragHandle {...handle} label={`Move beat ${index + 1}`} className="mt-7" />
                    <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
                      <FormField control={form.control} name={`beats.${index}.time`} label="Time (WIB)">
                        {(field) => <Input {...field} type="time" className="mono" />}
                      </FormField>
                      <FormField control={form.control} name={`beats.${index}.title`} label="Title" maxLength={160}>
                        {(field) => <Input {...field} placeholder="Doors open." />}
                      </FormField>
                      <div className="sm:col-span-2">
                        {index === active ? (
                          <FormField control={form.control} name={`beats.${index}.body`} label="What happens" maxLength={600}>
                            {(field) => <Textarea {...field} autosize minRows={2} maxRows={6} />}
                          </FormField>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setActive(index);
                              requestAnimationFrame(() => form.setFocus(`beats.${index}.body`));
                            }}
                            className="block w-full rounded-xl px-1 py-0.5 text-left text-[0.8125rem] text-ink-3 transition hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
                          >
                            <span className="line-clamp-1">{beats[index]?.body || 'No words yet. Click to write them.'}</span>
                            {errors?.[index]?.body?.message ? <span className="block font-medium text-red-600">{errors[index]?.body?.message}</span> : null}
                          </button>
                        )}
                      </div>
                    </div>
                    <IconButton
                      label={`Remove beat ${index + 1}`}
                      size="sm"
                      variant="danger"
                      className="mt-7"
                      onClick={() => {
                        remove(index);
                        setActive((a) => Math.max(0, Math.min(a, fields.length - 2)));
                      }}
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                </div>
              )}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-3">No beats yet. The clock needs at least a start and an end.</div>
          )}
          <Button variant="secondary" icon={fields.length ? <Plus /> : <Sparkles />} onClick={add} disabled={fields.length >= MAX_BEATS}>
            {fields.length >= MAX_BEATS ? 'That is all the beats' : 'Add a beat'}
          </Button>
        </div>
        <div className="min-w-0 xl:order-2">
          <p className="label mb-2 text-ink-3">Preview</p>
          <div className="xl:sticky xl:top-[calc(var(--admin-topbar-h,60px)+6rem)]">
            <FridayClockPreview beats={beats} active={active} onActiveChange={onActive} />
          </div>
        </div>
      </div>
    </SiteBlock>
  );
}

/* ------------------------------------------------------------------ featured event */

function eventLabel(e: Pick<EventAdminRow, 'number' | 'title'>) {
  // Some titles already carry the number ("Zemi #100: the big one").
  if (e.number == null || e.title.toLowerCase().includes(`zemi #${e.number}`)) return e.title;
  return `Zemi #${e.number} · ${e.title}`;
}

export function EventPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const ability = useAbility();
  // Someone with only "Edit site pages" cannot open events: do not ask for one we know is a 403.
  const canView = !!value && ability.can('event', value, 'view');
  const current = useQuery({
    queryKey: [...adminKeys.events.detail(value ?? 'none'), 'label'],
    queryFn: ({ signal }) => api.get<EventAdmin>(`/admin/events/${value}`, undefined, signal),
    enabled: canView,
    staleTime: 60_000,
    retry: false,
  });
  const selected: ComboOption | null = value
    ? !canView
      ? { value, label: 'A Friday outside your access', description: 'It stays featured. Clear it to feature the next Friday.' }
      : current.data
        ? { value, label: eventLabel(current.data), description: formatJakarta(current.data.startsAt, 'date') }
        : { value, label: current.isError ? 'An event we could not load' : 'Loading...' }
    : null;
  const load = useCallback(async (q: string, signal: AbortSignal): Promise<ComboOption<EventAdminRow>[]> => {
    const page = await api.get<Paginated<EventAdminRow>>('/admin/events', { search: q || undefined, when: q ? 'all' : 'upcoming', pageSize: 20 }, signal);
    return page.items.map((e) => ({
      value: e.id,
      label: eventLabel(e),
      description: (
        <span className="flex items-center gap-1.5">
          {formatJakarta(e.startsAt, 'date')}
          {e.visibility !== 'published' ? <StatusChip kind="visibility" value={e.visibility} size="sm" /> : null}
        </span>
      ),
      data: e,
    }));
  }, []);
  return (
    <Combobox
      value={value}
      onValueChange={(v) => onChange(v)}
      loadOptions={load}
      selectedOption={selected}
      clearable
      placeholder="The next Friday, automatically"
      searchPlaceholder="Search events by title or number"
      emptyText="No events match. Upcoming ones show first."
    />
  );
}
