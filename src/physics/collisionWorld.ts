import {
  cellSolids,
  cellSurfaces,
  cellContact,
  sphereBoxContact,
  type CellSolid,
  type Contact,
} from "./cellGeometry";
import {
  material,
  effectiveRestitution,
  contactStep,
  hertzContact,
  dampingWork,
  advanceRotation,
  type SurfaceKind,
} from "./contactModel";
import type {
  BounceSettings,
  Config,
  Sample,
  Shot,
  Vec3,
  BounceEvent,
  BallTrack,
  EnergyFrame,
  BounceDiagnostics,
  HiveSample,
} from "./types";
import {
  fieldBoxes,
  targetBasis,
  targetLocal,
  targetWorld,
  targetOpeningClearance,
} from "./flight";
import { add, sub, scale, dot, norm, cross, unit, clamp } from "./math";
import { sampleAerodynamics } from "./aerodynamics";
import { ballInertia } from "./shooter";
import { tensor, identity, eulerRotation } from "./rigidMath";
import { shapeSupport, shapeAxes, holeAxes } from "./pollenShape";
import { bodyInertia } from "./launchDynamics";
import { collisionCells } from "../field/hiveGeometry";
import { hiveStructureSolids, structureContact } from "../field/hiveStructure";
import {
  createHive,
  hiveTarget,
  hivePoint,
  hiveInversePoint,
  hiveVector,
  hiveVelocity,
  hingeJacobian,
  hivePotential,
  hiveTorque,
} from "./hiveDynamics";

export const ballColors = [
  "#f5ce77",
  "#79bfff",
  "#ce9dff",
  "#ff9cab",
  "#a0dc88",
  "#ffab72",
  "#8ee6db",
  "#d2d7ff",
  "#f3bd8d",
];
interface Body {
  p: Vec3;
  v: Vec3;
  spin: Vec3;
  id: number;
  q?: [number, number, number, number];
}
interface Solid extends CellSolid {
  target: boolean;
  cellId?: number;
}
export { sphereBoxContact } from "./cellGeometry";
export function cellSurfaceGeometry(c: Config) {
  return cellSurfaces(c.field.target);
}
function solidContact(
  p: Vec3,
  solid: Solid,
  c: Config,
  radius: number,
): Contact | null {
  if (!solid.target) return sphereBoxContact(p, solid.box, radius);
  const hit = cellContact(
    targetLocal(p, c.field.target),
    solid,
    c.field.target,
    radius,
  );
  if (!hit) return null;
  const { u, v, n } = targetBasis(c.field.target);
  return {
    ...hit,
    point: targetWorld(hit.point, c.field.target),
    normal: add(
      add(scale(u, hit.normal[0]), scale(v, hit.normal[1])),
      scale(n, hit.normal[2]),
    ),
  };
}
/** Equal-mass sphere pair impulse with both contact spins and Coulomb friction. */
export function pairImpulse(
  a: Pick<Body, "v" | "spin">,
  b: Pick<Body, "v" | "spin">,
  n: Vec3,
  e: number,
  friction: number,
  c: Config,
) {
  const m = c.projectile.mass,
    r = c.projectile.diameter / 2,
    inertia = ballInertia(c);
  const relative = sub(a.v, b.v),
    vn = dot(relative, n);
  if (vn >= 0) return { a: { ...a }, b: { ...b }, impulse: 0 };
  const jn = (-(1 + clamp(e, 0, 1)) * vn * m) / 2;
  const armA = scale(n, -r),
    armB = scale(n, r);
  const relativeContact = sub(
    add(a.v, cross(a.spin, armA)),
    add(b.v, cross(b.spin, armB)),
  );
  const tangent = sub(relativeContact, scale(n, dot(relativeContact, n)));
  const jt = Math.min(
    Math.max(0, friction) * jn,
    norm(tangent) / (2 / m + (2 * r * r) / inertia),
  );
  const j = add(scale(n, jn), scale(unit(tangent), -jt));
  return {
    a: {
      v: add(a.v, scale(j, 1 / m)),
      spin: add(a.spin, scale(cross(armA, j), 1 / inertia)),
    },
    b: {
      v: sub(b.v, scale(j, 1 / m)),
      spin: sub(b.spin, scale(cross(armB, j), 1 / inertia)),
    },
    impulse: norm(j),
  };
}
export function inCell(p: Vec3, c: Config) {
  const r = c.projectile.diameter / 2,
    local = targetLocal(p, c.field.target);
  return (
    local[2] <= -r + 0.002 &&
    local[2] >= -c.field.target.depth + r - 0.002 &&
    targetOpeningClearance(c.field.target, local, r) >= -0.002
  );
}
/** Explicit example placement, never a claim about real accumulation. Manual
 * positions are in CELL coordinates and settle under gravity before launch. */
