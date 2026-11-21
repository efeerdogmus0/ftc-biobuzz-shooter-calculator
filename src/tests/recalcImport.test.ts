import { describe, expect, it } from "vitest";
import {
  applyRecalcExtras,
  looksLikeRecalc,
  parseRecalcLink,
} from "../utils/recalc";
import { sandboxSpecs, validateSpec } from "../presets/factory";
import { parseScenario, scenarioFromSpec } from "../utils/scenario";
import { inch, inertiaImperial, pound } from "../utils/units";
import { simulateShooter } from "../physics/shooter";

// Real output of ReCalc → Flywheel → "Copy Link" (default page, 1 Nov 2026).
const DEFAULT_LINK =
  "https://www.reca.lc/flywheel?motor=%7B%22name%22%3A%22Kraken+X60+%28FOC%29%22%2C%22quantity%22%3A2%7D&ratio=%7B%22magnitude%22%3A1%2C%22ratioType%22%3A%22Reduction%22%7D&statorLimit=%7B%22s%22%3A80%2C%22u%22%3A%22A%22%7D&supplyLimit=%7B%22s%22%3A60%2C%22u%22%3A%22A%22%7D&supplyVoltage=%7B%22s%22%3A12.6%2C%22u%22%3A%22V%22%7D&batteryResistance=%7B%22s%22%3A0.015%2C%22u%22%3A%22Ohm%22%7D&shooterDiameter=%7B%22s%22%3A4%2C%22u%22%3A%22in%22%7D&shooterWeight=%7B%22s%22%3A1%2C%22u%22%3A%22lbs%22%7D&shooterTargetSpeed=%7B%22s%22%3A3000%2C%22u%22%3A%22rpm%22%7D&customShooterMoi=%7B%22s%22%3A4.5%2C%22u%22%3A%22in2*lbs%22%7D&useCustomShooterMoi=false&flywheelDiameter=%7B%22s%22%3A4%2C%22u%22%3A%22in%22%7D&flywheelWeight=%7B%22s%22%3A1.5%2C%22u%22%3A%22lbs%22%7D&customFlywheelMoi=%7B%22s%22%3A3%2C%22u%22%3A%22in2*lbs%22%7D&useCustomFlywheelMoi=false&flywheelEnabled=false&flywheelToShooterRatio=%7B%22magnitude%22%3A1%2C%22ratioType%22%3A%22Reduction%22%7D&projectileDiameter=%7B%22s%22%3A5%2C%22u%22%3A%22in%22%7D&projectileWeight=%7B%22s%22%3A0.5%2C%22u%22%3A%22lbs%22%7D&ballInitialVelocity=%7B%22s%22%3A0%2C%22u%22%3A%22ft%2Fs%22%7D&ballInitialSpin=%7B%22s%22%3A0%2C%22u%22%3A%22rpm%22%7D&shooterMode=single-hooded&useCustomBallMoi=false&customBallMoi=%7B%22s%22%3A2.5%2C%22u%22%3A%22in2*lbs%22%7D&secondaryShooterDiameter=%7B%22s%22%3A4%2C%22u%22%3A%22in%22%7D&secondaryShooterWeight=%7B%22s%22%3A1%2C%22u%22%3A%22lbs%22%7D&secondaryShooterToShooterRatio=%7B%22magnitude%22%3A1%2C%22ratioType%22%3A%22Reduction%22%7D&useCustomSecondaryShooterMoi=false&customSecondaryShooterMoi=%7B%22s%22%3A4.5%2C%22u%22%3A%22in2*lbs%22%7D&efficiency=100&qVelocity=%7B%22s%22%3A50%2C%22u%22%3A%22rpm%22%7D&rVolts=%7B%22s%22%3A12%2C%22u%22%3A%22V%22%7D&sensorDelay=%7B%22s%22%3A1%2C%22u%22%3A%22ms%22%7D&feedbackDt=%7B%22s%22%3A20%2C%22u%22%3A%22ms%22%7D";

function edit(link: string, patch: Record<string, unknown>) {
  const url = new URL(link);
  for (const [k, v] of Object.entries(patch))
    url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
  return url.toString();
}

