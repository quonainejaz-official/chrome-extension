import { sleep } from '@/utils/async';

/**
 * Sliding-window rate limiter. Allows at most `ratePerSec` acquisitions within
 * any rolling 1000ms window; callers await {@link acquire} before starting work.
 */
export class RateLimiter {
  private readonly windowMs = 1000;
  private timestamps: number[] = [];

  constructor(private ratePerSec: number) {}

  setRate(ratePerSec: number): void {
    this.ratePerSec = Math.max(1, ratePerSec);
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    for (;;) {
      const now = Date.now();
      while (this.timestamps.length > 0 && now - this.timestamps[0] >= this.windowMs) {
        this.timestamps.shift();
      }
      if (this.timestamps.length < this.ratePerSec) {
        this.timestamps.push(now);
        return;
      }
      const waitMs = this.windowMs - (now - this.timestamps[0]) + 5;
      await sleep(waitMs, signal);
    }
  }
}
