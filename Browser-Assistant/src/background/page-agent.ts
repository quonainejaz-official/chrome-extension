// Bridge between the agent loop and the page. Owns frame fan-out, ref
// remapping and everything that has to happen at the tab level (navigation,
// waiting for loads).

import { snapshotInPage, actInPage, hasTextInPage } from './dom-agent';
import type { PageSnapshot, AgentAction, ActionResult, SnapshotElement } from '../shared/actions';

const MAX_ELEMENTS = 220;
const MAX_SNAPSHOT_TEXT = 6000;
const NAV_SETTLE_MS = 350;

/** Where a globally-numbered ref actually lives. */
interface RefTarget {
  frameId: number;
  localRef: string;
}

export interface TabSnapshot {
  snapshot: PageSnapshot;
  refMap: Map<string, RefTarget>;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Snapshot ────────────────────────────────────────────────────

/**
 * Snapshots the main frame plus any same-origin child frames, then renumbers
 * every ref into one flat namespace so the model never has to think about
 * frames.
 */
export async function snapshotTab(
  tabId: number,
  opts: { wantText?: boolean } = {}
): Promise<TabSnapshot> {
  const wantText = opts.wantText !== false;
  let results: chrome.scripting.InjectionResult<Awaited<ReturnType<typeof snapshotInPage>>>[] = [];

  try {
    results = (await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: snapshotInPage,
      args: [MAX_ELEMENTS, MAX_SNAPSHOT_TEXT, wantText],
    })) as typeof results;
  } catch {
    // allFrames can fail outright on some pages; fall back to the main frame.
    results = (await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: snapshotInPage,
      args: [MAX_ELEMENTS, MAX_SNAPSHOT_TEXT, wantText],
    })) as typeof results;
  }

  // Main frame first so its refs get the low numbers the model sees most.
  const usable = results
    .filter((r) => r && r.result)
    .sort((a, b) => (a.frameId === 0 ? -1 : b.frameId === 0 ? 1 : a.frameId - b.frameId));

  if (usable.length === 0) {
    throw new Error('Could not read the page. It may be a browser system page or still loading.');
  }

  const main = usable[0].result!;
  const refMap = new Map<string, RefTarget>();
  const elements: SnapshotElement[] = [];
  const forms: PageSnapshot['forms'] = [];

  let elementCounter = 0;
  let formCounter = 0;
  let truncated = false;

  for (const entry of usable) {
    const frameId = entry.frameId;
    const frame = entry.result!;
    if (frame.truncated) truncated = true;

    // Local → global ref translation for this frame.
    const localToGlobal = new Map<string, string>();

    for (const form of frame.forms) {
      formCounter++;
      const globalRef = 'f' + formCounter;
      localToGlobal.set(form.ref, globalRef);
      refMap.set(globalRef, { frameId, localRef: form.ref });
      forms.push({ ...form, ref: globalRef });
    }

    for (const el of frame.elements) {
      if (elements.length >= MAX_ELEMENTS) {
        truncated = true;
        break;
      }
      elementCounter++;
      const globalRef = 'e' + elementCounter;
      localToGlobal.set(el.ref, globalRef);
      refMap.set(globalRef, { frameId, localRef: el.ref });
      elements.push({
        ...el,
        ref: globalRef,
        formRef: el.formRef ? localToGlobal.get(el.formRef) : undefined,
      });
    }
  }

  // Text from subframes is appended so embedded forms/checkouts stay readable.
  const frameTexts = usable
    .slice(1)
    .map((r) => r.result!.text)
    .filter((t) => t && t.trim().length > 40);

  const snapshot: PageSnapshot = {
    url: main.url,
    title: main.title,
    elements,
    forms,
    text: [main.text, ...frameTexts].join('\n\n').slice(0, MAX_SNAPSHOT_TEXT),
    scrollY: main.scrollY,
    scrollHeight: main.scrollHeight,
    viewportHeight: main.viewportHeight,
    truncated,
    frameCount: usable.length,
  };

  return { snapshot, refMap };
}

