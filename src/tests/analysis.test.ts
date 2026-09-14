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

it("accepts measured curves of arbitrary length and extra rollers", () => {
  const c = structuredClone(current);
  c.shooter.forceCurve = [
    [0, 0],
    [0.005, 12],
    [0.01, 32],
  ];
  c.shooter.rollers.push(structuredClone(c.shooter.secondary));
  expect(parseConfig(c)).toEqual(c);
});
it("rejects duplicate force-curve abscissas and zero motor resistance", () => {
  const c = structuredClone(current);
  c.shooter.forceCurve = [
    [0, 0],
    [0, 3],
  ];
  expect(() => parseConfig(c)).toThrow();
  const d = structuredClone(current);
  d.shooter.motor.resistance = 0;
  expect(() => parseConfig(d)).toThrow();
});
it("recovers a known transfer from synthetic training data and tests held-out data", async () => {
  const { recalc } = await import("../presets");
  const c = structuredClone(recalc);
  c.shooter.transfer = 0.85;
  const rows = [1500, 1700, 1900].map((rpm, i) => {
    c.shooter.primary.omega = (rpm * 2 * Math.PI) / 60;
    return {
      id: `synthetic-test-only-${i}`,
      split: i === 2 ? ("validation" as const) : ("training" as const),
      primaryRPM: rpm,
      secondaryRPM: rpm * 4,
      hoodDeg: 65,
      exitVelocity: simulate(c).shooter.speed,
    };
  });
  const fit = calibrate(
    recalc,
    rows,
    [{ key: "transfer", initial: 1, value: 1, min: 0.1, max: 2 }],
    () => {},
  );
  expect(fit.parameters[0].value).toBeCloseTo(0.85, 3);
  expect(fit.validationRMSE).toBeLessThan(0.002);
  expect(fit.trainingCount).toBe(2);
  expect(fit.validationCount).toBe(1);
});
it("disallows inactive parameters when changing shooter modes", () =>
  expect(() =>
    calibrate(
      current,
      [
        {
          id: "test",
          split: "training",
          primaryRPM: 1400,
          secondaryRPM: 6300,
          hoodDeg: 60,
          exitVelocity: 5,
        },
      ],
      [{ key: "transfer", initial: 1, value: 1, min: 0.1, max: 2 }],
      () => {},
    ),
  ).toThrow("inactive"));
