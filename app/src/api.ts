import { useEffect, useState } from "react";
import type { Envelope } from "../../shared/types";

export type Loadable<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; value: T };

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Something went wrong (${res.status})`);
  }
  return (await res.json()) as T;
}

/** Loads an /api route and refreshes it on a timer while the page is open. */
export function useApi<T>(path: string, refreshSeconds = 120): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getJson<T>(path)
        .then((value) => !cancelled && setState({ status: "ready", value }))
        .catch((err: Error) => {
          // Keep showing what we have if a background refresh fails.
          if (!cancelled) setState((s) => (s.status === "ready" ? s : { status: "error", message: err.message }));
        });
    load();
    const timer = window.setInterval(load, refreshSeconds * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [path, refreshSeconds]);
  return state;
}

export type { Envelope };
