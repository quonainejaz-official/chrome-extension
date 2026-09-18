import { detectHandoff, looksLikeHandoff } from './api-client';
import { sendChatMessageWithFallback } from './model-router';
import {
  getSettings,
  saveSettings,
  getConversations,
  getConversation,
  saveConversation,
  deleteConversation,
  getCachedPageContext,
  cachePageContext,
} from './storage';
import {
  extractFromActiveTab,
  getActiveTabId,
  getActiveTab,
} from './content-bridge';
import { runAgent, type ConfirmationRequest } from './agent';
import type {
  ToBackgroundMessage,
  FromBackgroundMessage,
  Conversation,
  Message,
  PageContext,
  Settings,
  ResolvedModel,
  CustomModel,
  AssistantMode,
} from '../shared/types';
import type { AgentStep } from '../shared/actions';
import {
  OPENCODE_ZEN_BASE_URL,
  DEFAULT_OPENCODE_ZEN_KEY,
  DEFAULT_MODEL_ID,
  DEFAULT_ZENMUX_API_KEY,
  ZENMUX_AUTO_MODEL_ID,
  ZENMUX_BASE_URL,
  ZENMUX_PRIORITY_MODELS,
} from '../shared/constants';

function generateId(): string {
  return crypto.randomUUID();
}

// ── Agent run state ─────────────────────────────────────────────

/** Only one run at a time — two agents fighting over one tab helps nobody. */
let activeRun: { id: string; cancelled: boolean } | null = null;

/** Confirmation cards awaiting an answer from the side panel. */
const pendingConfirmations = new Map<string, (approved: boolean) => void>();

// The panel may be closed, in which case there is nobody to receive the event.
function broadcast(message: FromBackgroundMessage): void {
  try {
    // Use the callback form so a sleeping/closed side panel cannot create an
    // unhandled rejected Promise while a response is being streamed.
    chrome.runtime.sendMessage(message, () => void chrome.runtime.lastError);
  } catch {
    // The side panel may be closed between two streamed chunks.
  }
}

interface AgentRunRequest {
  goal: string;
  conversation: Conversation;
  priorMessages: Message[];
  settings: Settings;
  models: ResolvedModel[];
  mode?: AssistantMode;
  tabId: number;
}

/**
 * Drives one agent run and persists its result. Shared by the explicit
 * RUN_AGENT path and by SEND_MESSAGE, which reaches it when the model decides
 * the user asked for something to be done rather than explained.
 */
async function startAgentRun(request: AgentRunRequest): Promise<FromBackgroundMessage> {
  const { goal, conversation, priorMessages, settings, models, tabId } = request;
  const runId = generateId();
  activeRun = { id: runId, cancelled: false };

  let result: { summary: string; steps: AgentStep[]; incomplete: boolean };
  try {
    result = await runAgent({
      runId,
      tabId,
      goal,
      history: priorMessages,
      settings,
      models,
      emitStep: (step) => broadcast({ type: 'AGENT_STEP', payload: { runId, step } }),
      emitStatus: (kind, text) => broadcast({ type: 'AGENT_STATUS', payload: { runId, kind, text } }),
      requestConfirmation: (confirmation) => askForConfirmation(runId, confirmation),
      isCancelled: () => activeRun?.cancelled ?? true,
    });
  } catch (err) {
    result = {
      summary: 'The run stopped unexpectedly: ' + (err instanceof Error ? err.message : String(err)),
      steps: [],
      incomplete: true,
    };
  } finally {
    activeRun = null;
    for (const resolve of pendingConfirmations.values()) resolve(false);
    pendingConfirmations.clear();
  }

  const assistantMessage: Message = {
    id: generateId(),
    role: 'assistant',
    content: result.summary,
    timestamp: Date.now(),
    metadata: { agent: true, steps: result.steps, model: models[0]?.model },
  };
  conversation.messages.push(assistantMessage);
  if (conversation.messages.filter((m) => m.role === 'user').length === 1) {
    conversation.title = generateTitle(goal);
  }
  conversation.updatedAt = Date.now();
  await saveConversation(conversation);

  const finished: FromBackgroundMessage = {
    type: 'AGENT_FINISHED',
    payload: {
      runId,
      conversationId: conversation.id,
      messageId: assistantMessage.id,
      content: result.summary,
      steps: result.steps,
      incomplete: result.incomplete,
    },
  };
  // Also broadcast so the conversation list refreshes even though the caller
  // gets this same object as its response.
  broadcast(finished);
  return finished;
}

