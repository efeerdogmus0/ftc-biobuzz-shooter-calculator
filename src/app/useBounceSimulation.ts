import { useEffect, useMemo, useState } from "react";
import BounceWorker from "../workers/bounce.worker?worker&inline";
import type { Shot, BounceSettings, Vec3 } from "../physics/types";
import type { WorldProgress } from "../physics/collisionWorld";
import { useStore } from "../state/store";
export function useBounceSimulation(
  base: Shot | null,
  enabled: boolean,
  settings: BounceSettings,
  count: number,
  layout: "center" | "left" | "right" | "manual",
  positions: Vec3[],
) {
  const request = useMemo(
    () => ({ shot: base, settings, count, layout, positions }),
    [base, settings, count, layout, positions],
  );
  const [result, setResult] = useState<{
    request: typeof request;
    shot: Shot;
    error: string;
  } | null>(null);
  useEffect(() => {
    const state = useStore.getState();
    if (!enabled || !base || !base.shooter.exited) {
      state.set({ bounceBusy: false, bounceProgress: "" });
      return;
    }
    state.set({
      bounceBusy: true,
      bounceProgress: "Toplar oturtuluyor…",
      playing: false,
    });
    let active = true;
    const worker = new BounceWorker();
    worker.onmessage = (
      e: MessageEvent<{
        type: string;
        shot: Shot;
        error: string;
        progress: WorldProgress;
      }>,
    ) => {
      if (!active) return;
      if (e.data.type === "progress") {
        useStore.getState().set({
          bounceProgress:
            e.data.progress.phase === "settling"
              ? `Toplar oturtuluyor · ${e.data.progress.time.toFixed(1)} s`
              : `Atış hesaplanıyor · ${e.data.progress.time.toFixed(1)} s`,
        });
        return;
      }
      useStore.getState().set({ bounceBusy: false, bounceProgress: "" });
      if (e.data.type === "result")
        setResult({ request, shot: e.data.shot, error: "" });
      else
        setResult({
          request,
          shot: {
            ...base,
            flight: { ...base.flight, bounceError: e.data.error },
          },
          error: e.data.error,
        });
      worker.terminate();
    };
    worker.onerror = (e) => {
      if (!active) return;
      setResult({
        request,
        shot: { ...base, flight: { ...base.flight, bounceError: e.message } },
        error: e.message,
      });
      useStore.getState().set({ bounceBusy: false, bounceProgress: "" });
      worker.terminate();
    };
    worker.postMessage(request);
    return () => {
      active = false;
      worker.terminate();
    };
  }, [enabled, base, request]);
  return enabled && result?.request === request ? result.shot : base;
}
