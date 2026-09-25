'use client';

import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import { useSceneQuality } from './scene-context';

export interface StudioLightsProps {
  /** Soft contact shadow on an invisible floor. Default true. */
  shadows?: boolean;
  /** Floor height for the contact shadow. Default -1.2 (just under a character at y=0). */
  floor?: number;
  shadowOpacity?: number;
  shadowScale?: number;
  /** Re-render the shadow every frame (moving characters). Default true. */
  liveShadows?: boolean;
  /** Overall light multiplier. Default 1. */
  intensity?: number;
}

/**
 * Soft studio lighting for clay on white (DESIGN.md section 9): an Environment built from
 * Lightformers (no HDR download), a warm key, a cool fill, plus ContactShadows.
 */
export function StudioLights({
  shadows = true,
  floor = -1.2,
  shadowOpacity = 0.32,
  shadowScale = 12,
  liveShadows = true,
  intensity = 1,
}: StudioLightsProps) {
  const { quality, reduced } = useSceneQuality();
  return (
    <>
      <ambientLight intensity={1.05 * intensity} />
      <directionalLight position={[3, 5, 6]} intensity={1.5 * intensity} color="#fff8ef" />
      <directionalLight position={[-5, 2, 4]} intensity={0.6 * intensity} color="#eef3ff" />
      <Environment resolution={quality === 'high' ? 256 : 64} frames={1}>
        <group rotation={[-Math.PI / 3, 0, 0]}>
          <Lightformer form="rect" intensity={3 * intensity} position={[0, 5, -6]} scale={[10, 4, 1]} />
          <Lightformer form="circle" intensity={2 * intensity} position={[-6, 1, 1]} rotation={[0, Math.PI / 2, 0]} scale={4} />
          <Lightformer form="rect" intensity={1.4 * intensity} position={[6, 1, 0]} rotation={[0, -Math.PI / 2, 0]} scale={[12, 3, 1]} color="#eef3ff" />
          <Lightformer form="ring" intensity={0.9 * intensity} position={[0, -4, 4]} rotation={[Math.PI / 2, 0, 0]} scale={6} color="#fff4e2" />
        </group>
      </Environment>
      {shadows && quality === 'high' ? (
        <ContactShadows
          position={[0, floor, 0]}
          opacity={shadowOpacity}
          scale={shadowScale}
          blur={2.6}
          far={4}
          resolution={512}
          color="#0e1116"
          frames={liveShadows && !reduced ? Infinity : 1}
        />
      ) : null}
    </>
  );
}
