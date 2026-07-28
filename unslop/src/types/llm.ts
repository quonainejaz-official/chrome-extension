import type { Decision } from './post';

/** A single OpenAI-style chat message. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Token usage returned by an OpenAI-compatible endpoint. */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Normalised, provider-agnostic result of a single completion call. */
export interface CompletionResult {
  /** Raw assistant text content. */
  content: string;
  usage: TokenUsage;
  /** Milliseconds spent on the network request. */
  latencyMs: number;
  /** HTTP status code of the successful response. */
  status: number;
  model: string;
}

/** Parsed classifier output. */
export interface ParsedDecision {
  decision: Decision;
  confidence: number;
}

/** Discriminated error type for provider/LLM failures. */
export type LlmErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'server'
  | 'timeout'
  | 'network'
  | 'bad_response'
  | 'aborted'
  | 'config'
  | 'unknown';

export interface LlmErrorShape {
  kind: LlmErrorKind;
  message: string;
  status?: number;
  /** Whether a retry could plausibly succeed. */
  retryable: boolean;
}
