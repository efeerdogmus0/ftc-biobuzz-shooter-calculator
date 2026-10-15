import type { Box, Config, Sample, Vec3 } from "./types";
import {
  aim,
  flight,
  segmentBox,
  shooterPose,
  targetBasis,
  targetBoxes,
  targetLocal,
} from "./flight";
import { simulateShooter, spinVector } from "./shooter";
import { dot, sub } from "./math";
import { hiveCells, hiveCellTarget } from "../field/hiveGeometry";

/**
 * Launch-elevation study over legal robot positions. The turret always aims
 * at the active CELL, so chassis heading only matters for the footprint,
 * which is excluded conservatively by its circumscribed circle (all headings).
 * Exit speed is prescribed directly (the contact model is bypassed); spin
 * uses the configured shooter's spin/speed ratio.
 */
export interface StudyOptions {
  spacing: number;
  angles: number[];
  speedMin: number;
  speedMax: number;
  /** Speed-window edge resolution, m/s. */
  speedTolerance: number;
  /** Also reject paths through the rendered HIVE solids that the flight
   * collision set omits (inactive CELLS, side frames, arms). */
  extendedHive: boolean;
}

export interface SpeedWindow {
  angle: number;
  lo: number;
  hi: number;
}

export type Zone = "front" | "side" | "back";

export interface PositionStudy {
  x: number;
  y: number;
  zone: Zone;
  /** Horizontal distance from the launch point to the CELL opening center. */
  distance: number;
  windows: SpeedWindow[];
}

/** Rendered HIVE structure that is not in the flight collision set, as
 * capsules [a, b, radius] (see HiveModel). Approximate, visual-model geometry. */
export function hiveExtraSolids(c: Config) {
  const h = c.field.hive,
    x = h.frameWidth / 2,
    y = h.frameDepth / 2,
    z = h.pivotHeight;
  const capsules: [Vec3, Vec3, number][] = [];
  for (const side of [-x, x])
    for (const foot of [-y, y])
      capsules.push([[side, foot, 0], [side, 0, z], 0.016]);
  const boxes: { target: ReturnType<typeof hiveCellTarget>; boxes: Box[] }[] =
    [];
  for (const cell of hiveCells(c.field)) {
    const target = hiveCellTarget(cell, c.field);
    const { u, v, n } = targetBasis(target);
    const local: Vec3 = [0, -target.height / 2 - 0.02, -target.depth / 2];
    const mount: Vec3 = [0, 1, 2].map(
      (i) =>
        target.center[i] + u[i] * local[0] + v[i] * local[1] + n[i] * local[2],
    ) as Vec3;
    capsules.push([[cell.center[0], 0, z], mount, 0.018]);
    if (!cell.active) boxes.push({ target, boxes: targetBoxes(target) });
  }
  return { capsules, boxes };
}

