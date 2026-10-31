/// <reference lib="webworker" />
import {
  calibrationStamp,
  parseMeasurements,
  verifyCalibration,
  type Measurement,
} from "../physics/analysis";
import type { Config } from "../physics/types";
import type { BallModelSettings } from "../physics/launchDynamics";
self.onmessage = (
  e: MessageEvent<{
    config: Config;
    model: BallModelSettings;
    stamp: string;
    measurements: Measurement[];
  }>,
) => {
  const { config, model, stamp, measurements } = e.data;
  try {
    if (calibrationStamp(config, model) !== stamp) {
      postMessage({ status: "stale" });
      return;
    }
    const rows = parseMeasurements(measurements, config.simulation.maxTime);
    postMessage({
      status: "done",
      result: verifyCalibration(config, rows, model),
    });
  } catch (error) {
    postMessage({ status: "error", error: String(error) });
  }
};
