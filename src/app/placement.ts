// Pure placement helpers (no store): safe to import from workers and exports.
import { aim, shooterPose } from "../physics/flight";
import type { Config } from "../physics/types";

/** Robot at (x, y), aimed at the HIVE, with the given hood angle and speed. */
export function placed(
  c: Config,
  x: number,
  y: number,
  hoodAngle: number,
  omega?: number,
) {
  const q = structuredClone(c);
  q.robot.x = x;
  q.robot.y = y;
  const out = aim(q);
  out.shooter.hoodAngle = Math.max(
    out.shooter.hoodMin,
    Math.min(out.shooter.hoodMax, hoodAngle),
  );
  if (omega !== undefined) out.shooter.primary.omega = omega;
  return out;
}

/** Ground distance from the shooter exit to the HIVE, as the shot card shows. */
export function distanceOf(
  c: Config,
  p: { x: number; y: number; hoodAngle: number },
) {
  const q = placed(c, p.x, p.y, p.hoodAngle);
  const { origin } = shooterPose(q);
  return Math.hypot(
    q.field.target.center[0] - origin[0],
    q.field.target.center[1] - origin[1],
  );
}
