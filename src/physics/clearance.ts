import type { Config, Vec3 } from "./types";
import { flight, sampleAt } from "./flight";
import { simulateShooter, spinVector } from "./shooter";
import { deg } from "../utils/units";

/**
 * Swept-volume clearance of the ball around a hooded flywheel, in the TURRET
 * frame: x forward along the shot azimuth from the turret axis, y to the left,
 * z up from the floor. The shooter's vertical plane is y = wheelLateral.
 *
 * Hood model: during contact the ball center rides a circle of radius
 * `hoodRadius` around the wheel axis, moving over the back/top of the wheel
 * (the wheel is below the ball, as in `spinVector`). It releases tangentially;
 * a launch elevation α therefore releases at polar angle 90° + α measured from
 * +x, i.e. at (−R_h sin α, R_h cos α) from the wheel center. Contact starts
 * `contactWrap` earlier along the circle. The feed path before hood contact is
 * not modeled.
 */
export interface ShooterGeometry {
  wheelDiameter: number;
  /** Wheel axis height above the floor. */
  wheelCenterHeight: number;
  /** Wheel axis offset from the turret axis along the shot direction. */
  wheelForward: number;
  /** Wheel-plane offset from the turret axis, to the left. */
  wheelLateral: number;
  /** Ball-center path radius about the wheel axis; null derives
   * R_wheel + r_ball − compression. */
  hoodRadius: number | null;
  compression: number;
  /** Arc of the ball-center path in hood contact before release, rad. */
  contactWrap: number;
  ballDiameter: number;
}

/** One launch: elevation (rad), exit speed (m/s), spin (rad/s, + = backspin). */
export interface EnvelopeShot {
  elevation: number;
  speed: number;
  spin: number;
}

export interface ClearanceOptions {
  /** Stop tracing once the ball center is this far ahead of the wheel axis. */
  clearForward: number;
  /** ...or this far above it. */
  clearUp: number;
  /** Ball-center path resolution, m. */
  pathStep: number;
  stationMin: number;
  stationMax: number;
  stationStep: number;
}

export const defaultClearanceOptions: ClearanceOptions = {
  clearForward: 1.5,
  clearUp: 0.6,
  pathStep: 0.002,
  stationMin: -0.2,
  stationMax: 1.5,
  stationStep: 0.01,
};

/**
 * PLACEHOLDER geometry: the CAD is not finished. Wheel and ball follow the
 * "96mm Rhino + 3× Sushi Hood" preset (96 mm wheel, 8 mm compression, 2.8 in
 * POLLEN); the 110° wrap is that preset's hood start/end span. Wheel height
 * (0.30 m) and forward offset (0.12 m) are guesses near the preset's 347 mm /
 * 120 mm exit point. Replace every value with CAD numbers.
 */
export const placeholderGeometry: ShooterGeometry = {
  wheelDiameter: 0.096,
  wheelCenterHeight: 0.3,
  wheelForward: 0.12,
  wheelLateral: 0,
  hoodRadius: null,
  compression: 0.008,
  contactWrap: deg(110),
  ballDiameter: 2.8 * 0.0254,
};

export function hoodPathRadius(g: ShooterGeometry) {
  return (
    g.hoodRadius ?? g.wheelDiameter / 2 + g.ballDiameter / 2 - g.compression
  );
}

/** Ball-center release point relative to the wheel axis, [s, z]. */
export function releasePoint(g: ShooterGeometry, elevation: number) {
  const R = hoodPathRadius(g);
  return [-R * Math.sin(elevation), R * Math.cos(elevation)] as const;
}

/** Ball-center path of one shot relative to the wheel axis: [s, lateral, z]. */
export interface ShotPath {
  shot: EnvelopeShot;
  points: Vec3[];
  /** Index of the release point; earlier points are hood contact. */
  release: number;
  /** Largest |lateral| deviation from the shooter plane during free flight. */
  lateral: number;
}

