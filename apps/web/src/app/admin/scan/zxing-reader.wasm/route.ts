import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Serves the ZXing reader WebAssembly (used by the QR scanner on browsers without a native
 * BarcodeDetector, like iOS Safari) from our own origin, so door scanning does not depend on a
 * CDN. It is the exact file shipped with the installed `zxing-wasm`, so the JS glue and the
 * binary always match. `?v=<zxing-wasm version>` makes the response immutable.
 *
 * Not secret (it is an open-source library), so it needs no session. The /admin proxy skips
 * paths with a file extension anyway.
 */
export const runtime = 'nodejs';

let cached: { bytes: Buffer; version: string } | null = null;

async function load() {
  if (cached) return cached;
  const req = createRequire(path.join(process.cwd(), 'package.json'));
  const detector = req.resolve('barcode-detector');
  const fromDetector = createRequire(detector);
  const wasmPath = fromDetector.resolve('zxing-wasm/reader/zxing_reader.wasm');
  const pkgPath = path.join(path.dirname(wasmPath), '..', '..', 'package.json');
  const [bytes, pkgRaw] = await Promise.all([readFile(wasmPath), readFile(pkgPath, 'utf8').catch(() => '{}')]);
  const version = (JSON.parse(pkgRaw) as { version?: string }).version ?? 'unknown';
  cached = { bytes, version };
  return cached;
}

export async function GET(request: Request) {
  try {
    const { bytes, version } = await load();
    const asked = new URL(request.url).searchParams.get('v');
    const immutable = asked !== null && asked === version;
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/wasm',
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
        ETag: `"zxing-reader-${version}"`,
        'X-Zxing-Wasm-Version': version,
      },
    });
  } catch {
    return new Response('QR reader not available', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
}