function askForConfirmation(runId: string, request: ConfirmationRequest): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (approved: boolean) => {
      if (settled) return;
      settled = true;
      pendingConfirmations.delete(request.id);
      resolve(approved);
    };

    pendingConfirmations.set(request.id, finish);
    broadcast({
      type: 'AGENT_CONFIRM_REQUEST',
      payload: { runId, ...request },
    });

    // If the user walks away, treat silence as "no" rather than hanging the
    // service worker forever.
    setTimeout(() => finish(false), 5 * 60 * 1000);
  });
}

// Turn the user's selection into an ordered list of concrete candidates.
// The automatic default tries ZenMux by availability, then OpenCode Zen.
// Custom and explicitly selected OpenCode models remain opt-in overrides.
function resolveModels(settings: Settings): ResolvedModel[] {
  const selected = settings.selectedModel || DEFAULT_MODEL_ID;

  if (selected.startsWith('custom:')) {
    const custom = settings.customModels?.find((m) => `custom:${m.id}` === selected);
    if (custom) {
      return [{
        endpoint: custom.endpoint,
        model: custom.model,
        apiKey: custom.apiKey ?? '',
        provider: 'custom',
        label: custom.label,
      }];
    }
  }

  const openCodeFallback: ResolvedModel = {
    endpoint: OPENCODE_ZEN_BASE_URL,
    model: selected === ZENMUX_AUTO_MODEL_ID || selected.startsWith('custom:') ? DEFAULT_MODEL_ID : selected,
    apiKey: settings.apiKey?.trim() || DEFAULT_OPENCODE_ZEN_KEY,
    provider: 'opencode',
    label: 'OpenCode Zen',
  };

  if (selected === ZENMUX_AUTO_MODEL_ID) {
    const zenMuxCandidates = DEFAULT_ZENMUX_API_KEY
      ? ZENMUX_PRIORITY_MODELS.map((model) => ({
          endpoint: ZENMUX_BASE_URL,
          model: model.id,
          apiKey: DEFAULT_ZENMUX_API_KEY,
          provider: 'zenmux' as const,
          label: `ZenMux · ${model.label}`,
        }))
      : [];
    return [...zenMuxCandidates, openCodeFallback];
  }

  return [openCodeFallback];
}

function resolveTestEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  if (/\/chat\/completions\/?$/i.test(trimmed)) return trimmed;
  return new URL('chat/completions', trimmed.endsWith('/') ? trimmed : `${trimmed}/`).toString();
}

