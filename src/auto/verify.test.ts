import { describe, expect, it } from "vitest";
import { legOk, ramsete, verifyPlan } from "./verify";
import { loaded, robot, plan, start } from "./verify.test.shared";
import { footprintCenter, fromFootprint, rootPose } from "./robot";
import { aroundHive, crosses } from "./travel";
import { flowerBlocks } from "./field";

describe("turning point and root frame", () => {
  it("Starter Bot turns about its driven axle, behind the footprint centre", () => {
    expect(robot.drive).toBe("tank");
    expect(robot.pivot.x).toBeLessThan(-0.1);
    expect(robot.offsetX).toBeGreaterThan(0.1);
  });
  it("footprint centre and turning point convert both ways", () => {
    const p = { x: 0.4, y: -0.7, h: 1.1 };
    const c = footprintCenter(robot, p);
    const back = fromFootprint(robot, { ...c, h: p.h });
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
    const r = rootPose(robot, p);
    expect(Math.hypot(r.x - p.x, r.y - p.y)).toBeCloseTo(
      Math.hypot(robot.pivot.x, robot.pivot.y),
      9,
    );
  });
});

describe("paths avoid FLOWERS as well as the HIVE", () => {
  it("goes round a FLOWER that lies on the straight line", () => {
    const f = flowerBlocks[1]; // alliance wall FLOWER
    const cy = (f.y0 + f.y1) / 2;
    const a = { x: 1.45, y: cy - 0.9 },
      b = { x: 1.45, y: cy + 0.9 };
    const w = aroundHive(a, b, 0.35);
    expect(w.length).toBeGreaterThan(0);
    const pts = [a, ...w, b];
    const grown = {
      x0: f.x0 - 0.35,
      x1: f.x1 + 0.35,
      y0: f.y0 - 0.35,
      y1: f.y1 + 0.35,
    };
    for (let i = 0; i < pts.length - 1; i++)
      expect(crosses(pts[i], pts[i + 1], grown)).toBe(false);
  });
  it("ignores the FLOWER being visited", () => {
    const f = flowerBlocks[1];
    const at = { x: f.x0 - 0.3, y: (f.y0 + f.y1) / 2 };
    expect(aroundHive({ x: 0.9, y: at.y }, at, 0.35)).toEqual([]);
  });
});

describe("RAMSETE", () => {
  it("steers a sideways offset back towards the path", () => {
    const target = { poz: { x: 0, y: 0, h: 0 }, hiz: { vx: 1, vy: 0, w: 0 } };
    const left = ramsete(target, { x: 0, y: 0.1, h: 0 });
    const right = ramsete(target, { x: 0, y: -0.1, h: 0 });
    expect(left.w).toBeLessThan(0);
    expect(right.w).toBeGreaterThan(0);
    expect(left.vy).toBe(0);
  });
});

describe("plan in Probot Sim physics", () => {
  // Regression marks for the Starter Bot plan (not a claim that every plan
  // holds). Measured 2026-11-09 with this fixture: 2D 6 of 7 legs, 3D 7 of 7,
  // largest deviation 0.18 / 0.19 m.
  for (const engine of ["light", "rigid"] as const)
    it(`follows the Starter Bot plan (${engine})`, async () => {
      const v = await verifyPlan(loaded.robot, robot, plan, start, engine);
      expect(v.legs.length).toBe(
        plan.steps.filter((s) => s.kind === "drive").length,
      );
      expect(v.track.length).toBeGreaterThan(plan.end * 9);
      expect(v.maxError).toBeLessThan(0.35);
      expect(v.legs.filter((l) => legOk(l)).length).toBeGreaterThanOrEqual(
        v.legs.length - 2,
      );
      // Leaving the start and reaching the first shooting spot are clean.
      expect(legOk(v.legs[0]) && legOk(v.legs[1])).toBe(true);
    }, 120000);
});
