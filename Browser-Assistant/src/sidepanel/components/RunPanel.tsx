import { useEffect, useState } from 'react';
import type { AgentStep, AgentAction } from '../../shared/actions';
import type { AgentStatus } from '../hooks/useHooks';
import { ConfirmCard, type ConfirmRequest } from './ConfirmCard';
import {
  CheckIcon,
  XCircleIcon,
  ShieldIcon,
  StopIcon,
  CursorIcon,
  KeyboardIcon,
  ListIcon,
  CheckboxIcon,
  ScrollIcon,
  NavigateIcon,
  SubmitIcon,
  ClockIcon,
  ChevronDownIcon,
} from './Icons';

function ActionIcon({ action, className }: { action: AgentAction; className?: string }) {
  switch (action.type) {
    case 'fill': return <KeyboardIcon className={className} />;
    case 'select': return <ListIcon className={className} />;
    case 'setCheckbox': return <CheckboxIcon className={className} />;
    case 'scroll':
    case 'scrollToElement': return <ScrollIcon className={className} />;
    case 'navigate':
    case 'goBack': return <NavigateIcon className={className} />;
    case 'submit': return <SubmitIcon className={className} />;
    case 'wait': return <ClockIcon className={className} />;
    default: return <CursorIcon className={className} />;
  }
}

function StepRow({ step }: { step: AgentStep }) {
  const tone = step.status === 'ok'
    ? 'var(--success)'
    : step.status === 'failed'
      ? 'var(--error)'
      : step.status === 'blocked'
        ? 'var(--warning)'
        : step.status === 'running'
          ? 'var(--accent)'
          : 'var(--text-muted)';
  const running = step.status === 'running';

  return (
    <li
      className={`flex items-start gap-2.5 relative pl-0.5 rounded-lg ${running ? 'px-2 py-2 -mx-2' : 'py-0.5'}`}
      style={running ? { background: 'var(--accent-soft)' } : undefined}
    >
      <span className="absolute left-[9px] top-5 bottom-[-8px] w-px" style={{ background: 'var(--border-color)' }} aria-hidden="true" />
      <span
        className={`relative z-10 rounded-full flex items-center justify-center flex-shrink-0 ${running ? 'mt-0.5 w-5 h-5' : 'mt-0.5 w-[18px] h-[18px]'}`}
        style={{ background: 'var(--bg-primary)', border: `1.5px solid ${tone}`, color: tone }}
      >
        {running ? (
          <span className="w-2 h-2 rounded-full border-[1.5px] border-current border-t-transparent animate-spin" aria-hidden="true" />
        ) : step.status === 'ok' ? (
          <CheckIcon className="w-3 h-3" aria-hidden="true" />
        ) : step.status === 'failed' ? (
          <XCircleIcon className="w-3 h-3" aria-hidden="true" />
        ) : step.status === 'blocked' ? (
          <ShieldIcon className="w-3 h-3" aria-hidden="true" />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className={`break-words ${running ? 'text-[13px] font-medium' : 'text-[11.5px]'} ${step.status === 'skipped' ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-secondary)]'}`}>
          <ActionIcon action={step.action} className={`inline-block mr-1 -mt-0.5 ${running ? 'w-3.5 h-3.5' : 'w-3 h-3'} opacity-70`} aria-hidden="true" />
          {running ? (step.intent ?? step.label) + '…' : step.label}
        </p>
        {step.detail && (running || step.status !== 'ok') && (
          <p className="text-[11px] leading-snug break-words mt-0.5" style={{ color: tone }}>{step.detail}</p>
        )}
      </div>
    </li>
  );
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.round((now - since) / 1000));
  return <span className="tabular-nums">{seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`}</span>;
}

interface Props {
  goal: string;
  steps: AgentStep[];
  status: AgentStatus | null;
  confirmation: ConfirmRequest | null;
  onConfirm: (approved: boolean) => void;
  onStop: () => void;
  startedAt: number;
  running: boolean;
}

export function RunPanel({ goal, steps, status, confirmation, onConfirm, onStop, startedAt, running }: Props) {
  const [expanded, setExpanded] = useState(running);
  const done = steps.filter((step) => step.status === 'ok').length;
  const total = steps.length;
  const current = steps.find((step) => step.status === 'running');

  useEffect(() => {
    setExpanded(running);
  }, [running]);

  return (
    <div className={`rounded-xl border overflow-hidden border-[var(--border-color)] ${running ? 'bg-[var(--bg-secondary)]' : 'bg-[var(--bg-primary)]'}`}>
      <div className="flex items-start gap-2 px-3 pt-2.5 pb-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wide font-medium text-[var(--text-muted)]">
            {running ? 'Working on the page' : 'Finished'}
          </p>
          <p className="text-[13px] font-medium text-[var(--text-primary)] break-words mt-0.5">{goal}</p>
        </div>
        {running ? (
          <button
            onClick={onStop}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium flex-shrink-0 border transition-colors border-[var(--border-color)] text-[var(--error)] hover:bg-[var(--bg-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--error)]"
            title="Stop the agent"
          >
            <StopIcon className="w-3 h-3" aria-hidden="true" />
            Stop
          </button>
        ) : (
          <button
            onClick={() => setExpanded((value) => !value)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            aria-expanded={expanded}
          >
            {expanded ? 'Hide details' : 'Review changes'}
            <ChevronDownIcon className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="px-3 pb-2 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
        <Elapsed since={startedAt} />
        <span aria-hidden="true">·</span>
        <span>{total > 0 ? `${done}/${total} actions complete` : 'Preparing actions…'}</span>
      </div>

      {total > 0 && (
        <div className="px-3 pb-2" role="progressbar" aria-label="Agent actions complete" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <div className="h-1 rounded-full overflow-hidden bg-[var(--bg-tertiary)]">
            <div className="h-full rounded-full transition-[width] bg-[var(--accent)]" style={{ width: `${Math.min(100, (done / total) * 100)}%` }} />
          </div>
        </div>
      )}

      {expanded && steps.length > 0 && (
        <ol className="px-3 pt-1 pb-2 space-y-1" aria-label="Agent action timeline">
          {steps.map((step) => <StepRow key={step.id} step={step} />)}
        </ol>
      )}

      {running && status && !confirmation && (
        <div className="px-3 py-2 flex items-center gap-2 text-[12px] text-[var(--text-secondary)]" role="status" aria-live="polite">
          <span className="w-3 h-3 rounded-full border-[1.5px] border-[var(--accent)] border-t-transparent animate-spin flex-shrink-0" aria-hidden="true" />
          <span className="truncate">{status.text}</span>
        </div>
      )}

      {current && running && (
        <p className="sr-only" aria-live="polite">Current action: {current.intent ?? current.label}</p>
      )}

      {confirmation && (
        <div className="sticky bottom-0 p-2 pt-2 border-t border-[var(--warning)]/40 bg-[var(--bg-primary)] shadow-[0_-4px_12px_rgba(15,23,42,0.08)]">
          <ConfirmCard request={confirmation} onDecide={onConfirm} />
        </div>
      )}
    </div>
  );
}
