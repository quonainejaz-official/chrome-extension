import type {
  BackgroundBroadcast,
  ClassifyResult,
  Platform,
  Settings,
} from '@/types';
import { LIMITS, PROCESSED_ATTR, POST_ID_ATTR } from '@/constants';
import { hashPostText } from '@/utils/hash';
import { normalizeText } from '@/utils/text';
import { normalizeHandle } from '@/utils/sanitize';
import { extractHashtags } from '@/utils/text';
import { debounce } from '@/utils/debounce';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExtractedPost {
  el: HTMLElement;
  text: string;
  author?: string;
  authorHandle?: string;
  verified?: boolean;
  subreddit?: string;
  company?: string;
  url?: string;
}

// ---------------------------------------------------------------------------
// Platform detection & selectors
// ---------------------------------------------------------------------------

function detectPlatform(): Platform | null {
  const host = location.hostname;
  if (host.includes('linkedin.com')) return 'linkedin';
  if (host.includes('twitter.com') || host.includes('x.com')) return 'twitter';
  if (host.includes('reddit.com')) return 'reddit';
  return null;
}

function getSelectors(platform: Platform) {
  switch (platform) {
    case 'linkedin':
      return {
        feed: 'div.feed-container, div#main-feed, div.scaffold-finite-scroll__content',
        post: '.feed-shared-update-v2, article[data-urn], div.occludable-update',
        content: '.feed-shared-update-v2__description, .update-components-text, span.break-words',
        author: '.feed-shared-actor__name, span.feed-shared-actor__name span[aria-hidden="true"]',
        authorLink: 'a[href*="/in/"], a[href*="/company/"]',
        verified: '.feed-shared-actor__sub-description .visually-hidden',
      } as const;
    case 'twitter':
      return {
        feed: "[aria-label='Timeline'], [data-testid='primaryColumn']",
        post: "article[data-testid='tweet'], [data-testid='tweet']",
        content: "[data-testid='tweetText'], div[lang]",
        author: "[data-testid='User-Name'] span span:first-child",
        authorLink: "[data-testid='User-Name'] a[href*='/'], a[role='link'][href*='/']",
        verified: "[data-testid='icon-verified']",
      } as const;
    case 'reddit':
      return {
        feed: '#siteTable, shreddit-app, [slot="post-link"]',
        post: '[data-testid="post-container"], article, shreddit-post',
        content: '[data-testid="post-content"], [slot="text-body"], .md',
        author: 'a[data-testid="post_author_link"], .author-name',
        authorLink: 'a[href*="/user/"], a[href*="/u/"]',
        verified: '.award-count',
      } as const;
  }
}

// ---------------------------------------------------------------------------
// Post extraction
// ---------------------------------------------------------------------------

