import type { ProviderId } from '@/types';

export interface ProviderPreset {
  id: ProviderId;
  label: string;
  /** Default chat-completions endpoint. Empty string means "user must supply". */
  apiUrl: string;
  /** A sensible, inexpensive default model for classification. */
  defaultModel: string;
  /** Where users obtain an API key. */
  docsUrl: string;
  /** Extra headers merged into every request (values are static hints). */
  extraHeaders?: Record<string, string>;
  /** Short helper text shown in the API settings UI. */
  hint: string;
}

/**
 * All supported providers speak the OpenAI chat-completions protocol, so a
 * single client handles them; presets only differ by endpoint, default model
 * and optional headers.
 */
export const PROVIDER_PRESETS: Record<ProviderId, ProviderPreset> = {
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'openai/gpt-4o-mini',
    docsUrl: 'https://openrouter.ai/keys',
    extraHeaders: {
      'HTTP-Referer': 'https://github.com/unslop/unslop',
      'X-Title': 'Unslop',
    },
    hint: 'Access hundreds of models with one key. Model format: "vendor/model".',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    docsUrl: 'https://platform.openai.com/api-keys',
    hint: 'Official OpenAI endpoint. Use a model id such as "gpt-4o-mini".',
  },
  zenmux: {
    id: 'zenmux',
    label: 'ZenMux',
    apiUrl: 'https://api.zenmux.ai/v1/chat/completions',
    defaultModel: 'openai/gpt-4o-mini',
    docsUrl: 'https://zenmux.ai',
    hint: 'OpenAI-compatible router. Confirm the exact endpoint from your dashboard.',
  },
  opencode: {
    id: 'opencode',
    label: 'OpenCode',
    apiUrl: 'https://api.opencode.ai/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    docsUrl: 'https://opencode.ai',
    hint: 'OpenAI-compatible gateway. Adjust the endpoint to match your provider.',
  },
  custom: {
    id: 'custom',
    label: 'Custom / OpenAI-compatible',
    apiUrl: '',
    defaultModel: '',
    docsUrl: '',
    hint: 'Any endpoint exposing POST /chat/completions with a Bearer token.',
  },
};

export const PROVIDER_IDS: ProviderId[] = [
  'openrouter',
  'openai',
  'zenmux',
  'opencode',
  'custom',
];
