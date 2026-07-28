export interface PromptTemplate {
  id: string;
  label: string;
  icon: string;
  prompt: string;
  category: 'quick' | 'translation' | 'summarization' | 'analysis';
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  // Quick Actions
  {
    id: 'summarize',
    label: 'Summarize',
    icon: '📝',
    prompt: 'Provide a clear and concise summary of this page. Cover the main topic, key arguments, and conclusions.',
    category: 'quick',
  },
  {
    id: 'key-points',
    label: 'Key Points',
    icon: '🔑',
    prompt: 'Extract the key points from this page as a bullet-point list. Focus on the most important information.',
    category: 'quick',
  },
  {
    id: 'explain',
    label: 'Explain Simply',
    icon: '💡',
    prompt: 'Explain this content in simple terms that anyone can understand. Avoid jargon and technical language.',
    category: 'quick',
  },
  {
    id: 'questions',
    label: 'Q&A',
    icon: '❓',
    prompt: 'Based on this page content, what are the 5 most important questions a reader might have, and what are the answers?',
    category: 'quick',
  },

  // Translation
  {
    id: 'translate-spanish',
    label: '→ Spanish',
    icon: '🇪🇸',
    prompt: 'Translate this page content into Spanish. Maintain the original meaning and tone. Provide the translation directly.',
    category: 'translation',
  },
  {
    id: 'translate-french',
    label: '→ French',
    icon: '🇫🇷',
    prompt: 'Translate this page content into French. Maintain the original meaning and tone. Provide the translation directly.',
    category: 'translation',
  },
  {
    id: 'translate-german',
    label: '→ German',
    icon: '🇩🇪',
    prompt: 'Translate this page content into German. Maintain the original meaning and tone. Provide the translation directly.',
    category: 'translation',
  },
  {
    id: 'translate-urdu',
    label: '→ Urdu',
    icon: '🇵🇰',
    prompt: 'Translate this page content into Urdu. Maintain the original meaning and tone. Provide the translation directly.',
    category: 'translation',
  },
  {
    id: 'translate-arabic',
    label: '→ Arabic',
    icon: '🇸🇦',
    prompt: 'Translate this page content into Arabic. Maintain the original meaning and tone. Provide the translation directly.',
    category: 'translation',
  },
  {
    id: 'translate-chinese',
    label: '→ Chinese',
    icon: '🇨🇳',
    prompt: 'Translate this page content into Chinese (Simplified). Maintain the original meaning and tone. Provide the translation directly.',
    category: 'translation',
  },
  {
    id: 'translate-japanese',
    label: '→ Japanese',
    icon: '🇯🇵',
    prompt: 'Translate this page content into Japanese. Maintain the original meaning and tone. Provide the translation directly.',
    category: 'translation',
  },
  {
    id: 'translate-english',
    label: '→ English',
    icon: '🇬🇧',
    prompt: 'Translate this page content into English. Maintain the original meaning and tone. Provide the translation directly.',
    category: 'translation',
  },

  // Summarization
  {
    id: 'summary-brief',
    label: 'Brief Summary',
    icon: '📄',
    prompt: 'Provide a brief 2-3 sentence summary of this page.',
    category: 'summarization',
  },
  {
    id: 'summary-detailed',
    label: 'Detailed Summary',
    icon: '📚',
    prompt: 'Provide a detailed multi-paragraph summary of this page. Include main topics, supporting details, and conclusions.',
    category: 'summarization',
  },
  {
    id: 'summary-tldr',
    label: 'TL;DR',
    icon: '⚡',
    prompt: 'TL;DR — Give me a one-sentence summary of this page.',
    category: 'summarization',
  },

  // Analysis
  {
    id: 'analyze-structure',
    label: 'Analyze Structure',
    icon: '🏗️',
    prompt: 'Analyze the structure of this page. What sections does it have? How is the information organized?',
    category: 'analysis',
  },
  {
    id: 'find-arguments',
    label: 'Find Arguments',
    icon: '⚖️',
    prompt: 'Identify the main arguments or claims made on this page. Are they well-supported?',
    category: 'analysis',
  },
  {
    id: 'code-explain',
    label: 'Explain Code',
    icon: '💻',
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
