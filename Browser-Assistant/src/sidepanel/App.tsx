import { useState, useRef } from 'react';
import { useSettings, useConversations, useChat, usePageContext, useTheme } from './hooks/useHooks';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { SettingsPanel } from './components/SettingsPanel';
import { ConversationList } from './components/ConversationList';
import { ChatInterface } from './components/ChatInterface';

export default function App() {
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  const {
    conversations,
    activeId,
    sessionKey,
    selectConversation,
    deleteConversation,
    newConversation,
  } = useConversations();
  const {
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
  } = useChat(activeId, sessionKey, selectConversation);
  const {
    context: pageContext,
    refresh: refreshContext,
    loading: contextLoading,
    error: contextError,
  } = usePageContext();
  const { isDark } = useTheme(settings?.theme ?? 'system');

  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const toggleTheme = () => updateSettings({ theme: isDark ? 'light' : 'dark' });

  useKeyboardShortcuts({
    onNewChat: () => {
      newConversation();
      setSidebarOpen(false);
    },
    onToggleSidebar: () => setSidebarOpen((v) => !v),
    onToggleTheme: toggleTheme,
    onOpenSettings: () => setShowSettings(true),
    onFocusInput: () => inputRef.current?.focus(),
  });

  if (settingsLoading || !settings) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="text-center">
          <div className="w-7 h-7 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-[var(--text-muted)]">Loading…</p>
        </div>
      </div>
    );
  }

  if (showSettings) {
    return (
      <div className="h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <SettingsPanel
          settings={settings}
          onSave={updateSettings}
          onBack={() => setShowSettings(false)}
          isDark={isDark}
        />
      </div>
    );
  }

  return (
    <div className="h-screen w-full relative overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Chat fills the whole panel; sidebar is an overlay drawer for any width */}
      <ChatInterface
        /* Remount on "New chat" so the composer draft and per-chat toggles
           reset too, not just the message list. */
        key={sessionKey}
        messages={messages}
        isLoading={isLoading}
        error={error}
        onSend={sendMessage}
        pageContext={pageContext}
        onRefreshContext={refreshContext}
        isDark={isDark}
        onToggleSidebar={() => setSidebarOpen(true)}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setShowSettings(true)}
        settings={settings}
        inputRef={inputRef}
        liveSteps={liveSteps}
        confirmation={confirmation}
        onConfirm={answerConfirmation}
        onCancelAgent={cancelAgent}
        isAgentRunning={isAgentRunning}
        status={status}
        contextLoading={contextLoading}
        contextError={contextError}
      />

      {/* Backdrop */}
      <div
        className={`absolute inset-0 z-20 bg-black/40 backdrop-blur-[1px] transition-opacity duration-200 ${
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sliding sidebar drawer */}
      <aside
        className={`absolute top-0 left-0 z-30 h-full w-[80%] max-w-[280px] flex flex-col border-r shadow-xl transition-transform duration-200 ease-out bg-[var(--bg-secondary)] border-[var(--border-color)] ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelect={(id) => {
            selectConversation(id);
            setSidebarOpen(false);
          }}
          onDelete={deleteConversation}
          onNew={() => {
            newConversation();
            setSidebarOpen(false);
          }}
          onClose={() => setSidebarOpen(false)}
          isDark={isDark}
        />
      </aside>
    </div>
  );
}
