import type {
  ApiResponse,
  BackgroundBroadcast,
  ClassifyResult,
  ContentRequest,
  RuntimeRequest,
  Settings,
  StatusSnapshot,
} from '@/types';
import { COMMANDS, CONTEXT_MENU_IDS, LIMITS } from '@/constants';
import { hashPostText } from '@/utils/hash';
import { normalizeText } from '@/utils/text';
import {
  settingsManager,
  cacheManager,
  statsManager,
  healthMonitor,
  logger,
  QueueManager,
} from '@/services';
import { classifyPost, testProfile } from '@/llm';

const queue = new QueueManager();

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  const settings = await settingsManager.get();
  logger.configure({ debug: settings.debug });

  // Update health based on whether a key is configured
  const profile = settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0];
  if (!profile || !profile.apiKey) {
    await healthMonitor.markUnconfigured();
  }

  setupContextMenu();
  setupCommands();
  setupMessageListener();
  setupSettingsBroadcast();

  logger.info('system', 'Background service worker initialized');
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

function setupMessageListener(): void {
  chrome.runtime.onMessage.addListener(
    (
      message: RuntimeRequest,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: ApiResponse<unknown>) => void,
    ) => {
      if (!message?.type) return false;

      handleRequest(message, sender)
        .then((res) => sendResponse(res))
        .catch((err) => {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
        });

      // Return true to indicate async sendResponse.
      return true;
    },
  );
}

async function handleRequest(
  msg: RuntimeRequest,
  sender: chrome.runtime.MessageSender,
): Promise<ApiResponse<unknown>> {
  switch (msg.type) {
    // ---- Content script messages -----------------------------------------
    case 'CLASSIFY_POST':
      return handleClassifyPost(msg, sender);
    case 'GET_SETTINGS':
      return ok(await settingsManager.get());
    case 'RECORD_SCANNED':
      statsManager.recordScanned(msg.count);
      return ok({ ok: true as const });
    case 'REPORT_WRONG':
      await cacheManager.delete(msg.hash);
      return ok({ ok: true as const });
    case 'WHITELIST_AUTHOR':
      return ok(await settingsManager.addWhitelistAuthor(msg.platform, msg.author));
    case 'BLACKLIST_AUTHOR':
      return ok(await settingsManager.addBlacklistAuthor(msg.platform, msg.author));
    case 'HIDE_SIMILAR': {
      const keywords = msg.post.text
        .split(/\s+/)
        .filter((w) => w.length > 4)
        .slice(0, 3);
      await settingsManager.addBlacklistKeywords(keywords);
      return ok({ added: keywords });
    }

    // ---- UI messages -----------------------------------------------------
    case 'GET_STATUS':
      return ok(await buildStatusSnapshot());
    case 'GET_STATS':
      return ok(await statsManager.get());
    case 'RESET_STATS':
      return ok(await statsManager.reset());
    case 'GET_LOGS':
      return ok(await logger.getLogs());
    case 'CLEAR_LOGS':
      await logger.clear();
      return ok({ ok: true as const });
    case 'GET_QUEUE_STATUS':
      return ok(queue.status());
    case 'GET_API_HEALTH':
      return ok(await healthMonitor.get());
    case 'TEST_API':
      return ok(await handleTestApi(msg.profileId));
    case 'GET_CACHE_STATS':
      return ok(await cacheManager.stats());
    case 'CLEAR_CACHE':
      return ok(await cacheManager.clear());
    case 'TOGGLE_ENABLED': {
      const s = await settingsManager.toggleEnabled();
      return ok({ enabled: s.enabled });
    }
    case 'TOGGLE_PAUSE': {
      const s = await settingsManager.togglePaused();
      return ok({ paused: s.paused });
    }
    case 'RESCAN_ACTIVE_TAB':
      await rescanActiveTab();
      return ok({ ok: true as const });

    default: {
      const _exhaustive: never = msg;
      return { ok: false, error: `Unknown message type: ${JSON.stringify(_exhaustive)}` };
    }
  }
}

// ---------------------------------------------------------------------------
// Classification pipeline
// ---------------------------------------------------------------------------

