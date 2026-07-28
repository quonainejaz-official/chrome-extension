/** Aggregated counters for a single day or lifetime total. */
export interface StatBucket {
  scanned: number;
  hidden: number;
  apiCalls: number;
  promptTokens: number;
  completionTokens: number;
  /** Estimated cost in USD (0 when no pricing is configured). */
  cost: number;
  errors: number;
}

/** Persisted stats: lifetime totals plus a capped per-day history. */
export interface Stats {
  totals: StatBucket;
  /** Keyed by ISO date `YYYY-MM-DD`, capped to a rolling window. */
  days: Record<string, StatBucket>;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogCategory =
  | 'system'
  | 'classify'
  | 'llm'
  | 'network'
  | 'queue'
  | 'cache';

/**
 * A single debug log entry. Post text is never logged — only hashes, decisions,
 * token counts, timings and status codes.
 */
export interface LogEntry {
  id: string;
  ts: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  meta?: Record<string, unknown>;
}

export interface QueueStatus {
  pending: number;
  inFlight: number;
  maxConcurrent: number;
  ratePerSec: number;
  /** Total tasks completed since the worker started. */
  completed: number;
}

export type ApiHealthState =
  | 'unknown'
  | 'unconfigured'
  | 'testing'
  | 'ok'
  | 'error';

export interface ApiHealth {
  state: ApiHealthState;
  lastCheck: number | null;
  latencyMs?: number;
  message?: string;
}

/** Snapshot returned to the popup for its status view. */
export interface StatusSnapshot {
  enabled: boolean;
  paused: boolean;
  today: StatBucket;
  totals: StatBucket;
  queue: QueueStatus;
  health: ApiHealth;
  activeProfileName: string;
  activeModel: string;
}
