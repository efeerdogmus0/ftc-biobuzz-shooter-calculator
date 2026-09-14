import { describe, it, expect } from "vitest";
import { current, recalc } from "../presets";
import {
  flight,
  simulate,
  segmentBox,
  shooterPose,
  targetOpeningClearance,
} from "../physics/flight";
import { aerodynamicForces } from "../physics/aerodynamics";
import { simulateShooter } from "../physics/shooter";
import { norm, sub } from "../physics/math";
import { toRPM, inch, inertiaImperial } from "../utils/units";
const config = () => structuredClone(current);
describe("independent numerical physics", () => {
  it("matches analytic vacuum flight time, range, apex and apex time", () => {
    const c = config();
    c.aero.cd = 0;
    c.aero.magnus = false;
    const f = flight([0, 0, 0.347], [4, 0, 6], [0, 0, 0], c, false);
    const g = c.environment.gravity,
      h = 0.347 - c.projectile.diameter / 2;
    const t = (6 + Math.sqrt(36 + 2 * g * h)) / g;
    expect(f.impact!.t).toBeCloseTo(t, 6);
    expect(f.impact!.p[0]).toBeCloseTo(4 * t, 6);
    expect(f.apex.t).toBeCloseTo(6 / g, 6);
    expect(f.apex.p[2]).toBeCloseTo(0.347 + 36 / (2 * g), 6);
  });
  it("zero spin means zero Magnus", () =>
    expect(norm(aerodynamicForces([4, 0, 3], [0, 0, 0], config()).lift)).toBe(
      0,
    ));
  it("zero relative velocity means zero aerodynamic force", () => {
    const c = config();
    c.environment.wind = [1, 2, 3];
    const f = aerodynamicForces([1, 2, 3], [1, 2, 3], c);
    expect(norm(f.drag) + norm(f.lift)).toBe(0);
  });
  it("doubling airflow quadruples drag", () => {
    const c = config();
    expect(
      norm(aerodynamicForces([8, 0, 0], [0, 0, 0], c).drag) /
        norm(aerodynamicForces([4, 0, 0], [0, 0, 0], c).drag),
    ).toBeCloseTo(4, 12);
  });
  it("equal opposing surface speeds equilibrate to zero spin", () => {
    const c = config();
    c.shooter.topology = "opposing";
    c.shooter.rollers = [];
    c.shooter.link = "surface";
    c.shooter.surfaceRatio = 1;
    const s = simulateShooter(c);
    expect(Math.abs(s.spin)).toBeLessThan(0.01);
    expect(s.speed).toBeGreaterThan(5);
  });
  it("uses three same-speed Sushi hood contacts without forcing POLLEN spin to zero", () => {
    const c = config();
    const s = simulateShooter(c);
    expect(c.projectile.diameter).toBeCloseTo(0.07112, 10);
    expect(c.projectile.mass).toBeCloseTo(0.025, 10);
    expect(c.shooter.primary.diameter).toBeCloseTo(0.096, 10);
    expect(c.shooter.secondary.diameter).toBeCloseTo(0.0254, 10);
    expect(c.shooter.rollers).toHaveLength(2);
    expect(s.trace[0].secondaryOmega / s.trace[0].primaryOmega).toBeCloseTo(
      3.75,
      10,
    );
    expect(Math.abs(s.spin)).toBeGreaterThan(1e-6);
  });
  it("robot translation moves origin without changing shooter", () => {
    const c = config(),
      a = simulate(c);
    c.robot.x += 0.2;
    c.robot.y -= 0.3;
    const b = simulate(c);
    expect(b.origin[0] - a.origin[0]).toBeCloseTo(0.2, 12);
    expect(b.origin[1] - a.origin[1]).toBeCloseTo(-0.3, 12);
    expect(b.shooter).toEqual(a.shooter);
  });
  it("turret yaw rotates launch velocity in still air", () => {
    const c = config(),
      a = simulate(c);
    c.robot.turretYaw += Math.PI / 2;
    const b = simulate(c);
    expect(b.velocity[0]).toBeCloseTo(-a.velocity[1], 12);
    expect(b.velocity[1]).toBeCloseTo(a.velocity[0], 12);
    expect(b.velocity[2]).toBeCloseTo(a.velocity[2], 12);
  });
  it("keeps default launch height exactly 347 mm", () =>
    expect(shooterPose(current).origin[2]).toBe(0.347));
  it("detects thin wall at high speed without tunneling", () =>
    expect(
      segmentBox(
        [-10, 0, 0.1],
        [10, 0, 0.1],
        { min: [0, -1, 0], max: [0.01, 1, 1], name: "wall" },
        0.04,
      ),
    ).toBeCloseTo(0.498));
  it("detects eroded opening and records downward entry", () => {
    const c = config();
    c.field.target.center = [0, 0, 1];
    c.field.target.tilt = 0;
    const f = flight([0, 0, 2], [0, 0, -1], [0, 0, 0], c);
    expect(f.status).toBe("HIT");
    expect(f.entry!.clearance).toBeGreaterThan(0);
    expect(f.entry!.v[2]).toBeLessThan(0);
  });
  it("clips a ball grazing the opening edge", () => {
    const c = config();
    c.field.target.center = [0, 0, 1];
    c.field.target.tilt = 0;
    const f = flight(
      [c.field.target.width / 2 - 0.01, 0, 2],
      [0, 0, -1],
      [0, 0, 0],
      c,
    );
    expect(f.status).toBe("CLIPPED EDGE");
  });
  it("uses the published pentagonal CELL roof rather than a rectangle", () => {
    const t = config().field.target;
    expect(
      targetOpeningClearance(t, [0, t.height / 2 - 0.02], 0),
    ).toBeGreaterThan(0);
    expect(
      targetOpeningClearance(t, [t.width / 2 - 0.01, t.height / 2 - 0.02], 0),
    ).toBeLessThan(0);
  });
  it("places the active CELL on the centered blue HIVE at the published height", () => {
    const f = config().field;
    expect(f.target.center[0]).toBeCloseTo(f.hive.allianceCenterSpacing / 2, 8);
    expect(f.target.center[2]).toBeCloseTo(1.51257, 4);
    expect(f.target.tilt).toBeCloseTo(-Math.PI / 3, 10);
  });
  it("converges under halved maximum step", () => {
    const c = config();
    const a = flight([0, 0, 0.347], [5, 0, 6], [0, 40, 0], c, false);
    c.simulation.maxStep /= 2;
    const b = flight([0, 0, 0.347], [5, 0, 6], [0, 40, 0], c, false);
    expect(norm(sub(a.impact!.p, b.impact!.p))).toBeLessThan(0.0005);
  });
  it("SI conversions preserve inches and inertia", () => {
    expect(3 * inch).toBeCloseTo(0.0762, 12);
    expect(inertiaImperial).toBeCloseTo(0.000292639653, 12);
  });
});
describe("ReCalc empirical reference regression", () => {
  it("preserves calibrated exit, spin, energy, droop and timings", () => {
    const s = simulateShooter(recalc);
    expect(s.speed).toBeCloseTo(7.585, 3);
    expect(s.spin).toBeCloseTo(0, 6);
    expect(s.energy).toBeCloseTo(1.208, 2);
    expect(toRPM(s.drop)).toBeCloseTo(274, 1);
    expect(toRPM(s.postOmega)).toBeCloseTo(1426, 1);
    expect(s.spinup).toBeCloseTo(0.323, 3);
    expect(s.recovery).toBeCloseTo(0.098, 3);
  });
  it("does not invent unknown wheel inertia", () => {
    const s = simulateShooter(current);
    expect(s.storedEnergy).toBeNull();
    expect(s.recovery).toBeNull();
  });
});

