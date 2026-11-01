import { describe, expect, it } from "vitest";
import { current, recalc } from "../presets";
import {
  applySpecChanges,
  blankSpec,
  validateSpec,
  buildRobot,
  exampleSpec,
  inferSpec,
  parseSpec,
  type RobotSpec,
} from "../presets/factory";
import { parseConfig } from "../utils/config";
import { simulate } from "../physics/flight";
import { launchInertia } from "../physics/launchDynamics";
import {
  captureScenario,
  defaultScenario,
  exampleScenario,
  parseScenario,
  referenceEntries,
  referenceScenario,
  scenarioFromSpec,
} from "../utils/scenario";
import { LEGACY_DEFAULT_NAMES, legacyNotices } from "../utils/legacy";
import { decodeShare, encodeShare } from "../utils/share";
import { useStore } from "../state/store";

const roundTrip = <T>(x: T) => JSON.parse(JSON.stringify(x)) as T;
const run = (spec: RobotSpec) => {
  const c = parseConfig(roundTrip(buildRobot(spec)));
  return simulate(c, launchInertia(c)).shooter;
};
const rpmOf = (w: number) => (w * 30) / Math.PI;

describe("saved work is never rewritten on load (72/16 mm, old HIVE)", () => {
  const teamRobot = (name: string) => {
    const c = buildRobot({
      ...blankSpec(),
      name,
      wheelDiameter: 0.072,
      hoodRollers: 1,
      rollerDiameter: 0.016,
    });
    expect(c.shooter.rollers).toHaveLength(0);
    return c;
  };
  it("keeps explicit 72/16 mm hardware even under an old default name, and only reports it", () => {
    for (const name of ["Team 12345", ...LEGACY_DEFAULT_NAMES]) {
      const saved = roundTrip(defaultScenario(teamRobot(name)));
      const before = JSON.stringify(saved.config);
      const loaded = parseScenario(saved);
      expect(loaded.config.shooter).toEqual(saved.config.shooter);
      expect(loaded.config.name).toBe(name);
      expect(loaded.config.projectile).toEqual(saved.config.projectile);
      const notes = legacyNotices(loaded.config);
      expect(JSON.stringify(loaded.config)).toBe(before);
      expect(notes.length).toBe(LEGACY_DEFAULT_NAMES.includes(name) ? 1 : 0);
    }
  });
  it("keeps a saved custom HIVE placement that matches the old numbers", () => {
    const c = teamRobot("Team 12345");
    c.field.target.center[1] = -0.0254 * 6.5;
    c.field.target.tilt = -Math.PI / 3;
    const loaded = parseScenario(roundTrip(defaultScenario(c)));
    expect(loaded.config.field.target.center[1]).toBeCloseTo(-0.0254 * 6.5, 12);
    expect(loaded.config.field.target.tilt).toBeCloseTo(-Math.PI / 3, 12);
    expect(legacyNotices(loaded.config)).toHaveLength(1);
  });
});

describe("setup edits apply only what changed", () => {
  // A heavily customised robot: reference geometry with per-roller diameters,
  // surface-speed coupling, measured inertia and a non-nominal projectile.
  const custom = () => {
    const c = structuredClone(current);
    c.name = "Takım 777";
    c.shooter.link = "surface";
    c.shooter.surfaceRatio = 1.07;
    c.shooter.rollers[1].diameter = 0.03;
    c.shooter.rollers[1].center = [0.12, 0.051];
    c.shooter.primary.inertia = 0.00123;
    c.shooter.primary.inertiaMode = "custom";
    c.projectile.diameter = 0.0715;
    c.shooter.primary.omega = (1449.7 * Math.PI) / 30; // live edit, unrounded
    return parseConfig(roundTrip(c));
  };
  it("a no-op setup leaves the physical config exactly unchanged", () => {
    const c = custom();
    const before = inferSpec(c)!;
    expect(applySpecChanges(c, before, before)).toEqual(c);
  });
  it("a name-only edit changes only the name", () => {
    const c = custom();
    const before = inferSpec(c)!;
    const out = applySpecChanges(c, before, { ...before, name: "Yeni ad" });
    expect({ ...out, name: c.name }).toEqual(c);
    expect(out.name).toBe("Yeni ad");
  });
  it("the editor reads the live config, not a stale creation spec, without rounding", () => {
    const c = custom();
    const spec = inferSpec(c)!;
    expect(spec.wheelRPM).toBeCloseTo(1449.7, 9);
    expect(spec.gap).toBeCloseTo(0.0715 - c.shooter.compression, 12);
    // A stale spec (e.g. from creation) must not be what the editor applies.
    const stale = { ...spec, wheelRPM: 1400 };
    const out = applySpecChanges(c, spec, { ...spec, exitHeight: 0.5 });
    expect(out.shooter.primary.omega).toBe(c.shooter.primary.omega);
    expect(out.robot.exitOffset[2]).toBe(0.5);
    expect(stale.wheelRPM).not.toBe(spec.wheelRPM);
  });
  it("changing RPM touches only the main wheel speed", () => {
    const c = custom();
    const before = inferSpec(c)!;
    const out = applySpecChanges(c, before, { ...before, wheelRPM: 1600 });
    expect(out.shooter.primary.omega).toBeCloseTo((1600 * Math.PI) / 30, 12);
    expect({
      ...out,
      shooter: {
        ...out.shooter,
        primary: { ...out.shooter.primary, omega: 0 },
      },
    }).toEqual({
      ...c,
      shooter: { ...c.shooter, primary: { ...c.shooter.primary, omega: 0 } },
    });
  });
  it("a mechanism change rebuilds the shooter explicitly and keeps the robot's pose", () => {
    const c = custom();
    const before = inferSpec(c)!;
    const out = applySpecChanges(c, before, {
      ...before,
      mechanism: "twin-wheel",
      topWheelDiameter: 0.1,
    });
    expect(out.shooter.topology).toBe("opposing");
    expect(out.shooter.rollers).toHaveLength(0);
    expect(out.robot).toEqual(c.robot);
    expect(out.projectile).toEqual(c.projectile);
    expect(out.shooter.primary.inertia).toBe(0.00123);
  });
});

