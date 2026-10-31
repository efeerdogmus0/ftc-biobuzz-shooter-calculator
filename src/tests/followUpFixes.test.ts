import { afterEach, describe, expect, it, vi } from "vitest";
import { current, recalc } from "../presets";
import {
  simulate,
  flight,
  sampleAt,
  targetLocal,
  targetWorld,
  targetBasis,
} from "../physics/flight";
import { simulateShooter, wheelSpeeds } from "../physics/shooter";
import {
  measurementConfig,
  calibrate,
  type Measurement,
} from "../physics/analysis";
import { launchInertia } from "../physics/launchDynamics";
import { createHive } from "../physics/hiveDynamics";
import {
  simulateBounceWorld,
  residentPositions,
} from "../physics/collisionWorld";
import { collisionCells } from "../field/hiveGeometry";
import {
  captureScenario,
  defaultScenario,
  parseScenario,
  loadScenarios,
} from "../utils/scenario";
import { useStore } from "../state/store";
import { scale, norm } from "../physics/math";

const original = useStore.getState(),
  defaults = defaultScenario().bounceSettings;
afterEach(() => {
  useStore.setState(original, true);
  vi.unstubAllGlobals();
});
function measuredRow(
  c: typeof current,
  split: Measurement["split"] = "training",
): Measurement {
  const w = wheelSpeeds(c);
  return {
    id: split,
    split,
    primaryRPM: (w[0] * 30) / Math.PI,
    secondaryRPM: (w[1] * 30) / Math.PI,
    hoodDeg: (c.shooter.hoodAngle * 180) / Math.PI,
  };
}
describe("calibration preserves the physical experiment", () => {
  it.each(["gear", "surface", "independent"] as const)(
    "keeps %s coupling and the same finite-inertia launch",
    (link) => {
      const c = structuredClone(current);
      c.shooter.link = link;
      [c.shooter.primary, c.shooter.secondary, ...c.shooter.rollers].forEach(
        (w, i) => {
          w.inertiaMode = "disk";
          w.mass = i === 0 ? 0.2 : 0.03;
        },
      );
      const before = simulateShooter(c, launchInertia(c, defaults)),
        q = measurementConfig(c, measuredRow(c)),
        after = simulateShooter(q, launchInertia(q, defaults));
      expect(q.shooter.link).toBe(link);
      expect(after.speed).toBeCloseTo(before.speed, 10);
      expect(after.spin).toBeCloseTo(before.spin, 10);
      expect(after.drop).toBeCloseTo(before.drop, 10);
    },
  );
  it("retains distinct geared roller ratios rather than assigning a common independent speed", () => {
    const c = structuredClone(current);
    c.shooter.topology = "compound";
    c.shooter.rollers[0].ratio = 2;
    const row = measuredRow(c),
      q = measurementConfig(c, row);
    expect(wheelSpeeds(q)[2] / wheelSpeeds(q)[0]).toBeCloseTo(2, 12);
  });
  it("rejects a hood RPM inconsistent with a linked shaft and permits ordinary RPM rounding", () => {
    const row = measuredRow(current);
    expect(() =>
      measurementConfig(current, { ...row, secondaryRPM: 2000 }),
    ).toThrow("conflicts");
    expect(() =>
      measurementConfig(current, {
        ...row,
        secondaryRPM: Math.round(row.secondaryRPM),
      }),
    ).not.toThrow();
    const passive = structuredClone(current);
    passive.shooter.topology = "passive";
    expect(
      measurementConfig(passive, measuredRow(passive)).shooter.topology,
    ).toBe("passive");
    expect(() =>
      measurementConfig(passive, {
        ...measuredRow(passive),
        secondaryRPM: 500,
      }),
    ).toThrow("conflicts");
  });
  it.each(["training", "validation"] as const)(
    "cannot certify a timed %s observation after free flight ends",
    (invalidSplit) => {
      const c = structuredClone(recalc),
        row = measuredRow(c, invalidSplit),
        q = measurementConfig(c, row),
        s = simulate(q),
        f = flight(s.origin, s.velocity, s.spin, q, false);
      expect(f.samples.at(-1)!.t).toBeLessThan(2);
      const invalid = { ...row, time: 4, impact: f.samples.at(-1)!.p };
      const valid = {
        ...measuredRow(
          c,
          invalidSplit === "training" ? "validation" : "training",
        ),
        exitVelocity: s.shooter.speed,
      };
      const result = calibrate(
        c,
        [valid, invalid],
        [{ key: "transfer", initial: 1, value: 1, min: 0.9, max: 1.1 }],
        () => {},
      );
      expect(result.validationPassed).toBe(false);
      expect(result.warnings.join(" ")).toContain(
        "no predicted position at 4.000 s",
      );
      // Playback retains its intentional endpoint clamping.
      expect(sampleAt(f.samples, 4)).toBe(f.samples.at(-1));
    },
  );
  it("still validates positions inside the simulated free-flight interval", () => {
    const c = structuredClone(recalc),
      row = measuredRow(c),
      s = simulate(measurementConfig(c, row)),
      f = flight(s.origin, s.velocity, s.spin, c, false);
    const measured = { ...row, time: 0.5, impact: sampleAt(f.samples, 0.5).p };
    const result = calibrate(
      c,
      [measured, { ...measured, id: "held-out", split: "validation" }],
      [{ key: "transfer", initial: 1, value: 1, min: 0.9, max: 1.1 }],
      () => {},
    );
    expect(result.validationPassed).toBe(true);
    expect(result.validationRMSE).toBeLessThan(1e-8);
  });
});

