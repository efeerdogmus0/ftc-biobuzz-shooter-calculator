import { useEffect, useRef, useState } from "react";
import type { Config, Shot } from "../physics/types";
import type { BallModelSettings } from "../physics/launchDynamics";
import { PreviewScheduler } from "./previewScheduler";

export type PreviewRequest = { config: Config; model: BallModelSettings };
export type SettledPreview = {
  request: PreviewRequest;
  shot: Shot | null;
  error: string;
};

/**
 * What the UI may show for `current`. Decided by request identity during render,
 * so the first render after an edit is already `pending` (no one-frame window
 * where an older result passes for the new configuration).
 * - `shot`: last good result, possibly for an older configuration.
 * - `stale`: `shot` does not belong to `current` (pending or failed).
 * - `error`: failure of the current configuration only.
 */
export function previewStatus(
  current: PreviewRequest,
  latest: SettledPreview | null,
  good: SettledPreview | null,
) {
  const forCurrent =
    !!latest &&
    latest.request.config === current.config &&
    latest.request.model === current.model;
  return {
    shot: good?.shot ?? null,
    error: forCurrent ? latest.error : "",
    pending: !forCurrent,
    stale: !(forCurrent && !latest.error && good === latest),
  };
}

/** The shot preview, computed in a worker (inertia included). */
export function usePreviewSimulation(current: PreviewRequest) {
  const scheduler = useRef<PreviewScheduler<PreviewRequest> | null>(null);
  const requests = useRef(new Map<number, PreviewRequest>());
  const [latest, setLatest] = useState<SettledPreview | null>(null);
  const [good, setGood] = useState<SettledPreview | null>(null);
  useEffect(() => {
    const s = new PreviewScheduler<PreviewRequest>(
      () =>
        new Worker(new URL("../workers/preview.worker.ts", import.meta.url), {
          type: "module",
        }),
      (outcome) => {
        const request = requests.current.get(outcome.id);
        if (!request) return;
        for (const id of requests.current.keys())
          if (id <= outcome.id) requests.current.delete(id);
        const settled = { request, shot: outcome.shot, error: outcome.error };
        setLatest(settled);
        if (outcome.shot && !outcome.error) setGood(settled);
      },
    );
    scheduler.current = s;
    return () => {
      s.dispose();
      scheduler.current = null;
    };
  }, []);
  const { config, model } = current;
  useEffect(() => {
    const request = { config, model };
    const id = scheduler.current?.request(request);
    if (id !== undefined) requests.current.set(id, request);
  }, [config, model]);
  return previewStatus(current, latest, good);
}
