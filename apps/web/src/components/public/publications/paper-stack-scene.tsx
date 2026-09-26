'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, type RefObject } from 'react';
import { BoxGeometry, MathUtils, type Group } from 'three';
import { SHAPE_COLORS, type ShapeName } from '@zemi/shared';
import { Character3D, type Character3DHandle } from '@/components/three/character-3d';
import { clayMaterial } from '@/components/three/clay';
import { useSceneQuality } from '@/components/three/scene-context';
import { shapeGeometry } from '@/components/three/shapes';
import { pointer } from '@/lib/hooks/use-pointer';

export interface PaperStackSceneProps {
  /** 0 when the header is at rest, 1 once it has scrolled away. Written by the stage. */
  scroll: RefObject<{ p: number }>;
}

// A4-ish sheet in world units.
const W = 2.1;
const H = 2.97;
const T = 0.022;
const N = 7;

const SHEET_GEO = new BoxGeometry(W, H, T);
const LINE_GEO = new BoxGeometry(1, 1, 1);

type Figure = { kind: 'bars' } | { kind: 'shape'; shape: ShapeName };

interface SheetSpec {
  figure: Figure;
  /** Resting jitter so the stack looks hand-made. */
  rz: number;
  dx: number;
  lines: number[];
  titleW: number;
  figureAt: [number, number];
}

function seeded(i: number) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const FIGURES: Figure[] = [
  { kind: 'bars' },
  { kind: 'shape', shape: 'circle' },
  { kind: 'shape', shape: 'triangle' },
  { kind: 'shape', shape: 'arch' },
  { kind: 'shape', shape: 'square' },
  { kind: 'bars' },
  { kind: 'shape', shape: 'circle' },
];

const SHEETS: SheetSpec[] = Array.from({ length: N }, (_, i) => ({
  figure: FIGURES[i % FIGURES.length]!,
  rz: (seeded(i) - 0.5) * 0.12,
  dx: (seeded(i + 9) - 0.5) * 0.14,
  lines: Array.from({ length: 7 }, (_, j) => 0.62 + seeded(i * 7 + j) * 0.38),
  titleW: 0.9 + seeded(i + 3) * 0.5,
  figureAt: [seeded(i + 5) > 0.5 ? 0.45 : -0.45, -0.72],
}));

/** One sheet of paper with a title, text lines and a tiny brand-colored figure on its face. */
function Sheet({ spec }: { spec: SheetSpec }) {
  const paper = clayMaterial('#ffffff', { clearcoat: 0.2, roughness: 0.55, sheen: 0.05 });
  const ink = clayMaterial('#0e1116');
  const grey = clayMaterial('#c9ced8', { clearcoat: 0 });
  const z = T / 2 + 0.004;
  const left = -W / 2 + 0.28;
  return (
    <group position={[0, H / 2, 0]}>
      <mesh geometry={SHEET_GEO} material={paper} />
      {/* title */}
      <mesh
        geometry={LINE_GEO}
        material={ink}
        position={[left + spec.titleW / 2, H / 2 - 0.36, z]}
        scale={[spec.titleW, 0.09, 0.008]}
      />
      <mesh
        geometry={LINE_GEO}
        material={ink}
        position={[left + 0.33, H / 2 - 0.52, z]}
        scale={[0.66, 0.06, 0.008]}
      />
      {/* body text */}
      {spec.lines.map((w, j) => {
        const lw = (W - 0.56) * w;
        return (
          <mesh
            key={j}
            geometry={LINE_GEO}
            material={grey}
            position={[left + lw / 2, H / 2 - 0.82 - j * 0.15, z]}
            scale={[lw, 0.04, 0.006]}
          />
        );
      })}
      {/* figure */}
      <group position={[spec.figureAt[0], spec.figureAt[1], z]}>
        {spec.figure.kind === 'bars' ? (
          [0.28, 0.46, 0.36, 0.6].map((h, k) => (
            <mesh
              key={k}
              geometry={LINE_GEO}
              material={clayMaterial(SHAPE_COLORS.square)}
              position={[-0.27 + k * 0.18, -0.3 + h / 2, 0.005]}
              scale={[0.11, h, 0.012]}
            />
          ))
        ) : (
          <mesh
            geometry={shapeGeometry(spec.figure.shape)}
            material={clayMaterial(SHAPE_COLORS[spec.figure.shape])}
            scale={[0.26, 0.26, 0.03]}
          />
        )}
      </group>
    </group>
  );
}

