import type { LlmErrorKind, LlmErrorShape } from '@/types';

/** Typed, retry-aware error for all provider/LLM failures. */
export class LlmError extends Error implements LlmErrorShape {
  readonly kind: LlmErrorKind;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    kind: LlmErrorKind,
    message: string,
    opts: { status?: number; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind;
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
  }

  /** Maps a non-2xx HTTP response to a typed error. */
  static fromStatus(status: number, body?: string): LlmError {
    const detail = extractApiMessage(body);
    if (status === 401 || status === 403) {
      return new LlmError('auth', detail ?? 'Invalid or unauthorized API key', {
        status,
        retryable: false,
      });
    }
    if (status === 429) {
      return new LlmError('rate_limit', detail ?? 'Rate limited by provider (429)', {
        status,
        retryable: true,
      });
    }
    if (status === 408) {
      return new LlmError('timeout', detail ?? 'Provider request timeout (408)', {
        status,
        retryable: true,
      });
    }
    if (status >= 500) {
      return new LlmError('server', detail ?? `Provider server error (${status})`, {
        status,
        retryable: true,
      });
    }
    if (status === 400 || status === 404 || status === 422) {
      return new LlmError('config', detail ?? `Bad request (${status})`, {
        status,
        retryable: false,
      });
    }
    return new LlmError('unknown', detail ?? `Unexpected status ${status}`, {
      status,
      retryable: false,
    });
  }
}

/** Best-effort extraction of a human message from an error response body. */
function extractApiMessage(body?: string): string | null {
  if (!body) return null;
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const err = json.error;
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object') {
      const m = (err as Record<string, unknown>).message;
      if (typeof m === 'string') return m;
    }
    if (typeof json.message === 'string') return json.message;
  } catch {
    /* not JSON — fall through */
  }
  const trimmed = body.trim();
  return trimmed ? trimmed.slice(0, 200) : null;
}

/** Normalises any thrown value into a user-facing message. */
export function describeError(err: unknown): string {
  if (err instanceof LlmError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
