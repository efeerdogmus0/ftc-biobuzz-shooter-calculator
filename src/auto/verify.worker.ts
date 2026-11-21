/// <reference lib="webworker" />
import { verifyPlan, type Engine } from "./verify";
import type { Plan } from "./planner";
import type { AutoRobot } from "./robot";
import type { Pose } from "./field";
import type { ProbotRobot } from "./probot";

export type VerifyRequest = {
  robot: ProbotRobot;
  auto: AutoRobot;
  plan: Plan;
  start: Pose;
  engine: Engine;
};
self.onmessage = async (event: MessageEvent<VerifyRequest>) => {
  const r = event.data;
  try {
    const result = await verifyPlan(r.robot, r.auto, r.plan, r.start, r.engine);
    postMessage({ type: "result", result });
  } catch (error) {
    postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
