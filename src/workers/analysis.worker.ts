/// <reference lib="webworker" />
import {
  solve,
  coverage,
  monteCarlo,
  calibrate,
  parseMeasurements,
} from "../physics/analysis";
import type {
  Uncertainty,
  Measurement,
  FitParameter,
} from "../physics/analysis";
import type { Config } from "../physics/types";
import type { BallModelSettings } from "../physics/launchDynamics";
export type AnalysisRequest = {
  kind: "solve" | "coverage" | "monteCarlo" | "calibrate";
  config: Config;
  ballModel: BallModelSettings;
  spacing: number;
  count: number;
  seed: number;
  uncertainty: Uncertainty;
  measurements: Measurement[];
  parameters: FitParameter[];
};
self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  const r = event.data;
  let last = 0;
  const progress = (value: number) => {
    if (Date.now() - last > 120) {
      postMessage({ type: "progress", value });
      last = Date.now();
    }
  };
  try {
    const result =
      r.kind === "solve"
        ? solve(r.config, progress, false, r.ballModel)
        : r.kind === "coverage"
          ? coverage(r.config, r.spacing, progress, r.ballModel)
          : r.kind === "monteCarlo"
            ? monteCarlo(
                r.config,
                r.count,
                r.uncertainty,
                r.seed,
                progress,
                r.ballModel,
              )
            : calibrate(
                r.config,
                parseMeasurements(r.measurements, r.config.simulation.maxTime),
                r.parameters,
                progress,
                r.ballModel,
              );
    postMessage({ type: "result", kind: r.kind, result });
  } catch (e) {
    postMessage({
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    });
  }
};
