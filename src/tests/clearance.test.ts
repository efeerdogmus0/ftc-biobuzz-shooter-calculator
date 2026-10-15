import { describe, it, expect } from "vitest";
import { current } from "../presets";
import {
  clearanceEnvelope,
  hoodPathRadius,
  isClear,
  placeholderGeometry,
  releasePoint,
  safeHeights,
  shotPath,
  shotsFromConfig,
  stationAt,
  surfaceDistance,
} from "../physics/clearance";
import {
  coverage,
  hiveExtraSolids,
  hitsExtraSolids,
  legalPositions,
  narrowestRange,
  positionShooter,
  recommended,
  robustMargin,
  speedWindow,
  zoneOf,
  type PositionStudy,
} from "../physics/shotStudy";
import { deg } from "../utils/units";
import type { Sample } from "../physics/types";

const g = placeholderGeometry;
const R = hoodPathRadius(g),
  r = g.ballDiameter / 2;

describe("clearance envelope", () => {
  it("hood path radius defaults to R_wheel + r_ball − compression", () => {
    expect(R).toBeCloseTo(0.048 + 0.03556 - 0.008, 6);
    expect(hoodPathRadius({ ...g, hoodRadius: 0.09 })).toBe(0.09);
  });

  it("releases tangentially from the hood circle", () => {
    const p = shotPath(g, { elevation: deg(55), speed: 7, spin: 0 }, current);
    const [s, z] = releasePoint(g, deg(55));
    const rel = p.points[p.release];
    expect(rel[0]).toBeCloseTo(s, 9);
    expect(rel[2]).toBeCloseTo(z, 9);
    for (const q of p.points.slice(0, p.release + 1))
      expect(Math.hypot(q[0], q[2])).toBeCloseTo(R, 9);
    // The first free-flight step continues along the 55° tangent.
    const next = p.points[p.release + 1];
    expect(Math.atan2(next[2] - rel[2], next[0] - rel[0])).toBeCloseTo(
      deg(55),
      2,
    );
  });

  it("zero-spin and backspin shots never leave the shooter plane", () => {
    const shots = [0, 200].map((spin) => ({
      elevation: deg(50),
      speed: 7,
      spin,
    }));
    const e = clearanceEnvelope({ ...g, wheelLateral: 0.05 }, shots, current);
    expect(e.lateralDeviation).toBeLessThan(1e-12);
    expect(e.halfWidth).toBeCloseTo(r, 12);
    // Just outside r from the plane is clear; inside is not.
    const [s, z] = releasePoint(g, deg(50));
    const at = (y: number) =>
      [
        g.wheelForward + s + 0.02,
        0.05 + y,
        g.wheelCenterHeight + z + 0.02 * Math.tan(deg(50)),
      ] as const;
    expect(isClear(e, [...at(r + 0.002)], 0.001)).toBe(true);
    expect(isClear(e, [...at(r - 0.002)])).toBe(false);
  });

  it("matches the tangent-line crossing of the wheel-axis vertical line", () => {
    const a = deg(55);
    const e = clearanceEnvelope(
      g,
      [{ elevation: a, speed: 8, spin: 0 }],
      current,
    );
    // Upper crossing; the hood arc entry passes below the axis at s=0 too.
    const st = stationAt(e, 0).intervals.find((i) => i[0] > 0)!;
    // The free-flight line is tangent to the radius-R circle; near the wheel
    // gravity is negligible, so the ball surface spans these heights at s=0.
    expect(st[0]).toBeCloseTo((R - r) / Math.cos(a), 2);
    expect(st[1]).toBeCloseTo((R + r) / Math.cos(a), 2);
  });

  it("nothing reaches farther behind the axis than R_h + r", () => {
    const shots = shotsFromConfig(current, [deg(30), deg(60), deg(85)], [5, 9]);
    const e = clearanceEnvelope(g, shots, current);
    expect(safeHeights(e, -(R + r + 0.01)).clearAll).toBe(true);
    expect(safeHeights(e, -(R + r - 0.01)).clearAll).toBe(false);
    const h = safeHeights(e, 0.1, 0.02);
    expect(h.above!).toBeGreaterThan(stationAt(e, 0.1).max!);
    expect(h.below!).toBeLessThan(stationAt(e, 0.1).min!);
    const axis: [number, number, number] = [
      g.wheelForward,
      g.wheelLateral,
      g.wheelCenterHeight,
    ];
    // The wheel axis is inside the hood circle: R − r from the ball surface.
    expect(surfaceDistance(e, axis)).toBeCloseTo(R - r, 4);
  });
});

