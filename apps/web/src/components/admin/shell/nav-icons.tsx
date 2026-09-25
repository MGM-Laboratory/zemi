import type { NavIconName } from '@/lib/admin/nav';
import { IconBase, type IconProps } from '@/components/icons/link-icon';

/**
 * Sidebar icons, drawn from the four brand shapes (circle, rounded triangle, rounded square,
 * arch) in the same 24px / 1.75 stroke language as the link icons.
 */
const ICONS: Record<NavIconName, (p: IconProps) => React.ReactNode> = {
  overview: (p) => (
    <IconBase {...p}>
      <circle cx="7.5" cy="7.5" r="4" />
      <path d="M16.5 3.6q.5-.7 1 0l3.3 6q.4.9-.6.9h-6.4q-1 0-.6-.9Z" />
      <rect x="3.5" y="13.5" width="8" height="7" rx="2" />
      <path d="M13 20.5v-3a3.5 3.5 0 0 1 7 0v3Z" />
    </IconBase>
  ),
  events: (p) => (
    <IconBase {...p}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="4" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
      <circle cx="15.5" cy="15.3" r="2" fill="currentColor" stroke="none" />
    </IconBase>
  ),
  speakers: (p) => (
    <IconBase {...p}>
      <circle cx="12" cy="7.5" r="4" />
      <path d="M5 21v-2.5a7 7 0 0 1 14 0V21" />
    </IconBase>
  ),
  publications: (p) => (
    <IconBase {...p}>
      <path d="M7 3.5h7l4.5 4.5v10.5q0 2-2 2H7q-2 0-2-2v-13q0-2 2-2Z" />
      <path d="M14 3.5V8h4.5M8.5 12.5h7M8.5 16h4.5" />
    </IconBase>
  ),
  venues: (p) => (
    <IconBase {...p}>
      <path d="M6 20.5V10a6 6 0 0 1 12 0v10.5" />
      <path d="M3 20.5h18" />
      <circle cx="14.6" cy="14.5" r=".9" fill="currentColor" stroke="none" />
    </IconBase>
  ),
  media: (p) => (
    <IconBase {...p}>
      <rect x="3.5" y="4" width="17" height="16" rx="4" />
      <circle cx="15.5" cy="9" r="1.8" />
      <path d="m3.8 17.2 4.6-5.3q.6-.6 1.2 0l6.2 7.8" />
    </IconBase>
  ),
  site: (p) => (
    <IconBase {...p}>
      <rect x="3" y="4" width="18" height="16" rx="4" />
      <path d="M3 9h18" />
      <circle cx="6.6" cy="6.5" r=".8" fill="currentColor" stroke="none" />
      <circle cx="9.2" cy="6.5" r=".8" fill="currentColor" stroke="none" />
      <path d="M7.5 13h5M7.5 16h9" />
    </IconBase>
  ),
  inbox: (p) => (
    <IconBase {...p}>
      <path d="M3.5 13.5 6 5.8Q6.5 4.5 8 4.5h8q1.5 0 2 1.3l2.5 7.7v4.5q0 2-2 2h-13q-2 0-2-2Z" />
      <path d="M3.5 13.5h4.3l1.2 2.3h6l1.2-2.3h4.3" />
    </IconBase>
  ),
  audience: (p) => (
    <IconBase {...p}>
      <circle cx="9" cy="8" r="3.3" />
      <path d="M3 20v-1.5a6 6 0 0 1 12 0V20" />
      <circle cx="16.8" cy="7.2" r="2.6" />
      <path d="M17 12.6a5 5 0 0 1 4.5 5V20" />
    </IconBase>
  ),
  admins: (p) => (
    <IconBase {...p}>
      <circle cx="8" cy="12" r="4.5" />
      <path d="M12.5 12h8.5M18 12v3M21 12v2.5" />
      <circle cx="8" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </IconBase>
  ),
  audit: (p) => (
    <IconBase {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </IconBase>
  ),
  system: (p) => (
    <IconBase {...p}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2.2" />
      <circle cx="9" cy="17" r="2.2" />
    </IconBase>
  ),
  kit: (p) => (
    <IconBase {...p}>
      <circle cx="7" cy="7" r="3.2" />
      <path d="M16.7 3.8q.3-.5.6 0l2.8 5q.3.7-.4.7h-5.4q-.7 0-.4-.7Z" />
      <rect x="4" y="14" width="6.5" height="6.5" rx="1.8" />
      <path d="M14 20.5v-2.2a3 3 0 0 1 6 0v2.2Z" />
    </IconBase>
  ),
};

export function NavIcon({ name, ...props }: IconProps & { name: NavIconName }) {
  const Icon = ICONS[name];
  return <Icon {...props} />;
}

/** Brand accent per nav section (the active item shows this shape in color). */
export const NAV_ACCENT: Partial<Record<NavIconName, { shape: 'circle' | 'triangle' | 'square' | 'arch'; color: string }>> = {
  overview: { shape: 'circle', color: 'var(--color-blue)' },
  events: { shape: 'circle', color: 'var(--color-blue)' },
  speakers: { shape: 'arch', color: 'var(--color-green)' },
  publications: { shape: 'square', color: 'var(--color-yellow)' },
  venues: { shape: 'arch', color: 'var(--color-green)' },
  media: { shape: 'triangle', color: 'var(--color-red)' },
  site: { shape: 'square', color: 'var(--color-yellow)' },
  inbox: { shape: 'circle', color: 'var(--color-blue)' },
  audience: { shape: 'arch', color: 'var(--color-green)' },
  admins: { shape: 'triangle', color: 'var(--color-red)' },
  audit: { shape: 'square', color: 'var(--color-yellow)' },
  system: { shape: 'circle', color: 'var(--color-blue)' },
  kit: { shape: 'triangle', color: 'var(--color-red)' },
};
