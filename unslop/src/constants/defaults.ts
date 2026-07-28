import type { ApiProfile, Settings } from '@/types';
import { PROVIDER_PRESETS } from './providers';
import { SENSITIVITY_PRESETS } from './sensitivity';

export const SETTINGS_VERSION = 1;
export const DEFAULT_PROFILE_ID = 'default';

export function createDefaultProfile(): ApiProfile {
  const preset = PROVIDER_PRESETS.openrouter;
  return {
    id: DEFAULT_PROFILE_ID,
    name: 'Default',
    provider: 'openrouter',
    apiUrl: preset.apiUrl,
    apiKey: '',
    model: preset.defaultModel,
    temperature: 0,
    maxTokens: 32,
    jsonMode: false,
    promptPricePerM: 0,
    completionPricePerM: 0,
  };
}

export function createDefaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,

    enabled: true,
    paused: false,
    hideMode: 'hide',
    showBadge: true,
    notifications: false,

    sensitivity: 'medium',
    confidenceThreshold: SENSITIVITY_PRESETS.medium.threshold,
    platforms: {
      linkedin: true,
      twitter: true,
      reddit: true,
    },

    activeProfileId: DEFAULT_PROFILE_ID,
    profiles: [createDefaultProfile()],

    whitelist: {
      authors: [],
      subreddits: [],
      companies: [],
      allowVerified: false,
    },
    blacklist: {
      authors: [],
      keywords: [],
      hashtags: [],
    },

    theme: 'system',

    debug: false,
    logResponses: false,
  };
}