describe("shot study", () => {
  it("legal positions avoid walls and the HIVE footprint", () => {
    const pos = legalPositions(current, 0.3);
    const half = current.field.size / 2,
      m = Math.hypot(current.robot.width, current.robot.length) / 2;
    const foot = current.field.obstacles[0];
    for (const [x, y] of pos) {
      expect(Math.abs(x)).toBeLessThanOrEqual(half - m + 1e-9);
      expect(Math.abs(y)).toBeLessThanOrEqual(half - m + 1e-9);
      const inside =
        x > foot.min[0] - m &&
        x < foot.max[0] + m &&
        y > foot.min[1] - m &&
        y < foot.max[1] + m;
      const nx = Math.max(foot.min[0], Math.min(x, foot.max[0])),
        ny = Math.max(foot.min[1], Math.min(y, foot.max[1]));
      if (inside) expect(Math.hypot(x - nx, y - ny)).toBeGreaterThan(m);
    }
    expect(zoneOf(current, -1.5)).toBe("front");
    expect(zoneOf(current, 1.5)).toBe("back");
    expect(zoneOf(current, 0)).toBe("side");
  });

  it("finds a HIT speed window from the front", () => {
    const shooter = positionShooter(current, 1.5, -1.5, true);
    const w = speedWindow(shooter, deg(60), {
      spacing: 0.3,
      angles: [deg(60)],
      speedMin: 2,
      speedMax: 15,
      speedTolerance: 0.01,
      extendedHive: true,
    })!;
    expect(w).not.toBeNull();
    expect(w.hi - w.lo).toBeGreaterThan(0.2);
    expect(shooter.hit(deg(60), (w.lo + w.hi) / 2)).toBe(true);
    expect(shooter.hit(deg(60), w.lo - 0.05)).toBe(false);
    expect(shooter.hit(deg(60), w.hi + 0.05)).toBe(false);
  });

  it("rejects paths through the HIVE side frame", () => {
    const solids = hiveExtraSolids(current);
    const x = current.field.hive.frameWidth / 2;
    const path: Sample[] = [
      { t: 0, p: [x, -1, 0.5], v: [0, 0, 0], spin: [0, 0, 0] },
      { t: 1, p: [x, 1, 0.5], v: [0, 0, 0], spin: [0, 0, 0] },
    ];
    expect(hitsExtraSolids(path, 2, r, solids)).toBe(true);
    path[0].p[0] = path[1].p[0] = x + 0.2;
    expect(hitsExtraSolids(path, 2, r, solids)).toBe(false);
  });

  it("summarizes coverage and narrowest ranges", () => {
    const at = (angles: number[], lo = 6): PositionStudy => ({
      x: 0,
      y: 0,
      zone: "front",
      distance: 1,
      windows: angles.map((a) => ({ angle: deg(a), lo, hi: lo + 0.4 })),
    });
    const r = [at([40, 45, 50]), at([60, 65]), at([80], 10)];
    expect(coverage(r, deg(35), deg(85))).toBe(1);
    expect(coverage(r, deg(35), deg(85), 9)).toBeCloseTo(2 / 3);
    const grid = [40, 45, 50, 55, 60, 65, 70, 75, 80].map(deg);
    const best = narrowestRange(r, grid, 1)!;
    expect([best.min, best.max]).toEqual([deg(50), deg(80)]);
    expect(recommended(at([40, 45], 6))!.angle).toBe(deg(40));
    const bowl: PositionStudy = {
      ...at([]),
      windows: [
        [50, 6.5],
        [52.5, 6.0],
        [55, 6.0],
        [57.5, 6.5],
      ].map(([a, lo]) => ({ angle: deg(a), lo, hi: lo + 0.4 })),
    };
    // Flat bottom of the speed-vs-elevation bowl wins; the steep edge has
    // its whole half-window eaten by a 1° hood error.
    expect(recommended(bowl)!.angle).toBe(deg(52.5));
    expect(robustMargin(bowl, bowl.windows[0], deg(1))).toBeCloseTo(0, 9);
  });
});
