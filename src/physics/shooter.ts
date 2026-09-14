import type {
  Config,
  HoodRollerConfig,
  ShooterResult,
  WheelConfig,
  ContactSample,
  Vec3,
} from "./types";
import { clamp } from "./math";
import { rpm, inertiaImperial } from "../utils/units";
export function wheelInertia(w: WheelConfig) {
  return w.inertiaMode === "disk" && w.mass !== null
    ? 0.5 * w.mass * (w.diameter / 2) ** 2
    : w.inertiaMode === "custom"
      ? w.inertia
      : null;
}
export function ballInertia(c: Config) {
  return (
    c.projectile.inertia ??
    0.4 * c.projectile.mass * (c.projectile.diameter / 2) ** 2
  );
}
export function wheelRadius(w: WheelConfig): number {
  return "radius" in w ? (w as HoodRollerConfig).radius : w.diameter / 2;
}
/** Positive contact spin is backspin from the lower primary wheel. */
export function spinVector(yaw: number, spin: number): Vec3 {
  return [Math.sin(yaw) * spin, -Math.cos(yaw) * spin, 0];
}
export function wheelSpeeds(c: Config): number[] {
  const s = c.shooter,
    p = s.primary;
  const secondary =
    s.topology === "passive"
      ? 0
      : s.link === "gear"
        ? p.omega * s.secondary.ratio
        : s.link === "surface"
          ? ((p.omega * p.diameter) / s.secondary.diameter) * s.surfaceRatio
          : s.secondary.omega;
  return [
    p.omega,
    secondary,
    ...s.rollers.map((w) =>
      s.link === "surface"
        ? ((p.omega * p.diameter) / w.diameter) * s.surfaceRatio
        : s.link === "gear"
          ? p.omega * (s.topology === "powered" ? s.secondary.ratio : w.ratio)
          : w.omega,
    ),
  ];
}
export function normalForceAt(c: Config, x: number) {
  const s = c.shooter;
  if (s.normalModel === "linear") {
    const k = 1 / (1 / s.ballStiffness + 1 / s.wheelStiffness);
    return k * x;
  }
  const table = [...s.forceCurve].sort((a, b) => a[0] - b[0]);
  if (!table.length) return 0;
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++)
    if (x <= table[i][0]) {
      const [a, b] = [table[i - 1], table[i]];
      return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
    }
  return table[table.length - 1][1];
}
export function normalForce(c: Config) {
  return normalForceAt(c, c.shooter.compression);
}
/** Returns the local penetration from the roller's explicit 2D geometry. */
export function hoodPenetration(
  roller: HoodRollerConfig,
  ballRadius: number,
  travel: number,
  globalCompression: number,
) {
  if (travel < roller.contactStart || travel > roller.contactEnd) return 0;
  const centerY = roller.center[1] - globalCompression - roller.compression;
  const distance = Math.hypot(travel - roller.center[0], centerY);
  return Math.max(0, ballRadius + roller.radius - distance);
}
/** Motor recovery: back EMF and ohmic current, torque mapped through reduction,
 * current and supply-power limits, battery voltage sag. Null if wheel inertia unknown. */
