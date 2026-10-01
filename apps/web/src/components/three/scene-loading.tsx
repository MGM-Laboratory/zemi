import { SHAPE_ORDER } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { cn } from '@/lib/utils';
import styles from './scene-loading.module.css';

/**
 * What a 3D stage shows while three.js, the scene and its models load: the four shapes hopping
 * in turn over a soft floor shadow, plus a short mono line. Pure CSS (no three.js), so it paints
 * with the page and never shifts the layout. Calm under prefers-reduced-motion.
 *
 * @example <SceneCanvas placeholder={<SceneLoading label="Pulling up the stools" />} ... />
 */
export function SceneLoading({
  label = 'Setting up the scene',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn(styles.root, className)} role="status" aria-live="polite">
      <div className={styles.shapes} aria-hidden="true">
        {SHAPE_ORDER.map((shape, i) => (
          <span key={shape} className={styles.shape} style={{ animationDelay: `${i * 140}ms` }}>
            <ShapeIcon shape={shape} size="100%" />
          </span>
        ))}
      </div>
      <span className={styles.floor} aria-hidden="true" />
      <span className={styles.label}>
        {label}
        <span className={styles.dots} aria-hidden="true">
          <i>.</i>
          <i>.</i>
          <i>.</i>
        </span>
      </span>
    </div>
  );
}
