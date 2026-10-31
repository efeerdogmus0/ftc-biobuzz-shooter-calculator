import { describe, expect, it } from "vitest";
import { current } from "../presets";
import { simulate, targetBasis, targetWorld } from "../physics/flight";
import { simulateBounceWorld } from "../physics/collisionWorld";
import { advancedBounceDefaults, dampingWork } from "../physics/contactModel";
import { defaultBounce } from "../physics/bounce";
import type { BounceSettings } from "../physics/types";

// Straight into the CELL back wall along the CELL normal, as in the P6 review.
function backWall(speed: number, maxContactStep?: number) {
  const settings = {
    ...defaultBounce,
    ...advancedBounceDefaults,
    shapeModel: "sphere",
    previewTime: 0.5,
    contactModel: "hertz",
    ...(maxContactStep ? { maxContactStep } : {}),
  } as BounceSettings;
  const t = current.field.target,
    n = targetBasis(t).n;
  const shot = simulate(structuredClone(current));
  shot.origin = targetWorld([0, 0, 0.15], t);
  shot.velocity = [-n[0] * speed, -n[1] * speed, -n[2] * speed];
  shot.spin = [0, 0, 0];
  const d = simulateBounceWorld(shot, settings, 0).flight.diagnostics!;
  return { d, kinetic: 0.5 * current.projectile.mass * speed * speed };
}

describe("Hertz damping energy bookkeeping", () => {
  it("counts the exact work of an impulsive damping kick", () => {
    // Unit effective mass, approach 2 m/s, separating impulse 1 N·s → approach 1 m/s.
    // ΔKE = ½(2² − 1²) = 1.5 J = impulse × mean approach.
    expect(dampingWork(1, 2, 1)).toBeCloseTo(1.5, 12);
    // Unloading: negative (reduced) damping impulse while separating still removes energy.
    expect(dampingWork(-0.5, -1, -2)).toBeCloseTo(0.75, 12);
  });

  it.each([10, 40])(
    "closes the energy balance of a %d m/s back-wall hit at the default step",
    (speed) => {
      const { d, kinetic } = backWall(speed);
      // Before the fix: 3.8 % (10 m/s) and 8.0 % (40 m/s) of the impact energy.
      expect(Math.abs(d.energyBalanceError)).toBeLessThan(0.002 * kinetic);
      expect(d.warnings.some((w) => /Enerji bilançosu/.test(w))).toBe(false);
    },
  );

  it("reports a dissipated energy that does not drift with the step size", () => {
    const coarse = backWall(25).d.normalDissipationLoss;
    const fine = backWall(25, 4e-5).d.normalDissipationLoss;
    // Before the fix the default-step estimate was 6 % above the converged value.
    expect(Math.abs(coarse - fine) / fine).toBeLessThan(0.005);
  }, 30_000);

  it("keeps the honest small-overlap warning instead of hiding a large deformation", () => {
    const { d } = backWall(40);
    expect(d.maxOverlap).toBeGreaterThan(
      (current.projectile.diameter / 2) * 0.15,
    );
    expect(d.warnings.some((w) => /%15/.test(w))).toBe(true);
  });
});
