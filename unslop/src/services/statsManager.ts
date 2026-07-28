import type { StatBucket, Stats } from '@/types';
import { debounce } from '@/utils/debounce';
import { dateKey } from '@/utils/date';
import {
  emptyBucket,
  pruneDays,
  readStats,
  writeStats,
} from '@/storage';

type StatKey = keyof StatBucket;

/**
 * Accumulates lifetime + per-day counters (posts scanned/hidden, API calls,
 * tokens, cost, errors). Writes are debounced to avoid hammering storage during
 * bursts of classifications.
 */
class StatsManager {
  private stats: Stats | null = null;
  private loadPromise: Promise<Stats> | null = null;
  private readonly flushDebounced = debounce(() => void this.flush(), 800);

  private async load(): Promise<Stats> {
    this.stats = pruneDays(await readStats());
    return this.stats;
  }

  private async ensure(): Promise<Stats> {
    if (this.stats) return this.stats;
    if (!this.loadPromise) this.loadPromise = this.load();
    return this.loadPromise;
  }

  private bucketForToday(stats: Stats): StatBucket {
    const key = dateKey();
    let bucket = stats.days[key];
    if (!bucket) {
      bucket = emptyBucket();
      stats.days[key] = bucket;
    }
    return bucket;
  }

  private async record(patch: Partial<StatBucket>): Promise<void> {
    const stats = await this.ensure();
    const today = this.bucketForToday(stats);
    for (const key of Object.keys(patch) as StatKey[]) {
      const value = patch[key];
      if (typeof value !== 'number') continue;
      today[key] += value;
      stats.totals[key] += value;
    }
    this.flushDebounced();
  }

  recordScanned(count: number): void {
    if (count > 0) void this.record({ scanned: count });
  }

  recordHidden(count = 1): void {
    if (count > 0) void this.record({ hidden: count });
  }

  recordApiCall(input: {
    promptTokens: number;
    completionTokens: number;
    cost: number;
  }): void {
    void this.record({
      apiCalls: 1,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      cost: input.cost,
    });
  }

  recordError(): void {
    void this.record({ errors: 1 });
  }

  async get(): Promise<Stats> {
    return this.ensure();
  }

  async getToday(): Promise<StatBucket> {
    const stats = await this.ensure();
    return { ...this.bucketForToday(stats) };
  }

  async reset(): Promise<Stats> {
    this.stats = { totals: emptyBucket(), days: {} };
    await writeStats(this.stats);
    return this.stats;
  }

  private async flush(): Promise<void> {
    if (this.stats) await writeStats(pruneDays(this.stats));
  }
}

export const statsManager = new StatsManager();
