import type { Conversation } from '../../shared/types';
import { PlusIcon, CloseIcon, TrashIcon } from './Icons';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onClose?: () => void;
  isDark: boolean;
}

export function ConversationList({ conversations, activeId, onSelect, onDelete, onNew, onClose }: Props) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-[var(--border-color)] flex-shrink-0">
        <button
          onClick={onNew}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--accent)' }}
        >
          <PlusIcon className="w-4 h-4" />
          New chat
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            aria-label="Close"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 min-h-0">
        {conversations.length === 0 && (
          <p className="text-xs text-center py-10 px-4 text-[var(--text-muted)]">
            No conversations yet — start one to see it here.
          </p>
        )}
        {conversations.map((conv) => {
          const active = activeId === conv.id;
          return (
            <div
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                active
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              <span className="flex-1 truncate min-w-0">{conv.title || 'Untitled'}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(conv.id);
                }}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded text-[var(--text-muted)] hover:text-[var(--error)] transition-all flex-shrink-0"
                aria-label="Delete conversation"
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
