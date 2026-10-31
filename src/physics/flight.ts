import type {
  Config,
  Vec3,
  Sample,
  FlightResult,
  Entry,
  Box,
  Shot,
} from "./types";
import { add, sub, scale, dot, norm, lerp, rotateZ } from "./math";
import { integrate } from "./integrator";
import { sampleAerodynamics } from "./aerodynamics";
import {
  bodyInertia,
  ballKineticEnergy,
  launchInertia as selectedLaunchInertia,
  type BallModelSettings,
} from "./launchDynamics";
import { eulerRotation, tensor, multiply, type Rotation } from "./rigidMath";
import { advanceRotation } from "./contactModel";
import { shapeAxes } from "./pollenShape";
import { ballInertia, simulateShooter, spinVector } from "./shooter";
import { collisionCells } from "../field/hiveGeometry";
import { obstaclePurpose } from "../field/obstacles";
import {
  hiveStructureSolids,
  structureContact,
  sweepStructure,
} from "../field/hiveStructure";
import {
  targetBasis,
  targetLocal,
  targetOpeningClearance,
  cellSolids,
  cellContact,
  sweepCellSolid,
  segmentBox,
} from "./cellGeometry";
export {
  targetBasis,
  targetLocal,
  targetWorld,
  targetOpeningClearance,
  targetOpeningTop,
  targetOpeningPoints,
  segmentBox,
} from "./cellGeometry";

/** Cubic Hermite dense position; velocity is its derivative. Event roots use bisection. */
export function interpolate(a: Sample, b: Sample, u: number): Sample {
  const h = b.t - a.t,
    u2 = u * u,
    u3 = u2 * u;
  return {
    t: a.t + h * u,
    p: a.p.map(
      (x, i) =>
        (2 * u3 - 3 * u2 + 1) * x +
        (u3 - 2 * u2 + u) * h * a.v[i] +
        (-2 * u3 + 3 * u2) * b.p[i] +
        (u3 - u2) * h * b.v[i],
    ) as Vec3,
    v: a.v.map(
      (_, i) =>
        ((6 * u2 - 6 * u) * a.p[i] +
          (3 * u2 - 4 * u + 1) * h * a.v[i] +
          (-6 * u2 + 6 * u) * b.p[i] +
          (3 * u2 - 2 * u) * h * b.v[i]) /
        h,
    ) as Vec3,
    spin: lerp(a.spin, b.spin, u),
    rotation:
      a.rotation && b.rotation
        ? (() => {
            const sign =
              a.rotation.reduce((sum, v, i) => sum + v * b.rotation![i], 0) < 0
                ? -1
                : 1;
            const q = a.rotation.map(
              (v, i) => v * (1 - u) + b.rotation![i] * u * sign,
            );
            const length = Math.hypot(...q);
            return q.map((v) => v / length) as [number, number, number, number];
          })()
        : (a.rotation ?? b.rotation),
  };
}
function root(a: Sample, b: Sample, f: (s: Sample) => number) {
  let l = 0,
    h = 1;
  const sign = f(a);
  for (let i = 0; i < 35; i++) {
    const mid = (l + h) / 2;
    if (f(interpolate(a, b, mid)) * sign > 0) l = mid;
    else h = mid;
  }
  return interpolate(a, b, (l + h) / 2);
}
export function sampleAt(samples: Sample[], time: number) {
  if (time <= 0) return samples[0];
  for (let i = 1; i < samples.length; i++)
    if (samples[i].t >= time)
      return interpolate(
        samples[i - 1],
        samples[i],
        (time - samples[i - 1].t) / (samples[i].t - samples[i - 1].t),
      );
  return samples[samples.length - 1];
}
export function boxNormal(p: Vec3, v: Vec3, box: Box, r: number): Vec3 {
  let best = Infinity;
  let normal: Vec3 = [0, 0, 1];
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      const distance = Math.abs(
        p[axis] - (sign < 0 ? box.min[axis] - r : box.max[axis] + r),
      );
      if (v[axis] * sign < 0 && distance < best) {
        best = distance;
        normal = [0, 0, 0];
        normal[axis] = sign;
      }
    }
  }
  return normal;
}
export function fieldBoxes(c: Config): Box[] {
  const half = c.field.size / 2;
  return [
    {
      min: [-half - 0.1, -half, 0],
      max: [-half, half, c.field.wallHeight],
      name: "West wall",
    },
    {
      min: [half, -half, 0],
      max: [half + 0.1, half, c.field.wallHeight],
      name: "East wall",
    },
    {
      min: [-half, -half - 0.1, 0],
      max: [half, -half, c.field.wallHeight],
      name: "South wall",
    },
    {
      min: [-half, half, 0],
      max: [half, half + 0.1, c.field.wallHeight],
      name: "North wall",
    },
    ...c.field.obstacles.filter((box) => obstaclePurpose(box) === "solid"),
  ];
}
export function contactActive(c: Config, p: Vec3, surface: string) {
  const r = c.projectile.diameter / 2 + 2e-5;
  const structure = surface.startsWith("HIVE ")
    ? hiveStructureSolids(c.field).find((s) => s.name === surface)
    : undefined;
  if (structure) return !!structureContact(p, structure, r);
  if (surface.includes("CELL")) {
    return collisionCells(c.field).some(({ target, prefix }) => {
      const solid = cellSolids(target).find(
        (s) => prefix + s.box.name === surface,
      );
      return !!solid && !!cellContact(targetLocal(p, target), solid, target, r);
    });
  }
  const box = fieldBoxes(c).find((b) => b.name === surface);
  return !!box && p.every((x, i) => x >= box.min[i] - r && x <= box.max[i] + r);
}
export function flight(
  origin: Vec3,
  velocity: Vec3,
  spin: Vec3,
  c: Config,
  collisions = true,
  supports: { surface: string; normal: Vec3; friction: number }[] = [],
  inertia = ballInertia(c),
  model?: BallModelSettings,
  endAtOpening = false,
): FlightResult {
  const r = c.projectile.diameter / 2,
    sim = c.simulation;
  const diagonal: Vec3 = model
      ? bodyInertia(c, model)
      : [inertia, inertia, inertia],
    axes = shapeAxes(model ?? {}),
    q0 = eulerRotation(model?.orientation ?? [0, 0, 0]),
    momentum = tensor(q0, diagonal, spin),
    isotropic = Math.max(...diagonal) - Math.min(...diagonal) < 1e-14,
    sphericalArea = axes.every((v) => v === 1);
  const normalize = (q: number[]) => {
    const length = Math.hypot(...q);
    return q.map((v) => v / length) as Rotation;
  };
  const rotationAt = (t: number, y: number[]): Rotation =>
    isotropic
      ? advanceRotation(
          q0,
          spin,
          c.aero.spinDecay > 0
            ? -Math.expm1(-c.aero.spinDecay * t) / c.aero.spinDecay
            : t,
        )
      : normalize(y.slice(6, 10));
  const spinAt = (t: number, q: Rotation) =>
    isotropic
      ? scale(spin, Math.exp(-c.aero.spinDecay * t))
      : tensor(
          q,
          diagonal,
          scale(momentum, Math.exp(-c.aero.spinDecay * t)),
          true,
        );
  if (origin[2] < r) {
    const initial: Sample = {
      t: 0,
      p: origin,
      v: velocity,
      spin,
      rotation: q0,
    };
    return {
      samples: [initial],
      apex: initial,
      entry: null,
      impact: initial,
      status: "COLLIDED BEFORE ENTRY",
      collision: "Floor (launch overlap)",
      ballInertia: diagonal,
      aeroAxes: axes,
      missDistance: norm(sub(origin, c.field.target.center)),
      warnings: ["Launch point overlaps the floor."],
    };
  }
  const supported = (p: Vec3, surface: string) => contactActive(c, p, surface);
  let seenFront = targetLocal(origin, c.field.target)[2] > 0,
    endedAtOpening = false;
  const openingNormal = targetBasis(c.field.target).n;
  const reachedOpening = (y: number[]) => {
    if (!endAtOpening) return false;
    const local = targetLocal(y.slice(0, 3) as Vec3, c.field.target);
    if (local[2] > 0) seenFront = true;
    endedAtOpening =
      seenFront &&
      local[2] <= 0 &&
      dot(y.slice(3, 6) as Vec3, openingNormal) < 0;
    return endedAtOpening;
  };
  const constrained = (p: Vec3, v: Vec3, acceleration: Vec3) => {
    let a = acceleration,
      frictionLoad = 0;
    for (const support of supports) {
      if (!supported(p, support.surface)) continue;
      frictionLoad += support.friction * Math.max(0, -dot(a, support.normal));
      a = sub(a, scale(support.normal, dot(a, support.normal)));
    }
    const speed = norm(v);
    const direction =
      speed > 0.01
        ? scale(v, 1 / speed)
        : norm(a) > 0
          ? scale(a, 1 / norm(a))
          : ([0, 0, 0] as Vec3);
    return sub(
      a,
      scale(
        direction,
        Math.min(frictionLoad, speed > 0.01 ? Infinity : norm(a)),
      ),
    );
  };
  const states = integrate(
    (t, y) => {
      const v = y.slice(3, 6) as Vec3,
        q = isotropic && sphericalArea ? q0 : rotationAt(t, y),
        w = spinAt(t, q),
        { drag, lift } = sampleAerodynamics(
          { t, p: y.slice(0, 3) as Vec3, v, spin: w, rotation: q },
          c,
          axes,
        );
      let a = add(scale(add(drag, lift), 1 / c.projectile.mass), [
        0,
        0,
        -c.environment.gravity,
      ]);
      a = constrained(y.slice(0, 3) as Vec3, v, a);
      const dq = isotropic
        ? []
        : multiply([w[0], w[1], w[2], 0], q).map((v) => 0.5 * v);
      return [...v, a[0], a[1], a[2], ...dq];
    },
    [...origin, ...velocity, ...(isotropic ? [] : q0)],
    sim.maxTime,
    sim.absTolerance,
    sim.relTolerance,
    Math.min(
      sim.maxStep,
      axes.some((v) => Math.abs(v - 1) > 1e-12)
        ? 0.2 / Math.max(1e-9, norm(spin))
        : Infinity,
    ),
    (_t, y) =>
      y[2] <= r ||
      reachedOpening(y) ||
      (supports.some((s) => supported(y.slice(0, 3) as Vec3, s.surface)) &&
        norm(y.slice(3, 6) as Vec3) < 0.01 &&
        norm(
          constrained(
            y.slice(0, 3) as Vec3,
            [0, 0, 0],
            [0, 0, -c.environment.gravity],
          ),
        ) < 0.01),
  );
  const all: Sample[] = states.map((s) => {
    const rotation = rotationAt(s.t, s.y);
    return {
      t: s.t,
      p: s.y.slice(0, 3) as Vec3,
      v: s.y.slice(3, 6) as Vec3,
      spin: spinAt(s.t, rotation),
      rotation,
    };
  });
  const target = c.field.target,
    { n } = targetBasis(target),
    walls = fieldBoxes(c),
    structures = collisions ? hiveStructureSolids(c.field) : [],
    cells = collisionCells(c.field).map((cell) => ({
      ...cell,
      solids: cellSolids(cell.target),
    }));
  let entry: Entry | null = null,
    impact: Sample | null = null,
    collision: string | null = null,
    impactNormal: Vec3 = [0, 0, 1],
    status: FlightResult["status"] = "MISS",
    apex = all[0],
    missDistance = Infinity;
  const samples = [all[0]];
  for (let i = 1; i < all.length; i++) {
    const a = all[i - 1],
      b = all[i];
    let terminal: Sample | null = null,
      name: string | null = null,
      normal: Vec3 = [0, 0, 1];
    if (a.v[2] > 0 && b.v[2] <= 0) apex = root(a, b, (s) => s.v[2]);
    else if (b.p[2] > apex.p[2]) apex = b;
    if (b.p[2] <= r) {
      terminal = root(a, b, (s) => s.p[2] - r);
      name = "Floor";
    }
    const la = targetLocal(a.p, target),
      lb = targetLocal(b.p, target);
    if (collisions) {
      for (const box of walls) {
        if (
          supports.some(
            (s) => box.name === s.surface && supported(a.p, s.surface),
          )
        )
          continue;
        const u = segmentBox(a.p, b.p, box, r);
        if (u !== null) {
          const hit = interpolate(a, b, u);
          if (!terminal || hit.t < terminal.t) {
            terminal = hit;
            name = box.name;
            normal = boxNormal(hit.p, hit.v, box, r);
          }
        }
      }
      for (const solid of structures) {
        if (
          supports.some(
            (s) => s.surface === solid.name && supported(a.p, s.surface),
          )
        )
          continue;
        const contact = sweepStructure(a.p, b.p, solid, r);
        if (contact) {
          const hit = interpolate(a, b, contact.u);
          if (!terminal || hit.t < terminal.t) {
            terminal = hit;
            name = solid.name;
            normal = contact.normal;
          }
        }
      }
      for (const cell of cells) {
        const ca = targetLocal(a.p, cell.target),
          cb = targetLocal(b.p, cell.target),
          t = cell.target;
        if (
          segmentBox(
            ca,
            cb,
            {
              name: "CELL bounds",
              min: [
                -t.width / 2 - t.thickness,
                -t.height / 2 - t.thickness,
                -t.depth - t.thickness,
              ],
              max: [t.width / 2 + t.thickness, t.height / 2 + t.thickness, 0],
            },
            r,
          ) === null
        )
          continue;
        for (const solid of cell.solids) {
          if (
            supports.some(
              (s) =>
                s.surface === cell.prefix + solid.box.name &&
                supported(a.p, s.surface),
            )
          )
            continue;
          const contact = sweepCellSolid(ca, cb, solid, cell.target, r);
          if (contact) {
            const hit = interpolate(a, b, contact.u);
            if (!terminal || hit.t < terminal.t) {
              terminal = hit;
              name = cell.prefix + solid.box.name;
              const basis = targetBasis(cell.target),
                local = contact.normal;
              normal = add(
                add(scale(basis.u, local[0]), scale(basis.v, local[1])),
                scale(basis.n, local[2]),
              );
            }
          }
        }
      }
      if (la[2] > 0 && lb[2] <= 0 && !entry) {
        const hit = root(a, b, (s) => targetLocal(s.p, target)[2]),
          local = targetLocal(hit.p, target);
        const clearance = targetOpeningClearance(target, local, r);
        missDistance = Math.max(0, -clearance);
        if ((!terminal || hit.t <= terminal.t) && clearance >= 0) {
          const speed = norm(hit.v);
          entry = {
            ...hit,
            speed,
            angle: Math.atan2(-hit.v[2], Math.hypot(hit.v[0], hit.v[1])),
            incidence: Math.acos(
              Math.min(1, Math.max(-1, -dot(hit.v, n) / speed)),
            ),
            clearance,
            energy: ballKineticEnergy(c, hit, diagonal),
            local: [local[0], local[1]],
          };
          status = "HIT";
        }
      }
    }
    if (terminal) {
      impact = terminal;
      collision = name;
      impactNormal = normal;
      samples.push(terminal);
      if (!entry && name !== "Floor")
        status =
          name?.includes("rim") || name?.includes("roof")
            ? "CLIPPED EDGE"
            : "COLLIDED BEFORE ENTRY";
      break;
    }
    samples.push(b);
  }
  // Apex is only a point on the actual (possibly interrupted) flight.
  if (impact && apex.t > impact.t)
    apex = samples.reduce((a, b) => (a.p[2] > b.p[2] ? a : b));
  if (!Number.isFinite(missDistance))
    missDistance = Math.min(
      ...samples.map((s) => norm(sub(s.p, target.center))),
    );
  return {
    samples,
    apex,
    entry,
    impact,
    status,
    collision,
    impactNormal,
    ballInertia: diagonal,
    aeroAxes: axes,
    missDistance,
    warnings:
      impact || endedAtOpening
        ? []
        : ["Flight time limit reached before impact."],
  };
}
export function shooterPose(c: Config) {
  const r = c.robot;
  const yaw = r.heading + r.turretYaw;
  const center = add([r.x, r.y, 0], rotateZ(r.turretCenter, r.heading));
  return { origin: add(center, rotateZ(r.exitOffset, yaw)), yaw };
}
export function simulate(
  c: Config,
  launchInertia?: number,
  model?: BallModelSettings,
): Shot {
  const effectiveInertia = model
    ? selectedLaunchInertia(c, model)
    : launchInertia;
  const shooter = simulateShooter(c, effectiveInertia),
    { origin, yaw } = shooterPose(c),
    pitch = c.shooter.hoodAngle + c.shooter.hoodOffset;
  let velocity: Vec3 = [
    shooter.speed * Math.cos(pitch) * Math.cos(yaw),
    shooter.speed * Math.cos(pitch) * Math.sin(yaw),
    shooter.speed * Math.sin(pitch),
  ];
  if (c.robot.inheritVelocity) velocity = add(velocity, c.robot.velocity);
  const spin = spinVector(yaw, shooter.spin);
  const initial: Sample = { t: 0, p: origin, v: [0, 0, 0], spin: [0, 0, 0] };
  return {
    config: c,
    shooter,
    origin,
    velocity,
    spin,
    flight: shooter.exited
      ? flight(origin, velocity, spin, c, true, [], effectiveInertia, model)
      : {
          samples: [initial],
          apex: initial,
          entry: null,
          impact: null,
          status: "NO EXIT",
          collision: null,
          missDistance: norm(sub(origin, c.field.target.center)),
          warnings: [
            "Ball did not reach the shooter exit; no flight simulated.",
          ],
        },
  };
}
export function aim(c: Config) {
  const out = structuredClone(c);
  let yaw = out.robot.turretYaw;
  for (let i = 0; i < 5; i++) {
    out.robot.turretYaw = yaw;
    const { origin } = shooterPose(out);
    yaw =
      Math.atan2(
        out.field.target.center[1] - origin[1],
        out.field.target.center[0] - origin[0],
      ) - out.robot.heading;
  }
  out.robot.turretYaw = yaw;
  return out;
}
