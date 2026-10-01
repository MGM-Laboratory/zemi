'use client';

import { PerformanceMonitor } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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
  /** The GPU dropped the WebGL context. The parent remounts the canvas. */
  onContextLost?: () => void;
}

/** Longest wait for the async shader compile before showing the scene anyway. */
const COMPILE_CAP_MS = 4000;

/**
 * Fires once everything inside the Suspense boundary has resolved, the shaders are compiled
 * (off the main thread where the browser supports KHR_parallel_shader_compile, so the first
 * visible frame doesn't stall the scroll) and a frame or two drew.
 */
function ReadySignal({ onReady }: { onReady?: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    let cancelled = false;
    let a = 0;
    let b = 0;
    const fire = () => {
      if (cancelled) return;
      a = requestAnimationFrame(() => {
        b = requestAnimationFrame(() => {
          if (!cancelled) onReady?.();
        });
      });
    };
    const compile = (gl as unknown as { compileAsync?: (s: unknown, c: unknown) => Promise<unknown> }).compileAsync;
    if (typeof compile === 'function') {
      let cap = 0;
      Promise.race([
        // Inside .then so a synchronous throw from compile() still ends in fire().
        Promise.resolve().then(() => compile.call(gl, scene, camera)),
        new Promise((resolve) => {
          cap = window.setTimeout(resolve, COMPILE_CAP_MS);
        }),
      ])
        .catch(() => undefined)
        .finally(() => {
          clearTimeout(cap);
          fire();
        });
    } else fire();
    return () => {
      cancelled = true;
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [gl, scene, camera, onReady]);
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
  onContextLost,
}: SceneCanvasImplProps) {
  const [dpr, setDpr] = useState(dprRange[1]);
  const [quality, setQuality] = useState<'high' | 'low'>('high');
  const ctx = useMemo(() => ({ quality, reduced, visible }), [quality, reduced, visible]);
  // R3F forces a context loss when it tears a canvas down: that one is not a GPU failure.
  const alive = useRef(true);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

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
      onCreated={({ gl }) => {
        gl.domElement.addEventListener(
          'webglcontextlost',
          (e) => {
            e.preventDefault();
            if (alive.current && gl.domElement.isConnected) onContextLost?.();
          },
          { once: true },
        );
      }}
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
