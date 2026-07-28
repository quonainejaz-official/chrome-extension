/** chrome.storage.local keys. Namespaced to avoid collisions with page storage. */
export const STORAGE_KEYS = {
  settings: 'unslop:settings',
  cache: 'unslop:cache',
  stats: 'unslop:stats',
  logs: 'unslop:logs',
  apiHealth: 'unslop:apiHealth',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
