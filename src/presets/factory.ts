// Public robot factory. Builds a complete Config from a team's own shooter
// description (RobotSpec). It deliberately does not read the historical
// `current`/`recalc` fixtures: those are one development robot and a ReCalc
// comparison, kept unchanged for regression tests and the reference archive.
//
// Shared BIOBUZZ season data (field, nominal POLLEN) and model assumptions
// (contact stiffness, friction, aero coefficients, integration settings) live
// here explicitly. None of them is a measurement; the UI labels them as such.
import type {
  Config,
  HoodRollerConfig,
  ShooterConfig,
  WheelConfig,
} from "../physics/types";
import { deg, inch, inertiaImperial, rpm } from "../utils/units";
import { fieldConfig } from "../field/fieldConfig";
import { aim } from "../physics/flight";

export type Mechanism = "wheel-driven-hood" | "wheel-fixed-hood" | "twin-wheel";

export const mechanisms: {
  id: Mechanism;
  label: string;
  description: string;
}[] = [
  {
    id: "wheel-driven-hood",
    label: "Teker + tahrikli hood rulmanları",
    description:
      "Alttaki ana teker topu, motorla döndürülen hood rulmanlarına karşı sıkıştırır. Rulmanlar dişliyle bağlı ya da ayrı motorlu olabilir.",
  },
  {
    id: "wheel-fixed-hood",
    label: "Teker + sabit (dönmeyen) hood",
    description:
      "Yalnız ana teker tahriklidir; top sabit bir hood yüzeyine sürtünerek çıkar ve geri spin alır. Serbest dönen (avara) hood rulmanları bu modelde YOK.",
  },
  {
    id: "twin-wheel",
    label: "Karşılıklı iki teker",
    description:
      "Alt ve üst teker topu iki taraftan sıkıştırır. Yüzey hızları eşitse top az spinle teker yüzey hızına yakın çıkar.",
  },
];

export interface RobotSpec {
  version: 1;
  name: string;
  mechanism: Mechanism;
  /** Main (lower) wheel. */
  wheelDiameter: number;
  wheelRPM: number;
  /** Hood mechanisms: number and size of hood contacts. */
  hoodRollers: number;
  rollerDiameter: number;
  /** Driven hood / twin wheel: gear-linked ratio, or an independent RPM. */
  drive: "gear" | "independent";
  ratio: number;
  secondRPM: number;
  /** Twin wheel: upper wheel. */
  topWheelDiameter: number;
  /** Free gap between the main wheel and the opposite surface; compression = POLLEN − gap. */
  gap: number;
  exitHeight: number;
  hoodAngleDeg: number;
  hoodMinDeg: number;
  hoodMaxDeg: number;
}

export const POLLEN_DIAMETER = 2.8 * inch;

/**
 * The public example: two opposed 100 mm wheels at equal surface speed. Chosen
 * because its exit speed is set mainly by wheel surface speed, so it depends
 * least on unmeasured hood friction/geometry. Round numbers, nobody's robot,
 * not tuned to score.
 */
export const exampleSpec: RobotSpec = {
  version: 1,
  name: "Genel örnek · karşılıklı 100 mm teker",
  mechanism: "twin-wheel",
  wheelDiameter: 0.1,
  wheelRPM: 1400,
  hoodRollers: 3,
  rollerDiameter: 0.0254,
  drive: "gear",
  ratio: 1,
  secondRPM: 1400,
  topWheelDiameter: 0.1,
  gap: 0.064,
  exitHeight: 0.35,
  hoodAngleDeg: 60,
  hoodMinDeg: 35,
  hoodMaxDeg: 80,
};

/** Starting values for "Robotumu kur": a neutral form, not a recommendation. */
export function blankSpec(): RobotSpec {
  return {
    ...exampleSpec,
    name: "Robotum",
    mechanism: "wheel-driven-hood",
    ratio: 3,
    secondRPM: 3000,
  };
}

const wheel = (diameter: number, omega: number, ratio = 1): WheelConfig => ({
  diameter,
  omega,
  mass: null,
  inertia: null,
  inertiaMode: "unknown",
  ratio,
});

