import type { Config, Shot, Vec3 } from "./types";
import {
  aim,
  simulate,
  flight,
  shooterPose,
  targetLocal,
  sampleAt,
  targetBasis,
} from "./flight";
import { simulateShooter, spinVector, wheelSpeeds } from "./shooter";
import { dot, norm, sub, clamp } from "./math";
import {
  launchInertia,
  physicsStamp,
  type BallModelSettings,
} from "./launchDynamics";
export interface Candidate {
  angle: number;
  omega: number;
  speed: number;
  energy: number;
  time: number;
  entryAngle: number;
  clearance: number;
  score: number;
  hoodMargin: number;
  rpmMargin: number;
}
export interface CoverageCell {
  x: number;
  y: number;
  candidate: Candidate | null;
}
export type Progress = (fraction: number) => void;
function score(s: Shot) {
  const e = s.flight.entry!;
  switch (s.config.simulation.objective) {
    case "rpm":
      return s.config.shooter.primary.omega;
    case "time":
      return e.t;
    case "clearance":
      return -e.clearance;
    case "robustness":
      return -e.clearance / (s.shooter.speed * (e.t + 0.1));
    default:
      return s.shooter.energy + s.shooter.rotationalEnergy;
  }
}
/** Search both hood angle and wheel speed. Bracket range on a collision-free trial,
 * then validate real swept-volume collision geometry and entry constraints. */
