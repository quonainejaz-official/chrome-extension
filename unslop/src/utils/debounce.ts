export interface Debounced<TArgs extends unknown[]> {
  (...args: TArgs): void;
  cancel(): void;
  flush(): void;
}

/**
 * Trailing-edge debounce. Coalesces bursts of calls (e.g. MutationObserver
 * callbacks) into a single invocation after `wait` ms of quiet.
 */
export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  wait: number,
): Debounced<TArgs> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: TArgs | null = null;

  const debounced = ((...args: TArgs) => {
    lastArgs = args;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const callArgs = lastArgs;
      lastArgs = null;
      if (callArgs) fn(...callArgs);
    }, wait);
  }) as Debounced<TArgs>;

  debounced.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };

  debounced.flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
      const callArgs = lastArgs;
      lastArgs = null;
      if (callArgs) fn(...callArgs);
    }
  };

  return debounced;
}
