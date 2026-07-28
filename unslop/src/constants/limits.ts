/** Operational limits for the queue, network, cache and logs. */
export const LIMITS = {
  /** Maximum concurrent in-flight LLM requests. */
  maxConcurrent: 3,
  /** Maximum LLM requests started per rolling second. */
  ratePerSec: 5,
  /** Per-request network timeout. */
  requestTimeoutMs: 20_000,
  /** Maximum automatic retries for a retryable failure. */
  maxRetries: 3,
  /** Base delay for exponential backoff. */
  backoffBaseMs: 600,
  /** Ceiling for a single backoff delay. */
  backoffMaxMs: 8_000,
  /** Random jitter added to each backoff delay. */
  backoffJitterMs: 250,
  /** Maximum cached decisions before LRU eviction kicks in. */
  cacheMaxEntries: 5_000,
  /** Maximum debug log entries retained (ring buffer). */
  logMaxEntries: 250,
  /** Days of per-day stats retained. */
  statsDaysKept: 60,
  /** Post text is truncated to this many characters before being sent. */
  maxPostChars: 1_500,
  /** Posts shorter than this (after normalisation) are kept without an API call. */
  minPostChars: 24,
  /** DOM mutation debounce window. */
  scanDebounceMs: 350,
  /** How long a decision stays fresh in the cache (ms). */
  cacheTtlMs: 1000 * 60 * 60 * 24 * 30,
} as const;