export function shotPath(
  g: ShooterGeometry,
  shot: EnvelopeShot,
  c: Config,
  o: ClearanceOptions = defaultClearanceOptions,
): ShotPath {
  const R = hoodPathRadius(g),
    r = g.ballDiameter / 2,
    a = shot.elevation;
  const points: Vec3[] = [];
  const release = Math.PI / 2 + a;
  const arcSteps = Math.max(1, Math.ceil((g.contactWrap * R) / o.pathStep));
  for (let i = 0; i <= arcSteps; i++) {
    const phi = release + (g.contactWrap * (arcSteps - i)) / arcSteps;
    points.push([R * Math.cos(phi), 0, R * Math.sin(phi)]);
  }
  const q = structuredClone(c);
  q.projectile.diameter = g.ballDiameter;
  // Turret-frame envelope: still air, no robot motion.
  q.environment.wind = [0, 0, 0];
  const [s0, z0] = releasePoint(g, a);
  const origin: Vec3 = [
    g.wheelForward + s0,
    g.wheelLateral,
    g.wheelCenterHeight + z0,
  ];
  const velocity: Vec3 = [
    shot.speed * Math.cos(a),
    0,
    shot.speed * Math.sin(a),
  ];
  const f = flight(origin, velocity, spinVector(0, shot.spin), q, false);
  const end = f.samples[f.samples.length - 1].t;
  const dt = o.pathStep / Math.max(shot.speed, 0.1);
  let lateral = 0;
  for (let t = dt; t <= end + dt / 2; t += dt) {
    const p = sampleAt(f.samples, Math.min(t, end)).p;
    const local: Vec3 = [
      p[0] - g.wheelForward,
      p[1] - g.wheelLateral,
      p[2] - g.wheelCenterHeight,
    ];
    points.push(local);
    lateral = Math.max(lateral, Math.abs(local[1]));
    if (local[0] > o.clearForward || local[2] > o.clearUp) break;
    // The floor ends the flight; r keeps the ball surface on the floor.
    if (p[2] <= r + 1e-9) break;
  }
  return { shot, points, release: arcSteps, lateral };
}

/** Vertical extent of the swept ball at one horizontal station in the
 * shooter plane, heights relative to the wheel axis. */
export interface StationEnvelope {
  s: number;
  /** Lowest ball-surface height at this station, or null if never reached. */
  min: number | null;
  max: number | null;
  /** Disjoint occupied height intervals (merged across all shots). */
  intervals: [number, number][];
}

export interface ClearanceEnvelope {
  geometry: ShooterGeometry;
  hoodRadius: number;
  ballRadius: number;
  paths: ShotPath[];
  stations: StationEnvelope[];
  /** Largest lateral deviation of any ball center from the shooter plane. */
  lateralDeviation: number;
  /** Swept-tube half-width without margin: r_ball + lateral deviation. */
  halfWidth: number;
}

function merge(intervals: [number, number][], gap: number) {
  intervals.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [lo, hi] of intervals) {
    const last = out[out.length - 1];
    if (last && lo <= last[1] + gap) last[1] = Math.max(last[1], hi);
    else out.push([lo, hi]);
  }
  return out;
}

