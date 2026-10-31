import type { Config, Vec3, Sample } from "./types";
import { identity } from "./rigidMath";
import { projectedAreaRatio } from "./pollenShape";
import { cross, norm, scale, sub, unit } from "./math";
/** Shared orientation-dependent force evaluation in free flight, contact and plots. */
export function sampleAerodynamics(
  s: Sample,
  c: Config,
  axes: Vec3 = [1, 1, 1],
) {
  if (axes[0] === 1 && axes[1] === 1 && axes[2] === 1)
    return aerodynamicForces(s.v, s.spin, c);
  return aerodynamicForces(
    s.v,
    s.spin,
    c,
    projectedAreaRatio(
      s.rotation ?? identity,
      axes,
      sub(s.v, c.environment.wind),
    ),
  );
}
export function aerodynamicForces(
  v: Vec3,
  spin: Vec3,
  c: Config,
  areaRatio = 1,
) {
  const relative = sub(v, c.environment.wind),
    speed = norm(relative),
    r = c.projectile.diameter / 2;
  const qA =
    0.5 * c.environment.density * Math.PI * r * r * speed * speed * areaRatio;
  const cd =
    c.aero.cd *
    (c.projectile.model === "calibrated" ? c.projectile.roughness : 1);
  const drag = scale(unit(relative), -qA * cd);
  // Cl(S) saturates; lift is perpendicular to both spin and relative airflow.
  const transverseSpin = cross(spin, unit(relative));
  const S = speed > 1e-12 ? (norm(transverseSpin) * r) / speed : 0;
  const cl = c.aero.magnus
    ? Math.min(c.aero.liftMax, liftCoefficient(S, c))
    : 0;
  const lift = scale(unit(transverseSpin), qA * cl);
  return { drag, lift, cl };
}

/** Optional baseball fit contributed in PR #1; POLLEN coefficients need measurements. */
export function liftCoefficient(S: number, c: Config) {
  const k = c.aero.liftSlope;
  if (c.aero.liftModel !== "sawicki" || k >= 1.5) return k * S;
  return S < 0.09 / (1.5 - k) ? 1.5 * S : 0.09 + k * S;
}
