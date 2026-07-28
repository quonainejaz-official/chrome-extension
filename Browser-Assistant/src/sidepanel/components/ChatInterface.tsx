import { useState, useRef, useEffect, type RefObject } from 'react';
import type { Message, PageContext, Settings } from '../../shared/types';
import { PROMPT_TEMPLATES, type PromptTemplate } from '../lib/prompts';
import { renderMarkdown, detectDir } from '../lib/markdown';
import {
  MenuIcon,
  RefreshIcon,
  SunIcon,
  MoonIcon,
  SettingsIcon,
  DocumentIcon,
  SendIcon,
  CopyIcon,
  CheckIcon,
  ChevronDownIcon,
  SparkleIcon,
  AlertIcon,
} from './Icons';

interface Props {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  onSend: (content: string, includeContext: boolean) => void;
  pageContext: PageContext | null;
  onRefreshContext: () => void;
  isDark: boolean;
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  settings: Settings;
  inputRef?: RefObject<HTMLTextAreaElement>;
}

function IconButton({
  onClick,
  title,
  children,
  active,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
        active
          ? 'text-[var(--accent)] bg-[var(--accent-soft)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
      }`}
    >
      {children}
    </button>
  );
}

function TemplatePicker({ onSelect }: { onSelect: (prompt: string) => void }) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<PromptTemplate['category']>('quick');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const categories: { id: PromptTemplate['category']; label: string }[] = [
    { id: 'quick', label: 'Quick' },
    { id: 'translation', label: 'Translate' },
    { id: 'summarization', label: 'Summarize' },
    { id: 'analysis', label: 'Analyze' },
  ];

  const filtered = PROMPT_TEMPLATES.filter((t) => t.category === activeCategory);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="h-9 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
      >
        <SparkleIcon className="w-4 h-4" />
        <ChevronDownIcon className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-64 max-w-[calc(100vw-24px)] rounded-xl shadow-lg border z-50 bg-[var(--bg-primary)] border-[var(--border-color)] overflow-hidden">
          <div className="flex border-b border-[var(--border-color)]">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex-1 px-2 py-2 text-xs font-medium transition-colors border-b-2 ${
                  activeCategory === cat.id
                    ? 'text-[var(--accent)] border-[var(--accent)]'
                    : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="p-1.5 max-h-52 overflow-y-auto">
            {filtered.map((template) => (
              <button
                key={template.id}
                onClick={() => {
                  onSelect(template.prompt);
                  setOpen(false);
                }}
                className="w-full text-left px-2.5 py-2 rounded-lg text-sm flex items-center gap-2.5 transition-colors text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
              >
                <span className="text-base leading-none">{template.icon}</span>
                <span className="truncate">{template.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ChatInterface({
  messages,
  isLoading,
  error,
  onSend,
  pageContext,
  onRefreshContext,
  isDark,
  onToggleSidebar,
  onToggleTheme,
  onOpenSettings,
  settings,
  inputRef: externalInputRef,
}: Props) {
  const [input, setInput] = useState('');
  const [includeContext, setIncludeContext] = useState(settings.autoContext);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = externalInputRef ?? internalInputRef;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;
    onSend(input.trim(), includeContext);
    setInput('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
  };

  const quickPrompts = PROMPT_TEMPLATES.filter((t) => t.category === 'quick');

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pl-2 pr-2.5 py-2 border-b flex-shrink-0 border-[var(--border-color)] bg-[var(--bg-primary)]">
        <div className="flex items-center gap-1 min-w-0">
          <IconButton onClick={onToggleSidebar} title="Conversations">
            <MenuIcon className="w-[18px] h-[18px]" />
          </IconButton>
          <div className="flex items-center gap-1.5 pl-1 min-w-0">
            <span className="w-5 h-5 rounded-md bg-[var(--accent)] flex items-center justify-center flex-shrink-0">
              <SparkleIcon className="w-3 h-3 text-white" />
            </span>
            <h1 className="text-[13px] font-semibold truncate text-[var(--text-primary)]">AI Assistant</h1>
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {pageContext && (
            <span
              className="hidden min-[300px]:flex items-center gap-1 text-[11px] px-2 py-1 rounded-full max-w-[100px] text-[var(--text-muted)] bg-[var(--bg-tertiary)]"
              title={pageContext.title}
            >
              <DocumentIcon className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{pageContext.pageType === 'pdf' ? 'PDF' : 'Page'}</span>
            </span>
          )}
          <IconButton onClick={onRefreshContext} title="Refresh page context">
            <RefreshIcon className="w-[17px] h-[17px]" />
          </IconButton>
          <IconButton onClick={onToggleTheme} title="Toggle theme">
            {isDark ? <SunIcon className="w-[17px] h-[17px]" /> : <MoonIcon className="w-[17px] h-[17px]" />}
          </IconButton>
          <IconButton onClick={onOpenSettings} title="Settings">
            <SettingsIcon className="w-[17px] h-[17px]" />
          </IconButton>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-4 py-4 space-y-4 min-w-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-2">
            <div className="w-12 h-12 rounded-2xl mb-4 flex items-center justify-center bg-[var(--accent-soft)]">
              <SparkleIcon className="w-6 h-6 text-[var(--accent)]" />
            </div>
            <h2 className="text-base font-semibold mb-1.5 text-[var(--text-primary)]">
              AI Page Assistant
            </h2>
            <p className="text-sm max-w-xs mb-6 text-[var(--text-muted)]">
              Ask questions, get summaries, translate content, and more about the current page.
            </p>

            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2 w-full max-w-xs">
              {quickPrompts.map((action) => (
                <button
                  key={action.id}
                  onClick={() => {
                    setInput(action.prompt);
                    inputRef.current?.focus();
                  }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-xs font-medium transition-colors border bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                >
                  <span className="text-base leading-none flex-shrink-0">{action.icon}</span>
                  <span className="truncate">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const dir = detectDir(msg.content);
          return (
          <div key={msg.id} className={`flex group ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[85%] min-w-0 relative">
              <div
                className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words overflow-hidden ${
                  msg.role === 'user'
                    ? 'text-white rounded-br-md'
                    : 'rounded-bl-md'
                }`}
                style={{
                  background: msg.role === 'user' ? 'var(--user-bubble)' : 'var(--ai-bubble)',
                  color: msg.role === 'user' ? 'var(--user-text)' : 'var(--ai-text)',
                }}
              >
                {msg.role === 'assistant' ? (
                  <div
                    className="markdown-content"
                    dir={dir}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                  />
                ) : (
                  <span className="whitespace-pre-wrap" dir={dir}>{msg.content}</span>
                )}
              </div>
              {msg.role === 'assistant' && msg.content && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(msg.content);
                    setCopiedId(msg.id);
                    setTimeout(() => setCopiedId(null), 1500);
                  }}
                  className="absolute -bottom-6 left-1 flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  {copiedId === msg.id ? (
                    <>
                      <CheckIcon className="w-3 h-3" /> Copied
                    </>
                  ) : (
                    <>
                      <CopyIcon className="w-3 h-3" /> Copy
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
          );
        })}

        {isLoading && (
          <div className="flex justify-start">
            <div className="px-3.5 py-3 rounded-2xl rounded-bl-md" style={{ background: 'var(--ai-bubble)' }}>
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full animate-bounce bg-[var(--text-muted)]" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce bg-[var(--text-muted)]" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce bg-[var(--text-muted)]" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl text-sm border" style={{ background: 'color-mix(in srgb, var(--error) 10%, transparent)', color: 'var(--error)', borderColor: 'color-mix(in srgb, var(--error) 30%, transparent)' }}>
            <AlertIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="break-words min-w-0">{error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Context indicator */}
      {pageContext && includeContext && (
        <div className="px-4 py-1.5 text-xs flex-shrink-0 truncate flex items-center gap-1.5 text-[var(--text-muted)] bg-[var(--bg-secondary)]" title={pageContext.title}>
          <DocumentIcon className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{pageContext.title.slice(0, 50)}{pageContext.title.length > 50 ? '…' : ''}</span>
        </div>
      )}

      {/* Input area */}
      <div className="p-3 border-t flex-shrink-0 border-[var(--border-color)] bg-[var(--bg-primary)]">
        <div className="flex items-end gap-1.5 rounded-2xl border px-1.5 py-1.5 transition-colors focus-within:border-[var(--accent)] border-[var(--border-color)] bg-[var(--bg-secondary)]">
          <IconButton
            onClick={() => setIncludeContext(!includeContext)}
            title={includeContext ? 'Page context included' : 'Page context disabled'}
            active={includeContext}
          >
            <DocumentIcon className="w-[18px] h-[18px]" />
          </IconButton>

          <TemplatePicker onSelect={(prompt) => { setInput(prompt); inputRef.current?.focus(); }} />

          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this page…"
            rows={1}
            className="flex-1 min-w-0 resize-none bg-transparent px-1.5 py-2 text-sm leading-relaxed focus:outline-none text-[var(--text-primary)] placeholder-[var(--text-muted)]"
            style={{ maxHeight: '140px' }}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
              input.trim() && !isLoading
                ? 'text-white hover:opacity-90'
                : 'text-[var(--text-muted)] bg-[var(--bg-tertiary)]'
            }`}
            style={input.trim() && !isLoading ? { background: 'var(--accent)' } : undefined}
            aria-label="Send message"
          >
            <SendIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
