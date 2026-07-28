/** The three social platforms Unslop supports. */
export type Platform = 'linkedin' | 'twitter' | 'reddit';

/** The classifier's binary decision. */
export type Decision = 'keep' | 'hide';

/** Where a decision came from — used for stats, logging and the debug view. */
export type ClassificationSource =
  | 'cache'
  | 'llm'
  | 'blacklist'
  | 'whitelist'
  | 'disabled'
  | 'skipped'
  | 'error';

/**
 * The data extracted from a single visible post and sent to the background
 * worker for classification. Only the currently visible post's text is ever
 * transmitted, and nothing here is persisted (see privacy notes in README).
 */
export interface PostData {
  platform: Platform;
  /** Normalised, plain-text content of the post. */
  text: string;
  /** Human-readable author/display name, if detected. */
  author?: string;
  /** Machine handle / username (e.g. @jack, u/spez), if detected. */
  authorHandle?: string;
  /** Whether the author is a verified account, if detectable. */
  verified?: boolean;
  /** Subreddit name without the r/ prefix (Reddit only). */
  subreddit?: string;
  /** Company/organisation page name (LinkedIn only). */
  company?: string;
  /** Hashtags found in the post text, lower-cased, without the # prefix. */
  hashtags?: string[];
  /** Permalink for the post, if available. Never stored. */
  url?: string;
}

/** Result of classifying a post, returned to the content script. */
export interface ClassifyResult {
  /** SHA-256 hash of the normalised post text. */
  hash: string;
  decision: Decision;
  /** Model/heuristic certainty, 0–1. */
  confidence: number;
  source: ClassificationSource;
  /** Whether the decision was served from the local cache. */
  cached: boolean;
  /** Short machine-readable reason (e.g. "blacklist:keyword:crypto"). */
  reason?: string;
  /** Human-readable error message when source === 'error'. */
  error?: string;
}
