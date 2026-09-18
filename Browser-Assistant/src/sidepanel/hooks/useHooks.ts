import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  AssistantMode,
  Conversation,
  Message,
  Settings,
  PageContext,
  FromBackgroundMessage,
  AgentStatusEvent,
} from '../../shared/types';

export type AgentStatus = AgentStatusEvent['payload'];
import type { AgentStep } from '../../shared/actions';
import type { ConfirmRequest } from '../components/ConfirmCard';
import { sendMessageToBackground } from '../lib/messaging';

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sendMessageToBackground({ type: 'GET_SETTINGS' }).then((response) => {
      if (response.type === 'SETTINGS') {
        setSettings(response.payload);
      }
      setLoading(false);
    });
  }, []);

  const updateSettings = useCallback(async (partial: Partial<Settings>) => {
    const response = await sendMessageToBackground({ type: 'SAVE_SETTINGS', payload: partial });
    if (response.type === 'SETTINGS_SAVED') {
      setSettings(response.payload);
    }
  }, []);

  return { settings, loading, updateSettings };
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Bumped on every "New chat". Without it, starting a new chat while activeId
  // is already null (which is the case whenever the previous run failed before
  // a conversation was persisted) changes no state, so React re-renders
  // nothing and the old messages stay on screen.
  const [sessionKey, setSessionKey] = useState(0);

  const loadConversations = useCallback(async () => {
    const response = await sendMessageToBackground({ type: 'GET_CONVERSATIONS' });
    if (response.type === 'CONVERSATIONS') {
      setConversations(response.payload);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;

  const selectConversation = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    await sendMessageToBackground({ type: 'DELETE_CONVERSATION', payload: { id } });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setActiveId((prev) => (prev === id ? null : prev));
  }, []);

  const restoreConversation = useCallback(async (conversation: Conversation) => {
    await sendMessageToBackground({ type: 'RESTORE_CONVERSATION', payload: { conversation } });
    setConversations((prev) => {
      const withoutRestored = prev.filter((item) => item.id !== conversation.id);
      return [conversation, ...withoutRestored].sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }, []);

  const newConversation = useCallback(() => {
    setActiveId(null);
    setSessionKey((n) => n + 1);
  }, []);

  // Listen for updates from background
  useEffect(() => {
    const handler = (message: any) => {
      if (message.type === 'AGENT_FINISHED') {
        loadConversations();
      } else if (message.type === 'AI_RESPONSE_CHUNK' && message.payload.done) {
        loadConversations();
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [loadConversations]);

  return {
    conversations,
    activeConversation,
    activeId,
    sessionKey,
    selectConversation,
    deleteConversation,
    restoreConversation,
    newConversation,
    refresh: loadConversations,
  };
}

export function useChat(
  conversationId: string | null,
  sessionKey: number,
  onConversationCreated?: (id: string) => void
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveSteps, setLiveSteps] = useState<AgentStep[]>([]);
  const [confirmation, setConfirmation] = useState<ConfirmRequest | null>(null);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const streamingRef = useRef(false);

  // Load messages when the conversation changes — or when the user starts a
  // new chat, which may not change the id at all.
  useEffect(() => {
    setError(null);
    setLiveSteps([]);
    setConfirmation(null);
    setIsLoading(false);
    setIsAgentRunning(false);

    // Abandoning a chat must also stop the agent driving the page. Without
    // this the old run keeps clicking away in the background and streams its
    // steps into the new, unrelated conversation.
    if (streamingRef.current) {
      void sendMessageToBackground({ type: 'CANCEL_AGENT' }).catch(() => {
        /* worker asleep — nothing to cancel */
      });
    }
    // A run that died without settling would otherwise leave this stuck true
    // and silently swallow every later send.
    streamingRef.current = false;

    if (!conversationId) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    sendMessageToBackground({ type: 'GET_CONVERSATION', payload: { id: conversationId } }).then((response) => {
      if (cancelled) return;
      if (response.type === 'CONVERSATION') setMessages(response.payload.messages);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, sessionKey]);

  // Live agent events: step updates and confirmation prompts.
  useEffect(() => {
    const handler = (message: FromBackgroundMessage) => {
      if (message.type === 'AI_RESPONSE_CHUNK') {
        // The background streams cumulative content. Replace the same
        // assistant message in place instead of appending one bubble per
        // token.
        if (!streamingRef.current) return;
        const incoming = message.payload;
        setMessages((prev) => {
          const assistant: Message = {
            id: incoming.messageId,
            role: 'assistant',
            content: incoming.content,
            timestamp: Date.now(),
          };
          const index = prev.findIndex((item) => item.id === incoming.messageId);
          if (index < 0) return [...prev, assistant];
          const next = prev.slice();
          next[index] = { ...next[index], ...assistant };
          return next;
        });
      } else if (message.type === 'AGENT_STEP') {
        const incoming = message.payload.step;
        // A chat message can turn into an agent run without the panel asking
        // for one, so the arrival of steps is what marks a run as live.
        setIsAgentRunning(true);
        setLiveSteps((prev) => {
          const idx = prev.findIndex((s) => s.id === incoming.id);
          if (idx < 0) return [...prev, incoming];
          const next = prev.slice();
          next[idx] = incoming;
          return next;
        });
      } else if (message.type === 'AGENT_STATUS') {
        setIsAgentRunning(true);
        setStatus(message.payload);
      } else if (message.type === 'AGENT_CONFIRM_REQUEST') {
        setConfirmation(message.payload);
      } else if (message.type === 'AGENT_FINISHED') {
        if (!streamingRef.current) return;
        setMessages((prev) => {
          const assistant: Message = {
            id: message.payload.messageId,
            role: 'assistant',
            content: message.payload.content,
            timestamp: Date.now(),
            metadata: { agent: true, steps: message.payload.steps },
          };
          const index = prev.findIndex((item) => item.id === assistant.id);
          if (index < 0) return [...prev, assistant];
          const next = prev.slice();
          next[index] = assistant;
          return next;
        });
        setLiveSteps([]);
        setIsLoading(false);
        setIsAgentRunning(false);
        setStatus(null);
        setConfirmation(null);
        streamingRef.current = false;
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const answerConfirmation = useCallback(
    async (approved: boolean) => {
      const pending = confirmation;
      setConfirmation(null);
      if (!pending) return;
      await sendMessageToBackground({
        type: 'AGENT_CONFIRM_DECISION',
        payload: { id: pending.id, approved },
      });
    },
    [confirmation]
  );

  const cancelAgent = useCallback(async () => {
    setConfirmation(null);
    await sendMessageToBackground({ type: 'CANCEL_AGENT' });
  }, []);

  const sendMessage = useCallback(
    async (content: string, includePageContext: boolean = true, mode: AssistantMode = 'general') => {
      if (!content.trim() || streamingRef.current) return;

      streamingRef.current = true;
      setIsLoading(true);
      setLiveSteps([]);
      setStatus(null);
      setConfirmation(null);
      setError(null);

      // Add user message optimistically
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: content.trim(),
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);

      const appendAssistant = (assistantMsg: Message) => {
        setMessages((prev) => {
          const index = prev.findIndex((item) => item.id === assistantMsg.id);
          if (index < 0) return [...prev, assistantMsg];
          const next = prev.slice();
          next[index] = assistantMsg;
          return next;
        });
      };

      let awaitingBackgroundCompletion = false;
      try {
        const response = await sendMessageToBackground({
          type: 'SEND_MESSAGE',
          payload: { content: content.trim(), conversationId: conversationId ?? undefined, includePageContext, mode },
        });

        if (response.type === 'AGENT_FINISHED') {
          appendAssistant({
            id: response.payload.messageId,
            role: 'assistant',
            content: response.payload.content,
            timestamp: Date.now(),
            metadata: { agent: true, steps: response.payload.steps },
          });
          setLiveSteps([]);
          if (!conversationId) onConversationCreated?.(response.payload.conversationId);
        } else if (response.type === 'REQUEST_ACCEPTED') {
          // Guard the rare case where a very fast agent finishes before the
          // acknowledgement reaches the panel.
          awaitingBackgroundCompletion = streamingRef.current;
        } else if (response.type === 'AI_RESPONSE_CHUNK') {
          appendAssistant({
            id: response.payload.messageId,
            role: 'assistant',
            content: response.payload.content,
            timestamp: Date.now(),
          });
          if (!conversationId) onConversationCreated?.(response.payload.conversationId);
        } else if (response.type === 'ERROR') {
          setError(response.payload.message);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message');
      } finally {
        // The agent acknowledgement is deliberately non-terminal. The
        // AGENT_FINISHED broadcast owns cleanup once the long run completes.
        if (!awaitingBackgroundCompletion) {
          setIsLoading(false);
          setIsAgentRunning(false);
          setStatus(null);
          setConfirmation(null);
          streamingRef.current = false;
        }
      }
    },
    [conversationId, onConversationCreated]
  );

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    liveSteps,
    confirmation,
    answerConfirmation,
    cancelAgent,
    isAgentRunning,
    status,
  };
}

export function usePageContext() {
  const [context, setContext] = useState<PageContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const missedRefresh = useRef(false);

  const refresh = useCallback(async () => {
    // Tab events arrive in bursts (activated, then updated, then complete), so
    // only one read runs at a time. Anything that arrives mid-read is recorded
    // and replayed once it finishes — dropping it outright would strand the
    // panel on the old page, which is the very bug this hook exists to fix.
    if (inFlight.current) {
      missedRefresh.current = true;
      return;
    }
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const response = await sendMessageToBackground({ type: 'GET_PAGE_CONTEXT' });
      if (response.type === 'PAGE_CONTEXT') {
        setContext(response.payload);
      } else if (response.type === 'ERROR') {
        // Previously swallowed, which is why the refresh button looked dead on
        // pages that cannot be read.
        setContext(null);
        setError(response.payload.message);
      }
    } catch (err) {
      setContext(null);
      setError(err instanceof Error ? err.message : 'Could not read the current page');
    } finally {
      inFlight.current = false;
      setLoading(false);
      if (missedRefresh.current) {
        missedRefresh.current = false;
        void refreshRef.current?.();
      }
    }
  }, []);

  // Lets the replay above call the latest refresh without making `refresh`
  // depend on itself.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // Capture the current page as soon as the panel opens, so the context
  // indicator reflects reality immediately rather than only after a manual
  // refresh.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Follow the user. The side panel persists across tab switches and
  // navigations, so without these listeners it keeps reporting whichever page
  // happened to be open when it was first opened.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const debounced = () => {
      clearTimeout(timer);
      timer = setTimeout(() => refresh(), 250);
    };

    const onActivated = () => debounced();
    const onUpdated = (_tabId: number, change: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      // Only care about the tab the user is looking at, and only once its
      // document is actually there to read.
      if (!tab.active) return;
      if (change.status === 'complete' || change.url) debounced();
    };
    const onFocusChanged = (windowId: number) => {
      if (windowId !== chrome.windows.WINDOW_ID_NONE) debounced();
    };

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.windows?.onFocusChanged.addListener(onFocusChanged);

    return () => {
      clearTimeout(timer);
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.windows?.onFocusChanged.removeListener(onFocusChanged);
    };
  }, [refresh]);

  return { context, refresh, loading, error };
}

type ThemePref = 'light' | 'dark' | 'system';

/**
 * Resolves the effective light/dark theme from the user's preference
 * (light | dark | system) and keeps the `.dark` class on <html> in sync so
 * both Tailwind's `dark:` variant and the CSS variables in globals.css work.
 */
export function useTheme(preference: ThemePref = 'system') {
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const isDark = preference === 'system' ? systemDark : preference === 'dark';
  const theme: 'light' | 'dark' = isDark ? 'dark' : 'light';

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.style.colorScheme = isDark ? 'dark' : 'light';
  }, [isDark]);

  return { theme, isDark };
}