export function placementError(c: Config, positions: Vec3[]): string | null {
  const r = c.projectile.diameter / 2,
    t = c.field.target;
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    if (
      !p.every(Number.isFinite) ||
      p[2] < -t.depth + r - 1e-6 ||
      p[2] > -r + 1e-6 ||
      targetOpeningClearance(t, p, r) < -1e-6
    )
      return "Top CELL'in dışına veya duvarına taşıyor.";
    for (let j = 0; j < i; j++)
      if (norm(sub(p, positions[j])) < 2 * r - 1e-6)
        return "İki top üst üste geçiyor; aralarında biraz boşluk bırak.";
  }
  return null;
}
export function residentPositions(
  c: Config,
  count: number,
  layout: "center" | "left" | "right" | "manual",
  custom: Vec3[] = [],
): Vec3[] {
  const n = Math.min(8, Math.max(0, Math.round(count))),
    r = c.projectile.diameter / 2,
    t = c.field.target;
  if (n === 0) return [];
  if (layout === "manual" && custom.length >= n) {
    const positions = custom.slice(0, n);
    const error = placementError(c, positions);
    if (error) throw new Error(error);
    return positions.map((p) => targetWorld(p, t));
  }
  // A single row is an editable example. Nominal seven 2.8-inch POLLEN fit
  // side by side in the current 20-inch CELL; never compress balls to fit.
  const gap = 2 * r + 0.001;
  if (n === 8) {
    const positions: Vec3[] = Array.from({ length: n }, (_, i) => [
      ((i % 4) - 1.5) * gap,
      -t.height / 2 + r + 0.002,
      -t.depth + r + 0.002 + Math.floor(i / 4) * gap,
    ]);
    const error = placementError(c, positions);
    if (error) throw new Error(error);
    return positions.map((p) => targetWorld(p, t));
  }
  if (
    n * 2 * r + Math.max(0, n - 1) * 0.001 > t.width - 0.001 ||
    2 * r > t.depth ||
    2 * r > t.height
  )
    throw new Error(
      "Bu top çapıyla tek sıra örneği sığmıyor; ölçüyü veya top sayısını azalt.",
    );
  const halfSpan = (Math.max(0, n - 1) * gap) / 2;
  const shift =
    layout === "left"
      ? -t.width / 2 + r + 0.001 + halfSpan
      : layout === "right"
        ? t.width / 2 - r - 0.001 - halfSpan
        : 0;
  const positions: Vec3[] = Array.from({ length: n }, (_, i) => [
    shift + (i - (n - 1) / 2) * gap,
    -t.height / 2 + r + 0.001,
    -t.depth + r + 0.001,
  ]);
  const error = placementError(c, positions);
  if (error) throw new Error(error);
  return positions.map((p) => targetWorld(p, t));
}
const sample = (b: Body, t: number): Sample => ({
  t,
  p: [...b.p] as Vec3,
  v: [...b.v] as Vec3,
  spin: [...b.spin] as Vec3,
  rotation: b.q ?? [0, 0, 0, 1],
});
export interface WorldProgress {
  phase: "settling" | "flight";
  time: number;
}
interface Constraint {
  key: string;
  a: Body;
  b?: Body;
  armA: Vec3;
  armB?: Vec3;
  hinge: boolean;
  n: Vec3;
  point: Vec3;
  penetration: number;
  surface: string;
  kind: SurfaceKind;
  initialA: Sample;
  initialB?: Sample;
  initialRelative: Vec3;
  initialSurfaceVelocity: Vec3;
  pA: Vec3;
  pB?: Vec3;
  normalImpulse: number;
  tangentImpulse: Vec3;
  target: number;
  e: number;
  force: number;
  regime: "sticking" | "sliding";
}
/** Multi-contact projected impulse solver or continuous viscoelastic contact.
 * Sphere orientations, contact-load resistance and initialization dynamics are
 * retained. Progress runs in a worker in the app; direct callers remain pure. */
