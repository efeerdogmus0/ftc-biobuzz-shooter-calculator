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
  const cl = c.aero.magnus ? Math.min(c.aero.liftMax, c.aero.liftSlope * S) : 0;
  const lift = scale(unit(cross(spin, relative)), qA * cl);
  return { drag, lift, cl };
}
