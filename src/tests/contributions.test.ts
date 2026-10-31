import { describe, expect, it } from "vitest";
import { current } from "../presets";
import { simulateShooter, wheelSpeeds } from "../physics/shooter";
import { aerodynamicForces, liftCoefficient } from "../physics/aerodynamics";
import { parseConfig } from "../utils/config";
import { loadProfiles } from "../state/store";
import { rpm, toRPM } from "../utils/units";

describe("Tuna's contact model contributions", () => {
  it("makes every hood contact stationary in passive mode", () => {
    const c = structuredClone(current);
    c.shooter.primary.omega = rpm(1450);
    c.shooter.topology = "passive";
    expect(wheelSpeeds(c).slice(1)).toEqual([0, 0, 0]);
    const s = simulateShooter(c);
    expect(
      s.speed / ((c.shooter.primary.omega * c.shooter.primary.diameter) / 2),
    ).toBeCloseTo(0.5, 2);
    expect((s.spin * c.projectile.diameter) / (2 * s.speed)).toBeCloseTo(1, 2);
    expect(toRPM(s.spin)).toBeGreaterThan(900);
  });
  it("does not project tangent wheel speed by the roller placement angle", () => {
    const c = structuredClone(current),
      a = simulateShooter(c);
    for (const w of [c.shooter.secondary, ...c.shooter.rollers]) w.angle = 0;
    const b = simulateShooter(c);
    expect(b.speed).toBeCloseTo(a.speed, 12);
    expect(b.spin).toBeCloseTo(a.spin, 12);
    expect(Math.abs(toRPM(a.spin))).toBeLessThan(10);
  });
});

describe("profile compatibility", () => {
  const oldProfile = () => {
    const q = JSON.parse(JSON.stringify(current));
    delete q.shooter.surfaceRatioVersion;
    delete q.aero.liftModel;
    q.shooter.surfaceRatio = 3.75;
    return q;
  };
  it("repairs only the old dormant factory ratio and keeps the old lift law", () => {
    const old = oldProfile(),
      migrated = parseConfig(old);
    expect(migrated.shooter.surfaceRatio).toBe(1);
    expect(migrated.aero.liftModel).toBe("linear");
    expect(old.shooter.surfaceRatio).toBe(3.75);
    expect(old.shooter.surfaceRatioVersion).toBeUndefined();
  });
  it("preserves explicit surface-mode, custom and already migrated ratios", () => {
    for (const adjust of [
      (c: ReturnType<typeof oldProfile>) => {
        c.shooter.link = "surface";
      },
      (c: ReturnType<typeof oldProfile>) => {
        c.name = "Custom robot";
      },
      (c: ReturnType<typeof oldProfile>) => {
        c.shooter.surfaceRatioVersion = 1;
      },
    ]) {
      const q = oldProfile();
      adjust(q);
      expect(parseConfig(q).shooter.surfaceRatio).toBe(3.75);
    }
  });
  it("rejects invalid model names without losing valid old profiles", () => {
    const bad = oldProfile();
    bad.aero.liftModel = "unknown";
    expect(() => parseConfig(bad)).toThrow();
    expect(
      loadProfiles(JSON.stringify([oldProfile(), bad, oldProfile()])),
    ).toHaveLength(2);
    expect(loadProfiles(JSON.stringify({ unexpected: "object" }))).toEqual([]);
  });
  it("retains an explicit zero surface ratio for a stationary hood", () => {
    const q = oldProfile();
    q.shooter.link = "surface";
    q.shooter.surfaceRatio = 0;
    expect(parseConfig(q).shooter.surfaceRatio).toBe(0);
  });
});

describe("optional empirical lift", () => {
  it("preserves linear defaults and gives a continuous optional piecewise curve", () => {
    const c = structuredClone(current);
    expect(c.aero.liftModel).toBe("linear");
    expect(liftCoefficient(0.3, c)).toBeCloseTo(0.18, 12);
    c.aero.liftModel = "sawicki";
    expect(liftCoefficient(0.05, c)).toBeCloseTo(0.075, 12);
    expect(liftCoefficient(0.1, c)).toBeCloseTo(0.15, 12);
    expect(liftCoefficient(0.3, c)).toBeCloseTo(0.27, 12);
    c.aero.liftSlope = 0.8;
    const join = 0.09 / (1.5 - c.aero.liftSlope);
    expect(liftCoefficient(join - 1e-10, c)).toBeCloseTo(
      liftCoefficient(join + 1e-10, c),
      8,
    );
    c.aero.liftMax = 0.2;
    expect(aerodynamicForces([7, 0, 0], [0, -1000, 0], c).cl).toBe(0.2);
    c.aero.magnus = false;
    expect(aerodynamicForces([7, 0, 0], [0, -1000, 0], c).cl).toBe(0);
  });
});
