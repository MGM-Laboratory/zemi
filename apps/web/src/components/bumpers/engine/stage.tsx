'use client';

import { BUMPER_CANVAS } from '@zemi/shared';
import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';

export interface StageMetrics {
  scale: number;
  /** Canvas offset inside the stage box (letterboxing), in CSS px. */
  left: number;
  top: number;
  width: number;
  height: number;
}

const StageContext = createContext<StageMetrics>({ scale: 1, left: 0, top: 0, width: BUMPER_CANVAS.width, height: BUMPER_CANVAS.height });

/** Scale and offsets of the nearest stage (the builder converts pointer positions with it). */
export function useStage(): StageMetrics {
  return useContext(StageContext);
}

export interface BumperStageProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** What shows around the canvas when the box is not 16:9. */
  letterbox?: string;
  /** Force a scale instead of measuring (thumbnails with a known width). */
  width?: number;
  /** Extra layer above the canvas, in stage (screen) coordinates (builder handles). */
  overlay?: ReactNode;
  /** The 1920x1080 canvas element. */
  canvasRef?: Ref<HTMLDivElement>;
  /** Called when the scale changes. */
  onMetrics?: (m: StageMetrics) => void;
  'aria-label'?: string;
}

/**
 * Fits the 1920x1080 bumper canvas into any box (contain), centered with letterboxing. Every
 * slide is authored in canvas px, so the same slide looks identical in a 200px thumbnail, the
 * builder, a laptop player and a 4K OBS output.
 */
export function BumperStage({ children, className, style, letterbox = 'transparent', width, overlay, canvasRef, onMetrics, 'aria-label': ariaLabel }: BumperStageProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<StageMetrics>(() => {
    const scale = width ? width / BUMPER_CANVAS.width : 0;
    return { scale, left: 0, top: 0, width: width ?? 0, height: width ? (width * 9) / 16 : 0 };
  });
  const cb = useRef(onMetrics);
  useLayoutEffect(() => {
    cb.current = onMetrics;
  });

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight || (w * 9) / 16;
      if (!w) return;
      const scale = Math.min(w / BUMPER_CANVAS.width, h / BUMPER_CANVAS.height);
      const next = { scale, left: (w - BUMPER_CANVAS.width * scale) / 2, top: (h - BUMPER_CANVAS.height * scale) / 2, width: w, height: h };
      setM((prev) => (Math.abs(prev.scale - next.scale) < 1e-4 && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.top - next.top) < 0.5 && prev.width === w && prev.height === h ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    cb.current?.(m);
  }, [m]);

  return (
    <StageContext.Provider value={m}>
      <div ref={boxRef} className={className} style={{ position: 'relative', overflow: 'hidden', background: letterbox, ...style }} role={ariaLabel ? 'img' : undefined} aria-label={ariaLabel}>
        <div
          ref={canvasRef}
          data-bumper-canvas=""
          style={{
            position: 'absolute',
            left: m.left,
            top: m.top,
            width: BUMPER_CANVAS.width,
            height: BUMPER_CANVAS.height,
            transform: `scale(${m.scale})`,
            transformOrigin: '0 0',
            visibility: m.scale ? 'visible' : 'hidden',
          }}
        >
          {children}
        </div>
        {overlay}
      </div>
    </StageContext.Provider>
  );
}
