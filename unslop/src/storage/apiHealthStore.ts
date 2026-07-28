import type { ApiHealth, ApiHealthState } from '@/types';
import { STORAGE_KEYS } from '@/constants';
import { getRaw, setRaw } from './local';

const STATES: ApiHealthState[] = ['unknown', 'unconfigured', 'testing', 'ok', 'error'];

export function normalizeHealth(raw: unknown): ApiHealth {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const state = STATES.includes(r.state as ApiHealthState)
    ? (r.state as ApiHealthState)
    : 'unknown';
  return {
    state,
    lastCheck: typeof r.lastCheck === 'number' ? r.lastCheck : null,
    latencyMs: typeof r.latencyMs === 'number' ? r.latencyMs : undefined,
    message: typeof r.message === 'string' ? r.message : undefined,
  };
}

export async function readApiHealth(): Promise<ApiHealth> {
  return normalizeHealth(await getRaw<unknown>(STORAGE_KEYS.apiHealth));
}

export async function writeApiHealth(health: ApiHealth): Promise<void> {
  await setRaw(STORAGE_KEYS.apiHealth, health);
}
