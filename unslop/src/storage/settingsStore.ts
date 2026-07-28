import type {
  ApiProfile,
  Blacklist,
  PlatformToggles,
  ProviderId,
  Settings,
  Whitelist,
} from '@/types';
import {
  createDefaultProfile,
  createDefaultSettings,
  DEFAULT_PROFILE_ID,
  PROVIDER_IDS,
  SENSITIVITY_IDS,
  SETTINGS_VERSION,
  STORAGE_KEYS,
} from '@/constants';
import { clamp, dedupe } from '@/utils/sanitize';
import { getRaw, setRaw } from './local';

type Unknown = Record<string, unknown>;

function asRecord(value: unknown): Unknown {
  return value && typeof value === 'object' ? (value as Unknown) : {};
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return dedupe(value.filter((v): v is string => typeof v === 'string' && v.trim() !== ''));
}

function normalizeProvider(value: unknown): ProviderId {
  return PROVIDER_IDS.includes(value as ProviderId) ? (value as ProviderId) : 'custom';
}

function normalizeProfile(raw: unknown, index: number): ApiProfile {
  const base = createDefaultProfile();
  const r = asRecord(raw);
  return {
    id: asString(r.id, index === 0 ? DEFAULT_PROFILE_ID : `profile-${index}`),
    name: asString(r.name, `Profile ${index + 1}`).slice(0, 60),
    provider: normalizeProvider(r.provider),
    apiUrl: asString(r.apiUrl, base.apiUrl).trim(),
    apiKey: asString(r.apiKey, ''),
    model: asString(r.model, base.model).trim(),
    temperature: clamp(asNumber(r.temperature, base.temperature), 0, 2),
    maxTokens: clamp(Math.round(asNumber(r.maxTokens, base.maxTokens)), 1, 4096),
    jsonMode: asBool(r.jsonMode, base.jsonMode),
    promptPricePerM: Math.max(0, asNumber(r.promptPricePerM, 0)),
    completionPricePerM: Math.max(0, asNumber(r.completionPricePerM, 0)),
  };
}

function normalizeProfiles(raw: unknown): ApiProfile[] {
  const arr = Array.isArray(raw) ? raw : [];
  const profiles = arr.map((p, i) => normalizeProfile(p, i));
  if (profiles.length === 0) profiles.push(createDefaultProfile());
  // Ensure ids are unique.
  const seen = new Set<string>();
  for (const p of profiles) {
    while (seen.has(p.id)) p.id = `${p.id}-x`;
    seen.add(p.id);
  }
  return profiles;
}

function normalizeWhitelist(raw: unknown): Whitelist {
  const r = asRecord(raw);
  return {
    authors: asStringArray(r.authors),
    subreddits: asStringArray(r.subreddits),
    companies: asStringArray(r.companies),
    allowVerified: asBool(r.allowVerified, false),
  };
}

function normalizeBlacklist(raw: unknown): Blacklist {
  const r = asRecord(raw);
  return {
    authors: asStringArray(r.authors),
    keywords: asStringArray(r.keywords),
    hashtags: asStringArray(r.hashtags).map((h) => h.replace(/^#+/, '').toLowerCase()),
  };
}

function normalizePlatforms(raw: unknown): PlatformToggles {
  const r = asRecord(raw);
  return {
    linkedin: asBool(r.linkedin, true),
    twitter: asBool(r.twitter, true),
    reddit: asBool(r.reddit, true),
  };
}

/**
 * Produces a complete, valid Settings object from arbitrary (possibly partial
 * or legacy) stored data, filling defaults and clamping every field.
 */
export function normalizeSettings(raw: unknown): Settings {
  const defaults = createDefaultSettings();
  const r = asRecord(raw);

  const profiles = normalizeProfiles(r.profiles);
  let activeProfileId = asString(r.activeProfileId, profiles[0].id);
  if (!profiles.some((p) => p.id === activeProfileId)) {
    activeProfileId = profiles[0].id;
  }

  const sensitivity = SENSITIVITY_IDS.includes(r.sensitivity as never)
    ? (r.sensitivity as Settings['sensitivity'])
    : defaults.sensitivity;

  const hideMode = (['hide', 'blur', 'collapse'] as const).includes(
    r.hideMode as never,
  )
    ? (r.hideMode as Settings['hideMode'])
    : defaults.hideMode;

  const theme = (['light', 'dark', 'system'] as const).includes(r.theme as never)
    ? (r.theme as Settings['theme'])
    : defaults.theme;

  return {
    version: SETTINGS_VERSION,

    enabled: asBool(r.enabled, defaults.enabled),
    paused: asBool(r.paused, defaults.paused),
    hideMode,
    showBadge: asBool(r.showBadge, defaults.showBadge),
    notifications: asBool(r.notifications, defaults.notifications),

    sensitivity,
    confidenceThreshold: clamp(
      asNumber(r.confidenceThreshold, defaults.confidenceThreshold),
      0,
      1,
    ),
    platforms: normalizePlatforms(r.platforms),

    activeProfileId,
    profiles,

    whitelist: normalizeWhitelist(r.whitelist),
    blacklist: normalizeBlacklist(r.blacklist),

    theme,

    debug: asBool(r.debug, defaults.debug),
    logResponses: asBool(r.logResponses, defaults.logResponses),
  };
}

/** Reads settings, always returning a fully-normalised object. */
export async function readSettings(): Promise<Settings> {
  const raw = await getRaw<unknown>(STORAGE_KEYS.settings);
  return normalizeSettings(raw);
}

/** Persists settings (normalised before write). */
export async function writeSettings(settings: Settings): Promise<Settings> {
  const normalized = normalizeSettings(settings);
  await setRaw(STORAGE_KEYS.settings, normalized);
  return normalized;
}

/** Returns the active API profile for a given settings object. */
export function getActiveProfile(settings: Settings): ApiProfile {
  return (
    settings.profiles.find((p) => p.id === settings.activeProfileId) ??
    settings.profiles[0]
  );
}
