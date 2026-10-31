import { describe, it, expect } from "vitest";
import { current } from "../presets";
import {
  simulate,
  flight,
  sampleAt,
  targetBasis,
  targetWorld,
} from "../physics/flight";
import {
  simulateBounceWorld,
  residentPositions,
} from "../physics/collisionWorld";
import { advancedBounceDefaults } from "../physics/contactModel";
import { defaultBounce } from "../physics/bounce";
import {
  createHive,
  hiveVelocity,
  hiveTarget,
  hivePoint,
  sampleHive,
} from "../physics/hiveDynamics";
import { pollenHoleAxes, pollenHoleRatio } from "../physics/pollenGeometry";
import { shapeSupport, holeAxes, pollenInertia } from "../physics/pollenShape";
import { eulerRotation, identity, rotate, tensor } from "../physics/rigidMath";
import { dot, norm, sub, scale, add, cross } from "../physics/math";
import { residentPlayback } from "../utils/residentPlayback";
import type { BounceSettings, Vec3 } from "../physics/types";
const settings: BounceSettings = {
  ...defaultBounce,
  ...advancedBounceDefaults,
  shapeModel: "sphere",
  previewTime: 5,
  contactModel: "rigid",
};
function away() {
  const c = structuredClone(current),
    s = simulate(c);
  s.origin = [-1.2, -1.2, 0.1];
  s.velocity = [-0.1, 0, 0];
  s.spin = [0, 0, 0];
  s.flight = flight(s.origin, s.velocity, s.spin, c);
  return s;
}
describe("coupled hinge and perforated POLLEN", () => {
  it("transfers an impact to the hinge and conserves angular momentum about its free axis", () => {
    const c = structuredClone(current);
    c.environment.gravity = 0;
    c.aero.cd = 0;
    c.aero.magnus = false;
    c.aero.spinDecay = 0;
    c.field.obstacles = [];
    const cfg = {
      ...settings,
      hiveInitialAngle: Math.PI / 6,
      hiveDamping: 0,
      hiveInertia: 0.03,
      rollingResistance: 0,
      spinResistance: 0,
      surfaceFriction: { cell: 0 },
      previewTime: 0.5,
    };
    const hinge = createHive(c, cfg),
      target = hiveTarget(c, hinge),
      n = targetBasis(target).n,
      r = c.projectile.diameter / 2,
      shot = simulate(c);
    shot.origin = targetWorld([0, 0, -target.depth + r + 0.006], target);
    shot.velocity = scale(n, -2);
    shot.spin = [0, 0, 0];
    const moving = simulateBounceWorld(shot, cfg);
    const body = sampleAt(moving.flight.samples, 0.02),
      h = sampleHive(moving.flight.hiveTrack!, 0.02)!;
    expect(Math.abs(h.omega)).toBeGreaterThan(0.02);
    const angular = (p: Vec3, v: Vec3, spin: Vec3) =>
      dot(cross(sub(p, hinge.pivot), scale(v, c.projectile.mass)), hinge.axis) +
      0.4 * c.projectile.mass * r * r * dot(spin, hinge.axis);
    expect(
      Math.abs(
        angular(body.p, body.v, body.spin) +
          cfg.hiveInertia * h.omega -
          angular(shot.origin, shot.velocity, shot.spin),
      ),
    ).toBeLessThan(1e-4);
    const fixed = structuredClone(shot);
    fixed.config.field.target = target;
    const fixedResult = simulateBounceWorld(fixed, {
      ...cfg,
      hiveMotion: false,
      hiveInitialAngle: 0,
    });
    expect(
      norm(sub(body.v, sampleAt(fixedResult.flight.samples, 0.02).v)),
    ).toBeGreaterThan(0.02);
  });
  it("preserves torque-free world spin momentum for an asymmetric shell", () => {
    const c = structuredClone(current);
    c.environment.gravity = 0;
    c.aero.cd = 0;
    c.aero.magnus = false;
    c.aero.spinDecay = 0;
    c.field.obstacles = [];
    const shot = simulate(c);
    shot.origin = [-1, -1, 1.5];
    shot.velocity = [0, 0, 0];
    shot.spin = [15, 30, 5];
    const result = simulateBounceWorld(shot, {
      ...settings,
      hiveMotion: false,
      shapeModel: "pollen",
      asphericity: 0.04,
      previewTime: 0.5,
    });
    const diag = result.flight.pollenInertia!,
      first = result.flight.samples[0],
      last = result.flight.samples.at(-1)!;
    const a = tensor(first.rotation!, diag, first.spin),
      b = tensor(last.rotation!, diag, last.spin);
    expect(norm(sub(a, b))).toBeLessThan(1e-7);
    const initialEnergy = dot(first.spin, a) / 2,
      finalEnergy = dot(last.spin, b) / 2;
    expect(Math.abs(finalEnergy - initialEnergy) / initialEnergy).toBeLessThan(
      0.005,
    );
  });
  it("retains hinge distances and reverses which CELL faces upward", () => {
    const c = structuredClone(current),
      h = createHive(c, settings),
      t = c.field.target;
    expect(targetBasis(hiveTarget(c, h)).n[2]).toBeGreaterThan(0);
    expect(targetBasis(hiveTarget(c, h, true)).n[2]).toBeLessThan(0);
    h.angle = h.travel;
    expect(norm(sub(hivePoint(h, t.center), h.pivot))).toBeCloseTo(
      norm(sub(t.center, h.pivot)),
      10,
    );
    expect(targetBasis(hiveTarget(c, h)).n[2]).toBeLessThan(0);
    expect(targetBasis(hiveTarget(c, h, true)).n[2]).toBeGreaterThan(0);
    h.omega = 2;
    const p = add(h.pivot, [0, 0.3, 0.1]);
    expect(norm(sub(hiveVelocity(h, p), [0, -0.2, 0.6]))).toBeLessThan(1e-12);
  });
  it("keeps seven settled POLLEN below the calibration threshold", () => {
    const result = simulateBounceWorld(away(), settings, 7);
    expect(
      Math.max(...result.flight.hiveTrack!.map((s) => s.angle)),
    ).toBeLessThan(0.04);
    expect(result.flight.hiveTips).toHaveLength(0);
  }, 20000);
  it("tips with eight residents through contact torque rather than a count switch", () => {
    const shot = away(),
      result = simulateBounceWorld(shot, settings, 8);
    expect(residentPositions(shot.config, 8, "center")).toHaveLength(8);
    expect(result.flight.hiveTips!.length).toBeGreaterThan(0);
    expect(
      Math.max(...result.flight.hiveTrack!.map((s) => s.angle)),
    ).toBeGreaterThan(0.95);
    expect(
      result.flight.ballTracks!.every((t) =>
        t.samples.every((s) => [...s.p, ...s.spin].every(Number.isFinite)),
      ),
    ).toBe(true);
    const tipTime = result.flight.hiveTips![0].t,
      residents = result.flight.ballTracks!.slice(1),
      duration = result.flight.samples.at(-1)!.t;
    // Tipping does not attach or teleport the balls. All eight subsequently
    // leave the CELL and have their own descending arc and floor response.
    expect(result.flight.retainedResidents).toBe(0);
    for (const track of residents) {
      expect(track.samples.at(-1)!.t).toBe(duration);
      expect(track.samples.some((s) => s.t > tipTime && s.v[2] < -0.5)).toBe(
        true,
      );
      const floor = result.flight.worldEvents!.find(
        (e) => e.ballId === track.id && e.surface === "Floor" && e.t > tipTime,
      );
      expect(floor).toBeDefined();
      expect(floor!.v[2]).toBeLessThan(0);
      expect(floor!.outgoing[2]).toBeGreaterThanOrEqual(-0.01);
    }
    expect(residentPlayback(result, 0).filter((b) => b.inside)).toHaveLength(8);
    expect(
      residentPlayback(result, duration).every(
        (b) => b.reachedFloor && !b.inside,
      ),
    ).toBe(true);
  }, 20000);
  it("couples perforated shells and compliant contacts to the moving HIVE without non-finite states", () => {
    const result = simulateBounceWorld(
      away(),
      {
        ...settings,
        shapeModel: "pollen",
        contactModel: "hertz",
        previewTime: 2,
      },
      8,
    );
    expect(result.flight.hiveTips!.length).toBeGreaterThan(0);
    expect(
      result.flight.hiveTrack!.every((h) =>
        [h.angle, h.omega, h.loadTorque].every(Number.isFinite),
      ),
    ).toBe(true);
    expect(
      result.flight.ballTracks!.every((t) =>
        t.samples.every((s) => [...s.p, ...s.spin].every(Number.isFinite)),
      ),
    ).toBe(true);
  }, 30000);
  it("moves contact support from a missing hole to its rim without arbitrary spin at its center", () => {
    const s = { ...settings, shapeModel: "pollen" as const, asphericity: 0 },
      h = holeAxes(s),
      n = h[0];
    expect(pollenHoleAxes).toHaveLength(26);
    const support = shapeSupport(n, identity, 1, s, h);
    expect(support).toHaveLength(3);
    support.forEach((p) => {
      expect(dot(p, n)).toBeCloseTo(Math.sqrt(1 - pollenHoleRatio ** 2), 7);
      expect(norm(p)).toBeCloseTo(1, 7);
    });
    const centroid = scale(
      support.reduce((a, b) => add(a, b), [0, 0, 0] as Vec3),
      1 / 3,
    );
    expect(norm(sub(centroid, scale(n, dot(centroid, n))))).toBeLessThan(1e-8);
    const q = eulerRotation([0.3, 0.6, -0.9]),
      rotated = shapeSupport(rotate(q, n), q, 1, s, h);
    expect(dot(rotated[0], rotate(q, n))).toBeCloseTo(dot(support[0], n), 7);
  });
  it("uses shell mass distribution and changes an oblique rebound with orientation and spin", () => {
    const c = structuredClone(current),
      r = c.projectile.diameter / 2;
    const s = {
      ...settings,
      shapeModel: "pollen" as const,
      hiveMotion: false,
      asphericity: 0.025,
      previewTime: 0.6,
    };
    const diag = pollenInertia(c.projectile.mass, r, s, holeAxes(s));
    expect(
      diag.every(
        (v) =>
          v > 0.5 * c.projectile.mass * r * r &&
          v < 0.8 * c.projectile.mass * r * r,
      ),
    ).toBe(true);
    const shot = away();
    shot.origin = [-1, -1, 0.3];
    shot.velocity = [1, 0, -1];
    shot.spin = [0, 0, 0];
    const a = simulateBounceWorld(shot, {
      ...s,
      orientation: [0, 0, 0],
    });
    shot.spin = [0, 30, 0];
    const b = simulateBounceWorld(shot, {
      ...s,
      orientation: [0.4, 0.8, 0.2],
    });
    const va = sampleAt(a.flight.samples, 0.4),
      vb = sampleAt(b.flight.samples, 0.4);
    expect(norm(sub(va.v, vb.v))).toBeGreaterThan(0.05);
    b.flight.pollenInertia!.forEach((value, i) =>
      expect(value).toBeCloseTo(diag[i], 14),
    );
    expect(
      dot(vb.spin, tensor(vb.rotation!, diag, vb.spin)),
    ).toBeGreaterThanOrEqual(0);
  }, 10000);
});
