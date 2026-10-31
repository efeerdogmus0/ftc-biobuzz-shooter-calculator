import { describe, expect, it } from "vitest";
import { current } from "../presets";
import { measurementConfig, type Measurement } from "../physics/analysis";
import {
  simulateShooter,
  wheelSpeeds,
  motorOperatingPoint,
  motorRecovery,
} from "../physics/shooter";
import { simulate, flight, sampleAt, targetWorld } from "../physics/flight";
import { defaultScenario } from "../utils/scenario";
import {
  bodyInertia,
  launchInertia,
  shotKineticEnergy,
} from "../physics/launchDynamics";
import {
  simulateBounceWorld,
  residentPositions,
  inCell,
} from "../physics/collisionWorld";
import {
  createHive,
  hiveTarget,
  hivePoint,
  hiveVector,
  sampleHive,
} from "../physics/hiveDynamics";
import { residentPlayback } from "../utils/residentPlayback";
import { hiveExtraSolids, hitsExtraSolids } from "../physics/shotStudy";
import {
  hiveStructureSolids,
  structureContact,
  sweepStructure,
} from "../field/hiveStructure";
import { parseConfig } from "../utils/config";
import { norm, sub, scale, add, dot, cross } from "../physics/math";
import { tensor } from "../physics/rigidMath";
import type { Config, Vec3 } from "../physics/types";

const defaults = defaultScenario().bounceSettings;
const simple = {
  ...defaults,
  shapeModel: "sphere" as const,
  inertiaModel: "solid" as const,
  hiveMotion: false,
  previewTime: 0.5,
  friction: 0,
  rollingResistance: 0,
  spinResistance: 0,
  surfaceFriction: { floor: 0, wall: 0, cell: 0, ball: 0 },
};
function vacuum() {
  const c = structuredClone(current);
  c.environment.gravity = 0;
  c.environment.density = 0;
  c.aero.cd = 0;
  c.aero.magnus = false;
  c.aero.spinDecay = 0;
  c.simulation.maxTime = 0.5;
  return c;
}
function launch(c: Config, p: Vec3, v: Vec3, spin: Vec3 = [0, 0, 0]) {
  const s = simulate(c);
  s.origin = p;
  s.velocity = v;
  s.spin = spin;
  s.flight = flight(p, v, spin, c);
  return s;
}
function independent() {
  const c = structuredClone(current);
  c.shooter.link = "independent";
  [c.shooter.primary, c.shooter.secondary, ...c.shooter.rollers].forEach(
    (w, i) => {
      w.omega = ([1450, 5500, 1000, 2000][i] * Math.PI) / 30;
      w.inertiaMode = "disk";
      w.mass = i === 0 ? 0.2 : 0.03;
    },
  );
  return c;
}
const row: Measurement = {
  id: "separate hood drives",
  split: "training",
  primaryRPM: 1450,
  secondaryRPM: 5500,
  hoodDeg: 65,
};

describe("independent calibration channels", () => {
  it("retains unmeasured extra-roller commands and reproduces the finite-inertia shot", () => {
    const c = independent(),
      q = measurementConfig(c, row);
    expect(wheelSpeeds(q)).toEqual(wheelSpeeds(c));
    const a = simulateShooter(c, launchInertia(c, defaults)),
      b = simulateShooter(q, launchInertia(q, defaults));
    expect(a.speed).toBeCloseTo(4.5868883813, 8);
    expect(b.speed).toBeCloseTo(a.speed, 12);
    expect(b.spin).toBeCloseTo(a.spin, 12);
  });
  it("accepts distinct measured channels and rejects missing/invalid channel values", () => {
    const c = independent(),
      q = measurementConfig(c, { ...row, rollerRPMs: [1200, 2400] });
    expect(
      wheelSpeeds(q)
        .slice(2)
        .map((w) => (w * 30) / Math.PI),
    ).toEqual([1200, 2400]);
    for (const values of [[1], [1, -2], [NaN, 2]])
      expect(() =>
        measurementConfig(c, { ...row, rollerRPMs: values }),
      ).toThrow("one finite");
  });
  it("checks extra measured RPM against every linked roller ratio", () => {
    const c = structuredClone(current);
    c.shooter.topology = "compound";
    c.shooter.rollers[0].ratio = 2;
    expect(() =>
      measurementConfig(c, {
        ...row,
        secondaryRPM: 5437.5,
        rollerRPMs: [2900, 5437.5],
      }),
    ).not.toThrow();
    expect(() =>
      measurementConfig(c, {
        ...row,
        secondaryRPM: 5437.5,
        rollerRPMs: [5437.5, 5437.5],
      }),
    ).toThrow("extra hood RPM");
  });
});