export function solve(
  input: Config,
  progress: Progress = () => {},
  fast = false,
  ballModel?: BallModelSettings,
): Candidate[] {
  const c = aim(input),
    results: Candidate[] = [];
  const n = fast ? 8 : 24;
  const { origin, yaw } = shooterPose(c);
  const direction: Vec3 = [Math.cos(yaw), Math.sin(yaw), 0];
  const target = c.field.target;
  const inertia = launchInertia(c, ballModel);
  const trial = (omega: number, angle: number) => {
    c.shooter.primary.omega = omega;
    c.shooter.hoodAngle = angle;
    const s = simulateShooter(c, inertia);
    if (!s.exited) return { residual: -Infinity, speed: s.speed };
    if (s.speed > c.simulation.maxSpeed)
      return { residual: Infinity, speed: s.speed };
    const pitch = angle + c.shooter.hoodOffset;
    const velocity: Vec3 = [
      s.speed * Math.cos(pitch) * Math.cos(yaw),
      s.speed * Math.cos(pitch) * Math.sin(yaw),
      s.speed * Math.sin(pitch),
    ];
    if (c.robot.inheritVelocity)
      for (let j = 0; j < 3; j++) velocity[j] += c.robot.velocity[j];
    const spin = spinVector(yaw, s.spin);
    const f = flight(
      origin,
      velocity,
      spin,
      c,
      false,
      [],
      inertia,
      ballModel,
      true,
    );
    const { n: normal } = targetBasis(target);
    let residual = -norm(sub(origin, target.center));
    for (let i = 1; i < f.samples.length; i++) {
      const a = f.samples[i - 1],
        b = f.samples[i];
      const da = targetLocal(a.p, target)[2],
        db = targetLocal(b.p, target)[2];
      if (da > 0 && db <= 0 && dot(b.v, normal) < 0) {
        const u = da / (da - db);
        const p = a.p.map((v, j) => v + (b.p[j] - v) * u) as Vec3;
        residual = dot(sub(p, target.center), direction);
        break;
      }
    }
    return { residual, speed: s.speed };
  };
  for (let i = 0; i <= n; i++) {
    const angle =
      c.shooter.hoodMin + ((c.shooter.hoodMax - c.shooter.hoodMin) * i) / n;
    let lo = c.simulation.minOmega,
      hi = c.simulation.maxOmega;
    for (let k = 0; k < (fast ? 11 : 17); k++) {
      const mid = (lo + hi) / 2,
        t = trial(mid, angle);
      if (t.residual > 0 || t.speed > c.simulation.maxSpeed) hi = mid;
      else lo = mid;
    }
    c.shooter.primary.omega = (lo + hi) / 2;
    c.shooter.hoodAngle = angle;
    const shot = simulate(c, inertia, ballModel),
      e = shot.flight.entry,
      apex = shot.flight.apex;
    if (
      e &&
      shot.shooter.speed <= c.simulation.maxSpeed &&
      e.angle >= c.simulation.entryMin &&
      e.angle <= c.simulation.entryMax &&
      apex.p[2] >= target.center[2] + c.simulation.apexClearance
    ) {
      const rule = c.simulation.apex;
      const valid =
        rule === "any" ||
        (rule === "before" && apex.t < e.t) ||
        (rule === "after" && apex.t > e.t) ||
        (rule === "at" && Math.abs(apex.t - e.t) < 0.02);
      if (valid)
        results.push({
          angle,
          omega: c.shooter.primary.omega,
          speed: shot.shooter.speed,
          energy: shot.shooter.energy + shot.shooter.rotationalEnergy,
          time: e.t,
          entryAngle: e.angle,
          clearance: e.clearance,
          score: score(shot),
          hoodMargin: Math.min(
            angle - c.shooter.hoodMin,
            c.shooter.hoodMax - angle,
          ),
          rpmMargin: c.simulation.maxOmega - c.shooter.primary.omega,
        });
    }
    progress((i + 1) / (n + 1));
  }
  return results.sort((a, b) => a.score - b.score).slice(0, 8);
}
export function coverage(
  c: Config,
  spacing: number,
  progress: Progress,
  ballModel?: BallModelSettings,
): CoverageCell[] {
  const cells: CoverageCell[] = [];
  const half = c.field.size / 2,
    margin = Math.hypot(c.robot.width, c.robot.length) / 2;
  const robotOverlapsObstacle = (x: number, y: number) =>
    c.field.obstacles.some((box) => {
      const nearestX = Math.max(box.min[0], Math.min(x, box.max[0]));
      const nearestY = Math.max(box.min[1], Math.min(y, box.max[1]));
      return Math.hypot(x - nearestX, y - nearestY) <= margin;
    });
  const count = Math.floor((c.field.size - 2 * margin) / spacing) + 1;
  for (let i = 0; i < count; i++)
    for (let j = 0; j < count; j++) {
      const q = structuredClone(c);
      q.robot.x = -half + margin + i * spacing;
      q.robot.y = -half + margin + j * spacing;
      const candidate = robotOverlapsObstacle(q.robot.x, q.robot.y)
        ? null
        : (solve(q, () => {}, true, ballModel)[0] ?? null);
      cells.push({ x: q.robot.x, y: q.robot.y, candidate });
      progress((i * count + j + 1) / (count * count));
    }
  return cells;
}
export interface Uncertainty {
  rpm: number;
  angle: number;
  mass: number;
  diameter: number;
  cd: number;
  compression: number;
  friction: number;
  pose: number;
  yaw: number;
  wind: number;
}
export const defaultUncertainty: Uncertainty = {
  rpm: 35,
  angle: 0.00873,
  mass: 0.001,
  diameter: 0.001,
  cd: 0.04,
  compression: 0.0005,
  friction: 0.03,
  pose: 0.01,
  yaw: 0.00873,
  wind: 0.1,
};
export function seededRandom(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export interface Ellipse {
  center: [number, number];
  radii: [number, number];
  angle: number;
  level: number;
}
export function ellipses(points: [number, number][]): Ellipse[] {
  if (points.length < 3) return [];
  const n = points.length,
    center: [number, number] = [
      points.reduce((s, p) => s + p[0], 0) / n,
      points.reduce((s, p) => s + p[1], 0) / n,
    ];
  let xx = 0,
    yy = 0,
    xy = 0;
  for (const p of points) {
    const x = p[0] - center[0],
      y = p[1] - center[1];
    xx += (x * x) / (n - 1);
    yy += (y * y) / (n - 1);
    xy += (x * y) / (n - 1);
  }
  const d = Math.sqrt((xx - yy) ** 2 + 4 * xy * xy);
  return [0.5, 0.9, 0.95].map((level) => ({
    center,
    radii: [
      Math.sqrt(Math.max(0, (xx + yy + d) / 2) * (-2 * Math.log(1 - level))),
      Math.sqrt(Math.max(0, (xx + yy - d) / 2) * (-2 * Math.log(1 - level))),
    ],
    angle: 0.5 * Math.atan2(2 * xy, xx - yy),
    level,
  }));
}
export interface MonteCarlo {
  probability: number;
  count: number;
  hits: number;
  entries: [number, number][];
  landings: [number, number][];
  ellipses: Ellipse[];
  seed: number;
}
export function monteCarlo(
  c: Config,
  count: number,
  u: Uncertainty,
  seed: number,
  progress: Progress,
  ballModel?: BallModelSettings,
): MonteCarlo {
  const random = seededRandom(seed);
  const gaussian = () =>
    Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) *
    Math.cos(2 * Math.PI * random());
  const entries: [number, number][] = [],
    landings: [number, number][] = [];
  let hits = 0;
  for (let i = 0; i < count; i++) {
    const q = structuredClone(c);
    q.shooter.primary.omega = Math.max(
      0,
      q.shooter.primary.omega + (gaussian() * u.rpm * 2 * Math.PI) / 60,
    );
    q.shooter.hoodAngle += gaussian() * u.angle;
    q.projectile.mass = Math.max(
      0.001,
      q.projectile.mass + gaussian() * u.mass,
    );
    q.projectile.diameter = Math.max(
      0.005,
      q.projectile.diameter + gaussian() * u.diameter,
    );
    q.aero.cd = Math.max(0, q.aero.cd + gaussian() * u.cd);
    q.shooter.compression = Math.max(
      0,
      q.shooter.compression + gaussian() * u.compression,
    );
    q.shooter.friction = Math.max(
      0,
      q.shooter.friction + gaussian() * u.friction,
    );
    q.robot.x += gaussian() * u.pose;
    q.robot.y += gaussian() * u.pose;
    q.robot.turretYaw += gaussian() * u.yaw;
    q.environment.wind = q.environment.wind.map(
      (x) => x + gaussian() * u.wind,
    ) as Vec3;
    const s = simulate(q, launchInertia(q, ballModel), ballModel);
    if (s.flight.entry) {
      hits++;
      entries.push(s.flight.entry.local);
    }
    if (s.flight.collision === "Floor" && s.flight.impact)
      landings.push([s.flight.impact.p[0], s.flight.impact.p[1]]);
    if (i % 10 === 0) progress((i + 1) / count);
  }
  return {
    probability: hits / count,
    count,
    hits,
    entries,
    landings,
    ellipses: ellipses(entries),
    seed,
  };
}
export interface Measurement {
  id: string;
  split: "training" | "validation";
  primaryRPM: number;
  secondaryRPM: number;
  /** Extra hood rollers, in configured order; omission retains their commands. */
  rollerRPMs?: number[];
  hoodDeg: number;
  exitVelocity?: number;
  spinRPM?: number;
  impact?: Vec3;
  time?: number;
  robot?: Config["robot"];
}
export interface FitParameter {
  key: "cd" | "lift" | "transfer" | "friction" | "stiffness";
  initial: number;
  value: number;
  min: number;
  max: number;
}
export interface CalibrationResult {
  parameters: FitParameter[];
  trainingRMSE: number;
  validationRMSE: number | null;
  trainingCount: number;
  validationCount: number;
  iterations: number;
  warnings: string[];
  validationPassed: boolean;
  validationMaxError: number | null;
}
export function applyParameters(c: Config, params: FitParameter[]) {
  const q = structuredClone(c);
  for (const p of params) {
    switch (p.key) {
      case "cd":
        q.aero.cd = p.value;
        break;
      case "lift":
        q.aero.liftSlope = p.value;
        break;
      case "transfer":
        q.shooter.transfer = p.value;
        break;
      case "friction":
        q.shooter.friction = p.value;
        break;
      case "stiffness":
        q.shooter.ballStiffness = p.value;
        break;
    }
  }
  return q;
}
/** RPM observations describe the configured mechanism; they never disconnect
 * a geared shaft or change a surface-speed command into independent wheels. */
export function measurementConfig(c: Config, row: Measurement) {
  const q = structuredClone(c);
  q.shooter.primary.omega = (row.primaryRPM * 2 * Math.PI) / 60;
  const secondary = (row.secondaryRPM * 2 * Math.PI) / 60;
  q.shooter.secondary.omega = secondary;
  if (row.rollerRPMs !== undefined) {
    if (
      !Array.isArray(row.rollerRPMs) ||
      row.rollerRPMs.length !== q.shooter.rollers.length ||
      row.rollerRPMs.some((v) => !Number.isFinite(v) || v < 0)
    )
      throw new Error(
        `Measurement ${row.id}: supply one finite nonnegative RPM per extra hood roller.`,
      );
    q.shooter.rollers.forEach((roller, i) => {
      roller.omega = (row.rollerRPMs![i] * Math.PI) / 30;
    });
  }
  const expectedRPM = (wheelSpeeds(q)[1] * 30) / Math.PI;
  if (
    (q.shooter.link !== "independent" || q.shooter.topology === "passive") &&
    Math.abs(expectedRPM - row.secondaryRPM) > 1 + 1e-9
  )
    throw new Error(
      `Measurement ${row.id}: hood RPM conflicts with the configured ${q.shooter.link} coupling (expected ${expectedRPM.toFixed(1)} RPM). Check the mechanism or measured input settings.`,
    );
  if (
    row.rollerRPMs &&
    (q.shooter.link !== "independent" || q.shooter.topology === "passive")
  ) {
    const expected = wheelSpeeds(q)
      .slice(2)
      .map((w) => (w * 30) / Math.PI);
    if (row.rollerRPMs.some((v, i) => Math.abs(v - expected[i]) > 1 + 1e-9))
      throw new Error(
        `Measurement ${row.id}: extra hood RPM conflicts with the configured coupling.`,
      );
  }
  q.shooter.hoodAngle = (row.hoodDeg * Math.PI) / 180;
  if (row.robot) q.robot = structuredClone(row.robot);
  return q;
}
function residuals(
  c: Config,
  rows: Measurement[],
  ballModel?: BallModelSettings,
  unavailable: string[] = [],
) {
  const residual: number[] = [];
  for (const row of rows) {
    const q = measurementConfig(c, row);
    const inertia = launchInertia(q, ballModel);
    const s = simulate(q, inertia, ballModel);
    if (!s.shooter.exited) {
      unavailable.push(`${row.id}: ball did not exit the shooter.`);
      const observations =
        Number(row.exitVelocity !== undefined) +
        Number(row.spinRPM !== undefined) +
        (row.impact ? 3 : 0);
      residual.push(...Array<number>(observations).fill(1e6));
      continue;
    }
    if (row.exitVelocity !== undefined)
      residual.push((s.shooter.speed - row.exitVelocity) / 0.1);
    if (row.spinRPM !== undefined)
      residual.push(((s.shooter.spin * 60) / (2 * Math.PI) - row.spinRPM) / 50);
    if (row.impact && row.time !== undefined) {
      const f = flight(
        s.origin,
        s.velocity,
        s.spin,
        q,
        false,
        [],
        inertia,
        ballModel,
      );
      const end = f.samples.at(-1)!.t;
      if (row.time > end + 1e-9) {
        unavailable.push(
          `${row.id}: no predicted position at ${row.time.toFixed(3)} s; free flight ended at ${end.toFixed(3)} s. Supply a pre-impact observation or use a model that resolves the later motion.`,
        );
        residual.push(1e6, 1e6, 1e6);
        continue;
      }
      const p = sampleAt(f.samples, row.time).p;
      for (let j = 0; j < 3; j++) residual.push((p[j] - row.impact[j]) / 0.01);
    }
  }
  return residual;
}
export const MEASUREMENT_LIMITS = { rows: 500, idLength: 100, rpm: 50_000 };
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** One validator for pasted, stored and shared measurement rows. */
export function parseMeasurements(value: unknown, maxTime = 30): Measurement[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error("Enter at least one measured shot.");
  if (value.length > MEASUREMENT_LIMITS.rows)
    throw new Error(
      `At most ${MEASUREMENT_LIMITS.rows} measured shots are accepted.`,
    );
  const ids = new Set<string>();
  return value.map((raw, index) => {
    const at = `Row ${index + 1}`;
    if (!isRecord(raw)) throw new Error(`${at}: expected an object.`);
    const {
      id,
      split,
      primaryRPM,
      secondaryRPM,
      rollerRPMs,
      hoodDeg,
      exitVelocity,
      spinRPM,
      impact,
      time,
      robot,
    } = raw;
    if (
      typeof id !== "string" ||
      !id.trim() ||
      id.length > MEASUREMENT_LIMITS.idLength
    )
      throw new Error(`${at}: id must be a nonempty string (≤100 chars).`);
    if (ids.has(id)) throw new Error(`${at}: duplicate id "${id}".`);
    ids.add(id);
    if (split !== "training" && split !== "validation")
      throw new Error(`${id}: split must be "training" or "validation".`);
    const rpm = (v: unknown) =>
      finite(v) && v >= 0 && v <= MEASUREMENT_LIMITS.rpm;
    if (!rpm(primaryRPM) || !rpm(secondaryRPM))
      throw new Error(
        `${id}: primaryRPM/secondaryRPM must be finite, 0…${MEASUREMENT_LIMITS.rpm}.`,
      );
    if (
      rollerRPMs !== undefined &&
      (!Array.isArray(rollerRPMs) || !rollerRPMs.every(rpm))
    )
      throw new Error(`${id}: rollerRPMs must be finite RPM values.`);
    if (!finite(hoodDeg) || Math.abs(hoodDeg) > 180)
      throw new Error(`${id}: hoodDeg must be finite, −180…180.`);
    if (
      exitVelocity !== undefined &&
      (!finite(exitVelocity) || exitVelocity < 0 || exitVelocity > 100)
    )
      throw new Error(`${id}: exitVelocity must be finite, 0…100 m/s.`);
    if (spinRPM !== undefined && (!finite(spinRPM) || Math.abs(spinRPM) > 1e5))
      throw new Error(`${id}: spinRPM must be finite, |spin| ≤ 100000.`);
    if (impact !== undefined) {
      if (
        !Array.isArray(impact) ||
        impact.length !== 3 ||
        !impact.every(finite)
      )
        throw new Error(`${id}: impact must be finite [x, y, z].`);
      if (!finite(time) || time <= 0 || time > maxTime)
        throw new Error(
          `${id}: impact requires a measured time within the integration horizon.`,
        );
    } else if (time !== undefined)
      throw new Error(`${id}: time is only meaningful with impact.`);
    if (
      exitVelocity === undefined &&
      spinRPM === undefined &&
      impact === undefined
    )
      throw new Error(
        `${id}: each row needs at least one observed measurement.`,
      );
    if (robot !== undefined && !isRecord(robot))
      throw new Error(`${id}: robot must be a RobotConfig object.`);
    return structuredClone<Measurement>({
      id,
      split,
      primaryRPM: primaryRPM as number,
      secondaryRPM: secondaryRPM as number,
      ...(rollerRPMs !== undefined
        ? { rollerRPMs: rollerRPMs as number[] }
        : {}),
      hoodDeg,
      ...(exitVelocity !== undefined ? { exitVelocity } : {}),
      ...(spinRPM !== undefined ? { spinRPM } : {}),
      ...(impact !== undefined
        ? { impact: impact as Vec3, time: time as number }
        : {}),
      ...(robot !== undefined
        ? { robot: robot as unknown as Config["robot"] }
        : {}),
    });
  });
}

