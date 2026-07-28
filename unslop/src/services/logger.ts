import type { LogCategory, LogEntry, LogLevel } from '@/types';
import { LIMITS } from '@/constants';
import { debounce } from '@/utils/debounce';
import { uuid } from '@/utils/id';
import { clearLogs, readLogs, writeLogs } from '@/storage';

/**
 * Ring-buffer logger for the background worker. Warnings and errors are always
 * retained; debug/info entries only when `debug` is enabled in settings. Post
 * text is never logged — callers pass hashes, decisions, token counts, etc.
 */
class Logger {
  private buffer: LogEntry[] = [];
  private loaded = false;
  private loadPromise: Promise<void> | null = null;
  private debugEnabled = false;
  private readonly flushDebounced = debounce(() => void this.flush(), 500);

  configure(opts: { debug: boolean }): void {
    this.debugEnabled = opts.debug;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    if (!this.loadPromise) {
      this.loadPromise = readLogs().then((logs) => {
        this.buffer = logs;
        this.loaded = true;
      });
    }
    await this.loadPromise;
  }

  private record(
    level: LogLevel,
    category: LogCategory,
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    const persistWorthy = level === 'warn' || level === 'error' || this.debugEnabled;

    // Always mirror to the console for live debugging.
    const line = `[Unslop:${category}] ${message}`;
    if (level === 'error') console.error(line, meta ?? '');
    else if (level === 'warn') console.warn(line, meta ?? '');
    else if (this.debugEnabled) console.debug(line, meta ?? '');

    if (!persistWorthy) return;

    const entry: LogEntry = { id: uuid(), ts: Date.now(), level, category, message };
    if (meta) entry.meta = meta;

    void this.ensureLoaded().then(() => {
      this.buffer.push(entry);
      const overflow = this.buffer.length - LIMITS.logMaxEntries;
      if (overflow > 0) this.buffer.splice(0, overflow);
      this.flushDebounced();
    });
  }

  debug(category: LogCategory, message: string, meta?: Record<string, unknown>): void {
    this.record('debug', category, message, meta);
  }

  info(category: LogCategory, message: string, meta?: Record<string, unknown>): void {
    this.record('info', category, message, meta);
  }

  warn(category: LogCategory, message: string, meta?: Record<string, unknown>): void {
    this.record('warn', category, message, meta);
  }

  error(category: LogCategory, message: string, meta?: Record<string, unknown>): void {
    this.record('error', category, message, meta);
  }

  /** Returns logs newest-first for the debug UI. */
  async getLogs(): Promise<LogEntry[]> {
    await this.ensureLoaded();
    return [...this.buffer].reverse();
  }

  async clear(): Promise<void> {
    this.buffer = [];
    this.loaded = true;
    await clearLogs();
  }

  private async flush(): Promise<void> {
    await this.ensureLoaded();
    await writeLogs(this.buffer);
  }
}

export const logger = new Logger();
