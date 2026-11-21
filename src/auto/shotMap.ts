// Where on the field the robot's shooter scores, from this app's shooter and
// flight physics (the same solver as Auto solve). One map per upward CELL:
// before the blue HIVE tips (the published deployed pose) and after it (the
// other CELL up, mirrored across the HIVE pivot plane).
import { solve } from "../physics/analysis";
import { aim } from "../physics/flight";
import type { BallModelSettings } from "../physics/launchDynamics";
import type { Config, TargetConfig } from "../physics/types";
import { hiveNoGo, fieldHalf } from "./field";

export type CellState = "first" | "tipped";
export interface ShotSpot {
  x: number;
  y: number;
  /** Chassis heading that points a fixed shooter at the CELL, rad. */
  heading: number;
  /** Wheel speed the solver chose, rad/s, and the hood angle, rad. */
  omega: number;
  angle: number;
  /** Ball entry clearance in the opening, m (bigger = more forgiving). */
  clearance: number;
}
export interface ShotMap {
  cell: CellState;
  spacing: number;
  spots: ShotSpot[];
  tried: number;
}

/** The upward CELL after the blue HIVE tips: mirror of the first across y. */
export function tippedTarget(t: TargetConfig): TargetConfig {
  return {
    ...t,
    center: [t.center[0], -t.center[1], t.center[2]],
    yaw: t.yaw + Math.PI,
  };
}

export function withCell(c: Config, cell: CellState): Config {
  if (cell === "first") return c;
  const q = structuredClone(c);
  q.field.target = tippedTarget(c.field.target);
  return q;
}

/** A robot centre that fits on the field and outside the HIVE frame. */
export function fits(x: number, y: number, halfX: number, halfY: number) {
  const limit = fieldHalf - Math.max(halfX, halfY) + 1e-9,
    nx = Math.max(hiveNoGo.x0, Math.min(x, hiveNoGo.x1)),
    ny = Math.max(hiveNoGo.y0, Math.min(y, hiveNoGo.y1));
  return (
    Math.abs(x) <= limit &&
    Math.abs(y) <= limit &&
    Math.hypot(x - nx, y - ny) > Math.hypot(halfX, halfY)
  );
}

/**
 * Grid of robot centres to try, plus `extra` places (the user's saved shot
 * points) that are not already on the grid.
 */
export function shotGrid(
  spacing: number,
  halfX: number,
  halfY: number,
  extra: { x: number; y: number }[] = [],
) {
  const limit = fieldHalf - Math.max(halfX, halfY),
    pts: { x: number; y: number }[] = [];
  for (let x = -limit; x <= limit + 1e-9; x += spacing)
    for (let y = -limit; y <= limit + 1e-9; y += spacing)
      if (fits(x, y, halfX, halfY)) pts.push({ x, y });
  for (const p of extra)
    if (
      fits(p.x, p.y, halfX, halfY) &&
      !pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.02)
    )
      pts.push({ x: p.x, y: p.y });
  return pts;
}

/** Evaluates one grid point. `turret`: the shooter aims; else the chassis turns. */
export function shotAt(
  base: Config,
  x: number,
  y: number,
  turret: boolean,
  ball?: BallModelSettings,
): ShotSpot | null {
  const q = structuredClone(base);
  q.robot.x = x;
  q.robot.y = y;
  q.robot.velocity = [0, 0, 0];
  if (!turret) {
    // Turn the chassis until a straight-ahead shooter points at the CELL.
    q.robot.turretYaw = 0;
    for (let i = 0; i < 3; i++) {
      const a = aim(q);
      q.robot.heading += a.robot.turretYaw;
    }
  }
  const best = solve(q, () => {}, true, ball)[0];
  if (!best) return null;
  const a = aim(q);
  return {
    x,
    y,
    heading: turret ? q.robot.heading : a.robot.heading + a.robot.turretYaw,
    omega: best.omega,
    angle: best.angle,
    clearance: best.clearance,
  };
}