export function simulateBounceWorld(
  shot: Shot,
  settings: BounceSettings,
  count = 0,
  layout: "center" | "left" | "right" | "manual" = "center",
  custom: Vec3[] = [],
  progress?: (p: WorldProgress) => void,
): Shot {
  if (!shot.shooter.exited) return shot;
  const c = shot.config,
    r = c.projectile.diameter / 2,
    m = c.projectile.mass,
    soft = settings.contactModel === "hertz",
    hive = createHive(c, settings),
    holes = holeAxes(settings),
    axes = shapeAxes(settings),
    bound = r * Math.max(...axes),
    diagonal = bodyInertia(c, settings),
    launchRotation = eulerRotation(settings.orientation ?? [0, 0, 0]);
  const initialOmega = hive.omega;
  hive.omega = 0;
  const cells = collisionCells(c.field);
  const structures = hiveStructureSolids(c.field);
  const cellBounds = cells.map(
    ({ target: t }) =>
      Math.hypot(t.width / 2, t.height / 2, t.depth) + bound + 0.02,
  );
  const solids: Solid[] = [
    ...fieldBoxes(c).map((box) => ({ box, target: false })),
    ...cells.flatMap((cell, cellId) =>
      cellSolids(cell.target).map((s) => ({ ...s, target: true, cellId })),
    ),
  ];
  const residents: Body[] = residentPositions(c, count, layout, custom).map(
    (p, i) => ({
      id: i + 1,
      p: hivePoint(hive, p),
      v: [0, 0, 0],
      spin: [0, 0, 0],
      q: eulerRotation([i * 0.73, i * 1.27, i * 0.41]),
    }),
  );
  let bodies = residents,
    time = 0,
    warmup = true,
    previous = new Set<string>(),
    totalSteps = 0,
    maxOverlap = 0,
    maxForce = 0,
    minStep = Infinity;
  let aeroWork = 0,
    contactWork = 0,
    frictionWork = 0,
    normalDissipationLoss = 0,
    correctionWork = 0,
    resistanceLoss = 0,
    slipContacts = 0,
    stickContacts = 0,
    lastElastic = 0;
  let hingeLoss = 0,
    loadTorque = 0,
    lastStable = hive.angle > hive.travel / 2 ? 1 : 0;
  const hiveTrack: HiveSample[] = [],
    hiveTips: { t: number; angle: number; from: number; to: number }[] = [];
  const events: BounceEvent[] = [],
    tracks: BallTrack[] = [],
    energy: EnergyFrame[] = [],
    sessions = new Map<
      string,
      {
        event: BounceEvent;
        beforeRelative: Vec3;
        lastRelative: Vec3;
        lastTime: number;
      }
    >();
  const iterations = Math.round(clamp(settings.solverIterations ?? 16, 4, 48));
  const isotropic = Math.max(...diagonal) - Math.min(...diagonal) < 1e-14;
  const tensorCache = new WeakMap<
    Body,
    { q: Body["q"]; inverse: Vec3[]; forward: Vec3[] }
  >();
  const tensorMultiply = (b: Body, v: Vec3, inverse: boolean): Vec3 => {
    let cache = tensorCache.get(b);
    if (!cache || cache.q !== b.q) {
      const basis: Vec3[] = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
      cache = {
        q: b.q,
        inverse: basis.map((v) => tensor(b.q ?? identity, diagonal, v, true)),
        forward: basis.map((v) => tensor(b.q ?? identity, diagonal, v)),
      };
      tensorCache.set(b, cache);
    }
    const mat = inverse ? cache.inverse : cache.forward;
    return [
      mat[0][0] * v[0] + mat[1][0] * v[1] + mat[2][0] * v[2],
      mat[0][1] * v[0] + mat[1][1] * v[1] + mat[2][1] * v[2],
      mat[0][2] * v[0] + mat[1][2] * v[1] + mat[2][2] * v[2],
    ];
  };
  const invI = (b: Body, v: Vec3) =>
    isotropic ? scale(v, 1 / diagonal[0]) : tensorMultiply(b, v, true);
  const angularMomentum = (b: Body) =>
    isotropic ? scale(b.spin, diagonal[0]) : tensorMultiply(b, b.spin, false);
  const kinetic = (b: Body) =>
    0.5 * m * norm(b.v) ** 2 + 0.5 * dot(b.spin, angularMomentum(b));
  const hingeK = () =>
    hive.enabled && !warmup ? 0.5 * hive.inertia * hive.omega ** 2 : 0;
  const relative = (q: Constraint) =>
    sub(
      add(q.a.v, cross(q.a.spin, q.armA)),
      q.b
        ? add(q.b.v, cross(q.b.spin, q.armB!))
        : q.hinge && !warmup
          ? hiveVelocity(hive, q.point)
          : [0, 0, 0],
    );
  const apply = (q: Constraint, j: Vec3, tangential = false) => {
    const before = warmup
      ? 0
      : kinetic(q.a) + (q.b ? kinetic(q.b) : 0) + (q.hinge ? hingeK() : 0);
    q.a.v = add(q.a.v, scale(j, 1 / m));
    q.a.spin = add(q.a.spin, invI(q.a, cross(q.armA, j)));
    if (q.b) {
      q.b.v = sub(q.b.v, scale(j, 1 / m));
      q.b.spin = sub(q.b.spin, invI(q.b, cross(q.armB!, j)));
    }
    if (q.hinge && !warmup)
      hive.omega -= hingeJacobian(hive, q.point, j) / hive.inertia;
    if (!warmup) {
      const work =
        kinetic(q.a) +
        (q.b ? kinetic(q.b) : 0) +
        (q.hinge ? hingeK() : 0) -
        before;
      contactWork += work;
      if (tangential) frictionWork += work;
    }
  };
  const effective = (q: Constraint, d: Vec3) => {
    const a = cross(q.armA, d);
    let inv = 1 / m + dot(a, invI(q.a, a));
    if (q.b) {
      const b = cross(q.armB!, d);
      inv += 1 / m + dot(b, invI(q.b, b));
    }
    if (q.hinge && !warmup)
      inv += hingeJacobian(hive, q.point, d) ** 2 / hive.inertia;
    return inv;
  };
  function energyFrame(): EnergyFrame {
    return {
      t: time,
      translation: bodies.reduce((s, b) => s + 0.5 * m * norm(b.v) ** 2, 0),
      rotation: bodies.reduce(
        (s, b) => s + 0.5 * dot(b.spin, angularMomentum(b)),
        0,
      ),
      gravity: bodies.reduce(
        (s, b) => s + m * c.environment.gravity * b.p[2],
        0,
      ),
      elastic: soft ? lastElastic : 0,
      hiveKinetic: hingeK(),
      hivePotential: hivePotential(hive),
    };
  }
  const total = (e: EnergyFrame) =>
    e.translation +
    e.rotation +
    e.gravity +
    e.elastic +
    (e.hiveKinetic ?? 0) +
    (e.hivePotential ?? 0);
  function acceleration(b: Body) {
    const f = sampleAerodynamics(
      { t: time, p: b.p, v: b.v, spin: b.spin, rotation: b.q },
      c,
      axes,
    );
    return {
      a: add(scale(add(f.drag, f.lift), 1 / m), [0, 0, -c.environment.gravity]),
      force: add(f.drag, f.lift),
    };
  }
  function constraints(): Constraint[] {
    const out: Constraint[] = [];
    const append = (
      a: Body,
      b: Body | undefined,
      n: Vec3,
      point: Vec3,
      penetration: number,
      surface: string,
      kind: SurfaceKind,
      key: string,
      armA: Vec3 = scale(n, -r),
      armB: Vec3 | undefined = b ? scale(n, r) : undefined,
      hinge = false,
    ) => {
      const initialA = sample(a, time),
        initialB = b ? sample(b, time) : undefined,
        initialSurfaceVelocity: Vec3 = b
          ? add(b.v, cross(b.spin, armB!))
          : hinge && !warmup
            ? hiveVelocity(hive, point)
            : [0, 0, 0],
        initialRelative = sub(
          add(a.v, cross(a.spin, armA)),
          initialSurfaceVelocity,
        ),
        vn = dot(initialRelative, n);
      const e = !previous.has(key)
        ? effectiveRestitution(settings, kind, -vn)
        : 0;
      out.push({
        key,
        a,
        b,
        armA,
        armB,
        hinge,
        n,
        point,
        penetration,
        surface,
        kind,
        initialA,
        initialB,
        initialRelative,
        initialSurfaceVelocity,
        pA: [...a.p],
        pB: b ? [...b.p] : undefined,
        normalImpulse: 0,
        tangentImpulse: [0, 0, 0],
        target: -e * Math.min(vn, 0),
        e,
        force: 0,
        regime: "sticking",
      });
    };
    const cellConfigs = cells.map((cell, i) => ({
      ...c,
      field: {
        ...c.field,
        target: cell.moving ? hiveTarget(c, hive, i === 1) : cell.target,
      },
    }));
    for (const a of bodies) {
      const nearbyCells = cellConfigs.map(
        (context, i) =>
          norm(sub(a.p, context.field.target.center)) <= cellBounds[i],
      );
      if (a.p[2] < bound)
        for (const [index, arm] of shapeSupport(
          [0, 0, -1],
          a.q ?? identity,
          r,
          settings,
          holes,
        ).entries()) {
          const penetration = -a.p[2] - arm[2];
          if (penetration <= 0) continue;
          append(
            a,
            undefined,
            [0, 0, 1],
            [a.p[0] + arm[0], a.p[1] + arm[1], 0],
            penetration,
            "Floor",
            "floor",
            `${a.id}:Floor:${index}`,
            arm,
          );
        }
      for (const solid of solids) {
        const context = solid.target ? cellConfigs[solid.cellId ?? 0] : c;
        if (solid.target && !nearbyCells[solid.cellId ?? 0]) continue;
        const hit = solidContact(a.p, solid, context, bound);
        if (hit)
          for (const [index, arm] of shapeSupport(
            scale(hit.normal, -1),
            a.q ?? identity,
            r,
            settings,
            holes,
          ).entries()) {
            const penetration = hit.penetration - bound - dot(arm, hit.normal);
            if (penetration <= 0) continue;
            const point = add(add(a.p, arm), scale(hit.normal, penetration));
            append(
              a,
              undefined,
              hit.normal,
              point,
              penetration,
              solid.target
                ? cells[solid.cellId ?? 0].prefix + solid.box.name
                : solid.box.name,
              solid.target ? "cell" : "wall",
              `${a.id}:${solid.cellId ?? "static"}:${solid.box.name}:${index}`,
              arm,
              undefined,
              solid.target && hive.enabled && cells[solid.cellId ?? 0].moving,
            );
          }
      }
      const initialPoint = hive.angle === 0 ? a.p : hiveInversePoint(hive, a.p);
      for (const solid of structures) {
        const hit = structureContact(
          solid.moving ? initialPoint : a.p,
          solid,
          bound,
        );
        if (!hit) continue;
        const normal = solid.moving ? hiveVector(hive, hit.normal) : hit.normal;
        for (const [index, arm] of shapeSupport(
          scale(normal, -1),
          a.q ?? identity,
          r,
          settings,
          holes,
        ).entries()) {
          const penetration = hit.penetration - bound - dot(arm, normal);
          if (penetration <= 0) continue;
          append(
            a,
            undefined,
            normal,
            add(add(a.p, arm), scale(normal, penetration)),
            penetration,
            solid.name,
            "wall",
            `${a.id}:structure:${solid.name}:${index}`,
            arm,
            undefined,
            solid.moving && hive.enabled,
          );
        }
      }
    }
    for (let i = 0; i < bodies.length; i++)
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i],
          b = bodies[j],
          delta = sub(a.p, b.p),
          distance = norm(delta);
        if (distance < 2 * bound) {
          const n =
            distance > 1e-12 ? scale(delta, 1 / distance) : ([1, 0, 0] as Vec3);
          const average = (v: Vec3[]) =>
            scale(
              v.reduce((s, x) => add(s, x), [0, 0, 0] as Vec3),
              1 / v.length,
            );
          const armA = average(
              shapeSupport(scale(n, -1), a.q ?? identity, r, settings, holes),
            ),
            armB = average(
              shapeSupport(n, b.q ?? identity, r, settings, holes),
            ),
            penetration = dot(sub(armB, armA), n) - distance;
          if (penetration <= 0) continue;
          const point = scale(add(add(a.p, armA), add(b.p, armB)), 0.5);
          append(
            a,
            b,
            n,
            point,
            penetration,
            "Ball",
            "ball",
            `pair:${a.id}:${b.id}`,
            sub(point, a.p),
            sub(point, b.p),
          );
        }
      }
    return out;
  }
  function advance(dt: number) {
    const priorSpin = bodies.map((b) => [...b.spin] as Vec3);
    const priorAngle = hive.angle;
    const kickHive = (duration: number) => {
      if (!hive.enabled || warmup) return;
      const before = hingeK();
      hive.omega *= Math.exp(
        (-Math.max(0, settings.hiveDamping ?? 0.08) * duration) / hive.inertia,
      );
      hingeLoss += Math.max(0, before - hingeK());
      hive.omega += (hiveTorque(hive) * duration) / hive.inertia;
    };
    const stopHive = (bounce = false) => {
      if (!hive.enabled || warmup) return;
      if (
        (hive.angle <= 1e-9 && hive.omega < 0) ||
        (hive.angle >= hive.travel - 1e-9 && hive.omega > 0)
      ) {
        const before = hingeK();
        hive.omega *= bounce
          ? -clamp(settings.hiveStopRestitution ?? 0.08, 0, 0.5)
          : 0;
        hingeLoss += Math.max(0, before - hingeK());
      }
    };
    kickHive(dt / 2);
    // Split elastic normal forces around the drift, rather than a single
    // endpoint kick that biases rebound energy at practical step sizes.
    const priorNormalImpulse = new Map<string, number>();
    if (soft)
      for (const q of constraints()) {
        const k =
            (settings.contactStiffness ?? 300000) / (q.b ? 2 * Math.SQRT2 : 1),
          h = hertzContact(
            q.penetration,
            -dot(relative(q), q.n),
            k,
            settings.materialDissipation ?? 0.3,
          ),
          impulse = (h.force * dt) / 2;
        priorNormalImpulse.set(q.key, impulse);
        const approachBefore = -dot(relative(q), q.n);
        apply(q, scale(q.n, impulse));
        if (!warmup)
          normalDissipationLoss += dampingWork(
            h.dampingForce * (dt / 2),
            approachBefore,
            -dot(relative(q), q.n),
          );
      }
    totalSteps++;
    minStep = Math.min(minStep, dt);
    for (const b of bodies) {
      const old = acceleration(b),
        v0 = [...b.v] as Vec3;
      b.v = add(b.v, scale(old.a, dt / 2));
      b.p = add(b.p, scale(b.v, dt));
      const next = acceleration(b);
      b.v = add(b.v, scale(next.a, dt / 2));
      if (!warmup)
        aeroWork +=
          dot(
            scale(add(old.force, next.force), 0.5),
            scale(add(v0, b.v), 0.5),
          ) * dt;
      const spinBefore = 0.5 * dot(b.spin, angularMomentum(b));
      b.spin = scale(b.spin, Math.exp(-c.aero.spinDecay * dt));
      if (!warmup)
        aeroWork += 0.5 * dot(b.spin, angularMomentum(b)) - spinBefore;
    }
    if (hive.enabled && !warmup) {
      const predicted = hive.angle + hive.omega * dt;
      const clipped = clamp(predicted, 0, hive.travel);
      hive.angle = clipped;
      kickHive(dt / 2);
    }
    const contacts = constraints();
    lastElastic = 0;
    for (const q of contacts) {
      maxOverlap = Math.max(maxOverlap, q.penetration);
      if (q.penetration > r * 0.8)
        throw new Error(
          "Temas sıkışması fazla. Sertliği artır veya hız/zaman adımını azalt; bu sonuç güvenilir değil.",
        );
      if (soft) {
        const k =
            (settings.contactStiffness ?? 300000) / (q.b ? 2 * Math.SQRT2 : 1),
          vn = dot(relative(q), q.n),
          h = hertzContact(
            q.penetration,
            -vn,
            k,
            settings.materialDissipation ?? 0.3,
          );
        const impulse = (h.force * dt) / 2;
        q.normalImpulse = impulse + (priorNormalImpulse.get(q.key) ?? 0);
        q.force = h.force;
        lastElastic += h.potential;
        apply(q, scale(q.n, impulse));
        if (!warmup)
          normalDissipationLoss += dampingWork(
            h.dampingForce * (dt / 2),
            -vn,
            -dot(relative(q), q.n),
          );
      }
    }
    for (let iteration = 0; iteration < iterations; iteration++) {
      for (const q of contacts) {
        if (!soft) {
          const inv = effective(q, q.n),
            vn = dot(relative(q), q.n);
          const old = q.normalImpulse;
          q.normalImpulse = Math.max(0, old + (q.target - vn) / inv);
          apply(q, scale(q.n, q.normalImpulse - old));
        }
        const props = material(settings, q.kind),
          velocity = relative(q),
          vt = sub(velocity, scale(q.n, dot(velocity, q.n))),
          inverseMass = effective(
            q,
            norm(vt) > 1e-12
              ? unit(vt)
              : unit(
                  cross(q.n, Math.abs(q.n[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0]),
                ),
          );
        const candidate = sub(q.tangentImpulse, scale(vt, 1 / inverseMass)),
          size = norm(candidate);
        let next = candidate;
        if (size > props.static * q.normalImpulse) {
          next = scale(unit(candidate), props.dynamic * q.normalImpulse);
          q.regime = "sliding";
        } else q.regime = "sticking";
        const delta = sub(next, q.tangentImpulse);
        q.tangentImpulse = next;
        apply(q, delta, true);
      }
      stopHive(
        iteration === 0 &&
          ((priorAngle > 0 && hive.angle === 0) ||
            (priorAngle < hive.travel && hive.angle === hive.travel)),
      );
    }
    loadTorque = 0;
    for (const q of contacts) {
      const props = material(settings, q.kind),
        w = sub(
          q.a.spin,
          q.b?.spin ??
            (q.hinge && !warmup ? scale(hive.axis, hive.omega) : [0, 0, 0]),
        ),
        torsion = scale(q.n, dot(w, q.n)),
        roll = sub(w, torsion),
        angularEffective = (d: Vec3) =>
          dot(d, invI(q.a, d)) +
          (q.b
            ? dot(d, invI(q.b, d))
            : q.hinge && !warmup
              ? dot(d, hive.axis) ** 2 / hive.inertia
              : 0);
      const torque = add(
        scale(
          unit(roll),
          -Math.min(
            norm(roll) / Math.max(1e-12, angularEffective(unit(roll))),
            props.rolling * r * q.normalImpulse,
          ),
        ),
        scale(
          unit(torsion),
          -Math.min(
            norm(torsion) / Math.max(1e-12, angularEffective(unit(torsion))),
            props.spinning * r * q.normalImpulse,
          ),
        ),
      );
      const before =
        kinetic(q.a) + (q.b ? kinetic(q.b) : 0) + (q.hinge ? hingeK() : 0);
      q.a.spin = add(q.a.spin, invI(q.a, torque));
      if (q.b) q.b.spin = sub(q.b.spin, invI(q.b, torque));
      else if (q.hinge && !warmup)
        hive.omega -= dot(torque, hive.axis) / hive.inertia;
      if (!warmup)
        resistanceLoss += Math.max(
          0,
          before -
            kinetic(q.a) -
            (q.b ? kinetic(q.b) : 0) -
            (q.hinge ? hingeK() : 0),
        );
      if (!soft) q.force = q.normalImpulse / dt;
      maxForce = Math.max(maxForce, q.force);
      if (q.hinge)
        loadTorque -=
          (hingeJacobian(hive, q.point, q.n) * q.normalImpulse) / dt;
      if (!warmup) {
        if (q.regime === "sliding") slipContacts++;
        else stickContacts++;
      }
    }
    if (!soft)
      for (let iteration = 0; iteration < 4; iteration++)
        for (const q of contacts) {
          const moved = sub(
              sub(q.a.p, q.pA),
              q.b ? sub(q.b.p, q.pB!) : [0, 0, 0],
            ),
            penetration = q.penetration - dot(moved, q.n),
            correction =
              (Math.max(0, penetration - 0.000005) * 0.7) / (q.b ? 2 : 1);
          const zBefore = q.a.p[2] + (q.b?.p[2] ?? 0);
          q.a.p = add(q.a.p, scale(q.n, correction));
          if (q.b) q.b.p = sub(q.b.p, scale(q.n, correction));
          if (!warmup)
            correctionWork +=
              m *
              c.environment.gravity *
              (q.a.p[2] + (q.b?.p[2] ?? 0) - zBefore);
        }
    for (const q of contacts)
      if (!warmup) {
        const incoming = q.initialRelative,
          approach = -dot(incoming, q.n);
        if (
          !sessions.has(q.key) &&
          !previous.has(q.key) &&
          approach > 0.15 &&
          events.length + sessions.size < 400
        ) {
          const e: BounceEvent = {
            ...q.initialA,
            t: time,
            normal: q.n,
            surface: q.surface,
            ballId: q.a.id,
            otherBallId: q.b?.id,
            contact: q.point,
            outgoing: [...q.a.v],
            outgoingSpin: [...q.a.spin],
            relativeIncoming: incoming,
            relativeOutgoing: relative(q),
            impulse: q.normalImpulse,
            restitution: q.e,
            peakForce: q.force,
            maxCompression: q.penetration,
            duration: dt,
            regime: q.regime,
            hiveAngle: q.hinge ? hive.angle : undefined,
            surfaceVelocity: q.hinge ? q.initialSurfaceVelocity : undefined,
          };
          events.push(e);
          sessions.set(q.key, {
            event: e,
            beforeRelative: incoming,
            lastRelative: relative(q),
            lastTime: time,
          });
        } else {
          const session = sessions.get(q.key);
          if (session) {
            const e = session.event;
            e.outgoing = [...q.a.v];
            e.outgoingSpin = [...q.a.spin];
            e.relativeOutgoing = relative(q);
            e.impulse = (e.impulse ?? 0) + q.normalImpulse;
            e.peakForce = Math.max(e.peakForce ?? 0, q.force);
            e.maxCompression = Math.max(e.maxCompression ?? 0, q.penetration);
            e.duration = time - e.t + dt;
            e.regime = q.regime;
            session.lastRelative = e.relativeOutgoing;
            session.lastTime = time;
          }
        }
      }
    const active = new Set(contacts.map((q) => q.key));
    for (const [key, session] of sessions)
      if (!active.has(key)) {
        session.event.endTime = session.lastTime;
        session.event.observedRestitution =
          Math.max(0, dot(session.lastRelative, session.event.normal)) /
          Math.max(1e-8, -dot(session.beforeRelative, session.event.normal));
        sessions.delete(key);
      }
    previous = active;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const momentum = angularMomentum(b);
      const initial = b.q ?? identity;
      let next = advanceRotation(
        initial,
        scale(add(priorSpin[i], b.spin), 0.5),
        dt,
      );
      if (!isotropic)
        for (let solve = 0; solve < 2; solve++)
          next = advanceRotation(
            initial,
            scale(
              add(priorSpin[i], tensor(next, diagonal, momentum, true)),
              0.5,
            ),
            dt,
          );
      b.q = next;
      b.spin = invI(b, momentum);
    }
    stopHive();
    if (!warmup && hive.enabled) {
      const state =
        hive.angle >= hive.travel - 0.001
          ? 1
          : hive.angle <= 0.001
            ? 0
            : lastStable;
      if (state !== lastStable) {
        hiveTips.push({
          t: time,
          angle: hive.angle,
          from: lastStable,
          to: state,
        });
        lastStable = state;
      }
    }
    return contacts;
  }
  const atRest = () =>
    bodies.every((b) => norm(b.v) < 0.015 && r * norm(b.spin) < 0.015) &&
    (warmup || !hive.enabled || Math.abs(hive.omega) < 0.01);
  const contactSpeed = () =>
    Math.max(
      0.1,
      ...bodies.map((b) => norm(b.v) + r * norm(b.spin)),
      hive.enabled && !warmup ? Math.abs(hive.omega) * 0.9 : 0,
    );
  let settlingTime = 0,
    stable = 0,
    settled = !residents.length;
  while (residents.length && settlingTime < 5) {
    const dt = Math.min(
      contactStep(settings, r, m, contactSpeed(), 0),
      c.simulation.maxStep,
      5 - settlingTime,
    );
    settlingTime += dt;
    advance(dt);
    if (atRest()) stable += dt;
    else stable = 0;
    if (stable > 0.25) {
      settled = true;
      break;
    }
    if (totalSteps % 2000 === 0)
      progress?.({ phase: "settling", time: settlingTime });
  }
  // Keep unsettled velocities and rotations; never force a moving stack to rest.
  if (settled)
    for (const b of residents) {
      b.v = [0, 0, 0];
      b.spin = [0, 0, 0];
    }
  bodies = [
    {
      id: 0,
      p: [...shot.origin],
      v: [...shot.velocity],
      spin: [...shot.spin],
      q: launchRotation,
    },
    ...residents,
  ];
  warmup = false;
  hive.omega = initialOmega;
  previous = new Set();
  sessions.clear();
  time = 0;
  totalSteps = 0;
  maxOverlap = 0;
  maxForce = 0;
  minStep = Infinity;
  aeroWork = 0;
  contactWork = 0;
  frictionWork = 0;
  normalDissipationLoss = 0;
  correctionWork = 0;
  resistanceLoss = 0;
  hingeLoss = 0;
  lastElastic = soft
    ? constraints().reduce(
        (sum, q) =>
          sum +
          hertzContact(
            q.penetration,
            0,
            (settings.contactStiffness ?? 300000) / (q.b ? 2 * Math.SQRT2 : 1),
            0,
          ).potential,
        0,
      )
    : 0;
  energy.push(energyFrame());
  const occupancy = () => {
    const active = { ...c, field: { ...c.field, target: hiveTarget(c, hive) } },
      opposite = {
        ...c,
        field: { ...c.field, target: hiveTarget(c, hive, true) },
      };
    return bodies.filter((b) => inCell(b.p, active) || inCell(b.p, opposite))
      .length;
  };
  const recordHive = () =>
    hiveTrack.push({
      t: time,
      angle: hive.angle,
      omega: hive.omega,
      loadTorque,
      retained: occupancy(),
    });
  recordHive();
  const initialEnergy = total(energy[0]);
  for (const b of bodies)
    tracks.push({ id: b.id, color: ballColors[b.id], samples: [sample(b, 0)] });
  let nextSample = 0.005,
    restTime = 0,
    stopped = false,
    lastOverlap = 0;
  const end = clamp(
    settings.previewTime ?? Math.max(10, c.simulation.maxTime),
    0.5,
    30,
  );
  while (time < end) {
    if (totalSteps >= 300000)
      throw new Error(
        "Hesaplama adım sınırına ulaştı; zaman adımı/sertlik seçimini değiştir.",
      );
    const dt = Math.min(
      contactStep(settings, r, m, contactSpeed(), lastOverlap),
      c.simulation.maxStep,
      end - time,
    );
    if (!Number.isFinite(dt) || dt <= 0)
      throw new Error("Geçersiz temas zaman adımı.");
    const eventStart = events.length;
    time += dt;
    const contacts = advance(dt);
    lastOverlap = Math.max(0, ...contacts.map((q) => q.penetration));
    const primary = events.slice(eventStart).find((e) => e.ballId === 0);
    if (!soft && primary && time - 1e-6 > tracks[0].samples.at(-1)!.t) {
      for (const b of bodies) {
        tracks[b.id].samples.push(
          b.id === 0 ? { ...primary, t: time - 1e-6 } : sample(b, time - 1e-6),
        );
        tracks[b.id].samples.push(sample(b, time));
      }
      nextSample = time + 0.005;
    }
    if (time >= nextSample || time >= end) {
      for (const b of bodies) tracks[b.id].samples.push(sample(b, time));
      energy.push(energyFrame());
      recordHive();
      nextSample = time + 0.005;
    }
    if (time > 0.2 && atRest()) restTime += dt;
    else restTime = 0;
    if (restTime > 0.3) {
      stopped = true;
      break;
    }
    if (totalSteps % 2000 === 0) progress?.({ phase: "flight", time });
    if (bodies.some((b) => ![...b.p, ...b.v, ...b.spin].every(Number.isFinite)))
      throw new Error(
        "Sonlu olmayan temas durumu; malzeme veya adım ayarını düzelt.",
      );
  }
  for (const session of sessions.values()) {
    session.event.endTime = time;
    session.event.observedRestitution =
      Math.max(0, dot(session.lastRelative, session.event.normal)) /
      Math.max(1e-8, -dot(session.beforeRelative, session.event.normal));
  }
  // Sleep only after translational and angular motion both meet the threshold.
  for (const b of bodies) {
    if (stopped) {
      const before = kinetic(b);
      b.v = [0, 0, 0];
      b.spin = [0, 0, 0];
      resistanceLoss += before;
    }
    if (tracks[b.id].samples.at(-1)!.t < time)
      tracks[b.id].samples.push(sample(b, time));
    else
      tracks[b.id].samples[tracks[b.id].samples.length - 1] = sample(b, time);
  }
  const finalEnergy = energyFrame();
  energy.push(finalEnergy);
  recordHive();
  const warnings: string[] = [];
  if (!settled)
    warnings.push(
      "İçerideki toplar 5 saniyede tam durmadı; atış başlarken hareketleri korunuyor.",
    );
  if (soft && maxOverlap > r * 0.15)
    warnings.push(
      "Sıkışma, yarıçapın %15'ini aşıyor. Noktasal esnek temas yaklaşımını ölçümle kontrol et.",
    );
  const balance =
    total(finalEnergy) -
    initialEnergy -
    aeroWork -
    (soft ? frictionWork - normalDissipationLoss : contactWork) -
    correctionWork +
    resistanceLoss +
    hingeLoss;
  if (Math.abs(balance) > Math.max(0.01, Math.abs(initialEnergy) * 0.02))
    warnings.push(
      "Enerji bilançosunda sayısal fark var. Daha küçük zaman adımıyla karşılaştır.",
    );
  const diagnostics: BounceDiagnostics = {
    settings: structuredClone(settings),
    inertia: (diagonal[0] + diagonal[1] + diagonal[2]) / 3,
    model: soft ? "hertz" : "rigid",
    steps: totalSteps,
    minStep,
    maxOverlap,
    maxForce,
    slipContacts,
    stickContacts,
    settlingTime,
    settled,
    aeroWork,
    contactWork,
    frictionWork,
    normalDissipationLoss,
    correctionWork,
    resistanceLoss,
    energyBalanceError: balance,
    hingeLoss,
    energy,
    warnings,
  };
  const primary = events.filter((e) => e.ballId === 0),
    main = tracks[0];
  const active = { ...c, field: { ...c.field, target: hiveTarget(c, hive) } },
    opposite = {
      ...c,
      field: { ...c.field, target: hiveTarget(c, hive, true) },
    };
  const retained = (b: Body) => inCell(b.p, active) || inCell(b.p, opposite);
  return {
    ...shot,
    spin: [...shot.spin],
    flight: {
      ...shot.flight,
      samples: main.samples,
      apex: main.samples.reduce(
        (highest, p) => (p.p[2] > highest.p[2] ? p : highest),
        main.samples[0],
      ),
      bounces: primary,
      worldEvents: events,
      ballTracks: tracks,
      diagnostics,
      bounceEnd: stopped ? "Stopped" : "Time limit",
      residentCount: residents.length,
      retainedResidents: residents.filter(retained).length,
      retainedShot: retained(bodies[0]),
      hiveTrack,
      hiveTips: hive.enabled ? hiveTips : undefined,
      hiveCalibrationTorque: hive.enabled
        ? hive.barrier * Math.sin(hive.travel / 2)
        : undefined,
      pollenInertia: settings.shapeModel === "pollen" ? diagonal : undefined,
      ballInertia: diagonal,
      aeroAxes: axes,
      impact: primary[0] ?? shot.flight.impact,
    },
  };
}
