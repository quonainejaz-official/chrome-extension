import type { Platform } from './post';

export type Theme = 'light' | 'dark' | 'system';

/** How hidden posts are visually treated in the feed. */
export type HideMode = 'hide' | 'blur' | 'collapse';

/** Detection aggressiveness. Maps to a default confidence threshold + prompt bias. */
export type Sensitivity = 'low' | 'medium' | 'high' | 'aggressive';

/** Supported provider families. All are OpenAI chat-completions compatible. */
export type ProviderId = 'openrouter' | 'openai' | 'zenmux' | 'opencode' | 'custom';

/**
 * A single named API configuration. Users can keep several profiles (e.g. a
 * cheap model for bulk classification and a stronger one for spot checks) and
 * switch the active one.
 */
export interface ApiProfile {
  id: string;
  name: string;
  provider: ProviderId;
  /** Full chat-completions endpoint or a base URL (normalised at call time). */
  apiUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  /** Request `response_format: { type: 'json_object' }` when the endpoint supports it. */
  jsonMode: boolean;
  /** USD price per 1,000,000 prompt tokens (for cost estimation only). */
  promptPricePerM: number;
  /** USD price per 1,000,000 completion tokens (for cost estimation only). */
  completionPricePerM: number;
}

export interface Whitelist {
  /** Author handles/names that are never hidden. */
  authors: string[];
  /** Subreddits (without r/) that are never hidden. */
  subreddits: string[];
  /** LinkedIn company pages that are never hidden. */
  companies: string[];
  /** Never hide posts from verified accounts. */
  allowVerified: boolean;
}

export interface Blacklist {
  /** Author handles/names that are always hidden. */
  authors: string[];
  /** Case-insensitive keywords/phrases that force a hide. */
  keywords: string[];
  /** Hashtags (without #) that force a hide. */
  hashtags: string[];
}

export type PlatformToggles = Record<Platform, boolean>;

/**
 * The complete, versioned settings object persisted to chrome.storage.local.
 * `version` allows forward-compatible migrations.
 */
export interface Settings {
  version: number;

  // General
  enabled: boolean;
  paused: boolean;
  hideMode: HideMode;
  showBadge: boolean;
  notifications: boolean;

  // Detection
  sensitivity: Sensitivity;
  confidenceThreshold: number;
  platforms: PlatformToggles;

  // API
  activeProfileId: string;
  profiles: ApiProfile[];

  // Lists
  whitelist: Whitelist;
  blacklist: Blacklist;

  // Appearance
  theme: Theme;

  // Debug
  debug: boolean;
  logResponses: boolean;
}

/** A partial settings patch used by the settings manager to apply updates. */
export type SettingsPatch = Partial<Settings>;