/** Model assumptions shared by every public robot (none measured). */
function assumptionShooter(): ShooterConfig {
  return {
    mode: "physical",
    topology: "powered",
    primary: wheel(0.1, rpm(1400)),
    secondary: hoodRoller(0, 1, 0.0254, 0, 1),
    rollers: [],
    link: "gear",
    surfaceRatio: 1,
    surfaceRatioVersion: 1,
    hoodAngle: deg(60),
    hoodMin: deg(35),
    hoodMax: deg(80),
    hoodOffset: 0,
    hoodStart: deg(-40),
    hoodEnd: deg(70),
    hoodRadius: 0.078,
    compression: 0.008,
    friction: 0.65,
    ballStiffness: 4500,
    wheelStiffness: 9000,
    normalModel: "linear",
    forceCurve: [
      [0, 0],
      [0.004, 12],
      [0.008, 24],
      [0.012, 40],
    ],
    hysteresis: 0.12,
    contactStep: 0.0001,
    maxContactTime: 0.25,
    transfer: 1,
    // Disabled; the schema stores the optional flywheel with numeric mass/inertia.
    flywheel: { ...wheel(0.1, 0), mass: 0, inertia: 0, inertiaMode: "custom" },
    flywheelEnabled: false,
    // Only used by the ReCalc-style empirical mode; a placeholder, not a measurement.
    effectiveInertia: 0.264 * inertiaImperial,
    motor: {
      count: 1,
      name: "Tanımlanmamış motor (ölçülmedi)",
      efficiency: 0.7,
      reduction: 1,
      voltage: 12,
      batteryResistance: 0.015,
      statorLimit: 100,
      supplyLimit: 20,
      kV: 0.045,
      kA: 0.009,
      kP: 0.3,
      resistance: 0.3,
      torqueConstant: 0.018,
    },
  } as ShooterConfig;
}

/** Hood contact i of n, spaced along the hood like a typical multi-roller hood. */
function hoodRoller(
  i: number,
  n: number,
  diameter: number,
  omega: number,
  ratio: number,
): HoodRollerConfig {
  const x = 0.025 + 0.045 * i;
  const angle = n > 1 ? deg(-20 + (40 * i) / (n - 1)) : 0;
  return {
    ...wheel(diameter, omega, ratio),
    angle,
    radius: diameter / 2,
    center: [x, POLLEN_DIAMETER / 2 + diameter / 2],
    compression: 0,
    contactStart: Math.max(0, x - 0.045),
    contactEnd: x + 0.035,
  };
}

/**
 * Shooter for `spec`. Mechanism, geometry and speeds come from the spec; model
 * assumptions (friction, stiffness, motor, integration…) come from `base`, so
 * editing the setup of an existing robot keeps the user's tuned assumptions.
 */
export function buildShooter(
  spec: RobotSpec,
  base: ShooterConfig = assumptionShooter(),
): ShooterConfig {
  const s = structuredClone(base);
  const main = rpm(spec.wheelRPM);
  // Keep any measured wheel mass/inertia the user already entered.
  s.primary = { ...s.primary, diameter: spec.wheelDiameter, omega: main };
  s.compression = Math.max(0, POLLEN_DIAMETER - spec.gap);
  s.hoodAngle = deg(spec.hoodAngleDeg);
  s.hoodMin = deg(spec.hoodMinDeg);
  s.hoodMax = deg(spec.hoodMaxDeg);
  s.hoodRadius = spec.wheelDiameter / 2 + POLLEN_DIAMETER / 2 - s.compression;
  s.surfaceRatio = 1;
  s.surfaceRatioVersion = 1;
  if (spec.mechanism === "twin-wheel") {
    const r = spec.topWheelDiameter / 2;
    s.topology = "opposing";
    s.link = spec.drive;
    s.secondary = {
      ...wheel(
        spec.topWheelDiameter,
        rpm(
          spec.drive === "gear" ? spec.wheelRPM * spec.ratio : spec.secondRPM,
        ),
        spec.ratio,
      ),
      angle: 0,
      radius: r,
      center: [0, POLLEN_DIAMETER / 2 + r],
      compression: 0,
      contactStart: -0.03,
      contactEnd: 0.03,
    };
    s.rollers = [];
    s.hoodRadius = r;
    return s;
  }
  const n = Math.max(1, Math.min(4, Math.round(spec.hoodRollers)));
  const fixed = spec.mechanism === "wheel-fixed-hood";
  const hoodOmega = fixed
    ? 0
    : rpm(spec.drive === "gear" ? spec.wheelRPM * spec.ratio : spec.secondRPM);
  const all = Array.from({ length: n }, (_, i) =>
    hoodRoller(i, n, spec.rollerDiameter, hoodOmega, fixed ? 1 : spec.ratio),
  );
  s.topology = fixed ? "passive" : "powered";
  s.link = fixed ? "gear" : spec.drive;
  s.secondary = all[0];
  s.rollers = all.slice(1);
  return s;
}

/** A legal, neutral starting pose 1.8 m from the CELL opening, facing it. */
function neutralRobot(exitHeight: number): Config["robot"] {
  const [tx, ty] = fieldConfig.target.center;
  return {
    x: tx - 1.8,
    y: ty,
    heading: 0,
    turretYaw: 0,
    turretCenter: [0, 0, 0],
    exitOffset: [0.1, 0, exitHeight],
    width: 0.4,
    length: 0.4,
    velocity: [0, 0, 0],
    inheritVelocity: false,
  };
}

