// The shot table a team takes to its robot: distance to the HIVE → wheel RPM
// and launch angle. Built from the saved shot points or from a distance sweep,
// written out as CSV, an FTC Java constants class or a printable sheet.
// Pure functions: no store, safe in a worker.
import { solve, type Candidate } from "../physics/analysis";
import { shooterPose } from "../physics/flight";
import type { BallModelSettings } from "../physics/launchDynamics";
import type { Config } from "../physics/types";
import { placed } from "../app/placement";
import type { ShotPoint } from "../utils/scenario";

const DEG = 180 / Math.PI;
const toRPM = (omega: number) => (omega * 30) / Math.PI;

export interface ShotRow {
  name: string;
  /** Ground distance shooter exit → HIVE centre (m), as the shot card shows it. */
  distance: number;
  /** Robot centre (m) and the direction the shooter faces (rad). */
  x: number;
  y: number;
  heading: number;
  rpm: number;
  /** Launch angle above horizontal (deg): hood angle + hood offset. */
  angle: number;
  /** Ball-to-HIVE-edge margin of the simulated shot (mm). */
  clearance: number;
  /** Monte Carlo hit rate 0–1, if measured at this point. */
  reliability?: number;
  source: ShotPoint["source"] | "sweep";
}

function rowAt(
  c: Config,
  x: number,
  y: number,
  hoodAngle: number,
  omega: number,
  clearance: number,
): Omit<ShotRow, "name" | "source"> {
  const q = placed(c, x, y, hoodAngle, omega);
  const { origin, yaw } = shooterPose(q);
  const t = q.field.target.center;
  return {
    distance: Math.hypot(t[0] - origin[0], t[1] - origin[1]),
    x,
    y,
    heading: yaw,
    rpm: toRPM(omega),
    angle: (q.shooter.hoodAngle + q.shooter.hoodOffset) * DEG,
    clearance: clearance * 1000,
  };
}

/** One row per saved point, nearest first. */
export function rowsFromPoints(c: Config, points: ShotPoint[]): ShotRow[] {
  return points
    .map((p) => ({
      name: p.name,
      ...rowAt(c, p.x, p.y, p.hoodAngle, p.omega, p.clearance),
      ...(p.reliability !== undefined ? { reliability: p.reliability } : {}),
      source: p.source,
    }))
    .sort((a, b) => a.distance - b.distance);
}

export interface SweepOptions {
  /** Robot-centre distances from the HIVE centre (m). */
  from: number;
  to: number;
  step: number;
}
export interface SweepResult {
  rows: ShotRow[];
  /** The one launch angle used at every distance (deg), or null if none hit. */
  angle: number | null;
  /** Distances (exit → HIVE, m) where that angle has no hit. */
  misses: number[];
  /** Steps skipped because the robot would leave the field or hit a structure. */
  blocked: number;
  /** Unit direction from the HIVE the robot backed away along. */
  direction: [number, number];
}

/**
 * Backs the robot away from the HIVE along the line through its current
 * position and solves at each step. One launch angle is used for the whole
 * table — the one that scores from the most distances (ties: the widest
 * smallest margin) — so only the wheel speed changes with distance and the
 * robot's linear interpolation between rows stays on real solutions. Steps
 * where the robot would leave the field or overlap a field structure are
 * skipped, as in the coverage scan.
 */
