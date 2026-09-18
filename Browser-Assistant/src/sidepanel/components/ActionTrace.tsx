import { useState } from 'react';
import type { AgentStep } from '../../shared/actions';
import { CheckIcon, XCircleIcon, ShieldIcon, ChevronDownIcon, HandIcon } from './Icons';

function StatusDot({ status }: { status: AgentStep['status'] }) {
  if (status === 'running') {
    return (
      <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
        <span className="w-3 h-3 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
      </span>
    );
  }
  if (status === 'ok') {
    return <CheckIcon className="w-4 h-4 flex-shrink-0 text-[var(--success)]" />;
  }
  if (status === 'blocked') {
    return <ShieldIcon className="w-4 h-4 flex-shrink-0 text-[var(--warning)]" />;
  }
  if (status === 'skipped') {
    return <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center text-[var(--text-muted)]">–</span>;
  }
  return <XCircleIcon className="w-4 h-4 flex-shrink-0 text-[var(--error)]" />;
}

interface Props {
  steps: AgentStep[];
  /** Live runs stay expanded; finished ones collapse into a one-line summary. */
  live?: boolean;
}

export function ActionTrace({ steps, live = false }: Props) {
  const [open, setOpen] = useState(live);
  if (steps.length === 0) return null;

  const failed = steps.filter((s) => s.status === 'failed' || s.status === 'blocked').length;
  const current = steps[steps.length - 1];

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
        aria-expanded={open}
        aria-label={open ? 'Collapse action trace' : 'Expand action trace'}
      >
        <HandIcon className="w-4 h-4 flex-shrink-0 text-[var(--accent)]" />
        <span className="text-xs font-medium text-[var(--text-secondary)] min-w-0 flex-1 truncate">
          {live && current.status === 'running'
            ? current.label
            : `${steps.length} action${steps.length === 1 ? '' : 's'}${failed ? ` · ${failed} needs attention` : ''}`}
        </span>
        <ChevronDownIcon
          className={`w-3.5 h-3.5 flex-shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ol className="px-3 pb-2.5 space-y-1.5">
          {steps.map((step) => (
            <li key={step.id} className="flex items-start gap-2">
              <span className="mt-0.5">
                <StatusDot status={step.status} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[var(--text-primary)] break-words">{step.label}</p>
                {step.detail && step.status !== 'ok' && (
                  <p className="text-[11px] text-[var(--text-muted)] break-words mt-0.5">{step.detail}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
