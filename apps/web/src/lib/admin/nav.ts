import type { Ability } from '@zemi/shared';

/**
 * Canonical admin routes. Feature pages live at these paths so the sidebar, command palette
 * and cross links agree. Detail pages are addressed by id (slugs can change).
 */
export const adminRoutes = {
  overview: '/admin',
  login: '/admin/login',
  kit: '/admin/kit',
  events: '/admin/events',
  discussion: '/admin/discussion',
  newEvent: '/admin/events/new',
  /** Event workspace. `tab` is a sub-route like 'registrations', 'attendance', 'stream', 'media'. */
  event: (id: string, tab?: string) => `/admin/events/${id}${tab ? `/${tab}` : ''}`,
  speakers: '/admin/speakers',
  newSpeaker: '/admin/speakers/new',
  speaker: (id: string) => `/admin/speakers/${id}`,
  publications: '/admin/publications',
  newPublication: '/admin/publications/new',
  publication: (id: string) => `/admin/publications/${id}`,
  venues: '/admin/venues',
  media: '/admin/media',
  site: (section?: 'general' | 'seo' | 'home' | 'about' | 'contact' | 'emails' | 'faq' | 'team') =>
    section ? `/admin/site/${section}` : '/admin/site',
  inbox: '/admin/inbox',
  audience: '/admin/audience',
  admins: '/admin/admins',
  admin: (id: string) => `/admin/admins/${id}`,
  audit: '/admin/audit',
  system: '/admin/system',
} as const;

export type NavIconName =
  | 'overview'
  | 'events'
  | 'discussion'
  | 'speakers'
  | 'publications'
  | 'venues'
  | 'media'
  | 'site'
  | 'inbox'
  | 'audience'
  | 'admins'
  | 'audit'
  | 'system'
  | 'kit';

export interface AdminNavItem {
  key: string;
  label: string;
  href: string;
  icon?: NavIconName;
  /** Extra words for the command palette. */
  keywords?: string[];
  /** Two-key shortcut, like 'g e'. */
  shortcut?: string;
  visible: (a: Ability) => boolean;
  /** Match only the exact href (Overview), not its children. */
  exact?: boolean;
  badge?: 'inbox';
  children?: AdminNavItem[];
}

export interface AdminNavGroup {
  key: string;
  label: string | null;
  items: AdminNavItem[];
}