describe("physical obstacles and empty targets", () => {
  it("lets a ball pass through the robot-only exclusion volume in both engines", () => {
    const c = vacuum(),
      s = launch(c, [-1, 0, 0.2], [2, 0, 0]),
      b = simulateBounceWorld(s, simple);
    expect(s.flight.impact).toBeNull();
    expect(b.flight.worldEvents).toHaveLength(0);
    expect(
      norm(sub(s.flight.samples.at(-1)!.p, b.flight.samples.at(-1)!.p)),
    ).toBeLessThan(1e-9);
    // Explicitly solid user obstacles still block the ball even with a legacy name.
    c.field.obstacles[0].purpose = "solid";
    expect(flight(s.origin, s.velocity, s.spin, c).collision).toBe(
      "HIVE footprint / robot no-go",
    );
  });
  it("migrates old obstacle roles, accepts an empty laboratory scene and rejects unknown roles", () => {
    const raw = JSON.parse(JSON.stringify(current));
    delete raw.field.hiveStructure;
    for (const b of raw.field.obstacles) delete b.purpose;
    const loaded = parseConfig(raw);
    expect(loaded.field.obstacles[0].purpose).toBe("robot-exclusion");
    expect(loaded.field.obstacles[1].purpose).toBe("hive-proxy");
    raw.field.obstacles = [];
    expect(parseConfig(raw).field.obstacles).toEqual([]);
    raw.field.obstacles = [
      { min: [0, 0, 0], max: [1, 1, 1], name: "bad", purpose: "mystery" },
    ];
    expect(() => parseConfig(raw)).toThrow("purpose");
  });
  it.each(["center", "left", "right", "manual"] as const)(
    "simulates zero residents in a shallow target with %s placement",
    (layout) => {
      const c = vacuum();
      c.field.target.depth = 0.02;
      expect(residentPositions(c, 0, layout)).toEqual([]);
      const b = simulateBounceWorld(
        launch(c, [-1, -1, 0.5], [1, 0, 1]),
        simple,
        0,
        layout,
      );
      expect(b.flight.residentCount).toBe(0);
      expect(b.flight.samples.length).toBeGreaterThan(2);
    },
  );
});

