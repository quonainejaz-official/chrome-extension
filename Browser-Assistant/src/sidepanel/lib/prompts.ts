import type { ComponentType } from 'react';
import type { IconProps } from '../components/Icons';
import {
  BookOpenIcon,
  CircleHelpIcon,
  CodeIcon,
  CompassIcon,
  CookieIcon,
  DocumentIcon,
  FormInputIcon,
  KeyIcon,
  LanguagesIcon,
  ListIcon,
  LightbulbIcon,
  ScaleIcon,
  WorkflowIcon,
  ZapIcon,
  CursorIcon,
} from '../components/Icons';

type PromptIcon = ComponentType<IconProps>;

export interface PromptTemplate {
  id: string;
  label: string;
  icon: PromptIcon;
  prompt: string;
  category: 'quick' | 'translation' | 'summarization' | 'analysis' | 'agent' | 'developer';
}

/**
 * Starters shown when agent mode is on. These describe things to *do*, not
 * things to explain — the empty state should make the difference obvious.
 */
export const AGENT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'agent-fill-form',
    label: 'Fill this form',
    icon: FormInputIcon,
    prompt: 'Fill in the form on this page using my saved details. Do not submit it — tell me when it is ready for me to review.',
    category: 'agent',
  },
  {
    id: 'agent-map-page',
    label: 'What can I do here?',
    icon: CompassIcon,
    prompt: 'Look over this whole page, scrolling if you need to, and tell me what I can actually do on it — the main buttons, forms and links, and what each one is for.',
    category: 'agent',
  },
  {
    id: 'agent-find-click',
    label: 'Find & click',
    icon: CursorIcon,
    prompt: 'Find the ',
    category: 'agent',
  },
  {
    id: 'agent-accept-cookies',
    label: 'Dismiss the banners',
    icon: CookieIcon,
    prompt: 'Close any cookie banner, newsletter popup or overlay covering this page. Choose the most privacy-preserving option — decline non-essential cookies rather than accepting everything.',
    category: 'agent',
  },
];

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  // Developer / QA
  {
    id: 'developer-ui-audit',
    label: 'Audit UI',
    icon: CodeIcon,
    prompt: 'Run a safe UI smoke test on this page. Check visible behavior, accessibility, responsive risks, and loading/error states. Report each check with evidence and mark anything you could not verify as blocked.',
    category: 'developer',
  },
  {
    id: 'developer-debug',
    label: 'Debug issue',
    icon: CodeIcon,
    prompt: 'Help debug the current UI issue. Reproduce it safely if possible, separate observed evidence from hypotheses, identify the likely root cause, and propose the smallest fix plus regression checks.',
    category: 'developer',
  },
  {
    id: 'developer-api-plan',
    label: 'API test plan',
    icon: WorkflowIcon,
    prompt: 'Create an implementation-ready API test plan from the endpoint or API documentation visible on this page. Include methods, auth, headers, payloads, positive/negative/boundary cases, expected responses, and a curl or fetch example. If no endpoint/spec is available, list exactly what is missing.',
    category: 'developer',
  },
  {
    id: 'developer-qa-cases',
    label: 'QA test cases',
    icon: ListIcon,
    prompt: 'Generate implementation-ready QA test cases for this page or feature. Use IDs, preconditions, steps, expected results, priority, test type, and negative/boundary coverage. Do not invent evidence about checks that have not run.',
    category: 'developer',
  },
  {
    id: 'developer-implement-tests',
    label: 'Implement tests',
    icon: ZapIcon,
    prompt: 'Turn the provided UI, API, or QA requirements into complete test code. First state assumptions and target file(s), then provide a drop-in implementation and explain how to run it. If repository source is unavailable, do not claim files were edited; return the exact code and integration steps instead.',
    category: 'developer',
  },
  // Quick Actions
  {
    id: 'summarize',
    label: 'Summarize',
    icon: DocumentIcon,
    prompt: 'Provide a clear and concise summary of this page. Cover the main topic, key arguments, and conclusions.',
    category: 'quick',
  },
  {
    id: 'key-points',
    label: 'Key Points',
    icon: KeyIcon,
    prompt: 'Extract the key points from this page as a bullet-point list. Focus on the most important information.',
    category: 'quick',
  },
  {
    id: 'explain',
    label: 'Explain Simply',
    icon: LightbulbIcon,
    prompt: 'Explain this content in simple terms that anyone can understand. Avoid jargon and technical language.',
    category: 'quick',
  },
  {
    id: 'questions',
    label: 'Q&A',
    icon: CircleHelpIcon,
    prompt: 'Based on this page content, what are the 5 most important questions a reader might have, and what are the answers?',
    category: 'quick',
  },

  // Translation
  {
    id: 'translate-spanish',
    label: '→ Spanish',
    icon: LanguagesIcon,
    prompt: 'Translate this page content into Spanish. Maintain the original meaning and tone. Provide the translation directly.',
    category: 'translation',
  },
  {
    id: 'translate-french',
    label: '→ French',
    icon: LanguagesIcon,
    prompt: 'Translate this page content into French. Maintain the original meaning and tone. Provide the translation directly.',
    category: 'translation',
  },
  {
    id: 'translate-german',
    label: '→ German',
    icon: LanguagesIcon,
    prompt: 'Translate this page content into German. Maintain the original meaning and tone. Provide the translation directly.',
    category: 'translation',
  },
  {
    id: 'translate-urdu',
    label: '→ Urdu',
    icon: LanguagesIcon,
    prompt: 'Translate this page content into Urdu. Maintain the original meaning and tone. Provide the translation directly.',
    category: 'translation',
  },
  {
    id: 'translate-arabic',
    label: '→ Arabic',
    icon: LanguagesIcon,
    prompt: 'Translate this page content into Arabic. Maintain the original meaning and tone. Provide the translation directly.',
    category: 'translation',
  },
  {
    id: 'translate-chinese',
    label: '→ Chinese',
    icon: LanguagesIcon,
    prompt: 'Translate this page content into Chinese (Simplified). Maintain the original meaning and tone. Provide the translation directly.',
    category: 'translation',
  },
  {
    id: 'translate-japanese',
    label: '→ Japanese',
    icon: LanguagesIcon,
    prompt: 'Translate this page content into Japanese. Maintain the original meaning and tone. Provide the translation directly.',
    category: 'translation',
  },
  {
    id: 'translate-english',
    label: '→ English',
    icon: LanguagesIcon,
    prompt: 'Translate this page content into English. Maintain the original meaning and tone. Provide the translation directly.',
    category: 'translation',
  },

  // Summarization
  {
    id: 'summary-brief',
    label: 'Brief Summary',
    icon: DocumentIcon,
    prompt: 'Provide a brief 2-3 sentence summary of this page.',
    category: 'summarization',
  },
  {
    id: 'summary-detailed',
    label: 'Detailed Summary',
    icon: BookOpenIcon,
    prompt: 'Provide a detailed multi-paragraph summary of this page. Include main topics, supporting details, and conclusions.',
    category: 'summarization',
  },
  {
    id: 'summary-tldr',
    label: 'TL;DR',
    icon: ZapIcon,
    prompt: 'TL;DR — Give me a one-sentence summary of this page.',
    category: 'summarization',
  },

  // Analysis
  {
    id: 'analyze-structure',
    label: 'Analyze Structure',
    icon: WorkflowIcon,
    prompt: 'Analyze the structure of this page. What sections does it have? How is the information organized?',
    category: 'analysis',
  },
  {
    id: 'find-arguments',
    label: 'Find Arguments',
    icon: ScaleIcon,
    prompt: 'Identify the main arguments or claims made on this page. Are they well-supported?',
    category: 'analysis',
  },
  {
    id: 'code-explain',
    label: 'Explain Code',
    icon: CodeIcon,
    prompt: 'Explain the code on this page. What does it do? How does it work?',
    category: 'analysis',
  },
];

export function getTemplatesByCategory(category: PromptTemplate['category']): PromptTemplate[] {
  return PROMPT_TEMPLATES.filter((t) => t.category === category);
}

export function getTemplateById(id: string): PromptTemplate | undefined {
  return PROMPT_TEMPLATES.find((t) => t.id === id);
}
