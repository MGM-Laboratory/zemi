'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, type RefObject } from 'react';
import {
  MathUtils,
  Object3D,
  SphereGeometry,
  Vector3,
  type Group,
  type InstancedMesh,
} from 'three';
import { SHAPE_COLORS, SHAPE_ORDER, type ShapeName } from '@zemi/shared';
import { Character3D, type Character3DHandle } from '@/components/three/character-3d';
import { clayMaterial } from '@/components/three/clay';
import { useSceneQuality } from '@/components/three/scene-context';
import { shapeGeometry } from '@/components/three/shapes';
import { pointer } from '@/lib/hooks/use-pointer';

export interface HeroSceneProps {
  /** 0 at the top of the page, 1 once the hero has scrolled away. Written by the hero section. */
  scroll: RefObject<{ p: number }>;
  /** The first-visit loader has lifted: the characters drop in. */
  ready: boolean;
}

interface Slot {
  shape: ShapeName;
  /** Fractions of the viewport (x: -0.5 left to 0.5 right, y: -0.5 bottom to 0.5 top). */
  fx: number;
  fy: number;
  z: number;
  scale: number;
  seed: number;
}

// Wide screens: a loose cluster up and to the right of the title, above the next-Friday card.
const WIDE: Slot[] = [
  { shape: 'circle', fx: 0.13, fy: 0.27, z: 0.5, scale: 0.95, seed: 0 },
  { shape: 'triangle', fx: 0.305, fy: 0.32, z: -1.2, scale: 1.0, seed: 1 },
  { shape: 'square', fx: 0.215, fy: 0.105, z: 1.0, scale: 0.84, seed: 2 },
  { shape: 'arch', fx: 0.395, fy: 0.13, z: -0.3, scale: 0.9, seed: 3 },
];

// Portrait screens: one wobbly row between the clock and the title. `fy` is replaced by `topPx`.
const TALL: Array<Slot & { topPx: number }> = [
  { shape: 'circle', fx: -0.34, fy: 0, topPx: 214, z: 0.3, scale: 0.95, seed: 0 },
  { shape: 'triangle', fx: -0.11, fy: 0, topPx: 186, z: -0.4, scale: 1.0, seed: 1 },
  { shape: 'square', fx: 0.12, fy: 0, topPx: 222, z: 0.5, scale: 0.88, seed: 2 },
  { shape: 'arch', fx: 0.35, fy: 0, topPx: 194, z: 0, scale: 0.92, seed: 3 },
];

const STEP = 1 / 15; // stop-motion clay: idle poses step at 15 fps
const PARTICLE_GEO_CIRCLE = new SphereGeometry(1, 18, 14);

interface Sim {
  /** false until the first frame puts the character at home. */
  placed: boolean;
  x: number;
  y: number;
  vx: number;
  sy: number;
  vy: number;
  poseT: number;
  pose: { y: number; r: number };
  hovered: boolean;
  rippleAt: number;
}

