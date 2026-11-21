import { afterEach, describe, expect, it, vi } from "vitest";
import { plan, start, robot } from "./verify.test.shared";
import { planText, stepText, type Translate } from "./planText";
import {
  defaultPlannerState,
  loadPlannerState,
  savePlannerState,
} from "./persist";

const t = Object.assign((s: string) => s, {
  f: (s: string, v: Record<string, string | number>) =>
    s.replace(/\{(\w+)\}/g, (_, k) => String(v[k])),
}) as Translate;

describe("plan as text", () => {
  const text = planText(plan, robot.name, start, t);
  it("has one numbered line per step, in time order", () => {
    const lines = text.split("\n").filter((l) => /^\s*\d+\. /.test(l));
    expect(lines).toHaveLength(plan.steps.length);
    expect(lines[0]).toContain(stepText(plan.steps[0], t));
  });
  it("carries the score, the robot and the start pose", () => {
    expect(text).toContain(robot.name);
    expect(text).toContain(`${plan.score} puan`);
    expect(text).toContain(`x ${start.x.toFixed(2)} m`);
  });
  it("gives shots an RPM and drives a destination", () => {
    const shot = plan.steps.find((s) => s.kind === "shoot")!;
    expect(stepText(shot, t)).toMatch(/\d+ RPM$/);
    // Hood angle as shown elsewhere in the app: hood angle + offset.
    if (shot.kind !== "shoot") throw new Error("no shot");
    const deg = ((shot.spot.angle + 0.1) * 180) / Math.PI;
    expect(stepText(shot, t, 0.1)).toContain(`açı ${deg.toFixed(1)}°`);
    expect(text).toMatch(/Sür: .* → x -?\d/);
  });
});

describe("planner state in storage", () => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  afterEach(() => store.clear());

  it("falls back to the defaults when nothing or rubbish is stored", () => {
    expect(loadPlannerState()).toEqual(defaultPlannerState);
    store.set("shooterlab.autoPlanner.v1", "{not json");
    expect(loadPlannerState()).toEqual(defaultPlannerState);
  });
  it("round-trips the choices", () => {
    const s = {
      ...defaultPlannerState,
      robotId: "abc",
      alliance: "red" as const,
      overrides: { maxSpeed: 1.1, turret: true },
      enabled: { preload: true, garden: false },
      spacing: 0.2,
    };
    savePlannerState(s);
    expect(loadPlannerState()).toEqual(s);
  });
  it("drops values it cannot trust", () => {
    store.set(
      "shooterlab.autoPlanner.v1",
      JSON.stringify({
        alliance: "green",
        spacing: 0.01,
        startIndex: -3,
        overrides: { maxSpeed: -1, name: "x", shooter: {}, capacity: 3 },
      }),
    );
    const s = loadPlannerState();
    expect(s.alliance).toBe("blue");
    expect(s.spacing).toBe(defaultPlannerState.spacing);
    expect(s.startIndex).toBe(0);
    expect(s.overrides).toEqual({ capacity: 3 });
  });
});