describe("one shared HIVE frame", () => {
  it("transfers a blue support-arm impact to the hinge", () => {
    const c = vacuum(),
      settings = {
        ...simple,
        hiveMotion: true,
        hiveInitialAngle: Math.PI / 6,
        hiveDamping: 0,
      },
      h = createHive(c, settings);
    const arm = hiveStructureSolids(c.field).find(
        (s) => s.name === "HIVE blue-upward-cell support arm",
      )!,
      normal = scale(arm.basis[2], -1),
      point = add(arm.center, scale(arm.basis[1], -arm.half[1] / 2)),
      p = hivePoint(
        h,
        add(
          point,
          scale(normal, c.projectile.diameter / 2 + arm.half[2] + 0.006),
        ),
      ),
      v = hiveVector(h, scale(normal, -2));
    const s = launch(c, p, v),
      b = simulateBounceWorld(s, settings),
      event = b.flight.bounces!.find((e) => e.surface === arm.name);
    expect(event).toBeDefined();
    const state = sampleAt(b.flight.samples, 0.02),
      pose = sampleHive(b.flight.hiveTrack!, 0.02)!;
    expect(Math.abs(pose.omega)).toBeGreaterThan(0.001);
    const angular = (p: Vec3, v: Vec3, w: Vec3) =>
      dot(cross(sub(p, h.pivot), scale(v, c.projectile.mass)), h.axis) +
      0.4 *
        c.projectile.mass *
        (c.projectile.diameter / 2) ** 2 *
        dot(w, h.axis);
    expect(
      Math.abs(
        angular(state.p, state.v, state.spin) +
          h.inertia * pose.omega -
          angular(s.origin, s.velocity, s.spin),
      ),
    ).toBeLessThan(1e-5);
  });
  it("detects a rendered support leg in flight, studies and the contact world", () => {
    const c = vacuum(),
      leg = hiveStructureSolids(c.field).find(
        (s) => s.name === "HIVE east south leg",
      )!,
      p = add(leg.center, scale(leg.basis[0], 0.1)),
      v = scale(leg.basis[0], -2),
      s = launch(c, p, v),
      b = simulateBounceWorld(s, simple);
    expect(s.flight.collision).toBe(leg.name);
    const event = b.flight.bounces!.find((e) => e.surface === leg.name)!;
    expect(event).toBeDefined();
    expect(Math.abs(event.t - s.flight.impact!.t)).toBeLessThan(0.0011);
    const path = [
      { t: 0, p, v, spin: [0, 0, 0] as Vec3 },
      { t: 0.1, p: add(p, scale(v, 0.1)), v, spin: [0, 0, 0] as Vec3 },
    ];
    expect(
      hitsExtraSolids(path, 0.1, c.projectile.diameter / 2, hiveExtraSolids(c)),
    ).toBe(true);
  });
  it("uses rounded finite-cylinder contact for the pivot hub and supports an isolated scene", () => {
    const c = vacuum(),
      hub = hiveStructureSolids(c.field).find((s) => s.kind === "cylinder")!;
    const p = add(hub.center, scale(hub.basis[0], hub.half[0] + 0.02));
    expect(structureContact(p, hub, 0.03)).not.toBeNull();
    expect(
      sweepStructure(add(p, scale(hub.basis[0], 0.1)), hub.center, hub, 0.03),
    ).not.toBeNull();
    c.field.hiveStructure = false;
    expect(hiveStructureSolids(c.field)).toEqual([]);
  });
});

describe("frozen HIVE pose", () => {
  it.each([0, Math.PI / 6, Math.PI / 3])(
    "shares the frozen angle %s across contacts, drawing and occupancy",
    (angle) => {
      const c = vacuum(),
        settings = { ...simple, hiveInitialAngle: angle, hiveInitialSpeed: 2 },
        h = createHive(c, settings);
      const local: Vec3 = [0, 0, -c.field.target.depth / 2];
      const result = simulateBounceWorld(
        launch(c, [-1, -1, 0.2], [0, 0, 0]),
        settings,
        1,
        "manual",
        [local],
      );
      const resident = result.flight.ballTracks![1].samples[0];
      expect(
        norm(sub(resident.p, hivePoint(h, targetWorld(local, c.field.target)))),
      ).toBeLessThan(1e-9);
      const context = { ...c, field: { ...c.field, target: hiveTarget(c, h) } };
      const last = result.flight.ballTracks![1].samples.at(-1)!;
      expect(inCell(last.p, context)).toBe(true);
      expect(result.flight.retainedResidents).toBe(1);
      expect(residentPlayback(result, 0.5)[0].inside).toBe(true);
      expect(
        result.flight.hiveTrack!.every(
          (p) => p.angle === angle && p.omega === 0,
        ),
      ).toBe(true);
    },
  );
  it.each([0, Math.PI / 3])(
    "keeps final and playback counts consistent under gravity at angle %s",
    (angle) => {
      const c = structuredClone(current),
        settings = { ...simple, hiveInitialAngle: angle },
        result = simulateBounceWorld(
          launch(c, [-1, -1, 0.2], [0, 0, 0]),
          settings,
          1,
        );
      const states = residentPlayback(result, result.flight.samples.at(-1)!.t);
      expect(result.flight.retainedResidents).toBe(
        states.filter((s) => s.inside).length,
      );
    },
  );
});

