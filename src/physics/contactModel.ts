import { ballInertia } from "./shooter";
import type { BounceSettings, Sample, Vec3, Config } from "./types";
import { clamp, norm, dot, sub, scale } from "./math";
export type SurfaceKind = "floor" | "wall" | "cell" | "ball";
export const advancedBounceDefaults = {
  contactModel: "rigid" as const,
  inertiaModel: "config" as const,
  previewTime: 10,
  staticRatio: 1.4,
  speedLoss: 0.035,
  referenceSpeed: 1,
  spinResistance: 0.015,
  contactStiffness: 300000,
  materialDissipation: 0.3,
  solverIterations: 16,
  maxContactStep: 0.001,
  hiveMotion: true,
  hiveThreshold: 7.5,
  hiveInertia: 0.12,
  hiveDamping: 0.08,
  hiveStopRestitution: 0.08,
  hiveInitialAngle: 0,
  hiveInitialSpeed: 0,
  shapeModel: "pollen" as const,
  asphericity: 0.01,
  hemispherePhase: 0,
  orientation: [0, 0, 0] as Vec3,
  surfaceFriction: { floor: 0.45, wall: 0.3, cell: 0.22, ball: 0.25 },
};
export function material(s: BounceSettings, kind: SurfaceKind) {
  const dynamic = s.surfaceFriction?.[kind] ?? s.friction;
  return {
    dynamic: Math.max(0, dynamic),
    static: Math.max(0, dynamic) * Math.max(1, s.staticRatio ?? 1.4),
    rolling: Math.max(0, s.rollingResistance),
    spinning: Math.max(0, s.spinResistance ?? 0.015),
    e: kind === "ball" ? (s.ball ?? 0.55) : s[kind],
  };
}
export function effectiveRestitution(
  s: BounceSettings,
  kind: SurfaceKind,
  approach: number,
) {
  if (approach < 0.08) return 0; // Resting contacts must not chatter.
  const e =
    material(s, kind).e -
    Math.max(0, s.speedLoss ?? 0.035) * (approach - (s.referenceSpeed ?? 1));
  const ramp = clamp((approach - 0.08) / 0.12, 0, 1);
  return clamp(e, 0, 1) * ramp * ramp * (3 - 2 * ramp);
}
/** Effective Hertz/Hunt-Crossley point contact, not a deformable mesh.
 * F=K delta^(3/2) max(0,1+1.5 c deltaDot), U=(2/5)K delta^(5/2).
 * k embeds geometry/materials; identical ball pairs use k/(2 sqrt(2)). */
export function hertzContact(
  penetration: number,
  approach: number,
  k: number,
  dissipation: number,
) {
  const elastic = Math.max(0, k) * Math.max(0, penetration) ** 1.5;
  const multiplier = Math.max(0, 1 + 1.5 * Math.max(0, dissipation) * approach);
  return {
    force: elastic * multiplier,
    /** Damping part of `force` (negative while unloading or clamped). */
    dampingForce: elastic * (multiplier - 1),
    potential: 0.4 * Math.max(0, k) * Math.max(0, penetration) ** 2.5,
    // The no-tension clamp also dissipates the remaining unloading energy.
    dampingPower: Math.max(0, elastic * (multiplier - 1) * approach),
  };
}
/**
 * Energy removed by a normal damping impulse that is applied (together with
 * its elastic part) while the contact's approach speed changes from
 * `approachBefore` to `approachAfter`. For an impulsive velocity change the
 * work of an impulse is exactly impulse × mean velocity, so this is the
 * dissipation the integrator actually performed. The previous endpoint
 * estimate (damping power × dt) was only first-order accurate.
 */
export function dampingWork(
  dampingImpulse: number,
  approachBefore: number,
  approachAfter: number,
) {
  return (dampingImpulse * (approachBefore + approachAfter)) / 2;
}
export function contactStep(
  s: BounceSettings,
  radius: number,
  mass: number,
  speed: number,
  overlap: number,
) {
  let dt = Math.min(
    0.002,
    s.maxContactStep ?? 0.001,
    radius / (6 * Math.max(1, speed)),
  );
  if (s.contactModel === "hertz") {
    const k = Math.max(1000, s.contactStiffness ?? 300000),
      effectiveMass = mass / 2;
    const estimated = Math.max(
      overlap,
      ((1.25 * effectiveMass * Math.max(0.1, speed) ** 2) / k) ** 0.4,
      radius * 0.002,
    );
    dt = Math.min(
      dt,
      0.18 * Math.sqrt(effectiveMass / (1.5 * k * Math.sqrt(estimated))),
    );
  }
  return dt;
}
export function advanceRotation(
  q: [number, number, number, number],
  w: Vec3,
  dt: number,
): [number, number, number, number] {
  const angle = norm(w) * dt,
    factor = angle > 1e-12 ? Math.sin(angle / 2) / norm(w) : dt / 2;
  const x = w[0] * factor,
    y = w[1] * factor,
    z = w[2] * factor,
    cos = Math.cos(angle / 2);
  const out: [number, number, number, number] = [
    cos * q[0] + x * q[3] + y * q[2] - z * q[1],
    cos * q[1] - x * q[2] + y * q[3] + z * q[0],
    cos * q[2] + x * q[1] - y * q[0] + z * q[3],
    cos * q[3] - x * q[0] - y * q[1] - z * q[2],
  ];
  const n = Math.hypot(...out);
  return out.map((v) => v / n) as typeof out;
}
export function slipVelocity(
  state: Sample,
  normal: Vec3,
  radius: number,
): Vec3 {
  const contact: Vec3 = [
    state.v[0] +
      radius * (normal[1] * state.spin[2] - normal[2] * state.spin[1]),
    state.v[1] +
      radius * (normal[2] * state.spin[0] - normal[0] * state.spin[2]),
    state.v[2] +
      radius * (normal[0] * state.spin[1] - normal[1] * state.spin[0]),
  ];
  return sub(contact, scale(normal, dot(contact, normal)));
}
export function dropCalibration(
  dropHeight: number,
  reboundHeight: number,
  gravity: number,
) {
  if (
    ![dropHeight, reboundHeight, gravity].every(Number.isFinite) ||
    dropHeight <= 0 ||
    reboundHeight < 0 ||
    reboundHeight > dropHeight ||
    gravity <= 0
  )
    throw new Error(
      "Bırakma yüksekliği pozitif, sekme yüksekliği 0 ile bırakma yüksekliği arasında olmalı.",
    );
  return {
    speed: Math.sqrt(2 * gravity * dropHeight),
    restitution: Math.sqrt(reboundHeight / dropHeight),
  };
}

export function contactInertia(c: Config, s: BounceSettings) {
  const r = c.projectile.diameter / 2;
  return s.inertiaModel === "solid"
    ? 0.4 * c.projectile.mass * r * r
    : s.inertiaModel === "shell"
      ? (2 / 3) * c.projectile.mass * r * r
      : ballInertia(c);
}
