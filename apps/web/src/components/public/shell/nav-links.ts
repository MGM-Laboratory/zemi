import type { ShapeName } from '@zemi/shared';

export interface NavLink {
  href: string;
  label: string;
  shape: ShapeName;
}

/** Primary public navigation, in order. */
export const NAV_LINKS: NavLink[] = [
  { href: '/events', label: 'Events', shape: 'circle' },
  { href: '/speakers', label: 'Speakers', shape: 'triangle' },
  { href: '/publications', label: 'Publications', shape: 'square' },
  { href: '/about', label: 'About', shape: 'arch' },
  { href: '/contact', label: 'Contact', shape: 'circle' },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const SCHEDULE_LINE = 'Fridays 13:15 to 15:15 WIB';
