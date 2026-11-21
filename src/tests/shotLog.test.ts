// Real shots logged on the robot: saved with it, compared with the simulation
// and turned into calibration rows that carry their own pose.
import { describe, expect, it } from "vitest";
import { current } from "../presets";
import {
  compare,
  loggedConfig,
  outcomeOf,
  parseShotLog,
  toMeasurements,
  type LoggedShot,
} from "../export/shotLog";
import { simulate } from "../physics/flight";
import { ballModelSettings } from "../physics/launchDynamics";
import {
  bakeMeasurements,
  calibrationStamp,
  legacyCalibrationStamp,
  measurementConfig,
  upgradeCalibration,
  type Measurement,
} from "../physics/analysis";
import { placed } from "../app/placement";
import { solve } from "../physics/analysis";
import {
  captureScenario,
  defaultScenario,
  parseScenario,
} from "../utils/scenario";

const model = ballModelSettings(defaultScenario().bounceSettings);

/** A shot the simulation says goes in, from the reference robot at (0.3, -1.3). */
function scoringShot(): LoggedShot {
  const q = placed(
    structuredClone(current),
    0.3,
    -1.3,
    current.shooter.hoodAngle,
  );
  const best = solve(q, () => {}, true, model)[0];
  expect(best).toBeTruthy();
  const r = placed(q, 0.3, -1.3, best.angle, best.omega);
  return {
    id: "s1",
    x: r.robot.x,
    y: r.robot.y,
    heading: r.robot.heading,
    turretYaw: r.robot.turretYaw,
    rpm: (best.omega * 30) / Math.PI,
    angle: ((best.angle + r.shooter.hoodOffset) * 180) / Math.PI,
    result: "in",
  };
}

describe("logged shots", () => {
  it("rebuilds the robot exactly as the shot was taken", () => {
    const row = scoringShot();
    const q = loggedConfig(current, row);
    expect(q.robot.x).toBe(row.x);
    expect((q.shooter.primary.omega * 30) / Math.PI).toBeCloseTo(row.rpm, 9);
    expect(
      ((q.shooter.hoodAngle + q.shooter.hoodOffset) * 180) / Math.PI,
    ).toBeCloseTo(row.angle, 9);
  });
  it("calls a solved shot in, and a much slower one short", () => {
    const row = scoringShot();
    expect(
      outcomeOf(simulate(loggedConfig(current, row), undefined, model)),
    ).toBe("in");
    const slow = { ...row, rpm: row.rpm * 0.6 };
    expect(
      outcomeOf(simulate(loggedConfig(current, slow), undefined, model)),
    ).toBe("short");
    const fast = { ...row, rpm: row.rpm * 1.6 };
    expect(
      outcomeOf(simulate(loggedConfig(current, fast), undefined, model)),
    ).toMatch(/long|rim/);
  });
  it("compares each row with the simulation", () => {
    const row = scoringShot();
    const [hit, miss] = compare(
      current,
      [row, { ...row, id: "s2", result: "short" }],
      model,
    );
    expect(hit.agrees).toBe(true);
    expect(miss.agrees).toBe(false);
    expect(miss.predicted).toBe("in");
    expect(hit.speed).toBeGreaterThan(0);
  });
  it("keeps good rows and drops bad ones when a file is opened", () => {
    const row = scoringShot();
    const parsed = parseShotLog([
      row,
      { ...row, id: "s1" }, // duplicate id
      { ...row, id: "bad", result: "maybe" },
      { ...row, id: "far", x: 40 },
      { ...row, id: "v", exitVelocity: -2 },
      "nope",
    ]);
    expect(parsed.map((r) => r.id)).toEqual(["s1", "v"]);
    expect(parsed[1].exitVelocity).toBeUndefined();
    const scenario = { ...defaultScenario(), shotLog: [row] };
    expect(
      parseScenario(JSON.parse(JSON.stringify(captureScenario(scenario))))
        .shotLog,
    ).toEqual([row]);
    expect(parseScenario(defaultScenario()).shotLog ?? []).toEqual([]);
  });
  it("turns timed rows into measurements with pose, holding every third out", () => {
    const base = scoringShot();
    const rows = [0, 1, 2, 3].map((i) => ({
      ...base,
      id: `m${i}`,
      exitVelocity: 6 + i * 0.1,
    }));
    const m = toMeasurements(current, [{ ...base, id: "untimed" }, ...rows]);
    expect(m.map((r) => r.id)).toEqual(["m0", "m1", "m2", "m3"]);
    expect(m.map((r) => r.split)).toEqual([
      "training",
      "training",
      "validation",
      "training",
    ]);
    for (const r of m) {
      expect(r.robot?.x).toBe(base.x);
      // The rows rebuild the same shooter command the log describes.
      const q = measurementConfig(current, r);
      expect((q.shooter.primary.omega * 30) / Math.PI).toBeCloseTo(base.rpm, 6);
    }
  });
});

