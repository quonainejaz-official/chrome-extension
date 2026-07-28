/**
 * Thin, promise-based, typed wrapper around chrome.storage.local. All higher
 * layers go through this so the storage area and error handling live in one
 * place.
 */

export async function getRaw<T>(key: string): Promise<T | undefined> {
  const res = await chrome.storage.local.get(key);
  return res[key] as T | undefined;
}

export async function setRaw<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function removeRaw(key: string): Promise<void> {
  await chrome.storage.local.remove(key);
}

export type StorageChanges = Record<string, chrome.storage.StorageChange>;

/**
 * Subscribes to changes on the given local-storage keys. Returns an
 * unsubscribe function.
 */
export function subscribe(
  keys: string[],
  callback: (changes: StorageChanges) => void,
): () => void {
  const listener = (changes: StorageChanges, areaName: string) => {
    if (areaName !== 'local') return;
    if (keys.some((k) => k in changes)) callback(changes);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
