import { useState, useEffect, useCallback, useRef } from 'react';
import type { Conversation, Message, Settings, PageContext, FromBackgroundMessage } from '../../shared/types';
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

  const newConversation = useCallback(() => {
    setActiveId(null);
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
    selectConversation,
    deleteConversation,
    newConversation,
    refresh: loadConversations,
  };
}

export function useChat(
  conversationId: string | null,
  onConversationCreated?: (id: string) => void
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveSteps, setLiveSteps] = useState<AgentStep[]>([]);
  const [confirmation, setConfirmation] = useState<ConfirmRequest | null>(null);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const streamingRef = useRef(false);

  // Load messages when conversation changes
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    sendMessageToBackground({ type: 'GET_CONVERSATION', payload: { id: conversationId } }).then((response) => {
      if (response.type === 'CONVERSATION') {
        setMessages(response.payload.messages);
      }
    });
  }, [conversationId]);

  // Live agent events: step updates and confirmation prompts.
  useEffect(() => {
    const handler = (message: FromBackgroundMessage) => {
      if (message.type === 'AGENT_STEP') {
        const incoming = message.payload.step;
        setLiveSteps((prev) => {
          const idx = prev.findIndex((s) => s.id === incoming.id);
          if (idx < 0) return [...prev, incoming];
          const next = prev.slice();
          next[idx] = incoming;
          return next;
        });
      } else if (message.type === 'AGENT_CONFIRM_REQUEST') {
        setConfirmation(message.payload);
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
    async (content: string, includePageContext: boolean = true, agentMode: boolean = false) => {
      if (!content.trim() || streamingRef.current) return;

      streamingRef.current = true;
      setIsLoading(true);
      setIsAgentRunning(agentMode);
      setLiveSteps([]);
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
          // Drop the optimistic user message when a fresh conversation was
          // created, so it is not duplicated by the stored copy.
          const filtered = conversationId ? prev : prev.filter((m) => m.id !== userMsg.id);
          return [...filtered, userMsg, assistantMsg];
        });
      };

      try {
        const response = agentMode
          ? await sendMessageToBackground({
              type: 'RUN_AGENT',
              payload: { goal: content.trim(), conversationId: conversationId ?? undefined },
            })
          : await sendMessageToBackground({
              type: 'SEND_MESSAGE',
              payload: { content: content.trim(), conversationId: conversationId ?? undefined, includePageContext },
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
        setIsLoading(false);
        setIsAgentRunning(false);
        setConfirmation(null);
        streamingRef.current = false;
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
  };
}

export function usePageContext() {
  const [context, setContext] = useState<PageContext | null>(null);

  const refresh = useCallback(async () => {
    const response = await sendMessageToBackground({ type: 'GET_PAGE_CONTEXT' });
    if (response.type === 'PAGE_CONTEXT') {
      setContext(response.payload);
    }
  }, []);

  // Capture the current page as soon as the panel opens, so the context
  // indicator and "page content included" toggle reflect reality immediately
  // instead of only after the user manually hits refresh.
  useEffect(() => {
    refresh();
  }, [refresh]);

  return { context, refresh };
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
