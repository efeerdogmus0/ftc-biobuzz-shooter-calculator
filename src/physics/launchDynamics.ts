import type { BounceSettings, Config, Vec3, Shot, Sample } from "./types";
import { contactInertia } from "./contactModel";
import { holeAxes, pollenInertia } from "./pollenShape";
import { eulerRotation, tensor, identity } from "./rigidMath";
import { spinVector } from "./shooter";
import { dot, norm } from "./math";
import { ballInertia } from "./shooter";
export type BallModelSettings = Pick<
  BounceSettings,
  | "shapeModel"
  | "inertiaModel"
  | "asphericity"
  | "hemispherePhase"
  | "orientation"
>;
/** Bounce playback and contact materials do not define the launched ball. */
export function ballModelSettings(
  s: BallModelSettings = {},
): BallModelSettings {
  return {
    shapeModel: s.shapeModel ?? "sphere",
    inertiaModel: s.inertiaModel ?? "config",
    asphericity: s.asphericity ?? 0.01,
    hemispherePhase: s.hemispherePhase ?? 0,
    orientation: [...(s.orientation ?? [0, 0, 0])],
  };
}
export function physicsStamp(c: Config, s: BallModelSettings) {
  return JSON.stringify({ config: c, ballModel: ballModelSettings(s) });
}
const shellCache = new Map<string, Vec3>();
// Geometry quadrature is dimensionless. Changing mass/diameter in Monte Carlo
// scales it exactly rather than re-integrating the same shell thousands of times.
function shellInertia(c: Config, s: BounceSettings): Vec3 {
  const key = JSON.stringify([s.asphericity ?? 0.01, s.hemispherePhase ?? 0]);
  let coefficients = shellCache.get(key);
  if (!coefficients) {
    coefficients = pollenInertia(1, 1, s, holeAxes(s));
    if (shellCache.size >= 32)
      shellCache.delete(shellCache.keys().next().value!);
    shellCache.set(key, coefficients);
  }
  return coefficients.map(
    (v) => v * c.projectile.mass * (c.projectile.diameter / 2) ** 2,
  ) as Vec3;
}

/** One mass distribution for both wheel contact and the subsequent world. */
export function bodyInertia(c: Config, model: BallModelSettings): Vec3 {
  const settings = {
    floor: 0,
    wall: 0,
    cell: 0,
    friction: 0,
    rollingResistance: 0,
    ...model,
  };
  if (
    settings.shapeModel === "pollen" &&
    (settings.inertiaModel ?? "config") === "config" &&
    c.projectile.inertia === null
  )
    return shellInertia(c, settings);
  const inertia = contactInertia(c, settings);
  return [inertia, inertia, inertia];
}

/** The shooter constrains rotation to its transverse wheel axis. */
export function launchInertia(c: Config, settings?: BallModelSettings) {
  if (!settings)
    return contactInertia(c, {
      floor: 0,
      wall: 0,
      cell: 0,
      friction: 0,
      rollingResistance: 0,
    });
  const axis = spinVector(c.robot.heading + c.robot.turretYaw, 1),
    q = eulerRotation(settings.orientation ?? [0, 0, 0]);
  return dot(axis, tensor(q, bodyInertia(c, settings), axis));
}

export function ballKineticEnergy(c: Config, sample: Sample, diagonal: Vec3) {
  return (
    0.5 * c.projectile.mass * norm(sample.v) ** 2 +
    0.5 *
      dot(
        sample.spin,
        tensor(sample.rotation ?? identity, diagonal, sample.spin),
      )
  );
}
/** Older in-memory shots may lack the new tensor metadata. The recorded launch
 * rotational energy still identifies their effective scalar inertia. */
export function shotKineticEnergy(shot: Shot, sample: Sample) {
  const spin2 = norm(shot.spin) ** 2;
  const scalar =
    shot.flight.diagnostics?.inertia ??
    (spin2 > 1e-20
      ? (2 * shot.shooter.rotationalEnergy) / spin2
      : ballInertia(shot.config));
  const diagonal = shot.flight.ballInertia ??
    shot.flight.pollenInertia ?? [scalar, scalar, scalar];
  return ballKineticEnergy(shot.config, sample, diagonal);
}