export function sweep(
  c: Config,
  options: SweepOptions,
  ballModel?: BallModelSettings,
  progress: (f: number) => void = () => {},
): SweepResult {
  const t = c.field.target.center;
  let dx = c.robot.x - t[0],
    dy = c.robot.y - t[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    dx = 1;
    dy = 0;
  } else {
    dx /= len;
    dy /= len;
  }
  const half = c.field.size / 2,
    margin = Math.hypot(c.robot.width, c.robot.length) / 2;
  const isBlocked = (x: number, y: number) =>
    Math.abs(x) > half - margin ||
    Math.abs(y) > half - margin ||
    c.field.obstacles.some((box) => {
      const nx = Math.max(box.min[0], Math.min(x, box.max[0]));
      const ny = Math.max(box.min[1], Math.min(y, box.max[1]));
      return Math.hypot(x - nx, y - ny) <= margin;
    });
  const steps: number[] = [];
  for (let d = options.from; d <= options.to + 1e-9; d += options.step)
    steps.push(Math.round(d * 1000) / 1000);
  let blocked = 0;
  const spots: { x: number; y: number; found: Candidate[] }[] = [];
  steps.forEach((d, i) => {
    const x = t[0] + dx * d,
      y = t[1] + dy * d;
    if (isBlocked(x, y)) blocked++;
    else {
      const q = placed(c, x, y, c.shooter.hoodAngle);
      spots.push({
        x,
        y,
        found: solve(q, () => {}, true, ballModel, Infinity),
      });
    }
    progress((i + 1) / steps.length);
  });
  // Every spot is solved on the same angle grid, so angles compare exactly.
  const tally = new Map<number, { hits: number; worst: number }>();
  for (const s of spots)
    for (const v of s.found) {
      const e = tally.get(v.angle) ?? { hits: 0, worst: Infinity };
      tally.set(v.angle, {
        hits: e.hits + 1,
        worst: Math.min(e.worst, v.clearance),
      });
    }
  let angle: number | null = null;
  for (const [a, e] of tally) {
    const best = angle === null ? null : tally.get(angle)!;
    if (
      !best ||
      e.hits > best.hits ||
      (e.hits === best.hits && e.worst > best.worst)
    )
      angle = a;
  }
  const rows: ShotRow[] = [],
    misses: number[] = [];
  for (const s of spots) {
    const v = s.found.find((x) => x.angle === angle);
    if (v)
      rows.push({
        name: `T${rows.length + 1}`,
        ...rowAt(c, s.x, s.y, v.angle, v.omega, v.clearance),
        source: "sweep",
      });
    else
      misses.push(
        rowAt(c, s.x, s.y, angle ?? c.shooter.hoodAngle, 0, 0).distance,
      );
  }
  return {
    rows,
    angle: angle === null ? null : (angle + c.shooter.hoodOffset) * DEG,
    misses,
    blocked,
    direction: [dx, dy],
  };
}

/**
 * Rows a lookup table can use: sorted by distance, one per distance (within
 * 1 cm the wider-margin row wins) so the interpolation is well defined.
 */
export function lookupRows(rows: ShotRow[]): ShotRow[] {
  const out: ShotRow[] = [];
  for (const r of [...rows].sort((a, b) => a.distance - b.distance)) {
    const last = out.at(-1);
    if (last && r.distance - last.distance < 0.01) {
      if (r.clearance > last.clearance) out[out.length - 1] = r;
    } else out.push(r);
  }
  return out;
}

/**
 * True when the table mixes launch angles: then a value between two rows is
 * the midpoint of two different shots and need not score.
 */
export function mixedAngles(rows: ShotRow[]) {
  if (rows.length < 2) return false;
  const a = rows.map((r) => r.angle);
  return Math.max(...a) - Math.min(...a) > 0.5;
}

