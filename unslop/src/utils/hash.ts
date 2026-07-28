import { normalizeForHash } from './text';

/** Hex-encodes an ArrayBuffer. */
function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * Computes the SHA-256 hex digest of arbitrary text using the Web Crypto API
 * (available in both content scripts and the service worker in a secure
 * context). No third-party hashing dependency required.
 */
export async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}

/** Hashes a post after normalising it for dedup — the canonical cache key. */
export async function hashPostText(text: string): Promise<string> {
  return sha256(normalizeForHash(text));
}
