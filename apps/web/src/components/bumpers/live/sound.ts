'use client';

import { BUMPER_TRANSITION_META, bumperHash, type BumperTransitionKey, type BumperTransitionMood } from '@zemi/shared';
import { useCallback, useEffect, useState } from 'react';
import type { TransitionEvent } from '../transitions/director';

/**
 * Soft synthesized stings for transitions (theme.sound). No samples: a few oscillators through a
 * gentle filter and compressor, quiet by default, one short motif per mood (playful plucks, a
 * grand swell, a calm bell, a snappy tick) and a small pitch shift per transition so each one
 * has its own little voice. Browsers only allow audio after a gesture, so the player starts
 * it on the first click or key; OBS lets browser sources play right away ("Control audio via
 * OBS" routes it into the mixer). Every call is safe when Web Audio is missing or blocked.
 */

type AudioCtor = typeof AudioContext;

function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** C major pentatonic from C4, in Hz. */
const PENTA = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];

export class StingPlayer {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = 0;

  /** Create or resume the audio context. Call from a user gesture (or anywhere in OBS). */
  unlock(): void {
    const Ctor = audioCtor();
    if (!Ctor) return;
    try {
      if (!this.ctx) {
        const ctx = new Ctor();
        const master = ctx.createGain();
        master.gain.value = 0.16;
        const tone = ctx.createBiquadFilter();
        tone.type = 'lowpass';
        tone.frequency.value = 5200;
        tone.Q.value = 0.4;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -20;
        comp.ratio.value = 3;
        master.connect(tone).connect(comp).connect(ctx.destination);
        this.ctx = ctx;
        this.out = master;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    } catch {
      this.ctx = null;
      this.out = null;
    }
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  play(key: BumperTransitionKey): void {
    const ctx = this.ctx;
    const out = this.out;
    if (!ctx || !out || ctx.state !== 'running' || key === 'cut') return;
    const now = ctx.currentTime;
    // Rapid presses converge on the newest bumper: one sting, not a pile-up.
    if (now - this.last < 0.18) return;
    this.last = now;
    const mood: BumperTransitionMood = BUMPER_TRANSITION_META[key]?.mood ?? 'calm';
    const shift = bumperHash(key) % 3;
    try {
      if (mood === 'playful') this.playful(ctx, out, now, shift);
      else if (mood === 'grand') this.grand(ctx, out, now, shift);
      else if (mood === 'snappy') this.snappy(ctx, out, now, shift);
      else this.calm(ctx, out, now, shift);
    } catch {
      /* a sting is never worth an error */
    }
  }

  dispose(): void {
    const ctx = this.ctx;
    this.ctx = null;
    this.out = null;
    if (ctx) void ctx.close().catch(() => undefined);
  }

  /** One enveloped oscillator. */
  private voice(ctx: AudioContext, out: AudioNode, { type, freq, at, attack, decay, gain, glideTo, detune = 0 }: { type: OscillatorType; freq: number; at: number; attack: number; decay: number; gain: number; glideTo?: number; detune?: number }) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, at + attack + decay * 0.5);
    osc.detune.value = detune;
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    osc.connect(env).connect(out);
    osc.start(at);
    osc.stop(at + attack + decay + 0.05);
  }

  /** Three quick rising plucks, like the characters hopping in. */
  private playful(ctx: AudioContext, out: AudioNode, t: number, shift: number) {
    const notes = [PENTA[5 + shift]!, PENTA[7 + shift]!, PENTA[9 + shift]!];
    notes.forEach((f, i) => {
      this.voice(ctx, out, { type: 'triangle', freq: f, at: t + i * 0.085, attack: 0.008, decay: 0.28, gain: i === 2 ? 0.5 : 0.7 });
      this.voice(ctx, out, { type: 'sine', freq: f * 2, at: t + i * 0.085, attack: 0.004, decay: 0.12, gain: 0.12 });
    });
  }

  /** A slow, warm chord swell with a little shimmer on top. */
  private grand(ctx: AudioContext, out: AudioNode, t: number, shift: number) {
    const root = PENTA[shift]!;
    [root, root * 1.5, root * 2.5].forEach((f, i) => {
      this.voice(ctx, out, { type: 'sine', freq: f, at: t, attack: 0.32, decay: 1.5, gain: 0.34 - i * 0.07, detune: i % 2 ? 5 : -5 });
      this.voice(ctx, out, { type: 'triangle', freq: f, at: t + 0.02, attack: 0.36, decay: 1.3, gain: 0.12, detune: i % 2 ? -7 : 7 });
    });
    this.voice(ctx, out, { type: 'sine', freq: PENTA[10 + shift]!, at: t + 0.28, attack: 0.2, decay: 1.1, gain: 0.08 });
  }

  /** One soft bell. */
  private calm(ctx: AudioContext, out: AudioNode, t: number, shift: number) {
    const f = PENTA[7 + shift]!;
    this.voice(ctx, out, { type: 'sine', freq: f, at: t, attack: 0.012, decay: 1.3, gain: 0.42 });
    this.voice(ctx, out, { type: 'sine', freq: f * 2.76, at: t, attack: 0.006, decay: 0.5, gain: 0.07 });
  }

  /** A woodblock tick and a quick blip. */
  private snappy(ctx: AudioContext, out: AudioNode, t: number, shift: number) {
    if (!this.noise) {
      const len = Math.floor(ctx.sampleRate * 0.05);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
      this.noise = buf;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1800 + shift * 300;
    band.Q.value = 6;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.9, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(band).connect(env).connect(out);
    src.start(t);
    src.stop(t + 0.06);
    this.voice(ctx, out, { type: 'square', freq: PENTA[8 + shift]!, at: t + 0.03, attack: 0.004, decay: 0.09, gain: 0.08, glideTo: PENTA[10 + shift]! });
    this.voice(ctx, out, { type: 'sine', freq: PENTA[10 + shift]!, at: t + 0.03, attack: 0.004, decay: 0.14, gain: 0.3 });
  }
}

/**
 * Stings for a director: returns its `onTransition` handler. Off (and no audio context at all)
 * unless `enabled`. With `unlockOn: 'gesture'` the context waits for the first pointer or key
 * press; `'obs'` starts straight away inside OBS (browser sources may play without a gesture)
 * and falls back to the first gesture anywhere else.
 */
export function useStings(enabled: boolean, unlockOn: 'gesture' | 'obs' = 'gesture'): (e: TransitionEvent) => void {
  const [player] = useState(() => new StingPlayer());

  useEffect(() => {
    if (!enabled) return;
    if (unlockOn === 'obs' && 'obsstudio' in window) player.unlock();
    const unlock = () => player.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true });
      window.removeEventListener('keydown', unlock, { capture: true });
    };
  }, [enabled, unlockOn, player]);

  useEffect(() => () => player.dispose(), [player]);

  return useCallback(
    (e: TransitionEvent) => {
      if (enabled && e.phase === 'start') player.play(e.key);
    },
    [enabled, player],
  );
}
