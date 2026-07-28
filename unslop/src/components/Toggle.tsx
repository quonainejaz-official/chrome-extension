import { cn } from '@/utils/cn';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  label?: string;
}

export function Toggle({ checked, onChange, disabled, size = 'md', label }: ToggleProps) {
  const w = size === 'sm' ? 'w-9 h-5' : 'w-11 h-6';
  const dot = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const translate = checked
    ? (size === 'sm' ? 'translate-x-4' : 'translate-x-5')
    : 'translate-x-1';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'relative inline-flex items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
        w,
        checked ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      )}
      aria-label={label}
    >
      <span className={cn('inline-block rounded-full bg-white shadow-sm transition-transform', dot, translate)} />
    </button>
  );
}
