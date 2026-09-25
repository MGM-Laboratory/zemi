'use client';

import { PerformanceMonitor } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { SceneContext } from './scene-context';
import { StudioLights, type StudioLightsProps } from './studio';

export interface SceneCanvasImplProps {
  children: ReactNode;
  visible: boolean;
  reduced: boolean;
  camera?: { position?: [number, number, number]; fov?: number };
  studio?: boolean | StudioLightsProps;
  dpr?: [number, number];
  className?: string;
  style?: CSSProperties;
  fallback?: ReactNode;
  label?: string;
  onReady?: () => void;
}

/** Fires once everything inside the Suspense boundary has resolved and a frame or two drew. */
function ReadySignal({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    let b = 0;
    const a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => onReady?.());
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [onReady]);
  return null;
}

/** The actual R3F canvas (loaded lazily by SceneCanvas). */
export default function SceneCanvasImpl({
  children,
  visible,
  reduced,
  camera,
  studio = true,
  dpr: dprRange = [1, 1.75],
  className,
  style,
  fallback,
  label,
  onReady,
}: SceneCanvasImplProps) {
  const [dpr, setDpr] = useState(dprRange[1]);
  const [quality, setQuality] = useState<'high' | 'low'>('high');
  const ctx = useMemo(() => ({ quality, reduced, visible }), [quality, reduced, visible]);

  return (
    <Canvas
      className={className}
      style={style}
      dpr={[dprRange[0], dpr]}
      frameloop={reduced ? 'demand' : visible ? 'always' : 'never'}
      camera={{ position: camera?.position ?? [0, 0, 7], fov: camera?.fov ?? 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
      flat
      fallback={fallback}
      aria-label={label}
      role={label ? 'img' : undefined}
      // Pointer events come from the shared pointer store; the canvas only needs clicks.
      eventPrefix="client"
    >
      <PerformanceMonitor
        onDecline={() => {
          setDpr(Math.max(dprRange[0], 1));
          setQuality('low');
        }}
        onIncline={() => setDpr(dprRange[1])}
        flipflops={3}
        onFallback={() => {
          setDpr(1);
          setQuality('low');
        }}
      >
        <SceneContext.Provider value={ctx}>
          <Suspense fallback={null}>
            {studio ? <StudioLights {...(typeof studio === 'object' ? studio : null)} /> : null}
            {children}
            <ReadySignal onReady={onReady} />
          </Suspense>
        </SceneContext.Provider>
      </PerformanceMonitor>
    </Canvas>
  );
}
