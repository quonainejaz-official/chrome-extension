// Input sanitization utilities

/**
 * Sanitize text content before sending to API.
 * Removes potentially harmful patterns while preserving content meaning.
 */
export function sanitizeForApi(text: string): string {
  return text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '')
    .trim();
}

/**
 * Sanitize AI response for safe rendering.
 * Prevents XSS through markdown rendering.
 */
export function sanitizeResponse(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Validate that a message is safe to send.
 */
export function validateMessage(content: string): { valid: boolean; error?: string } {
  if (!content || typeof content !== 'string') {
    return { valid: false, error: 'Message cannot be empty' };
  }

  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }

  if (trimmed.length > 10000) {
    return { valid: false, error: 'Message is too long (max 10,000 characters)' };
  }

  return { valid: true };
}

/**
 * Validate API key format (basic check).
 */
export function validateApiKey(key: string): { valid: boolean; error?: string } {
  if (!key || typeof key !== 'string') {
    return { valid: false, error: 'API key cannot be empty' };
  }

  const trimmed = key.trim();
  if (trimmed.length < 10) {
    return { valid: false, error: 'API key appears to be invalid (too short)' };
  }

  return { valid: true };
}
