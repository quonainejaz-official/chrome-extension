import { sendChatMessage } from './api-client';
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
} from '../shared/types';
import type { AgentStep } from '../shared/actions';
import { OPENCODE_ZEN_BASE_URL, DEFAULT_OPENCODE_ZEN_KEY, DEFAULT_MODEL_ID } from '../shared/constants';

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
  chrome.runtime.sendMessage(message).catch(() => {
    /* no listener */
  });
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

// Turn the user's selection into a concrete endpoint/model/key.
// Custom models are prefixed "custom:"; anything else is an OpenCode Zen model.
function resolveModel(settings: Settings): ResolvedModel {
  const selected = settings.selectedModel || DEFAULT_MODEL_ID;

  if (selected.startsWith('custom:')) {
    const custom = settings.customModels?.find((m) => `custom:${m.id}` === selected);
    if (custom) {
      return {
        endpoint: custom.endpoint,
        model: custom.model,
        apiKey: custom.apiKey ?? '',
      };
    }
  }

  // Default: OpenCode Zen. Use the user's key override, else the built-in key.
  return {
    endpoint: OPENCODE_ZEN_BASE_URL,
    model: selected.startsWith('custom:') ? DEFAULT_MODEL_ID : selected,
    apiKey: settings.apiKey?.trim() || DEFAULT_OPENCODE_ZEN_KEY,
  };
}

function generateTitle(content: string): string {
  const trimmed = content.trim().slice(0, 60);
  return trimmed.length < content.trim().length ? trimmed + '...' : trimmed;
}

// ── Side Panel Message Handler ──────────────────────────────────

async function handleSidePanelMessage(
  message: ToBackgroundMessage,
  sender: chrome.runtime.MessageSender
): Promise<FromBackgroundMessage> {
  switch (message.type) {
    case 'SEND_MESSAGE': {
      const { content, conversationId, includePageContext } = message.payload;
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
      const modelConfig = resolveModel(settings);

      // A key is only required for OpenCode Zen (the default provider);
      // custom endpoints may legitimately need none.
      const isDefaultProvider = modelConfig.endpoint === OPENCODE_ZEN_BASE_URL;
      if (isDefaultProvider && !modelConfig.apiKey) {
        assistantMessage.content =
          'No API key available. Add your OpenCode Zen key in Settings, or select a custom model.';
        conversation.updatedAt = Date.now();
        await saveConversation(conversation);
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

      // Stream response
      let fullContent = '';
      try {
        await sendChatMessage(
          modelConfig,
          content,
          pageContext,
          conversation.messages.slice(0, -1), // Exclude the empty assistant message
          {
            onChunk: (chunked) => {
              fullContent = chunked;
            },
            onDone: (completed) => {
              fullContent = completed;
            },
            onError: (err) => {
              fullContent = `Error: ${err.message}`;
            },
          }
        );
      } catch (err) {
        fullContent = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
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

      const modelConfig = resolveModel(settings);
      if (modelConfig.endpoint === OPENCODE_ZEN_BASE_URL && !modelConfig.apiKey) {
        return { type: 'ERROR', payload: { code: 'NO_KEY', message: 'No API key available. Add your OpenCode Zen key in Settings.', retryable: false } };
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

      const runId = generateId();
      activeRun = { id: runId, cancelled: false };

      let result: { summary: string; steps: AgentStep[]; incomplete: boolean };
      try {
        result = await runAgent({
          runId,
          tabId: tab.id,
          goal,
          history: priorMessages,
          settings,
          model: modelConfig,
          emitStep: (step) => broadcast({ type: 'AGENT_STEP', payload: { runId, step } }),
          requestConfirmation: (request) => askForConfirmation(runId, request),
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
        metadata: { agent: true, steps: result.steps, model: modelConfig.model },
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
      // Also broadcast so the conversation list refreshes even though the
      // caller gets this same object as its response.
      broadcast(finished);
      return finished;
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
