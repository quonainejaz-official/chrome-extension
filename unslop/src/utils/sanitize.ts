/**
 * Parses raw multi-line / comma-separated user input into a clean, de-duplicated
 * list of trimmed, non-empty tokens. Used by the whitelist/blacklist editors.
 */
export function parseList(raw: string): string[] {
  return dedupe(
    raw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** Removes duplicate strings while preserving order (case-insensitive). */
export function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

/** Strips leading @, u/, /u/, r/, /r/ prefixes and surrounding whitespace. */
export function normalizeHandle(raw: string): string {
  return raw
    .trim()
    .replace(/^\/?(u|r|user)\//i, '')
    .replace(/^@+/, '')
    .trim();
}

/** Strips a leading # from a hashtag and lower-cases it. */
export function normalizeHashtag(raw: string): string {
  return raw.trim().replace(/^#+/, '').toLowerCase();
}

/** Escapes a string for safe use in HTML text (defence-in-depth). */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Clamps a number into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
