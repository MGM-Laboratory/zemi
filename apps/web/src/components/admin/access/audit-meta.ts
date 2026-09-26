/**
 * How audit entries look and where they link. Pure helpers shared by the audit log and the
 * "Lately" feed on an admin's page.
 */
import type { AuditEntry } from '@zemi/shared';
import { adminRoutes } from '@/lib/admin/nav';

export type AuditTone = 'blue' | 'yellow' | 'red' | 'green' | 'neutral';

/** Red for removals and blocks, green for creates, yellow for publishing and streams, blue for edits. */
export function auditTone(action: string): AuditTone {
  const verb = action.split('.').slice(1).join('.');
  if (/delete|remove|cancel|revoke|blocked|reset|disable|failed/.test(verb)) return 'red';
  if (/create|add|upload|walk-in|check-in|attach|enable|reactivate|restore/.test(verb)) return 'green';
  if (/publish|live|end|broadcast|email|passphrase|rotate|ready/.test(verb)) return 'yellow';
  if (/login|logout/.test(verb)) return 'neutral';
  return 'blue';
}

export const RESOURCE_TYPE_LABELS: Record<string, string> = {
  event: 'Events',
  registration: 'Registrations',
  speaker: 'Speakers',
  publication: 'Publications',
  venue: 'Venues',
  asset: 'Media',
  site: 'Site settings',
  faq: 'FAQ',
  team: 'Team',
  contact: 'Inbox',
  admin: 'Admins',
  session: 'Sessions',
  system: 'System',
};

/** Action families for the filter. `event.` matches every event action. */
export const ACTION_FAMILIES: Array<{ value: string; label: string }> = [
  { value: 'auth', label: 'Sign-ins' },
  { value: 'event', label: 'Events' },
  { value: 'stream', label: 'Streams' },
  { value: 'recording', label: 'Recordings' },
  { value: 'registration', label: 'Registrations' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'speaker', label: 'Speakers' },
  { value: 'publication', label: 'Publications' },
  { value: 'venue', label: 'Venues' },
  { value: 'asset', label: 'Media' },
  { value: 'site', label: 'Site settings' },
  { value: 'faq', label: 'FAQ' },
  { value: 'team', label: 'Team' },
  { value: 'inbox', label: 'Inbox' },
  { value: 'contact', label: 'Contact form' },
  { value: 'admin', label: 'Admins' },
  { value: 'session', label: 'Sessions' },
  { value: 'system', label: 'System' },
];

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

/** Admin page for the thing an entry is about, when there is one. */
export function auditResourceHref(e: Pick<AuditEntry, 'resourceType' | 'resourceId' | 'meta' | 'action'>): string | null {
  const id = e.resourceId;
  const meta = e.meta ?? {};
  switch (e.resourceType) {
    case 'event':
      if (!id) return null;
      if (e.action.startsWith('stream.') || e.action.startsWith('recording.')) return adminRoutes.event(id, 'stream');
      if (e.action.startsWith('event.media')) return adminRoutes.event(id, 'media');
      return adminRoutes.event(id);
    case 'registration': {
      const ev = str(meta.eventId);
      return ev ? adminRoutes.event(ev, 'registrations') : null;
    }
    case 'speaker':
      return id ? adminRoutes.speaker(id) : null;
    case 'publication':
      return id ? adminRoutes.publication(id) : null;
    case 'venue':
      return adminRoutes.venues;
    case 'asset':
      return id ? `${adminRoutes.media}?asset=${encodeURIComponent(id)}` : adminRoutes.media;
    case 'site': {
      const key = str(meta.key) ?? id;
      const section = key === 'email' ? 'emails' : key;
      return section && ['general', 'seo', 'home', 'about', 'contact', 'emails'].includes(section)
        ? adminRoutes.site(section as 'general')
        : adminRoutes.site();
    }
    case 'faq':
      return adminRoutes.site('faq');
    case 'team':
      return adminRoutes.site('team');
    case 'contact':
      return id ? `${adminRoutes.inbox}?id=${encodeURIComponent(id)}` : adminRoutes.inbox;
    case 'admin':
      return id && e.action !== 'admin.delete' ? adminRoutes.admin(id) : null;
    case 'system':
      return adminRoutes.system;
    default:
      return null;
  }
}

/** "Superadmin", "Rani", "System", "Visitor". */
export function actorLabel(e: Pick<AuditEntry, 'actorType' | 'actorName'>): string {
  if (e.actorType === 'system') return 'System';
  return e.actorName || (e.actorType === 'public' ? 'Visitor' : 'Someone');
}
