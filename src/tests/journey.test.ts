import { describe, expect, it } from "vitest";
import {
  nextStage,
  stages,
  stageStatus,
  type JourneyFacts,
} from "../app/journey";

const base: JourneyFacts = {
  ownRobot: false,
  hit: false,
  mapped: false,
  points: 0,
  reliability: null,
  planned: false,
  calibration: "none",
};

describe("journey", () => {
  it("walks six stages in order and stops at the last", () => {
    expect(stages.map((s) => s.id)).toEqual([
      "robot",
      "shot",
      "field",
      "trust",
      "auto",
      "export",
    ]);
    expect(nextStage("robot")?.id).toBe("shot");
    expect(nextStage("export")).toBeNull();
  });

  it("never marks unmeasured or unreliable work as done", () => {
    const empty = stageStatus(base);
    expect(empty.shot).toBe("warn");
    expect(empty.trust).toBe("todo");
    expect(empty.export).toBe("todo");
    expect(stageStatus({ ...base, reliability: 0.79 }).trust).toBe("warn");
    expect(stageStatus({ ...base, reliability: 0.8 }).trust).toBe("done");
    expect(stageStatus({ ...base, calibration: "stale" }).export).toBe("warn");
    expect(stageStatus({ ...base, calibration: "failed" }).export).toBe("warn");
    expect(stageStatus({ ...base, calibration: "verified" }).export).toBe(
      "done",
    );
  });
});