const always = () => true;

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    key: 'content',
    label: null,
    items: [
      { key: 'overview', label: 'Overview', href: adminRoutes.overview, icon: 'overview', exact: true, shortcut: 'g o', visible: always, keywords: ['home', 'dashboard'] },
      {
        key: 'events',
        label: 'Events',
        href: adminRoutes.events,
        icon: 'events',
        shortcut: 'g e',
        keywords: ['fridays', 'sessions', 'seminar'],
        visible: (a) => a.canAny('event', 'view') || a.has('events.create'),
      },
      {
        key: 'discussion', label: 'Discussion', href: adminRoutes.discussion, icon: 'discussion',
        keywords: ['questions', 'threads', 'reports', 'moderation'],
        visible: (a) => a.has('discussion.view') || a.has('discussion.manage'),
      },
      {
        key: 'speakers',
        label: 'Speakers',
        href: adminRoutes.speakers,
        icon: 'speakers',
        shortcut: 'g s',
        keywords: ['people', 'presenters'],
        visible: (a) => a.canAny('speaker', 'view') || a.has('speakers.create'),
      },
      {
        key: 'publications',
        label: 'Publications',
        href: adminRoutes.publications,
        icon: 'publications',
        shortcut: 'g p',
        keywords: ['papers', 'projects', 'articles'],
        visible: (a) => a.canAny('publication', 'view') || a.has('publications.create'),
      },
      {
        key: 'venues',
        label: 'Venues',
        href: adminRoutes.venues,
        icon: 'venues',
        shortcut: 'g v',
        keywords: ['rooms', 'classrooms', 'theater'],
        visible: (a) => a.has('venues.manage') || a.canAny('event', 'edit'),
      },
      {
        key: 'media',
        label: 'Media library',
        href: adminRoutes.media,
        icon: 'media',
        shortcut: 'g m',
        keywords: ['images', 'uploads', 'files', 'videos'],
        visible: (a) => a.has('media.library'),
      },
    ],
  },
  {
    key: 'site',
    label: 'Site and people',
    items: [
      {
        key: 'site',
        label: 'Site',
        href: adminRoutes.site(),
        icon: 'site',
        keywords: ['cms', 'pages', 'copy'],
        visible: (a) => a.has('site.edit'),
        children: [
          { key: 'site-general', label: 'General', href: adminRoutes.site('general'), visible: (a) => a.has('site.edit'), keywords: ['settings', 'announcement', 'footer'] },
          { key: 'site-seo', label: 'SEO and sharing', href: adminRoutes.site('seo'), visible: (a) => a.has('site.edit'), keywords: ['seo', 'google', 'og image', 'meta'] },
          { key: 'site-home', label: 'Home', href: adminRoutes.site('home'), visible: (a) => a.has('site.edit'), keywords: ['hero', 'landing'] },
          { key: 'site-about', label: 'About', href: adminRoutes.site('about'), visible: (a) => a.has('site.edit') },
          { key: 'site-contact', label: 'Contact', href: adminRoutes.site('contact'), visible: (a) => a.has('site.edit') },
          { key: 'site-emails', label: 'Emails', href: adminRoutes.site('emails'), visible: (a) => a.has('site.edit'), keywords: ['reply-to', 'signature', 'reminders'] },
          { key: 'site-faq', label: 'FAQ', href: adminRoutes.site('faq'), visible: (a) => a.has('site.edit'), keywords: ['questions'] },
          { key: 'site-team', label: 'Team', href: adminRoutes.site('team'), visible: (a) => a.has('site.edit'), keywords: ['organizers', 'crew'] },
        ],
      },
      {
        key: 'inbox',
        label: 'Inbox',
        href: adminRoutes.inbox,
        icon: 'inbox',
        shortcut: 'g i',
        badge: 'inbox',
        keywords: ['messages', 'contact'],
        visible: (a) => a.has('inbox.view'),
      },
      {
        key: 'audience',
        label: 'Audience',
        href: adminRoutes.audience,
        icon: 'audience',
        keywords: ['people', 'registrants', 'attendees'],
        visible: (a) => a.has('audience.view'),
      },
    ],
  },
  {
    key: 'control',
    label: 'Control room',
    items: [
      {
        key: 'admins',
        label: 'Admins and access',
        href: adminRoutes.admins,
        icon: 'admins',
        keywords: ['rbac', 'permissions', 'passphrase', 'sessions'],
        visible: (a) => a.isSuperadmin,
      },
      {
        key: 'audit',
        label: 'Audit log',
        href: adminRoutes.audit,
        icon: 'audit',
        keywords: ['history', 'changes', 'activity'],
        visible: (a) => a.isSuperadmin || a.has('audit.view'),
      },
      {
        key: 'system',
        label: 'System',
        href: adminRoutes.system,
        icon: 'system',
        keywords: ['health', 'integrations', 'status'],
        visible: (a) => a.isSuperadmin,
      },
    ],
  },
];

/** Nav filtered for an ability. Groups with no visible items are dropped. */
export function visibleNav(ability: Ability): AdminNavGroup[] {
  return ADMIN_NAV.map((g) => ({
    ...g,
    items: g.items
      .filter((i) => i.visible(ability))
      .map((i) => (i.children ? { ...i, children: i.children.filter((c) => c.visible(ability)) } : i)),
  })).filter((g) => g.items.length > 0);
}

export function isActivePath(pathname: string, item: Pick<AdminNavItem, 'href' | 'exact'>): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Flat list (with parents) for the palette and default breadcrumbs. */
export function flattenNav(groups: AdminNavGroup[]): Array<AdminNavItem & { parent?: AdminNavItem }> {
  const out: Array<AdminNavItem & { parent?: AdminNavItem }> = [];
  for (const g of groups) {
    for (const item of g.items) {
      out.push(item);
      for (const child of item.children ?? []) out.push({ ...child, parent: item });
    }
  }
  return out;
}
