import type { Modifier } from '@dnd-kit/core';

/** Lock dragging to the vertical axis (the @dnd-kit/modifiers package is not installed). */
export const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });
