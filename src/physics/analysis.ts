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
import { simulateShooter } from "./shooter";
import { dot, norm, sub, clamp } from "./math";
export interface Candidate {
  angle: number;
  omega: number;
  speed: number;
  energy: number;
  time: number;
  entryAngle: number;
  clearance: number;
  score: number;
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
): Candidate[] {
  const c = aim(input),
    results: Candidate[] = [];
  const n = fast ? 8 : 24;
  const { origin, yaw } = shooterPose(c);
  const direction: Vec3 = [Math.cos(yaw), Math.sin(yaw), 0];
  const target = c.field.target;
  const trial = (omega: number, angle: number) => {
    c.shooter.primary.omega = omega;
    c.shooter.hoodAngle = angle;
    const s = simulateShooter(c);
    const pitch = angle + c.shooter.hoodOffset;
    const velocity: Vec3 = [
      s.speed * Math.cos(pitch) * Math.cos(yaw),
      s.speed * Math.cos(pitch) * Math.sin(yaw),
      s.speed * Math.sin(pitch),
    ];
    if (c.robot.inheritVelocity)
      for (let j = 0; j < 3; j++) velocity[j] += c.robot.velocity[j];
    const spin: Vec3 = [-Math.sin(yaw) * s.spin, Math.cos(yaw) * s.spin, 0];
    const f = flight(origin, velocity, spin, c, false);
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
    const shot = simulate(c),
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
): CoverageCell[] {
  const cells: CoverageCell[] = [];
  const half = c.field.size / 2,
    margin = Math.hypot(c.robot.width, c.robot.length) / 2;
  const count = Math.floor((c.field.size - 2 * margin) / spacing) + 1;
  for (let i = 0; i < count; i++)
    for (let j = 0; j < count; j++) {
      const q = structuredClone(c);
      q.robot.x = -half + margin + i * spacing;
      q.robot.y = -half + margin + j * spacing;
      const candidate = solve(q, () => {}, true)[0] ?? null;
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
    const s = simulate(q);
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
function residuals(c: Config, rows: Measurement[]) {
  const residual: number[] = [];
  for (const row of rows) {
    const q = structuredClone(c);
    q.shooter.primary.omega = (row.primaryRPM * 2 * Math.PI) / 60;
    q.shooter.secondary.omega = (row.secondaryRPM * 2 * Math.PI) / 60;
    q.shooter.link = "independent";
    q.shooter.hoodAngle = (row.hoodDeg * Math.PI) / 180;
    if (row.robot) q.robot = row.robot;
    const s = simulate(q);
    if (row.exitVelocity !== undefined)
      residual.push((s.shooter.speed - row.exitVelocity) / 0.1);
    if (row.spinRPM !== undefined)
      residual.push(((s.shooter.spin * 60) / (2 * Math.PI) - row.spinRPM) / 50);
    if (row.impact && row.time !== undefined) {
      const f = flight(s.origin, s.velocity, s.spin, q, false);
      const p = sampleAt(f.samples, row.time).p;
      for (let j = 0; j < 3; j++) residual.push((p[j] - row.impact[j]) / 0.01);
    }
  }
  return residual;
}
export function calibrate(
  c: Config,
  rows: Measurement[],
  params: FitParameter[],
  progress: Progress,
): CalibrationResult {
  const training = rows.filter((r) => r.split === "training"),
    validation = rows.filter((r) => r.split === "validation");
  if (!training.length) throw new Error("Add measured training shots first.");
  if (training.some((r) => r.impact && r.time === undefined))
    throw new Error("Impact measurements require time in seconds.");
  const p = structuredClone(params);
  const objective = (p: FitParameter[]) => {
    const r = residuals(applyParameters(c, p), training);
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
    const r = residuals(applyParameters(c, p), data);
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
  return {
    parameters: p,
    trainingRMSE: rmse(training)!,
    validationRMSE: rmse(validation),
    trainingCount: training.length,
    validationCount: validation.length,
    iterations: iteration + 1,
    warnings,
  };
}
