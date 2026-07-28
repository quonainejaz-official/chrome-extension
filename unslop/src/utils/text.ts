/**
 * Zero-width and invisible characters commonly injected by editors/emoji:
 * ZWSP (U+200B), ZWNJ (U+200C), ZWJ (U+200D), word-joiner (U+2060),
 * BOM/ZWNBSP (U+FEFF) and soft hyphen (U+00AD). Built from escape sequences so
 * the source file contains no literal invisible characters.
 */
const INVISIBLE_RE = new RegExp('[\\u200B\\u200C\\u200D\\u2060\\uFEFF\\u00AD]', 'g');

/** Collapses all runs of whitespace (incl. newlines) into single spaces. */
export function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

/**
 * Normalises text for display / transmission: unicode NFKC, invisible chars
 * removed, whitespace collapsed. Keeps case and punctuation intact so the
 * classifier sees the post faithfully.
 */
export function normalizeText(input: string): string {
  if (!input) return '';
  const nfkc = input.normalize('NFKC');
  return collapseWhitespace(nfkc.replace(INVISIBLE_RE, ''));
}

/**
 * Normalises text for hashing / dedup. More aggressive than {@link normalizeText}
 * so that trivially different renders of the same post produce one hash.
 */
export function normalizeForHash(input: string): string {
  return normalizeText(input)
    .toLowerCase()
    // strip URLs which frequently carry per-view tracking params
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Truncates to at most `max` characters, appending an ellipsis when cut. */
export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  return `${input.slice(0, Math.max(0, max - 1))}…`;
}

/** Extracts hashtags (without the #) from text, lower-cased and de-duplicated. */
export function extractHashtags(input: string): string[] {
  const matches = input.match(/#[\p{L}\p{N}_]+/gu);
  if (!matches) return [];
  const set = new Set<string>();
  for (const m of matches) set.add(m.slice(1).toLowerCase());
  return [...set];
}
