import type { AgentConfirmRequestEvent } from '../../shared/types';
import { ShieldIcon } from './Icons';

export type ConfirmRequest = AgentConfirmRequestEvent['payload'];

interface Props {
  request: ConfirmRequest;
  onDecide: (approved: boolean) => void;
}

/**
 * Shown when the agent is about to do something it cannot take back —
 * submitting a form, leaving the page, anything that spends money. The run is
 * paused until the user answers.
 */
export function ConfirmCard({ request, onDecide }: Props) {
  return (
    <div
      className="rounded-xl border p-3 space-y-2.5"
      style={{
        borderColor: 'color-mix(in srgb, var(--warning) 45%, transparent)',
        background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
      }}
    >
      <div className="flex items-start gap-2">
        <ShieldIcon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text-primary)] break-words">{request.title}</p>
          <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap break-words mt-1">
            {request.detail}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onDecide(true)}
          className="flex-1 py-1.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--accent)' }}
        >
          Yes, do it
        </button>
        <button
          onClick={() => onDecide(false)}
          className="flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
        >
          Stop
        </button>
      </div>
    </div>
  );
}
