import type { CacheEntry, CacheMap, Decision } from '@/types';
import { STORAGE_KEYS } from '@/constants';
import { getRaw, setRaw, removeRaw } from './local';

function isDecision(value: unknown): value is Decision {
  return value === 'hide' || value === 'keep';
}

export function normalizeCache(raw: unknown): CacheMap {
  if (!raw || typeof raw !== 'object') return {};
  const out: CacheMap = {};
  for (const [hash, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    if (!isDecision(v.decision)) continue;
    const entry: CacheEntry = {
      decision: v.decision,
      confidence:
        typeof v.confidence === 'number' && Number.isFinite(v.confidence)
          ? v.confidence
          : 1,
      ts: typeof v.ts === 'number' ? v.ts : 0,
      model: typeof v.model === 'string' ? v.model : '',
    };
    out[hash] = entry;
  }
  return out;
}

export async function readCache(): Promise<CacheMap> {
  return normalizeCache(await getRaw<unknown>(STORAGE_KEYS.cache));
}

export async function writeCache(cache: CacheMap): Promise<void> {
  await setRaw(STORAGE_KEYS.cache, cache);
}

export async function clearCache(): Promise<void> {
  await removeRaw(STORAGE_KEYS.cache);
}
