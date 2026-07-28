import { describe, it, expect } from 'vitest';
import { sanitizeForApi, sanitizeResponse, validateMessage, validateApiKey } from '../../src/utils/security';

describe('sanitizeForApi', () => {
  it('removes script tags', () => {
    const input = 'Hello <script>alert("xss")</script> World';
    const result = sanitizeForApi(input);
    expect(result).not.toContain('<script>');
    expect(result).toContain('Hello');
    expect(result).toContain('World');
  });

  it('removes style tags', () => {
    const input = 'Text <style>.foo{color:red}</style> more text';
    const result = sanitizeForApi(input);
    expect(result).not.toContain('<style>');
    expect(result).toContain('Text');
  });

  it('removes event handlers', () => {
    const input = '<div onclick="alert(1)">content</div>';
    const result = sanitizeForApi(input);
    expect(result).not.toContain('onclick');
  });

  it('removes javascript: URIs', () => {
    const input = 'Click javascript:alert(1)';
    const result = sanitizeForApi(input);
    expect(result).not.toContain('javascript:');
  });

  it('preserves normal text', () => {
    const input = 'This is a normal article about AI and machine learning.';
    expect(sanitizeForApi(input)).toBe(input);
  });

  it('trims whitespace', () => {
    expect(sanitizeForApi('  hello  ')).toBe('hello');
  });
});

describe('sanitizeResponse', () => {
  it('escapes HTML entities', () => {
    const input = '<script>alert("xss")</script>';
    const result = sanitizeResponse(input);
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
    expect(result).not.toContain('<script>');
  });

  it('escapes quotes', () => {
    const input = 'He said "hello" and she said \'hi\'';
    const result = sanitizeResponse(input);
    expect(result).toContain('&quot;');
    expect(result).toContain('&#039;');
  });

  it('escapes ampersands', () => {
    const result = sanitizeResponse('A & B');
    expect(result).toBe('A &amp; B');
  });

  it('preserves normal text', () => {
    const input = 'This is a normal response about AI.';
    expect(sanitizeResponse(input)).toBe(input);
  });
});

describe('validateMessage', () => {
  it('rejects empty string', () => {
    expect(validateMessage('').valid).toBe(false);
    expect(validateMessage('').error).toBeDefined();
  });

  it('rejects whitespace only', () => {
    expect(validateMessage('   ').valid).toBe(false);
  });

  it('rejects very long messages', () => {
    const longMessage = 'a'.repeat(10001);
    expect(validateMessage(longMessage).valid).toBe(false);
    expect(validateMessage(longMessage).error).toContain('too long');
  });

  it('accepts valid message', () => {
    expect(validateMessage('Hello, what is this page about?').valid).toBe(true);
  });

  it('accepts message at max length', () => {
    const maxMessage = 'a'.repeat(10000);
    expect(validateMessage(maxMessage).valid).toBe(true);
  });
});

describe('validateApiKey', () => {
  it('rejects empty key', () => {
    expect(validateApiKey('').valid).toBe(false);
  });

  it('rejects very short key', () => {
    expect(validateApiKey('abc').valid).toBe(false);
    expect(validateApiKey('abc').error).toContain('too short');
  });

  it('accepts valid-length key', () => {
    expect(validateApiKey('sk-1234567890abcdef').valid).toBe(true);
  });
});
