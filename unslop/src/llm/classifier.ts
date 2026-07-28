import type {
  ApiProfile,
  ParsedDecision,
  PostData,
  Sensitivity,
  TokenUsage,
} from '@/types';
import { describeError, LlmError, requestCompletion } from '@/providers';
import { parseDecision } from '@/utils/json';
import { buildMessages } from './prompt';

export interface ClassificationOutcome {
  parsed: ParsedDecision;
  usage: TokenUsage;
  latencyMs: number;
  model: string;
  costUsd: number;
  rawContent: string;
}

/** Estimates USD cost for a call given the profile's per-1M pricing. */
export function estimateCost(profile: ApiProfile, usage: TokenUsage): number {
  const promptCost = (usage.promptTokens / 1_000_000) * profile.promptPricePerM;
  const completionCost =
    (usage.completionTokens / 1_000_000) * profile.completionPricePerM;
  const total = promptCost + completionCost;
  return Number.isFinite(total) && total > 0 ? total : 0;
}

/**
 * Classifies a single post. Throws a typed {@link LlmError} on any failure so
 * the queue can decide whether to retry.
 */
export async function classifyPost(
  profile: ApiProfile,
  post: PostData,
  sensitivity: Sensitivity,
  opts: { signal?: AbortSignal } = {},
): Promise<ClassificationOutcome> {
  const messages = buildMessages(post, sensitivity);
  const result = await requestCompletion(profile, messages, { signal: opts.signal });

  const parsed = parseDecision(result.content);
  if (!parsed) {
    throw new LlmError('bad_response', 'Could not parse a decision from the response', {
      retryable: false,
    });
  }

  return {
    parsed,
    usage: result.usage,
    latencyMs: result.latencyMs,
    model: result.model,
    costUsd: estimateCost(profile, result.usage),
    rawContent: result.content,
  };
}

export interface ProfileTestResult {
  ok: boolean;
  latencyMs?: number;
  message: string;
}

/** A benign sample used only to validate connectivity + credentials. */
const TEST_POST: PostData = {
  platform: 'linkedin',
  text: 'Just shipped a small fix to our build pipeline. Took longer than expected but learned a lot about caching.',
};

/** Verifies a profile can reach its endpoint and returns a parseable decision. */
export async function testProfile(
  profile: ApiProfile,
  signal?: AbortSignal,
): Promise<ProfileTestResult> {
  try {
    const outcome = await classifyPost(profile, TEST_POST, 'medium', { signal });
    return {
      ok: true,
      latencyMs: outcome.latencyMs,
      message: `Connected. Model replied "${outcome.parsed.decision}" in ${outcome.latencyMs}ms.`,
    };
  } catch (err) {
    return { ok: false, message: describeError(err) };
  }
}