describe("ReCalc import", () => {
  it("reads a real single wheel + hood link into a fixed-hood robot", () => {
    const imp = parseRecalcLink(DEFAULT_LINK);
    expect(imp.mode).toBe("single-hooded");
    expect(imp.spec.mechanism).toBe("wheel-fixed-hood");
    expect(imp.spec.wheelDiameter).toBeCloseTo(4 * inch, 12);
    expect(imp.spec.wheelRPM).toBe(3000);
    expect(imp.extras.primary).toEqual({
      mass: pound,
      inertia: null,
      inertiaMode: "disk",
    });
    expect(imp.extras.motor).toMatchObject({
      name: "Kraken X60 (FOC)",
      count: 2,
      efficiency: 1,
      reduction: 1,
      voltage: 12.6,
      statorLimit: 80,
      supplyLimit: 60,
    });
    expect(imp.extras.flywheel).toBeUndefined();
    // ReCalc has no gap / exit height / hood angle: the setup asks for them.
    expect(imp.missing).toEqual(
      expect.arrayContaining(["gap", "exitHeight", "hoodAngleDeg"]),
    );
    // A 5 in FRC ball is not POLLEN; that is said, not silently used.
    expect(imp.warnings.some((w) => /POLLEN/.test(w))).toBe(true);
    expect(imp.rows.find((r) => r.label === "Oyun parçası")?.status).toBe(
      "ignored",
    );
  });

  it("maps dual wheels, ratios, units, custom MOI and an enabled flywheel", () => {
    const link = edit(DEFAULT_LINK, {
      shooterMode: "dual-shooter",
      shooterDiameter: { s: 96, u: "mm" },
      shooterTargetSpeed: { s: 2500, u: "rpm" },
      secondaryShooterDiameter: { s: 3, u: "in" },
      secondaryShooterToShooterRatio: { magnitude: 2, ratioType: "Step-up" },
      useCustomShooterMoi: "true",
      customShooterMoi: { s: 4.5, u: "in2*lbs" },
      flywheelEnabled: "true",
      flywheelToShooterRatio: { magnitude: 1.5, ratioType: "Reduction" },
      flywheelWeight: { s: 300, u: "g" },
    });
    const imp = parseRecalcLink(link);
    expect(imp.spec.mechanism).toBe("twin-wheel");
    expect(imp.spec.wheelDiameter).toBeCloseTo(0.096, 12);
    expect(imp.spec.topWheelDiameter).toBeCloseTo(3 * inch, 12);
    expect(imp.spec.drive).toBe("gear");
    // "Step-up 2:1" from secondary to shooter: the secondary turns at half speed.
    expect(imp.spec.ratio).toBeCloseTo(0.5, 12);
    expect(imp.extras.primary.inertiaMode).toBe("custom");
    expect(imp.extras.primary.inertia).toBeCloseTo(4.5 * inertiaImperial, 15);
    expect(imp.extras.flywheel).toMatchObject({
      diameter: 4 * inch,
      mass: 0.3,
      inertiaMode: "disk",
      ratio: 1.5,
    });
  });

  it("builds a valid, simulatable robot once the missing values are filled", () => {
    const imp = parseRecalcLink(DEFAULT_LINK);
    const spec = { ...imp.spec, gap: 0.064, exitHeight: 0.35 };
    expect(validateSpec(spec)).toEqual({});
    const base = scenarioFromSpec(spec);
    base.config = applyRecalcExtras(base.config, imp.extras);
    const scenario = parseScenario(JSON.parse(JSON.stringify(base)));
    expect(scenario.config.shooter.motor.count).toBe(2);
    expect(scenario.config.shooter.primary.mass).toBe(pound);
    expect(scenario.config.projectile.name).toMatch(/POLLEN/);
    expect(simulateShooter(scenario.config).exited).toBe(true);
  });

  it("explains instead of guessing for links it cannot use", () => {
    expect(() => parseRecalcLink("")).toThrow(/yapıştır/);
    expect(() => parseRecalcLink("merhaba")).toThrow();
    expect(() => parseRecalcLink("https://example.com/flywheel?x=1")).toThrow(
      /reca\.lc/,
    );
    expect(() =>
      parseRecalcLink("https://www.reca.lc/linear?shooterMode=single-hooded"),
    ).toThrow(/flywheel/);
    expect(() => parseRecalcLink("https://www.reca.lc/flywheel")).toThrow(
      /Copy Link/,
    );
    expect(() =>
      parseRecalcLink(edit(DEFAULT_LINK, { shooterMode: "compound" })),
    ).toThrow(/Compound/);
    expect(() =>
      parseRecalcLink(
        edit(DEFAULT_LINK, { shooterDiameter: { s: 4, u: "furlong" } }),
      ),
    ).toThrow(/birimi/);
    expect(looksLikeRecalc(DEFAULT_LINK)).toBe(true);
    expect(looksLikeRecalc("reca.lc/flywheel?x")).toBe(true);
    expect(looksLikeRecalc("https://example.com")).toBe(false);
  });
});

describe("sandbox robots", () => {
  it("are valid, distinct mechanisms and every one leaves the shooter", () => {
    expect(new Set(sandboxSpecs.map((x) => x.spec.mechanism)).size).toBe(3);
    for (const { spec } of sandboxSpecs) {
      expect(validateSpec(spec)).toEqual({});
      const scenario = parseScenario(
        JSON.parse(JSON.stringify(scenarioFromSpec(spec))),
      );
      expect(simulateShooter(scenario.config).exited).toBe(true);
    }
  });
});

describe("solver suggestions", () => {
  it("are offered only for the robot they were computed for", async () => {
    const { candidatesMatch } = await import("../components/AnalysisPanel");
    const a = scenarioFromSpec(sandboxSpecs[1].spec).config;
    const json = JSON.stringify(a);
    // Applying a suggestion (angle + speed + re-aim) keeps the others usable.
    const applied = structuredClone(a);
    applied.shooter.hoodAngle += 0.1;
    applied.shooter.primary.omega *= 1.1;
    applied.robot.turretYaw += 0.05;
    expect(candidatesMatch(json, applied)).toBe(true);
    // Another robot, or the same robot moved, hides them.
    expect(
      candidatesMatch(json, scenarioFromSpec(sandboxSpecs[2].spec).config),
    ).toBe(false);
    const moved = structuredClone(a);
    moved.robot.x += 0.3;
    expect(candidatesMatch(json, moved)).toBe(false);
    expect(candidatesMatch("", a)).toBe(false);
  });
});
