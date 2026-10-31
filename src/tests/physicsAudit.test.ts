import { describe, expect, it } from "vitest";
import { current, recalc } from "../presets";
import {
  aim,
  flight,
  simulate,
  targetBasis,
  targetWorld,
  targetLocal,
  targetOpeningClearance,
  interpolate,
} from "../physics/flight";
import {
  solve,
  monteCarlo,
  defaultUncertainty,
  calibrate,
  measurementConfig,
  type FitParameter,
  type Measurement,
} from "../physics/analysis";
import {
  launchInertia,
  bodyInertia,
  physicsStamp,
} from "../physics/launchDynamics";
import {
  simulateShooter,
  wheelInertia,
  wheelRadius,
  wheelSpeeds,
} from "../physics/shooter";
import { aerodynamicForces } from "../physics/aerodynamics";
import { defaultBounce } from "../physics/bounce";
import { advancedBounceDefaults } from "../physics/contactModel";
import { simulateBounceWorld } from "../physics/collisionWorld";
import {
  cellSolids,
  cellContact,
  sweepCellSolid,
} from "../physics/cellGeometry";
import { createHive, hiveTarget } from "../physics/hiveDynamics";
import {
  positionShooter,
  speedWindow,
  type StudyOptions,
} from "../physics/shotStudy";
import { dot, norm, scale, sub } from "../physics/math";
import { parseConfig } from "../utils/config";
import { shotsFromConfig } from "../physics/clearance";
import { useStore } from "../state/store";
import type { Config, Vec3 } from "../physics/types";

const model = { ...defaultBounce, ...advancedBounceDefaults };
const quiet = () => {};
const zeroUncertainty = { ...defaultUncertainty };
for (const key of Object.keys(
  zeroUncertainty,
) as (keyof typeof zeroUncertainty)[])
  zeroUncertainty[key] = 0;