export function buildRobot(spec: RobotSpec): Config {
  return aim({
    version: 1,
    name: spec.name,
    calibrated: false,
    robot: neutralRobot(spec.exitHeight),
    shooter: buildShooter(spec),
    projectile: {
      name: "BIOBUZZ POLLEN (nominal)",
      model: "sphere",
      diameter: POLLEN_DIAMETER,
      mass: 0.025,
      inertia: null,
      initialVelocity: 0.5,
      spin: 0,
      roughness: 1,
    },
    aero: {
      cd: 0.47,
      liftModel: "linear",
      liftSlope: 0.6,
      liftMax: 0.5,
      spinDecay: 0.1,
      magnus: true,
    },
    environment: {
      gravity: 9.80665,
      density: 1.225,
      temperature: 288.15,
      pressure: 101325,
      altitude: 0,
      wind: [0, 0, 0],
    },
    field: structuredClone(fieldConfig),
    simulation: {
      absTolerance: 1e-8,
      relTolerance: 1e-7,
      maxStep: 0.008,
      maxTime: 5,
      maxSpeed: 12,
      minOmega: rpm(300),
      maxOmega: rpm(6000),
      entryMin: deg(5),
      entryMax: deg(90),
      apex: "any",
      apexClearance: 0,
      objective: "energy",
    },
  } as Config);
}

/**
 * Apply only what the user changed between `before` (read from this config)
 * and `after`. Untouched fields leave the config bit-for-bit as it was, so
 * custom roller positions, per-roller diameters, measured inertias, a
 * surface-speed coupling and the real projectile diameter all survive a
 * name-only or no-op edit. Changing the mechanism or the number of hood
 * contacts is structural: the shooter geometry is rebuilt, explicitly.
 */
export function applySpecChanges(
  config: Config,
  before: RobotSpec,
  after: RobotSpec,
): Config {
  const q = structuredClone(config);
  const changed = (k: keyof RobotSpec) => before[k] !== after[k];
  if (changed("name")) q.name = after.name;
  if (changed("exitHeight")) q.robot.exitOffset[2] = after.exitHeight;
  if (
    changed("mechanism") ||
    (after.mechanism !== "twin-wheel" && changed("hoodRollers"))
  ) {
    q.shooter = buildShooter(after, config.shooter);
    q.shooter.compression = Math.max(0, q.projectile.diameter - after.gap);
    q.robot.exitOffset[2] = after.exitHeight;
    q.calibrated = false;
    return q;
  }
  const s = q.shooter;
  const hood = [s.secondary, ...s.rollers];
  if (changed("wheelDiameter")) s.primary.diameter = after.wheelDiameter;
  if (changed("wheelRPM")) s.primary.omega = rpm(after.wheelRPM);
  if (changed("gap"))
    s.compression = Math.max(0, q.projectile.diameter - after.gap);
  if (changed("hoodAngleDeg")) s.hoodAngle = deg(after.hoodAngleDeg);
  if (changed("hoodMinDeg")) s.hoodMin = deg(after.hoodMinDeg);
  if (changed("hoodMaxDeg")) s.hoodMax = deg(after.hoodMaxDeg);
  if (changed("drive")) s.link = after.drive;
  if (changed("ratio")) for (const w of hood) w.ratio = after.ratio;
  if (changed("secondRPM"))
    for (const w of hood) w.omega = rpm(after.secondRPM);
  const diameter =
    after.mechanism === "twin-wheel"
      ? changed("topWheelDiameter") && after.topWheelDiameter
      : changed("rollerDiameter") && after.rollerDiameter;
  if (diameter)
    for (const w of hood) {
      w.diameter = diameter;
      w.radius = diameter / 2;
      w.center = [w.center[0], q.projectile.diameter / 2 + diameter / 2];
    }
  if (JSON.stringify(q) !== JSON.stringify(config)) q.calibrated = false;
  return q;
}

/**
 * Readable problems in a spec, keyed by field; empty when it can be applied.
 * With `before`, fields the user did not touch are not judged: an existing
 * robot's own values (e.g. six hood rollers) never block a name-only edit.
 */
