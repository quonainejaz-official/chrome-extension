import type { Decision } from './post';

/** A single cached classification decision, keyed by post hash. */
export interface CacheEntry {
  decision: Decision;
  confidence: number;
  /** When the decision was recorded (ms epoch) — used for TTL + LRU. */
  ts: number;
  /** Model that produced the decision (for cache-invalidation clarity). */
  model: string;
}

export type CacheMap = Record<string, CacheEntry>;
