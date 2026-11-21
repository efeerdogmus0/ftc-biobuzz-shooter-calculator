/// <reference lib="webworker" />
import {
  visionMap,
  type CameraSettings,
  type MapMode,
} from "../vision/limelight";
import type { Config } from "../physics/types";

export type VisionRequest = {
  id: number;
  camera: CameraSettings;
  config: Config;
  mode: MapMode;
  spacing: number;
};
self.onmessage = (event: MessageEvent<VisionRequest>) => {
  const r = event.data;
  try {
    const map = visionMap(r.camera, r.config, r.mode, r.spacing);
    postMessage({ type: "result", id: r.id, map });
  } catch (error) {
    postMessage({
      type: "error",
      id: r.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