describe("calibration stamp ignores where the robot stands", () => {
  it("driving the robot or changing the shot command keeps the stamp", () => {
    const q = structuredClone(current);
    q.robot.x += 0.7;
    q.robot.y -= 0.4;
    q.robot.heading += 1;
    q.robot.turretYaw = 0.3;
    q.robot.velocity = [0.5, 0, 0];
    q.shooter.primary.omega *= 1.2;
    q.shooter.hoodAngle = q.shooter.hoodMin;
    expect(calibrationStamp(q, model)).toBe(calibrationStamp(current, model));
    expect(calibrationStamp(q, model).startsWith("v2-")).toBe(true);
  });
  it("still follows robot geometry and physics", () => {
    const q = structuredClone(current);
    q.robot.exitOffset = [
      q.robot.exitOffset[0] + 0.05,
      q.robot.exitOffset[1],
      q.robot.exitOffset[2],
    ];
    expect(calibrationStamp(q, model)).not.toBe(
      calibrationStamp(current, model),
    );
    const r = structuredClone(current);
    r.shooter.primary.diameter *= 1.1;
    expect(calibrationStamp(r, model)).not.toBe(
      calibrationStamp(current, model),
    );
  });
  it("baked rows verify the same wherever the robot is now", () => {
    const rows = bakeMeasurements(current, [
      {
        id: "a",
        split: "validation",
        primaryRPM: 1500,
        // The reference shooter gears its hood to the main wheel.
        secondaryRPM: 1500 * current.shooter.secondary.ratio,
        hoodDeg: 50,
        exitVelocity: 6,
      },
    ]);
    const moved = structuredClone(current);
    moved.robot.x += 1;
    expect(measurementConfig(moved, rows[0]).robot).toEqual(current.robot);
  });
  it("upgrades an old stamp once, only while it still matches", () => {
    const rows: Measurement[] = [
      {
        id: "a",
        split: "validation",
        primaryRPM: 1500,
        secondaryRPM: 1500,
        hoodDeg: 50,
        exitVelocity: 6,
      },
    ];
    const old = {
      stamp: legacyCalibrationStamp(current, model),
      measurements: rows,
    };
    const up = upgradeCalibration(current, model, old);
    expect(up.stamp).toBe(calibrationStamp(current, model));
    expect(up.measurements[0].robot).toEqual(current.robot);
    const moved = structuredClone(current);
    moved.robot.x += 0.5;
    expect(upgradeCalibration(moved, model, old)).toBe(old);
    expect(upgradeCalibration(current, model, up)).toBe(up);
    // v2 stamps load from files and links.
    const scenario = { ...defaultScenario(), calibration: up };
    expect(
      parseScenario(JSON.parse(JSON.stringify(captureScenario(scenario))))
        .calibration?.stamp,
    ).toBe(up.stamp);
  });
});
