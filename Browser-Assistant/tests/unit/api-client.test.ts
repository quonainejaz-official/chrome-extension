import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Real backoff would make these tests sleep for seconds; everything else about
// the retry logic stays exactly as shipped.
vi.mock('../../src/shared/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/shared/constants')>();
  return { ...actual, RETRY_BASE_DELAY: 1, MAX_RETRY_DELAY: 4 };
});

const { chatOnce, isRateLimitError, isContextOverflowError } = await import('../../src/background/api-client');

const config = { endpoint: 'https://example.test/v1', model: 'test-model', apiKey: 'sk-test' };
const messages = [{ role: 'user' as const, content: 'hi' }];

// A Response body can only be consumed once, so every mocked attempt has to
// hand back a freshly built Response rather than a shared instance.
function stream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
}

function sseResponse(text: string): Response {
  return new Response(
    stream([`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`, 'data: [DONE]\n\n']),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  );
}

function errorResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
}

/** Same response shape on every attempt, rebuilt each time. */
function always(make: () => Response) {
  return vi.fn().mockImplementation(() => Promise.resolve(make()));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('chatOnce rate limiting', () => {
  it('reports a rate limit instead of "unknown reason" when every attempt is throttled', async () => {
    fetchMock = always(() => errorResponse(429, { error: { message: 'too many requests' } }));
    vi.stubGlobal('fetch', fetchMock);

    const error = await chatOnce(config, messages).catch((e) => e);
    expect(error.message).toMatch(/rate limited/i);
    expect(error.message).not.toMatch(/unknown reason/i);
  });

  it('tags the rejection so callers can tell a throttle from a hard failure', async () => {
    fetchMock = always(() => errorResponse(429, { error: { message: 'slow down' } }));
    vi.stubGlobal('fetch', fetchMock);

    const error = await chatOnce(config, messages).catch((e) => e);
    expect(isRateLimitError(error)).toBe(true);
  });

  it('retries a throttled request and succeeds once the limit clears', async () => {
    fetchMock
      .mockImplementationOnce(() => Promise.resolve(errorResponse(429, { error: { message: 'slow down' } })))
      .mockImplementationOnce(() => Promise.resolve(sseResponse('{"action":{"type":"done","summary":"ok"}}')));

    await expect(chatOnce(config, messages)).resolves.toContain('"done"');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('honours a numeric Retry-After without hanging on an absurd value', async () => {
    fetchMock
      .mockImplementationOnce(() => Promise.resolve(errorResponse(429, 'slow down', { 'Retry-After': '600' })))
      .mockImplementationOnce(() => Promise.resolve(sseResponse('done')));

    const started = Date.now();
    await expect(chatOnce(config, messages)).resolves.toBe('done');
    // MAX_RETRY_DELAY is mocked to 4ms, so a 600s header must not be obeyed literally.
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('chatOnce error surfacing', () => {
  it('does not retry a fatal auth error', async () => {
    fetchMock = always(() => errorResponse(401, { error: { message: 'bad key' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(chatOnce(config, messages)).rejects.toThrow(/invalid api key/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('classifies a 401 that is really a billing problem as billing, not a bad key', async () => {
    fetchMock = always(() => errorResponse(401, { error: { message: 'insufficient credits' } }));
    vi.stubGlobal('fetch', fetchMock);

    const error = await chatOnce(config, messages).catch((e) => e);
    expect(error.message).toMatch(/insufficient credits/i);
    expect(error.message).not.toMatch(/invalid api key/i);
  });

  it('surfaces an error delivered inside the stream body', async () => {
    fetchMock = always(
      () =>
        new Response(stream([`data: ${JSON.stringify({ error: { message: 'context length exceeded' } })}\n\n`]), {
          status: 200,
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(chatOnce(config, messages)).rejects.toThrow(/context length exceeded/i);
  });

  it('complains clearly about an empty completion', async () => {
    fetchMock = always(() => new Response(stream(['data: [DONE]\n\n']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(chatOnce(config, messages)).rejects.toThrow(/empty response/i);
  });

  it('never leaves the caller with the bare "unknown reason" fallback', async () => {
    fetchMock = vi.fn().mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    vi.stubGlobal('fetch', fetchMock);

    const error = await chatOnce(config, messages).catch((e) => e);
    expect(error.message).toMatch(/failed to fetch/i);
  });

  it('flags a context-length failure so callers can send less instead of retrying', async () => {
    fetchMock = always(() =>
      errorResponse(400, { error: { message: "This model's maximum context length is 8192 tokens" } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const error = await chatOnce(config, messages).catch((e) => e);
    expect(isContextOverflowError(error)).toBe(true);
    // 400 is fatal: retrying the identical oversized prompt is pointless.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('chatOnce response-shape tolerance', () => {
  it('accepts SSE lines without a space after "data:"', async () => {
    fetchMock = always(
      () =>
        new Response(
          stream([`data:${JSON.stringify({ choices: [{ delta: { content: 'no-space' } }] })}\n\n`, 'data:[DONE]\n\n']),
          { status: 200 }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(chatOnce(config, messages)).resolves.toBe('no-space');
  });

  it('falls back to a plain JSON completion when the endpoint ignores stream:true', async () => {
    fetchMock = always(
      () =>
        new Response(JSON.stringify({ choices: [{ message: { content: 'non-streamed reply' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(chatOnce(config, messages)).resolves.toBe('non-streamed reply');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads content from a non-delta chunk shape', async () => {
    fetchMock = always(
      () =>
        new Response(stream([`data: ${JSON.stringify({ choices: [{ message: { content: 'msg-shape' } }] })}\n\n`]), {
          status: 200,
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(chatOnce(config, messages)).resolves.toBe('msg-shape');
  });
});
