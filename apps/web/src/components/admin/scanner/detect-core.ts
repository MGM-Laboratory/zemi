/**
 * QR detection engine, shared by the Web Worker and the main-thread fallback.
 *
 * - `native`: the platform BarcodeDetector (Android Chrome, desktop Chrome on macOS/ChromeOS),
 *   used only when it lists `qr_code` in getSupportedFormats().
 * - `zxing`: the `barcode-detector` ponyfill (ZXing C++ in WebAssembly). This is the path on
 *   iOS Safari and Firefox. Its .wasm is fetched from our own origin first
 *   (/admin/scan/zxing-reader.wasm, same version as the JS), with the package's CDN as fallback.
 */
import { prepareVariant, type FrameVariant, type RgbaFrame } from './preprocess';

export type EngineKind = 'native' | 'zxing';
export type EnginePreference = 'auto' | EngineKind;

interface DetectorLike {
  detect(image: ImageData): Promise<Array<{ rawValue: string }>>;
}

interface NativeDetectorCtor {
  new (opts?: { formats?: string[] }): DetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

export interface Engine {
  kind: EngineKind;
  detect(frame: RgbaFrame, variant: FrameVariant): Promise<string[]>;
}

export const WASM_PATH = '/admin/scan/zxing-reader.wasm';

async function nativeEngine(): Promise<Engine | null> {
  const Ctor = (globalThis as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const formats = (await Ctor.getSupportedFormats?.()) ?? [];
    if (!formats.includes('qr_code')) return null;
    const det = new Ctor({ formats: ['qr_code'] });
    return wrap('native', det);
  } catch {
    return null;
  }
}

async function zxingEngine(origin: string): Promise<Engine> {
  const mod = await import('barcode-detector/ponyfill');
  // Self-hosted wasm first (door wifi is flaky, a CDN may be blocked). If our copy is not
  // reachable, leave the package default (jsDelivr) in place.
  try {
    const url = new URL(WASM_PATH, origin);
    url.searchParams.set('v', mod.ZXING_WASM_VERSION);
    const res = await fetch(url.toString(), { credentials: 'same-origin' });
    if (res.ok && (res.headers.get('content-type') ?? '').includes('wasm')) {
      const wasmBinary = await res.arrayBuffer();
      await mod.prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
    }
  } catch {
    /* fall back to the CDN */
  }
  const det = new mod.BarcodeDetector({ formats: ['qr_code'] }) as unknown as DetectorLike;
  return wrap('zxing', det);
}

function wrap(kind: EngineKind, det: DetectorLike): Engine {
  return {
    kind,
    async detect(frame, variant) {
      const prepared = prepareVariant(variant, frame);
      const image = new ImageData(prepared.data as Uint8ClampedArray<ArrayBuffer>, prepared.width, prepared.height);
      const found = await det.detect(image);
      return found.map((b) => b.rawValue).filter((v): v is string => typeof v === 'string' && v.length > 0);
    },
  };
}

/** Pick the engine: native when it can read QR (unless told otherwise), else ZXing. */
export async function createEngine(pref: EnginePreference, origin: string): Promise<Engine> {
  if (pref !== 'zxing') {
    const native = await nativeEngine();
    if (native) return native;
    if (pref === 'native') throw new Error('This browser has no native QR reader.');
  }
  return zxingEngine(origin);
}
