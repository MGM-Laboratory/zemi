'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { preload } from 'react-dom';
import type { ImageRef, ImageSource, ShapeName } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { cn } from '@/lib/utils';
import styles from './zemi-image.module.css';

export interface ZemiImageProps {
  image: ImageRef | null | undefined;
  /** Standard `sizes`. Default '100vw'. Be precise: it decides which width downloads. */
  sizes?: string;
  /** LCP images: eager, high fetch priority, preloaded, and painted without the fade-in. */
  priority?: boolean;
  /** Override the stored alt text. Pass "" for decorative images. */
  alt?: string;
  /** Wrapper classes (size, radius). */
  className?: string;
  imgClassName?: string;
  style?: CSSProperties;
  fit?: 'cover' | 'contain';
  /** object-position, e.g. '50% 30%'. */
  position?: string;
  /** Force an aspect ratio like '4/5' or 0.8. Default: the image's own ratio (unless `fill`). */
  aspect?: string | number;
  /** Absolutely fill the (relative) parent instead of sizing by aspect. */
  fill?: boolean;
  /** Rendered when `image` is null. Default: a soft placeholder with a brand shape. Pass null for nothing. */
  fallback?: ReactNode;
  /** Shape used by the default placeholder. */
  placeholderShape?: ShapeName;
  onLoad?: () => void;
}

const srcSet = (list: ImageSource[]) => list.map((s) => `${s.url} ${s.width}w`).join(', ');

/**
 * Responsive image from an API `ImageRef`: <picture> with AVIF + WebP srcsets, dominant color and
 * LQIP blur-up while loading, then a soft fade-in. Null-safe.
 *
 * @example <ZemiImage image={event.cover} aspect="4/5" sizes="(min-width: 1024px) 33vw, 100vw" className="rounded-[24px]" />
 */
export function ZemiImage({
  image,
  sizes = '100vw',
  priority = false,
  alt,
  className,
  imgClassName,
  style,
  fit = 'cover',
  position,
  aspect,
  fill = false,
  fallback,
  placeholderShape = 'circle',
  onLoad,
}: ZemiImageProps) {
  const [loaded, setLoaded] = useState(false);
  // Keep the callback in a ref so an inline `onLoad` doesn't give the img a new ref callback
  // (and a repeat onLoad call) on every parent render.
  const onLoadRef = useRef(onLoad);
  useEffect(() => {
    onLoadRef.current = onLoad;
  });

  const markLoaded = useCallback(() => {
    setLoaded(true);
    onLoadRef.current?.();
  }, []);

  // Cached images can finish before hydration, so onLoad never fires: check `complete` on mount.
  const imgRef = useCallback(
    (el: HTMLImageElement | null) => {
      if (el && el.complete && el.naturalWidth > 0) markLoaded();
    },
    [markLoaded],
  );

  const ratio = aspect ?? (image && image.width && image.height ? `${image.width} / ${image.height}` : undefined);
  const boxStyle: CSSProperties = {
    ...(fill ? null : { aspectRatio: typeof ratio === 'number' ? String(ratio) : ratio }),
    ...style,
  };

  if (!image) {
    if (fallback === null) return null;
    return (
      <span className={cn(styles.root, styles.empty, fill && styles.fill, className)} style={boxStyle} aria-hidden="true">
        {fallback ?? <ShapeIcon shape={placeholderShape} size="18%" color="var(--color-line-strong, #d8d8d2)" />}
      </span>
    );
  }

  const avif = image.avif ?? [];
  const webp = image.webp ?? [];
  if (priority && typeof window === 'undefined') {
    // React hoists this into <head> during SSR, so the LCP image starts downloading early.
    if (avif.length) preload(avif[0]!.url, { as: 'image', imageSrcSet: srcSet(avif), imageSizes: sizes, fetchPriority: 'high', type: 'image/avif' } as never);
    else preload(image.src, { as: 'image', imageSrcSet: webp.length ? srcSet(webp) : undefined, imageSizes: sizes, fetchPriority: 'high' });
  }

  const vars = {
    '--zimg-color': image.color ?? undefined,
    '--zimg-fit': fit,
    '--zimg-position': position,
  } as CSSProperties;

  return (
    <span
      // Priority (LCP) images are visible straight from the server HTML: no fade that waits for
      // hydration. The LQIP still shows underneath until the pixels arrive.
      className={cn(styles.root, fill && styles.fill, priority && styles.eager, className)}
      style={{ ...vars, ...boxStyle }}
      data-loaded={loaded ? '' : undefined}
    >
      {image.lqip ? <span className={styles.lqip} style={{ backgroundImage: `url("${image.lqip}")` }} aria-hidden="true" /> : null}
      <picture className={styles.picture}>
        {avif.length ? <source type="image/avif" srcSet={srcSet(avif)} sizes={sizes} /> : null}
        {webp.length ? <source type="image/webp" srcSet={srcSet(webp)} sizes={sizes} /> : null}
        <img
          ref={imgRef}
          src={image.src}
          alt={alt ?? image.alt ?? ''}
          width={image.width || undefined}
          height={image.height || undefined}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
          className={cn(styles.img, imgClassName)}
          onLoad={markLoaded}
          onError={markLoaded}
          draggable={false}
        />
      </picture>
    </span>
  );
}
