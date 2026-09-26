'use client';

/*
 * R3F scene: the clock state (a ref shared with the DOM drag layer) and the GLB's hand pivots
 * are imperative stores, written every frame inside useFrame and effects, never during render.
 */
/* eslint-disable react-hooks/immutability */

import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Box3, MathUtils, Vector3, type Group, type Object3D } from 'three';
import { Character3D } from '@/components/three/character-3d';
import { useSceneQuality } from '@/components/three/scene-context';
import { pointer } from '@/lib/hooks/use-pointer';
import type { ClockState } from './clock-state';

const URL = '/models/wall-clock.glb';
const TAU = Math.PI * 2;
/** 13:15: minute hand on 3, hour hand a quarter of the way from 1 to 2. */
const REST_MINUTE = -Math.PI / 2;
const REST_HOUR = -((1 + 15 / 60) / 12) * TAU;
/** Clock diameter in world units. */
const DIAMETER = 3.3;

export interface WallClockSceneProps {
  clock: RefObject<ClockState>;
  /** Q is startled while you drag. */
  startled: boolean;
}

/**
 * The wall clock (wall-clock.glb) stuck at 13:15. Its hands follow the drag layer and spring
 * back; every few seconds the minute hand tries to sneak forward and gets pulled back. The
 * clock tilts toward the pointer, and Q peeks from behind the rim.
 */
export default function WallClockScene({ clock, startled }: WallClockSceneProps) {
  const { scene } = useGLTF(URL, true, true);
  const { reduced } = useSceneQuality();
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const tilt = useRef<Group>(null);

  const { obj, minute, hour, scale } = useMemo(() => {
    const o = scene.clone(true);
    const dims = new Box3().setFromObject(o).getSize(new Vector3());
    const s = DIAMETER / Math.max(dims.x, dims.y, 1e-6);
    // The pivots come first in traversal (the meshes are named *_mesh), so these are the pivots.
    const m = o.getObjectByName('minute_hand') as Object3D | undefined;
    const h = o.getObjectByName('hour_hand') as Object3D | undefined;
    if (m) m.rotation.z = REST_MINUTE;
    if (h) h.rotation.z = REST_HOUR;
    return { obj: o, minute: m, hour: h, scale: s };
  }, [scene]);

  const faceHalf = useMemo(() => new Box3().setFromObject(scene).getSize(new Vector3()).y / 2, [scene]);

  useEffect(() => {
    const c = clock.current;
    if (!c) return;
    c.invalidate = invalidate;
    return () => {
      c.invalidate = undefined;
    };
  }, [clock, invalidate]);

  const sim = useRef({ nextKick: 3.5, last: Number.NaN, tx: 0, ty: 0 });
  const center = useMemo(() => new Vector3(), []);
  const edge = useMemo(() => new Vector3(), []);

  useFrame((state, delta) => {
    const c = clock.current;
    if (!c) return;
    const dt = Math.min(delta, 1 / 20);
    const t = state.clock.elapsedTime;
    const s = sim.current;

    if (reduced) {
      c.shown = c.dragging ? c.target : 0;
      c.velocity = 0;
    } else if (c.dragging) {
      c.shown = MathUtils.damp(c.shown, c.target, 22, dt);
      c.velocity = 0;
    } else {
      // Springy return to 13:15 (a little overshoot, like a hand that snaps back).
      const k = 46;
      const damping = 6.5;
      c.velocity += (-k * c.shown - damping * c.velocity) * dt;
      c.shown += c.velocity * dt;
      // Idle: the minute hand tries to sneak to 13:16 and gets pulled back.
      if (t > s.nextKick && Math.abs(c.shown) < 0.05) {
        c.velocity += 7;
        s.nextKick = t + 4.5 + Math.random() * 4;
      }
    }

    if (minute) minute.rotation.z = REST_MINUTE - (c.shown / 60) * TAU;
    if (hour) hour.rotation.z = REST_HOUR - (c.shown / 720) * TAU;
    c.hands = { minute: -(minute?.rotation.z ?? REST_MINUTE), hour: -(hour?.rotation.z ?? REST_HOUR) };
    if (Math.round(c.shown) !== s.last) {
      s.last = Math.round(c.shown);
      c.onShown?.(c.shown);
    }

    // Tilt toward the pointer, float a little.
    const g = tilt.current;
    if (g && !reduced) {
      const p = pointer.get();
      const r = gl.domElement.getBoundingClientRect();
      const live = p.active && p.type !== 'touch';
      const nx = live ? MathUtils.clamp((p.x - (r.left + r.width / 2)) / (window.innerWidth / 2), -1, 1) : 0;
      const ny = live ? MathUtils.clamp((p.y - (r.top + r.height / 2)) / (window.innerHeight / 2), -1, 1) : 0;
      s.tx = MathUtils.damp(s.tx, nx, 3, dt);
      s.ty = MathUtils.damp(s.ty, ny, 3, dt);
      g.rotation.y = s.tx * 0.32 + Math.sin(t * 0.5) * 0.04;
      g.rotation.x = s.ty * 0.22;
      g.position.y = Math.sin(t * 0.9) * 0.05;
    }

    // Tell the drag layer where the face is on screen.
    if (g) {
      g.getWorldPosition(center);
      center.project(camera);
      const r = gl.domElement.getBoundingClientRect();
      g.getWorldPosition(edge);
      edge.x += DIAMETER / 2;
      edge.project(camera);
      c.center = {
        x: r.left + ((center.x + 1) / 2) * r.width,
        y: r.top + ((1 - center.y) / 2) * r.height,
        r: Math.abs(edge.x - center.x) * 0.5 * r.width,
      };
    }
  });

  return (
    <group>
      <group ref={tilt}>
        {/* The GLB's origin is at the bottom of the rim; lift it so the face center sits at the origin. */}
        <group scale={scale} position={[0, -faceHalf * scale, 0]}>
          <primitive object={obj} />
        </group>
      </group>
      <Character3D
        shape="circle"
        scale={0.46}
        position={[1.72, -1.28, 0.55]}
        rotation={[0, -0.35, 0.1]}
        mood={startled ? 'surprised' : 'idle'}
        seed={2}
      />
    </group>
  );
}

useGLTF.preload(URL, true, true);
