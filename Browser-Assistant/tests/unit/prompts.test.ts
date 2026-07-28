import { describe, it, expect } from 'vitest';
import { PROMPT_TEMPLATES, getTemplatesByCategory, getTemplateById } from '../../src/sidepanel/lib/prompts';

describe('PROMPT_TEMPLATES', () => {
  it('has templates in all categories', () => {
    const categories = new Set(PROMPT_TEMPLATES.map((t) => t.category));
    expect(categories.has('quick')).toBe(true);
    expect(categories.has('translation')).toBe(true);
    expect(categories.has('summarization')).toBe(true);
    expect(categories.has('analysis')).toBe(true);
  });

  it('each template has required fields', () => {
    for (const template of PROMPT_TEMPLATES) {
      expect(template.id).toBeTruthy();
      expect(template.label).toBeTruthy();
      expect(template.icon).toBeTruthy();
      expect(template.prompt).toBeTruthy();
      expect(template.category).toBeTruthy();
    }
  });

  it('has unique IDs', () => {
    const ids = PROMPT_TEMPLATES.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('has at least 4 quick actions', () => {
    const quick = getTemplatesByCategory('quick');
    expect(quick.length).toBeGreaterThanOrEqual(4);
  });

  it('has at least 5 translation templates', () => {
    const translations = getTemplatesByCategory('translation');
    expect(translations.length).toBeGreaterThanOrEqual(5);
  });
});

describe('getTemplatesByCategory', () => {
  it('returns only matching templates', () => {
    const results = getTemplatesByCategory('quick');
    for (const r of results) {
      expect(r.category).toBe('quick');
    }
  });

  it('returns empty array for unknown category', () => {
    const results = getTemplatesByCategory('nonexistent' as any);
    expect(results).toEqual([]);
  });
});

describe('getTemplateById', () => {
  it('returns correct template', () => {
    const template = getTemplateById('summarize');
    expect(template).toBeDefined();
    expect(template?.label).toBe('Summarize');
  });

  it('returns undefined for unknown ID', () => {
    expect(getTemplateById('nonexistent')).toBeUndefined();
  });
});
