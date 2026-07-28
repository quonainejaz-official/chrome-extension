import type { LogEntry } from '@/types';
import { STORAGE_KEYS } from '@/constants';
import { getRaw, setRaw, removeRaw } from './local';

export async function readLogs(): Promise<LogEntry[]> {
  const raw = await getRaw<unknown>(STORAGE_KEYS.logs);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is LogEntry =>
      !!e &&
      typeof e === 'object' &&
      typeof (e as LogEntry).id === 'string' &&
      typeof (e as LogEntry).ts === 'number',
  );
}

export async function writeLogs(logs: LogEntry[]): Promise<void> {
  await setRaw(STORAGE_KEYS.logs, logs);
}

export async function clearLogs(): Promise<void> {
  await removeRaw(STORAGE_KEYS.logs);
}
