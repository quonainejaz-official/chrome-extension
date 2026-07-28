import type { FromContentMessage, PageMetadata } from '../shared/types';
import { extractPdfText } from './pdf';

let currentTabId: number | null = null;

// ── Active tab resolution ───────────────────────────────────────

// Returns the active tab in the last focused normal window, skipping
// extension pages / chrome:// / the side panel itself.
export async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  // Prefer the last focused normal browser window (the side panel counts as a
  // separate surface, so `currentWindow` can be unreliable once it has focus).
  let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  let tab = tabs[0];

  if (!tab || !isReadableUrl(tab.url)) {
    tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  }

  if (!tab || !isReadableUrl(tab.url)) {
    // Last resort: any active tab across normal windows.
    const all = await chrome.tabs.query({ active: true });
    tab = all.find((t) => isReadableUrl(t.url)) ?? all[0];
  }

  return tab ?? null;
}

export async function getActiveTabId(): Promise<number | null> {
  const tab = await getActiveTab();
  currentTabId = tab?.id ?? null;
  return currentTabId;
}

function isReadableUrl(url?: string): boolean {
  if (!url) return false;
  return /^https?:|^file:|^blob:/.test(url);
}

// ── DOM extraction (runs INSIDE the page via executeScript) ─────

// IMPORTANT: this function is serialized and injected into the target page,
// so it must be fully self-contained — no external references or imports.
function extractPageInPage(maxLen: number) {
  const clean = (t: string) =>
    t.replace(/[\r\n]+/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim().slice(0, maxLen);

  const meta = (name: string): string | undefined => {
    const el =
      document.querySelector(`meta[name="${name}"]`) ||
      document.querySelector(`meta[property="${name}"]`) ||
      document.querySelector(`meta[itemprop="${name}"]`);
    return el?.getAttribute('content') ?? undefined;
  };

  // Prefer semantic content regions, fall back to a de-chromed body clone.
  let text = '';
  const article = document.querySelector('article') as HTMLElement | null;
  if (article && article.innerText.trim().length > 120) {
    text = article.innerText;
  } else {
    const selectors = [
      'main', '[role="main"]', '#content', '#main-content', '.content',
      '.main-content', '#readme', '.readme', '[role="article"]',
      '.post-content', '.article-content', '.entry-content', '.markdown-body',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el && el.innerText.trim().length > 200) {
        text = el.innerText;
        break;
      }
    }
    if (!text) {
      const body = document.body.cloneNode(true) as HTMLElement;
      body.querySelectorAll('nav, footer, header, aside, script, style, noscript, iframe, svg').forEach((el) => el.remove());
      text = body.innerText || document.body.innerText || '';
    }
  }

  const selection = window.getSelection?.();
  const selectedText = selection && !selection.isCollapsed ? selection.toString().trim().slice(0, 5000) : '';

  const bodyText = document.body?.innerText || '';
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
  const htmlLang = document.documentElement.lang || meta('language') || 'en';

  return {
    url: window.location.href,
    title: document.title || 'Untitled',
    content: clean(text),
    selectedText,
    language: htmlLang.slice(0, 2).toLowerCase(),
    metadata: {
      description: meta('description') ?? meta('og:description'),
      author: meta('author') ?? meta('article:author'),
      publishDate: meta('article:published_time') ?? meta('datePublished'),
      wordCount,
      readingTime: Math.ceil(wordCount / 200),
    } as PageMetadata,
  };
}

// ── Public API ──────────────────────────────────────────────────

export interface ExtractionResult {
  url: string;
  title: string;
  content: string;
  selectedText: string;
  language: string;
  pageType: 'webpage' | 'pdf' | 'unknown';
  metadata: PageMetadata;
}

const MAX_CONTENT_LENGTH = 50000;

export async function extractFromActiveTab(): Promise<ExtractionResult | null> {
  const tab = await getActiveTab();
  if (!tab?.id) return null;
  currentTabId = tab.id;

  const url = tab.url ?? '';
  const looksLikePdf = /\.pdf(\?|#|$)/i.test(url);

  // 1) PDF: the native Chrome viewer exposes no readable DOM text, so fetch
  //    the bytes and parse them directly.
  if (looksLikePdf) {
    try {
      const content = await extractPdfText(url);
      if (content && content.trim().length > 0) {
        return {
          url,
          title: tab.title || url.split('/').pop() || 'PDF Document',
          content: content.slice(0, MAX_CONTENT_LENGTH),
          selectedText: '',
          language: 'en',
          pageType: 'pdf',
          metadata: { wordCount: content.split(/\s+/).filter(Boolean).length, readingTime: Math.ceil(content.split(/\s+/).length / 200) },
        };
      }
    } catch {
      // fall through to DOM extraction attempt
    }
  }

  // 2) Normal pages: inject an extraction function directly into the tab.
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: false },
      func: extractPageInPage,
      args: [MAX_CONTENT_LENGTH],
    });
    const r = injection?.result as Omit<ExtractionResult, 'pageType'> | undefined;
    if (r && (r.content?.trim() || r.selectedText?.trim())) {
      return { ...r, pageType: looksLikePdf ? 'pdf' : 'webpage' };
    }
  } catch {
    // Injection can fail on restricted pages (chrome://, Web Store, etc.).
  }

  // 3) Fallback: message the declared content script if it happens to be present.
  try {
    const resp = await sendToContentScript(tab.id, { type: 'EXTRACT_CONTENT' });
    if (resp?.type === 'CONTENT_EXTRACTED') {
      return {
        url: resp.payload.url,
        title: resp.payload.title,
        content: resp.payload.content,
        selectedText: '',
        language: resp.payload.language,
        pageType: resp.payload.pageType,
        metadata: resp.payload.metadata,
      };
    }
  } catch {
    // no content script available
  }

  return null;
}

function sendToContentScript(tabId: number, message: { type: string }): Promise<FromContentMessage> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response: FromContentMessage) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

export async function getSelectionFromActiveTab(): Promise<string | null> {
  const tabId = currentTabId ?? (await getActiveTabId());
  if (!tabId) return null;
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const s = window.getSelection?.();
        return s && !s.isCollapsed ? s.toString().trim().slice(0, 5000) : '';
      },
    });
    return (injection?.result as string) ?? null;
  } catch {
    return null;
  }
}
