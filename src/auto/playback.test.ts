import { describe, expect, it } from "vitest";
import { plan, start, robot, maps } from "./verify.test.shared";
import { playbackLength, worldAt, FLIGHT } from "./playback";
import { coach } from "./coach";
import { defaultSettings, planAuto, SCORE } from "./planner";
import { pickupSources, type PickupSource } from "./field";

describe("playback", () => {
  const L = playbackLength(plan, 30);
  it("starts empty at the start pose and ends with the plan's score", () => {
    const a = worldAt(plan, start, 0, 30);
    expect(a.score).toBe(0);
    expect(a.held).toBe(0);
    expect(a.pose.x).toBeCloseTo(start.x, 6);
    const z = worldAt(plan, start, L + FLIGHT, 30);
    expect(z.score).toBe(plan.score);
    expect(z.cells.first + z.cells.tipped).toBe(plan.ballsShot);
    expect(z.flights).toHaveLength(0);
    expect(z.tipsDone).toBe(plan.tips.length);
  });
  it("never holds more than the capacity or less than nothing", () => {
    let last = 0;
    for (let t = 0; t <= L; t += 0.05) {
      const w = worldAt(plan, start, t, 30);
      expect(w.held).toBeGreaterThanOrEqual(0);
      expect(w.held).toBeLessThanOrEqual(robot.capacity);
      expect(w.score).toBeGreaterThanOrEqual(last);
      last = w.score;
    }
  });
  it("shows a ball in the air right after a shot and the tip swing", () => {
    const shot = plan.steps.find((s) => s.kind === "shoot")!;
    if (shot.kind !== "shoot") throw new Error();
    const w = worldAt(plan, start, shot.shotTimes[0] + FLIGHT / 2, 30);
    expect(w.flights.length).toBeGreaterThan(0);
    expect(w.flights[0].u).toBeCloseTo(0.5, 1);
    const tip = plan.steps.find((s) => s.kind === "tip")!;
    const m = worldAt(plan, start, (tip.t0 + tip.t1) / 2, 30);
    expect(m.swing?.u).toBeCloseTo(0.5, 5);
    expect(m.pop?.points).toBe(SCORE.tip);
  });
  it("takes POLLEN off the field as it is collected", () => {
    const pick = plan.steps.find(
      (s) => s.kind === "pickup" && s.sourceId !== "preload",
    )!;
    if (pick.kind !== "pickup") throw new Error();
    expect(
      worldAt(plan, start, pick.t0 - 0.01, 30).taken[pick.sourceId] ?? 0,
    ).toBe(0);
    expect(worldAt(plan, start, pick.t1 + 0.01, 30).taken[pick.sourceId]).toBe(
      pick.balls,
    );
  });
});

describe("coach", () => {
  const preload: PickupSource = {
    id: "preload",
    kind: "preload",
    label: "Ön yük",
    balls: 4,
    points: [],
    approach: { x: start.x, y: start.y, facing: start.h },
  };
  const input = {
    robot,
    start,
    sources: [
      preload,
      ...pickupSources("blue").filter(
        (s) => s.kind === "garden" || s.id === "flower-1",
      ),
    ],
    maps,
    settings: defaultSettings,
  };
  it("only lists changes that help, best first, and plans are budgeted", () => {
    const t = performance.now();
    const base = planAuto(input).best;
    const advice = coach(input, base);
    console.log(
      "coach ms",
      Math.round(performance.now() - t),
      advice
        .map((a) => `${a.id} +${a.dScore} ${a.saved.toFixed(1)}s`)
        .join(", "),
    );
    for (const a of advice) expect(a.dScore > 0 || a.saved >= 0.3).toBe(true);
    for (let i = 1; i < advice.length; i++)
      expect(advice[i - 1].dScore).toBeGreaterThanOrEqual(advice[i].dScore);
    const b = base.budget;
    expect(b.drive + b.pickup + b.shoot + b.wait).toBeCloseTo(base.end, 6);
  });
});
