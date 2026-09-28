'use client';

import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Component, Suspense, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import {
  MathUtils,
  MeshBasicMaterial,
  TorusGeometry,
  Vector3,
  type Group,
  type Material,
  type Mesh,
  type MeshPhysicalMaterial,
  type Object3D,
} from 'three';
import { SHAPE_COLORS, type ShapeName } from '@zemi/shared';
import { Character3D, type Character3DHandle } from '@/components/three/character-3d';
import { ModelProp, PropFallback } from '@/components/three/model-prop';
import { useSceneQuality } from '@/components/three/scene-context';

/** 1 m in the GLBs = K world units. A character is ~2 units wide. */
const K = 3.4;
const TABLE_H = 0.75 * K;
const SEAT_H = 0.4787 * K;
const SEAT_R = 2.95;

export interface TableSceneProps {
  /** 0..1 scroll progress of the pinned beat. */
  progress: RefObject<number>;
  models: string[];
  /** Portrait canvas: pull the camera back so the table fits. */
  narrow?: boolean;
}

interface Seat {
  shape: ShapeName;
  angle: number; // degrees around the table, 90 = far side
  from: 1 | -1; // rolls in from the right (1) or left (-1)
  scale: number;
  seed: number;
}

// A panel on the far side of the table, like a talk: Hunch has the mic.
const SEATS: Seat[] = [
  { shape: 'triangle', angle: 112, from: -1, scale: 1.02, seed: 1 },
  { shape: 'circle', angle: 162, from: -1, scale: 0.96, seed: 0 },
  { shape: 'square', angle: 64, from: 1, scale: 0.92, seed: 2 },
  { shape: 'arch', angle: 16, from: 1, scale: 0.95, seed: 3 },
];
const HUNCH_A = (112 * Math.PI) / 180;
const MIC: [number, number] = [Math.cos(HUNCH_A) * 1.25, -Math.sin(HUNCH_A) * 1.25];

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

class Boundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Safe({
  name,
  models,
  children,
  fallbackSize = 1,
}: {
  name: string;
  models: string[];
  children: ReactNode;
  fallbackSize?: number;
}) {
  const fb = (
    <group scale={fallbackSize}>
      <PropFallback name={name} />
    </group>
  );
  if (!models.includes(name)) return fb;
  return (
    <Boundary fallback={fb}>
      <Suspense fallback={fb}>{children}</Suspense>
    </Boundary>
  );
}

/** A stool whose seat wears its sitter's color. */
function Stool({ color }: { color: string }) {
  const { scene } = useGLTF('/models/stool.glb', true, true);
  const obj = useMemo(() => {
    const o = scene.clone(true);
    o.traverse((n) => {
      const m = n as Mesh;
      if (!m.isMesh) return;
      const mat = m.material as MeshPhysicalMaterial;
      if (mat?.name === 'yellow' || n.name.startsWith('stool_seat')) {
        const c = mat.clone();
        c.color.set(color);
        m.material = c;
      }
    });
    o.scale.setScalar(K);
    return o;
  }, [scene, color]);
  return <primitive object={obj} />;
}

/** The laptop, lid driven by the scroll: closed, then open for the (unfinished) slides. */
function Laptop({ open }: { open: RefObject<number> }) {
  const { scene } = useGLTF('/models/laptop.glb', true, true);
  const { obj, hinge } = useMemo(() => {
    const o = scene.clone(true);
    o.scale.setScalar(K);
    return { obj: o, hinge: o.getObjectByName('lid_hinge') as Object3D | undefined };
  }, [scene]);
  useFrame(() => {
    if (hinge) hinge.rotation.x = MathUtils.lerp(1.52, -0.244, open.current ?? 0);
  });
  return <primitive object={obj} />;
}

