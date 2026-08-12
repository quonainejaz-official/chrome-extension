import { useEffect, useState } from 'react';
import type { UserProfile } from '../../shared/types';
import { PlusIcon, TrashIcon, ShieldIcon } from './Icons';

const inputCls =
  'w-full px-3 py-2 rounded-lg border text-sm bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition';

interface Props {
  profile: UserProfile;
  onSave: (profile: UserProfile) => void;
}

const FIELDS: { key: keyof UserProfile; label: string; placeholder: string; type?: string }[] = [
  { key: 'fullName', label: 'Full name', placeholder: 'Ada Lovelace' },
  { key: 'firstName', label: 'First name', placeholder: 'Ada' },
  { key: 'lastName', label: 'Last name', placeholder: 'Lovelace' },
  { key: 'email', label: 'Email', placeholder: 'ada@example.com', type: 'email' },
  { key: 'phone', label: 'Phone', placeholder: '+1 555 0100', type: 'tel' },
  { key: 'company', label: 'Company', placeholder: 'Analytical Engines Ltd' },
  { key: 'jobTitle', label: 'Job title', placeholder: 'Engineer' },
  { key: 'addressLine1', label: 'Address line 1', placeholder: '12 Marylebone Rd' },
  { key: 'addressLine2', label: 'Address line 2', placeholder: 'Flat 3' },
  { key: 'city', label: 'City', placeholder: 'London' },
  { key: 'state', label: 'State / province', placeholder: 'Greater London' },
  { key: 'postalCode', label: 'Postal code', placeholder: 'NW1 5LS' },
  { key: 'country', label: 'Country', placeholder: 'United Kingdom' },
  { key: 'website', label: 'Website', placeholder: 'https://example.com', type: 'url' },
];

/**
 * The details the agent is allowed to type into forms. Edits are held locally
 * and committed on blur so we are not writing to storage on every keystroke.
 */
export function ProfileSection({ profile, onSave }: Props) {
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [expanded, setExpanded] = useState(false);

  // Pick up changes made elsewhere (e.g. a second panel instance).
  useEffect(() => setDraft(profile), [profile]);

  const commit = () => {
    if (JSON.stringify(draft) !== JSON.stringify(profile)) onSave(draft);
  };

  const setField = (key: keyof UserProfile, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const setCustom = (id: string, patch: { label?: string; value?: string }) =>
    setDraft((prev) => ({
      ...prev,
      custom: prev.custom.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));

  const addCustom = () =>
    setDraft((prev) => ({
      ...prev,
      custom: [...prev.custom, { id: crypto.randomUUID(), label: '', value: '' }],
    }));

  const removeCustom = (id: string) => {
    const next = { ...draft, custom: draft.custom.filter((c) => c.id !== id) };
    setDraft(next);
    onSave(next);
  };

  const filledCount =
    FIELDS.filter((f) => (draft[f.key] as string)?.trim()).length +
    draft.custom.filter((c) => c.label.trim() && c.value.trim()).length;

  const visible = expanded ? FIELDS : FIELDS.slice(0, 5);

  return (
    <div className="space-y-2.5">
      <div
        className="flex items-start gap-2 rounded-lg px-3 py-2 text-[11px] leading-relaxed"
        style={{ background: 'var(--accent-soft)', color: 'var(--text-secondary)' }}
      >
        <ShieldIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-[var(--accent)]" />
        <span>
          Stored on this device only, and sent to your chosen model only while an agent run is
          filling a form. There is deliberately no field for passwords, card numbers or ID numbers —
          the agent is blocked from typing those anywhere.
        </span>
      </div>

      {visible.map((field) => (
        <div key={field.key}>
          <label className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">{field.label}</label>
          <input
            className={inputCls}
            type={field.type ?? 'text'}
            value={(draft[field.key] as string) ?? ''}
            onChange={(e) => setField(field.key, e.target.value)}
            onBlur={commit}
            placeholder={field.placeholder}
          />
        </div>
      ))}

      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full py-2 rounded-lg border border-dashed text-xs font-medium transition-colors border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          Show address and {FIELDS.length - 5} more fields
        </button>
      )}

      {expanded && (
        <>
          <div className="pt-1 space-y-2">
            <p className="text-xs font-medium text-[var(--text-secondary)]">Anything else</p>
            {draft.custom.map((entry) => (
              <div key={entry.id} className="flex items-center gap-2">
                <input
                  className={inputCls + ' flex-1 min-w-0'}
                  value={entry.label}
                  onChange={(e) => setCustom(entry.id, { label: e.target.value })}
                  onBlur={commit}
                  placeholder="Label, e.g. GitHub"
                />
                <input
                  className={inputCls + ' flex-1 min-w-0'}
                  value={entry.value}
                  onChange={(e) => setCustom(entry.id, { value: e.target.value })}
                  onBlur={commit}
                  placeholder="Value"
                />
                <button
                  onClick={() => removeCustom(entry.id)}
                  className="p-1.5 rounded-md flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--error)] hover:bg-[var(--bg-tertiary)] transition-colors"
                  aria-label="Remove field"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              onClick={addCustom}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed text-xs font-medium transition-colors border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Add a field
            </button>
          </div>

          <button
            onClick={() => {
              commit();
              setExpanded(false);
            }}
            className="w-full py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            Show less
          </button>
        </>
      )}

      <p className="text-[11px] text-[var(--text-muted)]">
        {filledCount === 0 ? 'Nothing saved yet.' : `${filledCount} detail${filledCount === 1 ? '' : 's'} saved.`}
      </p>
    </div>
  );
}
