import type { LinkKind } from '@zemi/shared';
import type { ReactNode, SVGProps } from 'react';
import { LINK_KIND_LABELS } from './link-kinds';

/**
 * Zemi link icons. One drawing language for all of them: 24px grid, 1.75 stroke, round caps
 * and joins, currentColor, filled details only as small circles or a rounded triangle (the
 * brand shapes). Works for public pages and the admin.
 *
 * @example <LinkIcon kind="github" className="size-5" />
 * @example <LinkIcon kind={link.kind} title={LINK_KIND_LABELS[link.kind]} />
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** px, default 24. Or size with className. */
  size?: number;
  /** Accessible name. Decorative (aria-hidden) when omitted. */
  title?: string;
  strokeWidth?: number;
}

export function IconBase({ size = 24, title, strokeWidth = 1.75, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const WebsiteIcon = (p: IconProps) => (
  <IconBase {...p}>
    <circle cx="12" cy="12" r="9" />
    <ellipse cx="12" cy="12" rx="3.8" ry="9" />
    <path d="M3.6 9h16.8M3.6 15h16.8" />
  </IconBase>
);

export const LinkedinIcon = (p: IconProps) => (
  <IconBase {...p}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="8" cy="7.9" r="1.2" fill="currentColor" stroke="none" />
    <path d="M8 10.9V17M11.6 17v-6M11.6 13.7q0-2.8 2.5-2.8t2.5 2.8V17" />
  </IconBase>
);

export const GithubIcon = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M6 9.6 6.3 4.4l3.3 2.5q2.4-.8 4.8 0l3.3-2.5.3 5.2q1.5 2 1 4.4-.9 4.4-7 4.4t-7-4.4q-.5-2.4 1-4.4Z" />
    <path d="M9.6 18.4V21M14.4 18.4V21" />
    <circle cx="9.4" cy="12.6" r=".9" fill="currentColor" stroke="none" />
    <circle cx="14.6" cy="12.6" r=".9" fill="currentColor" stroke="none" />
  </IconBase>
);

export const ScholarIcon = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M12 3.6 22 9l-10 5.4L2 9Z" />
    <path d="M6.4 11.6V16q5.6 4.6 11.2 0v-4.4" />
    <path d="M22 9v5" />
  </IconBase>
);

export const OrcidIcon = (p: IconProps) => (
  <IconBase {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="8.6" cy="7.8" r="1.15" fill="currentColor" stroke="none" />
    <path d="M8.6 10.6v5.9M11.9 7.6v8.9h1.4q3.9 0 3.9-4.45T13.3 7.6Z" />
  </IconBase>
);

export const ResearchgateIcon = (p: IconProps) => (
  <IconBase {...p}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <path d="M6.9 16.4V7.6h2.5q2.3 0 2.3 2.2T9.4 12H6.9M9.5 12l2.3 4.4" />
    <path d="M17.9 8.7q-.7-1.1-1.9-1.1-2.5 0-2.5 4.4t2.5 4.4q2 0 2-3v-.9h-1.8" />
  </IconBase>
);

export const XIcon = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M4.2 4.2h4.3l11.3 15.6h-4.3Z" />
    <path d="M19.4 4.2 13.9 10.4M10.1 13.6l-5.5 6.2" />
  </IconBase>
);

export const InstagramIcon = (p: IconProps) => (
  <IconBase {...p}>
    <rect x="3" y="3" width="18" height="18" rx="5.5" />
    <circle cx="12" cy="12" r="4.1" />
    <circle cx="17.1" cy="6.9" r="1.15" fill="currentColor" stroke="none" />
  </IconBase>
);

export const YoutubeIcon = (p: IconProps) => (
  <IconBase {...p}>
    <rect x="2.5" y="5.5" width="19" height="13" rx="4.5" />
    <path d="M10.2 9.3q0-.7.6-.4l4.4 2.6q.6.5 0 1l-4.4 2.6q-.6.3-.6-.4Z" fill="currentColor" />
  </IconBase>
);

export const EmailIcon = (p: IconProps) => (
  <IconBase {...p}>
    <rect x="3" y="5" width="18" height="14" rx="3.5" />
    <path d="m4.2 7.4 7.8 5.8 7.8-5.8" />
  </IconBase>
);

export const OtherLinkIcon = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M10.4 13.6a3.2 3.2 0 0 1 0-4.5l2.3-2.3a3.2 3.2 0 0 1 4.5 4.5l-1.1 1.1" />
    <path d="M13.6 10.4a3.2 3.2 0 0 1 0 4.5l-2.3 2.3a3.2 3.2 0 0 1-4.5-4.5l1.1-1.1" />
  </IconBase>
);

export const LINK_ICONS: Record<LinkKind, (p: IconProps) => ReactNode> = {
  website: WebsiteIcon,
  linkedin: LinkedinIcon,
  github: GithubIcon,
  scholar: ScholarIcon,
  orcid: OrcidIcon,
  researchgate: ResearchgateIcon,
  x: XIcon,
  instagram: InstagramIcon,
  youtube: YoutubeIcon,
  email: EmailIcon,
  other: OtherLinkIcon,
};

/** Icon for any LINK_KINDS value. Pass `labelled` to use the kind's label as the accessible name. */
export function LinkIcon({ kind, labelled, ...props }: IconProps & { kind: LinkKind; labelled?: boolean }) {
  const Icon = LINK_ICONS[kind] ?? OtherLinkIcon;
  return <Icon {...props} title={props.title ?? (labelled ? LINK_KIND_LABELS[kind] : undefined)} />;
}
