import type { StatBucket, Stats } from '@/types';
import { LIMITS, STORAGE_KEYS } from '@/constants';
import { dateKey } from '@/utils/date';
import { getRaw, setRaw } from './local';

export function emptyBucket(): StatBucket {
  return {
    scanned: 0,
    hidden: 0,
    apiCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    cost: 0,
    errors: 0,
  };
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function normalizeBucket(raw: unknown): StatBucket {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    scanned: num(r.scanned),
    hidden: num(r.hidden),
    apiCalls: num(r.apiCalls),
    promptTokens: num(r.promptTokens),
    completionTokens: num(r.completionTokens),
    cost: num(r.cost),
    errors: num(r.errors),
  };
}

export function normalizeStats(raw: unknown): Stats {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const daysRaw = (r.days && typeof r.days === 'object' ? r.days : {}) as Record<
    string,
    unknown
  >;
  const days: Record<string, StatBucket> = {};
  for (const [key, value] of Object.entries(daysRaw)) {
    days[key] = normalizeBucket(value);
  }
  return {
    totals: normalizeBucket(r.totals),
    days,
  };
}

export async function readStats(): Promise<Stats> {
  return normalizeStats(await getRaw<unknown>(STORAGE_KEYS.stats));
}

export async function writeStats(stats: Stats): Promise<void> {
  await setRaw(STORAGE_KEYS.stats, stats);
}

/** Returns today's bucket (creating an empty one if absent). */
export function todayBucket(stats: Stats): StatBucket {
  const key = dateKey();
  return stats.days[key] ?? emptyBucket();
}

/** Trims the per-day history to the configured retention window. */
export function pruneDays(stats: Stats): Stats {
  const keys = Object.keys(stats.days).sort();
  if (keys.length <= LIMITS.statsDaysKept) return stats;
  const toDrop = keys.slice(0, keys.length - LIMITS.statsDaysKept);
  for (const key of toDrop) delete stats.days[key];
  return stats;
}
