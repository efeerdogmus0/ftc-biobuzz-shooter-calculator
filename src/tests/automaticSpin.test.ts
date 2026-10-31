import { describe, expect, it } from "vitest";
import { current } from "../presets";
import { simulate } from "../physics/flight";
import { simulateShooter, spinVector } from "../physics/shooter";
import { launchInertia, bodyInertia } from "../physics/launchDynamics";
import { advancedBounceDefaults } from "../physics/contactModel";
import { defaultBounce } from "../physics/bounce";
import { simulateBounceWorld } from "../physics/collisionWorld";
import { dot, norm, sub } from "../physics/math";
import { eulerRotation, tensor } from "../physics/rigidMath";

const settings = {
  ...defaultBounce,
  ...advancedBounceDefaults,
  previewTime: 0.5,
};
const launch = (c = structuredClone(current)) =>
  simulate(c, launchInertia(c, settings));
describe("automatic shooter spin", () => {
  it("responds to wheel RPM, hood speed ratio and wheel diameter", () => {
    const base = launch();
    for (const adjust of [
      (c: typeof current) => {
        c.shooter.primary.omega *= 1.4;
      },
      (c: typeof current) => {
        c.shooter.secondary.ratio = 2.5;
      },
      (c: typeof current) => {
        c.shooter.primary.diameter *= 0.8;
      },
    ]) {
      const c = structuredClone(current);
      adjust(c);
      expect(
        Math.abs(launch(c).shooter.spin - base.shooter.spin),
      ).toBeGreaterThan(0.01);
    }
  });
  it("cannot generate spin without friction even if a legacy profile supplies it", () => {
    const c = structuredClone(current);
    c.projectile.spin = 500;
    c.shooter.friction = 0;
    const result = launch(c);
    expect(result.shooter.spin).toBe(0);
    expect(result.shooter.speed).toBe(c.projectile.initialVelocity);
    expect(result.spin).toEqual([0, -0, 0]);
  });
  it("does not use legacy profile spin to override the shooter result", () => {
    const c = structuredClone(current),
      before = launch(c);
    c.projectile.spin = -1000;
    const after = launch(c);
    expect(after.shooter).toEqual(before.shooter);
    expect(after.spin).toEqual(before.spin);
  });
  it("uses the same shell rotational energy at the wheel exit and world launch", () => {
    const c = structuredClone(current),
      shot = launch(c),
      result = simulateBounceWorld(shot, settings),
      sample = result.flight.samples[0],
      inertia = tensor(
        sample.rotation!,
        result.flight.pollenInertia!,
        sample.spin,
      );
    expect(sample.spin).toEqual(shot.spin);
    expect(sample.v).toEqual(shot.velocity);
    expect(dot(sample.spin, inertia) / 2).toBeCloseTo(
      shot.shooter.rotationalEnergy,
      10,
    );
    expect(result.shooter.spin).toBe(shot.shooter.trace.at(-1)!.spin);
  });
  it("honors measured inertia and distinguishes the shell during transient wheel contact", () => {
    const c = structuredClone(current);
    c.shooter.maxContactTime = 0.002;
    const shell = launch(c),
      solidI = 0.4 * c.projectile.mass * (c.projectile.diameter / 2) ** 2;
    expect(launchInertia(c, settings)).toBeGreaterThan(solidI);
    c.projectile.inertia = solidI;
    expect(launchInertia(c, settings)).toBeCloseTo(solidI, 12);
    expect(bodyInertia(c, settings)).toEqual([solidI, solidI, solidI]);
    expect(launch(c).shooter.spin).toBeCloseTo(simulateShooter(c).spin, 10);
    expect(launch(c).shooter.speed).toBeCloseTo(simulateShooter(c).speed, 10);
    expect(
      Math.abs(shell.shooter.spin - launch(c).shooter.spin),
    ).toBeGreaterThan(0.001);
  });
  it("rotates the automatic spin axis with the turret and preserves the axial energy", () => {
    const c = structuredClone(current),
      oriented = {
        ...settings,
        orientation: [0.2, 0.7, -0.3] as [number, number, number],
      };
    c.robot.turretYaw += 0.9;
    const shot = simulate(c, launchInertia(c, oriented)),
      axis = spinVector(c.robot.heading + c.robot.turretYaw, 1),
      angularMomentum = tensor(
        eulerRotation(oriented.orientation),
        bodyInertia(c, oriented),
        shot.spin,
      );
    expect(
      norm(
        sub(shot.spin, axis.map((v) => v * shot.shooter.spin) as typeof axis),
      ),
    ).toBeLessThan(1e-10);
    expect(dot(shot.spin, angularMomentum) / 2).toBeCloseTo(
      shot.shooter.rotationalEnergy,
      10,
    );
  });
});
