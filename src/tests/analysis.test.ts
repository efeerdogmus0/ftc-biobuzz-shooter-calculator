import { it, expect } from "vitest";
import { current } from "../presets";
import {
  solve,
  monteCarlo,
  defaultUncertainty,
  calibrate,
  coverage,
} from "../physics/analysis";
import { aim, simulate } from "../physics/flight";
import { parseConfig } from "../utils/config";
it("solver returns physically checked volume-entry candidates", () => {
  const c = structuredClone(current);
  const candidates = solve(c);
  expect(candidates.length).toBeGreaterThan(0);
  for (const v of candidates) {
    const q = aim(c);
    q.shooter.hoodAngle = v.angle;
    q.shooter.primary.omega = v.omega;
    const shot = simulate(q);
    expect(shot.flight.status).toBe("HIT");
    expect(shot.shooter.speed).toBeLessThanOrEqual(c.simulation.maxSpeed);
  }
});
it("profiles round trip and reject nonphysical inputs", () => {
  expect(parseConfig(JSON.parse(JSON.stringify(current)))).toEqual(current);
  const c = structuredClone(current);
  c.projectile.mass = 0;
  expect(() => parseConfig(c)).toThrow();
});
it("Monte Carlo is reproducible", () => {
  const a = monteCarlo(current, 10, defaultUncertainty, 42, () => {});
  const b = monteCarlo(current, 10, defaultUncertainty, 42, () => {});
  expect(a).toEqual(b);
});
it("calibration rejects an empty dataset", () =>
  expect(() => calibrate(current, [], [], () => {})).toThrow());
it("coverage worker kernel reports every sampled point", () => {
  const c = structuredClone(current);
  c.field.size = 1;
  const cells = coverage(c, 0.5, () => {});
  expect(cells.length).toBeGreaterThan(0);
}, 30000);
