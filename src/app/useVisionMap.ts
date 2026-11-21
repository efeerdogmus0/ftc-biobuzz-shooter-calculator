// Recomputes the AprilTag visibility map in a worker whenever the camera,
// robot or field changes while the map is shown. Only the newest request's
// answer is kept; a superseded computation is terminated.
import { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import { cameraErrors } from "../vision/limelight";

export function useVisionMap() {
  const camera = useStore((s) => s.camera),
    mode = useStore((s) => s.visionMode),
    spacing = useStore((s) => s.visionSpacing),
    robot = useStore((s) => s.config.robot),
    field = useStore((s) => s.config.field),
    set = useStore((s) => s.set);
  const worker = useRef<Worker | null>(null);
  useEffect(() => {
    worker.current?.terminate();
    worker.current = null;
    if (
      !camera ||
      !camera.enabled ||
      mode === "off" ||
      cameraErrors(camera).length
    ) {
      set({ visionMap: null, visionBusy: false });
      return;
    }
    set({ visionBusy: true });
    const timer = window.setTimeout(() => {
      const job = new Worker(
        new URL("../workers/vision.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = job;
      job.onmessage = (event) => {
        if (worker.current !== job) return;
        const m = event.data;
        set({
          visionMap: m.type === "result" ? m.map : null,
          visionBusy: false,
        });
        job.terminate();
        worker.current = null;
      };
      job.onerror = () => {
        if (worker.current !== job) return;
        set({ visionMap: null, visionBusy: false });
        worker.current = null;
      };
      job.postMessage({
        id: Date.now(),
        camera,
        config: structuredClone(useStore.getState().config),
        mode,
        spacing,
      });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      worker.current?.terminate();
      worker.current = null;
    };
  }, [camera, mode, spacing, robot, field, set]);
}
