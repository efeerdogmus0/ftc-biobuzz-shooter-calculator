import { describe, it, expect } from "vitest";
import { current } from "../presets";
import {
  simulate,
  flight,
  targetWorld,
  targetBasis,
  sampleAt,
} from "../physics/flight";
import { simulateBounceWorld } from "../physics/collisionWorld";
import { defaultBounce } from "../physics/bounce";
import {
  advancedBounceDefaults,
  effectiveRestitution,
  hertzContact,
  advanceRotation,
  slipVelocity,
  dropCalibration,
} from "../physics/contactModel";
import { norm, dot, sub } from "../physics/math";
import type { BounceSettings, Vec3 } from "../physics/types";
const baseSettings: BounceSettings = {
  ...defaultBounce,
  ...advancedBounceDefaults,
  previewTime: 1.2,
  hiveMotion: false,
  shapeModel: "sphere",
};
const vacuum = () => {
  const c = structuredClone(current);
  c.aero.cd = 0;
  c.aero.magnus = false;
  c.aero.spinDecay = 0;
  c.field.obstacles = [];
  c.field.target.center = [20, 20, 20];
  return c;
};
const launch = (p: Vec3, v: Vec3, spin: Vec3 = [0, 0, 0]) => {
  const c = vacuum(),
    s = simulate(c);
  s.origin = p;
  s.velocity = v;
  s.spin = spin;
  s.flight = flight(p, v, spin, c);
  return s;
};
describe("contact material and rotation physics", () => {
  it("changes restitution with impact speed while bounding it for passive contact", () => {
    expect(effectiveRestitution(baseSettings, "floor", 1)).toBeCloseTo(
      defaultBounce.floor,
      8,
    );
    expect(effectiveRestitution(baseSettings, "floor", 5)).toBeLessThan(
      effectiveRestitution(baseSettings, "floor", 1),
    );
    expect(effectiveRestitution(baseSettings, "floor", 0.03)).toBe(0);
    expect(effectiveRestitution(baseSettings, "floor", 100)).toBe(0);
  });
  it("uses Hertz elastic scaling and the matching potential derivative", () => {
    const k = 300000,
      x = 0.002,
      h = 1e-7,
      f = hertzContact(x, 0, k, 0);
    expect(hertzContact(2 * x, 0, k, 0).force / f.force).toBeCloseTo(
      2 ** 1.5,
      8,
    );
    expect(
      (hertzContact(x + h, 0, k, 0).potential -
        hertzContact(x - h, 0, k, 0).potential) /
        (2 * h),
    ).toBeCloseTo(f.force, 5);
    expect(hertzContact(x, -20, k, 1).force).toBe(0);
    expect(hertzContact(x, -20, k, 1).dampingPower).toBeGreaterThan(0);
  });
  it("integrates a finite normalized quaternion for known angular motion", () => {
    const q = advanceRotation([0, 0, 0, 1], [0, 0, Math.PI], 1);
    expect(Math.hypot(...q)).toBeCloseTo(1, 12);
    expect(q[2]).toBeCloseTo(1, 10);
    expect(q[3]).toBeCloseTo(0, 10);
  });
  it("anchors a vertical-drop measurement without admitting unphysical input", () => {
    const fit = dropCalibration(1, 0.25, 9.81);
    expect(fit.restitution).toBe(0.5);
    expect(fit.speed).toBeCloseTo(Math.sqrt(19.62), 9);
    expect(() => dropCalibration(1, 1.2, 9.81)).toThrow();
    expect(() => dropCalibration(0, 0, 9.81)).toThrow();
  });
  it.each(["solid", "shell"] as const)(
    "sliding converges to analytic no-slip speed for a %s sphere",
    (model) => {
      const shot = launch(
        [0, 0, current.projectile.diameter / 2 + 0.000001],
        [1, 0, 0],
      );
      const result = simulateBounceWorld(shot, {
        ...baseSettings,
        inertiaModel: model,
        surfaceFriction: { floor: 0.3 },
        rollingResistance: 0,
        spinResistance: 0,
        staticRatio: 1.5,
      });
      const sample = sampleAt(result.flight.samples, 0.25),
        r = shot.config.projectile.diameter / 2,
        factor = model === "solid" ? 0.4 : 2 / 3;
      expect(sample.v[0]).toBeCloseTo(1 / (1 + factor), 2);
      expect(norm(slipVelocity(sample, [0, 0, 1], r))).toBeLessThan(0.005);
    },
  );
  it("retains pure torsional spin instead of declaring a motionless center stopped", () => {
    const shot = launch(
      [0, 0, current.projectile.diameter / 2 + 0.000001],
      [0, 0, 0],
      [0, 0, 20],
    );
    const result = simulateBounceWorld(shot, {
      ...baseSettings,
      rollingResistance: 0,
      spinResistance: 0,
    });
    expect(result.flight.bounceEnd).toBe("Time limit");
    expect(result.flight.samples.at(-1)!.spin[2]).toBeCloseTo(20, 8);
    expect(Math.hypot(...result.flight.samples.at(-1)!.rotation!)).toBeCloseTo(
      1,
      8,
    );
  });
  it("matches solid-sphere rolling acceleration on an inclined CELL plane", () => {
    const c = vacuum();
    c.field.target = {
      ...c.field.target,
      center: [0, 0, 1],
      width: 20,
      height: 20,
      shoulderHeight: 10,
      tilt: 0.2,
    };
    const shot = simulate(c),
      r = c.projectile.diameter / 2;
    shot.origin = targetWorld(
      [0, 0, -c.field.target.depth + r + 0.000001],
      c.field.target,
    );
    shot.velocity = [0, 0, 0];
    shot.spin = [0, 0, 0];
    const result = simulateBounceWorld(shot, {
      ...baseSettings,
      inertiaModel: "solid",
      surfaceFriction: { cell: 0.4 },
      staticRatio: 1.5,
      rollingResistance: 0,
      spinResistance: 0,
    });
    const a = sampleAt(result.flight.samples, 0.1),
      b = sampleAt(result.flight.samples, 0.25),
      basis = targetBasis(c.field.target);
    const acceleration = dot(sub(b.v, a.v), basis.v) / 0.15;
    expect(acceleration).toBeCloseTo(
      (5 / 7) * c.environment.gravity * Math.sin(0.2),
      1,
    );
  });
  it("resolves a finite-duration Hertz impact and converges when the step is halved", () => {
    const shot = launch([0, 0, 0.35], [0, 0, 0]);
    const cfg = {
      ...baseSettings,
      contactModel: "hertz" as const,
      materialDissipation: 0.15,
      contactStiffness: 300000,
      rollingResistance: 0,
      spinResistance: 0,
      surfaceFriction: { floor: 0 },
      maxContactStep: 0.0001,
    };
    const coarse = simulateBounceWorld(shot, cfg),
      fine = simulateBounceWorld(shot, { ...cfg, maxContactStep: 0.00005 });
    const a = coarse.flight.bounces![0],
      b = fine.flight.bounces![0];
    expect(a.duration!).toBeGreaterThan(0.0005);
    expect(a.peakForce!).toBeGreaterThan(1);
    expect(a.maxCompression!).toBeGreaterThan(0.0001);
    expect(a.observedRestitution!).toBeLessThan(1);
    expect(a.observedRestitution!).toBeGreaterThan(0);
    expect(
      Math.abs(a.observedRestitution! - b.observedRestitution!),
    ).toBeLessThan(0.02);
    expect(
      coarse.flight.diagnostics!.energy.every((e) =>
        [e.translation, e.rotation, e.gravity, e.elastic].every(
          Number.isFinite,
        ),
      ),
    ).toBe(true);
  });
  it("conserves independent total energy in an undamped elastic drop", () => {
    const shot = launch([0, 0, 0.35], [0, 0, 0]);
    const result = simulateBounceWorld(shot, {
      ...baseSettings,
      contactModel: "hertz",
      materialDissipation: 0,
      rollingResistance: 0,
      spinResistance: 0,
      surfaceFriction: { floor: 0 },
      maxContactStep: 0.00005,
      previewTime: 0.5,
    });
    const d = result.flight.diagnostics!;
    const first = d.energy[0];
    expect(Math.abs(d.energyBalanceError)).toBeLessThan(first.gravity * 0.005);
    expect(d.normalDissipationLoss).toBe(0);
    expect(result.flight.bounces![0].observedRestitution!).toBeCloseTo(1, 2);
  });
});
