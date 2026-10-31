import type { BounceSettings, Vec3 } from "./types";
import { dot, norm, scale, add, sub, unit, cross, clamp } from "./math";
import { rotate, unrotate, type Rotation, axisRotation } from "./rigidMath";
import {
  pollenHoleAxes,
  pollenHoleRatio,
  pollenInnerRatio,
} from "./pollenGeometry";
export const shapeAxes = (
  s: Pick<BounceSettings, "shapeModel" | "asphericity">,
): Vec3 => {
  const e =
    s.shapeModel === "pollen" ? clamp(s.asphericity ?? 0.01, 0, 0.05) : 0;
  return [1 + e, 1 - e, 1];
};
export function projectedAreaRatio(q: Rotation, axes: Vec3, airflow: Vec3) {
  const n = unrotate(q, unit(airflow));
  return norm(airflow) > 1e-9
    ? axes[0] *
        axes[1] *
        axes[2] *
        Math.sqrt(n.reduce((sum, v, i) => sum + (v / axes[i]) ** 2, 0))
    : 1;
}
export function holeAxes(s: BounceSettings): Vec3[] {
  const q = axisRotation([0, 1, 0], s.hemispherePhase ?? 0);
  return pollenHoleAxes.map((v) => (v[1] > 0 ? rotate(q, v) : v));
}
/** Analytic support of an ellipsoidal shell with circular missing caps.
 * A flat face above a hole touches its rim. The support proxy does not resolve
 * shell interlocking or small edges entering the interior cavity. */
export function shapeSupport(
  direction: Vec3,
  q: Rotation,
  radius: number,
  s: BounceSettings,
  holes: Vec3[],
): Vec3[] {
  const d = unrotate(q, unit(direction)),
    axes = shapeAxes(s);
  if (s.shapeModel !== "pollen") return [scale(unit(direction), radius)];
  const raw = d.map((x, i) => axes[i] * x) as Vec3;
  let p = unit(raw);
  const cos = Math.sqrt(1 - pollenHoleRatio ** 2);
  const hole = holes.find((h) => dot(h, p) > cos);
  let points = [p];
  if (hole) {
    const tangent = sub(raw, scale(hole, dot(raw, hole)));
    if (norm(tangent) > 1e-7)
      p = add(scale(hole, cos), scale(unit(tangent), pollenHoleRatio));
    else {
      const a = unit(
          cross(hole, Math.abs(hole[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0]),
        ),
        b = cross(hole, a);
      points = Array.from({ length: 3 }, (_, i) =>
        add(
          scale(hole, cos),
          scale(
            add(
              scale(a, Math.cos((i * 2 * Math.PI) / 3)),
              scale(b, Math.sin((i * 2 * Math.PI) / 3)),
            ),
            pollenHoleRatio,
          ),
        ),
      );
    }
    if (norm(tangent) > 1e-7) points = [p];
  }
  return points.map((p) =>
    rotate(q, p.map((x, i) => radius * axes[i] * x) as Vec3),
  );
}
export function pollenInertia(
  mass: number,
  radius: number,
  s: BounceSettings,
  holes: Vec3[],
): Vec3 {
  // Deterministic volume quadrature of the finite-thickness perforated shell.
  const axes = shapeAxes(s),
    sums = [0, 0, 0],
    steps = 4096;
  let volume = 0;
  for (let i = 0; i < steps; i++) {
    const y = 1 - (2 * (i + 0.5)) / steps,
      phi = i * Math.PI * (3 - Math.sqrt(5));
    const n: Vec3 = [
      Math.sqrt(1 - y * y) * Math.cos(phi),
      y,
      Math.sqrt(1 - y * y) * Math.sin(phi),
    ];
    for (let j = 0; j < 3; j++) {
      const radial =
        pollenInnerRatio + ((j + 0.5) * (1 - pollenInnerRatio)) / 3;
      if (
        holes.some(
          (h) => dot(h, n) > 0 && norm(cross(n, h)) * radial < pollenHoleRatio,
        )
      )
        continue;
      const p = n.map((x, k) => x * radial * radius * axes[k]) as Vec3,
        w = radial * radial;
      volume += w;
      for (let k = 0; k < 3; k++) sums[k] += w * (dot(p, p) - p[k] * p[k]);
    }
  }
  return sums.map((x) => (mass * x) / volume) as Vec3;
}
