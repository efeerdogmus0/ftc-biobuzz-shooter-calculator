import { describe, expect, it } from "vitest";
import { current } from "../presets";
import {
  interpolate,
  javaClassName,
  lookupRows,
  mixedAngles,
  rowsFromPoints,
  sweep,
  toCSV,
  toJava,
  type ShotRow,
  type TableMeta,
} from "../export/shotTable";
import { distanceOf, placed } from "../app/placement";
import { simulate } from "../physics/flight";
import { ballModelSettings } from "../physics/launchDynamics";
import { defaultScenario } from "../utils/scenario";
import type { ShotPoint } from "../utils/scenario";

const meta: TableMeta = {
  robot: 'Robot "A", v2',
  date: "2026-11-10",
  evidence: ["Simulation, not measured */ evil"],
  labels: {
    title: "Shot table",
    name: "Point",
    distance: "Distance (m)",
    rpm: "Wheel RPM",
    angle: "Launch angle (deg)",
    clearance: "Margin (mm)",
    reliability: "Trust (%)",
    distanceNote: "Distance: exit to HIVE centre.",
    angleNote: "Angle is the launch angle.",
    interpolationNote: "Linear interpolation.",
  },
};
const row = (distance: number, rpm: number, angle: number, clearance = 50) =>
  ({
    name: `${distance}`,
    distance,
    x: 0,
    y: distance,
    heading: 0,
    rpm,
    angle,
    clearance,
    source: "manual",
  }) satisfies ShotRow;

describe("shot table", () => {
  it("interpolates linearly and clamps outside the table", () => {
    const xs = [1, 2, 3],
      ys = [1000, 1200, 1500];
    expect(interpolate(xs, ys, 1.5)).toBeCloseTo(1100);
    expect(interpolate(xs, ys, 2.5)).toBeCloseTo(1350);
    expect(interpolate(xs, ys, 0.2)).toBe(1000);
    expect(interpolate(xs, ys, 9)).toBe(1500);
    expect(interpolate([], [], 1)).toBeNull();
  });
  it("sorts and keeps one row per distance, the wider margin winning", () => {
    const t = lookupRows([
      row(2, 1300, 60, 40),
      row(1, 1100, 60),
      row(2.005, 1310, 61, 90),
    ]);
    expect(t.map((r) => r.distance)).toEqual([1, 2.005]);
    expect(t[1].clearance).toBe(90);
  });
  it("rows from points use the shot card's distance and the launch angle", () => {
    const c = structuredClone(current);
    const p: ShotPoint = {
      id: "a",
      name: "P1",
      x: 0.2,
      y: -1.2,
      heading: 0,
      omega: 140,
      hoodAngle: c.shooter.hoodMin,
      clearance: 0.05,
      source: "manual",
      reliability: 0.9,
    };
    const [r] = rowsFromPoints(c, [p]);
    expect(r.distance).toBeCloseTo(distanceOf(c, p), 9);
    expect(r.rpm).toBeCloseTo((140 * 30) / Math.PI);
    expect(r.angle).toBeCloseTo(
      ((c.shooter.hoodMin + c.shooter.hoodOffset) * 180) / Math.PI,
    );
    expect(r.clearance).toBeCloseTo(50);
    expect(r.reliability).toBe(0.9);
  });
  it("CSV quotes cells and states what the numbers are", () => {
    const csv = toCSV([row(1, 1100, 60)], meta);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("Shot table");
    expect(lines.some((l) => l.includes("Simulation, not measured"))).toBe(
      true,
    );
    const header = lines.findIndex((l) => l.startsWith("Point,"));
    expect(lines[header]).toContain("wheel_rpm");
    expect(lines[header + 1].split(",").slice(1, 4)).toEqual([
      "1.000",
      "1100",
      "60.0",
    ]);
    expect(toCSV([{ ...row(1, 1, 1), name: 'a,"b"' }], meta)).toContain(
      '"a,""b"""',
    );
  });
  it("Java has the table, a matching lookup and no hardware names", () => {
    const java = toJava(
      [row(2, 1300, 62), row(1, 1100, 60)],
      meta,
      "My Table!",
    );
    expect(java).toContain("public final class MyTable");
    expect(java).toContain("1.000, 2.000");
    expect(java).toContain("1100.0, 1300.0");
    expect(java).toContain("60.0, 62.0");
    expect(java).toContain("public static double wheelRpm(double distanceM)");
    expect(java).not.toMatch(/hardwareMap|DcMotor|Servo\b/);
    // A comment terminator inside text cannot end the comment early.
    expect(java).toContain("not measured * / evil");
    expect(java).not.toContain("*/ evil");
    expect(javaClassName("9lives")).toBe("ShotTable");
    expect(toJava([], meta)).toContain("DISTANCE_M = {}");
  });
  it("sweep finds shots that score, in increasing distance", () => {
    const c = structuredClone(current);
    const { rows, direction } = sweep(c, { from: 1, to: 1.6, step: 0.3 });
    expect(Math.hypot(...direction)).toBeCloseTo(1);
    expect(rows.length).toBeGreaterThan(0);
    for (let i = 1; i < rows.length; i++)
      expect(rows[i].distance).toBeGreaterThan(rows[i - 1].distance);
    for (const r of rows) expect(r.clearance).toBeGreaterThanOrEqual(0);
    // One launch angle for the whole table, so interpolation stays on solutions.
    const angle = sweep(c, { from: 1, to: 1.6, step: 0.3 }).angle;
    expect(angle).not.toBeNull();
    for (const r of rows) expect(r.angle).toBeCloseTo(angle!, 9);
    expect(mixedAngles(rows)).toBe(false);
    expect(mixedAngles([row(1, 1, 50), row(2, 1, 60)])).toBe(true);
  });
  it("a value read between two sweep rows still scores in the simulation", () => {
    const c = structuredClone(current);
    const model = ballModelSettings(defaultScenario().bounceSettings);
    const { rows } = sweep(c, { from: 0.8, to: 1.6, step: 0.2 }, model);
    expect(rows.length).toBeGreaterThan(2);
    const table = lookupRows(rows);
    const xs = table.map((r) => r.distance),
      rpm = table.map((r) => r.rpm);
    let checked = 0;
    for (let i = 1; i < table.length; i++) {
      const a = table[i - 1],
        b = table[i];
      const mx = (a.x + b.x) / 2,
        my = (a.y + b.y) / 2;
      const hood = (a.angle * Math.PI) / 180 - c.shooter.hoodOffset;
      const probe = placed(c, mx, my, hood);
      const d = distanceOf(c, { x: mx, y: my, hoodAngle: hood });
      probe.shooter.primary.omega = (interpolate(xs, rpm, d)! * Math.PI) / 30;
      expect(simulate(probe, undefined, model).flight.status).toBe("HIT");
      checked++;
    }
    expect(checked).toBeGreaterThan(1);
  });
});
