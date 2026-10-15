import type { Config, Vec3 } from "./types";
import { cross, norm, scale, sub, unit } from "./math";
export function aerodynamicForces(v: Vec3, spin: Vec3, c: Config) {
  const relative = sub(v, c.environment.wind),
    speed = norm(relative),
    r = c.projectile.diameter / 2;
  const qA = 0.5 * c.environment.density * Math.PI * r * r * speed * speed;
  const cd =
    c.aero.cd *
    (c.projectile.model === "calibrated" ? c.projectile.roughness : 1);
  const drag = scale(unit(relative), -qA * cd);
  // Cl(S) saturates; lift is perpendicular to both spin and relative airflow.
  const S = speed > 1e-12 ? (norm(spin) * r) / speed : 0;
  const cl = c.aero.magnus
    ? Math.min(c.aero.liftMax, liftCoefficient(S, c))
    : 0;
  const lift = scale(unit(cross(spin, relative)), qA * cl);
  return { drag, lift, cl };
}
/** Uncapped lift coefficient. The Sawicki branch switches from 1.5·S to
 * 0.09 + liftSlope·S where they meet (S = 0.1 for the published 0.6 slope),
 * so a fitted slope stays continuous. */
export function liftCoefficient(S: number, c: Config) {
  const k = c.aero.liftSlope;
  if (c.aero.liftModel === "linear" || k >= 1.5) return k * S;
  return S < 0.09 / (1.5 - k) ? 1.5 * S : 0.09 + k * S;
}
