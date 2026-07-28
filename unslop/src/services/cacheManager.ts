import type { CacheEntry, CacheMap, CacheStats } from '@/types';
import { LIMITS } from '@/constants';
import { debounce } from '@/utils/debounce';
import { clearCache, readCache, writeCache } from '@/storage';

/**
 * In-memory decision cache backed by chrome.storage.local. Keyed by post hash.
 * Enforces a TTL and an LRU-by-age size cap. Stores only decisions — never post
 * text.
 */
class CacheManager {
  private map: CacheMap | null = null;
  private loadPromise: Promise<CacheMap> | null = null;
  private readonly flushDebounced = debounce(() => void this.flush(), 800);

  private async load(): Promise<CacheMap> {
    const map = await readCache();
    this.evictExpired(map);
    this.map = map;
    return map;
  }

  private async ensure(): Promise<CacheMap> {
    if (this.map) return this.map;
    if (!this.loadPromise) this.loadPromise = this.load();
    return this.loadPromise;
  }

  async get(hash: string): Promise<CacheEntry | null> {
    const map = await this.ensure();
    const entry = map[hash];
    if (!entry) return null;
    if (Date.now() - entry.ts > LIMITS.cacheTtlMs) {
      delete map[hash];
      this.flushDebounced();
      return null;
    }
    return entry;
  }

  async set(hash: string, entry: CacheEntry): Promise<void> {
    const map = await this.ensure();
    map[hash] = entry;
    this.evictIfNeeded(map);
    this.flushDebounced();
  }

  async delete(hash: string): Promise<void> {
    const map = await this.ensure();
    if (hash in map) {
      delete map[hash];
      this.flushDebounced();
    }
  }

  async clear(): Promise<CacheStats> {
    this.map = {};
    await clearCache();
    return this.stats();
  }

  async stats(): Promise<CacheStats> {
    const map = await this.ensure();
    const entries = Object.keys(map).length;
    return {
      entries,
      maxEntries: LIMITS.cacheMaxEntries,
      approxBytes: entries === 0 ? 0 : JSON.stringify(map).length,
    };
  }

  private evictExpired(map: CacheMap): void {
    const now = Date.now();
    for (const [key, entry] of Object.entries(map)) {
      if (now - entry.ts > LIMITS.cacheTtlMs) delete map[key];
    }
  }

  private evictIfNeeded(map: CacheMap): void {
    const keys = Object.keys(map);
    if (keys.length <= LIMITS.cacheMaxEntries) return;
    keys.sort((a, b) => map[a].ts - map[b].ts);
    const removeCount = keys.length - LIMITS.cacheMaxEntries;
    for (let i = 0; i < removeCount; i++) delete map[keys[i]];
  }

  private async flush(): Promise<void> {
    if (this.map) await writeCache(this.map);
  }
}

export const cacheManager = new CacheManager();
