'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export type CameraStatus = 'idle' | 'starting' | 'live' | 'denied' | 'insecure' | 'unavailable' | 'busy' | 'error';

export interface CameraDevice {
  deviceId: string;
  label: string;
  facing: 'user' | 'environment' | null;
}

export interface ZoomRange {
  min: number;
  max: number;
  step: number;
}

/** Image Capture extensions that TS's DOM lib does not type yet. */
interface ExtendedCapabilities extends MediaTrackCapabilities {
  focusMode?: string[];
  exposureMode?: string[];
  whiteBalanceMode?: string[];
  torch?: boolean;
  zoom?: { min: number; max: number; step?: number };
}
interface ExtendedSettings extends MediaTrackSettings {
  zoom?: number;
  torch?: boolean;
}
type Advanced = Record<string, unknown>;

const DEVICE_KEY = 'zemi.scanner.device';

function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string | null) {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

function guessFacing(label: string): CameraDevice['facing'] {
  const l = label.toLowerCase();
  if (/back|rear|environment|belakang|world|trás|arrière/.test(l)) return 'environment';
  if (/front|user|facetime|depan|selfie|integrated|webcam/.test(l)) return 'user';
  return null;
}

async function listCameras(): Promise<CameraDevice[]> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    let n = 0;
    return all
      .filter((d) => d.kind === 'videoinput')
      .map((d) => {
        n += 1;
        const label = d.label || `Camera ${n}`;
        return { deviceId: d.deviceId, label, facing: guessFacing(label) };
      });
  } catch {
    return [];
  }
}

function describeError(err: unknown): { status: CameraStatus; message: string } {
  const name = (err as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return { status: 'denied', message: 'The camera is blocked for this site.' };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return { status: 'unavailable', message: 'We could not find a camera on this device.' };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return { status: 'busy', message: 'Another app is using the camera. Close it and try again.' };
  }
  return { status: 'error', message: 'The camera did not start. Try again, or type codes by hand.' };
}

/**
 * Camera control for the door scanner.
 *
 * Nothing starts on its own: `start()` must be called from a tap. Every stop (leaving the page,
 * hiding the tab, pressing Stop) ends all tracks, so the browser's camera light turns off and
 * the next start asks again where the browser keeps asking.
 *
 * After start it applies the best capture settings the track reports: continuous focus,
 * exposure and white balance, plus torch, zoom and tap-to-focus when supported.
 */