function extractPosts(platform: Platform): ExtractedPost[] {
  const sel = getSelectors(platform);
  const postEls = document.querySelectorAll<HTMLElement>(sel.post);
  const results: ExtractedPost[] = [];

  for (const el of postEls) {
    if (el.hasAttribute(PROCESSED_ATTR)) continue;

    const contentEl = el.querySelector<HTMLElement>(sel.content);
    const text = contentEl?.innerText?.trim() ?? contentEl?.textContent?.trim() ?? '';
    if (!text || text.length < 10) continue;

    // Author
    const authorEl = el.querySelector<HTMLElement>(sel.author);
    const author = authorEl?.textContent?.trim();

    // Author handle/link
    let authorHandle: string | undefined;
    let company: string | undefined;
    const linkEl = el.querySelector<HTMLAnchorElement>(sel.authorLink);
    if (linkEl?.href) {
      const href = linkEl.href;
      if (platform === 'linkedin') {
        const compMatch = href.match(/\/company\/([^/?]+)/);
        const inMatch = href.match(/\/in\/([^/?]+)/);
        if (compMatch) {
          company = compMatch[1];
          authorHandle = company;
        } else if (inMatch) {
          authorHandle = inMatch[1];
        }
      } else if (platform === 'twitter') {
        const match = href.match(/x\.com\/([^/?]+)/) ?? href.match(/twitter\.com\/([^/?]+)/);
        if (match) authorHandle = match[1];
      } else if (platform === 'reddit') {
        const userMatch = href.match(/\/user\/([^/?]+)/) ?? href.match(/\/u\/([^/?]+)/);
        if (userMatch) authorHandle = userMatch[1];
      }
    }

    // Verified (Twitter checkmark)
    let verified = false;
    if (platform === 'twitter') {
      verified = !!el.querySelector(sel.verified);
    }

    // Reddit subreddit
    let subreddit: string | undefined;
    if (platform === 'reddit') {
      const subLink = el.querySelector<HTMLAnchorElement>('a[href*="/r/"]');
      if (subLink?.href) {
        const m = subLink.href.match(/\/r\/([^/?]+)/);
        if (m) subreddit = m[1];
      }
    }

    // Permalink
    let url: string | undefined;
    if (platform === 'twitter') {
      const statusLink = el.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
      if (statusLink) url = statusLink.href;
    } else if (platform === 'reddit') {
      const permLink = el.querySelector<HTMLAnchorElement>('a[href*="/comments/"]');
      if (permLink) url = permLink.href;
    } else if (platform === 'linkedin') {
      const urn = el.getAttribute('data-urn');
      if (urn) url = `https://www.linkedin.com/feed/update/${urn}`;
    }

    results.push({
      el,
      text: normalizeText(text).substring(0, LIMITS.maxPostChars * 2),
      author,
      authorHandle: authorHandle ? normalizeHandle(authorHandle) : undefined,
      verified,
      subreddit,
      company,
      url,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

function sendToBackground<T>(msg: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error('Message timeout')), 30_000);
    chrome.runtime.sendMessage(msg, (response: { ok: boolean; data?: T; error?: string }) => {
      clearTimeout(timeoutId);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.ok) {
        resolve(response.data as T);
      } else {
        reject(new Error(response?.error ?? 'Unknown error'));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Post hiding / blurring
// ---------------------------------------------------------------------------

const STYLE_ID = 'unslop-content-styles';

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    [${PROCESSED_ATTR}="hidden"] {
      max-height: 0 !important;
      overflow: hidden !important;
      opacity: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      pointer-events: none !important;
      transition: all 0.3s ease;
    }
    [${PROCESSED_ATTR}="blurred"] {
      filter: blur(6px);
      cursor: pointer;
      transition: filter 0.3s ease;
      position: relative;
    }
    [${PROCESSED_ATTR}="blurred"]:hover {
      filter: blur(2px);
    }
    [${PROCESSED_ATTR}="blurred"]::after {
      content: 'Click to reveal';
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: #6b7280;
      font-family: system-ui;
      pointer-events: none;
    }
    [${PROCESSED_ATTR}="collapsed"] {
      max-height: 48px !important;
      overflow: hidden !important;
      cursor: pointer;
      transition: max-height 0.3s ease;
    }
    [${PROCESSED_ATTR}="collapsed"]:hover {
      max-height: 2000px !important;
    }
    .unslop-menu-btn {
      position: absolute !important;
      top: 6px !important;
      right: 6px !important;
      z-index: 100 !important;
      width: 26px !important;
      height: 26px !important;
      border-radius: 50% !important;
      border: 1px solid rgba(128,128,128,0.3) !important;
      background: rgba(255,255,255,0.9) !important;
      cursor: pointer !important;
      font-size: 14px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-shadow: 0 1px 3px rgba(0,0,0,0.15) !important;
      opacity: 0 !important;
      transition: opacity 0.15s !important;
    }
    .unslop-menu-btn:hover { opacity: 1 !important; }
    .unslop-menu {
      position: absolute !important;
      z-index: 1000 !important;
      background: white !important;
      border: 1px solid #e5e7eb !important;
      border-radius: 8px !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.12) !important;
      padding: 4px !important;
      min-width: 180px !important;
      top: 36px !important;
      right: 4px !important;
    }
    .unslop-menu-item {
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      padding: 6px 10px !important;
      border-radius: 6px !important;
      cursor: pointer !important;
      font-size: 12px !important;
      color: #374151 !important;
      border: none !important;
      background: none !important;
      width: 100% !important;
      text-align: left !important;
    }
    .unslop-menu-item:hover {
      background: #f3f4f6 !important;
    }
  `;
  document.head.appendChild(style);
}

function applyHideMode(el: HTMLElement, mode: 'hide' | 'blur' | 'collapse'): void {
  el.style.position = 'relative';
  if (mode === 'hide') {
    el.setAttribute(PROCESSED_ATTR, 'hidden');
  } else if (mode === 'blur') {
    el.setAttribute(PROCESSED_ATTR, 'blurred');
    el.addEventListener('click', () => {
      el.removeAttribute(PROCESSED_ATTR);
    }, { once: true });
  } else {
    el.setAttribute(PROCESSED_ATTR, 'collapsed');
    el.addEventListener('click', () => {
      el.removeAttribute(PROCESSED_ATTR);
    }, { once: true });
  }
  addMenuButton(el);
}

function addMenuButton(el: HTMLElement): void {
  if (el.querySelector('.unslop-menu-btn')) return;

  const btn = document.createElement('button');
  btn.className = 'unslop-menu-btn';
  btn.textContent = '\u22EF';
  btn.title = 'Unslop options';

  el.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
  el.addEventListener('mouseleave', () => {
    btn.style.opacity = '0';
    el.querySelector('.unslop-menu')?.remove();
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const existing = el.querySelector('.unslop-menu');
    if (existing) { existing.remove(); return; }

    const menu = document.createElement('div');
    menu.className = 'unslop-menu';

    const items = [
      { label: '\uD83D\uDC41 Show Anyway', action: () => { el.removeAttribute(PROCESSED_ATTR); el.querySelector('.unslop-menu')?.remove(); } },
      { label: '\u2705 Always Show Author', action: async () => {
        const handle = el.querySelector<HTMLElement>('[data-testid="User-Name"] span span')?.textContent?.trim();
        if (handle) {
          await sendToBackground({ type: 'WHITELIST_AUTHOR', platform: detectPlatform(), author: handle });
        }
        el.removeAttribute(PROCESSED_ATTR);
        menu.remove();
      }},
      { label: '\uD83D\uDEAB Hide Similar', action: async () => {
        const text = el.innerText?.substring(0, 200) ?? '';
        await sendToBackground({ type: 'HIDE_SIMILAR', post: { platform: detectPlatform()!, text } });
        menu.remove();
      }},
      { label: '\u26A0\uFE0F Wrong Detection', action: async () => {
        const hash = el.getAttribute('data-unslop-hash');
        if (hash) {
          await sendToBackground({ type: 'REPORT_WRONG', hash, wasHidden: true });
        }
        el.removeAttribute(PROCESSED_ATTR);
        menu.remove();
      }},
    ];

    for (const item of items) {
      const menuItem = document.createElement('button');
      menuItem.className = 'unslop-menu-item';
      menuItem.textContent = item.label;
      menuItem.addEventListener('click', (e) => { e.stopPropagation(); item.action(); });
      menu.appendChild(menuItem);
    }
    el.appendChild(menu);
  });

  el.appendChild(btn);
}

// ---------------------------------------------------------------------------
// Core scan + classify loop
// ---------------------------------------------------------------------------

let settings: Settings | null = null;
let isScanning = false;
const processedHashes = new Set<string>();

async function loadSettings(): Promise<Settings> {
  settings = await sendToBackground<Settings>({ type: 'GET_SETTINGS' });
  return settings;
}

async function processPost(post: ExtractedPost, platform: Platform): Promise<void> {
  const s = settings ?? await loadSettings();
  if (!s.enabled || s.paused || !s.platforms[platform]) return;

  const text = normalizeText(post.text);
  if (text.length < LIMITS.minPostChars) return;

  const hash = await hashPostText(post.text);
  if (processedHashes.has(hash)) return;
  processedHashes.add(hash);

  post.el.setAttribute(POST_ID_ATTR, hash.substring(0, 12));

  try {
    const result = await sendToBackground<ClassifyResult>({
      type: 'CLASSIFY_POST',
      post: {
        platform,
        text: post.text,
        author: post.author,
        authorHandle: post.authorHandle,
        verified: post.verified,
        subreddit: post.subreddit,
        company: post.company,
        hashtags: extractHashtags(post.text),
        url: post.url,
      },
    });

    if (result.decision === 'hide') {
      applyHideMode(post.el, s.hideMode);
    }
  } catch {
    // Fail open — don't hide posts on errors
  }
}

async function scan(): Promise<void> {
  if (isScanning) return;
  isScanning = true;

  try {
    const platform = detectPlatform();
    if (!platform) return;

    const s = settings ?? await loadSettings();
    if (!s.enabled || s.paused || !s.platforms[platform]) return;

    const posts = extractPosts(platform);

    // Only process visible posts
    const visible = posts.filter((p) => {
      const rect = p.el.getBoundingClientRect();
      return rect.top < window.innerHeight + 300 && rect.bottom > -300;
    });

    // Notify background about scanned count
    if (visible.length > 0) {
      sendToBackground({ type: 'RECORD_SCANNED', count: visible.length }).catch(() => {});
    }

    // Process sequentially to respect rate limits
    for (const post of visible) {
      await processPost(post, platform);
    }
  } catch {
    // Silently fail
  } finally {
    isScanning = false;
  }
}

// ---------------------------------------------------------------------------
// MutationObserver with debounce
// ---------------------------------------------------------------------------

let observer: MutationObserver | null = null;

function startObserving(): void {
  if (observer) return;

  const debouncedScan = debounce(scan, LIMITS.scanDebounceMs);

  observer = new MutationObserver((mutations) => {
    let hasNewNodes = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        hasNewNodes = true;
        break;
      }
    }
    if (hasNewNodes) debouncedScan();
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// ---------------------------------------------------------------------------
// Listen for broadcasts from background
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: BackgroundBroadcast | { type: string }) => {
    if (message.type === 'SETTINGS_UPDATED') {
      settings = (message as BackgroundBroadcast & { settings: Settings }).settings;
    }
    if (message.type === 'RESCAN') {
      processedHashes.clear();
      scan();
    }
  },
);

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function init(): void {
  injectStyles();
  loadSettings().catch(() => {});

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      startObserving();
      scan();
    });
  } else {
    startObserving();
    scan();
  }
}

init();
