/**
 * Plain-English summary of a policy and least-privilege hints. Pure functions.
 *
 * "Can scan tickets and check people in for Zemi #88 and #89. Can edit Zemi #88.
 *  Cannot see emails or phone numbers."
 */
import { expandActions, type AnyAction, type Capability, type Policy, type ResourceType } from '@zemi/shared';
import { RESOURCE_META, RESOURCE_ORDER, cleanPolicy } from './policy-model';

export type LabelFn = (type: ResourceType, id: string) => string;

export interface SummaryLine {
  text: string;
  tone: 'can' | 'cannot';
  /** Which area it is about, for the little shape next to it. */
  area: ResourceType | 'capability' | 'none';
}

/* ------------------------------------------------------------------ joining names */

export function listSentence(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "Zemi #88 and #89", "Zemi #88, "Robot talk" and 3 more". */
export function joinSubjects(labels: string[], max = 4): string {
  const shown = labels.slice(0, max);
  const rest = labels.length - shown.length;
  let prevZemi = false;
  const parts = shown.map((l) => {
    const m = /^Zemi #(\d+)$/.exec(l);
    if (m && prevZemi) return `#${m[1]}`;
    prevZemi = Boolean(m);
    return l;
  });
  if (rest > 0) parts.push(`${rest} more`);
  return listSentence(parts);
}

/* ------------------------------------------------------------------ phrases */

interface Phrase {
  key: string;
  /** Verb phrase. `object` phrases take the subject directly ("edit Zemi #88"), others take "for". */
  text: string;
  object: boolean;
  order: number;
}

function eventPhrases(actions: Set<AnyAction>): Phrase[] {
  const out: Phrase[] = [];
  const content = (['edit', 'publish', 'delete'] as const).filter((a) => actions.has(a));
  if (content.length) {
    const verbs = content.map((a) => (a === 'publish' ? 'publish' : a));
    out.push({ key: `content:${content.join(',')}`, text: listSentence(verbs), object: true, order: 1 });
  }
  const people: string[] = [];
  if (actions.has('registrations.view')) people.push('see registrants with their emails and phone numbers');
  if (actions.has('registrations.manage')) people.push('add, edit and cancel registrations');
  if (actions.has('registrations.export')) people.push('export the list and print the attendance sheet');
  if (actions.has('emails.send')) people.push('email registrants');
  if (people.length) out.push({ key: `people:${people.length}:${people.join('|')}`, text: listSentence(people), object: false, order: 2 });
  if (actions.has('attendance.manage')) out.push({ key: 'door:manage', text: 'scan tickets and check people in', object: false, order: 3 });
  else if (actions.has('attendance.scan')) out.push({ key: 'door:scan', text: 'scan tickets at the door', object: false, order: 3 });
  if (actions.has('stream.control')) out.push({ key: 'stream:control', text: 'run the livestream and its recordings', object: false, order: 4 });
  else if (actions.has('stream.view')) out.push({ key: 'stream:view', text: 'see the stream setup and preview', object: false, order: 4 });
  if (actions.has('media.manage')) out.push({ key: 'media', text: 'upload and arrange documentation', object: false, order: 5 });
  if (!out.length && actions.has('view')) out.push({ key: 'view', text: 'look at', object: true, order: 0 });
  return out;
}

function contentPhrases(actions: Set<AnyAction>): Phrase[] {
  const verbs = (['edit', 'publish', 'delete'] as const).filter((a) => actions.has(a));
  if (verbs.length) return [{ key: `content:${verbs.join(',')}`, text: listSentence([...verbs]), object: true, order: 1 }];
  if (actions.has('view')) return [{ key: 'view', text: 'look at', object: true, order: 0 }];
  return [];
}

const CAP_SENTENCE: Record<Capability, string> = {
  'events.create': 'Can create new events, and gets full access to the ones they create.',
  'speakers.create': 'Can add people to the speaker directory.',
  'publications.create': 'Can add papers, projects and articles.',
  'venues.manage': 'Can add and edit rooms.',
  'site.edit': 'Can edit the site pages, FAQ and team.',
  'inbox.view': 'Can read messages from the contact page.',
  'media.library': 'Can browse every uploaded file.',
  'audience.view': 'Can see everyone who ever registered, across all events.',
  'audit.view': 'Can read the audit log.',
};

/* ------------------------------------------------------------------ summary */

/**
 * Sentences describing what this policy allows, grouped the way people talk about it: one
 * sentence per kind of work, listing the items it applies to.
 */
export function summarizePolicy(input: Policy, label: LabelFn): SummaryLine[] {
  const policy = cleanPolicy(input);
  const lines: SummaryLine[] = [];

  for (const type of RESOURCE_ORDER) {
    const meta = RESOURCE_META[type];
    const grants = policy.grants.filter((g) => g.type === type);
    if (!grants.length) continue;
    const wildcard = grants.find((g) => g.id === '*');
    const wildcardActions = wildcard ? expandActions(wildcard.actions) : new Set<AnyAction>();
    // phrase key -> { phrase, subjects }
    const buckets = new Map<string, { phrase: Phrase; subjects: string[]; all: boolean }>();
    const phrasesFor = (acts: Set<AnyAction>) => (type === 'event' ? eventPhrases(acts) : contentPhrases(acts));
    if (wildcard) {
      for (const ph of phrasesFor(wildcardActions)) buckets.set(ph.key, { phrase: ph, subjects: [], all: true });
    }
    for (const g of grants) {
      if (g.id === '*') continue;
      const acts = expandActions(g.actions);
      for (const ph of phrasesFor(acts)) {
        // Already covered for every item by the wildcard: no need to repeat it.
        if (buckets.get(ph.key)?.all) continue;
        // "look at" is noise when the wildcard already lets them see everything.
        if (ph.key === 'view' && wildcardActions.has('view')) continue;
        const b = buckets.get(ph.key) ?? { phrase: ph, subjects: [], all: false };
        b.subjects.push(label(type, g.id));
        buckets.set(ph.key, b);
      }
    }
    const ordered = [...buckets.values()].sort((a, b) => a.phrase.order - b.phrase.order || (a.all === b.all ? 0 : a.all ? -1 : 1));
    for (const b of ordered) {
      const subject = b.all ? `every ${meta.one}` : joinSubjects(b.subjects);
      const text = b.phrase.object ? `Can ${b.phrase.text} ${subject}.` : `Can ${b.phrase.text} for ${subject}.`;
      lines.push({ text, tone: 'can', area: type });
    }
  }

  for (const cap of policy.capabilities) lines.push({ text: CAP_SENTENCE[cap], tone: 'can', area: 'capability' });

  // The "cannot" side: the things people usually wonder about.
  const eventGrants = policy.grants.filter((g) => g.type === 'event');
  const eventUnion = new Set<AnyAction>();
  eventGrants.forEach((g) => expandActions(g.actions).forEach((a) => eventUnion.add(a)));
  if (!lines.length) {
    lines.push({ text: 'Can log in, but will not see anything yet. Pick a preset or add some events.', tone: 'cannot', area: 'none' });
    return lines;
  }
  if (eventGrants.length && !eventUnion.has('registrations.view') && !policy.capabilities.includes('audience.view')) {
    lines.push({
      text: eventUnion.has('attendance.manage')
        ? 'Cannot see full emails or phone numbers. The check-in list shows them masked.'
        : eventUnion.has('attendance.scan')
          ? 'Cannot see emails, phone numbers or the guest list. Only the name of whoever they scan.'
          : 'Cannot see emails or phone numbers.',
      tone: 'cannot',
      area: 'event',
    });
  }
  if (eventUnion.has('stream.view') && !eventUnion.has('stream.control')) lines.push({ text: 'Cannot go live or end a stream.', tone: 'cannot', area: 'event' });
  const anyDelete = policy.grants.some((g) => expandActions(g.actions).has('delete'));
  const anyEdit = policy.grants.some((g) => expandActions(g.actions).has('edit'));
  if (anyEdit && !anyDelete) lines.push({ text: 'Cannot delete anything.', tone: 'cannot', area: 'none' });
  lines.push({ text: 'Cannot manage admins, sessions or system settings. That stays with the superadmin.', tone: 'cannot', area: 'none' });
  return lines;
}

/* ------------------------------------------------------------------ hints */

export interface PolicyHint {
  key: string;
  tone: 'warn' | 'info';
  title: string;
  body: string;
}

/**
 * Least-privilege nudges. They never block saving: the superadmin decides, we just point at the
 * sharp edges.
 */
export function policyHints(input: Policy, opts: { expiresAt: string | null | undefined }): PolicyHint[] {
  const policy = cleanPolicy(input);
  const hints: PolicyHint[] = [];
  const wild = (type: ResourceType) => {
    const g = policy.grants.find((x) => x.type === type && x.id === '*');
    return g ? expandActions(g.actions) : new Set<AnyAction>();
  };
  const ev = wild('event');

  if (ev.has('registrations.view')) {
    hints.push({
      key: 'wild-registrations',
      tone: 'warn',
      title: 'Every registrant, on every event',
      body: ev.has('registrations.export')
        ? 'That is the email and phone of everyone who ever registered, exportable to a spreadsheet. If they only help on a few Fridays, pick those events instead.'
        : 'That is the email and phone of everyone who ever registered, past and future. If they only help on a few Fridays, pick those events instead.',
    });
  }
  if (ev.has('emails.send')) {
    hints.push({ key: 'wild-emails', tone: 'warn', title: 'Can email every audience', body: 'They can send a message to the registrants of any event. Handy for a coordinator, a lot for a helper.' });
  }
  const wildDelete = RESOURCE_ORDER.filter((t) => wild(t).has('delete'));
  if (wildDelete.length) {
    hints.push({
      key: 'wild-delete',
      tone: 'warn',
      title: 'Can delete for good',
      body: `They can remove any ${listSentence(wildDelete.map((t) => RESOURCE_META[t].one))}. Deleted things do not come back.`,
    });
  }
  if (policy.capabilities.includes('audience.view')) {
    hints.push({ key: 'audience', tone: 'warn', title: 'The audience list is personal data', body: 'Names, emails and phones of everyone who ever registered, across all events. Only give this to someone who really needs it.' });
  }
  if (ev.has('stream.control')) {
    hints.push({ key: 'wild-stream', tone: 'info', title: 'Can go live on any event', body: 'Stream control on every event, including ones they are not running.' });
  }
  if (policy.capabilities.includes('events.create')) {
    hints.push({ key: 'create-events', tone: 'info', title: 'Creating means owning', body: 'Each event they create comes with full access to it, registrants included.' });
  }
  if (policy.capabilities.includes('media.library')) {
    hints.push({ key: 'media', tone: 'info', title: 'Sees every upload', body: 'Including files that are not public yet, like covers for draft events.' });
  }
  const broad = policy.grants.some((g) => g.id === '*' && expandActions(g.actions).size > 1) || policy.capabilities.length >= 3;
  if (!opts.expiresAt && broad) {
    hints.push({ key: 'no-expiry', tone: 'info', title: 'No end date', body: 'Access nobody remembers giving is the kind that leaks. An end date costs nothing, and you can always extend it.' });
  }
  if (!policy.capabilities.length && !policy.grants.length) {
    hints.push({ key: 'empty', tone: 'warn', title: 'Nothing granted yet', body: 'They can log in, but the dashboard will be empty. Pick a preset or add a few events.' });
  }
  return hints;
}

/* ------------------------------------------------------------------ compact (lists) */

export interface CompactAccess {
  /** Preset name, or "Custom" / "No access". */
  label: string;
  /** "Door crew on 2 events · 1 power". No item names, so a list needs no extra requests. */
  detail: string;
  empty: boolean;
}

/** A one-line description for list rows. Counts only, never names. */
export function compactAccess(input: Policy, presetLabel: string | null): CompactAccess {
  const policy = cleanPolicy(input);
  if (!policy.capabilities.length && !policy.grants.length) return { label: 'No access', detail: 'Nothing granted yet', empty: true };
  const bits: string[] = [];
  for (const type of RESOURCE_ORDER) {
    const meta = RESOURCE_META[type];
    const grants = policy.grants.filter((g) => g.type === type);
    if (!grants.length) continue;
    const wildcard = grants.find((g) => g.id === '*');
    const specific = grants.filter((g) => g.id !== '*').length;
    if (wildcard) {
      const acts = expandActions(wildcard.actions);
      const onlyView = acts.size === 1 && acts.has('view');
      bits.push(`${onlyView ? 'sees' : 'works on'} all ${meta.many}${specific ? ` (+${specific} more)` : ''}`);
    } else {
      bits.push(`${specific} ${specific === 1 ? meta.one : meta.many}`);
    }
  }
  if (policy.capabilities.length) bits.push(`${policy.capabilities.length} ${policy.capabilities.length === 1 ? 'power' : 'powers'}`);
  const detail = bits.join(' · ');
  return { label: presetLabel ?? 'Custom', detail: detail.charAt(0).toUpperCase() + detail.slice(1), empty: false };
}

/** Does the policy touch personal data anywhere? For a small red flag in lists. */
export function touchesPersonalData(input: Policy): boolean {
  const policy = cleanPolicy(input);
  if (policy.capabilities.includes('audience.view')) return true;
  return policy.grants.some((g) => g.type === 'event' && expandActions(g.actions).has('registrations.view'));
}
