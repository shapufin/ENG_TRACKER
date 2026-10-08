import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * State backed by a URL query param. Only values in `allowed` are accepted (anything
 * else reads as `fallback`), and writing the fallback removes the param so default
 * views keep a clean URL. History is replaced, not pushed, so filter clicks do not
 * pile up back-button entries.
 */
export function useUrlParamState<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T
): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = allowed.includes(raw as T) ? (raw as T) : fallback;

  const setValue = useCallback(
    (next: T) => {
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          if (next === fallback) out.delete(key);
          else out.set(key, next);
          return out;
        },
        { replace: true }
      );
    },
    [fallback, key, setParams]
  );

  return [value, setValue];
}
