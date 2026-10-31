import { useEffect, useMemo, useState } from "react";
import type { Config } from "../physics/types";
import type { BallModelSettings } from "../physics/launchDynamics";
import {
  calibrationStamp,
  type CalibrationVerification,
} from "../physics/analysis";
import type { StoredCalibration } from "../utils/scenario";

/** Same order as the preview budget; up to 500 rows of heavy configurations. */
export const VERIFY_BUDGET_MS = 20_000;

export type BadgeState =
  | { kind: "none" }
  | { kind: "verifying" }
  | { kind: "stale" }
  | { kind: "error"; error: string }
  | { kind: "verified"; result: CalibrationVerification };

/**
 * Re-verifies stored measurements against the current physics in a worker.
 * The badge never comes from a stored flag; it belongs to exactly the inputs
 * it was computed for (checked by identity during render).
 */
export function useCalibrationBadge(
  config: Config,
  model: BallModelSettings,
  calibration: StoredCalibration | null,
): BadgeState {
  const [state, setState] = useState<{
    inputs: [Config, BallModelSettings, StoredCalibration];
    badge: BadgeState;
  } | null>(null);
  // Cheap main-thread check first: edits (e.g. dragging the robot) usually
  // change the stamp, and then no worker is needed at all.
  const matches = useMemo(
    () =>
      !!calibration && calibrationStamp(config, model) === calibration.stamp,
    [config, model, calibration],
  );
  useEffect(() => {
    if (!calibration || !matches) return;
    const worker = new Worker(
      new URL("../workers/calibration.worker.ts", import.meta.url),
      { type: "module" },
    );
    const inputs: [Config, BallModelSettings, StoredCalibration] = [
      config,
      model,
      calibration,
    ];
    let finished = false;
    const finish = (badge: BadgeState) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      worker.terminate();
      setState({ inputs, badge });
    };
    // A timed-out check is an error, never a pass.
    const deadline = setTimeout(
      () =>
        finish({
          kind: "error",
          error: `verification exceeded ${VERIFY_BUDGET_MS / 1000} s and was stopped`,
        }),
      VERIFY_BUDGET_MS,
    );
    worker.onmessage = (
      e: MessageEvent<{
        status: string;
        result?: CalibrationVerification;
        error?: string;
      }>,
    ) => {
      const d = e.data;
      finish(
        d.status === "stale"
          ? { kind: "stale" }
          : d.status === "done" && d.result
            ? { kind: "verified", result: d.result }
            : { kind: "error", error: d.error ?? "verification failed" },
      );
    };
    worker.onerror = (e) =>
      finish({ kind: "error", error: e.message || "verification failed" });
    worker.postMessage({
      config,
      model,
      stamp: calibration.stamp,
      measurements: calibration.measurements,
    });
    return () => {
      finished = true;
      clearTimeout(deadline);
      worker.terminate();
    };
  }, [config, model, calibration, matches]);
  if (!calibration) return { kind: "none" };
  if (!matches) return { kind: "stale" };
  if (
    !state ||
    state.inputs[0] !== config ||
    state.inputs[1] !== model ||
    state.inputs[2] !== calibration
  )
    return { kind: "verifying" };
  return state.badge;
}
