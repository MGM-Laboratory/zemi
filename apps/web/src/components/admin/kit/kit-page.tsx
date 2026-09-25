'use client';

import { LINK_KINDS, type LinkItem, type SpeakerRef } from '@zemi/shared';
import { Bell, CalendarPlus, Download, Mail, MoreHorizontal, Pencil, Plus, Send, Settings2, Trash2, Users } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { LINK_ICONS, LinkIcon } from '@/components/icons/link-icon';
import { LINK_KIND_LABELS } from '@/components/icons/link-kinds';
import { Can, useAbility } from '@/lib/admin/ability';
import { ApiError } from '@/lib/admin/api';
import { useBreadcrumbs } from '@/lib/admin/breadcrumbs';
import { cn } from '@/lib/admin/cn';
import { applyApiErrorToForm, useZodForm } from '@/lib/admin/form';
import type { NavIconName } from '@/lib/admin/nav';
import { AdminMark, type AdminMarkVariant } from '../brand/admin-mark';
import { AdminWordmark } from '../brand/admin-wordmark';
import { Character, type CharacterMood } from '../characters/character';
import {
  AccentPicker,
  BlockEditor,
  DragHandle,
  FILE_ACCEPT,
  FileUpload,
  ImageUploadCrop,
  JakartaDateTimeFields,
  LinksEditor,
  PublicationPicker,
  ReadOnlyScope,
  SlugField,
  SortableList,
  SpeakerPicker,
  TagsInput,
  VenueSelect,
  type JakartaRange,
  type PublicationRef,
} from '../fields';
import { NavIcon } from '../shell/nav-icons';
import {
  Avatar,
  AvatarStack,
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  Checkbox,
  Combobox,
  ConfirmDialog,
  CopyField,
  CountBadge,
  DataTable,
  DateText,
  Dialog,
  Divider,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  Field,
  Fieldset,
  FilterBar,
  FormError,
  FormField,
  FormSaveBar,
  IconButton,
  Input,
  Kbd,
  KeyValue,
  LoadingBlock,
  MultiCombobox,
  notify,
  NumberInput,
  PageHeader,
  Pagination,
  Popover,
  Progress,
  ProgressRing,
  RadioGroup,
  SearchInput,
  Section,
  SegmentedControl,
  Select,
  Sheet,
  Skeleton,
  SkeletonText,
  Slider,
  Sparkline,
  Spinner,
  StatCard,
  StatusChip,
  Stepper,
  Switch,
  TabNav,
  Tabs,
  Textarea,
  Timeline,
  Tooltip,
  useConfirm,
  type ColumnDef,
} from '../ui';

/* ------------------------------------------------------------------ helpers */

const SECTIONS = [
  ['brand', 'Brand'],
  ['buttons', 'Buttons'],
  ['inputs', 'Inputs'],
  ['forms', 'Forms'],
  ['status', 'Status'],
  ['layout', 'Layout'],
  ['navigation', 'Navigation'],
  ['overlays', 'Overlays'],
  ['feedback', 'Feedback'],
  ['data', 'Data'],
  ['fields', 'Fields'],
  ['access', 'Access'],
] as const;

function Demo({ title, note, children, className }: { title: string; note?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card padding="md" className={cn('space-y-4', className)}>
      <div>
        <h3 className="font-display text-[1.0625rem] font-extrabold tracking-[-0.015em]">{title}</h3>
        {note ? <p className="mt-1 text-sm text-ink-3">{note}</p> : null}
      </div>
      {children}
    </Card>
  );
}