/** The four clay characters floating in the hero, plus drifting idea particles. */
export default function HeroScene({ scroll, ready }: HeroSceneProps) {
  const { reduced, quality } = useSceneQuality();
  const viewport = useThree((s) => s.viewport);
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  const tall = size.width < 768 || size.width / Math.max(1, size.height) < 0.72;
  const slots: Slot[] = useMemo(
    () => (tall ? TALL.map((s) => ({ ...s, fy: 0.5 - s.topPx / Math.max(1, size.height) })) : WIDE),
    [tall, size.height],
  );
  // Ultrawide: keep the cluster inside the 1680px content column instead of the far edge.
  const col = tall ? 1 : Math.min(1, 1760 / Math.max(1, size.width));
  const fit = tall
    ? Math.min(0.62, viewport.width / 8.4)
    : Math.min(1.05, Math.max(0.6, (viewport.width * col) / 16.5));

  const wrappers = useRef<Array<Group | null>>([]);
  const handles = useRef<Array<Character3DHandle | null>>([]);
  const sims = useRef<Sim[]>(
    SHAPE_ORDER.map(() => ({
      placed: false,
      x: 0,
      y: 0,
      vx: 0,
      sy: 1,
      vy: 0,
      poseT: 0,
      pose: { y: 0, r: 0 },
      hovered: false,
      rippleAt: -1,
    })),
  );
  const clicks = useRef(0);
  const readyAt = useRef(-1);
  const cluster = useRef<Group>(null);
  const tmp = useMemo(() => new Vector3(), []);

  const ripple = (from: number, strength = 1) => {
    const now = performance.now();
    const origin = wrappers.current[from]?.position;
    sims.current.forEach((s, i) => {
      const w = wrappers.current[i];
      if (!w || !origin) return;
      const d = i === from ? 0 : w.position.distanceTo(origin);
      // 60 ms per world unit of distance (awwwards pattern 4).
      s.rippleAt = now + d * 60;
      s.vy = (s.vy ?? 0) - (i === from ? 0 : 2.6 * strength);
    });
  };

  const onCharacterClick = (i: number) => {
    ripple(i, 1.4);
    clicks.current += 1;
    if (clicks.current % 5 === 0)
      handles.current.forEach((h, k) => setTimeout(() => h?.cheer(), k * 90));
  };

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const t = state.clock.elapsedTime;
    const p = pointer.get();
    const live = p.active && p.type !== 'touch' && !reduced;
    const rect = gl.domElement.getBoundingClientRect();
    const nx = live
      ? MathUtils.clamp(((p.x - rect.left) / Math.max(1, rect.width)) * 2 - 1, -1.2, 1.2)
      : 0;
    const ny = live
      ? MathUtils.clamp(((p.y - rect.top) / Math.max(1, rect.height)) * 2 - 1, -1.2, 1.2)
      : 0;
    const sp = reduced ? 0 : MathUtils.clamp(scroll.current?.p ?? 0, 0, 1);

    // Camera parallax on pointer, push-in on scroll.
    if (!reduced) {
      camera.position.x = MathUtils.damp(camera.position.x, nx * 0.7, 2.4, dt);
      camera.position.y = MathUtils.damp(camera.position.y, 0.2 - ny * 0.45 + sp * 0.6, 2.4, dt);
      camera.position.z = MathUtils.damp(camera.position.z, 16 - sp * 3.2, 3, dt);
      camera.lookAt(0, sp * 0.8, 0);
    }
    if (cluster.current) cluster.current.position.y = sp * viewport.height * 0.35;

    // Pointer in world units at z = 0, for hover detection.
    const wx = (nx * viewport.width) / 2;
    const wy = (-ny * viewport.height) / 2;
    const now = performance.now();
    slots.forEach((slot, i) => {
      const w = wrappers.current[i];
      const s = sims.current[i]!;
      if (!w) return;
      const homeX = slot.fx * viewport.width * col;
      const homeY = slot.fy * viewport.height;

      // Weight: follow a cursor-offset target with a lazy lerp, lean into the velocity.
      const depth = 0.55 + (slot.z + 1.5) * 0.12;
      const tx = homeX + (live ? nx * 0.42 * depth : 0);
      const ty = homeY + (live ? -ny * 0.3 * depth : 0);
      if (!s.placed) {
        s.placed = true;
        s.x = tx;
        s.y = ty;
      }
      const px = s.x;
      s.x += (tx - s.x) * (reduced ? 1 : 1 - Math.pow(1 - 0.08, dt * 60));
      s.y += (ty - s.y) * (reduced ? 1 : 1 - Math.pow(1 - 0.08, dt * 60));
      s.vx = (s.x - px) / Math.max(dt, 1e-3);

      // Idle float, stepped at 15 fps for the handmade clay feel.
      if (!reduced) {
        s.poseT += dt;
        if (s.poseT >= STEP) {
          s.poseT %= STEP;
          const tq = Math.floor(t / STEP) * STEP + slot.seed * 1.7;
          s.pose.y = Math.sin(tq * 1.35) * 0.16;
          s.pose.r = Math.sin(tq * 0.9) * 0.07;
        }
      }

      // Hover: squash + a ripple that reaches the others.
      const dx = wx - s.x;
      const dy = wy - (s.y + s.pose.y);
      const over = live && Math.hypot(dx, dy) < 1.05 * slot.scale * fit;
      if (over && !s.hovered) ripple(i, 1);
      s.hovered = over;

      // Squash spring (elastic return), kicked by ripples.
      if (s.rippleAt > 0 && now >= s.rippleAt) {
        s.rippleAt = -1;
        s.sy = Math.min(s.sy, 0.9);
      }
      const k = 170;
      const c = 9;
      s.vy += (-k * (s.sy - 1) - c * s.vy) * dt;
      s.sy += s.vy * dt;
      const sy = MathUtils.clamp(s.sy, 0.8, 1.2);
      const sxz = 1 + (1 - sy) * 0.6;

      // Entrance: they drop in one by one, stepped at 15 fps like stop-motion (awwwards pattern 1).
      if (ready && readyAt.current < 0) readyAt.current = t;
      const tq = Math.floor((t - Math.max(0, readyAt.current)) / STEP) * STEP;
      const e = reduced
        ? 1
        : readyAt.current < 0
          ? 0
          : MathUtils.clamp((tq - 0.1 - i * 0.14) / 0.55, 0, 1);
      const drop = e < 1 ? (1 - easeOutBack(e)) * 2.2 : 0;

      w.position.set(s.x, s.y + s.pose.y + drop, slot.z);
      w.rotation.z = reduced
        ? 0
        : MathUtils.clamp(-s.vx * 0.08, -0.28, 0.28) + s.pose.r + (1 - e) * 0.6 * (i % 2 ? 1 : -1);
      w.visible = e > 0;
      const base = slot.scale * fit * Math.max(0.001, Math.min(1, e * 1.6));
      w.scale.set(base * sxz, base * sy, base * sxz);
    });
  });

  return (
    <>
      <group ref={cluster}>
        {slots.map((slot, i) => (
          <group key={slot.shape} ref={(g) => void (wrappers.current[i] = g)}>
            <Character3D
              ref={(h) => void (handles.current[i] = h)}
              shape={slot.shape}
              seed={slot.seed}
              bob={false}
              onClick={() => onCharacterClick(i)}
            />
          </group>
        ))}
      </group>
      {reduced ? null : (
        <IdeaParticles count={tall || quality === 'low' ? 6 : 12} tmp={tmp} scroll={scroll} />
      )}
    </>
  );
}

