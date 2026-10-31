import type {
  BounceSettings,
  Config,
  TargetConfig,
  Vec3,
  HiveSample,
} from "./types";
import { add, sub, scale, dot, cross, clamp } from "./math";
import { axisRotation, rotate } from "./rigidMath";
import { targetBasis, targetWorld } from "./flight";
import { oppositeCellTarget } from "../field/hiveGeometry";
import { defaultHiveReference } from "./hiveReference";

export interface HiveDynamics {
  angle: number;
  omega: number;
  axis: Vec3;
  pivot: Vec3;
  travel: number;
  inertia: number;
  barrier: number;
  enabled: boolean;
}
/** The two CELLS share one hinge. Only its effective inertia/damping/barrier are
 * reduced parameters; the 7/8-ball reference is calibrated at the back skin. */
export function createHive(c: Config, s: BounceSettings): HiveDynamics {
  const axis = targetBasis(c.field.target).u;
  const pivot: Vec3 = [c.field.target.center[0], 0, c.field.hive.pivotHeight];
  const travel = 2 * c.field.hive.deployedCellPlaneAngle;
  const referenceMass = s.hiveReferenceMass ?? defaultHiveReference.mass,
    referenceDiameter =
      s.hiveReferenceDiameter ?? defaultHiveReference.diameter;
  if (
    ![referenceMass, referenceDiameter].every(
      (v) => Number.isFinite(v) && v > 0,
    )
  )
    throw new Error(
      "HIVE balance reference mass and diameter must be positive.",
    );
  const r = referenceDiameter / 2;
  const reference = targetWorld(
    [0, -c.field.target.height / 2 + r, -c.field.target.depth + r],
    c.field.target,
  );
  const lever = dot(axis, cross(sub(reference, pivot), [0, 0, -1]));
  if (s.hiveMotion && lever < 0.02)
    throw new Error(
      "HIVE pivotu ile CELL konumu uyumsuz. CELL arka duvarındaki yük pivotun kaldıran tarafında olmalı.",
    );
  return {
    axis,
    pivot,
    travel,
    angle: clamp(s.hiveInitialAngle ?? 0, 0, travel),
    omega: s.hiveMotion ? (s.hiveInitialSpeed ?? 0) : 0,
    inertia: Math.max(0.01, s.hiveInertia ?? 0.12),
    barrier:
      (Math.max(0.1, s.hiveThreshold ?? 7.5) *
        referenceMass *
        c.environment.gravity *
        Math.max(0.02, lever)) /
      Math.sin(travel / 2),
    enabled: !!s.hiveMotion,
  };
}
export const hivePoint = (h: HiveDynamics, p: Vec3, angle = h.angle) =>
  add(h.pivot, rotate(axisRotation(h.axis, angle), sub(p, h.pivot)));
export const hiveVector = (h: HiveDynamics, v: Vec3) =>
  rotate(axisRotation(h.axis, h.angle), v);
export const hiveInversePoint = (h: HiveDynamics, p: Vec3) =>
  add(h.pivot, rotate(axisRotation(h.axis, -h.angle), sub(p, h.pivot)));
export const hiveVelocity = (h: HiveDynamics, p: Vec3): Vec3 =>
  h.enabled ? scale(cross(h.axis, sub(p, h.pivot)), h.omega) : [0, 0, 0];
export const hingeJacobian = (h: HiveDynamics, p: Vec3, direction: Vec3) =>
  dot(h.axis, cross(sub(p, h.pivot), direction));
export const hivePotential = (h: HiveDynamics) =>
  h.enabled ? h.barrier * Math.cos(h.angle - h.travel / 2) : 0;
export const hiveTorque = (h: HiveDynamics) =>
  h.enabled ? h.barrier * Math.sin(h.angle - h.travel / 2) : 0;
export function hiveTarget(
  c: Config,
  h: HiveDynamics,
  opposite = false,
): TargetConfig {
  let t = c.field.target;
  if (opposite) {
    t = oppositeCellTarget(c.field);
  }
  return {
    ...t,
    center: hivePoint(h, t.center),
    tilt: t.tilt + (opposite ? h.angle : -h.angle),
  };
}
export function sampleHive(
  samples: HiveSample[],
  t: number,
): HiveSample | null {
  if (!samples.length) return null;
  let lo = 0,
    hi = samples.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = samples[lo],
    b = samples[hi],
    f = clamp((t - a.t) / Math.max(1e-9, b.t - a.t), 0, 1);
  return {
    ...a,
    t,
    angle: a.angle + (b.angle - a.angle) * f,
    omega: a.omega + (b.omega - a.omega) * f,
  };
}
