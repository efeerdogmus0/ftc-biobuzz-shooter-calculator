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
  return w.diameter / 2;
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
      s.topology === "passive"
        ? 0
        : s.link === "surface"
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
  return Math.max(0, ballRadius + wheelRadius(roller) - distance);
}
/** Ideal PWM bridge; currents/limits are totals across the identical motors.
 * The controller's voltage request is a nominal-bus duty command. Battery and
 * winding currents differ at partial duty: Ib=d*Is, Vb=V0-Rb*Ib, Vm=d*Vb. */
export function motorOperatingPoint(c: Config, speed: number, target: number) {
  const m = c.shooter.motor,
    emf = m.torqueConstant * speed * m.reduction,
    resistance = m.resistance / m.count;
  const atDuty = (duty: number) => {
    const current = Math.max(
      0,
      (duty * m.voltage - emf) /
        (resistance + m.batteryResistance * duty * duty),
    );
    const supplyCurrent = duty * current,
      busVoltage = m.voltage - m.batteryResistance * supplyCurrent;
    return {
      duty,
      current,
      supplyCurrent,
      busVoltage,
      motorVoltage: duty * busVoltage,
      torque: m.torqueConstant * current * m.reduction * m.efficiency,
    };
  };
  let duty = clamp((m.kV * target + m.kP * (target - speed)) / m.voltage, 0, 1);
  // If a limit is exceeded, the first feasible crossing is on the rising-current
  // branch, including very large battery resistance and multiple motors.
  for (const [key, limit] of [
    ["supplyCurrent", m.supplyLimit],
    ["current", m.statorLimit],
  ] as const) {
    if (atDuty(duty)[key] <= limit) continue;
    let lo = 0,
      hi = duty;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (atDuty(mid)[key] > limit) hi = mid;
      else lo = mid;
    }
    duty = lo;
  }
  return atDuty(duty);
}

/** Integrate dt/domega=J/tau(omega). Adaptive quadrature handles current-limit
 * transitions without an arbitrary 10-second horizon or timestep overshoot. */