describe("complete scenario storage and replay", () => {
  function scenario() {
    const s = defaultScenario();
    s.config.shooter.compression = 0.002;
    s.bounceEnabled = true;
    s.bounceSettings = {
      ...s.bounceSettings,
      inertiaModel: "solid",
      shapeModel: "sphere",
      orientation: [0.2, 0.4, 0.6],
      hiveDamping: 0.17,
      hiveReferenceMass: 0.03,
      previewTime: 0.5,
      surfaceFriction: { floor: 0.33, wall: 0.21, cell: 0.27, ball: 0.24 },
    };
    s.residentCount = 2;
    s.residentLayout = "manual";
    s.manualResidents = residentPositions(s.config, 2, "center").map((p) =>
      targetLocal(p, s.config.field.target),
    );
    return s;
  }
  it("round trips ball, materials, hinge reference and exact manual positions without retaining caller references", () => {
    const s = scenario(),
      saved = captureScenario(s),
      loaded = parseScenario(JSON.parse(JSON.stringify(saved)));
    expect(loaded).toEqual(saved);
    s.bounceSettings.orientation![0] = 1;
    s.manualResidents[0][0] += 0.1;
    expect(loaded.bounceSettings.orientation![0]).toBe(0.2);
    expect(loaded.manualResidents).toEqual(saved.manualResidents);
  });
  it("restores shot history atomically and reproduces speed/spin after the ball model was changed", () => {
    const s = scenario();
    s.bounceEnabled = false;
    useStore.getState().setScenario(s);
    const first = simulate(s.config, launchInertia(s.config, s.bounceSettings));
    useStore.getState().fire(first);
    const entry = useStore.getState().history.at(-1)!;
    useStore.getState().set({
      bounceSettings: defaults,
      residentCount: 0,
      residentLayout: "center",
      manualResidents: [],
    });
    let changes = 0;
    const unsubscribe = useStore.subscribe(() => changes++);
    useStore.getState().setScenario(entry.scenario!);
    unsubscribe();
    expect(changes).toBe(1);
    const state = useStore.getState(),
      again = simulate(
        state.config,
        launchInertia(state.config, state.bounceSettings),
      );
    expect(captureScenario(state)).toEqual(s);
    expect(again.shooter.speed).toBe(first.shooter.speed);
    expect(again.shooter.spin).toBe(first.shooter.spin);
    expect(state.playing).toBe(false);
    expect(state.coverage).toEqual([]);
  });
  it("persists scenario-only edits and restores them on startup", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
    });
    const s = scenario();
    useStore.getState().setScenario(s);
    useStore.getState().set({
      bounceSettings: { ...s.bounceSettings, hiveDamping: 0.19 },
      residentCount: 1,
      manualResidents: s.manualResidents.slice(0, 1),
    });
    const expected = captureScenario(useStore.getState());
    vi.resetModules();
    const fresh = await import("../state/store");
    expect(captureScenario(fresh.useStore.getState())).toEqual(expected);
  });
  it("loads mixed legacy and new profiles independently, with explicit defaults for missing legacy scenario data", () => {
    const s = scenario(),
      values = loadScenarios(JSON.stringify([current, { name: "bad" }, s]));
    expect(values).toHaveLength(2);
    expect(values[0]).toEqual(defaultScenario(current));
    expect(values[1]).toEqual(s);
    expect(() => parseScenario({ ...s, version: 2 })).toThrow("version");
  });
  it.each(["orientation", "step", "friction", "reference", "manual"] as const)(
    "rejects malformed %s data before it reaches the worker",
    (kind) => {
      const s = scenario();
      if (kind === "orientation") s.bounceSettings.orientation = [NaN, 0, 0];
      if (kind === "step") s.bounceSettings.maxContactStep = 0;
      if (kind === "friction") s.bounceSettings.surfaceFriction = { cell: -1 };
      if (kind === "reference") s.bounceSettings.hiveReferenceMass = 0;
      if (kind === "manual") s.manualResidents[1] = [...s.manualResidents[0]];
      expect(() => parseScenario(s)).toThrow();
    },
  );
});

