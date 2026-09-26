'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, type RefObject } from 'react';
import { Color, DoubleSide, MathUtils, ShaderMaterial, type Group } from 'three';
import { Character3D } from '@/components/three/character-3d';
import { ModelProp } from '@/components/three/model-prop';
import { useSceneQuality } from '@/components/three/scene-context';
import { pointer } from '@/lib/hooks/use-pointer';

export interface CoffeeSceneProps {
  models: string[];
  /** Bumped by the section on every clink; the cup hops and the steam puffs. */
  clinks: number;
  onClink?: () => void;
}

const CUP = 2.3; // cup width in world units
const CUP_H = CUP * (0.093 / 0.155);

const steamVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const steamFrag = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uPuff;
  uniform vec3 uColor;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * (0.35 + uPuff * 0.4);
    float wig = sin(uv.y * 5.5 - t * 3.2 + uSeed * 6.0) * 0.13 * uv.y
      + (noise(vec2(uv.y * 2.6 - t * 1.4, uSeed * 9.0)) - 0.5) * 0.36 * uv.y;
    float d = abs(uv.x - 0.5 - wig);
    float width = mix(0.05, 0.2, uv.y) * (1.0 + uPuff * 0.6);
    float a = smoothstep(width, 0.0, d);
    a *= smoothstep(0.0, 0.18, uv.y) * smoothstep(1.0, 0.45 + uPuff * 0.2, uv.y);
    a *= 0.45 + 0.55 * noise(vec2(uv.x * 5.0 + uSeed, uv.y * 4.0 - t * 2.2));
    gl_FragColor = vec4(uColor, min(1.0, a * (0.95 + uPuff * 0.4)));
  }
`;

function Steam({ seed, x, puff }: { seed: number; x: number; puff: RefObject<number> }) {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: steamVert,
        fragmentShader: steamFrag,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uSeed: { value: seed },
          uPuff: { value: 0 },
          uColor: { value: new Color('#fbfcfe') },
        },
      }),
    [seed],
  );
  useFrame((state) => {
    mat.uniforms.uTime!.value = state.clock.elapsedTime + seed * 3;
    mat.uniforms.uPuff!.value = puff.current ?? 0;
  });
  return (
    <mesh position={[x, CUP_H + 1.45, 0.1]} material={mat}>
      <planeGeometry args={[1.3, 2.9]} />
    </mesh>
  );
}

/**
 * 14:50, coffee. The clay cup, steaming, tilting toward the pointer. Click it to clink: it hops,
 * the steam puffs, and Block (who is always near the coffee) cheers.
 */
export default function CoffeeScene({ models, clinks, onClink }: CoffeeSceneProps) {
  const { reduced } = useSceneQuality();
  const gl = useThree((s) => s.gl);
  const cup = useRef<Group>(null);
  const hop = useRef({ y: 0, v: 0, sq: 1, sv: 0 });
  const puff = useRef(0);
  const seen = useRef(clinks);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const g = cup.current;
    if (!g) return;
    if (clinks !== seen.current) {
      seen.current = clinks;
      hop.current.v = reduced ? 0 : 5.5;
      hop.current.sq = 0.82;
      puff.current = 1;
    }
    const h = hop.current;
    h.v -= 22 * dt;
    h.y = Math.max(0, h.y + h.v * dt);
    if (h.y === 0 && h.v < 0) h.v = 0;
    h.sv += (-160 * (h.sq - 1) - 10 * h.sv) * dt;
    h.sq += h.sv * dt;
    puff.current = Math.max(0, puff.current - dt * 0.6);

    const p = pointer.get();
    const r = gl.domElement.getBoundingClientRect();
    const live = p.active && p.type !== 'touch' && !reduced;
    const nx = live
      ? MathUtils.clamp((p.x - (r.left + r.width / 2)) / (window.innerWidth / 2), -1, 1)
      : 0;
    const ny = live
      ? MathUtils.clamp((p.y - (r.top + r.height / 2)) / (window.innerHeight / 2), -1, 1)
      : 0;
    const t = state.clock.elapsedTime;
    g.rotation.y = MathUtils.damp(
      g.rotation.y,
      -0.5 + nx * 0.5 + (reduced ? 0 : Math.sin(t * 0.4) * 0.12),
      3,
      dt,
    );
    g.rotation.x = MathUtils.damp(g.rotation.x, 0.18 + ny * 0.18, 3, dt);
    g.position.y = h.y;
    const sq = MathUtils.clamp(h.sq, 0.7, 1.3);
    g.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  });

  return (
    <group position={[0.2, -1.6, 0]}>
      <group
        ref={cup}
        onClick={(e) => {
          e.stopPropagation();
          onClink?.();
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <ModelProp name="coffee-cup" size={CUP} available={models.includes('coffee-cup')} />
        {reduced ? null : (
          <>
            <Steam seed={0.2} x={-0.25} puff={puff} />
            <Steam seed={1.7} x={0.25} puff={puff} />
            <Steam seed={3.1} x={0.02} puff={puff} />
          </>
        )}
      </group>
      <Character3D
        shape="square"
        position={[-1.75, 0.62, -1.7]}
        scale={0.62}
        seed={4}
        cheer={clinks}
      />
    </group>
  );
}