export function clearanceEnvelope(
  g: ShooterGeometry,
  shots: EnvelopeShot[],
  c: Config,
  o: ClearanceOptions = defaultClearanceOptions,
): ClearanceEnvelope {
  const r = g.ballDiameter / 2;
  const paths = shots.map((shot) => shotPath(g, shot, c, o));
  const count = Math.round((o.stationMax - o.stationMin) / o.stationStep) + 1;
  const raw: [number, number][][] = Array.from({ length: count }, () => []);
  for (const path of paths)
    for (const p of path.points) {
      const first = Math.max(
        0,
        Math.ceil((p[0] - r - o.stationMin) / o.stationStep),
      );
      const last = Math.min(
        count - 1,
        Math.floor((p[0] + r - o.stationMin) / o.stationStep),
      );
      for (let k = first; k <= last; k++) {
        const dx = o.stationMin + k * o.stationStep - p[0];
        // Section of the ball at the shooter plane (lateral offset p[1]).
        const h2 = r * r - dx * dx - p[1] * p[1];
        if (h2 < 0) continue;
        const h = Math.sqrt(h2);
        raw[k].push([p[2] - h, p[2] + h]);
      }
    }
  const stations = raw.map((list, k): StationEnvelope => {
    const intervals = merge(list, o.pathStep);
    return {
      s: o.stationMin + k * o.stationStep,
      min: intervals.length ? intervals[0][0] : null,
      max: intervals.length ? Math.max(...intervals.map((i) => i[1])) : null,
      intervals,
    };
  });
  const lateralDeviation = Math.max(0, ...paths.map((p) => p.lateral));
  return {
    geometry: g,
    hoodRadius: hoodPathRadius(g),
    ballRadius: r,
    paths,
    stations,
    lateralDeviation,
    halfWidth: r + lateralDeviation,
  };
}

function segmentDistance(p: Vec3, a: Vec3, b: Vec3) {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const u =
    len2 > 0
      ? Math.max(
          0,
          Math.min(
            1,
            ((p[0] - a[0]) * d[0] +
              (p[1] - a[1]) * d[1] +
              (p[2] - a[2]) * d[2]) /
              len2,
          ),
        )
      : 0;
  return Math.hypot(
    p[0] - a[0] - u * d[0],
    p[1] - a[1] - u * d[1],
    p[2] - a[2] - u * d[2],
  );
}

/** Distance from a turret-frame point to the nearest ball surface of any shot
 * (negative inside the swept volume). Only the traced part of each flight,
 * up to the clear-forward/clear-up limits, is considered. */
export function surfaceDistance(e: ClearanceEnvelope, point: Vec3) {
  const g = e.geometry;
  const p: Vec3 = [
    point[0] - g.wheelForward,
    point[1] - g.wheelLateral,
    point[2] - g.wheelCenterHeight,
  ];
  let best = Infinity;
  for (const path of e.paths)
    for (let i = 1; i < path.points.length; i++)
      best = Math.min(
        best,
        segmentDistance(p, path.points[i - 1], path.points[i]),
      );
  return best - e.ballRadius;
}

/** True if a structure point (turret frame) stays at least `margin` from the
 * ball surface for every shot in the envelope. */
export function isClear(e: ClearanceEnvelope, point: Vec3, margin = 0) {
  return surfaceDistance(e, point) >= margin;
}

export function stationAt(e: ClearanceEnvelope, s: number) {
  return e.stations.reduce((a, b) =>
    Math.abs(b.s - s) < Math.abs(a.s - s) ? b : a,
  );
}

/**
 * Safe heights on the vertical line at station s (relative to the wheel axis):
 * a structure is clear below `below` or above `above`, including the margin.
 * `clearAll` means the ball never reaches this line (|s| is outside the swept
 * profile), so any height is clear.
 */
export function safeHeights(e: ClearanceEnvelope, s: number, margin = 0) {
  const st = stationAt(e, s);
  if (st.min === null || st.max === null)
    return { s: st.s, clearAll: true, below: null, above: null };
  return {
    s: st.s,
    clearAll: false,
    below: st.min - margin,
    above: st.max + margin,
  };
}

/**
 * Shot set from the current shooter model: every elevation × exit speed, with
 * spin scaled from the model's spin/speed ratio at the configured wheel speed
 * (≈ 0 for the matched-speed powered hood).
 */
export function shotsFromConfig(
  c: Config,
  elevations: number[],
  speeds: number[],
): EnvelopeShot[] {
  const s = simulateShooter(c);
  const ratio = s.speed > 0 ? s.spin / s.speed : 0;
  return elevations.flatMap((elevation) =>
    speeds.map((speed) => ({ elevation, speed, spin: ratio * speed })),
  );
}

/** Evenly spaced values from a to b inclusive. */
export function range(a: number, b: number, n: number) {
  return n <= 1
    ? [a]
    : Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}