async function handleClassifyPost(
  msg: Extract<ContentRequest, { type: 'CLASSIFY_POST' }>,
  _sender: chrome.runtime.MessageSender,
): Promise<ApiResponse<ClassifyResult>> {
  const settings = await settingsManager.get();

  if (!settings.enabled || settings.paused) {
    return ok(makeResult(msg.post.text, 'keep', 'disabled', 'skipped', 1));
  }

  // Check platform toggle
  if (!settings.platforms[msg.post.platform]) {
    return ok(makeResult(msg.post.text, 'keep', 'disabled', 'skipped', 1));
  }

  const hash = await hashPostText(msg.post.text);

  // Short posts are always kept
  const normalized = normalizeText(msg.post.text);
  if (normalized.length < LIMITS.minPostChars) {
    return ok(makeResult(msg.post.text, 'keep', 'whitelist', 'cache', 1, hash));
  }

  // Cache check
  const cached = await cacheManager.get(hash);
  if (cached) {
    logger.debug('cache', `Cache hit for ${hash.substring(0, 8)}`);
    return ok({
      hash,
      decision: cached.decision,
      confidence: cached.confidence,
      source: 'cache',
      cached: true,
    });
  }

  // Whitelist check
  const handleLower = (msg.post.authorHandle ?? '').toLowerCase();
  if (settings.whitelist.authors.some((a) => a.toLowerCase() === handleLower)) {
    const entry = { decision: 'keep' as const, confidence: 1, ts: Date.now(), model: 'whitelist' };
    await cacheManager.set(hash, entry);
    return ok(makeResult(msg.post.text, 'keep', 'whitelist', 'whitelist', 1, hash));
  }

  // Blacklist check
  const bl = settings.blacklist;
  if (bl.authors.some((a) => a.toLowerCase() === handleLower)) {
    const entry = { decision: 'hide' as const, confidence: 1, ts: Date.now(), model: 'blacklist' };
    await cacheManager.set(hash, entry);
    return ok(makeResult(msg.post.text, 'hide', 'blacklist', 'blacklist', 1, hash, 'blacklist:author'));
  }
  const textLower = msg.post.text.toLowerCase();
  for (const kw of bl.keywords) {
    if (textLower.includes(kw.toLowerCase())) {
      const entry = { decision: 'hide' as const, confidence: 1, ts: Date.now(), model: 'blacklist' };
      await cacheManager.set(hash, entry);
      return ok(makeResult(msg.post.text, 'hide', 'blacklist', 'blacklist', 1, hash, `blacklist:keyword:${kw}`));
    }
  }
  for (const ht of bl.hashtags) {
    if (textLower.includes(ht.toLowerCase())) {
      const entry = { decision: 'hide' as const, confidence: 1, ts: Date.now(), model: 'blacklist' };
      await cacheManager.set(hash, entry);
      return ok(makeResult(msg.post.text, 'hide', 'blacklist', 'blacklist', 1, hash, `blacklist:hashtag:${ht}`));
    }
  }

  // Queue for LLM classification
  const profile = settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0];
  if (!profile || !profile.apiKey) {
    await healthMonitor.markUnconfigured();
    return ok(makeResult(msg.post.text, 'keep', 'error', 'skipped', 1, hash, 'No API key'));
  }

  try {
    const outcome = await queue.enqueue(hash, (signal) =>
      classifyPost(profile, msg.post, settings.sensitivity, { signal }),
    );

    const decision = outcome.parsed.decision;
    const confidence = outcome.parsed.confidence;
    const shouldHide = decision === 'hide' && confidence >= settings.confidenceThreshold;

    await cacheManager.set(hash, {
      decision: shouldHide ? 'hide' : 'keep',
      confidence,
      ts: Date.now(),
      model: outcome.model,
    });

    statsManager.recordApiCall({
      promptTokens: outcome.usage.promptTokens,
      completionTokens: outcome.usage.completionTokens,
      cost: outcome.costUsd,
    });

    await healthMonitor.markSuccess(outcome.latencyMs);

    if (shouldHide) statsManager.recordHidden();

    logger.info('classify', `Classified ${hash.substring(0, 8)} → ${decision} (${confidence.toFixed(2)})`, {
      latency: outcome.latencyMs,
      tokens: outcome.usage.totalTokens,
    });

    return ok({
      hash,
      decision: shouldHide ? 'hide' : 'keep',
      confidence,
      source: 'llm',
      cached: false,
    });
  } catch (err) {
    statsManager.recordError();
    const msg_ = err instanceof Error ? err.message : String(err);
    await healthMonitor.markError(msg_);
    logger.error('llm', `Classification failed for ${hash.substring(0, 8)}: ${msg_}`);
    return ok(makeResult(msg.post.text, 'keep', 'error', 'error', 0, hash, msg_));
  }
}

function makeResult(
  _text: string,
  decision: 'keep' | 'hide',
  _source: ClassifyResult['source'],
  classificationSource: ClassifyResult['source'],
  confidence: number,
  hash?: string,
  reason?: string,
): ClassifyResult {
  return {
    hash: hash ?? 'pending',
    decision,
    confidence,
    source: classificationSource,
    cached: false,
    reason,
  };
}

