// Shots taken on the real robot: where it stood, the RPM and angle it used
// and what the ball did. Compared against the simulation one by one; rows
// with a measured exit speed also become calibration measurements.
// Pure functions: no store, safe in a worker.
import type { Measurement } from "../physics/analysis";
import { simulate, targetBasis, targetLocal } from "../physics/flight";
import type { BallModelSettings } from "../physics/launchDynamics";
import { wheelSpeeds } from "../physics/shooter";
import type { Config, Shot, Vec3 } from "../physics/types";
import { dot, sub } from "../physics/math";

export type Outcome = "in" | "short" | "long" | "rim" | "noexit";
export const OUTCOMES: Outcome[] = ["in", "short", "long", "rim", "noexit"];

export interface LoggedShot {
  id: string;
  /** Robot centre (m), chassis heading and turret yaw (rad) during the shot. */
  x: number;
  y: number;
  heading: number;
  turretYaw: number;
  /** Main wheel speed (RPM) and launch angle above horizontal (deg). */
  rpm: number;
  angle: number;
  result: Outcome;
  /** Optional, measured (e.g. slow-motion video), m/s. */
  exitVelocity?: number;
}
export const MAX_LOGGED_SHOTS = 100;

const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
/** Lenient: a bad row is dropped, never a reason to reject a whole file. */
export function parseShotLog(value: unknown): LoggedShot[] {
  if (!Array.isArray(value)) return [];
  const out: LoggedShot[] = [],
    seen = new Set<string>();
  for (const r of value) {
    if (typeof r !== "object" || r === null || Array.isArray(r)) continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id || o.id.length > 64 || seen.has(o.id))
      continue;
    if (
      ![o.x, o.y, o.heading, o.rpm, o.angle].every(finite) ||
      Math.abs(o.x as number) > 5 ||
      Math.abs(o.y as number) > 5 ||
      (o.rpm as number) < 0 ||
      (o.rpm as number) > 50_000 ||
      Math.abs(o.angle as number) > 90 ||
      !OUTCOMES.includes(o.result as Outcome)
    )
      continue;
    seen.add(o.id);
    out.push({
      id: o.id,
      x: o.x as number,
      y: o.y as number,
      heading: o.heading as number,
      turretYaw: finite(o.turretYaw) ? o.turretYaw : 0,
      rpm: o.rpm as number,
      angle: o.angle as number,
      result: o.result as Outcome,
      ...(finite(o.exitVelocity) && o.exitVelocity > 0 && o.exitVelocity < 100
        ? { exitVelocity: o.exitVelocity }
        : {}),
    });
    if (out.length >= MAX_LOGGED_SHOTS) break;
  }
  return out;
}

/** The app's config set up exactly as this shot was taken. */
export function loggedConfig(c: Config, r: LoggedShot): Config {
  const q = structuredClone(c);
  q.robot.x = r.x;
  q.robot.y = r.y;
  q.robot.heading = r.heading;
  q.robot.turretYaw = r.turretYaw;
  q.robot.velocity = [0, 0, 0];
  q.shooter.primary.omega = (r.rpm * Math.PI) / 30;
  q.shooter.hoodAngle = (r.angle * Math.PI) / 180 - q.shooter.hoodOffset;
  return q;
}

/**
 * What the simulated ball does, in the words a student logs: in, rim, short,
 * long or did not leave the shooter. Short / long is where the ball comes
 * down through the opening's plane relative to its centre, along the shot.
 */
export function outcomeOf(shot: Shot): Outcome {
  const f = shot.flight;
  if (f.status === "HIT") return "in";
  if (f.status === "NO EXIT") return "noexit";
  if (f.status === "CLIPPED EDGE") return "rim";
  const target = shot.config.field.target;
  const { n } = targetBasis(target);
  const along: Vec3 = [shot.velocity[0], shot.velocity[1], 0];
  const s = f.samples;
  for (let i = 1; i < s.length; i++) {
    const da = targetLocal(s[i - 1].p, target)[2],
      db = targetLocal(s[i].p, target)[2];
    if (da > 0 && db <= 0 && dot(s[i].v, n) < 0) {
      const u = da / (da - db);
      const p = s[i - 1].p.map((v, j) => v + (s[i].p[j] - v) * u) as Vec3;
      return dot(sub(p, target.center), along) > 0 ? "long" : "short";
    }
  }
  // Never came down through the opening: compare how far it got.
  const end = s[s.length - 1].p;
  const reach = Math.hypot(end[0] - shot.origin[0], end[1] - shot.origin[1]);
  const needed = Math.hypot(
    target.center[0] - shot.origin[0],
    target.center[1] - shot.origin[1],
  );
  return reach > needed ? "long" : "short";
}

export interface Comparison {
  id: string;
  predicted: Outcome;
  agrees: boolean;
  /** Simulated exit speed (m/s), next to the measured one if any. */
  speed: number;
}
export function compare(
  c: Config,
  rows: LoggedShot[],
  ballModel?: BallModelSettings,
): Comparison[] {
  return rows.map((r) => {
    const shot = simulate(loggedConfig(c, r), undefined, ballModel);
    const predicted = outcomeOf(shot);
    return {
      id: r.id,
      predicted,
      agrees: predicted === r.result,
      speed: shot.shooter.exited ? shot.shooter.speed : 0,
    };
  });
}

/**
 * Rows with a measured exit speed as calibration measurements, pose baked
 * in. Every third one is held out for validation, so the fit is checked on
 * shots it was not fitted to.
 */
export function toMeasurements(c: Config, rows: LoggedShot[]): Measurement[] {
  return rows
    .filter((r) => r.exitVelocity !== undefined)
    .map((r, i) => {
      const q = loggedConfig(c, r);
      const speeds = wheelSpeeds(q);
      const independent =
        q.shooter.link === "independent" && q.shooter.topology !== "passive";
      return {
        id: r.id,
        split: i % 3 === 2 ? "validation" : "training",
        primaryRPM: r.rpm,
        secondaryRPM: (speeds[1] * 30) / Math.PI,
        ...(independent && q.shooter.rollers.length
          ? { rollerRPMs: speeds.slice(2).map((w) => (w * 30) / Math.PI) }
          : {}),
        hoodDeg: (q.shooter.hoodAngle * 180) / Math.PI,
        exitVelocity: r.exitVelocity,
        robot: structuredClone(q.robot),
      } satisfies Measurement;
    });
}
