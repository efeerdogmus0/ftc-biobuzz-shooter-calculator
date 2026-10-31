import type { BounceSettings, Config, Sample, Shot, Vec3 } from "./types";
import {
  flight,
  contactActive,
  fieldBoxes,
  targetLocal,
  targetBasis,
  segmentBox,
  boxNormal,
} from "./flight";
import { add, sub, scale, dot, norm, cross, unit } from "./math";
import { cellSolids, sweepCellSolid } from "./cellGeometry";
import { ballInertia } from "./shooter";
import { collisionCells } from "../field/hiveGeometry";
import { hiveStructureSolids, sweepStructure } from "../field/hiveStructure";

// Exploratory material assumptions; these must be measured on the actual POLLEN.
export const defaultBounce: BounceSettings = {
  floor: 0.55,
  wall: 0.65,
  cell: 0.4,
  friction: 0.25,
  rollingResistance: 0.08,
};
/** Rigid sphere impulse: restitution along the surface normal, Coulomb friction
 * at the contact point, including rotational inertia. Static surfaces only. */
export function rebound(
  hit: Sample,
  normal: Vec3,
  restitution: number,
  friction: number,
  c: Config,
) {
  const m = c.projectile.mass,
    r = c.projectile.diameter / 2,
    inertia = ballInertia(c);
  const vn = dot(hit.v, normal);
  if (vn >= 0) return { v: hit.v, spin: hit.spin };
  const jn = -(1 + Math.max(0, Math.min(1, restitution))) * m * vn;
  const arm = scale(normal, -r);
  const contact = add(hit.v, cross(hit.spin, arm));
  const tangent = sub(contact, scale(normal, dot(contact, normal)));
  const jt = Math.min(
    Math.max(0, friction) * jn,
    norm(tangent) / (1 / m + (r * r) / inertia),
  );
  const tangentialImpulse = scale(unit(tangent), -jt);
  return {
    v: add(hit.v, scale(add(scale(normal, jn), tangentialImpulse), 1 / m)),
    spin: add(hit.spin, scale(cross(arm, tangentialImpulse), 1 / inertia)),
  };
}
function rollingCollision(a: Sample, b: Sample, c: Config) {
  const r = c.projectile.diameter / 2;
  let best: { u: number; normal: Vec3; name: string } | null = null;
  for (const box of fieldBoxes(c)) {
    const u = segmentBox(a.p, b.p, box, r);
    if (u !== null && (!best || u < best.u))
      best = {
        u,
        normal: boxNormal(add(a.p, scale(sub(b.p, a.p), u)), a.v, box, r),
        name: box.name,
      };
  }
  for (const solid of hiveStructureSolids(c.field)) {
    const hit = sweepStructure(a.p, b.p, solid, r);
    if (hit && (!best || hit.u < best.u)) best = { ...hit, name: solid.name };
  }
  for (const cell of collisionCells(c.field)) {
    const la = targetLocal(a.p, cell.target),
      lb = targetLocal(b.p, cell.target),
      basis = targetBasis(cell.target);
    for (const solid of cellSolids(cell.target)) {
      const hit = sweepCellSolid(la, lb, solid, cell.target, r);
      const u = hit?.u;
      if (u !== undefined && hit && (!best || u < best.u)) {
        const n = hit.normal;
        best = {
          u,
          normal: add(
            add(scale(basis.u, n[0]), scale(basis.v, n[1])),
            scale(basis.n, n[2]),
          ),
          name: cell.prefix + solid.box.name,
        };
      }
    }
  }
  return best;
}
/** Continue the original shot without changing the direct-entry scoring result
 * or solver behavior. Preview includes static rigid collisions, then simplified
 * floor rolling with constant rolling resistance; moving HIVE is out of scope. */
