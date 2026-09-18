import { useState, useRef, useEffect, useLayoutEffect, useCallback, type RefObject } from 'react';
import type { AssistantMode, Message, PageContext, Settings } from '../../shared/types';
import type { AgentStep } from '../../shared/actions';
import type { AgentStatus } from '../hooks/useHooks';
import { PROMPT_TEMPLATES, AGENT_TEMPLATES, type PromptTemplate } from '../lib/prompts';
import { renderMarkdown, detectDir } from '../lib/markdown';
import { ActionTrace } from './ActionTrace';
import { RunPanel } from './RunPanel';
import { type ConfirmRequest } from './ConfirmCard';
import {
  MenuIcon,
  RefreshIcon,
  SunIcon,
  MoonIcon,
  SettingsIcon,
  DocumentIcon,
  SendIcon,
  CodeIcon,
  CopyIcon,
  CheckIcon,
  ChevronDownIcon,
  SparkleIcon,
  AlertIcon,
  StopIcon,
  MaximizeIcon,
  MinimizeIcon,
} from './Icons';

interface Props {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  onSend: (content: string, includeContext: boolean, mode?: AssistantMode) => void;
  mode: AssistantMode;
  onModeChange: (mode: AssistantMode) => void;
  pageContext: PageContext | null;
  onRefreshContext: () => void;
  isDark: boolean;
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  settings: Settings;
  inputRef?: RefObject<HTMLTextAreaElement>;
  liveSteps: AgentStep[];
  confirmation: ConfirmRequest | null;
  onConfirm: (approved: boolean) => void;
  onCancelAgent: () => void;
  isAgentRunning: boolean;
  status: AgentStatus | null;
  contextLoading: boolean;
  contextError: string | null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function relativeUpdatedAt(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 5) return 'Updated just now';
  if (seconds < 60) return `Updated ${seconds}s ago`;
  return `Updated ${Math.floor(seconds / 60)}m ago`;
}

