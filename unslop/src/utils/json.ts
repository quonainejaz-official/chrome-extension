import type { Decision, ParsedDecision } from '@/types';

/**
 * Extracts the first balanced `{...}` JSON object from a string, tolerating
 * markdown code fences and surrounding prose that some models emit despite
 * being told not to.
 */
function extractJsonObject(raw: string): string | null {
  const text = raw.replace(/```(?:json)?/gi, '').trim();
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function coerceDecision(value: unknown): Decision | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v === 'hide' || v === 'keep') return v;
  return null;
}

function coerceConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 1;
  if (n < 0) return 0;
  if (n > 1) return n > 1 && n <= 100 ? n / 100 : 1;
  return n;
}

/**
 * Parses a classifier response into a {@link ParsedDecision}. Tries strict JSON
 * first, then a balanced-object extraction, then a last-ditch regex. Returns
 * null only when no decision can be recovered at all.
 */
export function parseDecision(raw: string): ParsedDecision | null {
  if (!raw) return null;

  const candidate = extractJsonObject(raw) ?? raw;
  try {
    const obj = JSON.parse(candidate) as Record<string, unknown>;
    const decision = coerceDecision(obj.decision);
    if (decision) {
      return { decision, confidence: coerceConfidence(obj.confidence) };
    }
  } catch {
    /* fall through to regex recovery */
  }

  const decisionMatch = raw.match(/"?decision"?\s*[:=]\s*"?(hide|keep)"?/i);
  if (decisionMatch) {
    const decision = coerceDecision(decisionMatch[1]);
    if (decision) {
      const confMatch = raw.match(/"?confidence"?\s*[:=]\s*([0-9]*\.?[0-9]+)/i);
      return {
        decision,
        confidence: confMatch ? coerceConfidence(Number(confMatch[1])) : 1,
      };
    }
  }

  // Bare-word fallback.
  if (/\bhide\b/i.test(raw) && !/\bkeep\b/i.test(raw)) {
    return { decision: 'hide', confidence: 0.5 };
  }
  if (/\bkeep\b/i.test(raw) && !/\bhide\b/i.test(raw)) {
    return { decision: 'keep', confidence: 0.5 };
  }
  return null;
}
