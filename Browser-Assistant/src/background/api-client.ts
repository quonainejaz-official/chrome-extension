import type { PageContext, Message, ResolvedModel } from '../shared/types';
import { API_TIMEOUT, MAX_RETRIES, RETRY_BASE_DELAY, MAX_CONTENT_LENGTH } from '../shared/constants';
import { sanitizeForApi } from '../utils/security';

// Build the chat/completions URL from a (possibly base) endpoint.
function resolveChatEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  return `${trimmed}/chat/completions`;
}

function buildSystemPrompt(pageContext?: PageContext): string {
  let prompt = `You are "AI Page Assistant", an AI embedded in a Chrome side panel. The user is viewing a web page or PDF in their browser, and the extension automatically extracts that page's text and gives it to you below. You act on the page the user is currently looking at.

Guidelines:
- The page content provided below is the user's ACTUAL current page. Treat it as the source of truth and answer directly from it.
- NEVER ask the user to paste, share, or provide the content or a URL — you already have the page text below.
- When summarizing or reporting, use the whole provided content, cite specific sections/headings where helpful, and be accurate and concise.
- If the user selected specific text, focus on that selection first.`;

  if (pageContext) {
    prompt += `\n\n=== CURRENT PAGE ===\n- URL: ${pageContext.url}\n- Title: ${pageContext.title}\n- Type: ${pageContext.pageType}\n- Language: ${pageContext.language}`;

    const sanitized = sanitizeForApi(pageContext.content);
    const truncatedContent = sanitized.slice(0, MAX_CONTENT_LENGTH);
    prompt += `\n\n=== PAGE CONTENT ===\n${truncatedContent}`;

    if (pageContext.selectedText) {
      prompt += `\n\n=== USER-SELECTED TEXT (prioritize this) ===\n"${sanitizeForApi(pageContext.selectedText)}"`;
    }
  } else {
    prompt += `\n\n(No page content is attached to this message. Answer from general knowledge, and if the user is asking about their current page, let them know page context is turned off — they can enable it with the page icon in the input bar.)`;
  }

  return prompt;
}

function buildMessages(
  userMessage: string,
  pageContext?: PageContext,
  history?: Message[]
): { role: string; content: string }[] {
  const messages: { role: string; content: string }[] = [];

  // System prompt with page context
  messages.push({
    role: 'system',
    content: buildSystemPrompt(pageContext),
  });

  // Conversation history (last 10 messages)
  if (history && history.length > 0) {
    const recentHistory = history.slice(-10);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  // Current user message
  messages.push({
    role: 'user',
    content: sanitizeForApi(userMessage),
  });

  return messages;
}

export interface StreamCallbacks {
  onChunk: (content: string) => void;
  onDone: (fullContent: string) => void;
  onError: (error: Error) => void;
}

// Pull a human-readable message out of an error body that may be either
// OpenAI-style ({error:{message}}) or OpenCode-style ({error:{message}} / {message}).
function extractErrorMessage(status: number, body: string): string {
  try {
    const json = JSON.parse(body);
    const msg =
      json?.error?.message ??
      (typeof json?.error === 'string' ? json.error : null) ??
      json?.message;
    if (msg) return String(msg);
  } catch {
    // not JSON
  }
  return body ? `${status}: ${body.slice(0, 300)}` : `API error ${status}`;
}

// Non-retryable HTTP statuses — retrying won't help.
function isFatalStatus(status: number): boolean {
  return status === 400 || status === 401 || status === 402 || status === 403 || status === 404;
}

export async function sendChatMessage(
  config: ResolvedModel,
  userMessage: string,
  pageContext?: PageContext,
  history?: Message[],
  callbacks?: StreamCallbacks
): Promise<string> {
  const messages = buildMessages(userMessage, pageContext, history);
  const chatEndpoint = resolveChatEndpoint(config.endpoint);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

      const response = await fetch(chatEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: true,
          temperature: 0.7,
          max_tokens: 4096,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : RETRY_BASE_DELAY * Math.pow(2, attempt);
          await sleep(delay);
          continue;
        }

        const message = extractErrorMessage(response.status, errorBody);
        // OpenCode Zen returns billing/credits failures with a 401 status too,
        // so classify by message content rather than trusting the status code.
        const lower = message.toLowerCase();
        const isBillingIssue = /credit|payment|billing|quota|insufficient/.test(lower);
        const friendly =
          response.status === 401 && !isBillingIssue
            ? `Invalid API key. ${message}`
            : message;

        const err = new Error(friendly);
        (err as any).fatal = isFatalStatus(response.status);
        throw err;
      }

      // Process streaming response
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(trimmed.slice(6));
            // Surface API errors delivered inside the stream body.
            if (data?.error) {
              throw new Error(data.error.message ?? String(data.error));
            }
            const delta = data.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              callbacks?.onChunk(fullContent);
            }
          } catch (parseErr) {
            // Re-throw real API errors; ignore genuinely malformed chunks.
            if (parseErr instanceof Error && parseErr.message && !parseErr.message.includes('JSON')) {
              throw parseErr;
            }
          }
        }
      }

      if (!fullContent.trim()) {
        throw new Error('The model returned an empty response. Try a different model.');
      }

      callbacks?.onDone(fullContent);
      return fullContent;
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      lastError = isAbort
        ? new Error('Request timed out. Try again or switch models.')
        : err instanceof Error
          ? err
          : new Error(typeof err === 'string' ? err : JSON.stringify(err) || 'Request failed');
      // Don't retry fatal client errors (bad key, no credits, bad model, etc.).
      if ((lastError as any).fatal || attempt >= MAX_RETRIES) break;
      const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  const error = lastError ?? new Error('Request failed for an unknown reason.');
  callbacks?.onError(error);
  throw error;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
