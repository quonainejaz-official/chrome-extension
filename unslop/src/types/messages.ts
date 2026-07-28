import type { Platform, PostData, ClassifyResult } from './post';
import type { Settings } from './settings';
import type {
  Stats,
  LogEntry,
  QueueStatus,
  ApiHealth,
  StatusSnapshot,
} from './stats';

/**
 * Standard envelope for every message response. Handlers never throw across the
 * runtime boundary; they resolve with `{ ok: false, error }` instead.
 */
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

/** Messages sent from a content script to the background worker. */
export type ContentRequest =
  | { type: 'CLASSIFY_POST'; post: PostData; force?: boolean }
  | { type: 'GET_SETTINGS' }
  | { type: 'RECORD_SCANNED'; count: number }
  | { type: 'REPORT_WRONG'; hash: string; wasHidden: boolean }
  | { type: 'WHITELIST_AUTHOR'; platform: Platform; author: string }
  | { type: 'BLACKLIST_AUTHOR'; platform: Platform; author: string }
  | { type: 'HIDE_SIMILAR'; post: PostData };

/** Messages sent from the popup/options UI to the background worker. */
export type UiRequest =
  | { type: 'GET_STATUS' }
  | { type: 'GET_STATS' }
  | { type: 'RESET_STATS' }
  | { type: 'GET_LOGS' }
  | { type: 'CLEAR_LOGS' }
  | { type: 'GET_QUEUE_STATUS' }
  | { type: 'GET_API_HEALTH' }
  | { type: 'TEST_API'; profileId?: string }
  | { type: 'GET_CACHE_STATS' }
  | { type: 'CLEAR_CACHE' }
  | { type: 'TOGGLE_ENABLED' }
  | { type: 'TOGGLE_PAUSE' }
  | { type: 'RESCAN_ACTIVE_TAB' };

export type RuntimeRequest = ContentRequest | UiRequest;

/** Messages the background worker broadcasts to content scripts. */
export type BackgroundBroadcast =
  | { type: 'SETTINGS_UPDATED'; settings: Settings }
  | { type: 'RESCAN' };

export interface CacheStats {
  entries: number;
  maxEntries: number;
  approxBytes: number;
}

/**
 * Maps each request `type` to the payload shape resolved inside its
 * `ApiResponse`. Enables `sendMessage` to be fully type-safe at call sites.
 */
export interface ResponsePayloads {
  CLASSIFY_POST: ClassifyResult;
  GET_SETTINGS: Settings;
  RECORD_SCANNED: { ok: true };
  REPORT_WRONG: { ok: true };
  WHITELIST_AUTHOR: Settings;
  BLACKLIST_AUTHOR: Settings;
  HIDE_SIMILAR: { added: string[] };
  GET_STATUS: StatusSnapshot;
  GET_STATS: Stats;
  RESET_STATS: Stats;
  GET_LOGS: LogEntry[];
  CLEAR_LOGS: { ok: true };
  GET_QUEUE_STATUS: QueueStatus;
  GET_API_HEALTH: ApiHealth;
  TEST_API: ApiHealth;
  GET_CACHE_STATS: CacheStats;
  CLEAR_CACHE: CacheStats;
  TOGGLE_ENABLED: { enabled: boolean };
  TOGGLE_PAUSE: { paused: boolean };
  RESCAN_ACTIVE_TAB: { ok: true };
}

export type RequestType = RuntimeRequest['type'];

/** Extract the request object for a given `type` literal. */
export type RequestOf<T extends RequestType> = Extract<RuntimeRequest, { type: T }>;
