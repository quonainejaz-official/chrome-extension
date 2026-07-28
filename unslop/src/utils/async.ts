/** Raised when an aborted operation is awaited. */
export class AbortError extends Error {
  constructor(message = 'Operation aborted') {
    super(message);
    this.name = 'AbortError';
  }
}

/** Promisified `setTimeout` that rejects with {@link AbortError} if aborted. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Exponential backoff with full jitter, clamped to a ceiling.
 * delay = min(base * 2^attempt, max) + random(0, jitter)
 */
export function computeBackoff(
  attempt: number,
  opts: { baseMs: number; maxMs: number; jitterMs: number },
): number {
  const exponential = Math.min(opts.maxMs, opts.baseMs * 2 ** attempt);
  const jitter = Math.floor(Math.random() * opts.jitterMs);
  return exponential + jitter;
}

/** Returns true when a caught value is (or wraps) an abort. */
export function isAbort(err: unknown): boolean {
  return (
    err instanceof AbortError ||
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}
