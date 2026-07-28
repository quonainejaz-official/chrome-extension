import { marked } from 'marked';
import DOMPurify from 'dompurify';

// GitHub-flavored markdown, with single newlines treated as line breaks so
// model output looks natural without requiring double newlines.
marked.setOptions({ gfm: true, breaks: true });

// Make every link open safely in a new tab.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.nodeName === 'A') {
    (node as Element).setAttribute('target', '_blank');
    (node as Element).setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Convert an assistant message (markdown) into safe, rich HTML.
 * Parsing is done by `marked` (tables, lists, code fences, etc.) and the result
 * is sanitized with DOMPurify to prevent XSS from model output.
 */
export function renderMarkdown(text: string): string {
  const raw = marked.parse(text ?? '', { async: false }) as string;
  return DOMPurify.sanitize(raw, { ADD_ATTR: ['target', 'rel'] });
}

// Matches strong right-to-left characters (Arabic, Urdu, Persian, Hebrew, …).
const RTL_CHARS = /[֐-ࣿיִ-﷿ﹰ-﻿]/g;
const LTR_CHARS = /[A-Za-zÀ-ɏ]/g;

/**
 * Detects the dominant text direction of a string so Urdu/Arabic replies
 * render right-to-left while English stays left-to-right.
 */
export function detectDir(text: string): 'rtl' | 'ltr' {
  if (!text) return 'ltr';
  const rtl = (text.match(RTL_CHARS) ?? []).length;
  const ltr = (text.match(LTR_CHARS) ?? []).length;
  return rtl > ltr ? 'rtl' : 'ltr';
}