describe("recorded ball energy", () => {
  it.each(["solid", "shell", "config"] as const)(
    "keeps %s energy in the chart with bounce disabled and enabled",
    (inertiaModel) => {
      const c = structuredClone(current);
      c.shooter.topology = "passive";
      const model = { ...defaults, inertiaModel },
        s = simulate(c, undefined, model);
      expect(shotKineticEnergy(s, s.flight.samples[0])).toBeCloseTo(
        s.shooter.energy + s.shooter.rotationalEnergy,
        12,
      );
      const b = simulateBounceWorld(s, { ...model, previewTime: 0.5 });
      expect(shotKineticEnergy(b, b.flight.samples[0])).toBeCloseTo(
        shotKineticEnergy(s, s.flight.samples[0]),
        12,
      );
      delete s.flight.ballInertia;
      expect(shotKineticEnergy(s, s.flight.samples[0])).toBeCloseTo(
        s.shooter.energy + s.shooter.rotationalEnergy,
        12,
      );
    },
  );
});

describe("battery and motor coupling", () => {
  it("enforces both caps when reducing duty can increase stator current", () => {
    const c = structuredClone(current);
    Object.assign(c.shooter.motor, {
      count: 8,
      reduction: 1,
      voltage: 10,
      batteryResistance: 0.3,
      resistance: 0.3,
      supplyLimit: 10,
      statorLimit: 35,
      kP: 0,
      kV: 0.018,
    });
    const p = motorOperatingPoint(c, 0, 500);
    expect(p.current).toBeLessThanOrEqual(35 + 1e-9);
    expect(p.supplyCurrent).toBeLessThanOrEqual(10 + 1e-9);
    expect(p.busVoltage * p.supplyCurrent).toBeCloseTo(
      p.motorVoltage * p.current,
      10,
    );
  });
  function motor() {
    const c = structuredClone(current);
    Object.assign(c.shooter.motor, {
      count: 1,
      efficiency: 1,
      reduction: 1,
      voltage: 10,
      batteryResistance: 0.02,
      statorLimit: 100,
      supplyLimit: 100,
      kV: 0.018,
      kP: 1,
      resistance: 0.3,
      torqueConstant: 0.018,
    });
    return c;
  }
  it("matches the analytic motor rise and does not become unreachable when the current limit increases", () => {
    const c = motor(),
      j = 0.001,
      target = 500,
      m = c.shooter.motor;
    const analytic =
      ((-j * (m.resistance + m.batteryResistance)) / m.torqueConstant ** 2) *
      Math.log(1 - (0.98 * target) / (m.voltage / m.torqueConstant));
    expect(motorRecovery(c, j, 0, target)).toBeCloseTo(analytic, 6);
    const times = [10, 25, 50, 100].map((limit) => {
      m.supplyLimit = limit;
      return motorRecovery(c, j, 0, target)!;
    });
    expect(times.every(Number.isFinite)).toBe(true);
    for (let i = 1; i < times.length; i++)
      expect(times[i]).toBeLessThanOrEqual(times[i - 1] + 1e-7);
    expect(motorRecovery(c, j, 0, 600)).toBeNull();
    expect(motorRecovery(c, null, 0, target)).toBeNull();
  });
  it.each([0, 100, 300, 480])(
    "balances winding and battery power at %s rad/s with both current caps",
    (speed) => {
      const c = motor();
      c.shooter.motor.kP = 0.01;
      c.shooter.motor.supplyLimit = 4;
      c.shooter.motor.statorLimit = 8;
      const p = motorOperatingPoint(c, speed, 500),
        m = c.shooter.motor;
      expect(p.current).toBeLessThanOrEqual(8 + 1e-9);
      expect(p.supplyCurrent).toBeLessThanOrEqual(4 + 1e-9);
      expect(p.busVoltage).toBeCloseTo(
        m.voltage - m.batteryResistance * p.supplyCurrent,
        12,
      );
      expect(p.motorVoltage * p.current).toBeCloseTo(
        p.busVoltage * p.supplyCurrent,
        10,
      );
      if (p.current > 1e-8)
        expect(p.motorVoltage).toBeCloseTo(
          m.torqueConstant * speed * m.reduction +
            (p.current * m.resistance) / m.count,
          10,
        );
    },
  );
});

