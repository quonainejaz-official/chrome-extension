import { useState, useCallback, useEffect, useRef } from 'react';
import type { RuntimeRequest, ResponsePayloads, ApiResponse } from '@/types';

type RequestType = RuntimeRequest['type'];
type PayloadOf<T extends RequestType> = ResponsePayloads[T];

export function sendMessage<T extends RequestType>(
  msg: Extract<RuntimeRequest, { type: T }>,
): Promise<PayloadOf<T>> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response: ApiResponse<PayloadOf<T>>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.ok) {
        resolve(response.data);
      } else {
        reject(new Error(response?.error ?? 'Unknown error'));
      }
    });
  });
}

export function useAsyncMessage<T extends RequestType>(
  msg: Extract<RuntimeRequest, { type: T }>,
  opts: { immediate?: boolean } = {},
) {
  const [data, setData] = useState<PayloadOf<T> | null>(null);
  const [loading, setLoading] = useState(opts.immediate !== false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const send = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await sendMessage(msg);
      if (mountedRef.current) setData(result);
      return result;
    } catch (err) {
      const msg_ = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) setError(msg_);
      return null;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [msg.type, JSON.stringify(msg)]);

  useEffect(() => {
    if (opts.immediate !== false) void send();
  }, [send, opts.immediate]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  return { data, loading, error, send };
}
