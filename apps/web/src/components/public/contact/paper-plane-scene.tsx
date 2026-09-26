'use client';

import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  Box3,
  CanvasTexture,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  type Material,
} from 'three';
import { SHAPE_COLORS } from '@zemi/shared';
import { clayMaterial } from '@/components/three/clay';
import { pointer } from '@/lib/hooks/use-pointer';
import type { PlaneBus } from './plane-bus';

const URL = '/models/paper-plane.glb';

/** Soft round shadow texture (drawn once). */
let shadowTex: CanvasTexture | null = null;
function shadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(14,17,22,0.34)');
  grad.addColorStop(0.55, 'rgba(14,17,22,0.12)');
  grad.addColorStop(1, 'rgba(14,17,22,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  shadowTex = new CanvasTexture(c);
  shadowTex.colorSpace = SRGBColorSpace;
  return shadowTex;
}
const LAUNCH_S = 1.2;
const RETURN_S = 1.05;

export interface PaperPlaneSceneProps {
  bus: PlaneBus;
  /** Plane length in CSS px at rest. */
  sizePx: number;
}

/** Cubic Bezier in 2D. */
function bez(t: number, a: number, b: number, c: number, d: number) {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}
function bezD(t: number, a: number, b: number, c: number, d: number) {
  const u = 1 - t;
  return 3 * u * u * (b - a) + 6 * u * t * (c - b) + 3 * t * t * (d - c);
}
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t: number) => {
  const c1 = 1.5;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/**
 * The paper plane (paper-plane.glb, nose +X) perched on the form. It glances at the cursor and
 * the focused field, bobs, rolls when the form turns valid, winds up and flies off on submit,
 * and swoops back in after an error or for "send another". Screen space drives everything: the
 * dock element's rect is read each frame and mapped onto the z = 0 plane.
 */
export default function PaperPlaneScene({ bus, sizePx }: PaperPlaneSceneProps) {
  const { scene } = useGLTF(URL, true, true);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const viewport = useThree((s) => s.viewport);

  const root = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const shadowMat = useMemo(
    () => new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, depthTest: false }),
    [],
  );
  const shadowGeo = useMemo(() => new PlaneGeometry(1, 0.34), []);
  const heading = useRef<Group>(null);
  const yaw = useRef<Group>(null);
  const bank = useRef<Group>(null);

  // Centered clone scaled to 1 world unit long, so sizePx maps cleanly.
  const model = useMemo(() => {
    const clone = scene.clone(true);
    // Paper on a white page needs help to read: warm off-white clay (and a soft shadow below).
    clone.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const name = ((Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Material | undefined)?.name ?? '';
      if (name.includes('blue')) mesh.material = clayMaterial(SHAPE_COLORS.circle);
      else if (name.includes('red')) mesh.material = clayMaterial(SHAPE_COLORS.triangle);
      else {
        mesh.material = clayMaterial('#f2f0ea', { roughness: 0.6, clearcoat: 0.15, sheen: 0.1 });
      }
    });
    const box = new Box3().setFromObject(clone);
    const dims = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    clone.position.sub(center);
    const wrap = new Group();
    wrap.add(clone);
    wrap.scale.setScalar(1 / Math.max(dims.x, 1e-6));
    return wrap;
  }, [scene]);

  const sim = useRef({
    x: 0,
    y: 0,
    theta: 0.12,
    yaw: -0.4,
    bank: 0.55,
    scale: 1,
    has: false,
    lastPx: -1,
    lastPy: -1,
    lastMove: 0,
    /** bus.since of the launch the path was built for. */
    pathFor: -1,
    // launch path in canvas px
    path: null as null | { ax: number; ay: number; bx: number; by: number; cx: number; cy: number; dx: number; dy: number },
  });

  useEffect(() => {
    bus.setLive(true);
    return () => bus.setLive(false);
  }, [bus]);

  useFrame((state, delta) => {
    const g = root.current;
    const hG = heading.current;
    const yG = yaw.current;
    const bG = bank.current;
    if (!g || !hG || !yG || !bG) return;
    const s = sim.current;
    const dt = Math.min(delta, 1 / 20);
    const t = state.clock.elapsedTime;
    const rect = gl.domElement.getBoundingClientRect();
    const k = viewport.width / Math.max(1, size.width); // world units per css px

    // Dock center in canvas px.
    const dock = bus.dock?.getBoundingClientRect();
    const dx0 = dock ? dock.left + dock.width / 2 - rect.left : size.width * 0.75;
    const dy0 = dock ? dock.top + dock.height / 2 - rect.top : size.height * 0.3;

    // Pointer, in canvas px; remember when it last moved.
    const p = pointer.get();
    const now = performance.now();
    const live = p.active && p.type !== 'touch';
    if (live && (p.x !== s.lastPx || p.y !== s.lastPy)) {
      s.lastPx = p.x;
      s.lastPy = p.y;
      s.lastMove = now;
    }
    let tx = dx0;
    let ty = dy0;
    let aimX = 0;
    let aimY = 0;
    const focus = bus.focus?.getBoundingClientRect();
    if (focus && (!live || now - s.lastMove > 1400)) {
      aimX = focus.left + Math.min(focus.width, 240) / 2 - rect.left - dx0;
      aimY = focus.top + focus.height / 2 - rect.top - dy0;
    } else if (live) {
      aimX = p.x - rect.left - dx0;
      aimY = p.y - rect.top - dy0;
    }
    const aimD = Math.hypot(aimX, aimY) || 1;

    const elapsed = (now - bus.since) / 1000;
    let theta = 0.12;
    let yawA = -0.4;
    let bankA = 0.55;
    let visible = true;

    if (bus.mode === 'dock') {
      // Subtle follow: drift up to ~22px toward the cursor, nose tilts toward it.
      const pull = Math.min(aimD * 0.06, 22);
      tx = dx0 + (aimX / aimD) * pull;
      ty = dy0 + (aimY / aimD) * pull + Math.sin(t * 1.7) * 3.5;
      theta = 0.12 + MathUtils.clamp(-aimY / 700, -0.32, 0.32);
      yawA = -0.4 + MathUtils.clamp(aimX / 1400, -0.35, 0.35);
      bankA = 0.55 + Math.sin(t * 1.1) * 0.07;
      // Happy barrel roll.
      const rollT = (now - bus.rollAt) / 1000;
      if (bus.rollAt > 0 && rollT >= 0 && rollT < 0.9) bankA += easeInOut(rollT / 0.9) * Math.PI * 2;
      const kk = 1 - Math.exp(-7 * dt);
      s.x = s.has ? s.x + (tx - s.x) * kk : tx;
      s.y = s.has ? s.y + (ty - s.y) * kk : ty;
      s.has = true;
      s.theta = MathUtils.damp(s.theta, theta, 6, dt);
      s.yaw = MathUtils.damp(s.yaw, yawA, 6, dt);
      s.bank = bankA; // rolls are authored, not damped
      s.scale = MathUtils.damp(s.scale, 1, 8, dt);
    } else if (bus.mode === 'launch') {
      if (!s.path || s.pathFor !== bus.since) {
        s.pathFor = bus.since;
        const w = size.width;
        const h = size.height;
        s.path = {
          ax: s.x,
          ay: s.y,
          bx: s.x + Math.min(160, w * 0.12),
          by: s.y + 60,
          cx: s.x + Math.max(w * 0.3, 260),
          cy: s.y - h * 0.25,
          dx: w + 260,
          dy: Math.min(s.y - h * 0.6, -120),
        };
      }
      const P = s.path;
      const u = Math.min(1, elapsed / LAUNCH_S);
      // Wind-up: pull back and point the nose up before the throw.
      const windup = Math.min(1, u / 0.2);
      if (u < 0.2) {
        const e = Math.sin(windup * Math.PI * 0.5);
        s.x = P.ax - 24 * e;
        s.y = P.ay + 10 * e;
        s.theta = 0.12 + 0.45 * e;
        s.yaw = -0.4;
        s.bank = 0.55 - 0.2 * e;
        s.scale = 1 - 0.06 * e;
      } else {
        const f = easeInOut((u - 0.2) / 0.8);
        const x = bez(f, P.ax - 24, P.bx, P.cx, P.dx);
        const y = bez(f, P.ay + 10, P.by, P.cy, P.dy);
        const vx = bezD(f, P.ax - 24, P.bx, P.cx, P.dx);
        const vy = bezD(f, P.ay + 10, P.by, P.cy, P.dy);
        s.x = x;
        s.y = y;
        s.theta = Math.atan2(-vy, vx);
        s.yaw = -0.4 + f * 0.25;
        s.bank = 0.35 + Math.sin(f * Math.PI) * 1.1;
        s.scale = 1 + Math.sin(f * Math.PI) * 0.55;
      }
      if (u >= 1) {
        s.path = null;
        bus.landed();
      }
    } else if (bus.mode === 'gone') {
      visible = false;
    } else if (bus.mode === 'return') {
      const u = Math.min(1, elapsed / RETURN_S);
      const fromX = -180;
      const fromY = dy0 + Math.min(220, size.height * 0.25);
      const e = easeOutBack(u);
      // Swoop in on a low arc.
      s.x = fromX + (dx0 - fromX) * e;
      s.y = fromY + (dy0 - fromY) * Math.min(1, e) - Math.sin(u * Math.PI) * 60;
      s.theta = 0.12 + (1 - u) * 0.6 + Math.sin(u * Math.PI * 3) * 0.12 * (1 - u);
      s.yaw = -0.4;
      s.bank = 0.55 + Math.sin(u * Math.PI * 2.5) * 0.6 * (1 - u);
      s.scale = 1;
      s.has = true;
      if (u >= 1) bus.docked();
    }

    g.visible = visible;
    // A soft shadow on the card under the perched plane; it stays behind when the plane flies.
    const sh = shadow.current;
    if (sh) {
      const lift = Math.hypot(s.x - dx0, s.y - dy0);
      const o = bus.mode === 'dock' || bus.mode === 'return' ? Math.max(0, 1 - lift / 90) : Math.max(0, 1 - elapsed * 4);
      sh.visible = o > 0.01;
      (sh.material as MeshBasicMaterial).opacity = o * 0.85;
      sh.position.set((dx0 + 4 - size.width / 2) * k, -(dy0 + sizePx * 0.24 - size.height / 2) * k, 0);
      const sc = sizePx * k * (1.05 - Math.min(0.3, Math.abs(s.y - dy0) / 60));
      sh.scale.set(sc, sc, 1);
    }
    const px = s.x;
    const py = s.y;
    g.position.set((px - size.width / 2) * k, -(py - size.height / 2) * k, 0);
    g.scale.setScalar(sizePx * k * s.scale);
    hG.rotation.z = s.theta;
    yG.rotation.y = s.yaw;
    bG.rotation.x = s.bank;
  });

  return (
    <>
      <mesh ref={shadow} geometry={shadowGeo} material={shadowMat} renderOrder={-1} />
      <group ref={root}>
        <group ref={heading}>
          <group ref={yaw}>
            <group ref={bank}>
              <primitive object={model} />
            </group>
          </group>
        </group>
      </group>
    </>
  );
}

useGLTF.preload(URL, true, true);
