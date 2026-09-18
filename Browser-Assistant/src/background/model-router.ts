import type { ChatTurn, StreamCallbacks } from './api-client';
import {
  chatOnce,
  isAbortedByCaller,
  sendChatMessage,
} from './api-client';
import type { AssistantMode, PageContext, Message, ResolvedModel } from '../shared/types';

export interface ModelFallbackCallbacks {
  /** Called immediately before the router moves to the next candidate. */
  onFallback?: (failed: ResolvedModel, next: ResolvedModel, error: Error) => void;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Request failed');
}

function assertCandidates(candidates: ResolvedModel[]): void {
  if (candidates.length === 0) throw new Error('No AI model is configured.');
}

/**
 * Try candidates in order. A candidate is abandoned after the API client's
 * own retries are exhausted; the next candidate then gets the same request.
 * Caller cancellation is never treated as a provider failure.
 */
export async function chatOnceWithFallback(
  candidates: ResolvedModel[],
  messages: ChatTurn[],
  temperature = 0.1,
  callbacks?: ModelFallbackCallbacks
): Promise<string> {
  assertCandidates(candidates);
  let lastError: Error | null = null;

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    try {
      return await chatOnce(candidate, messages, temperature);
    } catch (error) {
      const normalized = asError(error);
      if (isAbortedByCaller(normalized)) throw normalized;
      lastError = normalized;
      const next = candidates[index + 1];
      if (!next) break;
      callbacks?.onFallback?.(candidate, next, normalized);
    }
  }

  throw lastError ?? new Error('All configured AI models failed.');
}

/** Streaming equivalent of chatOnceWithFallback. */
export async function sendChatMessageWithFallback(
  candidates: ResolvedModel[],
  userMessage: string,
  pageContext?: PageContext,
  history?: Message[],
  callbacks?: StreamCallbacks & ModelFallbackCallbacks,
  canAct = false,
  mode: AssistantMode = 'general'
): Promise<string> {
  assertCandidates(candidates);
  let lastError: Error | null = null;

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    let emitted = false;
    const next = candidates[index + 1];

    try {
      return await sendChatMessage(
        candidate,
        userMessage,
        pageContext,
        history,
        callbacks
          ? {
              onChunk: (content) => {
                emitted = true;
                callbacks.onChunk(content);
              },
              onDone: callbacks.onDone,
              // Intermediate failures must not surface as the final error in
              // the chat bubble; the next candidate is about to be tried.
              onError: next ? () => undefined : callbacks.onError,
            }
          : undefined,
        canAct,
        mode
      );
    } catch (error) {
      const normalized = asError(error);
      if (isAbortedByCaller(normalized)) throw normalized;
      lastError = normalized;
      if (!next) break;

      // The client streams the full accumulated text on each chunk. Clear a
      // failed candidate's partial answer before the next provider starts so
      // the UI does not show two model responses concatenated together.
      if (emitted) callbacks?.onChunk('');
      callbacks?.onFallback?.(candidate, next, normalized);
    }
  }

  throw lastError ?? new Error('All configured AI models failed.');
}
