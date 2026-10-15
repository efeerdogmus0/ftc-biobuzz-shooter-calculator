import { it, expect } from "vitest";
import {
  legacyDistanceIn,
  legacyExcludedPositions,
  legacyFormulas,
  legacyHood,
  legacyLookupTable,
  legacyRPM,
  legacyShots,
} from "../data/legacy2025";
import { current, zaganos2025 } from "../presets";
import { simulateShooter } from "../physics/shooter";
import { parseConfig } from "../utils/config";
import { rpm, toRPM } from "../utils/units";

it("keeps every row of the measurement sheet", () => {
  // ÖLÇÜMLER SAHA FTC.ods Sheet1: rows 2-50; the analysis drops position 2,2.
  expect(legacyShots).toHaveLength(49);
  expect(legacyShots.map((s) => s.odsRow)).toEqual(
    Array.from({ length: 49 }, (_, i) => i + 2),
  );
  const used = legacyShots.filter(
    (s) => !legacyExcludedPositions.includes(s.position),
  );
  expect(used).toHaveLength(46);
  expect(new Set(used.map((s) => s.position)).size).toBe(7);
});

it("lookup table is reproduced from the raw rows", () => {
  expect(legacyLookupTable).toHaveLength(41);
  const groups = new Map<string, number[]>();
  for (const s of legacyShots) {
    if (legacyExcludedPositions.includes(s.position)) continue;
    const key = `${legacyDistanceIn(s.position).toFixed(1)}|${s.hoodDeg.toFixed(1)}`;
    groups.set(key, [...(groups.get(key) ?? []), s.actualRPM]);
  }
  const derived = [...groups].map(([key, rpm]) => {
    const [d, h] = key.split("|").map(Number);
    return [d, h, Math.min(...rpm), Math.max(...rpm)];
  });
  const sort = (rows: number[][]) =>
    [...rows].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  expect(sort(derived)).toEqual(sort(legacyLookupTable));
});

it("fitted formulas are ordered and monotonic over the measured range", () => {
  const [d0, d1] = legacyFormulas.validDistanceIn;
  for (let d = d0; d <= d1; d += 0.5) {
    expect(legacyRPM(d, "min")).toBeLessThan(legacyRPM(d, "mean"));
    expect(legacyRPM(d, "mean")).toBeLessThan(legacyRPM(d, "max"));
    expect(legacyRPM(d + 0.5)).toBeGreaterThan(legacyRPM(d));
    // Mean and min hood fits rise across the range. The max fit peaks at
    // ~146.5 in, so it is deliberately not asserted monotonic.
    expect(legacyHood(d + 0.5)).toBeGreaterThan(legacyHood(d));
    expect(legacyHood(d + 0.5, "min")).toBeGreaterThan(legacyHood(d, "min"));
  }
  // The mean RPM line stays close to the measured hits (ALL_FORMULAS RMSE 117).
  const used = legacyShots.filter(
    (s) => !legacyExcludedPositions.includes(s.position),
  );
  const rmse = Math.sqrt(
    used.reduce(
      (sum, s) =>
        sum + (legacyRPM(legacyDistanceIn(s.position)) - s.actualRPM) ** 2,
      0,
    ) / used.length,
  );
  expect(rmse).toBeCloseTo(117.1, 0);
});

it("Zağanos preset is a valid passive-hood profile with backspin", () => {
  expect(parseConfig(JSON.parse(JSON.stringify(zaganos2025)))).toEqual(
    zaganos2025,
  );
  expect(zaganos2025.shooter.topology).toBe("passive");
  expect(zaganos2025.shooter.rollers).toHaveLength(0);
  const s = simulateShooter(zaganos2025);
  expect(s.surfaceSpeeds[1]).toBe(0);
  expect(toRPM(s.spin)).toBeGreaterThan(500);
});

it("powered BIOBUZZ hood at near-matched surface speed has little spin", () => {
  const powered = toRPM(simulateShooter(current).spin);
  const passive = structuredClone(current);
  passive.shooter.topology = "passive";
  passive.shooter.rollers = [];
  passive.shooter.secondary.contactEnd = 1;
  expect(Math.abs(powered)).toBeLessThan(
    0.1 * toRPM(simulateShooter(passive).spin),
  );
});

it("Zağanos exit speed rises with wheel RPM near the passive rolling limit", () => {
  const out = [3700, 4700, 5800].map((value) => {
    const c = structuredClone(zaganos2025);
    c.shooter.primary.omega = rpm(value);
    const s = simulateShooter(c);
    const surface = (c.shooter.primary.omega * c.shooter.primary.diameter) / 2;
    return s.speed / surface;
  });
  for (const ratio of out) expect(ratio).toBeGreaterThan(0.48);
});
