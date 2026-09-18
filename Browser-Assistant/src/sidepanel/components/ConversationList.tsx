import { useEffect, useMemo, useState } from 'react';
import type { Conversation } from '../../shared/types';
import { PlusIcon, CloseIcon, TrashIcon, SearchIcon, UndoIcon } from './Icons';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRestore: (conversation: Conversation) => void;
  onNew: () => void;
  onClose?: () => void;
  isDark: boolean;
}

type ConversationGroup = 'Today' | 'Yesterday' | 'Older';

function groupFor(timestamp: number): ConversationGroup {
  const now = new Date();
  const date = new Date(timestamp);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 24 * 60 * 60 * 1000;
  if (timestamp >= today && date.getTime() >= today) return 'Today';
  if (timestamp >= yesterday) return 'Yesterday';
  return 'Older';
}

export function ConversationList({ conversations, activeId, onSelect, onDelete, onRestore, onNew, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [deleted, setDeleted] = useState<Conversation | null>(null);

  useEffect(() => {
    if (!deleted) return;
    const timeout = window.setTimeout(() => setDeleted(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [deleted]);

  const groups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const matching = conversations.filter((conversation) => {
      if (!normalizedQuery) return true;
      return [conversation.title, conversation.tabTitle, conversation.tabUrl]
        .filter(Boolean)
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    });

    return (['Today', 'Yesterday', 'Older'] as ConversationGroup[]).map((label) => ({
      label,
      conversations: matching
        .filter((conversation) => groupFor(conversation.updatedAt) === label)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    })).filter((group) => group.conversations.length > 0);
  }, [conversations, query]);

  const handleDelete = (conversation: Conversation) => {
    setDeleted(conversation);
    onDelete(conversation.id);
  };

  const handleUndo = () => {
    if (!deleted) return;
    onRestore(deleted);
    setDeleted(null);
  };

  return (
    <div className="conversation-drawer flex flex-col h-full min-h-0" style={{ overscrollBehavior: 'contain' }}>
      <div className="conversation-header p-3.5 border-b border-[var(--border-color)] flex-shrink-0">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-[var(--accent)]">Workspace</p>
            <h2 className="text-base font-bold text-[var(--text-primary)]">Conversations</h2>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              aria-label="Close conversations"
            >
              <CloseIcon className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-sm font-semibold text-white transition-[filter,transform] hover:brightness-105 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))', boxShadow: '0 6px 16px var(--accent-glow)' }}
        >
          <PlusIcon className="w-4 h-4" aria-hidden="true" />
          New chat
        </button>
      </div>

      <div className="px-2 pt-2 flex-shrink-0">
        <label className="relative block">
          <span className="sr-only">Search conversations</span>
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
          <input
            type="search"
            name="conversation-search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations…"
            className="w-full rounded-lg border bg-[var(--bg-primary)] border-[var(--border-color)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] pl-8 pr-2.5 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3 min-h-0">
        {groups.length === 0 && (
          <p className="text-xs text-center py-10 px-4 text-[var(--text-muted)]" aria-live="polite">
            {query ? 'No conversations match that search.' : 'No conversations yet — start one to see it here.'}
          </p>
        )}
        {groups.map((group) => (
          <section key={group.label} aria-labelledby={`conversation-group-${group.label.toLowerCase()}`}>
            <h2 id={`conversation-group-${group.label.toLowerCase()}`} className="px-2.5 pb-1 text-[10px] uppercase tracking-wide font-semibold text-[var(--text-muted)]">
              {group.label}
            </h2>
            <div className="space-y-0.5">
              {group.conversations.map((conv) => {
                const active = activeId === conv.id;
                return (
                  <div key={conv.id} className="group flex items-center gap-1 rounded-lg">
                    <button
                      onClick={() => onSelect(conv.id)}
                      className={`flex-1 min-w-0 flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                        active
                          ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                      }`}
                      aria-current={active ? 'page' : undefined}
                    >
                      <span className="truncate min-w-0">{conv.title || 'Untitled'}</span>
                    </button>
                    <button
                      onClick={() => handleDelete(conv)}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--error)] transition-opacity flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--error)]"
                      aria-label={`Delete ${conv.title || 'untitled conversation'}`}
                    >
                      <TrashIcon className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {deleted && (
        <div className="flex items-center gap-2 px-3 py-2 border-t text-xs flex-shrink-0 border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-secondary)]" role="status" aria-live="polite">
          <span className="truncate flex-1">Conversation deleted</span>
          <button
            onClick={handleUndo}
            className="flex items-center gap-1 rounded-md px-2 py-1 font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <UndoIcon className="w-3.5 h-3.5" aria-hidden="true" />
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
