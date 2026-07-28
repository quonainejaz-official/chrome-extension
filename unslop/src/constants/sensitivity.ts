import type { Sensitivity } from '@/types';

export interface SensitivityPreset {
  id: Sensitivity;
  label: string;
  description: string;
  /** Default confidence threshold above which a "hide" is acted upon. */
  threshold: number;
  /** Instruction appended to the classifier prompt to bias its judgement. */
  promptDirective: string;
}

export const SENSITIVITY_PRESETS: Record<Sensitivity, SensitivityPreset> = {
  low: {
    id: 'low',
    label: 'Low',
    description: 'Only hide the most blatant AI slop. Keeps anything plausibly human.',
    threshold: 0.85,
    promptDirective:
      'Sensitivity is LOW: only decide "hide" for unmistakable, blatant AI slop. When in any doubt, keep the post.',
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    description: 'A balanced default that hides clearly formulaic posts.',
    threshold: 0.7,
    promptDirective:
      'Sensitivity is MEDIUM: hide posts that are clearly AI-generated or formulaic; keep posts that read as genuinely human.',
  },
  high: {
    id: 'high',
    label: 'High',
    description: 'Hides borderline formulaic and engagement-farming posts.',
    threshold: 0.55,
    promptDirective:
      'Sensitivity is HIGH: hide posts that are formulaic, engagement-farming or read as AI-assisted, even if partly human.',
  },
  aggressive: {
    id: 'aggressive',
    label: 'Aggressive',
    description: 'Hides anything with an AI or corporate sheen. May hide some human posts.',
    threshold: 0.4,
    promptDirective:
      'Sensitivity is AGGRESSIVE: hide any post with an AI, marketing or corporate sheen, including polished thought-leadership. Keep only clearly casual, personal or technical human posts.',
  },
};

export const SENSITIVITY_IDS: Sensitivity[] = ['low', 'medium', 'high', 'aggressive'];