/** The same linear interpolation the Java class does; clamps outside the table. */
export function interpolate(
  xs: number[],
  ys: number[],
  v: number,
): number | null {
  if (!xs.length) return null;
  if (v <= xs[0]) return ys[0];
  if (v >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 1; i < xs.length; i++)
    if (v <= xs[i]) {
      const u = (v - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return ys[i - 1] + (ys[i] - ys[i - 1]) * u;
    }
  return ys[ys.length - 1];
}

export interface TableMeta {
  robot: string;
  /** e.g. "2026-11-10". */
  date: string;
  /** One line each: what the numbers are based on and what was measured. */
  evidence: string[];
  /** Localised column / comment strings. */
  labels: {
    title: string;
    distance: string;
    rpm: string;
    angle: string;
    clearance: string;
    reliability: string;
    name: string;
    distanceNote: string;
    angleNote: string;
    interpolationNote: string;
  };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Plain CSV, one header row; `#` lines above it say what the numbers are. */
export function toCSV(rows: ShotRow[], meta: TableMeta): string {
  const l = meta.labels;
  const head = [
    `# ${meta.labels.title} · ${meta.robot} · ${meta.date}`,
    ...meta.evidence.map((e) => `# ${e}`),
    `# ${l.distanceNote}`,
  ];
  const cols = [
    l.name,
    "distance_m",
    "wheel_rpm",
    "launch_angle_deg",
    "target_clearance_mm",
    "reliability_pct",
    "robot_x_m",
    "robot_y_m",
    "shooter_heading_deg",
    "source",
  ];
  const body = rows.map((r) =>
    [
      r.name,
      r.distance.toFixed(3),
      r.rpm.toFixed(0),
      r.angle.toFixed(1),
      r.clearance.toFixed(0),
      r.reliability === undefined ? "" : Math.round(r.reliability * 100),
      r.x.toFixed(3),
      r.y.toFixed(3),
      (r.heading * DEG).toFixed(1),
      r.source,
    ]
      .map(csvCell)
      .join(","),
  );
  return [...head, cols.map(csvCell).join(","), ...body].join("\n") + "\n";
}

const javaComment = (s: string) => s.replace(/\*\//g, "* /");
const javaNumber = (v: number, d: number) => {
  const s = v.toFixed(d);
  return s.includes(".") ? s : `${s}.0`;
};
/** A valid Java identifier for the class name; falls back to ShotTable. */
export function javaClassName(name: string) {
  const id = name.replace(/[^A-Za-z0-9_]/g, "");
  return /^[A-Za-z_]/.test(id) ? id : "ShotTable";
}

/**
 * An FTC-ready Java class with the table as constants and a clamped linear
 * lookup. It names no hardware and converts no servo positions: the team's
 * own code reads its distance sensor / Limelight and sets its own motors.
 */
export function toJava(
  rows: ShotRow[],
  meta: TableMeta,
  className = "ShotTable",
  pkg = "org.firstinspires.ftc.teamcode",
): string {
  const t = lookupRows(rows);
  const l = meta.labels;
  const arr = (vals: number[], d: number) =>
    vals.length
      ? `{\n            ${vals.map((v) => javaNumber(v, d)).join(", ")}\n    }`
      : "{}";
  const name = javaClassName(className);
  return `package ${pkg};

/*
 * ${javaComment(`${l.title} · ${meta.robot} · ${meta.date}`)}
${meta.evidence.map((e) => ` * ${javaComment(e)}`).join("\n")}
 * ${javaComment(l.distanceNote)}
 * ${javaComment(l.angleNote)}
 * ${javaComment(l.interpolationNote)}
 */
public final class ${name} {
    private ${name}() {}

    /** ${javaComment(l.distance)} */
    public static final double[] DISTANCE_M = ${arr(
      t.map((r) => r.distance),
      3,
    )};

    /** ${javaComment(l.rpm)} */
    public static final double[] WHEEL_RPM = ${arr(
      t.map((r) => r.rpm),
      0,
    )};

    /** ${javaComment(l.angle)} */
    public static final double[] LAUNCH_ANGLE_DEG = ${arr(
      t.map((r) => r.angle),
      1,
    )};

    public static double wheelRpm(double distanceM) {
        return lookup(DISTANCE_M, WHEEL_RPM, distanceM);
    }

    public static double launchAngleDeg(double distanceM) {
        return lookup(DISTANCE_M, LAUNCH_ANGLE_DEG, distanceM);
    }

    /** Linear interpolation; clamps to the first / last row outside the table. */
    private static double lookup(double[] x, double[] y, double v) {
        if (x.length == 0) return Double.NaN;
        if (v <= x[0]) return y[0];
        if (v >= x[x.length - 1]) return y[y.length - 1];
        for (int i = 1; i < x.length; i++) {
            if (v <= x[i]) {
                double u = (v - x[i - 1]) / (x[i] - x[i - 1]);
                return y[i - 1] + (y[i] - y[i - 1]) * u;
            }
        }
        return y[y.length - 1];
    }
}
`;
}