describe("setup validation", () => {
  it("flags invalid drafts so they can never be applied", () => {
    const e = validateSpec({
      ...blankSpec(),
      wheelRPM: -5,
      rollerDiameter: 0,
      exitHeight: 0,
      hoodRollers: 2.5,
      ratio: 0,
      name: " ",
    });
    for (const k of [
      "wheelRPM",
      "rollerDiameter",
      "exitHeight",
      "hoodRollers",
      "ratio",
      "name",
    ])
      expect(e).toHaveProperty(k);
    expect(validateSpec({ ...blankSpec(), wheelRPM: NaN })).toHaveProperty(
      "wheelRPM",
    );
    expect(validateSpec(blankSpec())).toEqual({});
  });
  it("does not block an edit over an existing robot's own untouched values", () => {
    const c = structuredClone(current);
    c.shooter.rollers = [
      ...c.shooter.rollers,
      ...structuredClone(c.shooter.rollers),
    ];
    const before = inferSpec(c)!;
    expect(before.hoodRollers).toBe(5);
    expect(validateSpec({ ...before, name: "Yeni" }, before)).toEqual({});
    expect(
      validateSpec({ ...before, hoodRollers: 5.5 }, before),
    ).toHaveProperty("hoodRollers");
  });
});

describe("public robot factory", () => {
  const mechanisms: RobotSpec[] = [
    exampleSpec,
    { ...blankSpec(), mechanism: "wheel-driven-hood" },
    {
      ...blankSpec(),
      mechanism: "wheel-driven-hood",
      drive: "independent",
      secondRPM: 2500,
    },
    { ...blankSpec(), mechanism: "wheel-fixed-hood", wheelRPM: 2800 },
    { ...exampleSpec, drive: "independent", secondRPM: 1100 },
  ];
  it("builds valid, finite, exiting robots for every mechanism", () => {
    for (const spec of mechanisms) {
      const s = run(spec);
      expect(s.exited).toBe(true);
      expect(Number.isFinite(s.speed) && Number.isFinite(s.spin)).toBe(true);
    }
  });
  it("matches each mechanism's physics", () => {
    const twin = run(exampleSpec);
    expect(twin.surfaceSpeeds).toHaveLength(2);
    expect(twin.surfaceSpeeds[1]).toBeCloseTo(twin.surfaceSpeeds[0], 6);
    expect(twin.speed).toBeGreaterThan(0.85 * twin.surfaceSpeeds[0]);
    expect(Math.abs(rpmOf(twin.spin))).toBeLessThan(300);
    const fixed = run({
      ...blankSpec(),
      mechanism: "wheel-fixed-hood",
      wheelRPM: 2800,
    });
    expect(fixed.surfaceSpeeds.slice(1).every((v) => v === 0)).toBe(true);
    expect(fixed.speed).toBeLessThan(0.6 * fixed.surfaceSpeeds[0]);
    expect(rpmOf(fixed.spin)).toBeGreaterThan(500);
    const geared = buildRobot({ ...blankSpec(), ratio: 2.5 });
    expect(
      geared.shooter.secondary.omega / geared.shooter.primary.omega,
    ).toBeCloseTo(2.5, 9);
  });
  it("the public example carries no fingerprint of the reference robot", () => {
    const c = buildRobot(exampleSpec);
    expect(c.shooter.primary.diameter).not.toBeCloseTo(
      current.shooter.primary.diameter,
      4,
    );
    expect(c.robot.exitOffset[2]).not.toBeCloseTo(
      current.robot.exitOffset[2],
      4,
    );
    expect([c.robot.x, c.robot.y]).not.toEqual([
      current.robot.x,
      current.robot.y,
    ]);
    expect(c.shooter.rollers).toHaveLength(0);
    expect(JSON.stringify(c)).not.toMatch(/Rhino|Sushi|Current Robot|ReCalc/);
    expect(c.calibrated).toBe(false);
  });
  it("a mechanism change keeps tuned assumptions, pose, POLLEN and field", () => {
    const tuned = buildRobot(exampleSpec);
    tuned.shooter.friction = 0.91;
    tuned.robot.x = -0.5;
    tuned.projectile.mass = 0.026;
    const before = inferSpec(tuned)!;
    const spec = { ...blankSpec(), name: "Yeni ad", exitHeight: 0.4 };
    const out = applySpecChanges(tuned, before, spec);
    expect(out.shooter.friction).toBe(0.91);
    expect(out.robot.x).toBe(-0.5);
    expect(out.projectile).toEqual(tuned.projectile);
    expect(out.field).toEqual(tuned.field);
    expect(out.robot.exitOffset[2]).toBe(0.4);
    expect(out.name).toBe("Yeni ad");
    expect(out.shooter.topology).toBe("powered");
  });
  it("infers a spec from older robots and validates stored specs", () => {
    expect(inferSpec(recalc)).toBeNull();
    const s = inferSpec(buildRobot(exampleSpec))!;
    expect(s.mechanism).toBe("twin-wheel");
    expect(s.wheelDiameter).toBeCloseTo(0.1);
    expect(parseSpec(exampleSpec)).toEqual(exampleSpec);
    expect(parseSpec({ ...exampleSpec, wheelDiameter: -1 })).toBeNull();
    expect(parseSpec({ ...exampleSpec, mechanism: "rocket" })).toBeNull();
    expect(parseSpec("x")).toBeNull();
  });
});

