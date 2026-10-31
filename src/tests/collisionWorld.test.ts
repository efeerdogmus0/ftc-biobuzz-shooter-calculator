import { describe, it, expect } from "vitest";
import { current } from "../presets";
import {
  simulate,
  flight,
  targetWorld,
  targetBasis,
  targetLocal,
} from "../physics/flight";
import {
  pairImpulse,
  sphereBoxContact,
  residentPositions,
  simulateBounceWorld,
  inCell,
  placementError,
} from "../physics/collisionWorld";
import { defaultBounce } from "../physics/bounce";
import { ballInertia } from "../physics/shooter";
import { add, scale, sub, norm, dot } from "../physics/math";
import type { Sample, Vec3 } from "../physics/types";
const config = () => structuredClone(current);
const settings = { ...defaultBounce, ball: 0.55 };
describe("coupled CELL collision world", () => {
  it("transfers head-on momentum to the resident sphere, with analytic restitution", () => {
    const c = config(),
      a = { v: [4, 0, 0] as Vec3, spin: [0, 0, 0] as Vec3 },
      b = { v: [0, 0, 0] as Vec3, spin: [0, 0, 0] as Vec3 };
    const response = pairImpulse(a, b, [-1, 0, 0], 0.6, 0, c);
    expect(response.a.v[0]).toBeCloseTo(0.8, 8);
    expect(response.b.v[0]).toBeCloseTo(3.2, 8);
    expect(response.a.v[0] + response.b.v[0]).toBeCloseTo(4, 8);
  });
  it("conserves linear momentum and dissipates total kinetic energy in oblique spinning pair contact", () => {
    const c = config(),
      a = { v: [4, 2, 0] as Vec3, spin: [0, 0, 30] as Vec3 },
      b = { v: [-1, 0, 0] as Vec3, spin: [0, 0, -20] as Vec3 };
    const response = pairImpulse(a, b, [-1, 0, 0], 0.6, 0.2, c);
    const energy = (body: typeof a) =>
      (c.projectile.mass * norm(body.v) ** 2) / 2 +
      (ballInertia(c) * norm(body.spin) ** 2) / 2;
    expect(
      norm(sub(add(response.a.v, response.b.v), add(a.v, b.v))),
    ).toBeLessThan(1e-10);
    expect(energy(response.a) + energy(response.b)).toBeLessThan(
      energy(a) + energy(b),
    );
  });
  it("uses diagonal normals at box corners rather than an inflated-box face", () => {
    const contact = sphereBoxContact(
      [1.03, 1.03, 0.5],
      { min: [0, 0, 0], max: [1, 1, 1], name: "corner" },
      0.05,
    )!;
    expect(contact.normal[0]).toBeCloseTo(Math.SQRT1_2, 8);
    expect(contact.normal[1]).toBeCloseTo(Math.SQRT1_2, 8);
    expect(
      sphereBoxContact(
        [1.04, 1.04, 0.5],
        { min: [0, 0, 0], max: [1, 1, 1], name: "corner" },
        0.05,
      ),
    ).toBeNull();
  });
  it.each([0, 1, 2, 3, 4, 5, 6, 7])(
    "places %i residents without overlap inside the tilted CELL",
    (count) => {
      const c = config(),
        points = residentPositions(c, count, "center");
      expect(points.length).toBe(count);
      for (let i = 0; i < points.length; i++) {
        expect(inCell(points[i], c)).toBe(true);
        for (let j = 0; j < i; j++)
          expect(norm(sub(points[i], points[j]))).toBeGreaterThan(
            c.projectile.diameter,
          );
      }
    },
  );
  it("rejects oversized balls instead of spawning an impossible scenario", () => {
    const c = config();
    c.projectile.diameter = 0.4;
    expect(() => residentPositions(c, 7, "center")).toThrow(/sığmıyor/);
  });
  it("keeps seven residents in the CELL when the shot flies away and returns finite synchronized tracks", () => {
    const c = config(),
      base = simulate(c);
    base.origin = [-1.2, -1.2, 0.4];
    base.velocity = [-1, 0, 1];
    base.spin = [0, 0, 0];
    base.flight = flight(base.origin, base.velocity, base.spin, c);
    const result = simulateBounceWorld(base, settings, 7);
    expect(result.flight.ballTracks!.length).toBe(8);
    expect(result.flight.retainedResidents).toBe(7);
    expect(result.flight.retainedShot).toBe(false);
    const end = result.flight.samples.at(-1)!.t;
    for (const track of result.flight.ballTracks!) {
      expect(track.samples.at(-1)!.t).toBe(end);
      track.samples.forEach((sample: Sample, i) => {
        expect(
          [...sample.p, ...sample.v, ...sample.spin, sample.t].every(
            Number.isFinite,
          ),
        ).toBe(true);
        if (i) expect(sample.t).toBeGreaterThan(track.samples[i - 1].t);
      });
    }
  });
  it("responds to actual ball impacts rather than using residents as immovable obstacles", () => {
    const c = config(),
      positions = residentPositions(c, 1, "center");
    const base = simulate(c);
    base.origin = add(positions[0], [-0.22, 0, 0.008]);
    base.velocity = [4, 0, 0];
    base.spin = [0, 0, 0];
    base.flight = flight(base.origin, base.velocity, base.spin, c);
    const result = simulateBounceWorld(base, settings, 1);
    expect(
      result.flight.bounces!.some(
        (e) => e.surface === "Ball" && e.otherBallId === 1,
      ),
    ).toBe(true);
    const resident = result.flight.ballTracks![1];
    expect(Math.max(...resident.samples.map((s) => norm(s.v)))).toBeGreaterThan(
      0.15,
    );
    expect(result.flight.status).toBe(base.flight.status);
  });
  it("reflects a tilted CELL face along the correct world-space normal", () => {
    const c = config(),
      n = targetBasis(c.field.target).n,
      base = simulate(c);
    base.origin = targetWorld([0, 0, 0.1], c.field.target);
    base.velocity = scale(n, -8);
    base.spin = [0, 0, 0];
    base.flight = flight(base.origin, base.velocity, base.spin, c);
    const result = simulateBounceWorld(base, { ...settings, friction: 0 }, 0);
    const bottom = result.flight.bounces!.find(
      (e) => e.surface === "CELL bottom",
    )!;
    expect(bottom).toBeTruthy();
    expect(dot(bottom.normal, n)).toBeCloseTo(1, 5);
    expect(dot(bottom.outgoing, n)).toBeGreaterThan(0);
  });
  it("reports relative ball-pair approach and separation rather than absolute angles", () => {
    const c = config(),
      base = simulate(c),
      position = residentPositions(c, 1, "center")[0];
    base.origin = add(position, [-0.22, 0, 0.008]);
    base.velocity = [4, 0, 0];
    base.spin = [0, 0, 0];
    const result = simulateBounceWorld(base, settings, 1);
    const contact = result.flight.bounces!.find((e) => e.surface === "Ball")!;
    expect(contact.relativeIncoming).toBeDefined();
    expect(dot(contact.relativeIncoming!, contact.normal)).toBeLessThan(0);
    expect(
      dot(contact.relativeOutgoing!, contact.normal),
    ).toBeGreaterThanOrEqual(-1e-8);
    const frame = result.flight.samples.find(
      (s) => Math.abs(s.t - contact.t) < 1e-9,
    );
    expect(frame).toBeDefined();
    expect(
      result.flight.samples.some(
        (s) => Math.abs(s.t - (contact.t - 1e-6)) < 1e-9,
      ),
    ).toBe(true);
  });
  it("bounces from the sloped pentagonal roof rather than a rectangular back wall", () => {
    const c = config();
    c.environment.gravity = 0;
    c.aero.cd = 0;
    c.aero.magnus = false;
    const basis = targetBasis(c.field.target),
      base = simulate(c);
    base.origin = targetWorld(
      [c.field.target.width / 4, -0.02, -0.15],
      c.field.target,
    );
    base.velocity = scale(basis.v, 3);
    base.spin = [0, 0, 0];
    const result = simulateBounceWorld(base, { ...settings, friction: 0 }, 0);
    const roof = result.flight.bounces!.find(
      (e) => e.surface === "CELL roof right",
    )!;
    expect(roof).toBeTruthy();
    expect(dot(roof.normal, basis.u)).toBeLessThan(-0.2);
    expect(dot(roof.normal, basis.v)).toBeLessThan(-0.2);
    expect(dot(roof.outgoing, roof.normal)).toBeGreaterThan(0);
  });
  it("bounds vacuum floor rebound error by the contact timestep", () => {
    const c = config();
    c.aero.cd = 0;
    c.aero.magnus = false;
    c.field.obstacles = [];
    c.field.target.center = [20, 20, 20];
    const base = simulate(c);
    base.origin = [0, 0, 1];
    base.velocity = [0, 0, 0];
    base.spin = [0, 0, 0];
    const result = simulateBounceWorld(base, settings, 0),
      event = result.flight.bounces![0];
    const expected = Math.sqrt(
      2 * c.environment.gravity * (1 - c.projectile.diameter / 2),
    );
    expect(event.surface).toBe("Floor");
    expect(Math.abs(norm(event.v) - expected)).toBeLessThan(
      c.environment.gravity * 0.002 + 1e-6,
    );
    expect(event.outgoing[2]).toBeCloseTo(-event.restitution! * event.v[2], 8);
  });
  it("accepts explicit manual positions without substituting a grid", () => {
    const c = config(),
      local = residentPositions(c, 7, "center").map((p) =>
        targetLocal(p, c.field.target),
      );
    local[0] = [-0.108, local[0][1], local[0][2] + 0.075];
    expect(placementError(c, local)).toBeNull();
    expect(residentPositions(c, 7, "manual", local)[0]).toEqual(
      targetWorld(local[0], c.field.target),
    );
  });
  it("rejects overlapping or out-of-bounds manual balls before simulation", () => {
    const c = config(),
      local = residentPositions(c, 2, "center").map((p) =>
        targetLocal(p, c.field.target),
      );
    local[1] = [...local[0]];
    expect(placementError(c, local)).toMatch(/üst üste/);
    expect(() => residentPositions(c, 2, "manual", local)).toThrow(/üst üste/);
    local[1] = [2, 0, 0];
    expect(placementError(c, local)).toMatch(/dışına/);
  });
  it("lays the example out as one row without compressing seven balls", () => {
    const c = config(),
      local = residentPositions(c, 7, "center").map((p) =>
        targetLocal(p, c.field.target),
      );
    expect(
      Math.max(...local.map((p) => p[1])) - Math.min(...local.map((p) => p[1])),
    ).toBeLessThan(1e-9);
    expect(
      Math.max(...local.map((p) => p[2])) - Math.min(...local.map((p) => p[2])),
    ).toBeLessThan(1e-9);
    for (let i = 1; i < 7; i++)
      expect(norm(sub(local[i], local[i - 1]))).toBeGreaterThan(
        c.projectile.diameter,
      );
  });
  it("settles a manual pile with geometry distinct from the row example", () => {
    const c = config(),
      row = residentPositions(c, 7, "center"),
      local = row.map((p) => targetLocal(p, c.field.target));
    local[0] = [-0.108, local[0][1], local[0][2] + 0.075];
    const result = simulateBounceWorld(
      simulate(c),
      settings,
      7,
      "manual",
      local,
    );
    expect(result.flight.ballTracks!.length).toBe(8);
    expect(
      norm(sub(result.flight.ballTracks![1].samples[0].p, row[0])),
    ).toBeGreaterThan(0.04);
  }, 20000);
  it("computes deterministic trajectories for a fixed layout and material set", () => {
    const c = config(),
      base = simulate(c);
    const a = simulateBounceWorld(base, settings, 3, "left"),
      b = simulateBounceWorld(base, settings, 3, "left");
    expect(a.flight.ballTracks).toEqual(b.flight.ballTracks);
  }, 20000);
});
