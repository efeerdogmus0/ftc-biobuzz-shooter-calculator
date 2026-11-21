/// <reference lib="webworker" />
// Robota aktar: distance sweep for the shot table and the real-shot comparison.
import { sweep, type SweepOptions } from "../export/shotTable";
import { compare, type LoggedShot } from "../export/shotLog";
import type { Config } from "../physics/types";
import type { BallModelSettings } from "../physics/launchDynamics";

export type ExportRequest =
  | {
      kind: "sweep";
      config: Config;
      model: BallModelSettings;
      options: SweepOptions;
    }
  | {
      kind: "compare";
      config: Config;
      model: BallModelSettings;
      rows: LoggedShot[];
    };

self.onmessage = (e: MessageEvent<ExportRequest>) => {
  const d = e.data;
  try {
    if (d.kind === "sweep")
      postMessage({
        kind: "sweep",
        result: sweep(d.config, d.options, d.model, (f) =>
          postMessage({ kind: "progress", progress: f }),
        ),
      });
    else
      postMessage({
        kind: "compare",
        result: compare(d.config, d.rows, d.model),
      });
  } catch (error) {
    postMessage({ kind: "error", error: String(error) });
  }
};
