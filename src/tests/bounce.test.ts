import { describe, expect, it } from "vitest";
import { current } from "../presets";
import {
  flight,
  boxNormal,
  targetWorld,
  targetBasis,
  targetLocal,
  simulate,
} from "../physics/flight";
import { rebound, withBounces, defaultBounce } from "../physics/bounce";
import { ballInertia } from "../physics/shooter";
import { dot, norm, scale, sub } from "../physics/math";
import type { Config, Sample, Vec3 } from "../physics/types";
const vacuum = () => {
  const c = structuredClone(current);
  c.field.hiveStructure = false;
  c.aero.cd = 0;
  c.aero.magnus = false;
  c.aero.spinDecay = 0;
  c.field.obstacles = [];
  c.field.target.center = [20, 20, 20];
  return c;
};
const shot = (c: Config, p: Vec3, v: Vec3) => ({
  ...simulate(c),
  origin: p,
  velocity: v,
  spin: [0, 0, 0] as Vec3,
  flight: flight(p, v, [0, 0, 0], c),
});
describe("bounce preview", () => {
  it("matches the restitution rebound speed and ballistic rebound apex", () => {
    const c = vacuum(),
      base = shot(c, [0, 0, 1], [0, 0, -3]);
    const result = withBounces(base, {
      ...defaultBounce,
      floor: 0.7,
      friction: 0,
    });
    const event = result.flight.bounces![0];
    expect(event.outgoing[2]).toBeCloseTo(-0.7 * event.v[2], 8);
    const next = result.flight.bounces![1];
    const samples = result.flight.samples.filter(
      (s) => s.t > event.t && s.t < next.t,
    );
    const apex = Math.max(...samples.map((s) => s.p[2]));
    expect(apex).toBeCloseTo(
      c.projectile.diameter / 2 +
        event.outgoing[2] ** 2 / (2 * c.environment.gravity),
      3,
    );
    expect(result.flight.bounceEnd).toBe("Stopped");
  });
  it("reflects a horizontal wall impact and keeps the direct-shot outcome", () => {
    const c = vacuum(),
      base = shot(c, [1.5, 0, 0.2], [4, 0, 0]);
    const result = withBounces(base, {
      ...defaultBounce,
      wall: 0.6,
      friction: 0,
    });
    const first = result.flight.bounces![0];
    expect(first.surface).toBe("East wall");
    expect(first.outgoing[0]).toBeCloseTo(-2.4, 5);
    expect(first.normal).toEqual([-1, 0, 0]);
    expect(result.flight.status).toBe(base.flight.status);
    expect(result.flight.impact).toBe(base.flight.impact);
    expect(base.flight.bounces).toBeUndefined();
  });
  it("handles tilted CELL bottom in world coordinates without penetrating it", () => {
    const c = vacuum();
    c.field.target = structuredClone(current.field.target);
    const t = c.field.target,
      n = targetBasis(t).n;
    const base = shot(c, targetWorld([0, 0, 0.2], t), scale(n, -8));
    expect(base.flight.collision).toBe("CELL bottom");
    const result = withBounces(base, {
      ...defaultBounce,
      cell: 0.6,
      friction: 0,
    });
    const event = result.flight.bounces![0];
    expect(dot(event.normal, n)).toBeCloseTo(1, 8);
    expect(dot(event.outgoing, n)).toBeGreaterThan(0);
    const next = result.flight.samples.find((s) => s.t > event.t)!;
    expect(targetLocal(next.p, t)[2]).toBeGreaterThan(
      -t.depth + c.projectile.diameter / 2,
    );
    expect(result.flight.status).toBe("HIT");
  });
  it("dissipates total translational and rotational energy for oblique spinning impacts", () => {
    const c = vacuum();
    const hit: Sample = {
      t: 0,
      p: [0, 0, 0.04],
      v: [4, -2, -5],
      spin: [20, -80, 10],
    };
    const response = rebound(hit, [0, 0, 1], 0.7, 0.3, c);
    const energy = (v: Vec3, w: Vec3) =>
      (c.projectile.mass * norm(v) ** 2) / 2 +
      (ballInertia(c) * norm(w) ** 2) / 2;
    expect(energy(response.v, response.spin)).toBeLessThan(
      energy(hit.v, hit.spin),
    );
  });
  it("settles and rolls a shallow shot with finite, strictly increasing times", () => {
    const c = vacuum(),
      result = withBounces(shot(c, [0, 0, 0.1], [0.8, 0, -0.1]), {
        ...defaultBounce,
        floor: 0,
      });
    expect(result.flight.bounceEnd).toBe("Stopped");
    const samples = result.flight.samples;
    expect(norm(samples.at(-1)!.v)).toBe(0);
    expect(
      norm(sub(samples.at(-1)!.p, result.flight.impact!.p)),
    ).toBeGreaterThan(0.1);
    samples.forEach((s, i) => {
      expect([...s.p, ...s.v, ...s.spin, s.t].every(Number.isFinite)).toBe(
        true,
      );
      expect(s.p[2]).toBeGreaterThanOrEqual(c.projectile.diameter / 2 - 1e-8);
      if (i) expect(s.t).toBeGreaterThan(samples[i - 1].t);
    });
  });
  it("bounds perfectly elastic previews by simulation time", () => {
    const c = vacuum();
    const result = withBounces(shot(c, [0, 0, 1], [0, 0, -3]), {
      ...defaultBounce,
      floor: 1,
      friction: 0,
    });
    expect(result.flight.samples.at(-1)!.t).toBeLessThanOrEqual(10.00001);
    expect(result.flight.bounceEnd).toBe("Time limit");
  });
  it("settles a real CELL corner instead of repeated micro-bounces", () => {
    const c = structuredClone(current);
    c.shooter.primary.omega = (1178 * Math.PI) / 30;
    c.shooter.link = "surface";
    c.shooter.surfaceRatio = 1;
    c.shooter.hoodAngle = (70 * Math.PI) / 180;
    c.robot.x = -1.05153;
    c.robot.y = -1.15883;
    c.robot.heading = (40 * Math.PI) / 180;
    c.robot.turretYaw = (-3 * Math.PI) / 180;
    const result = withBounces(simulate(c), defaultBounce);
    expect(result.flight.bounceEnd).toBe("Stopped");
    expect(result.flight.bounces!.length).toBeLessThan(15);
    expect(norm(result.flight.samples.at(-1)!.v)).toBeLessThan(0.02);
  });
  it.each([5, 15, 85, 90])(
    "keeps a %s degree trajectory bounded",
    (degrees) => {
      const c = vacuum(),
        angle = (degrees * Math.PI) / 180;
      const result = withBounces(
        shot(c, [-1, -1, 0.347], [7 * Math.cos(angle), 0, 7 * Math.sin(angle)]),
        defaultBounce,
      );
      expect(result.flight.bounceEnd).not.toBe("Impact limit");
      expect(
        result.flight.samples.every((s) =>
          [...s.p, ...s.v].every(Number.isFinite),
        ),
      ).toBe(true);
      expect(result.flight.samples.at(-1)!.t).toBeLessThanOrEqual(10.00001);
    },
  );
  it("chooses the incoming expanded-box face", () => {
    expect(
      boxNormal(
        [1 - 0.05, 0.5, 0.5],
        [2, 0, 0],
        { min: [1, 0, 0], max: [2, 1, 1], name: "box" },
        0.05,
      ),
    ).toEqual([-1, 0, 0]);
  });
});
