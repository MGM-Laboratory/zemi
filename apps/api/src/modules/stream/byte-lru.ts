/**
 * Tiny LRU with a byte budget and per-entry expiry, for the HLS proxy. A `Map` keeps insertion
 * order, so "touch" is delete + set and eviction takes from the front.
 */
export interface CacheEntry {
  body: Buffer;
  contentType: string;
  expiresAt: number;
}

export class ByteLru {
  private readonly map = new Map<string, CacheEntry>();
  private total = 0;

  constructor(
    private readonly maxBytes: number,
    /** Anything bigger than this is served but never cached. */
    private readonly maxEntryBytes = Math.floor(maxBytes / 8),
  ) {}

  get bytes(): number {
    return this.total;
  }

  get size(): number {
    return this.map.size;
  }

  get(key: string, now = Date.now()): CacheEntry | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= now) {
      this.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, hit);
    return hit;
  }

  set(key: string, entry: CacheEntry): void {
    const size = entry.body.byteLength;
    if (size > this.maxEntryBytes) return;
    this.delete(key);
    this.map.set(key, entry);
    this.total += size;
    this.evict();
  }

  delete(key: string): void {
    const prev = this.map.get(key);
    if (!prev) return;
    this.map.delete(key);
    this.total -= prev.body.byteLength;
  }

  /** Drop every key with this prefix (e.g. a stream key after rotation or end). */
  deletePrefix(prefix: string): void {
    for (const key of [...this.map.keys()]) if (key.startsWith(prefix)) this.delete(key);
  }

  /** Remove expired entries (called on a timer so idle memory goes back down). */
  prune(now = Date.now()): void {
    for (const [key, e] of this.map) if (e.expiresAt <= now) this.delete(key);
  }

  clear(): void {
    this.map.clear();
    this.total = 0;
  }

  private evict(): void {
    while (this.total > this.maxBytes && this.map.size) {
      const oldest = this.map.keys().next().value as string;
      this.delete(oldest);
    }
  }
}
