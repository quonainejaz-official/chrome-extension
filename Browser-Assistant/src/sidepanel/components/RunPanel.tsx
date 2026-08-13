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
} from './Icons';

/** A distinct glyph per action type, so a run is scannable at a glance. */
function ActionIcon({ action, className }: { action: AgentAction; className?: string }) {
  switch (action.type) {
    case 'fill':
      return <KeyboardIcon className={className} />;
    case 'select':
      return <ListIcon className={className} />;
    case 'setCheckbox':
      return <CheckboxIcon className={className} />;
    case 'scroll':
    case 'scrollToElement':
      return <ScrollIcon className={className} />;
    case 'navigate':
    case 'goBack':
      return <NavigateIcon className={className} />;
    case 'submit':
      return <SubmitIcon className={className} />;
    case 'wait':
      return <ClockIcon className={className} />;
    default:
      return <CursorIcon className={className} />;
  }
}

function StepRow({ step }: { step: AgentStep }) {
  const tone =
    step.status === 'ok'
      ? 'var(--success)'
      : step.status === 'failed'
        ? 'var(--error)'
        : step.status === 'blocked'
          ? 'var(--warning)'
          : step.status === 'running'
            ? 'var(--accent)'
            : 'var(--text-muted)';

  return (
    <li className="flex items-start gap-2.5 relative pl-0.5">
      {/* Timeline rail */}
      <span
        className="absolute left-[9px] top-5 bottom-[-8px] w-px"
        style={{ background: 'var(--border-color)' }}
        aria-hidden
      />
      <span
        className="relative z-10 mt-0.5 w-[19px] h-[19px] rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          background: 'var(--bg-primary)',
          border: `1.5px solid ${tone}`,
          color: tone,
        }}
      >
        {step.status === 'running' ? (
          <span
            className="w-2 h-2 rounded-full border-[1.5px] border-current border-t-transparent animate-spin"
            aria-hidden
          />
        ) : step.status === 'ok' ? (
          <CheckIcon className="w-3 h-3" />
        ) : step.status === 'failed' ? (
          <XCircleIcon className="w-3 h-3" />
        ) : step.status === 'blocked' ? (
          <ShieldIcon className="w-3 h-3" />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden />
        )}
      </span>

      <div className="min-w-0 flex-1 pb-1">
        <p
          className={`text-[12.5px] leading-snug break-words ${
            step.status === 'skipped' ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'
          }`}
        >
          <ActionIcon action={step.action} className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5 opacity-60" />
          {step.label}
        </p>
        {step.detail && step.status !== 'ok' && (
          <p className="text-[11px] leading-snug break-words mt-0.5" style={{ color: tone }}>
            {step.detail}
          </p>
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

/**
 * The live view of a run. Replaces the old collapsible "N actions" box: while
 * the agent is working this is the loudest thing in the panel, because the
 * user needs to see what is being done on their behalf and be able to stop it.
 */
export function RunPanel({ goal, steps, status, confirmation, onConfirm, onStop, startedAt, running }: Props) {
  const done = steps.filter((s) => s.status === 'ok').length;

  return (
    <div className="rounded-xl border overflow-hidden border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <div className="flex items-start gap-2 px-3 pt-2.5 pb-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wide font-medium text-[var(--text-muted)]">
            {running ? 'Working on the page' : 'Finished'}
          </p>
          <p className="text-[13px] font-medium text-[var(--text-primary)] break-words mt-0.5">{goal}</p>
        </div>
        {running && (
          <button
            onClick={onStop}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium flex-shrink-0 border transition-colors"
            style={{ borderColor: 'var(--border-color)', color: 'var(--error)' }}
            title="Stop the agent"
          >
            <StopIcon className="w-3 h-3" />
            Stop
          </button>
        )}
      </div>

      <div className="px-3 pb-1 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
        <Elapsed since={startedAt} />
        <span aria-hidden>·</span>
        <span>
          {done} action{done === 1 ? '' : 's'} done
        </span>
      </div>

      {steps.length > 0 && (
        <ol className="px-3 pt-2 pb-1 space-y-0">
          {steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </ol>
      )}

      {running && status && !confirmation && (
        <div className="px-3 py-2 flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
          <span
            className="w-3 h-3 rounded-full border-[1.5px] border-[var(--accent)] border-t-transparent animate-spin flex-shrink-0"
            aria-hidden
          />
          <span className="truncate">{status.text}</span>
        </div>
      )}

      {confirmation && (
        <div className="p-2 pt-1">
          <ConfirmCard request={confirmation} onDecide={onConfirm} />
        </div>
      )}
    </div>
  );
}