export function withBounces(shot: Shot, settings: BounceSettings): Shot {
  const out: Shot = {
    ...shot,
    flight: {
      ...shot.flight,
      samples: [...shot.flight.samples],
      bounces: [],
      bounceEnd: "Time limit",
    },
  };
  const f = out.flight,
    c = shot.config;
  if (!f.impact || f.collision?.includes("overlap")) return out;
  const endTime = Math.max(c.simulation.maxTime, 10),
    r = c.projectile.diameter / 2;
  let hit = f.impact,
    normal = f.impactNormal ?? ([0, 0, 1] as Vec3),
    surface = f.collision!;
  let offset = hit.t;
  let rolling = false;
  let supports: { surface: string; normal: Vec3; friction: number }[] = [];
  for (let count = 0; count < 40 && offset < endTime; count++) {
    const e =
      surface === "Floor"
        ? settings.floor
        : surface.startsWith("CELL")
          ? settings.cell
          : settings.wall;
    const response = rebound(hit, normal, e, settings.friction, c);
    f.bounces!.push({ ...hit, surface, normal, outgoing: response.v });
    if (surface === "Floor" && response.v[2] < 0.18) rolling = true;
    // Offset prevents a second collision with the same surface at t=0.
    let state: Sample = {
      t: offset + 1e-6,
      p: add(hit.p, scale(normal, 1e-5)),
      v: response.v,
      spin: response.spin,
    };
    if (rolling) {
      // Transition to ideal rolling dissipates slip and normal energy.
      const contact = add(state.v, cross(state.spin, [0, 0, -r]));
      const factor = 1 / (1 + (c.projectile.mass * r * r) / ballInertia(c));
      state.v = [
        state.v[0] - factor * contact[0],
        state.v[1] - factor * contact[1],
        0,
      ];
      state.p[2] = r;
      state.spin = scale(cross([0, 0, 1], state.v), 1 / r);
      f.samples.push(state);
      let obstacle = false;
      while (state.t < endTime) {
        const speed = norm(state.v);
        if (speed < 0.01) {
          f.samples.push({
            ...state,
            t: state.t + 1e-6,
            v: [0, 0, 0],
            spin: [0, 0, 0],
          });
          f.bounceEnd = "Stopped";
          return out;
        }
        const deceleration =
          Math.max(0, settings.rollingResistance) * c.environment.gravity;
        const dt = Math.min(
          0.02,
          endTime - state.t,
          deceleration > 0 ? speed / deceleration : 0.02,
        );
        const speed2 = Math.max(0, speed - deceleration * dt);
        const direction = unit(state.v);
        const next: Sample = {
          t: state.t + dt,
          p: add(state.p, scale(direction, ((speed + speed2) * dt) / 2)),
          v: scale(direction, speed2),
          spin: scale(cross([0, 0, 1], direction), speed2 / r),
        };
        const collision = rollingCollision(state, next, c);
        if (collision) {
          hit = {
            ...state,
            t: state.t + dt * collision.u,
            p: add(state.p, scale(sub(next.p, state.p), collision.u)),
          };
          normal = collision.normal;
          surface = collision.name;
          offset = hit.t;
          f.samples.push(hit);
          obstacle = true;
          rolling = Math.abs(normal[2]) < 1e-6;
          break;
        }
        f.samples.push(next);
        state = next;
      }
      if (!obstacle) return out;
    } else {
      f.samples.push(state);
      const q = {
        ...c,
        simulation: { ...c.simulation, maxTime: endTime - state.t },
      };
      const continuousContact =
        normal[2] > 0.1 && Math.abs(dot(response.v, normal)) < 0.18;
      supports = supports.filter((s) => contactActive(c, state.p, s.surface));
      if (continuousContact && !supports.some((s) => s.surface === surface))
        supports.push({ surface, normal, friction: settings.friction });
      for (const support of supports) {
        state.v = sub(
          state.v,
          scale(support.normal, dot(state.v, support.normal)),
        );
      }
      f.samples[f.samples.length - 1] = state;
      const segment = flight(state.p, state.v, state.spin, q, true, supports);
      const shift = (s: Sample): Sample => ({ ...s, t: s.t + state.t });
      f.samples.push(...segment.samples.slice(1).map(shift));
      if (!segment.impact) {
        if (norm(segment.samples.at(-1)!.v) < 0.02) f.bounceEnd = "Stopped";
        return out;
      }
      hit = shift(segment.impact);
      normal = segment.impactNormal ?? [0, 0, 1];
      surface = segment.collision!;
      offset = hit.t;
    }
  }
  f.bounceEnd = offset >= endTime ? "Time limit" : "Impact limit";
  return out;
}