export function motorRecovery(
  c: Config,
  inertia: number | null,
  start: number,
  target: number,
) {
  if (inertia === null || inertia <= 0) return null;
  const m = c.shooter.motor;
  let w = start,
    t = 0;
  const dt = 0.001;
  const finish = target * 0.98;
  while (w < finish && t < 10) {
    const voltage = Math.max(
      0,
      m.voltage - m.supplyLimit * m.batteryResistance,
    );
    const requested = Math.max(0, m.kV * target + m.kP * (target - w));
    const command = Math.min(voltage, requested);
    const motorW = w * m.reduction;
    const current = Math.min(
      m.statorLimit,
      Math.max(0, (command - m.torqueConstant * motorW) / m.resistance) *
        m.count,
      (m.supplyLimit * voltage) / Math.max(command, 0.1),
    );
    const torque = m.torqueConstant * current * m.reduction * m.efficiency;
    if (torque < 1e-8) return null;
    w += (torque / inertia) * dt;
    t += dt;
  }
  return t < 10 ? t : null;
}
export function simulateShooter(c: Config): ShooterResult {
  const s = c.shooter,
    p = c.projectile,
    m = p.mass,
    r = p.diameter / 2,
    I = ballInertia(c),
    ws: WheelConfig[] = [s.primary, s.secondary, ...s.rollers],
    omegas: number[] = wheelSpeeds(c);
  const radii: number[] = ws.map(wheelRadius),
    surface = omegas.map((w, i) => w * radii[i]);
  const inertias = ws.map(wheelInertia);
  const flyI = s.flywheelEnabled ? wheelInertia(s.flywheel) : 0;
  if (inertias[0] !== null && flyI !== null)
    inertias[0] += flyI * s.flywheel.ratio ** 2;
  if (flyI === null) inertias[0] = null;
  const coupled = s.mode === "physical" && s.link === "gear";
  const ratios = ws.map((w, i) =>
    i === 0
      ? 1
      : i === 1 && s.topology === "passive"
        ? 0
        : s.link === "gear" && s.topology === "powered"
          ? s.secondary.ratio
          : w.ratio,
  );
  const missing =
    inertias.some((j, i) => ratios[i] !== 0 && j === null) || flyI === null;
  const equivalentInertia = missing
    ? null
    : inertias.reduce<number>(
        (sum, j, i) => sum + (j ?? 0) * ratios[i] ** 2,
        0,
      );
  const unknown = coupled
    ? equivalentInertia === null || equivalentInertia <= 0
    : inertias.some(
        (v, i) =>
          (v === null || (s.mode === "physical" && v === 0)) &&
          !(i === 1 && s.topology === "passive"),
      ) || flyI === null;
  const recoveryInertia = unknown
    ? null
    : coupled
      ? equivalentInertia
      : inertias[0];
  const stored = unknown
    ? null
    : inertias.reduce<number>(
        (a, j, i) => a + 0.5 * (j ?? 0) * omegas[i] ** 2,
        0,
      );
  const warnings: string[] = [];
  if (unknown)
    warnings.push(
      "Wheel inertia unknown: ideal-speed contact boundary. Droop, stored energy and recovery unavailable. Enter measured inertia.",
    );
  let speed = p.initialVelocity,
    spin = p.spin,
    slipLoss = 0,
    post = omegas[0];
  const trace: ContactSample[] = [];
  const normal = normalForce(c) * (1 - s.hysteresis),
    deformationEnergy = 0.5 * normal * s.compression,
    hysteresisLoss = deformationEnergy * s.hysteresis;
  if (s.mode === "recalc") {
    // Empirical reference transfer, isolated from flight. Not ReCalc reverse engineering.
    const referenceSurface = rpm(1700) * 0.0508;
    speed =
      (s.transfer * 7.585 * (surface[0] + surface[1])) / (2 * referenceSurface);
    spin = (surface[0] - surface[1]) / (2 * r);
    const baseDelta =
      0.5 * (1.3 * inertiaImperial) * (rpm(1700) ** 2 - rpm(1426) ** 2);
    const referenceEnergy = 0.5 * 0.042 * (7.585 ** 2 - 0.5 ** 2);
    const energyNeeded = Math.max(
      0,
      0.5 * m * (speed ** 2 - p.initialVelocity ** 2) +
        0.5 * I * (spin ** 2 - p.spin ** 2),
    );
    const j = inertias[0];
    post =
      j && j > 0
        ? Math.sqrt(
            Math.max(
              0,
              omegas[0] ** 2 -
                (2 * energyNeeded * (baseDelta / referenceEnergy)) / j,
            ),
          )
        : omegas[0];
    warnings.push(
      "ReCalc-calibrated transfer and timing; extrapolation is empirical, not a contact prediction.",
    );
  } else {
    // Sequential impulse contact with Coulomb cap. Each contact resolves relative slip
    // using inverse effective mass 1/m+r²/I+R²/J, so equal opposed surfaces cancel spin.
    const stateW = [...omegas];
    let travel = 0,
      t = 0;
    const arc = Math.abs(s.hoodEnd - s.hoodStart) * s.hoodRadius;
    while (t < s.maxContactTime && travel < arc) {
      const dt = s.contactStep;
      let totalF = 0,
        maxSlip = 0,
        activeHoodContacts = 0,
        maxNormal = 0;
      const contacts: {
        i: number;
        sign: number;
        passive: boolean;
        driven: boolean;
        contactRadius: number;
        invMass: number;
        slip: number;
        impulse: number;
      }[] = [];
      for (let i = 0; i < ws.length; i++) {
        const sign = i === 0 ? 1 : -1;
        const passive = i === 1 && s.topology === "passive";
        const penetration =
          i === 0
            ? s.compression
            : hoodPenetration(
                ws[i] as HoodRollerConfig,
                r,
                travel,
                s.compression,
              );
        if (i > 0 && penetration <= 0) continue;
        if (i > 0) activeHoodContacts++;
        const localNormal = normalForceAt(c, penetration) * (1 - s.hysteresis);
        maxNormal = Math.max(maxNormal, localNormal);
        const j = inertias[i];
        const driven = !(passive || j === 0 || j === null);
        // The roller mount angle projects its rim velocity and contact torque
        // onto the local +X projectile path.
        const contactRadius =
          i === 0
            ? radii[i]
            : radii[i] * Math.cos((ws[i] as HoodRollerConfig).angle);
        const invJ = coupled
          ? equivalentInertia && !passive
            ? ratios[i] ** 2 / equivalentInertia
            : 0
          : driven
            ? 1 / j
            : 0;
        const slip =
          (passive ? 0 : stateW[i] * contactRadius) - speed - sign * spin * r;
        const invMass = 1 / m + (r * r) / I + contactRadius ** 2 * invJ;
        const impulse = clamp(
          slip / invMass,
          -s.friction * localNormal * dt,
          s.friction * localNormal * dt,
        );
        contacts.push({
          i,
          sign,
          passive,
          driven,
          contactRadius,
          invMass,
          slip,
          impulse,
        });
      }
      // Resolve the active contact set from one common pre-step state. This
      // avoids order-dependent torque when two adjacent Sushi wheels overlap.
      speed += contacts.reduce((sum, contact) => sum + contact.impulse, 0) / m;
      spin +=
        contacts.reduce(
          (sum, contact) => sum + contact.sign * contact.impulse * r,
          0,
        ) / I;
      let shaftDelta = 0;
      for (const contact of contacts) {
        const { i, passive, driven, contactRadius, impulse, slip, invMass } =
          contact;
        if (coupled && equivalentInertia && !passive)
          shaftDelta +=
            (impulse * contactRadius * ratios[i]) / equivalentInertia;
        else if (!coupled && driven) {
          const j = inertias[i]!;
          stateW[i] -= (impulse * contactRadius) / j;
        }
        slipLoss += Math.max(
          0,
          impulse * slip - 0.5 * impulse * impulse * invMass,
        );
        totalF += impulse / dt;
        maxSlip = Math.max(maxSlip, Math.abs(slip));
      }
      if (shaftDelta)
        for (let k = 0; k < stateW.length; k++)
          stateW[k] -= shaftDelta * ratios[k];
      travel += Math.max(speed, 0) * dt;
      t += dt;
      if (trace.length === 0 || t - trace[trace.length - 1].t >= 0.001)
        trace.push({
          t,
          velocity: speed,
          spin,
          primaryOmega: stateW[0],
          secondaryOmega: stateW[1],
          normal: maxNormal,
          force: totalF,
          slip: maxSlip,
          travel,
          activeHoodContacts,
        });
    }
    post = stateW[0];
    if (travel < arc)
      warnings.push(
        "Projectile did not traverse contact arc before contact-time limit.",
      );
  }
  const energy = 0.5 * m * speed ** 2,
    rotationalEnergy = 0.5 * I * spin ** 2;
  const drop = unknown ? 0 : omegas[0] - post;
  const consumed = unknown
    ? null
    : Math.max(
        0,
        energy +
          rotationalEnergy -
          0.5 * m * p.initialVelocity ** 2 -
          0.5 * I * p.spin ** 2,
      ) +
      slipLoss +
      hysteresisLoss;
  const ratio = omegas[0] / rpm(1700);
  const recovery =
    s.mode === "recalc"
      ? 0.098 * (drop / rpm(274))
      : motorRecovery(c, recoveryInertia, post, omegas[0]);
  const spinup =
    s.mode === "recalc"
      ? 0.323 * ratio
      : motorRecovery(c, recoveryInertia, 0, omegas[0]);
  return {
    speed,
    spin,
    surfaceSpeeds: surface,
    postOmega: post,
    drop,
    energy,
    rotationalEnergy,
    storedEnergy: stored,
    consumedEnergy: consumed,
    electricalEnergy: 0,
    slipLoss,
    hysteresisLoss,
    deformationEnergy,
    recovery,
    spinup,
    efficiency:
      consumed && consumed > 0
        ? (energy +
            rotationalEnergy -
            0.5 * m * p.initialVelocity ** 2 -
            0.5 * I * p.spin ** 2) /
          consumed
        : null,
    trace,
    warnings,
  };
}