/**
 * The publications header prop: a stack of papers that fans out like a hand of cards as you
 * scroll and when you hover it, with Q perched on top watching the pointer. Motion state lives
 * in refs and is read in useFrame, never in React state.
 */
export default function PaperStackScene({ scroll }: PaperStackSceneProps) {
  const { reduced } = useSceneQuality();
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const root = useRef<Group>(null);
  const pivots = useRef<Array<Group | null>>([]);
  const q = useRef<Character3DHandle>(null);
  const sim = useRef({
    fan: reduced ? 0.8 : 0.05,
    hover: 0,
    lift: new Array(N).fill(0) as number[],
    cheered: false,
    t: 0,
  });
  const narrow = size.width / Math.max(1, size.height) < 1;
  const fit = narrow ? 0.92 : 1.12;

  const specs = useMemo(() => SHEETS, []);

  useFrame((_, dt) => {
    const s = sim.current;
    const d = Math.min(dt, 1 / 20);
    s.t += d;
    const rect = gl.domElement.getBoundingClientRect();
    const p = pointer.get();
    const inside =
      p.active &&
      p.type === 'mouse' &&
      p.x >= rect.left &&
      p.x <= rect.right &&
      p.y >= rect.top &&
      p.y <= rect.bottom;
    const lx = rect.width ? ((p.x - rect.left) / rect.width) * 2 - 1 : 0;
    const ly = rect.height ? ((p.y - rect.top) / rect.height) * 2 - 1 : 0;

    s.hover = reduced ? 0 : MathUtils.damp(s.hover, inside ? 1 : 0, 6, d);
    const scrolled = MathUtils.clamp(scroll.current?.p ?? 0, 0, 1);
    const target = reduced ? 0.8 : MathUtils.clamp(0.42 + scrolled * 0.9 + s.hover * 0.5, 0, 1.25);
    s.fan = MathUtils.damp(s.fan, target, 4, d);

    if (!s.cheered && s.fan > 1.0) {
      s.cheered = true;
      q.current?.cheer();
    }
    if (s.fan < 0.5) s.cheered = false;

    const spread = 0.2 * s.fan;
    for (let i = 0; i < N; i++) {
      const g = pivots.current[i];
      if (!g) continue;
      const spec = specs[i]!;
      const k = i - (N - 1) / 2;
      // Which sheet is under the pointer (roughly by angle).
      const aim = inside ? MathUtils.clamp(Math.round(lx * (N / 2) + (N - 1) / 2), 0, N - 1) : -1;
      s.lift[i] = reduced ? 0 : MathUtils.damp(s.lift[i]!, aim === i ? 1 : 0, 8, d);
      const sway = reduced ? 0 : Math.sin(s.t * 0.9 + i * 0.7) * 0.012 * (0.4 + s.fan);
      g.rotation.z = -k * spread + spec.rz * (1 - Math.min(1, s.fan)) + sway;
      g.position.x = spec.dx * (1 - Math.min(1, s.fan)) + k * 0.06 * s.fan;
      g.position.y = s.lift[i]! * 0.34 + Math.abs(k) * -0.04 * s.fan;
      g.position.z = i * (T + 0.02) + s.lift[i]! * 0.12;
    }

    if (root.current) {
      if (reduced) {
        root.current.rotation.set(-0.12, -0.18, 0);
      } else {
        root.current.rotation.y = MathUtils.damp(
          root.current.rotation.y,
          -0.18 + (inside ? lx : p.nx) * 0.22,
          3,
          d,
        );
        root.current.rotation.x = MathUtils.damp(
          root.current.rotation.x,
          -0.12 + (inside ? ly : p.ny) * 0.08,
          3,
          d,
        );
      }
    }
  });

  return (
    <group scale={fit} position={[0, -0.25, 0]}>
      <group ref={root}>
        <group position={[0, -H / 2 - 0.1, 0]}>
          {specs.map((spec, i) => (
            <group key={i} ref={(el) => void (pivots.current[i] = el)}>
              <Sheet spec={spec} />
            </group>
          ))}
        </group>
        <Character3D
          ref={q}
          shape="circle"
          scale={0.36}
          position={[W / 2 - 0.2, H / 2 + 0.05, N * (T + 0.02) + 0.1]}
          seed={2}
          bob={!reduced}
        />
      </group>
    </group>
  );
}
