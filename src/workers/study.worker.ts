/// <reference lib="webworker" />
import {
  legalPositions,
  studyPosition,
  type StudyOptions,
} from "../physics/shotStudy";
import type { Config } from "../physics/types";

self.onmessage = (
  event: MessageEvent<{ config: Config; options: StudyOptions }>,
) => {
  try {
    const { config, options } = event.data;
    if (
      options.spacing < 0.2 ||
      options.angles.length > 40 ||
      !options.angles.length ||
      options.speedMin <= 0 ||
      options.speedMax <= options.speedMin ||
      options.speedMax > 20
    )
      throw new Error("Invalid angle study limits.");
    const positions = legalPositions(config, options.spacing);
    const results = [];
    for (let i = 0; i < positions.length; i++) {
      const [x, y] = positions[i];
      results.push(studyPosition(config, x, y, options));
      postMessage({ type: "progress", done: i + 1, total: positions.length });
    }
    postMessage({ type: "result", results });
  } catch (error) {
    postMessage({ type: "error", message: String(error) });
  }
};