/** Sound rings from the microphone while Hunch talks. */
function Rings({
  active,
  origin,
}: {
  active: RefObject<number>;
  origin: [number, number, number];
}) {
  const geo = useMemo(() => new TorusGeometry(0.5, 0.035, 10, 64), []);
  const mats = useMemo(
    () =>
      [0, 1, 2].map(
        () =>
          new MeshBasicMaterial({
            color: SHAPE_COLORS.triangle,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
      ),
    [],
  );
  const refs = useRef<Array<Mesh | null>>([]);
  useFrame((state) => {
    const on = active.current ?? 0;
    const t = state.clock.elapsedTime;
    refs.current.forEach((m, i) => {
      if (!m) return;
      const k = (t * 0.7 + i / 3) % 1;
      m.scale.setScalar(0.4 + k * 2.4);
      (m.material as MeshBasicMaterial).opacity = on * (1 - k) * 0.55;
    });
  });
  return (
    <group position={origin} rotation={[-0.35, 0, 0]}>
      {mats.map((mat, i) => (
        <mesh
          key={i}
          ref={(m) => void (refs.current[i] = m)}
          geometry={geo}
          material={mat as Material}
        />
      ))}
    </group>
  );
}

/**
 * 13:30, we say it out loud. The four characters roll in, hop onto stools around the seminar
 * table, the laptop opens and Hunch takes the mic while the camera dollies in.
 */
export default function TableScene({ progress, models, narrow }: TableSceneProps) {
  const { reduced } = useSceneQuality();
  const camera = useThree((s) => s.camera);
  const wrappers = useRef<Array<Group | null>>([]);
  const handles = useRef<Array<Character3DHandle | null>>([]);
  const landed = useRef<boolean[]>(SEATS.map(() => false));
  const pp = useRef(reduced ? 1 : 0);
  const lid = useRef(0);
  const talk = useRef(0);
  const look = useMemo(() => new Vector3(), []);
  const poseClock = useRef(0);
  const pose = useRef(0);

  const seats = useMemo(
    () =>
      SEATS.map((s) => {
        const a = (s.angle * Math.PI) / 180;
        const x = Math.cos(a) * SEAT_R;
        const z = -Math.sin(a) * SEAT_R;
        // Face the camera mostly, the table a little.
        const face = Math.atan2(-x, 6 - z) * 0.7;
        return { ...s, x, z, face };
      }),
    [],
  );

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const target = reduced ? 1 : clamp01(progress.current ?? 0);
    pp.current = reduced ? 1 : MathUtils.damp(pp.current, target, 6, dt);
    const p = pp.current;

    // Camera: wide and high, then a slow dolly to the table. Distance fits the panel to the canvas.
    const c = ease(seg(p, 0.02, 0.85));
    const cam = camera as unknown as { fov: number; aspect: number };
    const tanH = Math.tan(((cam.fov ?? 30) * Math.PI) / 360) * Math.max(0.4, cam.aspect ?? 1);
    const fitDist = MathUtils.clamp((narrow ? 5.6 : 5.3) / tanH, 12, narrow ? 25 : 34);
    const dist = MathUtils.lerp(fitDist * (narrow ? 1.2 : 1.45), fitDist, c);
    camera.position.set(
      MathUtils.lerp(-2.2, 0.6, c),
      1.2 + dist * MathUtils.lerp(0.58, 0.42, c),
      dist,
    );
    look.set(MathUtils.lerp(0, 0.1, c), MathUtils.lerp(1.4, 2.3, c), MathUtils.lerp(0, -0.8, c));
    camera.lookAt(look);

    lid.current = ease(seg(p, 0.52, 0.66));
    talk.current = seg(p, 0.7, 0.78);

    // Stop-motion steps for the talking bounce (15 fps).
    poseClock.current += dt;
    if (poseClock.current >= 1 / 15) {
      poseClock.current %= 1 / 15;
      pose.current = state.clock.elapsedTime;
    }

    seats.forEach((s, i) => {
      const w = wrappers.current[i];
      if (!w) return;
      const a = 0.06 + i * 0.1;
      const roll = seg(p, a, a + 0.22);
      const hop = seg(p, a + 0.2, a + 0.3);
      const startX = s.from * 13;
      const besideX = s.x + s.from * 1.9;
      const r = s.scale;
      let x = MathUtils.lerp(startX, besideX, ease(roll));
      let y = r;
      let z = s.z + (s.from > 0 ? 0.6 : 0.6);
      let rotZ = 0;
      // Distance still to go: every roll ends upright at the stool.
      const remaining = Math.abs(besideX - x);
      if (s.shape === 'circle') rotZ = -s.from * (remaining / r);
      else if (s.shape === 'square' || s.shape === 'triangle') {
        // Tumble edge over edge (90 or 120 degree steps) with a little hop.
        const step = (s.shape === 'square' ? 2 : 1.7) * r;
        const turn = s.shape === 'square' ? Math.PI / 2 : (Math.PI * 2) / 3;
        const n = remaining / step;
        const f = n - Math.floor(n);
        rotZ = -s.from * (Math.floor(n) + ease(f)) * turn;
        y = r + Math.sin(f * Math.PI) * (s.shape === 'square' ? 0.42 : 0.5) * r;
      } else {
        // Bridge can't roll: it bunny-hops.
        const f = (remaining / 1.4) % 1;
        y = r + Math.abs(Math.sin(f * Math.PI)) * 0.9;
      }

      // Hop onto the stool.
      if (hop > 0) {
        const h = ease(hop);
        x = MathUtils.lerp(besideX, s.x, h);
        z = MathUtils.lerp(s.z + 0.6, s.z, h);
        y = MathUtils.lerp(r, SEAT_H + r, h) + Math.sin(hop * Math.PI) * 1.4;
        rotZ = MathUtils.lerp(rotZ, 0, h);
      }
      if (hop >= 1 && !landed.current[i]) {
        landed.current[i] = true;
        if (!reduced) handles.current[i]?.squash();
      } else if (hop < 0.5 && landed.current[i]) landed.current[i] = false;

      // Hunch talks: a stepped bounce while the rings go.
      if (i === 0 && talk.current > 0 && !reduced) {
        y += Math.abs(Math.sin(pose.current * 7)) * 0.18 * talk.current;
      }

      w.position.set(x, y, z);
      w.rotation.set(0, MathUtils.lerp(0, s.face, hop), rotZ);
      w.visible = roll > 0 || hop > 0;
    });
  });

  return (
    <group>
      <Safe name="seminar-table" models={models} fallbackSize={2.4}>
        <ModelProp name="seminar-table" size={1.1 * K} />
      </Safe>
      {seats.map((s) => (
        <group key={`stool-${s.shape}`} position={[s.x, 0, s.z]} rotation={[0, s.face, 0]}>
          <Safe name="stool" models={models} fallbackSize={2}>
            <Stool color={SHAPE_COLORS[s.shape]} />
          </Safe>
        </group>
      ))}
      <group position={[-0.35, TABLE_H, 0.45]} rotation={[0, 0.35, 0]}>
        <Safe name="laptop" models={models}>
          <Laptop open={lid} />
        </Safe>
      </group>
      <group
        position={[MIC[0], TABLE_H, MIC[1]]}
        rotation={[0, Math.PI - (HUNCH_A - Math.PI / 2), 0]}
      >
        <Safe name="microphone" models={models} fallbackSize={0.6}>
          <ModelProp name="microphone" size={0.26 * K} />
        </Safe>
      </group>
      <Rings active={talk} origin={[MIC[0] * 1.5, TABLE_H + 1.1, MIC[1] * 1.5]} />
      <group position={[1.05, TABLE_H, 0.45]} rotation={[0, -0.6, 0]}>
        <Safe name="coffee-cup" models={models} fallbackSize={0.5}>
          <ModelProp name="coffee-cup" size={0.16 * K} />
        </Safe>
      </group>
      <group position={[0.75, TABLE_H, -0.55]} rotation={[0, 0.9, 0]}>
        <Safe name="paper-stack" models={models} fallbackSize={0.7}>
          <ModelProp name="paper-stack" size={0.34 * K} />
        </Safe>
      </group>
      {seats.map((s, i) => (
        <group key={s.shape} ref={(g) => void (wrappers.current[i] = g)} visible={false}>
          <Character3D
            ref={(h) => void (handles.current[i] = h)}
            shape={s.shape}
            seed={s.seed}
            scale={s.scale}
            bob={false}
          />
        </group>
      ))}
    </group>
  );
}

useGLTF.preload('/models/stool.glb', true, true);
useGLTF.preload('/models/laptop.glb', true, true);
