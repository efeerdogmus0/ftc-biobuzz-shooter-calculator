import type { Config } from "../physics/types";
import { current } from "../presets";
/** Reject malformed/non-finite profiles before they can reach the numerical integrator. */
export function parseConfig(value: unknown): Config {
  function check(v: unknown, template: unknown, path: string) {
    if (template === null) {
      if (v !== null && (typeof v !== "number" || !Number.isFinite(v)))
        throw new Error(`${path}: expected finite number or null`);
      return;
    }
    if (Array.isArray(template)) {
      if (!Array.isArray(v)) throw new Error(`${path}: expected array`);
      if (
        template.length &&
        !path.endsWith("forceCurve") &&
        !path.endsWith("rollers") &&
        v.length !== template.length
      )
        throw new Error(`${path}: invalid array length`);
      v.forEach((item, i) => {
        const example =
          path.endsWith("forceCurve") || path.endsWith("rollers")
            ? template[0]
            : template[i];
        if (example !== undefined) check(item, example, `${path}.${i}`);
      });
      return;
    }
    if (typeof template === "object") {
      if (typeof v !== "object" || v === null)
        throw new Error(`${path}: expected object`);
      for (const k of Object.keys(template as object))
        check(
          (v as Record<string, unknown>)[k],
          (template as Record<string, unknown>)[k],
          `${path}.${k}`,
        );
      return;
    }
    if (
      typeof v !== typeof template ||
      (typeof v === "number" && !Number.isFinite(v))
    )
      throw new Error(`${path}: invalid value`);
  }
  check(value, current, "profile");
  const c = value as Config;
  if (c.version !== 1) throw new Error("Unsupported profile version");
  const positive = [
    c.projectile.diameter,
    c.projectile.mass,
    c.shooter.primary.diameter,
    c.shooter.secondary.diameter,
    c.shooter.ballStiffness,
    c.shooter.wheelStiffness,
    c.shooter.hoodRadius,
    c.field.size,
    c.field.target.width,
    c.field.target.height,
    c.field.target.depth,
    c.field.target.thickness,
    c.simulation.absTolerance,
    c.simulation.relTolerance,
    c.simulation.maxStep,
    c.simulation.maxTime,
    c.shooter.contactStep,
    c.shooter.maxContactTime,
  ];
  if (positive.some((x) => x <= 0))
    throw new Error(
      "Dimensions, mass, stiffness and integration controls must be positive.",
    );
  if (
    c.shooter.hoodMin > c.shooter.hoodMax ||
    c.shooter.hoodAngle < c.shooter.hoodMin ||
    c.shooter.hoodAngle > c.shooter.hoodMax
  )
    throw new Error("Hood angle must lie within ordered limits.");
  for (const roller of [c.shooter.secondary, ...c.shooter.rollers]) {
    if (
      roller.radius <= 0 ||
      roller.contactStart > roller.contactEnd ||
      !roller.center.every(Number.isFinite)
    )
      throw new Error("Invalid hood roller contact geometry.");
  }
  if (
    c.simulation.minOmega < 0 ||
    c.simulation.minOmega >= c.simulation.maxOmega ||
    c.simulation.maxSpeed <= 0
  )
    throw new Error("Invalid solver speed limits.");
  if (
    c.shooter.contactStep < 0.00001 ||
    c.shooter.contactStep > 0.001 ||
    c.simulation.maxStep > 0.05 ||
    c.simulation.maxTime > 30
  )
    throw new Error("Integration settings exceed interactive safety bounds.");
  for (const w of [
    c.shooter.primary,
    c.shooter.secondary,
    c.shooter.flywheel,
    ...c.shooter.rollers,
  ]) {
    check(w, current.shooter.primary, "wheel");
    if (
      w.diameter <= 0 ||
      w.omega < 0 ||
      w.omega > 50000 ||
      (w.inertia !== null && w.inertia < 0) ||
      (w.mass !== null && w.mass < 0)
    )
      throw new Error("Invalid wheel properties.");
    if (!["unknown", "disk", "custom"].includes(w.inertiaMode))
      throw new Error("Invalid inertia mode.");
  }
  for (const box of c.field.obstacles) {
    if (
      !box ||
      !Array.isArray(box.min) ||
      !Array.isArray(box.max) ||
      box.min.length !== 3 ||
      box.max.length !== 3 ||
      box.min.some(
        (x, i) =>
          !Number.isFinite(x) ||
          !Number.isFinite(box.max[i]) ||
          x >= box.max[i],
      )
    )
      throw new Error("Invalid obstacle bounds.");
  }
  for (const pair of c.shooter.forceCurve)
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      pair.some((x) => !Number.isFinite(x) || x < 0)
    )
      throw new Error("Invalid compression curve.");
  if (c.shooter.forceCurve.some((p, i, a) => i > 0 && p[0] <= a[i - 1][0]))
    throw new Error("Force curve compression must be strictly increasing.");
  if (c.shooter.normalModel === "table" && c.shooter.forceCurve.length < 2)
    throw new Error("Measured force curve needs at least two points.");
  const motor = c.shooter.motor;
  if (
    motor.count < 1 ||
    motor.count > 16 ||
    !Number.isInteger(motor.count) ||
    motor.resistance <= 0 ||
    motor.reduction <= 0 ||
    motor.efficiency <= 0 ||
    motor.efficiency > 1 ||
    motor.voltage <= 0 ||
    motor.statorLimit <= 0 ||
    motor.supplyLimit <= 0 ||
    motor.batteryResistance < 0 ||
    motor.torqueConstant <= 0
  )
    throw new Error("Invalid motor/electrical configuration.");
  if (
    c.robot.width <= 0 ||
    c.robot.length <= 0 ||
    c.shooter.maxContactTime > 1 ||
    c.shooter.rollers.length > 16 ||
    c.simulation.absTolerance < 1e-12 ||
    c.simulation.relTolerance < 1e-12 ||
    c.simulation.maxStep < 1e-5
  )
    throw new Error("Invalid geometry or excessive integration workload.");
  const enums: [string, string[]][] = [
    [c.shooter.mode, ["physical", "recalc"]],
    [c.shooter.topology, ["passive", "powered", "opposing", "compound"]],
    [c.shooter.link, ["independent", "gear", "surface"]],
    [c.shooter.normalModel, ["linear", "table"]],
    [c.projectile.model, ["sphere", "calibrated"]],
    [
      c.simulation.objective,
      ["energy", "rpm", "clearance", "robustness", "time"],
    ],
    [c.simulation.apex, ["any", "before", "at", "after"]],
  ];
  if (enums.some(([v, a]) => !a.includes(v)))
    throw new Error("Unrecognized model or solver option.");
  if (
    c.aero.cd < 0 ||
    c.aero.liftSlope < 0 ||
    c.aero.liftMax < 0 ||
    c.aero.spinDecay < 0 ||
    c.environment.density < 0 ||
    c.environment.gravity <= 0 ||
    c.shooter.friction < 0 ||
    c.shooter.compression < 0 ||
    c.shooter.hysteresis < 0 ||
    c.shooter.hysteresis >= 1 ||
    (c.projectile.inertia !== null && c.projectile.inertia <= 0)
  )
    throw new Error("Nonphysical coefficient.");
  return structuredClone(c);
}
export function downloadJSON(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function getPath(o: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((v, key) => (v as Record<string, unknown>)[key], o);
}
export function setPath<T>(o: T, path: string, value: unknown): T {
  const c = structuredClone(o),
    keys = path.split(".");
  let node: unknown = c;
  for (const key of keys.slice(0, -1))
    node = (node as Record<string, unknown>)[key];
  (node as Record<string, unknown>)[keys[keys.length - 1]] = value;
  return c;
}
