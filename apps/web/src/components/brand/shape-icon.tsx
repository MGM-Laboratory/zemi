import type { SVGProps } from 'react';
import { SHAPE_CHARACTER, SHAPE_COLORS, SHAPE_PATHS_46, type ShapeName } from '@zemi/shared';

export interface ShapeIconProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'color'> {
  shape: ShapeName;
  /** px number or any CSS length. Default 1em (scales with text). */
  size?: number | string;
  /** 'brand' = the shape's own color, 'current' = currentColor, or any CSS color. */
  color?: 'brand' | 'current' | (string & {});
  /** Accessible name. Without it the icon is decorative (aria-hidden). */
  title?: string;
}

/**
 * One brand shape as an inline SVG on a 46x46 box. Server-safe.
 *
 * @example <ShapeIcon shape="triangle" size={14} />
 */
export function ShapeIcon({ shape, size = '1em', color = 'brand', title, className, style, ...rest }: ShapeIconProps) {
  const fill = color === 'brand' ? SHAPE_COLORS[shape] : color === 'current' ? 'currentColor' : color;
  return (
    <svg
      viewBox="0 0 46 46"
      width={typeof size === 'number' ? size : undefined}
      height={typeof size === 'number' ? size : undefined}
      className={className}
      style={{ width: size, height: size, flex: 'none', overflow: 'visible', ...style }}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <path d={SHAPE_PATHS_46[shape]} fill={fill} />
    </svg>
  );
}

/** "Q, the question" style label for a shape. */
export function shapeLabel(shape: ShapeName): string {
  const c = SHAPE_CHARACTER[shape];
  return `${c.name}, ${c.meaning}`;
}
