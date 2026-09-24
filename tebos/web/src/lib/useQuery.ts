import { useCallback, useEffect, useRef, useState } from "react";

export interface QueryState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

/**
 * Runs an async loader and keeps its latest result. With pollMs it refreshes
 * while `keepPolling(data)` holds — used for scans that are still running.
 */
export function useQuery<T>(
  load: () => Promise<T>,
  deps: unknown[],
  options: { pollMs?: number; keepPolling?: (data: T) => boolean } = {},
): QueryState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadRef.current().then(
      (d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
        setLoading(false);
      },
      (e) => {
        if (cancelled) return;
        setError(e);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const { pollMs, keepPolling } = options;
  useEffect(() => {
    if (!pollMs || data === undefined || (keepPolling && !keepPolling(data))) return;
    const t = setTimeout(() => setTick((n) => n + 1), pollMs);
    return () => clearTimeout(t);
  }, [data, pollMs, keepPolling]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, error, loading, reload };
}