interface Particle {
  x: number;
  y: number;
  z: number;
  s: number;
  speed: number;
  phase: number;
  spin: number;
  ox: number;
  oy: number;
}

/** Small brand shapes drifting upward like ideas, nudged away by the pointer. */
function IdeaParticles({
  count,
  tmp,
  scroll,
}: {
  count: number;
  tmp: Vector3;
  scroll: RefObject<{ p: number }>;
}) {
  const viewport = useThree((s) => s.viewport);
  const gl = useThree((s) => s.gl);
  const meshes = useRef<Array<InstancedMesh | null>>([]);
  const dummy = useMemo(() => new Object3D(), []);
  const data = useMemo(() => {
    const rnd = mulberry(7);
    return SHAPE_ORDER.map(() =>
      Array.from({ length: count }, (): Particle => ({
        x: (rnd() - 0.5) * 1.1,
        y: rnd(),
        z: -4 + rnd() * 6,
        s: 0.05 + rnd() * 0.1,
        speed: 0.015 + rnd() * 0.035,
        phase: rnd() * Math.PI * 2,
        spin: (rnd() - 0.5) * 1.2,
        ox: 0,
        oy: 0,
      })),
    );
  }, [count]);

  const geos = useMemo(
    () => SHAPE_ORDER.map((s) => (s === 'circle' ? PARTICLE_GEO_CIRCLE : shapeGeometry(s))),
    [],
  );

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const t = state.clock.elapsedTime;
    const p = pointer.get();
    const rect = gl.domElement.getBoundingClientRect();
    const live = p.active && p.type !== 'touch';
    const wx = live
      ? (((p.x - rect.left) / Math.max(1, rect.width)) * 2 - 1) * (viewport.width / 2)
      : 1e6;
    const wy = live
      ? -(((p.y - rect.top) / Math.max(1, rect.height)) * 2 - 1) * (viewport.height / 2)
      : 1e6;
    const lift = (scroll.current?.p ?? 0) * 1.5;
    SHAPE_ORDER.forEach((_, si) => {
      const mesh = meshes.current[si];
      if (!mesh) return;
      data[si]!.forEach((q, i) => {
        q.y += q.speed * dt * (1 + lift);
        if (q.y > 1) q.y -= 1.08;
        const x = q.x * viewport.width + Math.sin(t * 0.4 + q.phase) * 0.35;
        // Rise from below the fold to just under the nav band, then wrap.
        const y = (q.y * 0.94 - 0.56) * viewport.height;
        // Push away from the pointer (screen plane approximation).
        tmp.set(x - wx, y - wy, 0);
        const d = tmp.length();
        const push = d < 1.6 ? (1.6 - d) * 0.9 : 0;
        q.ox = MathUtils.damp(q.ox, d > 0 ? (tmp.x / d) * push : 0, 4, dt);
        q.oy = MathUtils.damp(q.oy, d > 0 ? (tmp.y / d) * push : 0, 4, dt);
        dummy.position.set(x + q.ox, y + q.oy, q.z);
        dummy.rotation.set(t * q.spin * 0.6 + q.phase, t * q.spin, t * q.spin * 0.4);
        dummy.scale.setScalar(q.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
  });

  return (
    <>
      {SHAPE_ORDER.map((shape, si) => (
        <instancedMesh
          key={shape}
          ref={(m) => void (meshes.current[si] = m)}
          args={[geos[si], clayMaterial(SHAPE_COLORS[shape]), count]}
          frustumCulled={false}
        />
      ))}
    </>
  );
}

function easeOutBack(x: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