function KitSection({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-[calc(var(--admin-topbar-h)+1.5rem)] space-y-4">
      <div className="flex items-baseline gap-3 border-b border-line pb-3">
        <h2 className="font-display text-2xl font-extrabold tracking-[-0.03em]">{title}</h2>
        <p className="text-sm text-ink-3">{description}</p>
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ sample data */

// Stable across server and client render (no Date.now() in render, so no hydration mismatch).
const KIT_EPOCH = Date.parse('2026-09-25T09:00:00.000Z');
const KIT_NOW_MINUS = (min: number) => new Date(KIT_EPOCH - min * 60_000).toISOString();

interface SampleEvent {
  id: string;
  number: number;
  title: string;
  startsAt: string;
  status: 'scheduled' | 'ongoing' | 'past' | 'cancelled';
  visibility: 'draft' | 'published' | 'unlisted';
  venue: string;
  registrations: number;
  capacity: number;
  speakers: string[];
}

const TITLES = [
  'Graph neural nets for traffic, the messy version',
  'Why my survey data lied to me',
  'Tiny models, big classrooms',
  'Reading Javanese manuscripts with OCR',
  'The ethics of scraping, again',
  'What 400 interviews taught me about coffee',
  'Robots that ask for help',
  'A gentle intro to causal graphs',
  'Mapping flood risk with phone data',
  'Peer review is broken (a love letter)',
  'Federated learning at the puskesmas',
  'Two years of failed experiments',
];

const SAMPLE_EVENTS: SampleEvent[] = TITLES.map((title, i) => ({
  id: `ev${i + 1}`,
  number: 42 - i,
  title,
  startsAt: new Date(Date.UTC(2026, 9, 2 - i * 7, 6, 15)).toISOString(),
  status: i === 0 ? 'scheduled' : i === 1 ? 'ongoing' : i === 5 ? 'cancelled' : 'past',
  visibility: i === 0 ? 'draft' : i === 3 ? 'unlisted' : 'published',
  venue: i % 3 === 0 ? 'Theater 2' : i % 3 === 1 ? 'Room 3.12' : 'Lab MGM',
  registrations: 30 + ((i * 37) % 90),
  capacity: 120,
  speakers: [['Rani Wijaya'], ['Dimas Pratama', 'Ayu Lestari'], ['Budi Santoso'], ['Sari Dewi', 'Rani Wijaya', 'Tono'], ['Ayu Lestari']][i % 5]!,
}));

const COLUMNS: ColumnDef<SampleEvent>[] = [
  {
    accessorKey: 'number',
    header: '#',
    meta: { width: '4.5rem', label: 'Number' },
    cell: ({ getValue }) => <span className="mono text-ink-3">#{getValue<number>()}</span>,
  },
  {
    accessorKey: 'title',
    header: 'Event',
    meta: { hideable: false },
    cell: ({ row }) => (
      <div className="min-w-[14rem]">
        <div className="font-medium text-ink">{row.original.title}</div>
        <div className="text-[0.8125rem] text-ink-3">{row.original.venue}</div>
      </div>
    ),
  },
  {
    accessorKey: 'startsAt',
    header: 'Date',
    cell: ({ getValue }) => <DateText value={getValue<string>()} format="date" className="whitespace-nowrap" />,
  },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <StatusChip kind="event" value={getValue<SampleEvent['status']>()} size="sm" /> },
  { accessorKey: 'visibility', header: 'Visibility', cell: ({ getValue }) => <StatusChip kind="visibility" value={getValue<SampleEvent['visibility']>()} size="sm" /> },
  {
    id: 'speakers',
    header: 'Speakers',
    enableSorting: false,
    cell: ({ row }) => <AvatarStack people={row.original.speakers.map((name) => ({ name }))} size={26} max={3} />,
  },
  {
    accessorKey: 'registrations',
    header: 'Seats',
    meta: { align: 'right' },
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        {row.original.registrations}
        <span className="text-ink-4">/{row.original.capacity}</span>
      </span>
    ),
  },
  {
    id: 'actions',
    header: () => <span className="sr-only">Actions</span>,
    enableSorting: false,
    meta: { width: '3.5rem', stopRowClick: true, hideable: false, align: 'right' },
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton label={`Actions for ${row.original.title}`} size="sm" tooltip={false}>
            <MoreHorizontal />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem icon={<Pencil />} onSelect={() => notify.info(`Edit ${row.original.title}`)}>
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem icon={<Send />} onSelect={() => notify.success('Tickets re-sent.')}>
            Resend tickets
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={<Trash2 />} destructive onSelect={() => notify.error('Deleted. Kidding, this is the kit.')}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

const SPEAKERS: SpeakerRef[] = [
  { id: 's1', slug: 'rani-wijaya', fullName: 'Rani Wijaya', nickname: 'Rani', headline: 'PhD, urban mobility', avatar: null, defaultOrganization: 'MGM Lab', defaultPosition: 'PhD student' },
  { id: 's2', slug: 'dimas-pratama', fullName: 'Dimas Pratama', nickname: null, headline: 'Survey methods', avatar: null, defaultOrganization: 'FILKOM UB', defaultPosition: 'Master student' },
  { id: 's3', slug: 'ayu-lestari', fullName: 'Ayu Lestari', nickname: 'Ayu', headline: 'NLP for Javanese', avatar: null, defaultOrganization: 'MGM Lab', defaultPosition: 'Researcher' },
  { id: 's4', slug: 'budi-santoso', fullName: 'Budi Santoso', nickname: null, headline: 'Robotics', avatar: null, defaultOrganization: 'ITB', defaultPosition: 'Lecturer' },
];

const demoSchema = z.object({
  title: z.string().min(1, 'Every Friday needs a title.').max(80, 'Keep it under 80 characters.'),
  email: z.email('That email looks off. Mind checking it?'),
  capacity: z.number().int().min(1, 'At least one seat.').nullable(),
  mode: z.enum(['hybrid', 'offline', 'online']),
  notify: z.boolean(),
});

/* ------------------------------------------------------------------ page */

export function KitPage() {
  useBreadcrumbs([{ label: 'Overview', href: '/admin' }, { label: 'UI kit' }]);
  const [active, setActive] = useState<string>('brand');
  useEffect(() => {
    const els = SECTIONS.map(([id]) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setActive(vis.target.id);
      },
      { rootMargin: '-80px 0px -65% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <>
      <PageHeader
        title="UI kit"
        description="Every building block of the studio, alive. Copy what you need; the source of each piece lives in components/admin."
        meta={<Badge tone="outline">Docs: docs/foundation/web-admin.md</Badge>}
      />
      <div className="grid gap-10 xl:grid-cols-[11rem_minmax(0,1fr)]">
        <nav aria-label="Kit sections" className="hidden xl:block">
          <ul className="sticky top-[calc(var(--admin-topbar-h)+4.5rem)] space-y-0.5 text-sm">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  aria-current={active === id ? 'true' : undefined}
                  className={cn('block rounded-lg px-3 py-1.5 transition-colors', active === id ? 'bg-surface-muted font-semibold text-ink' : 'text-ink-3 hover:text-ink')}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-14">
          <BrandSection />
          <ButtonsSection />
          <InputsSection />
          <FormsSection />
          <StatusSection />
          <LayoutSection />
          <NavigationSection />
          <OverlaysSection />
          <FeedbackSection />
          <DataSection />
          <FieldsSection />
          <AccessSection />
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ sections */

const MOODS: CharacterMood[] = ['idle', 'look', 'closed', 'happy', 'cheer', 'oops', 'sleep'];
const NAV_ICONS: NavIconName[] = ['overview', 'events', 'speakers', 'publications', 'venues', 'media', 'site', 'inbox', 'audience', 'admins', 'audit', 'system', 'kit'];

function BrandSection() {
  const [variant, setVariant] = useState<AdminMarkVariant>('idle');
  const [replay, setReplay] = useState(0);
  return (
    <KitSection id="brand" title="Brand" description="Mark, wordmark, characters and icons.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Demo title="Mark and wordmark" note="AdminMark stands in for @/components/brand until it ships.">
          <div className="flex flex-wrap items-center gap-6">
            <AdminMark size={64} variant={variant} label="Zemi" />
            <AdminWordmark className="text-5xl" />
            <div className="rounded-2xl bg-ink p-3">
              <AdminMark size={40} tone="paper" variant={variant} />
            </div>
          </div>
          <SegmentedControl
            aria-label="Mark animation"
            value={variant}
            onValueChange={setVariant}
            options={[
              { value: 'idle', label: 'Idle' },
              { value: 'loading', label: 'Loading' },
              { value: 'cheer', label: 'Cheer' },
            ]}
          />
        </Demo>
        <Demo title="Characters" note="Q, Hunch, Block and Bridge. Eyes follow the cursor, blink, and react.">
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
            {MOODS.map((m, i) => (
              <div key={m} className="flex flex-col items-center gap-1.5">
                <Character shape={(['circle', 'triangle', 'square', 'arch'] as const)[i % 4]} mood={m} follow={m === 'look'} size={48} replayKey={replay} />
                <span className="mono text-[0.6875rem] text-ink-3">{m}</span>
              </div>
            ))}
          </div>
          <Button size="sm" onClick={() => setReplay((r) => r + 1)}>
            Replay
          </Button>
        </Demo>
        <Demo title="Link icons" note="components/icons. Used on public profiles too. 24px grid, 1.75 stroke, currentColor.">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {LINK_KINDS.map((k) => {
              const Icon = LINK_ICONS[k];
              return (
                <div key={k} className="flex flex-col items-center gap-1.5 rounded-xl border border-line py-3 text-ink">
                  <Icon size={24} />
                  <span className="text-[0.6875rem] text-ink-3">{LINK_KIND_LABELS[k]}</span>
                </div>
              );
            })}
          </div>
        </Demo>
        <Demo title="Nav icons" note="Built from the four shapes.">
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
            {NAV_ICONS.map((n) => (
              <div key={n} className="flex flex-col items-center gap-1.5 rounded-xl border border-line py-3 text-ink-2">
                <NavIcon name={n} size={22} />
                <span className="text-[0.6875rem] text-ink-3">{n}</span>
              </div>
            ))}
          </div>
        </Demo>
      </div>
    </KitSection>
  );
}

function ButtonsSection() {
  const [loading, setLoading] = useState(false);
  return (
    <KitSection id="buttons" title="Buttons" description="Say what happens. Press scales to 0.96.">
      <Demo title="Variants">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon={<CalendarPlus />}>
            New event
          </Button>
          <Button variant="secondary">Preview</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="blue" icon={<Send />}>
            Send tickets
          </Button>
          <Button variant="danger" icon={<Trash2 />}>
            Delete event
          </Button>
          <Button variant="danger-soft">Cancel event</Button>
          <Button variant="link">Open on the site</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="xs">Extra small</Button>
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg" variant="primary">
            Large
          </Button>
          <Button
            variant="primary"
            loading={loading}
            onClick={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 1600);
            }}
          >
            Save changes
          </Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IconButton label="Settings">
            <Settings2 />
          </IconButton>
          <IconButton label="Notifications" variant="secondary">
            <Bell />
          </IconButton>
          <IconButton label="Add" variant="primary">
            <Plus />
          </IconButton>
          <IconButton label="Delete" variant="danger">
            <Trash2 />
          </IconButton>
          <IconButton label="Saving" loading variant="secondary">
            <Plus />
          </IconButton>
        </div>
      </Demo>
    </KitSection>
  );
}

function InputsSection() {
  const [text, setText] = useState('Graph neural nets for traffic');
  const [notes, setNotes] = useState('Bring snacks.\nAsk about the dataset license.');
  const [num, setNum] = useState<number | null>(120);
  const [mode, setMode] = useState<string | null>('hybrid');
  const [venue, setVenue] = useState<string | null>(null);
  const [multi, setMulti] = useState<string[]>(['s1']);
  const [checked, setChecked] = useState(true);
  const [sw, setSw] = useState(true);
  const [radio, setRadio] = useState('in-person');
  const [card, setCard] = useState('hybrid');
  const [seg, setSeg] = useState('upcoming');
  const [slider, setSlider] = useState(60);
  const speakerOptions = SPEAKERS.map((s) => ({ value: s.id, label: s.fullName, description: s.headline ?? undefined, icon: <Avatar name={s.fullName} size={24} /> }));
  return (
    <KitSection id="inputs" title="Inputs" description="Inside a Field they get ids, aria and error states for free.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Demo title="Text">
          <Field label="Title" required hint="Short and specific wins." count={{ value: text.length, max: 80 }}>
            <Input value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Field label="Email" error="That email looks off. Mind checking it?">
            <Input defaultValue="rani@" leading={<Mail />} />
          </Field>
          <Field label="Notes" optional hint="Grows as you type.">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} minRows={2} />
          </Field>
          <Field label="Capacity">
            <NumberInput value={num} onChange={setNum} min={1} max={500} unit="seats" />
          </Field>
          <Field label="Read only" readOnly hint="For people who can view but not edit.">
            <Input value="zm7K3F9QpL2xT8vA" mono readOnly />
          </Field>
        </Demo>
        <Demo title="Choice">
          <Field label="Mode">
            <Select
              value={mode}
              onValueChange={setMode}
              options={[
                { value: 'hybrid', label: 'Hybrid', description: 'In the room and on the stream' },
                { value: 'offline', label: 'In person only' },
                { value: 'online', label: 'Online only' },
              ]}
            />
          </Field>
          <Field label="Room (Combobox)">
            <Combobox
              value={venue}
              onValueChange={setVenue}
              clearable
              placeholder="Pick a room"
              options={[
                { value: 'v1', label: 'Theater 2', description: 'Gedung F · 120 seats' },
                { value: 'v2', label: 'Room 3.12', description: 'Gedung G · 40 seats' },
                { value: 'v3', label: 'Lab MGM', description: 'Gedung F · 24 seats' },
              ]}
              onCreate={(q) => {
                notify.info(`Would create "${q}"`);
              }}
            />
          </Field>
          <Field label="Speakers (MultiCombobox, async)">
            <MultiCombobox
              values={multi}
              onValuesChange={setMulti}
              selectedOptions={speakerOptions}
              loadOptions={async (q) => {
                await new Promise((r) => setTimeout(r, 350));
                return speakerOptions.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
              }}
              placeholder="Add speaker"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Checkbox checked={checked} onCheckedChange={setChecked} label="Email registrants" description="They get the update right away." />
            <Switch checked={sw} onCheckedChange={setSw} label="Registration open" description="Close it when the room is full." />
          </div>
          <RadioGroup
            value={radio}
            onValueChange={setRadio}
            orientation="horizontal"
            aria-label="Attendance"
            options={[
              { value: 'in-person', label: 'In person' },
              { value: 'online', label: 'Online' },
            ]}
          />
          <RadioGroup
            variant="cards"
            value={card}
            onValueChange={setCard}
            aria-label="Mode cards"
            options={[
              { value: 'hybrid', label: 'Hybrid', description: 'Room + stream' },
              { value: 'offline', label: 'Offline', description: 'Room only' },
              { value: 'online', label: 'Online', description: 'Stream only' },
            ]}
          />
          <SegmentedControl
            aria-label="When"
            value={seg}
            onValueChange={setSeg}
            options={[
              { value: 'upcoming', label: 'Upcoming', count: 3 },
              { value: 'past', label: 'Past', count: 41 },
              { value: 'all', label: 'All' },
            ]}
          />
          <Slider label="Volume" value={slider} onChange={setSlider} min={0} max={100} defaultValue={50} display={`${slider}%`} />
        </Demo>
      </div>
    </KitSection>
  );
}

function FormsSection() {
  const form = useZodForm(demoSchema, { defaultValues: { title: 'Friday #43', email: '', capacity: 80, mode: 'hybrid', notify: true } });
  const [saving, setSaving] = useState(false);
  const submit = form.handleSubmit(async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 700));
    setSaving(false);
    // Pretend the server rejected the title, like a real 400 with zod issues.
    const err = new ApiError({
      status: 400,
      code: 'validation',
      message: 'Some fields need a look.',
      details: { issues: [{ path: ['title'], message: 'Another event already uses this title on that Friday.' }] },
    });
    if (!applyApiErrorToForm(form, err)) notify.error(err);
  });
  return (
    <KitSection id="forms" title="Forms" description="react-hook-form + zod, with server errors mapped back onto fields.">
      <Demo title="FormField + applyApiErrorToForm + FormSaveBar" note="Submit shows a server-side field error. Edit a field to see the save bar. Cmd/Ctrl+S saves.">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormError errors={form.formState.errors} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField control={form.control} name="title" label="Title" required maxLength={80}>
              {(field) => <Input {...field} />}
            </FormField>
            <FormField control={form.control} name="email" label="Contact email" hint="Only the crew sees this.">
              {(field) => <Input {...field} type="email" />}
            </FormField>
            <FormField control={form.control} name="capacity" label="Capacity">
              {(field) => <NumberInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} min={1} unit="seats" />}
            </FormField>
            <FormField control={form.control} name="mode" label="Mode">
              {(field) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => v && field.onChange(v)}
                  options={[
                    { value: 'hybrid', label: 'Hybrid' },
                    { value: 'offline', label: 'In person only' },
                    { value: 'online', label: 'Online only' },
                  ]}
                />
              )}
            </FormField>
          </div>
          <FormField control={form.control} name="notify" hideLabel label="Notify">
            {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} label="Email everyone who registered" />}
          </FormField>
          <Fieldset legend="A fieldset" description="Groups related fields with a small heading.">
            <Field label="Room note" optional>
              <Input placeholder="Second floor, next to the plants" />
            </Field>
          </Fieldset>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={saving}>
              Save event
            </Button>
            <Button type="button" variant="ghost" onClick={() => form.reset()}>
              Reset
            </Button>
          </div>
          <FormSaveBar form={form} saving={saving} onSave={() => void submit()} />
        </form>
      </Demo>
    </KitSection>
  );
}