describe("provenance and start paths", () => {
  it("first visit, example and new robots never start from the reference robot", () => {
    const state = useStore.getState();
    expect(state.needsStart).toBe(true);
    expect(state.config.name).not.toBe(current.name);
    expect(state.origin?.kind).toBe("example");
    for (const sc of [exampleScenario(), scenarioFromSpec(blankSpec())])
      expect(sc.config.shooter).not.toEqual(current.shooter);
    expect(exampleScenario().origin?.kind).toBe("example");
    expect(scenarioFromSpec(blankSpec()).origin?.kind).toBe("user");
  });
  it("opening anything clears the start panel", () => {
    useStore.getState().setScenario(exampleScenario());
    expect(useStore.getState().needsStart).toBe(false);
  });
  it("reference archive entries are unchanged copies marked as references", () => {
    expect(referenceEntries.map((e) => e.id)).toEqual([
      "reference-robot",
      "recalc",
    ]);
    const ref = referenceScenario("reference-robot");
    expect(ref.config).toEqual(current);
    expect(ref.origin?.kind).toBe("reference");
    expect(referenceScenario("recalc").config).toEqual(recalc);
  });
  it("origin round-trips through files and share links; old files stay the user's", async () => {
    const sc = scenarioFromSpec({ ...blankSpec(), name: "Takım robotu" });
    expect(parseScenario(roundTrip(sc)).origin).toEqual(sc.origin);
    expect(await decodeShare(await encodeShare(sc))).toEqual(
      parseScenario(roundTrip(captureScenario(sc))),
    );
    const old = roundTrip(defaultScenario(current));
    expect(parseScenario(old).origin).toBeUndefined();
    // Malformed provenance is dropped, never a reason to reject the file.
    const bad = { ...old, origin: { kind: "alien", spec: 5 } };
    expect(parseScenario(bad).config).toEqual(parseScenario(old).config);
    expect(parseScenario(bad).origin).toBeUndefined();
    const badSpec = { ...old, origin: { kind: "user", spec: { nope: 1 } } };
    expect(parseScenario(badSpec).origin).toEqual({ kind: "user" });
  });
});

describe("historical fixtures stay frozen", () => {
  it("keeps the reference robot and ReCalc exactly as the regression suite expects", () => {
    expect(current.name).toBe("96mm Rhino + 3× Sushi Hood");
    expect(current.shooter.primary.diameter).toBe(0.096);
    expect(current.shooter.rollers).toHaveLength(2);
    expect(current.robot.exitOffset).toEqual([0.12, 0, 0.347]);
    expect(recalc.name).toBe("ReCalc Reference - Uploaded Configuration");
    expect(recalc.shooter.mode).toBe("recalc");
  });
});
