import { CSRF_HEADER, type Adjust, type Asset, type AssetPurpose, type Crop } from '@zemi/shared';
import { ApiError, adminFetch, apiErrorFromBody, apiPath, isAbortError, redirectToLogin } from './api';

export type UploadPhase = 'uploading' | 'processing' | 'ready' | 'failed';

/**
 * May this admin change the file itself (alt and caption, re-crop, the private original, delete)?
 * The API sends `Asset.canEdit` (the uploader, media librarians and the superadmin). Older
 * payloads without the field count as yes, so nothing disappears before the API ships it; the
 * server still refuses with a clear 403 either way.
 */
export function canEditAsset(asset: Pick<Asset, 'id'> | null | undefined): boolean {
  if (!asset) return false;
  return (asset as { canEdit?: boolean }).canEdit !== false;
}

export interface UploadProgress {
  phase: UploadPhase;
  /** Bytes sent so far (uploading phase). */
  loaded: number;
  total: number;
  /** 0 to 1 while uploading, null while processing (indeterminate). */
  fraction: number | null;
  asset?: Asset;
}

export interface UploadAssetOptions {
  purpose: AssetPurpose;
  /** Crop in ORIGINAL image pixels, see docs/foundation/web-admin.md "Crop contract". */
  crop?: Crop | null;
  adjust?: Adjust | null;
  alt?: string | null;
  caption?: string | null;
  credit?: string | null;
  signal?: AbortSignal;
  /** Poll until the asset is ready or failed. Default true. */
  wait?: boolean;
  /** Poll interval while processing. Default 1200ms, backs off to 4s. */
  pollIntervalMs?: number;
  /** Give up polling after this long. Default 10 minutes (videos take a while). */
  pollTimeoutMs?: number;
}

/**
 * Upload a file to POST /api/v1/admin/assets (multipart) with progress, then poll
 * GET /api/v1/admin/assets/:id until it is `ready` (resolves) or `failed` (throws ApiError 'asset_failed').
 *
 * @example
 * const asset = await uploadAsset(file, { purpose: 'event-cover', crop, adjust }, (p) => setProgress(p));
 */
export async function uploadAsset(
  file: File | Blob,
  opts: UploadAssetOptions,
  onProgress?: (p: UploadProgress) => void,
): Promise<Asset> {
  const form = new FormData();
  form.append('purpose', opts.purpose);
  if (opts.crop) form.append('crop', JSON.stringify(opts.crop));
  if (opts.adjust) form.append('adjust', JSON.stringify(opts.adjust));
  if (opts.alt) form.append('alt', opts.alt);
  if (opts.caption) form.append('caption', opts.caption);
  if (opts.credit) form.append('credit', opts.credit);
  // The file goes last so the server can read the text fields before streaming the body.
  form.append('file', file, file instanceof File ? file.name : 'upload');

  const created = await xhrUpload(apiPath('/admin/assets'), form, opts.signal, (loaded, total) =>
    onProgress?.({ phase: 'uploading', loaded, total, fraction: total ? loaded / total : null }),
  );

  if (opts.wait === false || created.status !== 'processing') {
    return finish(created, onProgress);
  }
  onProgress?.({ phase: 'processing', loaded: file.size, total: file.size, fraction: null, asset: created });
  const ready = await waitForAsset(created.id, {
    signal: opts.signal,
    intervalMs: opts.pollIntervalMs,
    timeoutMs: opts.pollTimeoutMs,
  });
  return finish(ready, onProgress);
}

function finish(asset: Asset, onProgress?: (p: UploadProgress) => void): Asset {
  if (asset.status === 'failed') {
    onProgress?.({ phase: 'failed', loaded: 0, total: 0, fraction: null, asset });
    throw new ApiError({
      status: 422,
      code: 'asset_failed',
      message: asset.error || "We couldn't process that file. Try a different one?",
      details: { assetId: asset.id },
    });
  }
  onProgress?.({ phase: asset.status === 'ready' ? 'ready' : 'processing', loaded: asset.sizeBytes, total: asset.sizeBytes, fraction: 1, asset });
  return asset;
}

/** Poll GET /admin/assets/:id until status leaves `processing`. Resolves with the final asset (ready or failed). */
export async function waitForAsset(
  id: string,
  opts: { signal?: AbortSignal; intervalMs?: number; timeoutMs?: number; onTick?: (a: Asset) => void } = {},
): Promise<Asset> {
  const started = Date.now();
  let interval = opts.intervalMs ?? 1200;
  const timeout = opts.timeoutMs ?? 10 * 60_000;
  for (;;) {
    const asset = await adminFetch<Asset>(`/admin/assets/${id}`, { signal: opts.signal });
    opts.onTick?.(asset);
    if (asset.status !== 'processing') return asset;
    if (Date.now() - started > timeout) {
      throw new ApiError({
        status: 408,
        code: 'asset_timeout',
        message: 'This is taking longer than usual. It will keep processing in the background.',
        details: { assetId: id },
      });
    }
    await sleep(interval, opts.signal);
    interval = Math.min(4000, Math.round(interval * 1.25));
  }
}

/** POST /admin/assets/:id/recrop, then wait for the new variants. */
export async function recropAsset(
  id: string,
  input: { crop: Crop | null; adjust: Adjust | null },
  opts: { signal?: AbortSignal; wait?: boolean } = {},
): Promise<Asset> {
  const asset = await adminFetch<Asset>(`/admin/assets/${id}/recrop`, { method: 'POST', body: input, signal: opts.signal });
  if (opts.wait === false || asset.status !== 'processing') return asset;
  const done = await waitForAsset(id, { signal: opts.signal });
  if (done.status === 'failed') {
    throw new ApiError({ status: 422, code: 'asset_failed', message: done.error || "We couldn't re-crop that image." });
  }
  return done;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function xhrUpload(
  url: string,
  body: FormData,
  signal: AbortSignal | undefined,
  onProgress: (loaded: number, total: number) => void,
): Promise<Asset> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.responseType = 'text';
    xhr.setRequestHeader(CSRF_HEADER, '1');
    xhr.setRequestHeader('accept', 'application/json');
    xhr.upload.onprogress = (e) => onProgress(e.loaded, e.lengthComputable ? e.total : 0);
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        const payload = data as Asset | { asset: Asset } | null;
        const asset = payload && 'asset' in payload ? payload.asset : (payload as Asset | null);
        if (!asset?.id) {
          reject(new ApiError({ status: 500, code: 'bad_response', message: 'The upload finished but the server answer looked off.' }));
          return;
        }
        resolve(asset);
        return;
      }
      if (xhr.status === 401) redirectToLogin('expired');
      if (xhr.status === 413) {
        reject(new ApiError({ status: 413, code: 'too_large', message: 'That file is too big for us. Try a smaller one.' }));
        return;
      }
      reject(apiErrorFromBody(xhr.status, data, xhr.getResponseHeader('retry-after')));
    };
    xhr.onerror = () =>
      reject(new ApiError({ status: 0, code: 'network', message: 'The upload dropped. Check your connection and try again.' }));
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

export { isAbortError };