it("near-zero spin cancellation cannot produce NaN lift", () => {
  const c = structuredClone(current);
  const f = aerodynamicForces([3, 1, 2], [0, 1e-320, 0], c);
  expect([...f.drag, ...f.lift]).toEqual(
    expect.arrayContaining([expect.any(Number)]),
  );
  expect([...f.drag, ...f.lift].every(Number.isFinite)).toBe(true);
});
it("zero Coulomb friction cannot accelerate the projectile", () => {
  const c = structuredClone(current);
  c.shooter.friction = 0;
  const s = simulateShooter(c);
  expect(s.speed).toBe(c.projectile.initialVelocity);
  expect(s.spin).toBe(c.projectile.spin);
});
it("finite measured wheel inertia produces droop", () => {
  const c = structuredClone(current);
  for (const w of [
    c.shooter.primary,
    c.shooter.secondary,
    ...c.shooter.rollers,
  ]) {
    w.inertiaMode = "custom";
    w.inertia = 0.0001;
  }
  const s = simulateShooter(c);
  expect(s.drop).toBeGreaterThan(0);
  expect(s.storedEnergy).toBeGreaterThan(s.energy + s.rotationalEnergy);
  expect(s.slipLoss).toBeGreaterThanOrEqual(0);
});

it("gear-linked contact preserves shaft ratios while reflecting wheel inertia", () => {
  const c = structuredClone(current);
  c.shooter.link = "gear";
  c.shooter.secondary.ratio = 4.5;
  c.shooter.primary.inertiaMode = "custom";
  c.shooter.primary.inertia = 0.00015;
  c.shooter.secondary.inertiaMode = "custom";
  c.shooter.secondary.inertia = 0.000002;
  for (const w of c.shooter.rollers) {
    w.inertiaMode = "custom";
    w.inertia = 0.000002;
  }
  const s = simulateShooter(c);
  expect(s.drop).toBeGreaterThan(0);
  for (const row of s.trace)
    expect(row.secondaryOmega / row.primaryOmega).toBeCloseTo(4.5, 10);
  expect(Number.isFinite(s.spin)).toBe(true);
});
it("unknown coupled inertia suppresses false recovery and energy predictions", () => {
  const c = structuredClone(current);
  c.shooter.link = "gear";
  c.shooter.primary.inertiaMode = "custom";
  c.shooter.primary.inertia = 0.0002;
  const s = simulateShooter(c);
  expect(s.recovery).toBeNull();
  expect(s.storedEnergy).toBeNull();
});
it("rejects a launch that already overlaps the floor", () => {
  const f = flight([0, 0, 0.001], [3, 0, 4], [0, 0, 0], current);
  expect(f.impact?.t).toBe(0);
  expect(f.status).toBe("COLLIDED BEFORE ENTRY");
});
