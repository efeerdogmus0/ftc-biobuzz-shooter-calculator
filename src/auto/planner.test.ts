import { describe, expect, it } from "vitest";
import { builderTemplates, robotFromProject } from "./probot";
import { robotFromProbot } from "./robot";
import { buildRobot, exampleSpec } from "../presets/factory";
import { pickupSources, starts, hiveNoGo, type PickupSource } from "./field";
import { planAuto, runOrder, defaultSettings, pickupPose } from "./planner";
import { crosses, drive, aroundHive } from "./travel";
import { shotGrid, type ShotMap } from "./shotMap";
import { limitsOf } from "./robot";

const starter = (() => {
  const t = builderTemplates.find((x) => x.id.includes("starter"))!;
  const r = robotFromProject(t.proje()!);
  if (typeof r === "string") throw new Error(r);
  return robotFromProbot(
    r.robot,
    buildRobot(exampleSpec),
    exampleSpec,
    "builder",
    r.notlar,
  );
})();
/** Every grid point scores, aimed straight at the CELL (planner logic only). */
const fakeMap = (
  cell: "first" | "tipped",
  target: [number, number],
): ShotMap => ({
  cell,
  spacing: 0.3,
  tried: 0,
  spots: shotGrid(0.3, starter.halfX, starter.halfY)
    .filter((p) => Math.hypot(p.x - target[0], p.y - target[1]) < 1.6)
    .map((p) => ({
      ...p,
      heading: Math.atan2(target[1] - p.y, target[0] - p.x),
      omega: 300,
      angle: 1.1,
      clearance: 0.02,
    })),
});
const maps = {
  first: fakeMap("first", [0.32, -0.4]),
  tipped: fakeMap("tipped", [0.32, 0.4]),
};
const preload = (start: { x: number; y: number; h: number }): PickupSource => ({
  id: "preload",
  kind: "preload",
  label: "Ön yük",
  balls: 4,
  points: [],
  approach: { x: start.x, y: start.y, facing: start.h },
});

describe("auto planner", () => {
  it("reads the Starter Bot from Builder with its shooter and drive", () => {
    expect(starter.shooterOrigin).toBe("builder");
    expect(starter.drive).toBe("tank");
    expect(starter.wheelFreeSpeed).toBeGreaterThan(1);
    expect(starter.halfX).toBeGreaterThan(0.15);
  });

  it("routes around the HIVE frame", () => {
    const a = { x: 0, y: -1.2, h: 0 },
      b = { x: 0, y: 1.2, h: 0 };
    const w = aroundHive(a, b, 0.3);
    expect(w.length).toBeGreaterThan(0);
    const pts = [a, ...w, b];
    const grown = {
      x0: hiveNoGo.x0 - 0.3,
      x1: hiveNoGo.x1 + 0.3,
      y0: hiveNoGo.y0 - 0.3,
      y1: hiveNoGo.y1 + 0.3,
    };
    for (let i = 0; i < pts.length - 1; i++)
      expect(crosses(pts[i], pts[i + 1], grown)).toBe(false);
    const leg = drive(a, b, limitsOf(starter), true, 0.3);
    expect(leg.time).toBeGreaterThan(2.4 / starter.maxSpeed);
  });

  it("plans a timed auto with tips, park and leave", () => {
    const start = starts("blue")[0].pose;
    const sources = [
      preload(start),
      ...pickupSources("blue").filter(
        (s) => s.kind === "garden" || s.id === "flower-0",
      ),
    ];
    const { best, tried } = planAuto({
      robot: starter,
      start,
      sources,
      maps,
      settings: defaultSettings,
    });
    console.log(
      "tried",
      tried,
      "score",
      best.score,
      best.breakdown,
      "tips",
      best.tips.map((t) => t.toFixed(1)),
      "end",
      best.end.toFixed(1),
      "order",
      best.order,
    );
    for (const s of best.steps)
      console.log(
        s.kind,
        s.t0.toFixed(2),
        s.t1.toFixed(2),
        "label" in s
          ? s.label
          : "source" in s
            ? s.source
            : "balls" in s
              ? `${s.balls} ${s.cell}`
              : s.kind === "tip"
                ? s.cell
                : "",
      );
    console.log(best.notes);
    expect(best.tips.length).toBeGreaterThanOrEqual(1);
    expect(best.score).toBeGreaterThanOrEqual(23);
    let t = 0;
    for (const s of best.steps.filter((x) => x.kind !== "tip")) {
      expect(s.t0).toBeGreaterThanOrEqual(t - 1e-6);
      t = s.t1;
    }
    // The first CELL already holds 3 NECTAR: 3 POLLEN pass 0.19 kg.
    const first = best.steps.find((s) => s.kind === "shoot")!;
    expect(first.kind === "shoot" && first.balls).toBeGreaterThanOrEqual(3);
  });

  it("puts pickup poses inside the field", () => {
    for (const s of pickupSources("blue")) {
      const p = pickupPose(s, starter, starts("blue")[0].pose);
      expect(Math.abs(p.x)).toBeLessThan(1.83);
      expect(Math.abs(p.y)).toBeLessThan(1.83);
    }
  });
});

describe("auto planner limits", () => {
  it("stops collecting once both CELLS have tipped or the robot cannot unload", () => {
    const start = starts("blue")[0].pose;
    const sources = [preload(start), ...pickupSources("blue")];
    const { best, tried } = planAuto({
      robot: starter,
      start,
      sources,
      maps,
      settings: defaultSettings,
    });
    expect(tried).toBe(326 * 4);
    expect(best.tips.length).toBe(2);
    // No pickups after the second tip: the robot goes to park.
    const lastTipShot = best.steps.filter((x) => x.kind === "shoot").at(-1)!;
    expect(
      best.steps.some((x) => x.kind === "pickup" && x.t0 > lastTipShot.t0),
    ).toBe(false);
    expect(best.breakdown.park).toBe(5);
    const noSpots = { first: { ...maps.first, spots: [] }, tipped: null };
    const none = planAuto({
      robot: starter,
      start,
      sources,
      maps: noSpots,
      settings: defaultSettings,
    });
    expect(none.best.tips.length).toBe(0);
    expect(none.best.notes.map((n) => n.text).join()).toMatch(
      /atış noktası yok/,
    );
  });
});

describe("LEAVE", () => {
  it("counts where the robot is at 30 s, even if it is still driving", () => {
    const start = starts("blue")[0].pose;
    const sources = [
      preload(start),
      ...pickupSources("blue").filter(
        (s) => s.kind === "garden" || s.id === "flower-0",
      ),
    ];
    const slow = {
      ...starter,
      maxSpeed: starter.maxSpeed * 0.55,
      maxAccel: starter.maxAccel * 0.55,
    };
    const input = {
      robot: slow,
      start,
      sources,
      maps,
      settings: defaultSettings,
    };
    const all = runOrder(input, sources, [false], new Map());
    expect(all.end).toBeGreaterThan(30);
    expect(all.breakdown.park).toBe(0);
    expect(all.breakdown.leave).toBe(3);
    // The search leaves sources out until the park fits.
    const { best } = planAuto(input);
    expect(best.end).toBeLessThanOrEqual(30);
    expect(best.breakdown.park).toBe(5);
    expect(best.score).toBeGreaterThanOrEqual(all.score);
    expect(best.order.length).toBeLessThan(sources.length);
  });
});
