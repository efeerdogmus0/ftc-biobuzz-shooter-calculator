import { simulate } from "../physics/flight";
import type { Config } from "../physics/types";
import {
  launchInertia,
  type BallModelSettings,
} from "../physics/launchDynamics";
// Inertia is computed here too: the aspherical shell integral is not cheap.
self.onmessage = (
  e: MessageEvent<{ id: number; config: Config; model: BallModelSettings }>,
) => {
  const { id, config, model } = e.data;
  try {
    const inertia = launchInertia(config, model);
    self.postMessage({ id, shot: simulate(config, inertia, model), error: "" });
  } catch (error) {
    self.postMessage({ id, shot: null, error: String(error) });
  }
};
