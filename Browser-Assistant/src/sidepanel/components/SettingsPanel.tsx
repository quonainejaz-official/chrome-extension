import { useMemo, useState } from 'react';
import type { Settings, CustomModel, ConfirmMode } from '../../shared/types';
import { sendMessageToBackground } from '../lib/messaging';
import { BUILTIN_MODELS, ZENMUX_AUTO_MODEL_ID, ZENMUX_PRIORITY_MODELS, MAX_AGENT_STEPS_LIMIT, MAX_AGENT_ACTIONS_LIMIT } from '../../shared/constants';
import { BackIcon, PlusIcon, TrashIcon, CheckIcon, ChevronDownIcon, RefreshIcon } from './Icons';
import { ProfileSection } from './ProfileSection';

interface Props {
  settings: Settings;
  onSave: (partial: Partial<Settings>) => Promise<void>;
  onBack: () => void;
  isDark: boolean;
}

type TestResult = { ok: boolean; message: string };

const inputCls =
  'w-full px-3 py-2 rounded-lg border text-sm bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus:border-transparent transition-colors';

function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-[var(--text-secondary)]">{label}</p>
        {desc && <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{desc}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 mt-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${checked ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'}`}
        aria-pressed={checked}
        aria-label={label}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transform transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

function Subsection({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
        {desc && <p className="text-xs text-[var(--text-muted)] mt-0.5">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function AccordionCard({ id, title, desc, open, onToggle, children }: { id: string; title: string; desc: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border overflow-hidden border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-[var(--bg-tertiary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--text-primary)]">{title}</span>
          <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">{desc}</span>
        </span>
        <ChevronDownIcon className={`w-4 h-4 flex-shrink-0 text-[var(--text-secondary)] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && <div id={id} className="border-t border-[var(--border-color)] p-3.5 space-y-5">{children}</div>}
    </section>
  );
}

function CustomModelForm({ onAdd, onCancel, onTest }: { onAdd: (model: CustomModel) => void; onCancel: () => void; onTest: (model: CustomModel) => Promise<TestResult> }) {
  const [label, setLabel] = useState('');
  const [provider, setProvider] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const valid = Boolean(label.trim() && endpoint.trim() && model.trim());
  const draft = (): CustomModel => ({ id: 'draft', label: label.trim(), provider: provider.trim() || 'Custom', endpoint: endpoint.trim(), model: model.trim(), apiKey: apiKey.trim() || undefined });

  const test = async () => {
    if (!valid) return;
    setTesting(true);
    setTestResult(null);
    setTestResult(await onTest(draft()));
    setTesting(false);
  };

  return (
    <div className="rounded-xl border border-[var(--border-color)] p-3 space-y-2.5 bg-[var(--bg-primary)]">
      <div className="grid grid-cols-1 gap-2.5">
        <div><label htmlFor="custom-model-label" className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">Display name *</label><input id="custom-model-label" name="custom-model-label" autoComplete="off" className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. My GPT-4o…" /></div>
        <div><label htmlFor="custom-model-provider" className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">Provider</label><input id="custom-model-provider" name="custom-model-provider" autoComplete="off" className={inputCls} value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. OpenAI, Ollama, Groq…" /></div>
        <div><label htmlFor="custom-model-endpoint" className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">Endpoint URL *</label><input id="custom-model-endpoint" name="custom-model-endpoint" autoComplete="url" type="url" className={inputCls} value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.example.com/v1…" /><p className="text-[11px] text-[var(--text-muted)] mt-1">Base URL or full /chat/completions URL (OpenAI-compatible).</p></div>
        <div><label htmlFor="custom-model-id" className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">Model ID *</label><input id="custom-model-id" name="custom-model-id" autoComplete="off" className={inputCls} value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. gpt-4o, llama3.1…" /></div>
        <div><label htmlFor="custom-model-api-key" className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">API key (optional)</label><input id="custom-model-api-key" name="custom-model-api-key" autoComplete="new-password" type="password" className={inputCls} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Leave empty if not required…" /></div>
      </div>
      {testResult && <p className={`text-xs ${testResult.ok ? 'text-[var(--success)]' : 'text-[var(--error)]'}`} role="status" aria-live="polite">{testResult.message}</p>}
      <div className="flex gap-2 pt-1">
        <button type="button" disabled={!valid || testing} onClick={() => void test()} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm font-medium border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
          <RefreshIcon className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} aria-hidden="true" /> {testing ? 'Testing…' : 'Test connection'}
        </button>
        <button type="button" disabled={!valid} onClick={() => onAdd(draft())} className="flex-1 py-2 rounded-lg text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">Add model</button>
        <button type="button" onClick={onCancel} className="px-3 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">Cancel</button>
      </div>
    </div>
  );
}

export function SettingsPanel({ settings, onSave, onBack }: Props) {
  const [adding, setAdding] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState(settings.apiKey);
  const [open, setOpen] = useState<Record<string, boolean>>({ model: true, safety: true, profile: false, appearance: false });
  const [testStates, setTestStates] = useState<Record<string, { loading: boolean; result?: TestResult }>>({});
  const groupedBuiltins = useMemo(() => {
    const groups: Record<string, typeof BUILTIN_MODELS> = {};
    for (const model of BUILTIN_MODELS) (groups[model.group] ??= []).push(model);
    return groups;
  }, []);

  const toggle = (key: string) => setOpen((state) => ({ ...state, [key]: !state[key] }));
  const saveApiKey = async () => onSave({ apiKey: apiKeyDraft.trim(), apiKeyConfigured: Boolean(apiKeyDraft.trim()) });
  const testConnection = async (model: CustomModel): Promise<TestResult> => {
    setTestStates((state) => ({ ...state, [model.id]: { loading: true } }));
    try {
      const response = await sendMessageToBackground({ type: 'TEST_MODEL_CONNECTION', payload: { model } });
      const result = response.type === 'MODEL_CONNECTION_RESULT' ? response.payload : { ok: false, message: response.type === 'ERROR' ? response.payload.message : 'Connection test failed.' };
      setTestStates((state) => ({ ...state, [model.id]: { loading: false, result } }));
      return result;
    } catch {
      const result = { ok: false, message: 'Connection test failed.' };
      setTestStates((state) => ({ ...state, [model.id]: { loading: false, result } }));
      return result;
    }
  };
  const addCustomModel = (model: CustomModel) => {
    void onSave({ customModels: [...(settings.customModels ?? []), model], selectedModel: `custom:${model.id}` });
    setAdding(false);
  };
  const removeCustomModel = (id: string) => {
    const next = (settings.customModels ?? []).filter((model) => model.id !== id);
    const patch: Partial<Settings> = { customModels: next };
    if (settings.selectedModel === `custom:${id}`) patch.selectedModel = ZENMUX_AUTO_MODEL_ID;
    void onSave(patch);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-color)] flex-shrink-0">
        <button type="button" onClick={onBack} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" aria-label="Back to chat"><BackIcon className="w-[18px] h-[18px]" aria-hidden="true" /></button>
        <h1 className="text-base font-semibold text-[var(--text-primary)]">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ overscrollBehavior: 'contain' }}>
        <AccordionCard id="settings-model" title="Model" desc="Choose a model and manage provider connections." open={Boolean(open.model)} onToggle={() => toggle('model')}>
          <Subsection title="Selected model" desc="Free models work instantly; paid models use your provider account.">
            <label htmlFor="selected-model" className="sr-only">Selected model</label>
            <select id="selected-model" name="selected-model" value={settings.selectedModel} onChange={(e) => void onSave({ selectedModel: e.target.value })} className={inputCls}>
              <option value={ZENMUX_AUTO_MODEL_ID}>ZenMux automatic (recommended)</option>
              {Object.entries(groupedBuiltins).map(([group, models]) => <optgroup key={group} label={group === 'Free' ? 'OpenCode Zen · Free (no billing needed)' : `OpenCode Zen · ${group}`}>{models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</optgroup>)}
              {(settings.customModels?.length ?? 0) > 0 && <optgroup label="Custom">{settings.customModels.map((model) => <option key={model.id} value={`custom:${model.id}`}>{model.label}</option>)}</optgroup>}
            </select>
            {settings.selectedModel === ZENMUX_AUTO_MODEL_ID && <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-2 text-[11px] leading-relaxed text-[var(--text-secondary)]" role="status">
              <p className="font-medium text-[var(--accent)]">ZenMux is active by default</p>
              <p className="mt-0.5">Models are tried from highest availability to lowest, then OpenCode Zen is used as the final fallback.</p>
              <p className="mt-1 truncate text-[var(--text-muted)]">{ZENMUX_PRIORITY_MODELS.map((model) => model.label).join(' → ')}</p>
            </div>}
          </Subsection>

          <Subsection title="OpenCode Zen API key" desc="Leave empty to use the built-in default key.">
            <label htmlFor="open-code-zen-api-key" className="sr-only">OpenCode Zen API key</label>
            <input id="open-code-zen-api-key" name="open-code-zen-api-key" autoComplete="new-password" type="password" value={apiKeyDraft} onChange={(e) => setApiKeyDraft(e.target.value)} placeholder="sk-…" className={inputCls} />
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1 text-xs text-[var(--text-muted)]" role="status" aria-live="polite">{apiKeyDraft === settings.apiKey && settings.apiKeyConfigured && <CheckIcon className="w-3.5 h-3.5 text-[var(--success)]" aria-hidden="true" />}{apiKeyDraft === settings.apiKey ? (settings.apiKeyConfigured ? 'Key saved' : 'Using built-in default key') : 'Unsaved key'}</p>
              <button type="button" disabled={apiKeyDraft === settings.apiKey} onClick={() => void saveApiKey()} className="rounded-lg px-2.5 py-1.5 text-xs font-medium bg-[var(--accent)] text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">Save key</button>
            </div>
          </Subsection>

          <Subsection title="Custom models" desc="Add any OpenAI-compatible endpoint.">
            {(settings.customModels ?? []).length > 0 && <div className="space-y-2">{settings.customModels.map((model) => { const state = testStates[model.id]; return <div key={model.id} className="rounded-lg border border-[var(--border-color)] px-3 py-2 space-y-2"><div className="flex items-center gap-2"><div className="min-w-0 flex-1"><p className="text-sm font-medium truncate text-[var(--text-primary)]">{model.label}</p><p className="text-xs text-[var(--text-muted)] truncate">{model.provider} · {model.model}</p></div><button type="button" onClick={() => void testConnection(model)} disabled={state?.loading} className="flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"><RefreshIcon className={`w-3 h-3 ${state?.loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Test connection</button><button type="button" onClick={() => removeCustomModel(model.id)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--error)] hover:bg-[var(--bg-tertiary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--error)]" aria-label={`Remove ${model.label}`}><TrashIcon className="w-4 h-4" aria-hidden="true" /></button></div>{state?.result && <p className={`text-[11px] ${state.result.ok ? 'text-[var(--success)]' : 'text-[var(--error)]'}`} role="status" aria-live="polite">{state.result.message}</p>}</div>; })}</div>}
            {adding ? <CustomModelForm onAdd={addCustomModel} onCancel={() => setAdding(false)} onTest={testConnection} /> : <button type="button" onClick={() => setAdding(true)} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-[var(--border-color)] text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"><PlusIcon className="w-4 h-4" aria-hidden="true" /> Add custom model</button>}
          </Subsection>
        </AccordionCard>

        <AccordionCard id="settings-safety" title="Agent Safety" desc="Control when the assistant can act and when it must ask." open={Boolean(open.safety)} onToggle={() => toggle('safety')}>
          <Subsection title="Acting on pages" desc="Off means the assistant stays read-only."><Toggle label="Let the assistant act on pages" desc="It can fill, click and choose when enabled, but consequential actions still follow your confirmation policy." checked={settings.agentEnabled} onChange={(value) => void onSave({ agentEnabled: value })} /></Subsection>
          <Subsection title="Ask before submitting" desc="Payments, purchases and account deletion always ask.">
            <label htmlFor="confirm-mode" className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">Confirmation policy</label>
            <select id="confirm-mode" name="confirm-mode" value={settings.confirmMode} onChange={(e) => void onSave({ confirmMode: e.target.value as ConfirmMode })} className={inputCls}><option value="always">Always ask before submitting or leaving the page</option><option value="smart">Ask unless I clearly asked for it (recommended)</option><option value="never">Never ask — just do it</option></select>
            <div className="pt-2 space-y-3"><div><label htmlFor="max-agent-actions" className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">Maximum actions per run: {settings.maxAgentActions}</label><input id="max-agent-actions" name="max-agent-actions" type="range" min={5} max={MAX_AGENT_ACTIONS_LIMIT} step={5} value={settings.maxAgentActions} onChange={(e) => void onSave({ maxAgentActions: Number(e.target.value) })} className="w-full accent-[var(--accent)]" /><p className="text-[11px] text-[var(--text-muted)] mt-1">A safety stop for long forms and multi-step tasks.</p></div><div><label htmlFor="max-agent-steps" className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">Maximum planning turns per run: {settings.maxAgentSteps}</label><input id="max-agent-steps" name="max-agent-steps" type="range" min={3} max={MAX_AGENT_STEPS_LIMIT} step={1} value={settings.maxAgentSteps} onChange={(e) => void onSave({ maxAgentSteps: Number(e.target.value) })} className="w-full accent-[var(--accent)]" /><p className="text-[11px] text-[var(--text-muted)] mt-1">How many times it may stop and re-think.</p></div></div>
          </Subsection>
        </AccordionCard>

        <AccordionCard id="settings-profile" title="Profile" desc="Save details the agent may use for autofill." open={Boolean(open.profile)} onToggle={() => toggle('profile')}>
          <ProfileSection profile={settings.profile} onSave={(profile) => void onSave({ profile })} />
        </AccordionCard>

        <AccordionCard id="settings-appearance" title="Appearance" desc="Adjust theme, language and page context." open={Boolean(open.appearance)} onToggle={() => toggle('appearance')}>
          <Subsection title="Theme"><div className="grid grid-cols-3 gap-2">{(['light', 'dark', 'system'] as const).map((theme) => <button type="button" key={theme} onClick={() => void onSave({ theme })} aria-pressed={settings.theme === theme} className={`px-3 py-2 rounded-lg text-sm capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${settings.theme === theme ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:opacity-80'}`}>{theme}</button>)}</div></Subsection>
          <Subsection title="Default translation language"><label htmlFor="default-language" className="sr-only">Default translation language</label><select id="default-language" name="default-language" value={settings.defaultLanguage} onChange={(e) => void onSave({ defaultLanguage: e.target.value })} className={inputCls}><option value="en">English</option><option value="es">Spanish</option><option value="fr">French</option><option value="de">German</option><option value="ur">Urdu</option><option value="ar">Arabic</option><option value="zh">Chinese</option><option value="ja">Japanese</option><option value="ko">Korean</option><option value="hi">Hindi</option><option value="pt">Portuguese</option><option value="ru">Russian</option></select></Subsection>
          <Subsection title="Page context" desc="Choose whether new messages include the current page automatically."><Toggle label="Auto-send current page" desc="You can still override this with the This page chip in the composer." checked={settings.autoContext} onChange={(value) => void onSave({ autoContext: value })} /></Subsection>
        </AccordionCard>
      </div>
    </div>
  );
}