export function useCamera(videoRef: RefObject<HTMLVideoElement | null>) {
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const capsRef = useRef<ExtendedCapabilities>({});
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startSeq = useRef(0);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [facing, setFacing] = useState<CameraDevice['facing']>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torch, setTorchState] = useState(false);
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null);
  const [zoom, setZoomState] = useState<number | null>(null);
  const [focusSupported, setFocusSupported] = useState(false);
  const [resolution, setResolution] = useState<{ width: number; height: number } | null>(null);

  const stop = useCallback(() => {
    startSeq.current += 1; // cancels a start in flight
    if (focusTimer.current) clearTimeout(focusTimer.current);
    streamRef.current?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    streamRef.current = null;
    trackRef.current = null;
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.srcObject = null;
    }
    setTorchState(false);
    setStatus((s) => (s === 'live' || s === 'starting' ? 'idle' : s));
  }, [videoRef]);

  const start = useCallback(
    async (wanted?: string | null) => {
      if (typeof window === 'undefined') return;
      if (!window.isSecureContext) {
        setStatus('insecure');
        setMessage('The camera only works on a secure (https) address.');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unavailable');
        setMessage('This browser cannot use the camera.');
        return;
      }
      stop();
      const seq = ++startSeq.current;
      setStatus('starting');
      setMessage(null);
      const target = wanted === undefined ? readStore(DEVICE_KEY) : wanted;
      const base: MediaTrackConstraints = {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 30 },
      };
      const attempts: MediaTrackConstraints[] = target
        ? [{ ...base, deviceId: { exact: target } }, { ...base, facingMode: { ideal: 'environment' } }]
        : [{ ...base, facingMode: { ideal: 'environment' } }];
      attempts.push({ facingMode: { ideal: 'environment' } }); // last resort: no resolution hints

      let stream: MediaStream | null = null;
      let lastErr: unknown = null;
      for (const video of attempts) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
          break;
        } catch (err) {
          lastErr = err;
          const name = (err as { name?: string }).name;
          // Permission problems will not get better with other constraints.
          if (name === 'NotAllowedError' || name === 'SecurityError') break;
        }
      }
      if (seq !== startSeq.current) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      if (!stream) {
        const d = describeError(lastErr);
        setStatus(d.status);
        setMessage(d.message);
        return;
      }

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0] ?? null;
      trackRef.current = track;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        v.muted = true;
        v.playsInline = true;
        try {
          await v.play();
        } catch {
          /* autoplay quirk: the element still renders frames once it is visible */
        }
      }
      if (seq !== startSeq.current) return;

      if (track) {
        track.onended = () => {
          setStatus('error');
          setMessage('The camera turned off (unplugged, or another app took it).');
        };
        const caps: ExtendedCapabilities = typeof track.getCapabilities === 'function' ? (track.getCapabilities() as ExtendedCapabilities) : {};
        capsRef.current = caps;
        const settings = track.getSettings() as ExtendedSettings;
        // Keep things sharp and balanced in any light.
        const advanced: Advanced[] = [];
        if (caps.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
        if (caps.exposureMode?.includes('continuous')) advanced.push({ exposureMode: 'continuous' });
        if (caps.whiteBalanceMode?.includes('continuous')) advanced.push({ whiteBalanceMode: 'continuous' });
        if (advanced.length) {
          try {
            await track.applyConstraints({ advanced } as MediaTrackConstraints);
          } catch {
            /* best effort */
          }
        }
        setTorchSupported(caps.torch === true);
        setTorchState(Boolean(settings.torch));
        if (caps.zoom && caps.zoom.max > caps.zoom.min) {
          setZoomRange({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1 });
          setZoomState(settings.zoom ?? caps.zoom.min);
        } else {
          setZoomRange(null);
          setZoomState(null);
        }
        const supported = navigator.mediaDevices.getSupportedConstraints() as Record<string, boolean>;
        setFocusSupported(Boolean(supported.pointsOfInterest) && Boolean(caps.focusMode?.length));
        const id = settings.deviceId ?? null;
        setDeviceId(id);
        if (id) writeStore(DEVICE_KEY, id);
        setResolution(settings.width && settings.height ? { width: settings.width, height: settings.height } : null);
        const list = await listCameras();
        setDevices(list);
        const f = (settings.facingMode as CameraDevice['facing'] | undefined) ?? list.find((d) => d.deviceId === id)?.facing ?? null;
        setFacing(f === 'user' || f === 'environment' ? f : null);
      }
      setStatus('live');
    },
    [stop, videoRef],
  );

  const setTorch = useCallback(async (on: boolean) => {
    const track = trackRef.current;
    if (!track) return false;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as Advanced] } as MediaTrackConstraints);
      setTorchState(on);
      return true;
    } catch {
      return false;
    }
  }, []);

  const setZoom = useCallback(async (value: number) => {
    const track = trackRef.current;
    if (!track) return;
    setZoomState(value);
    try {
      await track.applyConstraints({ advanced: [{ zoom: value } as Advanced] } as MediaTrackConstraints);
    } catch {
      /* ignored */
    }
  }, []);

  /** Focus on a point (0..1 of the video frame). Returns false when the camera cannot do it. */
  const focusAt = useCallback(async (x: number, y: number) => {
    const track = trackRef.current;
    const caps = capsRef.current;
    if (!track || !caps.focusMode?.length) return false;
    const mode = caps.focusMode.includes('single-shot') ? 'single-shot' : caps.focusMode.includes('continuous') ? 'continuous' : caps.focusMode[0];
    try {
      await track.applyConstraints({ advanced: [{ pointsOfInterest: [{ x, y }], focusMode: mode } as Advanced] } as MediaTrackConstraints);
    } catch {
      return false;
    }
    if (focusTimer.current) clearTimeout(focusTimer.current);
    if (mode !== 'continuous' && caps.focusMode.includes('continuous')) {
      focusTimer.current = setTimeout(() => {
        void trackRef.current?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as Advanced] } as MediaTrackConstraints).catch(() => undefined);
      }, 3000);
    }
    return true;
  }, []);

  // Leaving the page always turns the camera off.
  useEffect(() => stop, [stop]);

  return {
    status,
    message,
    devices,
    deviceId,
    facing,
    resolution,
    torchSupported,
    torch,
    zoomRange,
    zoom,
    focusSupported,
    start,
    stop,
    setTorch,
    setZoom,
    focusAt,
    forgetDevice: () => writeStore(DEVICE_KEY, null),
  };
}

export type CameraControl = ReturnType<typeof useCamera>;
