import { IconBase, type IconProps } from '@/components/icons/link-icon';

/*
 * Extra icons for the contact page, in the same drawing language as the link icons:
 * 24px grid, 1.75 stroke, round caps, currentColor, tiny filled circles for details.
 */

export const WhatsappIcon = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M4.2 19.8 5.3 16a8.3 8.3 0 1 1 3 2.9Z" />
    <path
      d="M9.2 8.6q-.6.4-.4 1.6.5 2.3 2.8 3.9 1.6 1.1 2.8 1 .9-.2 1.2-1.1l-1.7-1-1 .6q-1.2-.5-2-1.9l.6-1-.8-1.8Q9.9 8.2 9.2 8.6Z"
      fill="currentColor"
      strokeWidth="1"
    />
  </IconBase>
);

export const ClockIcon = (p: IconProps) => (
  <IconBase {...p}>
    <circle cx="12" cy="12" r="9" />
    {/* 13:15: the hour hand just past 1, the minute hand on 3 */}
    <path d="M12 12 13.6 8.2M12 12h4.6" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </IconBase>
);

export const PinIcon = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M12 21s-6.6-6.1-6.6-11.2a6.6 6.6 0 0 1 13.2 0C18.6 14.9 12 21 12 21Z" />
    <circle cx="12" cy="9.8" r="2.4" />
  </IconBase>
);

export const CopyIcon = (p: IconProps) => (
  <IconBase {...p}>
    <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="3" />
    <path d="M15.5 5.8V5.5a2 2 0 0 0-2-2h-7.5a2 2 0 0 0-2 2V13a2 2 0 0 0 2 2h.3" />
  </IconBase>
);

export const CheckIcon = (p: IconProps) => (
  <IconBase {...p}>
    <path d="m5 12.5 4.4 4.3L19 7.4" />
  </IconBase>
);

export const DoorIcon = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M6 21V4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21" />
    <path d="M3.5 21h17" />
    <circle cx="14.6" cy="12.4" r="1.05" fill="currentColor" stroke="none" />
  </IconBase>
);

export const PlaneIcon = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M21 3.5 3 10.6l6.7 2.8L21 3.5Z" />
    <path d="M21 3.5 13.6 21l-3.9-7.6" />
  </IconBase>
);
