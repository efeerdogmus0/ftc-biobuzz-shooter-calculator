import { describe, expect, it } from "vitest";
import {
  defaultDrive,
  driveErrors,
  freeWheelRPM,
  motorConfigOf,
  recalcLinkFor,
  targetWheelRPM,
} from "../presets/motors";
import { blankSpec, exampleSpec, POLLEN_DIAMETER } from "../presets/factory";
import { parseRecalcLink } from "../utils/recalc";
import { parseConfig } from "../utils/config";
import { buildRobot } from "../presets/factory";

describe("motor and gear choice", () => {
  it("turns motor free speed, teeth and operating point into wheel RPM", () => {
    const d = {
      ...defaultDrive,
      motorTeeth: 20,
      wheelTeeth: 40,
      targetPct: 80,
    };
    expect(freeWheelRPM(d)).toBe(3000); // 6000 RPM motor, 2:1 reduction
    expect(targetWheelRPM(d)).toBe(2400);
    const up = {
      ...defaultDrive,
      motorId: "gobilda-3.7",
      motorTeeth: 36,
      wheelTeeth: 24,
      targetPct: 100,
    };
    expect(freeWheelRPM(up)).toBeCloseTo(2430, 9); // 1620 × 1.5 step-up
    const custom = { ...defaultDrive, motorId: "custom", customRPM: 5000 };
    expect(freeWheelRPM(custom)).toBe(5000);
    expect(
      driveErrors({ ...defaultDrive, wheelTeeth: 0 }).wheelTeeth,
    ).toBeTruthy();
    expect(driveErrors({ ...defaultDrive, count: 1.5 }).count).toBeTruthy();
    expect(driveErrors(defaultDrive)).toEqual({});
  });

  it("stores a valid motor record in the config", () => {
    const c = buildRobot(blankSpec());
    c.shooter.motor = {
      ...c.shooter.motor,
      ...motorConfigOf({
        ...defaultDrive,
        count: 2,
        motorTeeth: 20,
        wheelTeeth: 40,
      }),
    };
    const parsed = parseConfig(JSON.parse(JSON.stringify(c)));
    expect(parsed.shooter.motor).toMatchObject({
      name: "goBILDA 5203 Yellow Jacket 1:1",
      count: 2,
      reduction: 2,
    });
  });

  it("opens ReCalc pre-filled, and reading that link back gives the same wheels", () => {
    const twin = {
      ...exampleSpec,
      wheelDiameter: 0.096,
      topWheelDiameter: 0.072,
      ratio: 0.75,
      wheelRPM: 2500,
    };
    const back = parseRecalcLink(recalcLinkFor(twin));
    expect(back.spec.mechanism).toBe("twin-wheel");
    expect(back.spec.wheelDiameter).toBeCloseTo(0.096, 9);
    expect(back.spec.topWheelDiameter).toBeCloseTo(0.072, 9);
    expect(back.spec.wheelRPM).toBe(2500);
    expect(back.spec.ratio).toBeCloseTo(0.75, 4);
    // POLLEN goes in as the projectile, so no "different ball" warning comes back.
    expect(back.warnings.some((w) => /POLLEN.*farklı/.test(w))).toBe(false);
    expect(
      new URL(recalcLinkFor(twin)).searchParams.get("projectileDiameter"),
    ).toContain((POLLEN_DIAMETER / 0.0254).toFixed(1));
  });

  it("adds the motor only when ReCalc has the same one", () => {
    const rev = new URL(
      recalcLinkFor(blankSpec(), {
        ...defaultDrive,
        motorId: "rev-hdhex",
        count: 2,
        motorTeeth: 20,
        wheelTeeth: 30,
      }),
    );
    expect(JSON.parse(rev.searchParams.get("motor")!)).toEqual({
      name: "HD Hex",
      quantity: 2,
    });
    expect(JSON.parse(rev.searchParams.get("ratio")!)).toEqual({
      magnitude: 1.5,
      ratioType: "Reduction",
    });
    const gobilda = new URL(recalcLinkFor(blankSpec(), defaultDrive));
    expect(gobilda.searchParams.has("motor")).toBe(false);
    expect(gobilda.searchParams.get("shooterMode")).toBe("single-hooded");
  });
});
