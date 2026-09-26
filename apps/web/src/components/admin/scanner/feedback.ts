'use client';

/**
 * Door feedback: WebAudio blips (one voice per outcome, no audio files to load) and haptics.
 * The AudioContext must be created or resumed inside a user gesture (the "Enable camera" tap),
 * or iOS Safari keeps it silent.
 */

export type Tone = 'ok' | 'already' | 'bad' | 'tick';

let ctx: AudioContext | null = null;

/** Call from a click/tap handler. Safe to call many times. */
export function unlockAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    // A silent blip fully unlocks iOS output.
    const g = ctx.createGain();
    g.gain.value = 0;
    const o = ctx.createOscillator();
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.01);
  } catch {
    /* no audio, no problem */
  }
}

function blip(freq: number, start: number, dur: number, type: OscillatorType, peak = 0.18, glideTo?: number) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

/** Play the sound for an outcome. */
export function playTone(tone: Tone) {
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const t = ctx.currentTime + 0.01;
  switch (tone) {
    case 'ok': // bright rising pair
      blip(880, t, 0.09, 'sine', 0.22);
      blip(1318.5, t + 0.085, 0.16, 'sine', 0.22);
      break;
    case 'already': // two soft same-pitch taps
      blip(659.3, t, 0.08, 'triangle', 0.2);
      blip(659.3, t + 0.14, 0.1, 'triangle', 0.2);
      break;
    case 'bad': // low falling buzz
      blip(233, t, 0.32, 'square', 0.09, 150);
      break;
    case 'tick':
      blip(1760, t, 0.03, 'sine', 0.06);
      break;
  }
}

/** Vibrate where supported (Android). iOS Safari has no Vibration API. */
export function buzz(tone: Tone) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  const pattern = tone === 'ok' ? [35] : tone === 'already' ? [25, 70, 25] : tone === 'bad' ? [110, 60, 110] : [8];
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignored */
  }
}

/**
 * A short label for this device, sent with every scan so the live board can say who scanned
 * from where. The door crew can override it ("Door A phone"). Max 80 chars (API limit).
 */
export function defaultDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Scanner';
  const ua = navigator.userAgent;
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  const platform = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua) || touchMac
      ? 'iPad'
      : /Android/.test(ua)
        ? /Mobile/.test(ua)
          ? 'Android phone'
          : 'Android tablet'
        : /Macintosh|Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows laptop'
            : /CrOS/.test(ua)
              ? 'Chromebook'
              : /Linux/.test(ua)
                ? 'Linux laptop'
                : 'Device';
  const browser = /EdgA?\//.test(ua)
    ? 'Edge'
    : /SamsungBrowser/.test(ua)
      ? 'Samsung Internet'
      : /Firefox|FxiOS/.test(ua)
        ? 'Firefox'
        : /CriOS|Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  return browser ? `${platform}, ${browser}` : platform;
}

export function deviceLabel(custom: string | null | undefined): string {
  const base = defaultDeviceLabel();
  const name = (custom ?? '').trim();
  const label = name ? `${name} (${base})` : `Scanner on ${base}`;
  return label.slice(0, 80);
}
