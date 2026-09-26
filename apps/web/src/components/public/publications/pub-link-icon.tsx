import type { PublicationLinkKind } from '@zemi/shared';
import type { ReactNode } from 'react';
import { IconBase, OtherLinkIcon, WebsiteIcon, type IconProps } from '@/components/icons';

/**
 * Icons for publication link kinds, drawn in the same language as components/icons (24px grid,
 * 1.75 stroke, round caps, small filled brand-shape details). Server-safe.
 */
export const PdfIcon = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M6.5 3h7.2L18 7.3V19a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    <path d="M13.5 3v4.5H18" />
    <path d="M8 12.5h6M8 16h4" />
  </IconBase>
);

export const PublisherIcon = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M3.5 5.5q4-1.6 8.5.8 4.5-2.4 8.5-.8v13q-4-1.6-8.5.8-4.5-2.4-8.5-.8Z" />
    <path d="M12 6.3v13" />
  </IconBase>
);

export const CodeIcon = (p: IconProps) => (
  <IconBase {...p}>
    <path d="m8.5 7.5-5 4.5 5 4.5M15.5 7.5l5 4.5-5 4.5" />
    <path d="m13.4 5-2.8 14" />
  </IconBase>
);

export const DatasetIcon = (p: IconProps) => (
  <IconBase {...p}>
    <ellipse cx="12" cy="6" rx="7.5" ry="2.8" />
    <path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6" />
    <path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" />
  </IconBase>
);

export const SlidesIcon = (p: IconProps) => (
  <IconBase {...p}>
    <rect x="3" y="4" width="18" height="12" rx="3" />
    <path d="M12 16v4M8.5 20.5h7" />
    <circle cx="8.6" cy="10" r="1.4" fill="currentColor" stroke="none" />
    <path d="M12 11.5h5" />
  </IconBase>
);

export const VideoIcon = (p: IconProps) => (
  <IconBase {...p}>
    <rect x="3" y="5.5" width="13" height="13" rx="3.5" />
    <path d="m16 10.2 4.2-2.4q.8-.4.8.5v7.4q0 .9-.8.5L16 13.8" />
    <path d="M8.2 9.6q0-.6.5-.3l3.5 2.2q.5.4 0 .8l-3.5 2.2q-.5.3-.5-.3Z" fill="currentColor" />
  </IconBase>
);

export const PosterIcon = (p: IconProps) => (
  <IconBase {...p}>
    <rect x="5" y="2.8" width="14" height="18.4" rx="2.5" />
    <path d="M8.5 7h7M8.5 10h4" />
    <path d="M9.8 13.3q2.2-1.9 4.4 0l1.3 3.4H8.5Z" fill="currentColor" stroke="none" />
  </IconBase>
);

export const DoiIcon = (p: IconProps) => (
  <IconBase {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.2 8v8h1.2q3.2 0 3.2-4t-3.2-4Z" />
    <circle cx="16.4" cy="15.2" r="1.05" fill="currentColor" stroke="none" />
  </IconBase>
);

export const DownloadIcon = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M12 3.5v11.5M7.2 10.5 12 15.3l4.8-4.8" />
    <path d="M4.5 16.5v1.5a2.5 2.5 0 0 0 2.5 2.5h10a2.5 2.5 0 0 0 2.5-2.5v-1.5" />
  </IconBase>
);

export const PUB_LINK_ICONS: Record<PublicationLinkKind, (p: IconProps) => ReactNode> = {
  pdf: PdfIcon,
  publisher: PublisherIcon,
  code: CodeIcon,
  dataset: DatasetIcon,
  slides: SlidesIcon,
  video: VideoIcon,
  poster: PosterIcon,
  website: WebsiteIcon,
  other: OtherLinkIcon,
};

export function PubLinkIcon({ kind, ...props }: IconProps & { kind: PublicationLinkKind }) {
  const Icon = PUB_LINK_ICONS[kind] ?? OtherLinkIcon;
  return <Icon {...props} />;
}
