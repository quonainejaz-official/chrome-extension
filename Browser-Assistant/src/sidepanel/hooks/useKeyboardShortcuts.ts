import { useEffect, useCallback } from 'react';

interface KeyboardShortcutHandlers {
  onNewChat?: () => void;
  onToggleSidebar?: () => void;
  onToggleTheme?: () => void;
  onOpenSettings?: () => void;
  onFocusInput?: () => void;
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;

      // Ctrl/Cmd + N: New chat
      if (isCtrl && e.key === 'n') {
        e.preventDefault();
        handlers.onNewChat?.();
      }

      // Ctrl/Cmd + B: Toggle sidebar
      if (isCtrl && e.key === 'b') {
        e.preventDefault();
        handlers.onToggleSidebar?.();
      }

      // Ctrl/Cmd + D: Toggle theme
      if (isCtrl && e.key === 'd') {
        e.preventDefault();
        handlers.onToggleTheme?.();
      }

      // Ctrl/Cmd + ,: Open settings
      if (isCtrl && e.key === ',') {
        e.preventDefault();
        handlers.onOpenSettings?.();
      }

      // Ctrl/Cmd + /: Focus input
      if (isCtrl && e.key === '/') {
        e.preventDefault();
        handlers.onFocusInput?.();
      }
    },
    [handlers]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
