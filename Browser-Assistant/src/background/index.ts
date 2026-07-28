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
import type {
  ToBackgroundMessage,
  FromBackgroundMessage,
  Conversation,
  Message,
  PageContext,
  Settings,
  ResolvedModel,
} from '../shared/types';
import { OPENCODE_ZEN_BASE_URL, DEFAULT_OPENCODE_ZEN_KEY, DEFAULT_MODEL_ID } from '../shared/constants';

function generateId(): string {
  return crypto.randomUUID();
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
