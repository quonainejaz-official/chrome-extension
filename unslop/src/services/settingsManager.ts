import type { Platform, Settings, SettingsPatch } from '@/types';
import { STORAGE_KEYS } from '@/constants';
import { dedupe, normalizeHandle } from '@/utils/sanitize';
import { readSettings, writeSettings, subscribe } from '@/storage';

type Updater = SettingsPatch | ((current: Settings) => Settings);

/**
 * Single source of truth for settings in the background worker. Caches the
 * value in memory, keeps it in sync with external changes (from the options
 * page) and exposes domain-level mutations.
 */
class SettingsManager {
  private cache: Settings | null = null;
  private loadPromise: Promise<Settings> | null = null;
  private readonly listeners = new Set<(settings: Settings) => void>();
  private subscribed = false;

  private async load(): Promise<Settings> {
    const settings = await readSettings();
    this.cache = settings;
    this.subscribeOnce();
    return settings;
  }

  private subscribeOnce(): void {
    if (this.subscribed) return;
    this.subscribed = true;
    subscribe([STORAGE_KEYS.settings], () => {
      void readSettings().then((next) => {
        this.cache = next;
        this.emit(next);
      });
    });
  }

  async get(): Promise<Settings> {
    if (this.cache) return this.cache;
    if (!this.loadPromise) this.loadPromise = this.load();
    return this.loadPromise;
  }

  getCached(): Settings | null {
    return this.cache;
  }

  async update(updater: Updater): Promise<Settings> {
    const current = await this.get();
    const next =
      typeof updater === 'function' ? updater(current) : { ...current, ...updater };
    const saved = await writeSettings(next);
    this.cache = saved;
    // storage.onChanged will notify listeners; we also emit here so callers in
    // this context see the change synchronously after the await.
    this.emit(saved);
    return saved;
  }

  onChange(callback: (settings: Settings) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emit(settings: Settings): void {
    for (const listener of this.listeners) {
      try {
        listener(settings);
      } catch {
        /* listener errors must not break the manager */
      }
    }
  }

  // ---- Domain helpers -----------------------------------------------------

  async setEnabled(enabled: boolean): Promise<Settings> {
    return this.update({ enabled });
  }

  async setPaused(paused: boolean): Promise<Settings> {
    return this.update({ paused });
  }

  async toggleEnabled(): Promise<Settings> {
    const current = await this.get();
    return this.update({ enabled: !current.enabled });
  }

  async togglePaused(): Promise<Settings> {
    const current = await this.get();
    return this.update({ paused: !current.paused });
  }

  async addWhitelistAuthor(_platform: Platform, author: string): Promise<Settings> {
    const handle = normalizeHandle(author);
    if (!handle) return this.get();
    return this.update((s) => ({
      ...s,
      whitelist: { ...s.whitelist, authors: dedupe([...s.whitelist.authors, handle]) },
    }));
  }

  async addBlacklistAuthor(_platform: Platform, author: string): Promise<Settings> {
    const handle = normalizeHandle(author);
    if (!handle) return this.get();
    return this.update((s) => ({
      ...s,
      blacklist: { ...s.blacklist, authors: dedupe([...s.blacklist.authors, handle]) },
    }));
  }

  async addBlacklistKeywords(keywords: string[]): Promise<Settings> {
    const clean = keywords.map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (clean.length === 0) return this.get();
    return this.update((s) => ({
      ...s,
      blacklist: { ...s.blacklist, keywords: dedupe([...s.blacklist.keywords, ...clean]) },
    }));
  }

  async addBlacklistHashtags(hashtags: string[]): Promise<Settings> {
    const clean = hashtags
      .map((h) => h.replace(/^#+/, '').trim().toLowerCase())
      .filter(Boolean);
    if (clean.length === 0) return this.get();
    return this.update((s) => ({
      ...s,
      blacklist: { ...s.blacklist, hashtags: dedupe([...s.blacklist.hashtags, ...clean]) },
    }));
  }
}

export const settingsManager = new SettingsManager();
