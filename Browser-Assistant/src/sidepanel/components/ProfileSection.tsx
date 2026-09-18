import { useEffect, useState } from 'react';
import type { UserProfile } from '../../shared/types';
import { PlusIcon, TrashIcon, ShieldIcon, CheckIcon } from './Icons';

const inputCls =
  'w-full px-3 py-2 rounded-lg border text-sm bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus:border-transparent transition-colors';

interface Props {
  profile: UserProfile;
  onSave: (profile: UserProfile) => void;
}

const FIELDS: { key: keyof UserProfile; label: string; placeholder: string; type?: string; autoComplete: string }[] = [
  { key: 'fullName', label: 'Full name', placeholder: 'Ada Lovelace', autoComplete: 'name' },
  { key: 'firstName', label: 'First name', placeholder: 'Ada', autoComplete: 'given-name' },
  { key: 'lastName', label: 'Last name', placeholder: 'Lovelace', autoComplete: 'family-name' },
  { key: 'email', label: 'Email', placeholder: 'ada@example.com', type: 'email', autoComplete: 'email' },
  { key: 'phone', label: 'Phone', placeholder: '+1 555 0100', type: 'tel', autoComplete: 'tel' },
  { key: 'company', label: 'Company', placeholder: 'Analytical Engines Ltd', autoComplete: 'organization' },
  { key: 'jobTitle', label: 'Job title', placeholder: 'Engineer', autoComplete: 'organization-title' },
  { key: 'addressLine1', label: 'Address line 1', placeholder: '12 Marylebone Rd', autoComplete: 'address-line1' },
  { key: 'addressLine2', label: 'Address line 2', placeholder: 'Flat 3', autoComplete: 'address-line2' },
  { key: 'city', label: 'City', placeholder: 'London', autoComplete: 'address-level2' },
  { key: 'state', label: 'State / province', placeholder: 'Greater London', autoComplete: 'address-level1' },
  { key: 'postalCode', label: 'Postal code', placeholder: 'NW1 5LS', autoComplete: 'postal-code' },
  { key: 'country', label: 'Country', placeholder: 'United Kingdom', autoComplete: 'country-name' },
  { key: 'website', label: 'Website', placeholder: 'https://example.com', type: 'url', autoComplete: 'url' },
];

export function ProfileSection({ profile, onSave }: Props) {
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [expanded, setExpanded] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'unsaved'>('saved');

  useEffect(() => {
    setDraft(profile);
    setSaveState('saved');
  }, [profile]);

  const commit = () => {
    if (JSON.stringify(draft) !== JSON.stringify(profile)) onSave(draft);
    setSaveState('saved');
  };

  const setField = (key: keyof UserProfile, value: string) => {
    setSaveState('unsaved');
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const setCustom = (id: string, patch: { label?: string; value?: string }) => {
    setSaveState('unsaved');
    setDraft((prev) => ({
      ...prev,
      custom: prev.custom.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    }));
  };

  const addCustom = () => {
    setSaveState('unsaved');
    setDraft((prev) => ({ ...prev, custom: [...prev.custom, { id: crypto.randomUUID(), label: '', value: '' }] }));
  };

  const removeCustom = (id: string) => {
    const next = { ...draft, custom: draft.custom.filter((entry) => entry.id !== id) };
    setDraft(next);
    onSave(next);
    setSaveState('saved');
  };

  const filledCount = FIELDS.filter((field) => (draft[field.key] as string)?.trim()).length
    + draft.custom.filter((entry) => entry.label.trim() && entry.value.trim()).length;
  const visible = expanded ? FIELDS : FIELDS.slice(0, 5);

  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-[11px] leading-relaxed" style={{ background: 'var(--accent-soft)', color: 'var(--text-secondary)' }}>
        <ShieldIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-[var(--accent)]" aria-hidden="true" />
        <span>Stored on this device only, and sent to your chosen model only while an agent run is filling a form. There is deliberately no field for passwords, card numbers or ID numbers — the agent is blocked from typing those anywhere.</span>
      </div>

      {visible.map((field) => {
        const fieldId = `profile-${field.key}`;
        return (
          <div key={field.key}>
            <label htmlFor={fieldId} className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">{field.label}</label>
            <input
              id={fieldId}
              name={field.key}
              autoComplete={field.autoComplete}
              className={inputCls}
              type={field.type ?? 'text'}
              value={(draft[field.key] as string) ?? ''}
              onChange={(event) => setField(field.key, event.target.value)}
              onBlur={commit}
              placeholder={field.placeholder}
            />
          </div>
        );
      })}

      {!expanded && (
        <button onClick={() => setExpanded(true)} className="w-full py-2 rounded-lg border border-dashed text-xs font-medium transition-colors border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
          Show address and {FIELDS.length - 5} more fields
        </button>
      )}

      {expanded && (
        <>
          <div className="pt-1 space-y-2">
            <p className="text-xs font-medium text-[var(--text-secondary)]">Anything else</p>
            {draft.custom.map((entry) => (
              <div key={entry.id} className="flex items-center gap-2">
                <label htmlFor={`profile-custom-label-${entry.id}`} className="sr-only">Custom field label</label>
                <input id={`profile-custom-label-${entry.id}`} name={`profile-custom-label-${entry.id}`} autoComplete="off" className={inputCls + ' flex-1 min-w-0'} value={entry.label} onChange={(event) => setCustom(entry.id, { label: event.target.value })} onBlur={commit} placeholder="Label, e.g. GitHub" />
                <label htmlFor={`profile-custom-value-${entry.id}`} className="sr-only">Custom field value</label>
                <input id={`profile-custom-value-${entry.id}`} name={`profile-custom-value-${entry.id}`} autoComplete="off" className={inputCls + ' flex-1 min-w-0'} value={entry.value} onChange={(event) => setCustom(entry.id, { value: event.target.value })} onBlur={commit} placeholder="Value, e.g. github.com/me" />
                <button onClick={() => removeCustom(entry.id)} className="p-1.5 rounded-md flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--error)] hover:bg-[var(--bg-tertiary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--error)]" aria-label="Remove custom field">
                  <TrashIcon className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            ))}
            <button onClick={addCustom} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed text-xs font-medium transition-colors border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
              <PlusIcon className="w-3.5 h-3.5" aria-hidden="true" /> Add a field
            </button>
          </div>
          <button onClick={() => { commit(); setExpanded(false); }} className="w-full py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">Show less</button>
        </>
      )}

      <p className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]" role="status" aria-live="polite">
        {saveState === 'saved' && <CheckIcon className="w-3.5 h-3.5 text-[var(--success)]" aria-hidden="true" />}
        {saveState === 'saved' ? `${filledCount} detail${filledCount === 1 ? '' : 's'} saved on this device.` : 'Unsaved changes — leave the field to save.'}
      </p>
    </div>
  );
}
