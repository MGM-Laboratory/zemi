import { SHAPE_ORDER, SITE_DEFAULTS, type PublicSite, type ShapeName, type SiteSettings, type TeamMember } from '@zemi/shared';

export type AboutSettings = SiteSettings['about'];
export type Pillar = AboutSettings['pillars'][number];

export interface AboutData {
  about: AboutSettings;
  /** Always four, one per shape, in brand order. */
  pillars: Pillar[];
  labName: string;
  labUrl: string;
  faqs: PublicSite['faqs'];
  team: TeamMember[];
  stats: PublicSite['stats'];
  isFallback: boolean;
}

const SAFE_URL = /^https?:\/\//i;

/**
 * About settings with sensible fallbacks. API down: the rich shared defaults. Otherwise stored
 * values win; title and intro fall back when empty, and the four pillars are always four (a
 * missing shape borrows its default). Empty story, audiences or steps hide their section.
 */
export function resolveAbout(site: PublicSite & { isFallback?: boolean }): AboutData {
  const d = SITE_DEFAULTS.about;
  const a = site.isFallback ? d : site.settings.about;
  const byShape = new Map<ShapeName, Pillar>();
  for (const p of a.pillars ?? []) if (!byShape.has(p.shape)) byShape.set(p.shape, p);
  const pillars = SHAPE_ORDER.map((s) => byShape.get(s) ?? d.pillars.find((p) => p.shape === s)!);
  const general = site.isFallback ? SITE_DEFAULTS.general : site.settings.general;
  return {
    about: {
      ...a,
      title: a.title?.trim() || d.title,
      intro: a.intro?.trim() || d.intro,
      presentCta: a.presentCta?.trim() || d.presentCta,
    },
    pillars,
    labName: general.labName?.trim() || 'MGM Laboratory',
    labUrl: general.labUrl && SAFE_URL.test(general.labUrl) ? general.labUrl : 'https://labmgm.org',
    faqs: (site.faqs ?? []).filter((f) => f.visibility === 'published'),
    team: (site.team ?? []).filter((t) => t.visibility === 'published'),
    stats: site.stats,
    isFallback: !!site.isFallback,
  };
}

/** The contact link every "want to present?" button uses (the footer uses it too). */
export const PRESENT_HREF = '/contact?topic=present';