export function motorRecovery(
  c: Config,
  inertia: number | null,
  start: number,
  target: number,
) {
  if (inertia === null || inertia <= 0) return null;
  const finish = target * 0.98;
  if (start >= finish) return 0;
  const rate = (w: number) => {
    const torque = motorOperatingPoint(c, w, target).torque;
    return torque > 1e-12 ? inertia / torque : Infinity;
  };
  const simpson = (a: number, b: number, fa: number, fm: number, fb: number) =>
    ((b - a) * (fa + 4 * fm + fb)) / 6;
  const integrateTime = (
    a: number,
    b: number,
    fa: number,
    fm: number,
    fb: number,
    whole: number,
    tolerance: number,
    depth: number,
  ): number => {
    const mid = (a + b) / 2,
      fl = rate((a + mid) / 2),
      fr = rate((mid + b) / 2);
    if (![fa, fm, fb, fl, fr].every(Number.isFinite)) return Infinity;
    const left = simpson(a, mid, fa, fl, fm),
      right = simpson(mid, b, fm, fr, fb),
      delta = left + right - whole;
    if (depth === 0 || Math.abs(delta) < 15 * tolerance)
      return left + right + delta / 15;
    return (
      integrateTime(a, mid, fa, fl, fm, left, tolerance / 2, depth - 1) +
      integrateTime(mid, b, fm, fr, fb, right, tolerance / 2, depth - 1)
    );
  };
  const fa = rate(start),
    fm = rate((start + finish) / 2),
    fb = rate(finish);
  const t = integrateTime(
    start,
    finish,
    fa,
    fm,
    fb,
    simpson(start, finish, fa, fm, fb),
    1e-6,
    14,
  );
  return Number.isFinite(t) ? t : null;
}
export function simulateShooter(
  c: Config,
  inertia = ballInertia(c),
): ShooterResult {
  const s = c.shooter,
    p = c.projectile,
    m = p.mass,
    r = p.diameter / 2,
    I = inertia,
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
      : i >= 1 && s.topology === "passive"
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
          !(i >= 1 && s.topology === "passive"),
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
  let exited = s.mode === "recalc",
    contactTravel = 0,
    contactTime = 0;
  if (unknown)
    warnings.push(
      "Wheel inertia unknown: ideal-speed contact boundary. Droop, stored energy and recovery unavailable. Enter measured inertia.",
    );
  let speed = p.initialVelocity,
    // Feed is assumed non-rotating. Legacy profile spin is not an exit override.
    spin = 0,
    slipLoss = 0,
    post = omegas[0],
    wheelEnergyLoss: number | null = null;
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
      0.5 * m * (speed ** 2 - p.initialVelocity ** 2) + 0.5 * I * spin ** 2,
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
    if (stored !== null)
      wheelEnergyLoss = 0.5 * (inertias[0] ?? 0) * (omegas[0] ** 2 - post ** 2);
    warnings.push(
      "ReCalc-calibrated transfer and timing; extrapolation is empirical, not a contact prediction.",
    );
  } else {
    // Accumulated projected impulses solve all active contacts together.
    // Shared ball/shaft velocities are updated after every impulse correction.
    const stateW = [...omegas];
    let travel = 0,
      t = 0;
    const arc = Math.abs(s.hoodEnd - s.hoodStart) * s.hoodRadius;
    while (t < s.maxContactTime && travel < arc) {
      const dt = Math.min(s.contactStep, s.maxContactTime - t);
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
        limit: number;
      }[] = [];
      for (let i = 0; i < ws.length; i++) {
        const sign = i === 0 ? 1 : -1;
        // A passive hood makes every hood contact (secondary and rollers) a
        // fixed surface with zero rim speed.
        const passive = i >= 1 && s.topology === "passive";
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
        // The hood path is unrolled along local +X and roller placement is
        // encoded by its center. Roller axles are parallel to the main wheel,
        // so the rim velocity at contact is tangent to the path: the mount
        // angle (angular placement around the hood) does not project it.
        const contactRadius = radii[i];
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
        contacts.push({
          i,
          sign,
          passive,
          driven,
          contactRadius,
          invMass,
          slip,
          impulse: 0,
          limit: s.friction * localNormal * dt,
        });
      }
      const kinetic = () =>
        0.5 * m * speed ** 2 +
        0.5 * I * spin ** 2 +
        (coupled
          ? 0.5 * (equivalentInertia ?? 0) * stateW[0] ** 2
          : stateW.reduce(
              (sum, w, i) => sum + 0.5 * (inertias[i] ?? 0) * w ** 2,
              0,
            ));
      const before = kinetic();
      for (let iteration = 0; iteration < 64; iteration++) {
        let change = 0;
        for (const contact of contacts) {
          const { i, passive, driven, contactRadius, sign, invMass, limit } =
            contact;
          const slip =
            (passive ? 0 : stateW[i] * contactRadius) - speed - sign * spin * r;
          const next = clamp(contact.impulse + slip / invMass, -limit, limit);
          const delta = next - contact.impulse;
          contact.impulse = next;
          speed += delta / m;
          spin += (sign * delta * r) / I;
          if (coupled && equivalentInertia && !passive) {
            const shaftDelta =
              (delta * contactRadius * ratios[i]) / equivalentInertia;
            for (let k = 0; k < stateW.length; k++)
              stateW[k] -= shaftDelta * ratios[k];
          } else if (!coupled && driven)
            stateW[i] -= (delta * contactRadius) / inertias[i]!;
          change = Math.max(change, Math.abs(delta));
        }
        if (change < 1e-12) break;
      }
      let boundaryWork = 0;
      for (const contact of contacts) {
        const { i, passive, driven, contactRadius, impulse, slip } = contact;
        if (!passive && (coupled ? !equivalentInertia : !driven))
          boundaryWork += impulse * stateW[i] * contactRadius;
        totalF += impulse / dt;
        maxSlip = Math.max(maxSlip, Math.abs(slip));
      }
      // A single before/after energy difference includes all cross-contact terms.
      slipLoss += Math.max(0, boundaryWork + before - kinetic());
      travel += Math.max(speed, 0) * dt;
      t += dt;
      if (
        trace.length === 0 ||
        t - trace[trace.length - 1].t >= 0.001 ||
        travel >= arc ||
        t >= s.maxContactTime
      )
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
    if (stored !== null)
      wheelEnergyLoss =
        stored -
        stateW.reduce(
          (sum, w, i) => sum + 0.5 * (inertias[i] ?? 0) * w ** 2,
          0,
        );
    contactTravel = travel;
    contactTime = t;
    exited = travel >= arc;
    if (travel < arc)
      warnings.push(
        "Projectile did not traverse contact arc before contact-time limit.",
      );
  }
  const energy = 0.5 * m * speed ** 2,
    rotationalEnergy = 0.5 * I * spin ** 2;
  const drop = unknown ? 0 : omegas[0] - post;
  // Net energy removed from finite wheels, including energy returned by a fast
  // feed. Hysteresis is a force-model estimate, not an extra energy debit.
  const consumed = wheelEnergyLoss;
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
    exited,
    contactTravel,
    contactTime,
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
        ? (energy + rotationalEnergy - 0.5 * m * p.initialVelocity ** 2) /
          consumed
        : null,
    trace,
    warnings,
  };
}