// ---------------------------------------------------------------------------
// Status snapshot for popup
// ---------------------------------------------------------------------------

async function buildStatusSnapshot(): Promise<StatusSnapshot> {
  const settings = await settingsManager.get();
  const stats = await statsManager.get();
  const today = await statsManager.getToday();
  const health = await healthMonitor.get();
  const profile = settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0];

  return {
    enabled: settings.enabled,
    paused: settings.paused,
    today,
    totals: stats.totals,
    queue: queue.status(),
    health,
    activeProfileName: profile?.name ?? 'None',
    activeModel: profile?.model ?? 'Not configured',
  };
}

// ---------------------------------------------------------------------------
// API test
// ---------------------------------------------------------------------------

async function handleTestApi(profileId?: string): Promise<StatusSnapshot['health']> {
  const settings = await settingsManager.get();
  const profile = profileId
    ? settings.profiles.find((p) => p.id === profileId)
    : settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0];

  if (!profile || !profile.apiKey) {
    await healthMonitor.markUnconfigured();
    return healthMonitor.get();
  }

  await healthMonitor.markTesting();
  const result = await testProfile(profile);

  if (result.ok) {
    await healthMonitor.markSuccess(result.latencyMs ?? 0);
  } else {
    await healthMonitor.markError(result.message);
  }

  return healthMonitor.get();
}

// ---------------------------------------------------------------------------
// Rescan
// ---------------------------------------------------------------------------

async function rescanActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  const broadcast: BackgroundBroadcast = { type: 'RESCAN' };
  chrome.tabs.sendMessage(tab.id, broadcast).catch(() => {
    // Tab might not have a content script injected
  });
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

function setupContextMenu(): void {
  const safeCreate = (opts: chrome.contextMenus.CreateProperties) => {
    chrome.contextMenus?.create(opts, () => {
      void chrome.runtime.lastError;
    });
  };

  safeCreate({
    id: CONTEXT_MENU_IDS.toggleEnabled,
    title: 'Unslop: Toggle enabled',
    contexts: ['action'],
  });

  safeCreate({
    id: CONTEXT_MENU_IDS.togglePause,
    title: 'Unslop: Toggle pause',
    contexts: ['action'],
  });

  safeCreate({
    id: CONTEXT_MENU_IDS.rescan,
    title: 'Unslop: Rescan page',
    contexts: ['action'],
  });

  safeCreate({
    id: CONTEXT_MENU_IDS.openOptions,
    title: 'Unslop: Open settings',
    contexts: ['action'],
  });

  chrome.contextMenus?.onClicked.addListener(async (info) => {
    switch (info.menuItemId) {
      case CONTEXT_MENU_IDS.toggleEnabled:
        await settingsManager.toggleEnabled();
        break;
      case CONTEXT_MENU_IDS.togglePause:
        await settingsManager.togglePaused();
        break;
      case CONTEXT_MENU_IDS.rescan:
        await rescanActiveTab();
        break;
      case CONTEXT_MENU_IDS.openOptions:
        chrome.runtime.openOptionsPage();
        break;
    }
  });
}

// ---------------------------------------------------------------------------
// Keyboard commands
// ---------------------------------------------------------------------------

function setupCommands(): void {
  chrome.commands?.onCommand.addListener(async (command) => {
    switch (command) {
      case COMMANDS.toggleEnabled:
        await settingsManager.toggleEnabled();
        break;
      case COMMANDS.togglePause:
        await settingsManager.togglePaused();
        break;
      case COMMANDS.rescan:
        await rescanActiveTab();
        break;
    }
  });
}

// ---------------------------------------------------------------------------
// Settings broadcast to content scripts
// ---------------------------------------------------------------------------

function setupSettingsBroadcast(): void {
  settingsManager.onChange((settings) => {
    const broadcast: BackgroundBroadcast = { type: 'SETTINGS_UPDATED', settings };
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, broadcast).catch(() => {
            // Content script might not be loaded on this tab
          });
        }
      }
    });
    updateBadge(settings);
  });
}

// ---------------------------------------------------------------------------
// Badge management
// ---------------------------------------------------------------------------

function updateBadge(settings: Settings): void {
  if (!settings.showBadge) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  // We don't persist hidden count across restarts; it resets to 0.
  // The badge shows cumulative hidden from the current session.
  // For a real production app you'd track this in statsManager.
  statsManager.getToday().then((today) => {
    const text = today.hidden > 0 ? String(today.hidden) : '';
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: '#4f46e5' });
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => void init());
chrome.runtime.onStartup.addListener(() => void init());
// Also init immediately in case the service worker is already alive.
void init();

// Helper
function ok<T>(data: T): ApiResponse<T> {
  return { ok: true, data };
}