function StatusSection() {
  return (
    <KitSection id="status" title="Status" description="Chips and badges. Yellow is only ever a fill.">
      <Demo title="StatusChip">
        <div className="flex flex-wrap gap-2">
          {(['scheduled', 'ongoing', 'past', 'cancelled'] as const).map((v) => (
            <StatusChip key={v} kind="event" value={v} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(['draft', 'published', 'unlisted'] as const).map((v) => (
            <StatusChip key={v} kind="visibility" value={v} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(['idle', 'preview', 'live', 'ended'] as const).map((v) => (
            <StatusChip key={v} kind="stream" value={v} />
          ))}
          {(['processing', 'ready', 'failed'] as const).map((v) => (
            <StatusChip key={v} kind="asset" value={v} />
          ))}
          {(['registered', 'checked-in', 'cancelled'] as const).map((v) => (
            <StatusChip key={v} kind="registration" value={v} />
          ))}
        </div>
      </Demo>
      <Demo title="Badge and CountBadge">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Neutral</Badge>
          <Badge tone="blue" shape="circle">
            Keynote
          </Badge>
          <Badge tone="yellow" shape="square">
            Needs a cover
          </Badge>
          <Badge tone="red" shape="triangle">
            Full
          </Badge>
          <Badge tone="green" shape="arch">
            Checked in
          </Badge>
          <Badge tone="ink">Superadmin</Badge>
          <Badge tone="outline" icon={<Users />}>
            12 people
          </Badge>
          <Badge size="sm" tone="blue">
            sm
          </Badge>
          <CountBadge count={3} />
          <CountBadge count={128} tone="neutral" />
          <CountBadge count={7} tone="blue" />
        </div>
      </Demo>
    </KitSection>
  );
}

function LayoutSection() {
  return (
    <KitSection id="layout" title="Layout" description="Cards, sections, page headers and read-only details.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="CardHeader" description="Title, description and actions." actions={<Button size="sm">Edit</Button>} />
          <KeyValue
            items={[
              { label: 'Room', value: 'Theater 2, Gedung F' },
              { label: 'Ticket code', value: 'ZM-7K3F9Q', mono: true },
              { label: 'Starts', value: <DateText value="2026-10-02T06:15:00.000Z" /> },
              { label: 'Notes', value: null },
            ]}
          />
        </Card>
        <Card muted>
          <CardHeader title="Muted card" description="For side panels and tips." />
          <Divider label="or" className="my-3" />
          <p className="text-sm text-ink-3">Dividers can carry a small label.</p>
        </Card>
      </div>
      <Card>
        <Section aside title="Section, aside layout" description="Calm settings pages: text on the left, fields on the right.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Site name">
              <Input defaultValue="Zemi" />
            </Field>
            <Field label="Tagline">
              <Input defaultValue="The Friday seminar for half-finished research." />
            </Field>
          </div>
        </Section>
      </Card>
      <Card padding="none" className="overflow-hidden">
        <div className="bg-white p-5 sm:p-6">
          <PageHeader
            sticky={false}
            className="!mb-0"
            back={{ href: '/admin/kit', label: 'Events' }}
            eyebrow={
              <>
                <StatusChip kind="event" value="scheduled" size="sm" />
                <span className="mono text-xs text-ink-3">Zemi #43</span>
              </>
            }
            title="Graph neural nets for traffic"
            description="PageHeader with a back link, eyebrow, meta and actions. In pages the title row sticks under the topbar."
            meta={<StatusChip kind="visibility" value="draft" size="sm" />}
            actions={
              <>
                <Button size="sm">Preview</Button>
                <Button size="sm" variant="primary">
                  Publish
                </Button>
              </>
            }
          />
        </div>
      </Card>
    </KitSection>
  );
}

function NavigationSection() {
  const [step, setStep] = useState(1);
  const [page, setPage] = useState(3);
  const [size, setSize] = useState(20);
  return (
    <KitSection id="navigation" title="Navigation" description="Tabs, route tabs, steppers and pagination.">
      <Demo title="Tabs (in page)">
        <Tabs
          aria-label="Demo tabs"
          items={[
            { value: 'details', label: 'Details', content: <p className="text-sm text-ink-3">Details go here.</p> },
            { value: 'people', label: 'Registrations', count: 64, content: <p className="text-sm text-ink-3">64 people.</p> },
            { value: 'stream', label: 'Stream', content: <p className="text-sm text-ink-3">OBS settings.</p> },
            { value: 'secret', label: 'Hidden', hidden: true },
          ]}
        />
      </Demo>
      <Demo title="TabNav (route based)" note="Real links. Hidden items (no permission) never render. Arrow keys move focus.">
        <TabNav
          aria-label="Event sections"
          items={[
            { href: '/admin/kit', label: 'Details', exact: true },
            { href: '/admin/kit/registrations', label: 'Registrations', count: 64 },
            { href: '/admin/kit/attendance', label: 'Attendance' },
            { href: '/admin/kit/stream', label: 'Stream', live: true },
            { href: '/admin/kit/media', label: 'Media' },
            { href: '/admin/kit/emails', label: 'Emails', hidden: true },
          ]}
        />
      </Demo>
      <Demo title="Stepper">
        <Stepper
          current={step}
          onStepClick={setStep}
          steps={[
            { key: 'basics', label: 'Basics' },
            { key: 'people', label: 'Speakers' },
            { key: 'room', label: 'Room and time' },
            { key: 'publish', label: 'Publish' },
          ]}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))}>
            Back
          </Button>
          <Button size="sm" variant="primary" onClick={() => setStep((s) => Math.min(3, s + 1))}>
            Next
          </Button>
        </div>
      </Demo>
      <Demo title="Pagination">
        <Pagination page={page} pageSize={size} total={432} onPageChange={setPage} onPageSizeChange={setSize} noun="registrations" />
      </Demo>
    </KitSection>
  );
}

function OverlaysSection() {
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ask = useConfirm();
  const [cols, setCols] = useState({ email: true, phone: false });
  return (
    <KitSection id="overlays" title="Overlays" description="Dialogs become bottom sheets on phones.">
      <Demo title="Dialog, Sheet, Confirm">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDialog(true)}>Open dialog</Button>
          <Button onClick={() => setSheet(true)}>Open sheet</Button>
          <Button variant="danger-soft" onClick={() => setConfirm(true)}>
            Delete (type to confirm)
          </Button>
          <Button
            onClick={async () => {
              const ok = await ask({ title: 'Remove this speaker from the event?', description: 'Their talk title and role go with them. The speaker profile stays.', confirmLabel: 'Remove speaker', destructive: true });
              if (ok) notify.success('Removed.');
            }}
          >
            useConfirm()
          </Button>
        </div>
        <Dialog
          open={dialog}
          onOpenChange={setDialog}
          title="Add a room"
          description="Rooms are reusable across events."
          accent="green"
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialog(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setDialog(false)}>
                Add room
              </Button>
            </>
          }
        >
          <Field label="Name" required>
            <Input autoFocus placeholder="Theater 2" />
          </Field>
        </Dialog>
        <Sheet open={sheet} onOpenChange={setSheet} title="Rani Wijaya" description="Registered 3 days ago" footer={<Button variant="primary">Check in</Button>}>
          <KeyValue
            columns={1}
            items={[
              { label: 'Email', value: 'rani@example.com' },
              { label: 'Phone', value: '+62 812 3456 7890' },
              { label: 'Ticket', value: 'ZM-7K3F9Q', mono: true },
            ]}
          />
        </Sheet>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          destructive
          title="Delete this event?"
          description="64 registrations, their tickets and the recording go with it. This cannot be undone."
          confirmLabel="Delete event"
          typeToConfirm="Graph neural nets for traffic"
          onConfirm={() => new Promise((r) => setTimeout(r, 900)).then(() => notify.success('Deleted. Kidding, this is the kit.'))}
        />
      </Demo>
      <Demo title="Menu, Popover, Tooltip">
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button iconRight={<MoreHorizontal />}>Menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Export</DropdownMenuLabel>
              <DropdownMenuItem icon={<Download />} shortcut="CSV">
                Download CSV
              </DropdownMenuItem>
              <DropdownMenuItem icon={<Download />} shortcut="XLSX">
                Download Excel
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Columns</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={cols.email} onCheckedChange={(v) => setCols((c) => ({ ...c, email: Boolean(v) }))}>
                Email
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={cols.phone} onCheckedChange={(v) => setCols((c) => ({ ...c, phone: Boolean(v) }))}>
                Phone
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<Trash2 />} destructive>
                Delete all
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Popover trigger={<Button>Popover</Button>} className="w-72">
            <p className="text-sm font-semibold">Popovers hold small forms.</p>
            <p className="mt-1 text-sm text-ink-3">Escape or a click outside closes them.</p>
          </Popover>
          <Tooltip content="Tooltips explain icons" shortcut="⌘K">
            <Button variant="ghost">Hover me</Button>
          </Tooltip>
        </div>
      </Demo>
    </KitSection>
  );
}

