import { cn } from '@/utils/cn';
import { useState } from 'react';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  color?: 'green' | 'red' | 'blue';
}

const colorClasses = {
  green: {
    tag: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    remove: 'hover:text-green-900 dark:hover:text-green-200',
  },
  red: {
    tag: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    remove: 'hover:text-red-900 dark:hover:text-red-200',
  },
  blue: {
    tag: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    remove: 'hover:text-blue-900 dark:hover:text-blue-200',
  },
};

export function TagInput({ tags, onChange, placeholder, color = 'green' }: TagInputProps) {
  const [value, setValue] = useState('');
  const c = colorClasses[color];

  const add = () => {
    const v = value.trim();
    if (v && !tags.includes(v)) {
      onChange([...tags, v]);
    }
    setValue('');
  };

  const remove = (index: number) => {
    const next = [...tags];
    next.splice(index, 1);
    onChange(next);
  };

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          type="button"
          onClick={add}
          className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Add
        </button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag, i) => (
            <span key={`${tag}-${i}`} className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs', c.tag)}>
              {tag}
              <button onClick={() => remove(i)} className={cn('ml-0.5 font-bold', c.remove)}>&times;</button>
            </span>
          ))}
        </div>
      )}
      {tags.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">No entries</p>
      )}
    </div>
  );
}
