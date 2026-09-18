import { useEffect, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// Small fetch-on-deps hook so each widget owns its own load lifecycle.
// `deps` re-runs the fetcher (e.g. when the period changes). Stale responses
// are discarded via the `active` guard.
export function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcher()
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (active) {
          setState({
            data: null,
            loading: false,
            error: err?.response?.data?.error || err?.message || 'Failed to load',
          });
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
