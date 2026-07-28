import { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { sendMessage } from '@/hooks';
import { useTheme } from '@/hooks';
import type {
  Settings,
  LogEntry,
  Theme,
  HideMode,
  ProviderId,
  CacheStats,
  ApiHealth,
} from '@/types';
import { SENSITIVITY_PRESETS, SENSITIVITY_IDS, PROVIDER_PRESETS, PROVIDER_IDS } from '@/constants';
import { Toggle } from '@/components/Toggle';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Select } from '@/components/Select';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { TagInput } from '@/components/TagInput';

type TabId = 'general' | 'api' | 'detection' | 'whitelist' | 'blacklist' | 'appearance' | 'debug';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: '\u2699\uFE0F' },
  { id: 'api', label: 'API Settings', icon: '\uD83D\uDD11' },
  { id: 'detection', label: 'Detection', icon: '\uD83D\uDD0D' },
  { id: 'whitelist', label: 'Whitelist', icon: '\u2705' },
  { id: 'blacklist', label: 'Blacklist', icon: '\uD83D\uDEAB' },
  { id: 'appearance', label: 'Appearance', icon: '\uD83C\uDFA8' },
  { id: 'debug', label: 'Debug', icon: '\uD83D\uDC1B' },
];

function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useTheme(settings?.theme ?? 'system');

  const load = useCallback(async () => {
    try {
      const s = await sendMessage({ type: 'GET_SETTINGS' } as never);
      setSettings(s as Settings);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (next: Settings) => {
    setSettings(next);
    await sendMessage({ type: 'GET_SETTINGS' } as never);
    // We write through storage — the background listener will update settings.
    chrome.storage.local.set({ 'unslop:settings': next });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, []);

  const update = useCallback(async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    if (!settings) return;
    await save({ ...settings, [key]: value });
  }, [settings, save]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="w-10 h-10 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-500">
        Failed to load settings
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 font-sans">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">U</span>
              </div>
              Unslop Settings
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Configure your AI post detection preferences
            </p>
          </div>
          {saved && (
            <Badge variant="success" className="animate-fade-in">Saved</Badge>
          )}
        </div>

        <div className="flex gap-6">
          {/* Sidebar nav */}
          <nav className="w-52 flex-shrink-0">
            <Card className="p-2">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </Card>

            {/* Quick actions */}
            <Card className="mt-4 p-3">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-2 font-medium uppercase tracking-wider">Quick Actions</p>
              <div className="space-y-1">
                <QuickAction
                  icon={'\uD83D\uDCE4'}
                  label="Export Settings"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'unslop-settings.json';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                />
                <QuickAction
                  icon={'\uD83D\uDCE5'}
                  label="Import Settings"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.json';
                    input.onchange = async (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (!file) return;
                      try {
                        const text = await file.text();
                        const imported = JSON.parse(text) as Settings;
                        await save(imported);
                      } catch {
                        alert('Invalid settings file');
                      }
                    };
                    input.click();
                  }}
                />
                <QuickAction
                  icon={'\uD83D\uDD04'}
                  label="Reset to Defaults"
                  onClick={async () => {
                    if (confirm('Reset all settings to default?')) {
                      await sendMessage({ type: 'GET_SETTINGS' } as never);
                      location.reload();
                    }
                  }}
                  danger
                />
              </div>
            </Card>
          </nav>

          {/* Main content */}
          <main className="flex-1 min-w-0">
            {activeTab === 'general' && (
              <GeneralTab settings={settings} update={update} />
            )}
            {activeTab === 'api' && (
              <ApiTab settings={settings} save={save} />
            )}
            {activeTab === 'detection' && (
              <DetectionTab settings={settings} update={update} />
            )}
            {activeTab === 'whitelist' && (
              <WhitelistTab settings={settings} save={save} />
            )}
            {activeTab === 'blacklist' && (
              <BlacklistTab settings={settings} save={save} />
            )}
            {activeTab === 'appearance' && (
              <AppearanceTab settings={settings} update={update} />
            )}
            {activeTab === 'debug' && (
              <DebugTab />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick Action button
// ---------------------------------------------------------------------------

function QuickAction({ icon, label, onClick, danger }: {
  icon: string; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left text-xs px-2 py-1.5 rounded transition-colors ${
        danger
          ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      {icon} {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Setting row
// ---------------------------------------------------------------------------

function SettingRow({ label, desc, children }: {
  label: string; desc?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
        {desc && <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GENERAL TAB
// ---------------------------------------------------------------------------

function GeneralTab({ settings, update }: { settings: Settings; update: <K extends keyof Settings>(k: K, v: Settings[K]) => void }) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">General Settings</h2>
      <SettingRow label="Enable Extension" desc="Turn the extension on or off">
        <Toggle checked={settings.enabled} onChange={(v) => update('enabled', v)} />
      </SettingRow>
      <SettingRow label="Pause Detection" desc="Temporarily stop classifying posts">
        <Toggle checked={settings.paused} onChange={(v) => update('paused', v)} />
      </SettingRow>
      <SettingRow label="Show Badge" desc="Show hidden post count on icon">
        <Toggle checked={settings.showBadge} onChange={(v) => update('showBadge', v)} />
      </SettingRow>
      <SettingRow label="Notifications" desc="Show notification on errors">
        <Toggle checked={settings.notifications} onChange={(v) => update('notifications', v)} />
      </SettingRow>
      <div className="mt-4">
        <label className="text-sm font-medium text-gray-900 dark:text-white mb-2 block">Hide Mode</label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">How hidden posts are treated</p>
        <div className="grid grid-cols-3 gap-2">
          {(['hide', 'blur', 'collapse'] as HideMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => update('hideMode', mode)}
              className={`py-2 px-3 rounded-lg text-sm font-medium capitalize transition-colors ${
                settings.hideMode === mode
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// API TAB
// ---------------------------------------------------------------------------

function ApiTab({ settings, save }: { settings: Settings; save: (s: Settings) => Promise<void> }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const updateProfile = async (profileId: string, updates: Partial<Settings['profiles'][0]>) => {
    const profiles = settings.profiles.map((p) =>
      p.id === profileId ? { ...p, ...updates } : p,
    );
    await save({ ...settings, profiles });
  };

  const addProfile = async () => {
    const preset = PROVIDER_PRESETS.openrouter;
    const newProfile = {
      id: `profile-${Date.now()}`,
      name: `Profile ${settings.profiles.length + 1}`,
      provider: 'openrouter' as ProviderId,
      apiUrl: preset.apiUrl,
      apiKey: '',
      model: preset.defaultModel,
      temperature: 0,
      maxTokens: 32,
      jsonMode: false,
      promptPricePerM: 0,
      completionPricePerM: 0,
    };
    await save({ ...settings, profiles: [...settings.profiles, newProfile] });
  };

  const removeProfile = async (id: string) => {
    if (settings.profiles.length <= 1) return;
    const profiles = settings.profiles.filter((p) => p.id !== id);
    const activeId = settings.activeProfileId === id ? profiles[0].id : settings.activeProfileId;
    await save({ ...settings, profiles, activeProfileId: activeId });
  };

  const testApi = async (profileId?: string) => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await sendMessage({ type: 'TEST_API', profileId } as never) as { state: string; message?: string; latencyMs?: number };
      setTestResult(res.message ?? `State: ${res.state}`);
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">API Profiles</h2>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => testApi()} disabled={testing}>
              {testing ? 'Testing...' : 'Test API'}
            </Button>
            <Button size="sm" onClick={addProfile}>+ Add Profile</Button>
          </div>
        </div>

        {testResult && (
          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-xs font-mono text-gray-700 dark:text-gray-300">
            {testResult}
          </div>
        )}

        {settings.profiles.map((profile) => (
          <ProfileCard
            key={profile.id}
            profile={profile}
            isActive={settings.activeProfileId === profile.id}
            onUpdate={(updates) => updateProfile(profile.id, updates)}
            onActivate={() => save({ ...settings, activeProfileId: profile.id })}
            onRemove={() => removeProfile(profile.id)}
            canRemove={settings.profiles.length > 1}
          />
        ))}
      </Card>
    </div>
  );
}

function ProfileCard({
  profile,
  isActive,
  onUpdate,
  onActivate,
  onRemove,
  canRemove,
}: {
  profile: Settings['profiles'][0];
  isActive: boolean;
  onUpdate: (u: Partial<Settings['profiles'][0]>) => void;
  onActivate: () => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className={`p-4 rounded-lg border mb-3 ${
      isActive
        ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/10'
        : 'border-gray-200 dark:border-gray-700'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <input
          type="text"
          value={profile.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="bg-transparent font-medium text-sm text-gray-900 dark:text-white focus:outline-none border-b border-transparent focus:border-brand-500"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" variant={isActive ? 'primary' : 'secondary'} onClick={onActivate}>
            {isActive ? 'Active' : 'Set Active'}
          </Button>
          {canRemove && (
            <Button size="sm" variant="danger" onClick={onRemove}>Remove</Button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <Select
          label="Provider"
          value={profile.provider}
          onChange={(e) => {
            const provider = e.target.value as ProviderId;
            const preset = PROVIDER_PRESETS[provider];
            const updates: Partial<Settings['profiles'][0]> = { provider };
            if (preset.apiUrl) updates.apiUrl = preset.apiUrl;
            if (preset.defaultModel) updates.model = preset.defaultModel;
            onUpdate(updates);
          }}
          options={PROVIDER_IDS.map((id) => ({ value: id, label: PROVIDER_PRESETS[id].label }))}
        />
        <Input
          label="API URL"
          value={profile.apiUrl}
          onChange={(e) => onUpdate({ apiUrl: e.target.value })}
          placeholder="https://openrouter.ai/api/v1/chat/completions"
        />
        <Input
          label="API Key"
          type="password"
          value={profile.apiKey}
          onChange={(e) => onUpdate({ apiKey: e.target.value })}
          placeholder="sk-..."
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Model"
            value={profile.model}
            onChange={(e) => onUpdate({ model: e.target.value })}
            placeholder="openai/gpt-4o-mini"
          />
          <Input
            label="Max Tokens"
            type="number"
            value={profile.maxTokens}
            onChange={(e) => onUpdate({ maxTokens: parseInt(e.target.value) || 32 })}
            min={1}
            max={4096}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
            Temperature: {profile.temperature}
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={profile.temperature}
            onChange={(e) => onUpdate({ temperature: parseFloat(e.target.value) })}
            className="w-full"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Prompt $/1M tokens"
            type="number"
            value={profile.promptPricePerM}
            onChange={(e) => onUpdate({ promptPricePerM: parseFloat(e.target.value) || 0 })}
            min={0}
            step={0.1}
          />
          <Input
            label="Completion $/1M tokens"
            type="number"
            value={profile.completionPricePerM}
            onChange={(e) => onUpdate({ completionPricePerM: parseFloat(e.target.value) || 0 })}
            min={0}
            step={0.1}
          />
        </div>
        <SettingRow label="JSON Mode" desc="Request response_format: json_object">
          <Toggle checked={profile.jsonMode} onChange={(v) => onUpdate({ jsonMode: v })} size="sm" />
        </SettingRow>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DETECTION TAB
// ---------------------------------------------------------------------------

function DetectionTab({ settings, update }: { settings: Settings; update: <K extends keyof Settings>(k: K, v: Settings[K]) => void }) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Detection Settings</h2>

      <div className="mb-5">
        <label className="text-sm font-medium text-gray-900 dark:text-white mb-1 block">Sensitivity</label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Higher sensitivity catches more AI posts but may have false positives
        </p>
        <div className="grid grid-cols-4 gap-2">
          {SENSITIVITY_IDS.map((level) => {
            const preset = SENSITIVITY_PRESETS[level];
            return (
              <button
                key={level}
                onClick={() => {
                  update('sensitivity', level);
                  update('confidenceThreshold', preset.threshold);
                }}
                className={`p-3 rounded-lg text-center transition-colors ${
                  settings.sensitivity === level
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <span className="text-sm font-medium block">{preset.label}</span>
                <span className="text-[10px] opacity-70 block mt-0.5">{preset.threshold}</span>
              </button>
            );
          })}
        </div>
        {SENSITIVITY_PRESETS[settings.sensitivity] && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {SENSITIVITY_PRESETS[settings.sensitivity].description}
          </p>
        )}
      </div>

      <div className="mb-4">
        <label className="text-sm font-medium text-gray-900 dark:text-white mb-1 block">
          Confidence Threshold: {(settings.confidenceThreshold * 100).toFixed(0)}%
        </label>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={settings.confidenceThreshold}
          onChange={(e) => update('confidenceThreshold', parseFloat(e.target.value))}
          className="w-full"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-gray-900 dark:text-white mb-2 block">Platforms</label>
        {(['linkedin', 'twitter', 'reddit'] as const).map((platform) => (
          <SettingRow
            key={platform}
            label={platform.charAt(0).toUpperCase() + platform.slice(1)}
            desc={`Scan posts on ${platform}`}
          >
            <Toggle
              checked={settings.platforms[platform]}
              onChange={(v) => update('platforms', { ...settings.platforms, [platform]: v })}
              size="sm"
            />
          </SettingRow>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// WHITELIST TAB
// ---------------------------------------------------------------------------

function WhitelistTab({ settings, save }: { settings: Settings; save: (s: Settings) => Promise<void> }) {
  const updateList = async (key: keyof Settings['whitelist'], value: string[]) => {
    await save({
      ...settings,
      whitelist: { ...settings.whitelist, [key]: value },
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Authors</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Never hide posts from these users</p>
        <TagInput
          tags={settings.whitelist.authors}
          onChange={(v) => updateList('authors', v)}
          placeholder="username or handle"
          color="green"
        />
      </Card>
      <Card>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Subreddits</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Never hide posts from these subreddits</p>
        <TagInput
          tags={settings.whitelist.subreddits}
          onChange={(v) => updateList('subreddits', v)}
          placeholder="r/subreddit"
          color="green"
        />
      </Card>
      <Card>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Companies</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Never hide posts from these LinkedIn companies</p>
        <TagInput
          tags={settings.whitelist.companies}
          onChange={(v) => updateList('companies', v)}
          placeholder="company name"
          color="green"
        />
      </Card>
      <Card>
        <SettingRow label="Allow Verified Accounts" desc="Never hide posts from verified accounts">
          <Toggle
            checked={settings.whitelist.allowVerified}
            onChange={(v) => updateList('allowVerified' as never, v as never)}
            size="sm"
          />
        </SettingRow>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BLACKLIST TAB
// ---------------------------------------------------------------------------

function BlacklistTab({ settings, save }: { settings: Settings; save: (s: Settings) => Promise<void> }) {
  const updateList = async (key: keyof Settings['blacklist'], value: string[]) => {
    await save({
      ...settings,
      blacklist: { ...settings.blacklist, [key]: value },
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Authors</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Always hide posts from these users</p>
        <TagInput
          tags={settings.blacklist.authors}
          onChange={(v) => updateList('authors', v)}
          placeholder="username or handle"
          color="red"
        />
      </Card>
      <Card>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Keywords</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Always hide posts containing these keywords</p>
        <TagInput
          tags={settings.blacklist.keywords}
          onChange={(v) => updateList('keywords', v)}
          placeholder="keyword"
          color="red"
        />
      </Card>
      <Card>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Hashtags</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Always hide posts with these hashtags</p>
        <TagInput
          tags={settings.blacklist.hashtags}
          onChange={(v) => updateList('hashtags', v)}
          placeholder="#hashtag"
          color="red"
        />
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// APPEARANCE TAB
// ---------------------------------------------------------------------------

function AppearanceTab({ settings, update }: { settings: Settings; update: <K extends keyof Settings>(k: K, v: Settings[K]) => void }) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Appearance</h2>
      <div className="grid grid-cols-3 gap-3">
        {([
          { value: 'light' as Theme, icon: '\u2600\uFE0F', label: 'Light' },
          { value: 'dark' as Theme, icon: '\uD83C\uDF19', label: 'Dark' },
          { value: 'system' as Theme, icon: '\uD83D\uDCBB', label: 'System' },
        ]).map((opt) => (
          <button
            key={opt.value}
            onClick={() => update('theme', opt.value)}
            className={`p-4 rounded-lg border text-center transition-colors ${
              settings.theme === opt.value
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
            }`}
          >
            <span className="text-2xl block mb-1">{opt.icon}</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">{opt.label}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// DEBUG TAB
// ---------------------------------------------------------------------------

function DebugTab() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [queueStatus, setQueueStatus] = useState<{ pending: number; inFlight: number; completed: number } | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const [l, cs, h, qs] = await Promise.all([
        sendMessage({ type: 'GET_LOGS' } as never) as Promise<LogEntry[]>,
        sendMessage({ type: 'GET_CACHE_STATS' } as never) as Promise<CacheStats>,
        sendMessage({ type: 'GET_API_HEALTH' } as never) as Promise<ApiHealth>,
        sendMessage({ type: 'GET_QUEUE_STATUS' } as never) as Promise<{ pending: number; inFlight: number; completed: number }>,
      ]);
      setLogs(l);
      setCacheStats(cs);
      setHealth(h);
      setQueueStatus(qs);
    } catch {
      // ignore
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const clearLogs = async () => {
    await sendMessage({ type: 'CLEAR_LOGS' } as never);
    setLogs([]);
  };

  const clearCache = async () => {
    const res = await sendMessage({ type: 'CLEAR_CACHE' } as never) as CacheStats;
    setCacheStats(res);
  };

  return (
    <div className="space-y-4">
      {/* Status cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">API Health</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
            {health?.state ?? 'Unknown'}
            {health?.latencyMs ? ` (${health.latencyMs}ms)` : ''}
          </p>
        </Card>
        <Card>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Cache</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
            {cacheStats?.entries ?? 0} / {cacheStats?.maxEntries ?? 0}
          </p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            ~{cacheStats?.approxBytes ? (cacheStats.approxBytes / 1024).toFixed(1) : '0'} KB
          </p>
        </Card>
        <Card>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Queue</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
            {queueStatus?.pending ?? 0} pending
          </p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            {queueStatus?.inFlight ?? 0} in-flight, {queueStatus?.completed ?? 0} done
          </p>
        </Card>
      </div>

      {/* Logs */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Debug Logs</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={loadLogs} disabled={loadingLogs}>Refresh</Button>
            <Button size="sm" variant="danger" onClick={clearLogs}>Clear</Button>
            <Button size="sm" variant="secondary" onClick={clearCache}>Clear Cache</Button>
          </div>
        </div>
        <div className="max-h-[500px] overflow-y-auto space-y-1.5">
          {logs.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No logs yet</p>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className={`p-2.5 rounded-lg text-xs font-mono ${
                  log.level === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' :
                  log.level === 'warn' ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400' :
                  log.category === 'llm' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' :
                  'bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400'
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-bold uppercase">{log.level}:{log.category}</span>
                  <span className="opacity-60">{new Date(log.ts).toLocaleTimeString()}</span>
                </div>
                <p>{log.message}</p>
                {log.meta && (
                  <pre className="mt-1 opacity-60 whitespace-pre-wrap overflow-x-auto text-[10px]">
                    {JSON.stringify(log.meta, null, 2)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

// Mount
const root = createRoot(document.getElementById('root')!);
root.render(<App />);