export function validateSpec(
  d: RobotSpec,
  before?: RobotSpec,
): Partial<Record<keyof RobotSpec, string>> {
  const e: Partial<Record<keyof RobotSpec, string>> = {};
  const touched = (k: keyof RobotSpec) =>
    !before || before[k] !== d[k] || before.mechanism !== d.mechanism;
  const badRaw = (v: number, min: number, max: number) =>
    !Number.isFinite(v) || v < min || v > max;
  // Untouched numeric field → never an error; touched → must be in range.
  const bad = (k: keyof RobotSpec, min: number, max: number) =>
    touched(k) && badRaw(d[k] as number, min, max);
  if (!d.name.trim()) e.name = "Bir ad gir.";
  if (d.name.length > 120) e.name = "En fazla 120 karakter.";
  if (bad("wheelDiameter", 0.01, 0.3)) e.wheelDiameter = "10–300 mm olmalı.";
  if (bad("wheelRPM", 1, 20000)) e.wheelRPM = "1–20000 RPM olmalı.";
  if (d.mechanism === "twin-wheel") {
    if (bad("topWheelDiameter", 0.01, 0.3))
      e.topWheelDiameter = "10–300 mm olmalı.";
  } else {
    if (
      touched("hoodRollers") &&
      (!Number.isInteger(d.hoodRollers) || badRaw(d.hoodRollers, 1, 4))
    )
      e.hoodRollers = "1–4 arası tam sayı olmalı.";
    if (bad("rollerDiameter", 0.005, 0.2))
      e.rollerDiameter = "5–200 mm olmalı.";
  }
  if (d.mechanism !== "wheel-fixed-hood") {
    if (d.drive === "gear" && bad("ratio", 0.05, 20))
      e.ratio = "0,05–20 arası olmalı.";
    if (d.drive === "independent" && bad("secondRPM", 1, 50000))
      e.secondRPM = "1–50000 RPM olmalı.";
  }
  if (bad("gap", 0.01, 0.2)) e.gap = "10–200 mm olmalı.";
  if (bad("exitHeight", 0.05, 2)) e.exitHeight = "50–2000 mm olmalı.";
  for (const k of ["hoodAngleDeg", "hoodMinDeg", "hoodMaxDeg"] as const)
    if (bad(k, 0, 90)) e[k] = "0–90° olmalı.";
  const anglesTouched =
    touched("hoodAngleDeg") || touched("hoodMinDeg") || touched("hoodMaxDeg");
  if (
    anglesTouched &&
    !e.hoodAngleDeg &&
    (d.hoodAngleDeg < d.hoodMinDeg || d.hoodAngleDeg > d.hoodMaxDeg)
  )
    e.hoodAngleDeg = "Min ile max arasında olmalı.";
  return e;
}

/** Spec read exactly (no rounding) from a config; null for compound/ReCalc. */
export function inferSpec(c: Config): RobotSpec | null {
  const s = c.shooter;
  if (s.topology === "compound" || s.mode === "recalc") return null;
  const mechanism: Mechanism =
    s.topology === "opposing"
      ? "twin-wheel"
      : s.topology === "passive"
        ? "wheel-fixed-hood"
        : "wheel-driven-hood";
  const mainRPM = (s.primary.omega * 30) / Math.PI;
  const independent = s.link === "independent";
  return {
    version: 1,
    name: c.name,
    mechanism,
    wheelDiameter: s.primary.diameter,
    wheelRPM: mainRPM,
    hoodRollers: 1 + s.rollers.length,
    rollerDiameter: s.secondary.diameter,
    drive: independent ? "independent" : "gear",
    ratio: s.secondary.ratio,
    secondRPM: (s.secondary.omega * 30) / Math.PI,
    topWheelDiameter: s.secondary.diameter,
    gap: Math.max(0, c.projectile.diameter - s.compression),
    exitHeight: c.robot.exitOffset[2],
    hoodAngleDeg: (s.hoodAngle * 180) / Math.PI,
    hoodMinDeg: (s.hoodMin * 180) / Math.PI,
    hoodMaxDeg: (s.hoodMax * 180) / Math.PI,
  };
}

/** Validates a stored spec; invalid input returns null instead of breaking a file. */
export function parseSpec(value: unknown): RobotSpec | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const num = (k: string, min: number, max: number) =>
    typeof v[k] === "number" &&
    Number.isFinite(v[k]) &&
    (v[k] as number) >= min &&
    (v[k] as number) <= max;
  if (
    v.version !== 1 ||
    typeof v.name !== "string" ||
    v.name.length > 120 ||
    !mechanisms.some((m) => m.id === v.mechanism) ||
    (v.drive !== "gear" && v.drive !== "independent") ||
    !num("wheelDiameter", 0.01, 0.3) ||
    !num("wheelRPM", 0, 20000) ||
    !num("hoodRollers", 1, 4) ||
    !num("rollerDiameter", 0.005, 0.2) ||
    !num("ratio", 0, 20) ||
    !num("secondRPM", 0, 50000) ||
    !num("topWheelDiameter", 0.01, 0.3) ||
    !num("gap", 0.01, 0.2) ||
    !num("exitHeight", 0.05, 2) ||
    !num("hoodAngleDeg", 0, 90) ||
    !num("hoodMinDeg", 0, 90) ||
    !num("hoodMaxDeg", 0, 90)
  )
    return null;
  return structuredClone(v) as unknown as RobotSpec;
}