function segmentSegmentDistance(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3) {
  // Closest points between two segments (Ericson, Real-Time Collision Detection 5.1.9).
  const d1 = sub(q1, p1),
    d2 = sub(q2, p2),
    r = sub(p1, p2);
  const a = dot(d1, d1),
    e = dot(d2, d2),
    f = dot(d2, r);
  let s = 0,
    t = 0;
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  if (a <= 1e-12 && e <= 1e-12) return Math.hypot(...r);
  if (a <= 1e-12) t = clamp01(f / e);
  else {
    const c = dot(d1, r);
    if (e <= 1e-12) s = clamp01(-c / a);
    else {
      const b = dot(d1, d2),
        denom = a * e - b * b;
      s = denom > 1e-12 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  const c1 = [0, 1, 2].map((i) => p1[i] + d1[i] * s),
    c2 = [0, 1, 2].map((i) => p2[i] + d2[i] * t);
  return Math.hypot(c1[0] - c2[0], c1[1] - c2[1], c1[2] - c2[2]);
}

/** True if the sampled path, up to time `until`, touches an extra HIVE solid. */
export function hitsExtraSolids(
  samples: Sample[],
  until: number,
  radius: number,
  solids: ReturnType<typeof hiveExtraSolids>,
) {
  for (let i = 1; i < samples.length && samples[i - 1].t < until; i++) {
    const a = samples[i - 1].p,
      b = samples[i].p;
    for (const [p, q, w] of solids.capsules)
      if (segmentSegmentDistance(a, b, p, q) < radius + w) return true;
    for (const cell of solids.boxes) {
      const la = targetLocal(a, cell.target),
        lb = targetLocal(b, cell.target);
      for (const box of cell.boxes)
        if (segmentBox(la, lb, box, radius) !== null) return true;
    }
  }
  return false;
}

const EPS = 1e-9;

export function legalPositions(c: Config, spacing: number) {
  const half = c.field.size / 2,
    margin = Math.hypot(c.robot.width, c.robot.length) / 2;
  const count = Math.floor((c.field.size - 2 * margin) / spacing) + 1;
  const offset = (c.field.size - 2 * margin - (count - 1) * spacing) / 2;
  const out: [number, number][] = [];
  for (let i = 0; i < count; i++)
    for (let j = 0; j < count; j++) {
      const x = -half + margin + offset + i * spacing,
        y = -half + margin + offset + j * spacing;
      const blocked = c.field.obstacles.some((box) => {
        const nx = Math.max(box.min[0], Math.min(x, box.max[0]));
        const ny = Math.max(box.min[1], Math.min(y, box.max[1]));
        return Math.hypot(x - nx, y - ny) <= margin;
      });
      if (!blocked) out.push([x, y]);
    }
  return out;
}

/** Front: the opening side of the HIVE footprint; back: the far side. */
export function zoneOf(c: Config, y: number): Zone {
  const d = c.field.hive.frameDepth / 2,
    normal = targetBasis(c.field.target).n[1];
  const ahead = normal < 0 ? -y : y;
  return ahead > d ? "front" : ahead < -d ? "back" : "side";
}

/** Shot evaluator at one robot position with the turret aimed at the CELL. */
export function positionShooter(
  c: Config,
  x: number,
  y: number,
  extended: boolean,
) {
  const q = structuredClone(c);
  q.robot.x = x;
  q.robot.y = y;
  q.robot.velocity = [0, 0, 0];
  const aimed = aim(q),
    { origin, yaw } = shooterPose(aimed);
  const s = simulateShooter(aimed),
    spinRatio = s.speed > 0 ? s.spin / s.speed : 0;
  const target = aimed.field.target,
    { n } = targetBasis(target),
    direction: Vec3 = [Math.cos(yaw), Math.sin(yaw), 0];
  const radius = aimed.projectile.diameter / 2;
  const solids = extended ? hiveExtraSolids(aimed) : null;
  const launch = (angle: number, speed: number) => {
    const velocity: Vec3 = [
      speed * Math.cos(angle) * Math.cos(yaw),
      speed * Math.cos(angle) * Math.sin(yaw),
      speed * Math.sin(angle),
    ];
    return { velocity, spin: spinVector(yaw, spinRatio * speed) };
  };
  /** Signed along-shot distance of the inward opening-plane crossing from the
   * opening center; −Infinity if the ball never crosses inward. */
  const residual = (angle: number, speed: number) => {
    const { velocity, spin } = launch(angle, speed);
    const f = flight(origin, velocity, spin, aimed, false);
    for (let i = 1; i < f.samples.length; i++) {
      const a = f.samples[i - 1],
        b = f.samples[i];
      const da = targetLocal(a.p, target)[2],
        db = targetLocal(b.p, target)[2];
      if (da > 0 && db <= 0 && dot(b.v, n) < 0) {
        const u = da / (da - db);
        const p = a.p.map((v, j) => v + (b.p[j] - v) * u) as Vec3;
        return dot(sub(p, target.center), direction);
      }
    }
    return -Infinity;
  };
  const hit = (angle: number, speed: number) => {
    const { velocity, spin } = launch(angle, speed);
    const f = flight(origin, velocity, spin, aimed, true);
    if (f.status !== "HIT" || !f.entry) return false;
    return !(solids && hitsExtraSolids(f.samples, f.entry.t, radius, solids));
  };
  const distance = Math.hypot(
    target.center[0] - origin[0],
    target.center[1] - origin[1],
  );
  return { residual, hit, distance, origin };
}

/**
 * Widest contiguous HIT speed window at this elevation, or null. Centered
 * crossings are bracketed on a coarse speed scan (the residual is not
 * monotone for lobs from behind the HIVE), refined by bisection, then each
 * window is grown to its HIT edges. A finite search: windows narrower than
 * the probe spacing around a non-HIT centered path can be missed.
 */
export function speedWindow(
  shooter: ReturnType<typeof positionShooter>,
  angle: number,
  o: StudyOptions,
): SpeedWindow | null {
  const scan = 0.25,
    speeds: number[] = [];
  for (let v = o.speedMin; v <= o.speedMax + EPS; v += scan) speeds.push(v);
  const residuals = speeds.map((v) => shooter.residual(angle, v));
  let best: SpeedWindow | null = null;
  for (let k = 0; k + 1 < speeds.length; k++) {
    if (!(residuals[k] < 0 && residuals[k + 1] >= 0)) continue;
    const w = windowNear(shooter, angle, speeds[k], speeds[k + 1], o);
    if (w && (!best || w.hi - w.lo > best.hi - best.lo)) best = w;
  }
  return best;
}

function windowNear(
  shooter: ReturnType<typeof positionShooter>,
  angle: number,
  below: number,
  above: number,
  o: StudyOptions,
): SpeedWindow | null {
  let lo = below,
    hi = above;
  for (let k = 0; k < 12; k++) {
    const mid = (lo + hi) / 2;
    if (shooter.residual(angle, mid) >= 0) hi = mid;
    else lo = mid;
  }
  let center = (lo + hi) / 2;
  if (!shooter.hit(angle, center)) {
    // The centered path can clip a rim while an off-center path enters.
    const probe = [-1, 1, -2, 2, -4, 4]
      .map((k) => center + k * 0.03)
      .find((v) => v >= o.speedMin && v <= o.speedMax && shooter.hit(angle, v));
    if (probe === undefined) return null;
    center = probe;
  }
  const edge = (sign: number) => {
    let inside = center,
      step = 0.05,
      outside = center + sign * step;
    while (
      outside > o.speedMin &&
      outside < o.speedMax &&
      shooter.hit(angle, outside)
    ) {
      inside = outside;
      step *= 2;
      outside = center + sign * step;
    }
    outside = Math.max(o.speedMin, Math.min(o.speedMax, outside));
    while (Math.abs(outside - inside) > o.speedTolerance) {
      const mid = (inside + outside) / 2;
      if (shooter.hit(angle, mid)) inside = mid;
      else outside = mid;
    }
    return inside;
  };
  return { angle, lo: edge(-1), hi: edge(1) };
}

export function studyPosition(
  c: Config,
  x: number,
  y: number,
  o: StudyOptions,
): PositionStudy {
  const shooter = positionShooter(c, x, y, o.extendedHive);
  const windows = o.angles
    .map((a) => speedWindow(shooter, a, o))
    .filter((w): w is SpeedWindow => w !== null);
  return { x, y, zone: zoneOf(c, y), distance: shooter.distance, windows };
}

/** Relative speed window (hi − lo) / mid: tolerance to exit-speed error. */
export const relativeWindow = (w: SpeedWindow) =>
  (2 * (w.hi - w.lo)) / (w.hi + w.lo);

/**
 * Robustness margin of a window, relative to its mid speed: half the speed
 * window minus the shift of the window center caused by a hood-angle error
 * `angleError` (slope from adjacent feasible elevations). Negative: an
 * angle error alone can push the required speed out of the window. Null when
 * no adjacent elevation is feasible (slope unknown).
 */
export function robustMargin(
  p: PositionStudy,
  w: SpeedWindow,
  angleError: number,
) {
  const mid = (x: SpeedWindow) => (x.lo + x.hi) / 2;
  const i = p.windows.indexOf(w);
  const prev = p.windows[i - 1],
    next = p.windows[i + 1];
  // Only adjacent grid elevations (≤ 3°) define the slope.
  const near = (x: SpeedWindow | undefined) =>
    x && Math.abs(x.angle - w.angle) <= (3 * Math.PI) / 180 ? x : undefined;
  const a = near(prev) ?? w,
    b = near(next) ?? w;
  if (a === b) return null;
  const slope = (mid(b) - mid(a)) / (b.angle - a.angle);
  return ((w.hi - w.lo) / 2 - Math.abs(slope) * angleError) / mid(w);
}

/**
 * Recommended angle: the largest robustness margin against a combined
 * exit-speed error and a hood-angle error (default 1°), among windows
 * starting at or below `speedCap`. Near the minimum-speed angle the required
 * speed barely depends on elevation; at steep angles it changes fast.
 */
export function recommended(
  p: PositionStudy,
  speedCap = Infinity,
  angleError = (Math.PI / 180) * 1,
) {
  const usable = p.windows.filter((w) => w.lo <= speedCap);
  if (!usable.length) return null;
  const score = (w: SpeedWindow) => robustMargin(p, w, angleError) ?? -Infinity;
  return usable.reduce((a, b) => (score(b) > score(a) ? b : a));
}

/** Fraction of positions with at least one feasible angle in [min, max]
 * whose speed window starts at or below `speedCap`. */
export function coverage(
  results: PositionStudy[],
  min: number,
  max: number,
  speedCap = Infinity,
) {
  if (!results.length) return 0;
  const covered = results.filter((p) =>
    p.windows.some(
      (w) => w.angle >= min - EPS && w.angle <= max + EPS && w.lo <= speedCap,
    ),
  ).length;
  return covered / results.length;
}

/** Narrowest [min, max] from the angle grid covering at least `fraction`. */
export function narrowestRange(
  results: PositionStudy[],
  angles: number[],
  fraction: number,
  speedCap = Infinity,
) {
  let best: { min: number; max: number; coverage: number } | null = null;
  for (let i = 0; i < angles.length; i++)
    for (let j = i; j < angles.length; j++) {
      const cov = coverage(results, angles[i], angles[j], speedCap);
      if (cov + EPS < fraction) continue;
      const width = angles[j] - angles[i];
      if (
        !best ||
        width < best.max - best.min - EPS ||
        (Math.abs(width - (best.max - best.min)) < EPS && cov > best.coverage)
      )
        best = { min: angles[i], max: angles[j], coverage: cov };
      break;
    }
  return best;
}
