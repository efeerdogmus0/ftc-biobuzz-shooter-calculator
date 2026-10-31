import { simulateBounceWorld } from "../physics/collisionWorld";
import type { Shot, BounceSettings, Vec3 } from "../physics/types";
self.onmessage = (
  e: MessageEvent<{
    shot: Shot;
    settings: BounceSettings;
    count: number;
    layout: "center" | "left" | "right" | "manual";
    positions: Vec3[];
  }>,
) => {
  const d = e.data;
  try {
    const result = simulateBounceWorld(
      d.shot,
      d.settings,
      d.count,
      d.layout,
      d.positions,
      (p) => self.postMessage({ type: "progress", progress: p }),
    );
    self.postMessage({ type: "result", shot: result });
  } catch (error) {
    self.postMessage({ type: "error", error: String(error) });
  }
};
