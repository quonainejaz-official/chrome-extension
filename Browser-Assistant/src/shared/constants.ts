// ── OpenCode Zen (default provider) ─────────────────────────────
// OpenAI-compatible endpoint. The client appends `/chat/completions`.
export const OPENCODE_ZEN_BASE_URL = 'https://opencode.ai/zen/v1';

// ── ZenMux (automatic provider) ─────────────────────────────────
// ZenMux is the default provider. Candidates are tried in the order shown
// below; the order mirrors the availability signal supplied for the current
// free models, with the healthiest model first.
export const ZENMUX_BASE_URL = 'https://zenmux.ai/api/v1';
export const ZENMUX_AUTO_MODEL_ID = 'zenmux:auto';
export const DEFAULT_ZENMUX_API_KEY: string =
  (import.meta as any).env?.VITE_ZENMUX_API_KEY ?? '';

export interface ZenMuxPriorityModel {
  id: string;
  label: string;
  availability: number;
}

export const ZENMUX_PRIORITY_MODELS: ZenMuxPriorityModel[] = [
  { id: 'atria-asi/atria-dawn-preview', label: 'Atria Dawn Preview', availability: 98.3 },
  { id: 'dots-studio/dots3-note-preview', label: 'Dots3 Note Preview', availability: 97.17 },
  { id: 'inclusionai/ling-3.0-tiny', label: 'Ling 3.0 Tiny', availability: 66.67 },
  { id: 'inclusionai/ling-3.0-flash-vl', label: 'Ling 3.0 Flash VL', availability: 42.25 },
];

// Default API key baked in at build time from .env (VITE_OPENCODE_ZEN_KEY).
// Users can override this in Settings, or add fully custom providers.
export const DEFAULT_OPENCODE_ZEN_KEY: string =
  (import.meta as any).env?.VITE_OPENCODE_ZEN_KEY ?? '';

// The model used out of the box. Free (no payment method needed) and, of the
// free tier, the one that reliably answers rather than returning a free-usage
// limit. It is a reasoning model, so it thinks for ~20-30s before its first
// token — which is why the agent batches as much work as possible per turn.
export const DEFAULT_MODEL_ID = 'nemotron-3-ultra-free';

// Curated subset of OpenCode Zen models shown in the picker.
// The full catalogue lives at https://opencode.ai/zen/v1/models
export interface BuiltinModel {
  id: string;
  label: string;
  group: string;
  free?: boolean;
}

export const BUILTIN_MODELS: BuiltinModel[] = [
  // Free tier — no billing required. Default first.
  // `ling-3.0-flash-free` was removed: the provider now rejects it outright
  // ("Model ling-3.0-flash-free is not supported"), so listing it only ever
  // produced a confusing failure.
  { id: 'nemotron-3-ultra-free', label: 'Nemotron 3 Ultra (Free)', group: 'Free', free: true },
  { id: 'big-pickle', label: 'Big Pickle', group: 'Free', free: true },
  { id: 'mimo-v2.5-free', label: 'MiMo 2.5 (Free)', group: 'Free', free: true },
  { id: 'deepseek-v4-flash-free', label: 'DeepSeek V4 Flash (Free)', group: 'Free', free: true },
  // Anthropic (metered — requires a payment method on the account)
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', group: 'Anthropic' },
  { id: 'claude-opus-5', label: 'Claude Opus 5', group: 'Anthropic' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', group: 'Anthropic' },
  // OpenAI (metered)
  { id: 'gpt-5.5', label: 'GPT-5.5', group: 'OpenAI' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', group: 'OpenAI' },
  { id: 'gpt-5', label: 'GPT-5', group: 'OpenAI' },
  // Google (metered)
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', group: 'Google' },
  { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro', group: 'Google' },
];

// ── Limits & timing ─────────────────────────────────────────────
export const MAX_CONTENT_LENGTH = 50000;
export const MAX_SELECTION_LENGTH = 5000;
export const MAX_MESSAGES_PER_CONVERSATION = 200;
export const MAX_CONVERSATIONS = 50;
export const PAGE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
export const API_TIMEOUT = 60000; // 60 seconds to first byte
// Once tokens are flowing, a much shorter gap means the stream has stalled.
export const STREAM_IDLE_TIMEOUT = 30000;
// Hard ceiling on any single request. Reasoning models keep the connection
// alive while they think, so without this a queued request can hang for
// minutes and still return nothing.
export const MAX_REQUEST_TIME = 120000;
export const MAX_RETRIES = 3;
export const RETRY_BASE_DELAY = 1000;
// Ceiling for a single backoff sleep. A provider that asks for a two-minute
// Retry-After should not freeze an agent run for two minutes.
export const MAX_RETRY_DELAY = 15000;
export const PANEL_WIDTH_DEFAULT = 400;

// ── Agent mode ──────────────────────────────────────────────────
// Actions per run. High enough for a long checkout form, low enough that a
// confused model cannot grind through a page indefinitely.
// Model round-trips per run. One turn can now carry a whole batch of actions,
// so this is a planning budget, not an action budget.
export const DEFAULT_MAX_AGENT_STEPS = 14;
export const MAX_AGENT_STEPS_LIMIT = 40;

// Total actions per run, counted separately. A long checkout form is easily 30
// fields; capping actions and turns with one number stopped such a form less
// than halfway through.
export const DEFAULT_MAX_AGENT_ACTIONS = 60;
export const MAX_AGENT_ACTIONS_LIMIT = 120;
export const PANEL_WIDTH_MIN = 250;
export const PANEL_WIDTH_MAX = 600;