describe("fixed HIVE balance and all visible CELLS", () => {
  it("keeps balance unchanged when projectile mass or diameter changes, and recalibrates only when the reference changes", () => {
    const c = structuredClone(current),
      h = createHive(c, defaults);
    c.projectile.mass = 0.035;
    c.projectile.diameter = 0.08;
    expect(createHive(c, defaults).barrier).toBe(h.barrier);
    expect(
      createHive(c, { ...defaults, hiveReferenceMass: 0.035 }).barrier /
        h.barrier,
    ).toBeCloseTo(1.4, 12);
  });
  it.each([false, true])(
    "collides with all four CELL back panels with HIVE motion=%s",
    (hiveMotion) => {
      const c = structuredClone(current);
      c.environment.gravity = 0;
      c.aero.cd = 0;
      c.aero.magnus = false;
      c.aero.spinDecay = 0;
      c.field.obstacles = [];
      for (const cell of collisionCells(c.field)) {
        const t = cell.target,
          n = targetBasis(t).n,
          shot = simulate(c);
        shot.origin = targetWorld(
          [0, 0, -t.depth + c.projectile.diameter / 2 + 0.006],
          t,
        );
        shot.velocity = scale(n, -2);
        shot.spin = [0, 0, 0];
        shot.flight = flight(shot.origin, shot.velocity, shot.spin, c);
        expect(shot.flight.collision).toBe(cell.prefix + "CELL bottom");
        const result = simulateBounceWorld(shot, {
          ...defaults,
          hiveMotion,
          shapeModel: "sphere",
          inertiaModel: "solid",
          previewTime: 0.5,
          surfaceFriction: { cell: 0 },
        });
        const e = result.flight.bounces![0];
        expect(e.surface).toBe(cell.prefix + "CELL bottom");
        expect(e.t).toBeLessThan(0.01);
        expect(norm(e.outgoing)).toBeGreaterThan(0);
        if (hiveMotion && !cell.moving)
          expect(
            result.flight.hiveTrack!.every((h) => Math.abs(h.omega) < 1e-12),
          ).toBe(true);
      }
    },
  );
});
