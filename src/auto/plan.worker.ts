/// <reference lib="webworker" />
import { planAuto, type PlanInput } from "./planner";
import { coach } from "./coach";

// Two answers per request: the plan as soon as it is found, then the coach's
// what-if list (several more searches).
self.onmessage = (event: MessageEvent<{ id: number; input: PlanInput }>) => {
  const { id, input } = event.data;
  try {
    const result = planAuto(input);
    postMessage({ type: "result", id, ...result });
    postMessage({ type: "coach", id, advice: coach(input, result.best) });
  } catch (error) {
    postMessage({
      type: "error",
      id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
