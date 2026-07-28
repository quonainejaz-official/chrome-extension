import { useState, useEffect, useCallback, useRef } from 'react';
import type { Conversation, Message, Settings, PageContext } from '../../shared/types';
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
      if (message.type === 'AI_RESPONSE_CHUNK' && message.payload.done) {
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

export function useChat(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const sendMessage = useCallback(async (content: string, includePageContext: boolean = true) => {
    if (!content.trim() || streamingRef.current) return;

    streamingRef.current = true;
    setIsLoading(true);
    setError(null);

    // Add user message optimistically
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const response = await sendMessageToBackground({
        type: 'SEND_MESSAGE',
        payload: { content: content.trim(), conversationId: conversationId ?? undefined, includePageContext },
      });

      if (response.type === 'AI_RESPONSE_CHUNK') {
        const assistantMsg: Message = {
          id: response.payload.messageId,
          role: 'assistant',
          content: response.payload.content,
          timestamp: Date.now(),
        };
        setMessages((prev) => {
          // Remove the optimistic user message if we're starting a new conversation
          const filtered = conversationId ? prev : prev.filter((m) => m.id !== userMsg.id);
          return [...filtered, userMsg, assistantMsg];
        });
      } else if (response.type === 'ERROR') {
        setError(response.payload.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsLoading(false);
      streamingRef.current = false;
    }
  }, [conversationId]);

  return { messages, isLoading, error, sendMessage };
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
