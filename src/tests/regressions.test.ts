import { it, expect } from "vitest";
import { current } from "../presets";
import { measurementConfig } from "../physics/analysis";
import { simulateShooter, wheelSpeeds } from "../physics/shooter";
import { loadProfiles } from "../state/store";
import { toRPM } from "../utils/units";

it("surface-speed lock on the default preset keeps equal surface speeds", () => {
  const c = structuredClone(current);
  c.shooter.link = "surface";
  const omegas = wheelSpeeds(c);
  const primary = (omegas[0] * c.shooter.primary.diameter) / 2;
  for (const [i, w] of [c.shooter.secondary, ...c.shooter.rollers].entries())
    expect(omegas[i + 1] * w.radius).toBeCloseTo(primary, 9);
  // Equal surface speeds must not produce the 3.75x hood overspeed.
  expect(simulateShooter(c).speed).toBeLessThan(c.simulation.maxSpeed);
});

it("calibration rows drive every hood wheel at the measured secondary speed", () => {
  const row = {
    id: "regression",
    split: "training" as const,
    primaryRPM: 1400,
    secondaryRPM: 2000,
    hoodDeg: 60,
    exitVelocity: 5,
  };
  const q = measurementConfig(current, row);
  const speeds = wheelSpeeds(q).map(toRPM);
  expect(speeds[0]).toBeCloseTo(1400, 6);
  for (const s of speeds.slice(1)) expect(s).toBeCloseTo(2000, 6);
});

it("one malformed saved profile does not discard the others", () => {
  const raw = JSON.stringify([current, { name: "broken" }, current]);
  const profiles = loadProfiles(raw);
  expect(profiles).toHaveLength(2);
  expect(profiles[0].name).toBe(current.name);
  expect(loadProfiles("not json")).toEqual([]);
  expect(loadProfiles(null)).toEqual([]);
});
