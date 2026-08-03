"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchWorkerApi, WorkerApiError } from "./api";

export interface ApiResource<T> {
  data: T | null;
  loading: boolean;
  error: WorkerApiError | null;
  retry: () => void;
}

export function useApiResource<T>(path: string | null): ApiResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [error, setError] = useState<WorkerApiError | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (path === null) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchWorkerApi<T>(path, controller.signal)
      .then((result) => setData(result))
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setError(
          caught instanceof WorkerApiError
            ? caught
            : new WorkerApiError("The Worker API could not be reached.", 0, "network_error")
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [attempt, path]);

  return { data, loading, error, retry };
}