function isolated(): Config {
  const c = structuredClone(current);
  c.environment.gravity = 0;
  c.aero.cd = 0;
  c.aero.magnus = false;
  c.aero.spinDecay = 0;
  c.field.obstacles = [];
  return c;
}
describe("physics audit regressions", () => {
  it("1: solver candidates and zero-noise analysis use the selected shell at 2 mm compression", () => {
    const c = structuredClone(current);
    c.shooter.compression = 0.002;
    const candidates = solve(c, quiet, false, model);
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      const q = aim(c);
      q.shooter.primary.omega = candidate.omega;
      q.shooter.hoodAngle = candidate.angle;
      const shot = simulate(q, launchInertia(q, model), model);
      expect(shot.shooter.speed).toBeCloseTo(candidate.speed, 10);
      expect(shot.flight.status).toBe("HIT");
      expect(shot.flight.entry!.clearance).toBeCloseTo(candidate.clearance, 10);
      expect(monteCarlo(q, 2, zeroUncertainty, 42, quiet, model).hits).toBe(2);
      const world = simulateBounceWorld(shot, {
        ...model,
        previewTime: 1.3,
        hiveMotion: false,
      });
      expect(world.flight.samples[0].v).toEqual(shot.velocity);
      expect(world.shooter).toEqual(shot.shooter);
      // The world's status/entry fields retain the static reference. Validate
      // its actual track, not those inherited labels.
      const track = world.flight.samples,
        target = q.field.target;
      const index = track.findIndex(
        (sample, i) =>
          i > 0 &&
          targetLocal(track[i - 1].p, target)[2] > 0 &&
          targetLocal(sample.p, target)[2] <= 0,
      );
      expect(index).toBeGreaterThan(0);
      const a = track[index - 1],
        b = track[index],
        za = targetLocal(a.p, target)[2],
        zb = targetLocal(b.p, target)[2];
      const entry = interpolate(a, b, za / (za - zb));
      expect(
        targetOpeningClearance(
          target,
          targetLocal(entry.p, target),
          q.projectile.diameter / 2,
        ),
      ).toBeGreaterThan(0);
      expect(entry.t).toBeLessThan(world.flight.bounces![0].t);
    }
  }, 20000);
  it("1: shell inertia scales with sampled mass and diameter and material changes do not change the ball model", () => {
    const c = structuredClone(current),
      i = bodyInertia(c, model);
    c.projectile.mass *= 2;
    c.projectile.diameter *= 3;
    bodyInertia(c, model).forEach((v, k) =>
      expect(v / i[k]).toBeCloseTo(18, 10),
    );
    const differentMaterial = { ...model, cell: 0.9 };
    expect(physicsStamp(c, model)).toBe(physicsStamp(c, differentMaterial));
    expect(physicsStamp(c, model)).not.toBe(
      physicsStamp(c, { ...model, inertiaModel: "solid" }),
    );
  });
  it("2: static and bounce engines detect the same sloping CELL wall within one contact step", () => {
    const c = isolated();
    c.field.target.center = [0, 0, 1];
    c.field.target.tilt = 0;
    c.field.target.yaw = 0;
    const shot = simulate(c);
    shot.origin = [0.1, 0.07, 0.9];
    shot.velocity = [0, 0.5, 0];
    shot.spin = [0, 0, 0];
    shot.flight = flight(shot.origin, shot.velocity, shot.spin, c);
    const world = simulateBounceWorld(shot, {
      ...model,
      shapeModel: "sphere",
      hiveMotion: false,
      previewTime: 0.2,
      maxContactStep: 0.0005,
      rollingResistance: 0,
      spinResistance: 0,
      surfaceFriction: { cell: 0 },
    });
    const event = world.flight.bounces![0];
    expect(shot.flight.collision).toBe("CELL roof right");
    expect(event.surface).toBe(shot.flight.collision);
    expect(Math.abs(event.t - shot.flight.impact!.t)).toBeLessThan(0.0006);
    expect(norm(sub(event.p, shot.flight.impact!.p))).toBeLessThan(0.0004);
  });
  it("2: the bottom panel excludes points outside the pentagon and CCD respects rounded sphere corners", () => {
    const t = structuredClone(current.field.target),
      solids = cellSolids(t),
      bottom = solids.at(-1)!;
    const outside: Vec3 = [t.width / 2 - 0.001, t.height / 2 - 0.001, -t.depth];
    expect(cellContact(outside, bottom, t, 0.005)).toBeNull();
    expect(
      sweepCellSolid(
        [outside[0], outside[1], 0.1],
        [outside[0], outside[1], -1],
        bottom,
        t,
        0.005,
      ),
    ).toBeNull();
    const box = {
      box: { name: "test", min: [0, 0, 0] as Vec3, max: [1, 1, 1] as Vec3 },
    };
    expect(
      sweepCellSolid([-0.09, -0.09, -1], [-0.09, -0.09, 2], box, t, 0.1),
    ).toBeNull();
    const hit = sweepCellSolid(
      [-0.06, -0.06, -1],
      [-0.06, -0.06, 2],
      box,
      t,
      0.1,
    )!;
    expect(hit.u).toBeCloseTo((1 - Math.sqrt(0.01 - 2 * 0.06 ** 2)) / 3, 7);
  });
  it("3: diameter changes keep surface-speed lock, radius and RPM consistent, including legacy profiles", () => {
    const c = structuredClone(current);
    c.shooter.link = "surface";
    c.shooter.surfaceRatio = 1;
    c.shooter.secondary.diameter = 0.0508;
    const s = simulateShooter(c),
      w = wheelSpeeds(c);
    expect(wheelRadius(c.shooter.secondary)).toBe(0.0254);
    s.surfaceSpeeds.forEach((v) =>
      expect(v).toBeCloseTo(s.surfaceSpeeds[0], 10),
    );
    expect(s.surfaceSpeeds[1] / 0.0254).toBeCloseTo(w[1], 10);
    expect(parseConfig(c).shooter.secondary.radius).toBe(0.0254);
    useStore.getState().setConfig(c);
    useStore.getState().edit("shooter.secondary.diameter", 0.06);
    expect(useStore.getState().config.shooter.secondary.radius).toBe(0.03);
    useStore.getState().edit("shooter.secondary.radius", 0.02);
    expect(useStore.getState().config.shooter.secondary.diameter).toBe(0.04);
    useStore.getState().setConfig(structuredClone(current));
  });
  it.each(["linear", "sawicki"] as const)(
    "4: %s Magnus force tends continuously to zero for parallel spin, without axial contribution",
    (liftModel) => {
      const c = structuredClone(current);
      c.aero.liftModel = liftModel;
      const v: Vec3 = [10, 0, 0];
      expect(norm(aerodynamicForces(v, [100, 0, 0], c).lift)).toBe(0);
      const tiny = norm(aerodynamicForces(v, [100, 1e-8, 0], c).lift);
      expect(tiny).toBeLessThan(1e-9);
      expect(
        norm(aerodynamicForces(v, [100, 1e-5, 0], c).lift) / tiny,
      ).toBeCloseTo(1000, 7);
      const a = aerodynamicForces(v, [100, 1, 0], c).lift,
        b = aerodynamicForces(v, [0, 1, 0], c).lift;
      expect(a).toEqual(b);
      expect(dot(a, v)).toBeCloseTo(0, 12);
      expect(aerodynamicForces(v, [0, -1, 0], c).lift[2]).toBeCloseTo(
        -a[2],
        12,
      );
      c.environment.wind = v;
      expect(norm(aerodynamicForces(v, [0, 100, 0], c).lift)).toBe(0);
    },
  );
  it.each([false, true])(
    "5: finds the 83 degree window at the upper speed bound (extra HIVE: %s)",
    (extendedHive) => {
      const angle = (83 * Math.PI) / 180,
        shooter = positionShooter(current, -1.15, -1.1, extendedHive);
      for (const v of [8.9, 8.95, 9]) expect(shooter.hit(angle, v)).toBe(true);
      const o: StudyOptions = {
        spacing: 0.5,
        angles: [angle],
        speedMin: 1,
        speedMax: 9,
        speedTolerance: 0.002,
        extendedHive,
      };
      const w = speedWindow(shooter, angle, o)!;
      expect(w).not.toBeNull();
      expect(w.lo).toBeLessThanOrEqual(8.9);
      expect(w.hi).toBe(9);
      for (let v = w.lo; v <= w.hi; v += 0.01)
        expect(shooter.hit(angle, v)).toBe(true);
    },
  );
  it("5: tests a non-grid upper boundary and keeps disconnected speed windows separate", () => {
    const shooter = {
      residual: () => -1,
      hit: (_a: number, v: number) =>
        (v >= 1.7 && v <= 1.8) || (v >= 2.01 && v <= 2.09),
      distance: 1,
      origin: [0, 0, 0] as Vec3,
    };
    const w = speedWindow(shooter, 1, {
      spacing: 1,
      angles: [1],
      speedMin: 1,
      speedMax: 2.09,
      speedTolerance: 0.001,
      extendedHive: false,
    })!;
    expect(w.lo).toBeGreaterThanOrEqual(1.7);
    expect(w.hi).toBeLessThanOrEqual(1.8);
    const bound = speedWindow(
      { ...shooter, hit: (_a: number, v: number) => v >= 2.01 },
      1,
      {
        spacing: 1,
        angles: [1],
        speedMin: 1,
        speedMax: 2.09,
        speedTolerance: 0.001,
        extendedHive: false,
      },
    )!;
    expect(bound.hi).toBe(2.09);
  });
  it("6: a 125 mm feed cannot launch from a 150 mm contact path or enter analysis/history", () => {
    const c = structuredClone(current);
    c.shooter.friction = 0;
    c.projectile.initialVelocity = 0.5;
    c.shooter.maxContactTime = 0.25;
    const shot = simulate(c, launchInertia(c, model));
    expect(shot.shooter.contactTravel).toBeCloseTo(0.125, 10);
    expect(shot.shooter.exited).toBe(false);
    expect(shot.flight.status).toBe("NO EXIT");
    expect(shot.flight.samples).toHaveLength(1);
    expect(shot.flight.entry).toBeNull();
    expect(shot.flight.impact).toBeNull();
    expect(simulateBounceWorld(shot, model, 7)).toBe(shot);
    expect(solve(c, quiet, true, model)).toEqual([]);
    expect(monteCarlo(c, 2, zeroUncertainty, 42, quiet, model).hits).toBe(0);
    expect(() =>
      positionShooter(c, c.robot.x, c.robot.y, false, model),
    ).toThrow("did not exit");
    expect(() => shotsFromConfig(c, [1], [6])).toThrow("did not exit");
    const history = useStore.getState().history;
    useStore.getState().fire(shot);
    expect(useStore.getState().history).toBe(history);
  });
  it.each([0.0001, 0.001])(
    "7: simultaneous geared contacts close the wheel/ball/slip energy budget at dt=%s",
    (dt) => {
      const c = structuredClone(current);
      c.shooter.hysteresis = 0;
      c.shooter.contactStep = dt;
      const wheels = [
        c.shooter.primary,
        c.shooter.secondary,
        ...c.shooter.rollers,
      ];
      wheels.forEach((w, i) => {
        w.inertiaMode = "disk";
        w.mass = i === 0 ? 0.2 : 0.03;
      });
      const s = simulateShooter(c),
        eq = wheels.reduce(
          (sum, w, i) =>
            sum + wheelInertia(w)! * (i ? c.shooter.secondary.ratio ** 2 : 1),
          0,
        );
      const loss = 0.5 * eq * (c.shooter.primary.omega ** 2 - s.postOmega ** 2);
      const gain =
        s.energy +
        s.rotationalEnergy -
        0.5 * c.projectile.mass * c.projectile.initialVelocity ** 2;
      expect(loss - gain).toBeGreaterThan(0);
      expect(s.slipLoss).toBeCloseTo(loss - gain, 10);
      expect(s.consumedEnergy).toBeCloseTo(loss, 10);
      expect(gain + s.slipLoss).toBeCloseTo(loss, 10);
    },
  );
  it("7: independent wheel energy includes both shafts and handles energy returned by a fast feed", () => {
    const c = structuredClone(current);
    c.shooter.link = "independent";
    c.shooter.hysteresis = 0;
    c.shooter.rollers = [];
    c.projectile.initialVelocity = 15;
    for (const w of [c.shooter.primary, c.shooter.secondary]) {
      w.inertiaMode = "disk";
      w.mass = 0.2;
    }
    const s = simulateShooter(c),
      last = s.trace.at(-1)!;
    const final =
      0.5 * wheelInertia(c.shooter.primary)! * last.primaryOmega ** 2 +
      0.5 * wheelInertia(c.shooter.secondary)! * last.secondaryOmega ** 2;
    const loss = s.storedEnergy! - final;
    const gain =
      s.energy +
      s.rotationalEnergy -
      0.5 * c.projectile.mass * c.projectile.initialVelocity ** 2;
    expect(loss).toBeLessThan(0);
    expect(s.consumedEnergy).toBeCloseTo(loss, 10);
    expect(s.slipLoss).toBeCloseTo(loss - gain, 10);
  });
  it("8: CELL entry includes the selected shell rotational inertia", () => {
    const c = isolated(),
      inertia = launchInertia(c, model),
      t = c.field.target;
    const n = targetBasis(t).n,
      origin = targetWorld([0, 0, 0.1], t),
      v = scale(n, -2),
      spin: Vec3 = [10, 50, 0];
    const f = flight(origin, v, spin, c, true, [], inertia);
    expect(f.entry).not.toBeNull();
    expect(f.entry!.energy).toBeCloseTo(
      0.5 * c.projectile.mass * 4 + 0.5 * inertia * norm(spin) ** 2,
      12,
    );
  });
  it("9: rejects validation inputs without observations; good and bad held-out measurements receive different verdicts", () => {
    expect(
      parseConfig({ ...structuredClone(current), calibrated: true }).calibrated,
    ).toBe(false);
    const row: Measurement = {
      id: "train",
      split: "training",
      primaryRPM: 1700,
      secondaryRPM: 6800,
      hoodDeg: 65,
    };
    row.exitVelocity = simulateShooter(measurementConfig(recalc, row)).speed;
    const parameter: FitParameter = {
      key: "transfer",
      initial: 1,
      value: 1,
      min: 0.5,
      max: 1.5,
    };
    const empty: Measurement = {
      ...row,
      id: "empty",
      split: "validation",
      exitVelocity: undefined,
    };
    expect(() => calibrate(recalc, [row, empty], [parameter], quiet)).toThrow(
      "observed",
    );
    const heldout: Measurement = {
      ...row,
      id: "heldout",
      split: "validation",
      primaryRPM: 1900,
      secondaryRPM: 7600,
    };
    heldout.exitVelocity = simulateShooter(
      measurementConfig(recalc, heldout),
    ).speed;
    expect(
      calibrate(recalc, [row, heldout], [parameter], quiet).validationPassed,
    ).toBe(true);
    const bad = calibrate(
      recalc,
      [row, { ...heldout, exitVelocity: heldout.exitVelocity + 1 }],
      [parameter],
      quiet,
    );
    expect(bad.validationCount).toBe(1);
    expect(bad.validationPassed).toBe(false);
    expect(calibrate(recalc, [row], [parameter], quiet).validationPassed).toBe(
      false,
    );
  });
  it("10: moving-HIVE telemetry uses pre-impulse approach and post-impulse relative rebound", () => {
    const c = isolated(),
      settings = {
        ...model,
        shapeModel: "sphere" as const,
        hiveInitialAngle: Math.PI / 6,
        hiveDamping: 0,
        hiveInertia: 0.03,
        rollingResistance: 0,
        spinResistance: 0,
        surfaceFriction: { cell: 0 },
        previewTime: 0.1,
      };
    const h = createHive(c, settings),
      t = hiveTarget(c, h),
      n = targetBasis(t).n,
      shot = simulate(c);
    shot.origin = targetWorld(
      [0, 0, -t.depth + c.projectile.diameter / 2 + 0.006],
      t,
    );
    shot.velocity = scale(n, -2);
    shot.spin = [0, 0, 0];
    const result = simulateBounceWorld(shot, settings),
      e = result.flight.bounces![0];
    expect(-dot(e.relativeIncoming!, n)).toBeCloseTo(2, 10);
    expect(norm(e.surfaceVelocity!)).toBeCloseTo(0, 10);
    expect(dot(e.relativeOutgoing!, n)).toBeCloseTo(2 * e.restitution!, 8);
    expect(e.observedRestitution).toBeCloseTo(e.restitution!, 8);
  });
});
