/// <reference lib="webworker" />
import { solve, coverage, monteCarlo, calibrate } from "../physics/analysis";
import type {
  Uncertainty,
  Measurement,
  FitParameter,
} from "../physics/analysis";
import type { Config } from "../physics/types";
export type AnalysisRequest = {
  kind: "solve" | "coverage" | "monteCarlo" | "calibrate";
  config: Config;
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
        ? solve(r.config, progress)
        : r.kind === "coverage"
          ? coverage(r.config, r.spacing, progress)
          : r.kind === "monteCarlo"
            ? monteCarlo(r.config, r.count, r.uncertainty, r.seed, progress)
            : calibrate(r.config, r.measurements, r.parameters, progress);
    postMessage({ type: "result", kind: r.kind, result });
  } catch (e) {
    postMessage({
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    });
  }
};