function PageContextHeader({
  pageContext,
  contextError,
  contextLoading,
  onRefresh,
}: {
  pageContext: PageContext | null;
  contextError: string | null;
  contextLoading: boolean;
  onRefresh: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [faviconFailed, setFaviconFailed] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => setFaviconFailed(false), [pageContext?.faviconUrl]);

  return (
    <div className="page-context-card panel-page-context flex items-center gap-2 flex-shrink-0" aria-live="polite">
      <span className="panel-page-context-icon w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden bg-[var(--bg-tertiary)]" aria-hidden="true">
        {pageContext?.faviconUrl && !faviconFailed ? (
          <img src={pageContext.faviconUrl} alt="" width="16" height="16" onError={() => setFaviconFailed(true)} />
        ) : (
          <DocumentIcon className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[11.5px] font-semibold truncate text-[var(--text-primary)]">
          {pageContext && !contextError ? <span className="page-context-status flex-shrink-0" aria-hidden="true" /> : null}
          <span className="truncate">{pageContext?.title || (contextLoading ? 'Reading current page…' : 'Page context off')}</span>
        </p>
        <p className="text-[9.5px] truncate text-[var(--text-secondary)]">
          {contextError ? 'Page changed — refresh to update' : pageContext ? `${hostOf(pageContext.url)} · ${relativeUpdatedAt(pageContext.extractedAt, now)}` : 'Enable “This page” to include context'}
        </p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={contextLoading}
        className="rounded-md p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        aria-label="Refresh page context"
        title="Refresh page context"
      >
        <RefreshIcon className={`w-3.5 h-3.5 ${contextLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
      </button>
    </div>
  );
}

function IconButton({
  onClick,
  title,
  children,
  active,
  ariaPressed,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
  ariaPressed?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={ariaPressed}
      className={`panel-icon-button p-1.5 rounded-lg transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
        active
          ? 'text-[var(--accent)] bg-[var(--accent-soft)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
      }`}
    >
      {children}
    </button>
  );
}

function TemplatePicker({ onSelect, mode }: { onSelect: (prompt: string) => void; mode: AssistantMode }) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<PromptTemplate['category']>(mode === 'developer' ? 'developer' : 'quick');
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

  useEffect(() => {
    setActiveCategory(mode === 'developer' ? 'developer' : 'quick');
  }, [mode]);

  const categories: { id: PromptTemplate['category']; label: string }[] = [
    { id: 'quick', label: 'Quick' },
    { id: 'translation', label: 'Translate' },
    { id: 'summarization', label: 'Summarize' },
    { id: 'analysis', label: 'Analyze' },
    { id: 'developer', label: 'Dev / QA' },
  ];

  const filtered = PROMPT_TEMPLATES.filter((t) => t.category === activeCategory);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Open templates"
        aria-expanded={open}
        aria-haspopup="menu"
        className="h-8 px-2 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <SparkleIcon className="w-3.5 h-3.5" />
        Templates
        <ChevronDownIcon className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
          <div role="menu" className="template-picker-menu absolute bottom-full right-0 mb-2 rounded-2xl border z-50 bg-[var(--bg-primary)] border-[var(--border-color)] overflow-hidden">
          <div className="flex border-b border-[var(--border-color)]">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                role="menuitem"
                className={`flex-1 px-1.5 py-1.5 text-[11px] font-medium transition-colors border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] ${
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
            {filtered.map((template) => {
              const Icon = template.icon;
              return (
                <button
                  key={template.id}
                  onClick={() => {
                    onSelect(template.prompt);
                    setOpen(false);
                  }}
                  role="menuitem"
                  className="w-full text-left px-2 py-1.5 rounded-lg text-[12px] flex items-center gap-2 transition-colors text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0 text-[var(--accent)]" aria-hidden="true" />
                  <span className="truncate">{template.label}</span>
                </button>
              );
            })}
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
  mode,
  onModeChange,
  pageContext,
  onRefreshContext,
  isDark,
  onToggleSidebar,
  onToggleTheme,
  onOpenSettings,
  settings,
  inputRef: externalInputRef,
  liveSteps,
  confirmation,
  onConfirm,
  onCancelAgent,
  isAgentRunning,
  status,
  contextLoading,
  contextError,
}: Props) {
  const [input, setInput] = useState('');
  const [includeContext, setIncludeContext] = useState(settings.autoContext);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [runStartedAt, setRunStartedAt] = useState(0);
  const [isReadingFocus, setIsReadingFocus] = useState(false);
  const wasLoadingRef = useRef(isLoading);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = externalInputRef ?? internalInputRef;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, liveSteps, confirmation, status]);

  // Once a response finishes, give the answer the full reading height. The
  // user can restore the composer at any time, and a new response will enter
  // focus mode again after it completes.
  useEffect(() => {
    const responseFinished = wasLoadingRef.current && !isLoading;
    if (responseFinished && messages.some((message) => message.role === 'assistant' && message.content.trim())) {
      setIsReadingFocus(true);
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading, messages]);

  // Stamp the clock the moment a run begins so RunPanel can show elapsed time.
  useEffect(() => {
    if (isAgentRunning && runStartedAt === 0) setRunStartedAt(Date.now());
    if (!isAgentRunning) setRunStartedAt(0);
  }, [isAgentRunning, runStartedAt]);

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;
    onSend(input.trim(), contextIncluded, mode);
    setInput('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const resizeInput = useCallback(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    const maxHeight = 160;
    textarea.style.height = '0px';
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [inputRef]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    resizeInput();
  };

  useLayoutEffect(() => {
    resizeInput();
  }, [input, resizeInput]);

  const quickPrompts = mode === 'developer'
    ? PROMPT_TEMPLATES.filter((t) => t.category === 'developer').slice(0, 4)
    : settings.agentEnabled
      ? [...PROMPT_TEMPLATES.filter((t) => t.category === 'quick').slice(0, 2), ...AGENT_TEMPLATES.slice(0, 2)]
      : PROMPT_TEMPLATES.filter((t) => t.category === 'quick');

  const quickActions = [
    ...(mode === 'developer'
      ? [
          { label: 'Audit UI', prompt: 'Run a safe UI smoke test on this page. Check visible behavior, accessibility, responsive risks, and loading/error states. Report evidence for each check.', disabled: !pageContext },
          { label: 'API test plan', prompt: 'Create an implementation-ready API test plan from the endpoint or API documentation visible on this page. If no endpoint/spec is available, list exactly what is missing.', disabled: !pageContext },
          { label: 'QA cases', prompt: 'Generate implementation-ready QA test cases for this page or feature, including preconditions, steps, expected results, priority, and negative/boundary cases.', disabled: !pageContext },
        ]
      : []),
    {
      label: 'Summarize',
      prompt: 'Provide a clear and concise summary of this page. Cover the main topic, key arguments, and conclusions.',
      disabled: !pageContext,
    },
    {
      label: 'Explain selected',
      prompt: 'Explain the selected text in simple terms, with any important context I should know.',
      disabled: !pageContext?.selectedText,
    },
    {
      label: 'Find on page',
      prompt: 'Find the most relevant information on this page about: ',
      disabled: !pageContext,
    },
    ...(settings.agentEnabled
      ? [{
          label: 'Fill this form',
          prompt: 'Fill in the form on this page using my saved details. Do not submit it — tell me when it is ready for me to review.',
          disabled: !pageContext,
        }]
      : []),
  ];

  const pageAvailable = Boolean(pageContext && !contextError);
  const contextIncluded = includeContext && pageAvailable;
  const [loadingStage, setLoadingStage] = useState<'sending' | 'analyzing' | 'thinking'>('sending');

  useEffect(() => {
    if (!isLoading) return;

    setLoadingStage('sending');
    const analyzingTimer = window.setTimeout(() => {
      setLoadingStage(contextIncluded ? 'analyzing' : 'thinking');
    }, 650);
    const thinkingTimer = window.setTimeout(() => {
      setLoadingStage('thinking');
    }, 1600);

    return () => {
      window.clearTimeout(analyzingTimer);
      window.clearTimeout(thinkingTimer);
    };
  }, [isLoading, contextIncluded]);

  const hasStreamingResponse = isLoading && messages.some(
    (message) => message.role === 'assistant' && message.content.trim().length > 0,
  );
  const loadingLabel = hasStreamingResponse
    ? 'Generating response…'
    : loadingStage === 'sending'
      ? 'Sending…'
      : loadingStage === 'analyzing'
        ? 'Analyzing page…'
        : 'Thinking…';

  return (
    <div className="sidepanel-chat flex flex-col h-full min-h-0 min-w-0">
      {/* Header */}
      <div className="panel-topbar flex items-center justify-between gap-2 pl-1.5 pr-2 py-1.5 border-b flex-shrink-0 border-[var(--border-color)] bg-[var(--bg-primary)]">
        <div className="flex items-center gap-1 min-w-0">
          <IconButton onClick={onToggleSidebar} title="Conversations">
            <MenuIcon className="w-[18px] h-[18px]" />
          </IconButton>
           <div className="flex items-center gap-2 pl-1 min-w-0">
             <span className="brand-mark w-7 h-7 rounded-[9px] flex items-center justify-center flex-shrink-0">
               <SparkleIcon className="w-3 h-3 text-white" />
             </span>
             <div className="min-w-0">
               <h1 className="text-[12px] font-bold leading-tight truncate text-[var(--text-primary)]">{mode === 'developer' ? 'Developer QA' : 'AI Assistant'}</h1>
               <p className="text-[9px] leading-tight text-[var(--text-muted)]">{mode === 'developer' ? 'UI · API · test cases' : 'Your browser co-pilot'}</p>
             </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={onRefreshContext}
            disabled={contextLoading}
            title={contextError ?? (pageContext ? `Re-read: ${pageContext.title}` : 'Re-read the current page')}
            aria-label="Re-read the current page"
            className="panel-icon-button p-1.5 rounded-lg transition-colors flex-shrink-0 text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            style={contextError ? { color: 'var(--warning)' } : undefined}
          >
            <RefreshIcon className={`w-4 h-4 ${contextLoading ? 'animate-spin' : ''}`} />
          </button>
          <IconButton
            onClick={() => onModeChange(mode === 'developer' ? 'general' : 'developer')}
            title={mode === 'developer' ? 'Exit developer QA mode' : 'Developer QA mode'}
            active={mode === 'developer'}
            ariaPressed={mode === 'developer'}
          >
            <CodeIcon className="w-4 h-4" />
          </IconButton>
          {!isAgentRunning && (
            <IconButton
              onClick={() => setIsReadingFocus((value) => !value)}
              title={isReadingFocus ? 'Exit reading focus' : 'Maximize reading area'}
              active={isReadingFocus}
              ariaPressed={isReadingFocus}
            >
              {isReadingFocus ? <MinimizeIcon className="w-4 h-4" /> : <MaximizeIcon className="w-4 h-4" />}
            </IconButton>
          )}
          <IconButton onClick={onToggleTheme} title="Toggle theme">
            {isDark ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
          </IconButton>
          <IconButton onClick={onOpenSettings} title="Settings">
            <SettingsIcon className="w-4 h-4" />
          </IconButton>
        </div>
      </div>

      {!isReadingFocus && (
        <PageContextHeader
          pageContext={pageContext}
          contextError={contextError}
          contextLoading={contextLoading}
          onRefresh={onRefreshContext}
        />
      )}

      {/* Messages area */}
      <div className="chat-messages flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2.5 sm:px-3 py-3 space-y-3 min-w-0">
        {messages.length === 0 && (
          <div className="empty-state flex flex-col items-center justify-center h-full text-center px-1">
            <div className="empty-state-panel">
              <div className="empty-state-mark w-12 h-12 rounded-2xl mb-4 mx-auto flex items-center justify-center">
                <SparkleIcon className="w-6 h-6" />
              </div>
              <p className="empty-state-kicker mb-1">AI Page Assistant</p>
              <h2 className="text-[17px] leading-tight font-bold mb-2 text-[var(--text-primary)]">
                What would you like to do?
              </h2>
              <p className="empty-state-copy text-[12.5px] leading-relaxed max-w-[300px] mb-5 mx-auto text-[var(--text-muted)]">
                {mode === 'developer'
                  ? 'Inspect the current page, test its UI safely, design API checks, generate QA cases, or draft implementation-ready tests.'
                  : settings.agentEnabled
                    ? 'Ask about this page or tell me what to do. I’ll plan the steps and ask before anything consequential.'
                    : 'Ask questions, get summaries, translate content, and more about the current page.'}
              </p>

              <div className="starter-grid grid grid-cols-1 min-[340px]:grid-cols-2 gap-2 w-full">
                {quickPrompts.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      onClick={() => {
                        setInput(action.prompt);
                        inputRef.current?.focus();
                      }}
                      className="starter-button flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-[11px] font-semibold transition-[background-color,border-color,box-shadow,color,transform] border text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    >
                      <span className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 bg-[var(--accent-soft)]">
                        <Icon className="w-3.5 h-3.5 text-[var(--accent)]" aria-hidden="true" />
                      </span>
                      <span className="truncate">{action.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const dir = detectDir(msg.content);
          return (
          <div key={msg.id} className={`flex group ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[88%] min-w-0 relative">
              {msg.role === 'assistant' && msg.metadata?.steps && msg.metadata.steps.length > 0 && (
                <div className="mb-1.5">
                  <ActionTrace steps={msg.metadata.steps} />
                </div>
              )}
              <div
                 className={`message-bubble px-3 py-2.5 rounded-2xl text-[13px] leading-relaxed break-words overflow-hidden ${
                  msg.role === 'user'
                    ? 'text-white rounded-br-md'
                    : 'rounded-bl-md'
                }`}
                style={{
                   background: msg.role === 'user'
                     ? 'linear-gradient(135deg, var(--user-bubble), color-mix(in srgb, var(--user-bubble) 68%, var(--accent-secondary)))'
                     : 'var(--ai-bubble)',
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
                  className="absolute -bottom-6 left-1 flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
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

        {/* The live run — goal, timeline, current status, stop control */}
        {(isAgentRunning || liveSteps.length > 0) && (
          <RunPanel
            goal={lastUserMessage}
            steps={liveSteps}
            status={status}
            confirmation={confirmation}
            onConfirm={onConfirm}
            onStop={onCancelAgent}
            startedAt={runStartedAt || Date.now()}
            running={isAgentRunning}
          />
        )}

        {isLoading && !isAgentRunning && liveSteps.length === 0 && (
          <div className="flex justify-start" role="status" aria-live="polite" aria-label={loadingLabel}>
            <div className="response-status-bubble flex items-center gap-2 px-3 py-2.5 rounded-2xl rounded-bl-md text-[12px] font-medium" style={{ background: 'var(--ai-bubble)', color: 'var(--text-secondary)' }}>
              <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--border-color)] border-t-[var(--accent)] animate-spin flex-shrink-0" aria-hidden="true" />
              <span>{loadingLabel}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl text-sm border" role="alert" aria-live="polite" style={{ background: 'color-mix(in srgb, var(--error) 10%, transparent)', color: 'var(--error)', borderColor: 'color-mix(in srgb, var(--error) 30%, transparent)' }}>
            <AlertIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="break-words min-w-0">{error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {isReadingFocus ? (
        <div className="focus-restore-bar flex items-center justify-between gap-2 px-3 py-2 border-t flex-shrink-0 border-[var(--border-color)] bg-[var(--bg-primary)]">
          <span className="flex items-center gap-1.5 min-w-0 text-[11px] font-medium text-[var(--text-secondary)]">
            <MaximizeIcon className="w-3.5 h-3.5 flex-shrink-0 text-[var(--accent)]" aria-hidden="true" />
            <span className="truncate">Reading focus</span>
          </span>
          <button
            type="button"
            onClick={() => setIsReadingFocus(false)}
            className="flex-shrink-0 rounded-full border px-2.5 py-1 text-[10.5px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] border-[var(--border-color)]"
          >
            Write a message
          </button>
        </div>
      ) : (
      <div className="composer-footer p-2.5 border-t flex-shrink-0 border-[var(--border-color)] bg-[var(--bg-primary)]">
        {!input.trim() && (
          <div className="quick-actions flex items-center gap-1 overflow-x-auto pb-1.5" aria-label="Quick actions">
            {quickActions.map((action) => (
              <button
                key={action.label}
                type="button"
                disabled={action.disabled}
                onClick={() => {
                  setInput(action.prompt);
                  inputRef.current?.focus();
                }}
                className="whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-medium transition-colors border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
        <div className="composer-shell rounded-2xl border px-2 py-2 transition-colors">
          <div className="composer-topbar flex items-center justify-between gap-2 pb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                type="button"
                onClick={() => setIncludeContext(!includeContext)}
                disabled={!pageAvailable}
                title={contextIncluded ? 'Page context included' : 'Page context disabled'}
                aria-label={contextIncluded ? 'Disable page context' : 'Enable page context'}
                aria-pressed={contextIncluded}
                className={`h-7 px-2 rounded-lg text-[11px] font-medium flex items-center gap-1 flex-shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                  contextIncluded
                    ? 'text-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <DocumentIcon className="w-3.5 h-3.5" aria-hidden="true" />
                This page
              </button>

              <span
                className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap"
                style={{
                  color: mode === 'developer' || settings.agentEnabled ? 'var(--accent)' : 'var(--text-secondary)',
                  background: mode === 'developer' || settings.agentEnabled ? 'var(--accent-soft)' : 'var(--bg-tertiary)',
                }}
              >
                {mode === 'developer' ? 'Dev / QA' : settings.agentEnabled ? 'Can act' : 'Read only'}
              </span>
            </div>

            <TemplatePicker mode={mode} onSelect={(prompt) => { setInput(prompt); inputRef.current?.focus(); }} />
          </div>

          <div className="composer-input-row flex items-end gap-1.5">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                mode === 'developer'
                  ? 'Describe the UI bug, API check, QA scope, or test to implement…'
                  : settings.agentEnabled ? 'Ask about this page, or tell me what to do on it…' : 'Ask about this page…'
              }
              rows={1}
              aria-label="Message"
              aria-describedby="composer-hint"
              className="composer-textarea min-h-[36px] flex-1 min-w-0 resize-none overflow-y-hidden rounded-xl border-0 bg-transparent px-1 py-1.5 text-[13px] leading-relaxed outline-none focus:outline-none focus:ring-0 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
              style={{ maxHeight: '160px', height: '36px' }}
            />
            {isAgentRunning ? (
              <button
                onClick={onCancelAgent}
                className="composer-submit flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[var(--accent-contrast)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--error)]"
                style={{ background: 'var(--error)' }}
                aria-label="Stop the agent"
                title="Stop"
              >
                <StopIcon className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || isLoading}
                className={`composer-submit flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                  input.trim() && !isLoading
                    ? 'text-[var(--accent-contrast)] hover:opacity-90'
                    : 'text-[var(--text-muted)] bg-[var(--bg-tertiary)]'
                }`}
                style={input.trim() && !isLoading ? { background: 'var(--accent)' } : undefined}
                aria-label="Send message"
              >
                <SendIcon className="w-4 h-4" />
              </button>
            )}
          </div>

          <div id="composer-hint" className="composer-hint flex items-center justify-between gap-2 pt-1 px-1 text-[9px] text-[var(--text-muted)]">
            <span className="truncate">{contextIncluded ? 'Current page included' : 'Current page not included'}</span>
            <span className="composer-key-hint flex-shrink-0">Enter sends · Shift+Enter for new line</span>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
