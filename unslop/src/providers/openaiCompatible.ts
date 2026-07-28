import type { ApiProfile, ChatMessage, CompletionResult, TokenUsage } from '@/types';
import { LIMITS, PROVIDER_PRESETS } from '@/constants';
import { LlmError } from './errors';

/**
 * Normalises a user-provided API URL into a full chat-completions endpoint.
 * Accepts either the complete endpoint or a base ending in a version segment
 * (e.g. `.../v1`).
 */
export function normalizeEndpoint(apiUrl: string): string | null {
  const trimmed = apiUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  if (/\/completions$/i.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

function buildHeaders(profile: ApiProfile): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${profile.apiKey}`,
  };
  const preset = PROVIDER_PRESETS[profile.provider];
  if (preset?.extraHeaders) Object.assign(headers, preset.extraHeaders);
  return headers;
}

function buildBody(profile: ApiProfile, messages: ChatMessage[]): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: profile.model,
    messages,
    temperature: profile.temperature,
    max_tokens: profile.maxTokens,
    stream: false,
  };
  if (profile.jsonMode) {
    body.response_format = { type: 'json_object' };
  }
  return body;
}

function extractContent(json: Record<string, unknown>): string | null {
  const choices = json.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as Record<string, unknown>;
  const message = first.message as Record<string, unknown> | undefined;
  if (message && typeof message.content === 'string') return message.content;
  // Fallback for legacy /completions responses.
  if (typeof first.text === 'string') return first.text;
  return null;
}

function extractUsage(json: Record<string, unknown>): TokenUsage {
  const usage = (json.usage ?? {}) as Record<string, unknown>;
  const promptTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0;
  const completionTokens =
    typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0;
  const totalTokens =
    typeof usage.total_tokens === 'number'
      ? usage.total_tokens
      : promptTokens + completionTokens;
  return { promptTokens, completionTokens, totalTokens };
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

/**
 * Performs one chat-completion request against an OpenAI-compatible endpoint.
 * Applies a hard timeout, honours an external abort signal (for cancellation),
 * and maps every failure mode to a typed {@link LlmError}.
 */
export async function requestCompletion(
  profile: ApiProfile,
  messages: ChatMessage[],
  opts: { signal?: AbortSignal } = {},
): Promise<CompletionResult> {
  const url = normalizeEndpoint(profile.apiUrl);
  if (!url) {
    throw new LlmError('config', 'API URL is not configured', { retryable: false });
  }
  if (!profile.apiKey) {
    throw new LlmError('auth', 'API key is not set', { retryable: false });
  }

  const controller = new AbortController();
  const timeoutError = new LlmError('timeout', 'Request timed out', { retryable: true });
  const abortError = new LlmError('aborted', 'Request cancelled', { retryable: false });

  const timer = setTimeout(() => controller.abort(timeoutError), LIMITS.requestTimeoutMs);
  const onExternalAbort = () => controller.abort(abortError);
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort(abortError);
    else opts.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(profile),
      body: JSON.stringify(buildBody(profile, messages)),
      signal: controller.signal,
      // Never send cookies/credentials to third-party LLM endpoints.
      credentials: 'omit',
    });
    const latencyMs = Date.now() - startedAt;

    if (!res.ok) {
      throw LlmError.fromStatus(res.status, await safeText(res));
    }

    let json: Record<string, unknown>;
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      throw new LlmError('bad_response', 'Response was not valid JSON', {
        retryable: false,
        status: res.status,
      });
    }

    const content = extractContent(json);
    if (content === null) {
      throw new LlmError('bad_response', 'No content returned by the model', {
        retryable: false,
        status: res.status,
      });
    }

    return {
      content,
      usage: extractUsage(json),
      latencyMs,
      status: res.status,
      model: typeof json.model === 'string' ? json.model : profile.model,
    };
  } catch (err) {
    if (err instanceof LlmError) throw err;
    if (controller.signal.aborted) {
      const reason = controller.signal.reason;
      if (reason instanceof LlmError) throw reason;
      throw abortError;
    }
    throw new LlmError('network', err instanceof Error ? err.message : 'Network error', {
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
    if (opts.signal) opts.signal.removeEventListener('abort', onExternalAbort);
  }
}
