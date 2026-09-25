'use client';

import { useState } from 'react';
import { SHAPE_ORDER } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { Character3D, DistortImage, Fit, ModelProp, SceneCanvas, ShaderBackdrop } from '@/components/three';
import { ZemiImage } from '@/components/public/media/zemi-image';
import { Button } from '@/components/public/ui/button';
import { cupImage, laptopImage } from './fixtures';

function Fallback2D() {
  return (
    <div className="flex items-end justify-center gap-4">
      {SHAPE_ORDER.map((s, i) => (
        <Character key={s} shape={s} size={88} seed={i} />
      ))}
    </div>
  );
}

/** All four clay characters share one canvas (browsers cap WebGL contexts). */
export function ThreeCharactersDemo() {
  const [cheer, setCheer] = useState(0);
  const [mood, setMood] = useState<'idle' | 'happy' | 'sleepy' | 'surprised'>('idle');
  return (
    <div className="flex flex-col gap-4">
      <SceneCanvas
        className="h-[clamp(320px,52vw,560px)] overflow-hidden rounded-[28px] border border-line bg-white"
        camera={{ position: [0, 0.3, 14], fov: 21 }}
        fallback={<Fallback2D />}
        label="The four Zemi characters in clay: Q, Hunch, Block and Bridge"
      >
        <Fit width={11.4}>
          {SHAPE_ORDER.map((s, i) => (
            <Character3D key={s} shape={s} position={[-3.9 + i * 2.6, 0, 0]} seed={i} cheer={cheer} mood={mood} />
          ))}
          <ModelProp name="coffee-cup" size={0.9} position={[3.7, -1.2, 1.6]} rotation={[0, -0.5, 0]} />
          <ModelProp name="paper-stack" size={1.2} position={[-3.8, -1.2, 1.4]} rotation={[0, 0.4, 0]} />
        </Fit>
      </SceneCanvas>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" shape="triangle" onClick={() => setCheer((c) => c + 1)}>
          Cheer
        </Button>
        {(['idle', 'happy', 'sleepy', 'surprised'] as const).map((m) => (
          <Button key={m} size="sm" variant={mood === m ? 'primary' : 'secondary'} shape={false} onClick={() => setMood(m)}>
            {m}
          </Button>
        ))}
        <p className="text-[0.9375rem] text-ink-3">Click a character to squash it.</p>
      </div>
    </div>
  );
}

export function PropsDemo({ models }: { models: string[] }) {
  const names = models.length ? models : ['coffee-cup', 'microphone', 'wall-clock', 'stool'];
  return (
    <SceneCanvas
      className="h-[clamp(260px,34vw,420px)] overflow-hidden rounded-[28px] border border-line bg-surface-muted"
      camera={{ position: [0, 1.2, 11], fov: 30 }}
      studio={{ floor: -1.2, shadowOpacity: 0.28 }}
      fallback={<p className="p-6 text-ink-3">No WebGL here, so the props stay in Blender.</p>}
      placeholder={null}
      label="Clay props from the Blender kit"
    >
      <Fit width={Math.min(names.length, 9) * 1.75 + 0.5}>
        {names.slice(0, 9).map((n, i, arr) => (
          <ModelProp key={n} name={n} size={1.3} position={[(i - (arr.length - 1) / 2) * 1.75, -1.2, 0]} rotation={[0, -0.35, 0]} />
        ))}
      </Fit>
    </SceneCanvas>
  );
}

export function BackdropDemo() {
  return (
    <div className="relative isolate grid min-h-[320px] place-items-center overflow-hidden rounded-[28px] border border-line">
      <ShaderBackdrop className="absolute inset-0 -z-10 size-full" />
      <p className="display text-display-m max-w-[14ch] text-center">Soft blobs, a little grain.</p>
    </div>
  );
}

export function DistortDemo() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:max-w-xl">
      <DistortImage className="overflow-hidden rounded-[24px]">
        <ZemiImage image={cupImage} aspect="4/5" sizes="300px" />
      </DistortImage>
      <DistortImage className="overflow-hidden rounded-[24px]" strength={34}>
        <ZemiImage image={laptopImage} aspect="4/5" sizes="300px" />
      </DistortImage>
    </div>
  );
}