// ── Action execution ────────────────────────────────────────────

const ACTIONS_WITH_REF = ['click', 'fill', 'select', 'setCheckbox', 'hover', 'scrollToElement', 'submit'] as const;

/**
 * Runs one action. Page-level actions are injected into the frame that owns
 * the ref; tab-level actions (navigate, back, wait) run here in the worker.
 */
export async function runAction(
  tabId: number,
  refMap: Map<string, RefTarget>,
  action: AgentAction
): Promise<ActionResult> {
  switch (action.type) {
    case 'navigate': {
      const url = normalizeUrl(action.url);
      if (!url) {
        return { ok: false, message: 'Refused to open "' + action.url + '" — only http(s) URLs are allowed.' };
      }
      await chrome.tabs.update(tabId, { url });
      await waitForTabReady(tabId);
      return { ok: true, message: 'Opened ' + url, navigated: true };
    }

    case 'goBack': {
      try {
        await chrome.tabs.goBack(tabId);
      } catch {
        return { ok: false, message: 'There is no page to go back to.' };
      }
      await waitForTabReady(tabId);
      return { ok: true, message: 'Went back.', navigated: true };
    }

    case 'wait': {
      const budget = Math.min(Math.max(action.ms ?? 1200, 200), 15000);
      if (!action.text) {
        await sleep(budget);
        return { ok: true, message: 'Waited ' + budget + 'ms.' };
      }
      const deadline = Date.now() + Math.max(budget, 8000);
      while (Date.now() < deadline) {
        await sleep(400);
        try {
          const [hit] = await chrome.scripting.executeScript({
            target: { tabId, frameIds: [0] },
            func: hasTextInPage,
            args: [action.text],
          });
          if (hit?.result) return { ok: true, message: 'Text "' + action.text + '" appeared.' };
        } catch {
          // page navigating — keep polling
        }
      }
      return { ok: false, message: 'Timed out waiting for "' + action.text + '" to appear.' };
    }

    case 'readPage':
      return { ok: true, message: 'Re-read the page.' };

    default:
      break;
  }

  // Everything else needs a ref resolved to a frame.
  const needsRef = (ACTIONS_WITH_REF as readonly string[]).indexOf(action.type) >= 0;
  const ref = 'ref' in action ? (action as { ref?: string }).ref : undefined;

  let frameId = 0;
  let localAction: AgentAction = action;

  if (needsRef || ref) {
    if (!ref) return { ok: false, message: 'Action "' + action.type + '" needs a ref but none was given.' };
    const target = refMap.get(ref);
    if (!target) {
      return { ok: false, message: 'Unknown ref "' + ref + '". Use a ref from the latest page snapshot.' };
    }
    frameId = target.frameId;
    localAction = { ...action, ref: target.localRef } as AgentAction;
  }

  let result: ActionResult;
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      func: actInPage,
      args: [localAction as unknown as AgentAction],
    });
    result = (injection?.result as ActionResult) ?? { ok: false, message: 'No result from the page.' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // A frame that navigated away mid-action throws — that is usually success.
    if (/frame|destroyed|no tab|closed/i.test(msg)) {
      await waitForTabReady(tabId);
      return { ok: true, message: 'The action caused the page to navigate.', navigated: true };
    }
    return { ok: false, message: 'Could not run the action: ' + msg };
  }

  // Clicks and submits often kick off a load; give it a beat before the next
  // snapshot so we do not read a half-built page.
  if (result.navigated || action.type === 'click' || action.type === 'submit') {
    await waitForTabReady(tabId, result.navigated ? 12000 : 2500);
  } else {
    await sleep(NAV_SETTLE_MS);
  }

  return result;
}

// ── Tab helpers ─────────────────────────────────────────────────

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function waitForTabReady(tabId: number, timeout = 10000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    let tab: chrome.tabs.Tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      return; // tab closed
    }
    if (tab.status === 'complete') {
      await sleep(NAV_SETTLE_MS);
      return;
    }
    await sleep(150);
  }
}
