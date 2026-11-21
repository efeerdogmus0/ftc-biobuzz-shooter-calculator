/// <reference lib="webworker" />
import type { BallModelSettings } from "../physics/launchDynamics";
import type { Config } from "../physics/types";
import { shotAt, type ShotSpot } from "./shotMap";

export type ShotMapRequest = {
  config: Config;
  points: { x: number; y: number }[];
  turret: boolean;
  ball?: BallModelSettings;
};
self.onmessage = (event: MessageEvent<ShotMapRequest>) => {
  const { config, points, turret, ball } = event.data;
  const spots: ShotSpot[] = [];
  try {
    points.forEach((p, i) => {
      const s = shotAt(config, p.x, p.y, turret, ball);
      if (s) spots.push(s);
      postMessage({ type: "progress", done: i + 1 });
    });
    postMessage({ type: "result", spots });
  } catch (error) {
    postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