async function testCustomModelConnection(model: CustomModel): Promise<{ ok: boolean; message: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (model.apiKey?.trim()) headers.Authorization = `Bearer ${model.apiKey.trim()}`;
    const response = await fetch(resolveTestEndpoint(model.endpoint), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model.model,
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        stream: false,
        max_tokens: 4,
      }),
      signal: controller.signal,
    });
    if (response.ok) return { ok: true, message: 'Connection successful.' };
    const body = await response.text();
    let detail = body;
    try {
      const parsed = JSON.parse(body);
      detail = parsed?.error?.message ?? parsed?.message ?? body;
    } catch {
      // Keep the provider's plain-text error.
    }
    return { ok: false, message: `${response.status}: ${String(detail).slice(0, 180)}` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof DOMException && error.name === 'AbortError' ? 'Connection timed out.' : 'Could not reach this endpoint.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

function generateTitle(content: string): string {
  const trimmed = content.trim().slice(0, 60);
  return trimmed.length < content.trim().length ? trimmed + '...' : trimmed;
}

function isDirectDeveloperTask(content: string): boolean {
  return /\b(inspect|audit|debug|smoke\s*test|reproduce|regression\s*test|qa\s+(?:this|the)\s+(?:page|ui|screen)|validate\s+(?:this|the)\s+(?:page|ui|screen)|check\s+(?:the\s+)?(?:ui|page|screen)|try\s+(?:the\s+)?buttons?|interact\s+with\s+(?:the\s+)?page|live\s+(?:ui\s+)?test)\b/i.test(content);
}

// ── Side Panel Message Handler ──────────────────────────────────

async function handleSidePanelMessage(
  message: ToBackgroundMessage,
  sender: chrome.runtime.MessageSender
): Promise<FromBackgroundMessage> {
  switch (message.type) {
    case 'SEND_MESSAGE': {
      const { content, conversationId, includePageContext, mode = 'general' } = message.payload;
      const settings = await getSettings();

      // Get or create conversation
      let conversation: Conversation;
      if (conversationId) {
        const existing = await getConversation(conversationId);
        if (!existing) {
          return { type: 'ERROR', payload: { code: 'NOT_FOUND', message: 'Conversation not found', retryable: false } };
        }
        conversation = existing;
      } else {
        const tabId = await getActiveTabId();
        const tab = tabId ? await chrome.tabs.get(tabId) : null;
        conversation = {
          id: generateId(),
          title: generateTitle(content),
          tabUrl: tab?.url ?? '',
          tabTitle: tab?.title ?? '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
          archived: false,
        };
      }

      // Add user message
      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        content,
        timestamp: Date.now(),
      };
      conversation.messages.push(userMessage);

      // Get page context if the per-message toggle is on. (The toggle is
      // initialized from settings.autoContext in the UI, so we don't gate on
      // autoContext again here — that double-gate previously suppressed context.)
      let pageContext: PageContext | undefined;
      if (includePageContext) {
        const extracted = await extractFromActiveTab();
        if (extracted && extracted.content.trim()) {
          pageContext = {
            url: extracted.url,
            title: extracted.title,
            content: extracted.content,
            selectedText: extracted.selectedText || undefined,
            language: extracted.language,
            pageType: extracted.pageType,
            extractedAt: Date.now(),
          };
          const tabId = await getActiveTabId();
          if (tabId) await cachePageContext(tabId, pageContext);
        } else {
          // Extraction failed (system page, login-gated PDF, empty doc…).
          // Tell the model honestly instead of letting it invent a "paste the
          // text" reply as if the feature didn't exist.
          const tab = await getActiveTab();
          pageContext = {
            url: tab?.url ?? '',
            title: tab?.title ?? 'Current tab',
            content:
              '[The current page could not be read automatically. This usually happens on browser system pages (chrome://, the Chrome Web Store, the new-tab page), local files without file access enabled, or PDFs that require login. Let the user know their current page cannot be accessed and suggest opening a normal web page or reloading, rather than asking them to paste content.]',
            language: 'en',
            pageType: 'unknown',
            extractedAt: Date.now(),
          };
        }
        conversation.pageContext = pageContext;
      }

      // Save conversation before API call
      conversation.updatedAt = Date.now();
      await saveConversation(conversation);

      // Create assistant message placeholder
      const assistantMessageId = generateId();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        metadata: { pageContextIncluded: !!pageContext },
      };
      conversation.messages.push(assistantMessage);

      // Resolve which provider/model/key to use.
      const modelConfigs = resolveModels(settings);

      // Custom endpoints may legitimately need no key. Automatic routing can
      // still use OpenCode Zen if the ZenMux build-time key is absent.
      if (modelConfigs.length === 0 || modelConfigs.every((candidate) => !candidate.apiKey && candidate.provider !== 'custom')) {
        assistantMessage.content =
          'No API key available. Configure a ZenMux or OpenCode Zen key, or select a custom model in Settings.';
        conversation.updatedAt = Date.now();
        await saveConversation(conversation);
        broadcast({
          type: 'AI_RESPONSE_CHUNK',
          payload: {
            conversationId: conversation.id,
            messageId: assistantMessageId,
            content: assistantMessage.content,
            done: true,
          },
        });
        return {
          type: 'AI_RESPONSE_CHUNK',
          payload: {
            conversationId: conversation.id,
            messageId: assistantMessageId,
            content: assistantMessage.content,
            done: true,
          },
        };
      }

      // The assistant may act on the page rather than answer, but only where
      // acting is actually possible: enabled in Settings, on a real http(s)
      // page, and with no other run already in flight.
      const activeTab = await getActiveTab();
      const canAct =
        settings.agentEnabled && !activeRun && !!activeTab?.id && /^https?:/i.test(activeTab.url ?? '');
      const directDeveloperTask = mode === 'developer' && isDirectDeveloperTask(content);

      // Do not silently downgrade an explicit live QA request into the static
      // chat path. Explain the missing prerequisite so the user can fix it.
      if (directDeveloperTask && !canAct) {
        assistantMessage.content = !settings.agentEnabled
          ? 'Live Developer QA is switched off. Turn on "Let the assistant act on pages" in Settings and ask me again.'
          : activeRun
            ? 'A Developer QA run is already in progress. Let it finish, or press Stop, then ask me again.'
            : !activeTab?.id || !/^https?:/i.test(activeTab.url ?? '')
              ? 'Live Developer QA needs a normal website tab. Open an http(s) page and ask me again.'
              : 'I could not start the live Developer QA run. Please ask me again.';
        assistantMessage.timestamp = Date.now();
        conversation.updatedAt = Date.now();
        await saveConversation(conversation);
        broadcast({
          type: 'AI_RESPONSE_CHUNK',
          payload: {
            conversationId: conversation.id,
            messageId: assistantMessageId,
            content: assistantMessage.content,
            done: true,
          },
        });
        return {
          type: 'AI_RESPONSE_CHUNK',
          payload: {
            conversationId: conversation.id,
            messageId: assistantMessageId,
            content: assistantMessage.content,
            done: true,
          },
        };
      }

      // Developer QA requests are operational by definition. Do not ask the
      // chat model to decide whether "inspect/debug/test" means live work —
      // that is what previously produced a static read-only answer. Start the
      // browser agent directly, while keeping the existing safety policy for
      // consequential actions inside the run.
      if (directDeveloperTask && canAct && activeTab?.id) {
        conversation.messages.pop(); // remove the empty assistant placeholder
        conversation.updatedAt = Date.now();
        await saveConversation(conversation);

        const agentRequest: AgentRunRequest = {
          goal: content,
          conversation,
          priorMessages: conversation.messages.slice(),
          settings,
          models: modelConfigs,
          mode,
          tabId: activeTab.id,
        };
        setTimeout(() => {
          void startAgentRun(agentRequest).catch((err) => {
            broadcast({
              type: 'AGENT_FINISHED',
              payload: {
                runId: generateId(),
                conversationId: conversation.id,
                messageId: generateId(),
                content: 'The developer run stopped unexpectedly: ' + (err instanceof Error ? err.message : String(err)),
                steps: [],
                incomplete: true,
              },
            });
          });
        }, 0);
        return { type: 'REQUEST_ACCEPTED', payload: { conversationId: conversation.id } };
      }

      // Stream response
      let fullContent = '';
      let chatFailed = false;
      let lastStreamBroadcastAt = 0;
      const broadcastStreamChunk = (chunked: string, done = false) => {
        broadcast({
          type: 'AI_RESPONSE_CHUNK',
          payload: {
            conversationId: conversation.id,
            messageId: assistantMessageId,
            content: chunked,
            done,
          },
        });
      };
      try {
        await sendChatMessageWithFallback(
          modelConfigs,
          content,
          pageContext,
          conversation.messages.slice(0, -1), // Exclude the empty assistant message
          {
            onChunk: (chunked) => {
              fullContent = chunked;
              // Action requests can still produce a normal answer. Only hold
              // back a response that looks like the short JSON handoff marker
              // so the internal protocol never flashes in the chat bubble.
              const possibleHandoff = canAct && chunked.trimStart().startsWith('{') && chunked.length < 700;
              if (!possibleHandoff) {
                const now = performance.now();
                if (now - lastStreamBroadcastAt >= 50 || chunked.length <= 1) {
                  lastStreamBroadcastAt = now;
                  broadcastStreamChunk(chunked);
                }
              }
            },
            onDone: (completed) => {
              fullContent = completed;
            },
            onError: (err) => {
              fullContent = `Error: ${err.message}`;
              chatFailed = true;
            },
          },
          canAct,
          mode
        );
      } catch (err) {
        fullContent = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
        chatFailed = true;
      }

      // Did the model decide this was a job rather than a question?
      let handoff: { goal: string } | null = null;
      if (!chatFailed) {
        handoff = canAct && activeTab?.id ? detectHandoff(fullContent) : null;
        if (handoff && activeTab?.id) {
          // Drop the placeholder — the sentinel is plumbing, not an answer.
          conversation.messages.pop();
          conversation.updatedAt = Date.now();
          await saveConversation(conversation);

          const agentRequest: AgentRunRequest = {
            goal: handoff.goal || content,
            conversation,
            priorMessages: conversation.messages.slice(0, -1),
            settings,
            models: modelConfigs,
            mode,
            tabId: activeTab.id,
          };
          // Agent runs can take minutes. Return an acknowledgement now and
          // deliver the eventual result through the existing broadcast events;
          // keeping a one-shot sendMessage channel open for the whole run is
          // what produces Chrome's "message channel closed" error.
          setTimeout(() => {
            void startAgentRun(agentRequest).catch((err) => {
              broadcast({
                type: 'AGENT_FINISHED',
                payload: {
                  runId: generateId(),
                  conversationId: conversation.id,
                  messageId: generateId(),
                  content: 'The agent stopped unexpectedly: ' + (err instanceof Error ? err.message : String(err)),
                  steps: [],
                  incomplete: true,
                },
              });
            });
          }, 0);
          return { type: 'REQUEST_ACCEPTED', payload: { conversationId: conversation.id } };
        }

        // The model asked to act but we could not start a run, or the sentinel
        // was malformed. Either way the raw marker must never reach the user.
        if (looksLikeHandoff(fullContent)) {
          fullContent = !settings.agentEnabled
            ? 'I can only read this page — acting on pages is switched off in Settings. Turn on "Let the assistant act on pages" and ask me again.'
            : activeRun
              ? 'I am already working on the page. Let that finish, or press Stop, then ask me again.'
              : !activeTab?.id || !/^https?:/i.test(activeTab.url ?? '')
                ? 'I cannot act on this page — Chrome blocks automation on browser system pages. Open a normal website and ask me again.'
                : 'I could not start working on the page. Please ask me again.';
        }
      }

      // Update assistant message
      assistantMessage.content = fullContent;
      assistantMessage.timestamp = Date.now();
      conversation.updatedAt = Date.now();

      // Auto-generate title from first user message
      if (conversation.messages.filter((m) => m.role === 'user').length === 1) {
        conversation.title = generateTitle(content);
      }

      await saveConversation(conversation);

      // The final event also reconciles any throttled chunk and lets the
      // sidepanel stop its loading state immediately.
      if (!handoff) broadcastStreamChunk(fullContent, true);

      return {
        type: 'AI_RESPONSE_CHUNK',
        payload: {
          conversationId: conversation.id,
          messageId: assistantMessageId,
          content: fullContent,
          done: true,
        },
      };
    }

    case 'RUN_AGENT': {
      const { goal, conversationId } = message.payload;
      const settings = await getSettings();

      if (!settings.agentEnabled) {
        return { type: 'ERROR', payload: { code: 'AGENT_DISABLED', message: 'Agent mode is turned off in Settings.', retryable: false } };
      }
      if (activeRun) {
        return { type: 'ERROR', payload: { code: 'AGENT_BUSY', message: 'An agent run is already in progress.', retryable: true } };
      }

      const tab = await getActiveTab();
      if (!tab?.id) {
        return { type: 'ERROR', payload: { code: 'NO_TAB', message: 'No web page to work on. Open a normal http(s) page first.', retryable: true } };
      }
      if (!/^https?:/i.test(tab.url ?? '')) {
        return {
          type: 'ERROR',
          payload: {
            code: 'RESTRICTED_PAGE',
            message: 'Chrome blocks automation on this page (chrome://, the Web Store and the new-tab page). Open a normal website and try again.',
            retryable: false,
          },
        };
      }

      const modelConfigs = resolveModels(settings);
      if (modelConfigs.length === 0 || modelConfigs.every((candidate) => !candidate.apiKey && candidate.provider !== 'custom')) {
        return { type: 'ERROR', payload: { code: 'NO_KEY', message: 'No API key available. Configure a ZenMux or OpenCode Zen key in Settings.', retryable: false } };
      }

      // Get or create the conversation and record the user's goal.
      let conversation: Conversation;
      if (conversationId) {
        const existing = await getConversation(conversationId);
        if (!existing) {
          return { type: 'ERROR', payload: { code: 'NOT_FOUND', message: 'Conversation not found', retryable: false } };
        }
        conversation = existing;
      } else {
        conversation = {
          id: generateId(),
          title: generateTitle(goal),
          tabUrl: tab.url ?? '',
          tabTitle: tab.title ?? '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
          archived: false,
        };
      }

      const priorMessages = conversation.messages.slice();
      conversation.messages.push({
        id: generateId(),
        role: 'user',
        content: goal,
        timestamp: Date.now(),
      });
      conversation.updatedAt = Date.now();
      await saveConversation(conversation);

      return startAgentRun({ goal, conversation, priorMessages, settings, models: modelConfigs, tabId: tab.id });
    }

    case 'AGENT_CONFIRM_DECISION': {
      const resolve = pendingConfirmations.get(message.payload.id);
      if (resolve) resolve(message.payload.approved);
      return { type: 'PANEL_TOGGLED' };
    }

    case 'CANCEL_AGENT': {
      if (activeRun) activeRun.cancelled = true;
      for (const resolve of pendingConfirmations.values()) resolve(false);
      pendingConfirmations.clear();
      return { type: 'PANEL_TOGGLED' };
    }

    case 'GET_PAGE_CONTEXT': {
      const extracted = await extractFromActiveTab();
      if (!extracted || !extracted.content.trim()) {
        return { type: 'ERROR', payload: { code: 'NO_CONTEXT', message: 'Could not read the current page', retryable: true } };
      }

      const context: PageContext = {
        url: extracted.url,
        title: extracted.title,
        faviconUrl: (await getActiveTab())?.favIconUrl,
        content: extracted.content,
        selectedText: extracted.selectedText || undefined,
        language: extracted.language,
        pageType: extracted.pageType,
        extractedAt: Date.now(),
      };

      const tabId = await getActiveTabId();
      if (tabId) await cachePageContext(tabId, context);

      return { type: 'PAGE_CONTEXT', payload: context };
    }

    case 'GET_CONVERSATIONS': {
      const conversations = await getConversations();
      return { type: 'CONVERSATIONS', payload: conversations };
    }

    case 'GET_CONVERSATION': {
      const conversation = await getConversation(message.payload.id);
      if (!conversation) {
        return { type: 'ERROR', payload: { code: 'NOT_FOUND', message: 'Conversation not found', retryable: false } };
      }
      return { type: 'CONVERSATION', payload: conversation };
    }

    case 'DELETE_CONVERSATION': {
      await deleteConversation(message.payload.id);
      return { type: 'PANEL_TOGGLED' }; // Reuse as acknowledgment
    }

    case 'TEST_MODEL_CONNECTION': {
      return { type: 'MODEL_CONNECTION_RESULT', payload: await testCustomModelConnection(message.payload.model) };
    }

    case 'RESTORE_CONVERSATION': {
      await saveConversation(message.payload.conversation);
      return { type: 'PANEL_TOGGLED' }; // Reuse as acknowledgment
    }

    case 'SAVE_SETTINGS': {
      const updated = await saveSettings(message.payload);
      return { type: 'SETTINGS_SAVED', payload: updated };
    }

    case 'GET_SETTINGS': {
      const settings = await getSettings();
      return { type: 'SETTINGS', payload: settings };
    }

    case 'TOGGLE_PANEL': {
      const tabId = await getActiveTabId();
      if (tabId) {
        await chrome.sidePanel.open({ tabId });
      }
      return { type: 'PANEL_TOGGLED' };
    }

    default:
      return { type: 'ERROR', payload: { code: 'UNKNOWN', message: 'Unknown message type', retryable: false } };
  }
}

// ── Message Listener ────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: ToBackgroundMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: FromBackgroundMessage) => void
  ) => {
    // Only handle messages from the side panel
    if (sender.url?.includes('sidepanel') || sender.tab?.id) {
      handleSidePanelMessage(message, sender).then(sendResponse).catch((err) => {
        sendResponse({
          type: 'ERROR',
          payload: { code: 'INTERNAL', message: err.message || 'Internal error', retryable: true },
        });
      });
      return true; // Keep channel open for async response
    }
  }
);

// ── Extension Icon Click → Open Side Panel ──────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

// ── Side Panel Behavior ─────────────────────────────────────────

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {
    // Fallback for older Chrome versions
  });

// ── Service Worker Activation ───────────────────────────────────

console.log('[AI Page Assistant] Background service worker activated');
