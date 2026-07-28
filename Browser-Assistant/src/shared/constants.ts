// ── OpenCode Zen (default provider) ─────────────────────────────
// OpenAI-compatible endpoint. The client appends `/chat/completions`.
export const OPENCODE_ZEN_BASE_URL = 'https://opencode.ai/zen/v1';

// Default API key baked in at build time from .env (VITE_OPENCODE_ZEN_KEY).
// Users can override this in Settings, or add fully custom providers.
export const DEFAULT_OPENCODE_ZEN_KEY: string =
  (import.meta as any).env?.VITE_OPENCODE_ZEN_KEY ?? '';

// The model used out of the box. `big-pickle` requires no payment method on
// the OpenCode Zen account (unlike the metered Anthropic/OpenAI/Google models
// below), so brand-new installs work immediately with just the default key.
export const DEFAULT_MODEL_ID = 'big-pickle';

// Curated subset of OpenCode Zen models shown in the picker.
// The full catalogue lives at https://opencode.ai/zen/v1/models
export interface BuiltinModel {
  id: string;
  label: string;
  group: string;
  free?: boolean;
}

export const BUILTIN_MODELS: BuiltinModel[] = [
  // Free tier — no billing required, work out of the box.
  { id: 'big-pickle', label: 'Big Pickle', group: 'Free', free: true },
  { id: 'mimo-v2.5-free', label: 'MiMo 2.5 (Free)', group: 'Free', free: true },
  { id: 'deepseek-v4-flash-free', label: 'DeepSeek V4 Flash (Free)', group: 'Free', free: true },
  { id: 'ling-3.0-flash-free', label: 'Ling 3.0 Flash (Free)', group: 'Free', free: true },
  { id: 'nemotron-3-ultra-free', label: 'Nemotron 3 Ultra (Free)', group: 'Free', free: true },
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
export const API_TIMEOUT = 60000; // 60 seconds
export const MAX_RETRIES = 3;
export const RETRY_BASE_DELAY = 1000;
export const PANEL_WIDTH_DEFAULT = 400;
export const PANEL_WIDTH_MIN = 250;
export const PANEL_WIDTH_MAX = 600;