describe("shared pre-impact flight model", () => {
  it("can stop a search at the target plane without changing any preceding trajectory", () => {
    const c = vacuum();
    c.simulation.maxTime = 3;
    c.environment.gravity = 9.80665;
    const p = targetWorld([0, 0, 0.5], c.field.target),
      v: Vec3 = [0, 2.6, -1.5],
      w: Vec3 = [0, 30, 0],
      full = flight(
        p,
        v,
        w,
        c,
        false,
        [],
        launchInertia(c, defaults),
        defaults,
      ),
      early = flight(
        p,
        v,
        w,
        c,
        false,
        [],
        launchInertia(c, defaults),
        defaults,
        true,
      ),
      last = early.samples.at(-1)!;
    expect(last.t).toBeLessThan(full.samples.at(-1)!.t);
    expect(norm(sub(last.p, sampleAt(full.samples, last.t).p))).toBeLessThan(
      1e-10,
    );
    expect(early.warnings).toEqual([]);
  });
  it.each([0.01, 0.05])(
    "uses the same area at ovality %s and converges between the two integrators",
    (asphericity) => {
      const c = structuredClone(current);
      c.field.hiveStructure = false;
      c.field.target.center = [20, 20, 20];
      c.field.obstacles = [];
      c.simulation.maxTime = 1;
      const model = {
        ...simple,
        shapeModel: "pollen" as const,
        inertiaModel: "shell" as const,
        asphericity,
        previewTime: 1,
        maxContactStep: 0.00025,
      };
      const s = launch(c, [-1, -1, 3], [8, 1, 5]);
      s.flight = flight(
        s.origin,
        s.velocity,
        s.spin,
        c,
        false,
        [],
        launchInertia(c, model),
        model,
      );
      const b = simulateBounceWorld(s, model),
        a = sampleAt(s.flight.samples, 0.8),
        z = sampleAt(b.flight.samples, 0.8);
      expect(b.flight.worldEvents).toHaveLength(0);
      expect(norm(sub(a.p, z.p))).toBeLessThan(0.0002);
      expect(s.flight.aeroAxes).toEqual(b.flight.aeroAxes);
    },
  );
  it("preserves decaying world angular momentum for an asymmetric spinning shell", () => {
    const c = vacuum();
    c.field.hiveStructure = false;
    c.field.obstacles = [];
    c.field.target.center = [20, 20, 20];
    c.aero.spinDecay = 0.2;
    const model = {
        ...defaults,
        asphericity: 0.04,
        orientation: [0.2, 0.4, 0.6] as Vec3,
      },
      diagonal = bodyInertia(c, model);
    const f = flight(
        [-1, -1, 3],
        [2, 0, 0],
        [15, 30, 5],
        c,
        false,
        [],
        launchInertia(c, model),
        model,
      ),
      first = f.samples[0],
      last = f.samples.at(-1)!;
    const a = tensor(first.rotation!, diagonal, first.spin),
      b = tensor(last.rotation!, diagonal, last.spin);
    expect(
      norm(sub(b, scale(a, Math.exp(-c.aero.spinDecay * last.t)))),
    ).toBeLessThan(1e-10);
  });
});
