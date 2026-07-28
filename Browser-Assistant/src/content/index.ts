import type { ToContentMessage, FromContentMessage, PageMetadata } from '../shared/types';

const MAX_CONTENT_LENGTH = 50000;
const MAX_SELECTION_LENGTH = 5000;

// ── Content Extraction ──────────────────────────────────────────

function extractTextContent(): string {
  // Check for PDF viewer first
  if (isPdfViewer()) {
    return extractPdfText();
  }

  // Try article extraction
  const article = document.querySelector('article');
  if (article) {
    return cleanText((article as HTMLElement).innerText);
  }

  // Try main content areas
  const mainSelectors = [
    'main', '[role="main"]', '#content', '#main-content',
    '.content', '.main-content', '#readme', '.readme',
    '[role="article"]', '.post-content', '.article-content',
    '.entry-content', '.markdown-body',
  ];

  for (const selector of mainSelectors) {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (el && el.innerText.trim().length > 200) {
      return cleanText(el.innerText);
    }
  }

  // Fallback: collect all visible text from body, excluding nav/footer/script
  const body = document.body.cloneNode(true) as HTMLElement;
  const removeSelectors = ['nav', 'footer', 'header', 'aside', 'script', 'style', 'noscript', 'iframe'];
  for (const sel of removeSelectors) {
    body.querySelectorAll(sel).forEach((el) => el.remove());
  }

  return cleanText(body.innerText);
}

function isPdfViewer(): boolean {
  // Chrome's built-in PDF viewer
  if (document.contentType === 'application/pdf') return true;
  if (document.querySelector('embed[type="application/pdf"]')) return true;
  if (document.querySelector('#viewer, .pdfViewer, [data-pdfjs]')) return true;
  // Check URL
  if (window.location.pathname.endsWith('.pdf')) return true;
  return false;
}

function extractPdfText(): string {
  // Try to extract from PDF.js text layers
  const textLayers = document.querySelectorAll('.textLayer span, [data-page-no] span, .page span');
  if (textLayers.length > 0) {
    const texts: string[] = [];
    textLayers.forEach((span) => {
      const text = span.textContent?.trim();
      if (text) texts.push(text);
    });
    if (texts.length > 0) {
      return cleanText(texts.join(' '));
    }
  }

  // Fallback: try body innerText
  return cleanText(document.body.innerText);
}

function cleanText(text: string): string {
  return text
    .replace(/[\r\n]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, MAX_CONTENT_LENGTH);
}

function extractMetadata(): PageMetadata {
  const bodyText = document.body.innerText || '';
  const words = bodyText.split(/\s+/).filter(Boolean).length;
  const readingTime = Math.ceil(words / 200);

  const getMetaContent = (name: string): string | undefined => {
    const el =
      document.querySelector(`meta[name="${name}"]`) ||
      document.querySelector(`meta[property="${name}"]`) ||
      document.querySelector(`meta[itemprop="${name}"]`);
    return el?.getAttribute('content') ?? undefined;
  };

  return {
    description: getMetaContent('description') ?? getMetaContent('og:description'),
    author: getMetaContent('author') ?? getMetaContent('article:author'),
    publishDate: getMetaContent('article:published_time') ?? getMetaContent('datePublished'),
    wordCount: words,
    readingTime,
  };
}

function detectLanguage(): string {
  const htmlLang = document.documentElement.lang;
  if (htmlLang) return htmlLang.slice(0, 2).toLowerCase();

  const metaLang = document.querySelector('meta[name="language"]')?.getAttribute('content');
  if (metaLang) return metaLang.slice(0, 2).toLowerCase();

  return 'en';
}

function detectPageType(): 'webpage' | 'pdf' | 'unknown' {
  if (isPdfViewer()) return 'pdf';
  if (document.contentType === 'text/html') return 'webpage';
  return 'unknown';
}

// ── Selection Handling ──────────────────────────────────────────

function getSelectedText(): string {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return '';
  return selection.toString().trim().slice(0, MAX_SELECTION_LENGTH);
}

// ── Message Handler ─────────────────────────────────────────────

function handleMessage(
  message: ToContentMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: FromContentMessage) => void
): boolean {
  switch (message.type) {
    case 'EXTRACT_CONTENT': {
      try {
        const content = extractTextContent();
        const metadata = extractMetadata();
        const language = detectLanguage();
        const pageType = detectPageType();

        sendResponse({
          type: 'CONTENT_EXTRACTED',
          payload: {
            url: window.location.href,
            title: document.title || 'Untitled',
            content,
            language,
            pageType,
            metadata,
          },
        });
      } catch (err) {
        sendResponse({
          type: 'CONTENT_EXTRACTED',
          payload: {
            url: window.location.href,
            title: document.title || 'Untitled',
            content: 'Error extracting page content.',
            language: 'en',
            pageType: 'unknown',
            metadata: { wordCount: 0, readingTime: 0 },
          },
        });
      }
      return true;
    }

    case 'GET_SELECTION': {
      const text = getSelectedText();
      sendResponse({
        type: 'SELECTION_CAPTURED',
        payload: { text },
      });
      return true;
    }

    default:
      return false;
  }
}

// ── Listener ────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(handleMessage);

console.log('[AI Page Assistant] Content script loaded on:', window.location.href);
