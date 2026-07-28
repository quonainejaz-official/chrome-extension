import type { QueueStatus } from '@/types';
import { LIMITS } from '@/constants';
import { AbortError, computeBackoff, isAbort, sleep } from '@/utils/async';
import { LlmError } from '@/providers';
import { RateLimiter } from './rateLimiter';

type TaskFactory<T> = (signal: AbortSignal) => Promise<T>;

interface QueueItem<T = unknown> {
  key: string;
  factory: TaskFactory<T>;
  retries: number;
  controller: AbortController;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

interface Tracked {
  promise: Promise<unknown>;
  controller: AbortController;
}

/**
 * Bounded work queue for LLM classification requests.
 *
 * - Deduplicates by key: identical concurrent requests share one promise.
 * - Caps concurrency to {@link LIMITS.maxConcurrent}.
 * - Throttles starts via a {@link RateLimiter}.
 * - Retries retryable failures with exponential backoff + jitter.
 * - Supports per-key and global cancellation via AbortController.
 */
export class QueueManager {
  private queue: QueueItem[] = [];
  private readonly byKey = new Map<string, Tracked>();
  private active = 0;
  private completed = 0;
  private readonly limiter = new RateLimiter(LIMITS.ratePerSec);

  constructor(
    private readonly maxConcurrent = LIMITS.maxConcurrent,
    private readonly maxRetries = LIMITS.maxRetries,
  ) {}

  enqueue<T>(key: string, factory: TaskFactory<T>, external?: AbortSignal): Promise<T> {
    const existing = this.byKey.get(key);
    if (existing) return existing.promise as Promise<T>;

    const controller = new AbortController();
    if (external) {
      if (external.aborted) controller.abort();
      else external.addEventListener('abort', () => controller.abort(), { once: true });
    }

    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    // Ensure the dedup entry is cleared once the task settles.
    void promise.then(
      () => this.byKey.delete(key),
      () => this.byKey.delete(key),
    );

    this.byKey.set(key, { promise, controller });
    this.queue.push({ key, factory, retries: this.maxRetries, controller, resolve, reject } as unknown as QueueItem);
    this.drain();
    return promise;
  }

  cancel(key: string): void {
    this.byKey.get(key)?.controller.abort();
  }

  cancelAll(): void {
    for (const tracked of this.byKey.values()) tracked.controller.abort();
    // Reject anything still queued so callers don't hang.
    const queued = this.queue.splice(0, this.queue.length);
    for (const item of queued) item.reject(new AbortError('Queue cleared'));
  }

  status(): QueueStatus {
    return {
      pending: this.queue.length,
      inFlight: this.active,
      maxConcurrent: this.maxConcurrent,
      ratePerSec: LIMITS.ratePerSec,
      completed: this.completed,
    };
  }

  private drain(): void {
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;
      if (item.controller.signal.aborted) {
        item.reject(new AbortError());
        continue;
      }
      this.active++;
      void this.process(item).finally(() => {
        this.active--;
        this.completed++;
        this.drain();
      });
    }
  }

  private async process(item: QueueItem): Promise<void> {
    let attempt = 0;
    for (;;) {
      if (item.controller.signal.aborted) {
        item.reject(new AbortError());
        return;
      }
      try {
        await this.limiter.acquire(item.controller.signal);
        const result = await item.factory(item.controller.signal);
        item.resolve(result);
        return;
      } catch (err) {
        if (isAbort(err)) {
          item.reject(err);
          return;
        }
        const retryable = err instanceof LlmError ? err.retryable : false;
        if (retryable && attempt < item.retries) {
          attempt++;
          try {
            await sleep(
              computeBackoff(attempt, {
                baseMs: LIMITS.backoffBaseMs,
                maxMs: LIMITS.backoffMaxMs,
                jitterMs: LIMITS.backoffJitterMs,
              }),
              item.controller.signal,
            );
          } catch (sleepErr) {
            item.reject(sleepErr);
            return;
          }
          continue;
        }
        item.reject(err);
        return;
      }
    }
  }
}
