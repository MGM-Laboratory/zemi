'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CylinderGeometry, MathUtils, TorusGeometry, type Group } from 'three';
import { SHAPE_ORDER } from '@zemi/shared';
import { Character3D, type Character3DHandle } from '@/components/three/character-3d';
import { clayMaterial } from '@/components/three/clay';
import { useSceneQuality } from '@/components/three/scene-context';

export interface PillarsSceneProps {
  /** Index into SHAPE_ORDER that faces the front. */
  active: number;
  onPick: (i: number) => void;
}

const RADIUS = 2.25;
const STEP = 1 / 15; // idle poses step at 15 fps (stop-motion clay)
const TABLE_TOP = new CylinderGeometry(3.45, 3.45, 0.32, 96, 1);
const TABLE_RIM = new TorusGeometry(3.45, 0.07, 16, 120);
const TABLE_FOOT = new CylinderGeometry(0.34, 0.5, 1.6, 40, 1);

/**
 * "What we believe": the four characters on a round clay table that turns like a lazy susan.
 * The active pillar's character rotates to the front, cheers and smiles; the others wait
 * around the table. Click a character to pick it.
 */
export default function PillarsScene({ active, onPick }: PillarsSceneProps) {
  const { reduced } = useSceneQuality();
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const table = useRef<Group>(null);
  const wrappers = useRef<Array<Group | null>>([]);
  const handles = useRef<Array<Character3DHandle | null>>([]);
  const sim = useRef({ angle: -active * (Math.PI / 2), target: -active * (Math.PI / 2), v: 0, poseT: 0, pose: [0, 0, 0, 0] });

  // Shortest way round to the new front character.
  useEffect(() => {
    const s = sim.current;
    const want = -active * (Math.PI / 2);
    let d = want - s.target;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    s.target += d;
    const t = setTimeout(() => handles.current[active]?.cheer(), reduced ? 0 : 380);
    return () => clearTimeout(t);
  }, [active, reduced]);

  const portrait = size.width / Math.max(1, size.height) < 0.95;
  useEffect(() => {
    camera.position.set(0, portrait ? 5.4 : 4.6, portrait ? 13.8 : 11.6);
    camera.lookAt(0, -0.55, 0);
    camera.updateProjectionMatrix();
  }, [camera, portrait]);

  const topMat = useMemo(() => clayMaterial('#f7f7f5', { roughness: 0.5, clearcoat: 0.2 }), []);
  const rimMat = useMemo(() => clayMaterial('#e9e8e2', { roughness: 0.45 }), []);
  const footMat = useMemo(() => clayMaterial('#0e1116', { roughness: 0.4 }), []);

  useFrame((state, delta) => {
    const s = sim.current;
    const dt = Math.min(delta, 1 / 20);
    if (reduced) {
      s.angle = s.target;
    } else {
      // Springy turn with a small overshoot.
      s.v += (-32 * (s.angle - s.target) - 8.5 * s.v) * dt;
      s.angle += s.v * dt;
      s.poseT += dt;
      if (s.poseT >= STEP) {
        s.poseT %= STEP;
        const tq = Math.floor(state.clock.elapsedTime / STEP) * STEP;
        s.pose = s.pose.map((_, i) => Math.abs(Math.sin(tq * 2.2 + i * 1.3)) * 0.12);
      }
    }
    if (table.current) table.current.rotation.y = s.angle;
    wrappers.current.forEach((w, i) => {
      if (!w) return;
      const isActive = i === active;
      const target = isActive ? 1.12 : 0.86;
      const sc = MathUtils.damp(w.scale.x, target, 6, dt);
      w.scale.setScalar(reduced ? target : sc);
      // Everyone mostly faces you as the table turns (a carousel, not a slab parade);
      // bystanders hop a little in place at 15 fps.
      w.rotation.y = -(s.angle + i * (Math.PI / 2)) * 0.82;
      w.position.y = -0.02 + (isActive || reduced ? 0 : s.pose[i]!);
    });
  });

  return (
    <group position={[0, -0.2, 0]}>
      <group ref={table}>
        <mesh geometry={TABLE_TOP} material={topMat} position={[0, -1.16, 0]} />
        <mesh geometry={TABLE_RIM} material={rimMat} position={[0, -1.16, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <mesh geometry={TABLE_FOOT} material={footMat} position={[0, -2.1, 0]} />
        {SHAPE_ORDER.map((shape, i) => {
          const a = i * (Math.PI / 2);
          return (
            <group key={shape} position={[Math.sin(a) * RADIUS, 0, Math.cos(a) * RADIUS]} rotation={[0, a, 0]}>
              <group ref={(g) => void (wrappers.current[i] = g)}>
                <Character3D
                  ref={(h) => void (handles.current[i] = h)}
                  shape={shape}
                  seed={i}
                  bob={false}
                  mood={i === active ? 'happy' : 'idle'}
                  onClick={() => onPick(i)}
                />
              </group>
            </group>
          );
        })}
      </group>
    </group>
  );
}
