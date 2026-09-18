import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chatOnceWithFallback } from '../../src/background/model-router';

function sseResponse(text: string): Response {
  return new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`,
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  );
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), { status });
}

const candidates = [
  { endpoint: 'https://zenmux.test/api/v1', model: 'first/model', apiKey: 'zenmux-key', provider: 'zenmux' as const },
  { endpoint: 'https://zenmux.test/api/v1', model: 'second/model', apiKey: 'zenmux-key', provider: 'zenmux' as const },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('automatic model routing', () => {
  it('moves to the next candidate when a model is unavailable', async () => {
    fetchMock
      .mockResolvedValueOnce(errorResponse(404, 'model not found'))
      .mockResolvedValueOnce(sseResponse('fallback answer'));

    const fallbacks: string[] = [];
    await expect(
      chatOnceWithFallback(candidates, [{ role: 'user', content: 'hello' }], 0.1, {
        onFallback: (failed, next) => fallbacks.push(`${failed.model} -> ${next.model}`),
      })
    ).resolves.toBe('fallback answer');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fallbacks).toEqual(['first/model -> second/model']);
  });

  it('keeps the candidate order when the first model succeeds', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse('first answer'));

    await expect(chatOnceWithFallback(candidates, [{ role: 'user', content: 'hello' }])).resolves.toBe('first answer');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