/** Fingerprint of everything that determines a predicted shot, minus name and the badge flag. */
export function calibrationStamp(c: Config, ballModel: BallModelSettings) {
  // 2×32-bit FNV-1a: a compact consistency check for files/links, not a security hash.
  const text = physicsStamp({ ...c, name: "", calibrated: false }, ballModel);
  let a = 0x811c9dc5,
    b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    a = Math.imul(a ^ ch, 0x01000193) >>> 0;
    b = Math.imul(b ^ ch, 0x5bd1e995) >>> 0;
  }
  return `v1-${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

export interface CalibrationVerification {
  validationCount: number;
  validationRMSE: number | null;
  validationMaxError: number | null;
  unavailable: string[];
  passed: boolean;
}
/**
 * Re-evaluate stored held-out measurements against the *current* model, with
 * the same thresholds as `calibrate`. Never trusts a stored pass/fail flag.
 */
export function verifyCalibration(
  c: Config,
  rows: Measurement[],
  ballModel?: BallModelSettings,
): CalibrationVerification {
  const validation = rows.filter((r) => r.split === "validation");
  const unavailable: string[] = [];
  const r = residuals(c, validation, ballModel, unavailable);
  const validationRMSE = r.length
    ? Math.sqrt(r.reduce((s, x) => s + x * x, 0) / r.length)
    : null;
  const validationMaxError = r.length ? Math.max(...r.map(Math.abs)) : null;
  return {
    validationCount: validation.length,
    validationRMSE,
    validationMaxError,
    unavailable,
    passed:
      validation.length > 0 &&
      unavailable.length === 0 &&
      validationRMSE !== null &&
      validationRMSE <= 1 &&
      validationMaxError !== null &&
      validationMaxError <= 2,
  };
}
export function calibrate(
  c: Config,
  rows: Measurement[],
  params: FitParameter[],
  progress: Progress,
  ballModel?: BallModelSettings,
): CalibrationResult {
  for (const row of rows) {
    if (
      row.exitVelocity === undefined &&
      row.spinRPM === undefined &&
      !row.impact
    )
      throw new Error(
        "Each calibration row needs at least one observed measurement.",
      );
    if (
      ![row.primaryRPM, row.secondaryRPM, row.hoodDeg].every(Number.isFinite) ||
      row.primaryRPM < 0 ||
      row.secondaryRPM < 0 ||
      !["training", "validation"].includes(row.split)
    )
      throw new Error("Invalid measurement input settings.");
    if (
      row.exitVelocity !== undefined &&
      (!Number.isFinite(row.exitVelocity) || row.exitVelocity < 0)
    )
      throw new Error("Measured exit speed must be finite and nonnegative.");
    if (row.spinRPM !== undefined && !Number.isFinite(row.spinRPM))
      throw new Error("Measured spin must be finite.");
    if (
      row.impact &&
      (row.impact.length !== 3 ||
        !row.impact.every(Number.isFinite) ||
        row.time === undefined ||
        !Number.isFinite(row.time) ||
        row.time <= 0 ||
        row.time > c.simulation.maxTime)
    )
      throw new Error(
        "Position measurement requires finite XYZ and a flight time within the integration horizon.",
      );
  }
  if (!params.length) throw new Error("Select at least one fitting parameter.");
  for (const p of params) {
    if (
      ![p.min, p.max, p.value].every(Number.isFinite) ||
      p.min >= p.max ||
      p.value < p.min ||
      p.value > p.max
    )
      throw new Error("Invalid fit parameter bounds.");
    if (
      (p.key === "transfer" && c.shooter.mode !== "recalc") ||
      (["friction", "stiffness"].includes(p.key) &&
        c.shooter.mode !== "physical")
    )
      throw new Error(
        "Selected fit parameter is inactive for this shooter model.",
      );
  }
  const training = rows.filter((r) => r.split === "training"),
    validation = rows.filter((r) => r.split === "validation");
  if (!training.length) throw new Error("Add measured training shots first.");
  if (training.some((r) => r.impact && r.time === undefined))
    throw new Error("Impact measurements require time in seconds.");
  const p = structuredClone(params);
  const objective = (p: FitParameter[]) => {
    const r = residuals(applyParameters(c, p), training, ballModel);
    if (!r.length) throw new Error("Measurements contain no observed values.");
    return (
      r.reduce(
        (s, x) => s + (Math.abs(x) <= 2 ? x * x : 4 * Math.abs(x) - 4),
        0,
      ) / r.length
    );
  };
  let best = objective(p);
  // Bounded derivative-free nonlinear least squares with Huber loss.
  let steps = p.map((x) => (x.max - x.min) * 0.15);
  let iteration = 0;
  for (; iteration < 70; iteration++) {
    let improved = false;
    for (let j = 0; j < p.length; j++) {
      const start = p[j].value;
      let chosen = start;
      for (const sign of [-1, 1]) {
        p[j].value = clamp(start + sign * steps[j], p[j].min, p[j].max);
        const e = objective(p);
        if (e < best) {
          best = e;
          chosen = p[j].value;
          improved = true;
        }
      }
      p[j].value = chosen;
    }
    if (!improved) steps = steps.map((s) => s * 0.55);
    progress((iteration + 1) / 70);
    if (steps.every((s, j) => s / (p[j].max - p[j].min) < 1e-5)) break;
  }
  const rmse = (data: Measurement[]) => {
    const r = residuals(applyParameters(c, p), data, ballModel);
    return r.length
      ? Math.sqrt(r.reduce((s, x) => s + x * x, 0) / r.length)
      : null;
  };
  const warnings = [
    "Residuals normalized by 0.1 m/s, 50 RPM and 10 mm. Parameter identifiability requires varied shots.",
  ];
  if (!validation.length)
    warnings.push(
      "No held-out validation shots; experimental accuracy not established.",
    );
  for (const x of p)
    if (Math.abs(x.value - x.min) < 1e-4 || Math.abs(x.value - x.max) < 1e-4)
      warnings.push(`${x.key} reached a parameter bound.`);
  const trainingUnavailable: string[] = [],
    validationUnavailable: string[] = [];
  residuals(applyParameters(c, p), training, ballModel, trainingUnavailable);
  const validationResiduals = residuals(
    applyParameters(c, p),
    validation,
    ballModel,
    validationUnavailable,
  );
  const validationRMSE = rmse(validation);
  const validationMaxError = validationResiduals.length
    ? Math.max(...validationResiduals.map(Math.abs))
    : null;
  const validationPassed =
    trainingUnavailable.length === 0 &&
    validationUnavailable.length === 0 &&
    validationRMSE !== null &&
    validationRMSE <= 1 &&
    validationMaxError !== null &&
    validationMaxError <= 2;
  if (validation.length && !validationPassed)
    warnings.push(
      "Held-out errors exceed the validation limits: normalized RMSE ≤ 1 and every residual ≤ 2.",
    );
  warnings.push(...trainingUnavailable, ...validationUnavailable);
  return {
    parameters: p,
    trainingRMSE: rmse(training)!,
    validationRMSE,
    validationPassed,
    validationMaxError,
    trainingCount: training.length,
    validationCount: validation.length,
    iterations: iteration + 1,
    warnings,
  };
}