function FeedbackSection() {
  const [progress, setProgress] = useState(0.42);
  return (
    <KitSection id="feedback" title="Feedback" description="Loading, empty, error, progress and toasts.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Demo title="Toasts" note="Success toasts can cheer.">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => notify.success('Saved.')}>
              Success
            </Button>
            <Button size="sm" onClick={() => notify.success('Event published. See you Friday.', { celebrate: true })}>
              Celebrate
            </Button>
            <Button size="sm" onClick={() => notify.error(new ApiError({ status: 409, code: 'conflict', message: 'Someone else changed this at the same time. Reload and try again.' }))}>
              Error
            </Button>
            <Button size="sm" onClick={() => notify.info('Recording is processing. We will ping you.')}>
              Info
            </Button>
            <Button size="sm" onClick={() => notify.warning('Only 3 seats left.')}>
              Warning
            </Button>
            <Button size="sm" onClick={() => notify.promise(new Promise((r) => setTimeout(r, 1400)), { loading: 'Sending tickets...', success: 'Tickets sent.' })}>
              Promise
            </Button>
          </div>
        </Demo>
        <Demo title="Loading">
          <div className="flex items-center gap-4">
            <Spinner />
            <Spinner size={28} />
            <Spinner tone="ink" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <SkeletonText lines={2} />
            </div>
          </div>
          <LoadingBlock label="Loading registrations" className="min-h-28" />
        </Demo>
        <Demo title="Progress">
          <Progress value={progress} label="Uploading cover.jpg" showValue />
          <Progress value={null} size="sm" label="Processing" />
          <div className="flex items-center gap-4">
            <ProgressRing value={progress} />
            <ProgressRing value={1} />
            <ProgressRing value={null} tone="green" />
            <Slider label="Value" hideLabel value={progress * 100} onChange={(v) => setProgress(v / 100)} className="flex-1" />
          </div>
        </Demo>
        <Demo title="Callout">
          <Callout tone="blue" title="Heads up">
            Registrations close automatically when the event starts.
          </Callout>
          <Callout tone="yellow" title="Draft">
            Only admins can see this event.
          </Callout>
          <Callout tone="red" title="Signal lost" action={<Button size="sm">Check OBS</Button>}>
            OBS dropped. Viewers see a hang tight slate.
          </Callout>
        </Demo>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <EmptyState title="No Fridays yet" description="Add the first one and it shows up here." action={<Button variant="primary" icon={<Plus />}>New event</Button>} />
        <ErrorState error={new ApiError({ status: 403, code: 'forbidden', message: 'Nope' })} onRetry={() => {}} />
      </div>
      <ErrorState size="sm" error={new ApiError({ status: 0, code: 'network', message: '' })} onRetry={() => notify.info('Retrying')} />
    </KitSection>
  );
}

