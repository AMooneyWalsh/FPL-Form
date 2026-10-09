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

/** Loads an /api route and refreshes it on a timer while the page is open.
 * Pass null to skip loading (hooks can't be called conditionally). */
export function useApi<T>(path: string | null, refreshSeconds = 120): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ status: "loading" });
  useEffect(() => {
    if (path === null) return;
    // A new path (e.g. another gameweek) shouldn't show the old one's data.
    setState((s) => (s.status === "loading" ? s : { status: "loading" }));
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
    const stopWatching = onReturn(load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      stopWatching();
    };
  }, [path, refreshSeconds]);
  return state;
}

/** Runs `fn` when someone comes back to the tab (e.g. from WhatsApp), so they
 * don't sit looking at old scores until the next timed refresh. */
export function onReturn(fn: () => void): () => void {
  const check = () => document.visibilityState === "visible" && fn();
  document.addEventListener("visibilitychange", check);
  return () => document.removeEventListener("visibilitychange", check);
}

export type { Envelope };
