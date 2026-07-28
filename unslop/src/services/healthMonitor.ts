import type { ApiHealth, ApiHealthState } from '@/types';
import { readApiHealth, writeApiHealth } from '@/storage';

/**
 * Tracks the health of the active API endpoint based on the outcomes of real
 * classification calls plus explicit connectivity tests.
 */
class HealthMonitor {
  private health: ApiHealth = { state: 'unknown', lastCheck: null };
  private loaded = false;
  private loadPromise: Promise<void> | null = null;

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    if (!this.loadPromise) {
      this.loadPromise = readApiHealth().then((h) => {
        this.health = h;
        this.loaded = true;
      });
    }
    await this.loadPromise;
  }

  private async set(next: ApiHealth): Promise<void> {
    this.health = next;
    this.loaded = true;
    await writeApiHealth(next);
  }

  async get(): Promise<ApiHealth> {
    await this.ensureLoaded();
    return this.health;
  }

  getCached(): ApiHealth {
    return this.health;
  }

  async setState(state: ApiHealthState, message?: string): Promise<void> {
    await this.set({
      state,
      lastCheck: this.health.lastCheck,
      message,
    });
  }

  async markUnconfigured(): Promise<void> {
    await this.set({ state: 'unconfigured', lastCheck: Date.now(), message: 'API key not set' });
  }

  async markTesting(): Promise<void> {
    await this.ensureLoaded();
    await this.set({ ...this.health, state: 'testing' });
  }

  async markSuccess(latencyMs: number): Promise<void> {
    await this.set({ state: 'ok', lastCheck: Date.now(), latencyMs });
  }

  async markError(message: string): Promise<void> {
    await this.set({ state: 'error', lastCheck: Date.now(), message });
  }
}

export const healthMonitor = new HealthMonitor();