function DataSection() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const rows = SAMPLE_EVENTS.filter((e) => (!search || e.title.toLowerCase().includes(search.toLowerCase())) && (!status || e.status === status));
  const [active, setActive] = useState<SampleEvent | null>(null);
  return (
    <KitSection id="data" title="Data" description="Tables, filters, stats and small data displays.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Registrations" value="1,284" delta={0.12} deltaLabel="vs last month" chart={<Sparkline data={[4, 9, 7, 12, 10, 16, 21, 18, 26]} />} accent="blue" />
        <StatCard label="Checked in" value="71%" delta={-0.04} deltaLabel="vs last Friday" chart={<Sparkline data={[80, 76, 78, 72, 74, 71]} />} accent="green" />
        <StatCard label="Talks" value="42" hint="since 2025" accent="yellow" />
        <StatCard label="Unread messages" value="3" icon={<Mail />} accent="red" />
      </div>
      <DataTable
        aria-label="Events"
        columns={COLUMNS}
        data={rows}
        getRowId={(r) => r.id}
        storageKey="kit-events"
        noun="events"
        clientPageSize={6}
        pageSizes={[6, 12]}
        selectable
        activeRowId={active?.id}
        onRowClick={(r) => setActive(r)}
        bulkActions={({ ids, clear }) => (
          <>
            <Button size="sm" onClick={() => notify.success(`Published ${ids.length}.`)}>
              Publish
            </Button>
            <Button size="sm" variant="danger" onClick={() => { notify.error(`Deleted ${ids.length}. Kidding.`); clear(); }}>
              Delete
            </Button>
          </>
        )}
        toolbar={
          <FilterBar
            className="w-full"
            search={<SearchInput value={search} onValueChange={setSearch} placeholder="Search events" slashToFocus />}
            filters={
              <Select
                size="md"
                aria-label="Status"
                className="w-40"
                value={status}
                onValueChange={setStatus}
                clearable="Any status"
                placeholder="Any status"
                options={[
                  { value: 'scheduled', label: 'Coming up' },
                  { value: 'ongoing', label: 'Happening now' },
                  { value: 'past', label: 'Wrapped' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
              />
            }
            chips={[
              ...(search ? [{ key: 'q', label: `Search: ${search}`, onRemove: () => setSearch('') }] : []),
              ...(status ? [{ key: 's', label: `Status: ${status}`, onRemove: () => setStatus(null) }] : []),
            ]}
            onClearAll={() => {
              setSearch('');
              setStatus(null);
            }}
          />
        }
        empty={<EmptyState framed={false} size="sm" title="Nothing matches" description="Try a different word or clear the filters." />}
      />
      <Sheet open={Boolean(active)} onOpenChange={(o) => !o && setActive(null)} title={active?.title ?? ''} description="Row click opens a Sheet.">
        {active ? (
          <KeyValue
            items={[
              { label: 'Number', value: `#${active.number}`, mono: true },
              { label: 'Date', value: <DateText value={active.startsAt} format="date-long" /> },
              { label: 'Status', value: <StatusChip kind="event" value={active.status} size="sm" /> },
              { label: 'Speakers', value: <AvatarStack people={active.speakers.map((name) => ({ name }))} /> },
            ]}
          />
        ) : null}
      </Sheet>
      <div className="grid gap-4 lg:grid-cols-3">
        <Demo title="Timeline">
          <Timeline
            items={[
              { id: '1', title: <><strong>Rani</strong> checked in Dimas</>, description: 'QR, door A', at: KIT_NOW_MINUS(1), tone: 'green' },
              { id: '2', title: <><strong>Superadmin</strong> published the event</>, at: KIT_NOW_MINUS(180), tone: 'blue' },
              { id: '3', title: 'Recording ready', description: '1:58:12, 1.2 GB', at: KIT_NOW_MINUS(26 * 60), tone: 'yellow' },
              { id: '4', title: 'Stream ended', at: KIT_NOW_MINUS(27 * 60), tone: 'red' },
            ]}
          />
        </Demo>
        <Demo title="CopyField">
          <CopyField label="Server" value="rtmp://media.labmgm.org:1935/live" size="sm" />
          <CopyField label="Stream key" value="zm7K3F9QpL2xT8vA?key=Q2x9LmP4sT7vW1yZ8bN3cR6dF0gH5jK2" secret size="sm" />
        </Demo>
        <Demo title="People, dates, keys">
          <div className="flex items-center gap-3">
            <Avatar name="Rani Wijaya" size={44} />
            <Avatar name="Dimas Pratama" size={44} variant="shape" />
            <Avatar name="Ayu Lestari" size={44} variant="shape" shape="arch" />
            <AvatarStack people={SPEAKERS.map((s) => ({ name: s.fullName }))} max={3} />
          </div>
          <ul className="space-y-1 text-sm">
            <li>
              <DateText value="2026-10-02T06:15:00.000Z" format="date-long" />
            </li>
            <li>
              <DateText value="2026-10-02T06:15:00.000Z" end="2026-10-02T08:15:00.000Z" format="time-range" />
            </li>
            <li>
              <DateText value={KIT_NOW_MINUS(5)} format="relative" />
            </li>
          </ul>
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
            <Kbd keys={['mod', 'k']} /> palette <Kbd>?</Kbd> shortcuts <Kbd>G</Kbd>
            <Kbd>E</Kbd> events
          </div>
        </Demo>
      </div>
    </KitSection>
  );
}

function FieldsSection() {
  const [ro, setRo] = useState(false);
  const [cover, setCover] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [pdf, setPdf] = useState<string | null>(null);
  const [title, setTitle] = useState('Graph neural nets for traffic');
  const [slug, setSlug] = useState('');
  const [range, setRange] = useState<JakartaRange | null>(null);
  const [speaker, setSpeaker] = useState<SpeakerRef | null>(null);
  const [pub, setPub] = useState<PublicationRef | null>(null);
  const [venue, setVenue] = useState<string | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([
    { kind: 'linkedin', url: 'https://linkedin.com/in/rani', label: null },
    { kind: 'scholar', url: 'https://scholar.google.com/citations?user=abc', label: null },
  ]);
  const [tags, setTags] = useState<string[]>(['machine learning', 'traffic']);
  const [accent, setAccent] = useState<'blue' | 'yellow' | 'red' | 'green'>('blue');
  const [order, setOrder] = useState(['Doors open', 'First talk', 'Questions', 'Coffee']);
  return (
    <KitSection id="fields" title="Fields" description="The heavy lifters. They talk to the API; here some endpoints may 404 until they are built.">
      <Switch checked={ro} onCheckedChange={setRo} label="Read-only mode" description="Wrap a form in <ReadOnlyScope> when the ability lacks edit." />
      <ReadOnlyScope readOnly={ro}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Demo title="ImageUploadCrop" note="Drop, paste or browse. Crop is locked to the purpose: 4:5 covers, 1:1 avatars.">
            <div className="flex flex-wrap items-start gap-6">
              <Field label="Event cover" className="w-full max-w-[16rem]">
                <ImageUploadCrop purpose="event-cover" value={cover} onChange={(id) => setCover(id)} />
              </Field>
              <Field label="Avatar">
                <ImageUploadCrop purpose="speaker-avatar" value={avatar} onChange={(id) => setAvatar(id)} />
              </Field>
            </div>
          </Demo>
          <Demo title="FileUpload" note="PDF, video or any file. Progress, cancel, processing.">
            <Field label="Paper PDF">
              <FileUpload purpose="publication-pdf" accept={FILE_ACCEPT.pdf} value={pdf} onChange={(id) => setPdf(id)} />
            </Field>
          </Demo>
          <Demo title="SlugField" note="Follows the title until you edit it.">
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} readOnly={ro} />
            </Field>
            <Field label="Slug">
              <SlugField value={slug} onChange={setSlug} source={title} basePath="/events/" savedSlug="graph-nets-traffic" />
            </Field>
          </Demo>
          <Demo title="JakartaDateTimeFields" note="Always WIB. Quick chips for the next free Fridays.">
            <JakartaDateTimeFields value={range} onChange={setRange} />
          </Demo>
          <Demo title="Pickers" note="Async lookups with avatars and inline create.">
            <Field label="Speaker">
              <SpeakerPicker value={speaker} onChange={setSpeaker} clearable onCreate={(name) => {
                  notify.info(`Would open the new speaker form for ${name}`);
                }} />
            </Field>
            <Field label="Publication">
              <PublicationPicker value={pub} onChange={setPub} clearable />
            </Field>
            <Field label="Room">
              <VenueSelect value={venue} onChange={(id) => setVenue(id)} />
            </Field>
          </Demo>
          <Demo title="Accent, tags, sortable">
            <Field label="Accent">
              <AccentPicker value={accent} onChange={setAccent} />
            </Field>
            <Field label="Tags" hint="Enter or comma adds one.">
              <TagsInput value={tags} onChange={setTags} suggestions={['nlp', 'robotics', 'hci', 'data']} />
            </Field>
            <Field label="Rundown order">
              <SortableList
                items={order}
                getId={(s) => s}
                onReorder={setOrder}
                itemLabel={(s) => s}
                renderItem={(s, { handle, index, readOnly }) => (
                  <div className="flex items-center gap-2 rounded-xl border border-line bg-white py-1 pr-3 pl-1">
                    <DragHandle {...handle} disabled={readOnly} />
                    <span className="mono w-6 text-xs text-ink-4">{index + 1}</span>
                    <span className="text-[0.9375rem]">{s}</span>
                  </div>
                )}
              />
            </Field>
          </Demo>
        </div>
        <Demo title="LinksEditor" note="Paste a URL and the kind is detected.">
          <LinksEditor value={links} onChange={setLinks} />
          <div className="flex flex-wrap gap-3 text-ink-2">
            {links.map((l, i) => (
              <LinkIcon key={i} kind={l.kind} labelled className="size-5" />
            ))}
          </div>
        </Demo>
        <Demo title="BlockEditor" note="BlockNote 0.55, loaded only when needed. Type / for blocks.">
          <BlockEditor
            value={[
              { type: 'heading', props: { level: 2 }, content: 'What this talk is about' },
              { type: 'paragraph', content: 'Traffic data is messy. This is the story of making a graph model survive Jakarta.' },
            ]}
            onChange={() => {}}
          />
        </Demo>
      </ReadOnlyScope>
    </KitSection>
  );
}

function AccessSection() {
  const ability = useAbility();
  return (
    <KitSection id="access" title="Access" description="Permission-aware rendering with <Can>. The server enforces everything anyway.">
      <Demo title="<Can> gates">
        <ul className="space-y-2 text-[0.9375rem]">
          <li className="flex items-center justify-between gap-3">
            <code className="mono text-sm">{'<Can cap="events.create">'}</code>
            <Can cap="events.create" fallback={<Badge>hidden</Badge>}>
              <Button size="sm" variant="primary" icon={<Plus />}>
                New event
              </Button>
            </Can>
          </li>
          <li className="flex items-center justify-between gap-3">
            <code className="mono text-sm">{'<Can type="event" id="e1" action="stream.control">'}</code>
            <Can type="event" id="e1" action="stream.control" fallback={<Badge>hidden</Badge>}>
              <Button size="sm" variant="danger">
                Go live
              </Button>
            </Can>
          </li>
          <li className="flex items-center justify-between gap-3">
            <code className="mono text-sm">{'<Can superadmin>'}</code>
            <Can superadmin fallback={<Badge>hidden</Badge>}>
              <Badge tone="ink">You hold every key</Badge>
            </Can>
          </li>
          <li className="flex items-center justify-between gap-3">
            <code className="mono text-sm">{'<Can type="speaker" action="edit">{(ok) => ...}'}</code>
            <Can type="speaker" action="edit">
              {(ok) => <Input size="sm" readOnly={!ok} defaultValue={ok ? 'You can edit this' : 'Read only for you'} className="w-56" />}
            </Can>
          </li>
        </ul>
        <p className="text-sm text-ink-3">Signed in as {ability.principal.name}.</p>
      </Demo>
    </KitSection>
  );
}
