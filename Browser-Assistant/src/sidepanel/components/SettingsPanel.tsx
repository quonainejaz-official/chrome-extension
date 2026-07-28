import { useMemo, useState } from 'react';
import type { Settings, CustomModel } from '../../shared/types';
import { BUILTIN_MODELS, DEFAULT_MODEL_ID } from '../../shared/constants';
import { BackIcon, PlusIcon, TrashIcon, CheckIcon } from './Icons';

interface Props {
  settings: Settings;
  onSave: (partial: Partial<Settings>) => Promise<void>;
  onBack: () => void;
  isDark: boolean;
}

const inputCls =
  'w-full px-3 py-2 rounded-lg border text-sm bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition';

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
        {desc && <p className="text-xs text-[var(--text-muted)] mt-0.5">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

function CustomModelForm({
  onAdd,
  onCancel,
}: {
  onAdd: (m: CustomModel) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState('');
  const [provider, setProvider] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');

  const valid = label.trim() && endpoint.trim() && model.trim();

  return (
    <div className="rounded-xl border border-[var(--border-color)] p-3 space-y-2.5 bg-[var(--bg-primary)]">
      <div className="grid grid-cols-1 gap-2.5">
        <div>
          <label className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">Display name *</label>
          <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. My GPT-4o" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">Provider</label>
          <input className={inputCls} value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. OpenAI, Ollama, Groq" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">Endpoint URL *</label>
          <input className={inputCls} value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.openai.com/v1" />
          <p className="text-[11px] text-[var(--text-muted)] mt-1">Base URL or full /chat/completions URL (OpenAI-compatible).</p>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">Model ID *</label>
          <input className={inputCls} value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. gpt-4o, llama3.1" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">API key (optional)</label>
          <input className={inputCls} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Leave empty if not required" />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          disabled={!valid}
          onClick={() =>
            onAdd({
              id: crypto.randomUUID(),
              label: label.trim(),
              provider: provider.trim() || 'Custom',
              endpoint: endpoint.trim(),
              model: model.trim(),
              apiKey: apiKey.trim() || undefined,
            })
          }
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            valid ? 'bg-[var(--accent)] text-white hover:opacity-90' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed'
          }`}
        >
          Add model
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function SettingsPanel({ settings, onSave, onBack }: Props) {
  const [adding, setAdding] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState(settings.apiKey);

  const groupedBuiltins = useMemo(() => {
    const groups: Record<string, typeof BUILTIN_MODELS> = {};
    for (const m of BUILTIN_MODELS) (groups[m.group] ??= []).push(m);
    return groups;
  }, []);

  const saveApiKey = (value: string) => {
    setApiKeyDraft(value);
    onSave({ apiKey: value, apiKeyConfigured: !!value.trim() });
  };

  const addCustomModel = (m: CustomModel) => {
    onSave({
      customModels: [...(settings.customModels ?? []), m],
      selectedModel: `custom:${m.id}`,
    });
    setAdding(false);
  };

  const removeCustomModel = (id: string) => {
    const next = (settings.customModels ?? []).filter((m) => m.id !== id);
    const patch: Partial<Settings> = { customModels: next };
    if (settings.selectedModel === `custom:${id}`) patch.selectedModel = DEFAULT_MODEL_ID;
    onSave(patch);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-color)] flex-shrink-0">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          aria-label="Back"
        >
          <BackIcon className="w-[18px] h-[18px]" />
        </button>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Settings</h2>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-7">
        {/* Model selection */}
        <Section title="Model" desc="Free models work instantly. Anthropic / OpenAI / Google models need a payment method on your OpenCode Zen account.">
          <select
            value={settings.selectedModel}
            onChange={(e) => onSave({ selectedModel: e.target.value })}
            className={inputCls}
          >
            {Object.entries(groupedBuiltins).map(([group, models]) => (
              <optgroup key={group} label={group === 'Free' ? 'OpenCode Zen · Free (no billing needed)' : `OpenCode Zen · ${group}`}>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </optgroup>
            ))}
            {(settings.customModels?.length ?? 0) > 0 && (
              <optgroup label="Custom">
                {settings.customModels.map((m) => (
                  <option key={m.id} value={`custom:${m.id}`}>{m.label}</option>
                ))}
              </optgroup>
            )}
          </select>
        </Section>

        {/* OpenCode Zen key */}
        <Section title="OpenCode Zen API key" desc="Overrides the built-in default key. Leave empty to use the default.">
          <input
            type="password"
            value={apiKeyDraft}
            onChange={(e) => saveApiKey(e.target.value)}
            placeholder="sk-…"
            className={inputCls}
          />
          <p className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            {settings.apiKeyConfigured && <CheckIcon className="w-3.5 h-3.5 text-[var(--success)]" />}
            {settings.apiKeyConfigured ? 'Using your key' : 'Using built-in default key'}
          </p>
        </Section>

        {/* Custom models */}
        <Section title="Custom models" desc="Add any OpenAI-compatible endpoint. API key is optional.">
          {(settings.customModels ?? []).length > 0 && (
            <div className="space-y-2">
              {settings.customModels.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{m.label}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{m.provider} · {m.model}</p>
                  </div>
                  <button
                    onClick={() => removeCustomModel(m.id)}
                    className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--error)] hover:bg-[var(--bg-tertiary)] transition-colors flex-shrink-0"
                    aria-label="Remove model"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {adding ? (
            <CustomModelForm onAdd={addCustomModel} onCancel={() => setAdding(false)} />
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-[var(--border-color)] text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Add custom model
            </button>
          )}
        </Section>

        {/* Theme */}
        <Section title="Theme">
          <div className="grid grid-cols-3 gap-2">
            {(['light', 'dark', 'system'] as const).map((t) => (
              <button
                key={t}
                onClick={() => onSave({ theme: t })}
                className={`px-3 py-2 rounded-lg text-sm capitalize transition-colors ${
                  settings.theme === t
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:opacity-80'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Section>

        {/* Default language */}
        <Section title="Default translation language">
          <select
            value={settings.defaultLanguage}
            onChange={(e) => onSave({ defaultLanguage: e.target.value })}
            className={inputCls}
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="ur">Urdu</option>
            <option value="ar">Arabic</option>
            <option value="zh">Chinese</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
            <option value="hi">Hindi</option>
            <option value="pt">Portuguese</option>
            <option value="ru">Russian</option>
          </select>
        </Section>

        {/* Auto context */}
        <Section title="Page context">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--text-secondary)]">Auto-send current page</span>
            <button
              onClick={() => onSave({ autoContext: !settings.autoContext })}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                settings.autoContext ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'
              }`}
              aria-pressed={settings.autoContext}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transform transition-transform ${
                  settings.autoContext ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
}
