import type { Settings, Conversation, PageContext } from '../shared/types';
import {
  MAX_CONVERSATIONS,
  DEFAULT_MODEL_ID,
} from '../shared/constants';

const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  apiKeyConfigured: false,
  selectedModel: DEFAULT_MODEL_ID,
  customModels: [],
  defaultLanguage: 'en',
  summaryLength: 'standard',
  theme: 'system',
  panelWidth: 400,
  autoContext: true,
  maxConversations: MAX_CONVERSATIONS,
  streamingEnabled: true,
  fontSize: 'medium',
};

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...result.settings };
}

export async function saveSettings(settings: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  await chrome.storage.local.set({ settings: updated });
  return updated;
}

export async function getConversations(): Promise<Conversation[]> {
  const result = await chrome.storage.local.get('conversations');
  return (result.conversations ?? []) as Conversation[];
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  const conversations = await getConversations();
  return conversations.find((c) => c.id === id);
}

export async function saveConversation(conversation: Conversation): Promise<void> {
  const conversations = await getConversations();
  const idx = conversations.findIndex((c) => c.id === conversation.id);
  if (idx >= 0) {
    conversations[idx] = conversation;
  } else {
    conversations.unshift(conversation);
  }
  // Enforce max conversations limit
  while (conversations.length > MAX_CONVERSATIONS) {
    conversations.pop();
  }
  await chrome.storage.local.set({ conversations });
}

export async function deleteConversation(id: string): Promise<void> {
  const conversations = await getConversations();
  const filtered = conversations.filter((c) => c.id !== id);
  await chrome.storage.local.set({ conversations: filtered });
}

export async function getCachedPageContext(tabId: number): Promise<PageContext | null> {
  const key = `pageCache_${tabId}`;
  const result = await chrome.storage.local.get(key);
  const cached = result[key];
  if (!cached) return null;
  if (Date.now() - cached.extractedAt > 5 * 60 * 1000) {
    await chrome.storage.local.remove(key);
    return null;
  }
  return cached as PageContext;
}

export async function cachePageContext(tabId: number, context: PageContext): Promise<void> {
  const key = `pageCache_${tabId}`;
  await chrome.storage.local.set({ [key]: context });
}
