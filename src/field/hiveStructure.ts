import type { Box, FieldConfig, Vec3 } from "../physics/types";
import {
  targetWorld,
  boxSeparation,
  segmentBox,
  type Contact,
} from "../physics/cellGeometry";
import {
  add,
  sub,
  scale,
  dot,
  norm,
  unit,
  cross,
  clamp,
  lerp,
} from "../physics/math";
import { rotate, axisRotation, identity } from "../physics/rigidMath";
import { hiveCells, hiveCellTarget } from "./hiveGeometry";

export interface HiveBeam {
  name: string;
  a: Vec3;
  b: Vec3;
  width: number;
  depth: number;
  moving: boolean;
}
/** Dimensions shared by the renderer, studies and both collision engines. */
export function hiveStructure(field: FieldConfig) {
  const beams: HiveBeam[] = [],
    feet: { name: string; center: Vec3; size: Vec3 }[] = [],
    hubs: {
      name: string;
      center: Vec3;
      moving: boolean;
      radius: number;
      length: number;
    }[] = [];
  if (field.hiveStructure === false) return { beams, feet, hubs };
  const h = field.hive,
    x = h.frameWidth / 2,
    y = h.frameDepth / 2,
    z = h.pivotHeight;
  for (const side of [-x, x]) {
    for (const foot of [-y, y]) {
      const name = `HIVE ${side < 0 ? "west" : "east"} ${foot < 0 ? "south" : "north"}`;
      beams.push({
        name: name + " leg",
        a: [side, foot, 0.025],
        b: [side, 0, z],
        width: 0.0254,
        depth: 0.0254,
        moving: false,
      });
      feet.push({
        name: name + " foot",
        center: [side, foot, 0.015],
        size: [0.075, 0.1, 0.03],
      });
    }
    beams.push({
      name: `HIVE ${side < 0 ? "west" : "east"} base rail`,
      a: [side, -y, 0.025],
      b: [side, y, 0.025],
      width: 0.035,
      depth: 0.035,
      moving: false,
    });
  }
  beams.push({
    name: "HIVE pivot crossbar",
    a: [-x, 0, z],
    b: [x, 0, z],
    width: 0.032,
    depth: 0.032,
    moving: false,
  });
  for (const cell of hiveCells(field)) {
    const t = hiveCellTarget(cell, field),
      center: Vec3 = [cell.center[0], 0, z],
      moving = cell.alliance === "BLUE";
    beams.push({
      name: `HIVE ${cell.id} support arm`,
      a: center,
      b: targetWorld([0, -t.height / 2 - 0.02, -t.depth / 2], t),
      width: 0.03,
      depth: 0.035,
      moving,
    });
    hubs.push({
      name: `HIVE ${cell.id} pivot hub`,
      center,
      moving,
      radius: 0.045,
      length: 0.05,
    });
  }
  // Both CELLS of an alliance share the same pivot hub.
  return { beams, feet, hubs: hubs.filter((_, i) => i % 2 === 0) };
}
export interface StructureSolid {
  name: string;
  center: Vec3;
  basis: [Vec3, Vec3, Vec3];
  half: Vec3;
  moving: boolean;
  kind: "box" | "cylinder";
  bound: number;
}
function beamSolid(
  beam: HiveBeam,
  kind: StructureSolid["kind"] = "box",
): StructureSolid {
  const d = sub(beam.b, beam.a),
    length = norm(d),
    v = unit(d),
    axis = cross([0, 1, 0], v);
  const q =
    norm(axis) > 1e-12
      ? axisRotation(unit(axis), Math.acos(clamp(v[1], -1, 1)))
      : v[1] < 0
        ? axisRotation([1, 0, 0], Math.PI)
        : identity;
  const half: Vec3 = [beam.width / 2, length / 2, beam.depth / 2];
  return {
    name: beam.name,
    center: scale(add(beam.a, beam.b), 0.5),
    basis: [rotate(q, [1, 0, 0]), v, rotate(q, [0, 0, 1])],
    half,
    moving: beam.moving,
    kind,
    bound: norm(half),
  };
}
export function hiveStructureSolids(field: FieldConfig): StructureSolid[] {
  const structure = hiveStructure(field);
  return [
    ...structure.beams.map((b) => beamSolid(b)),
    ...structure.feet.map((f) => ({
      name: f.name,
      center: f.center,
      basis: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ] as [Vec3, Vec3, Vec3],
      half: scale(f.size, 0.5),
      moving: false,
      kind: "box" as const,
      bound: norm(f.size) / 2,
    })),
    ...structure.hubs.map((h) =>
      beamSolid(
        {
          name: h.name,
          a: add(h.center, [-h.length / 2, 0, 0]),
          b: add(h.center, [h.length / 2, 0, 0]),
          width: 2 * h.radius,
          depth: 2 * h.radius,
          moving: h.moving,
        },
        "cylinder",
      ),
    ),
  ];
}
const toLocal = (p: Vec3, s: StructureSolid): Vec3 =>
  s.basis.map((b) => dot(sub(p, s.center), b)) as Vec3;
const vectorWorld = (v: Vec3, s: StructureSolid): Vec3 =>
  add(
    add(scale(s.basis[0], v[0]), scale(s.basis[1], v[1])),
    scale(s.basis[2], v[2]),
  );
const bounds = (s: StructureSolid): Box => ({
  name: s.name,
  min: scale(s.half, -1),
  max: s.half,
});
function separation(p: Vec3, s: StructureSolid) {
  if (s.kind === "box") return boxSeparation(p, bounds(s));
  const radius = s.half[0],
    rho = Math.hypot(p[0], p[2]),
    radial: Vec3 = rho > 1e-12 ? [p[0] / rho, 0, p[2] / rho] : [1, 0, 0];
  const point: Vec3 = [
    radial[0] * Math.min(rho, radius),
    clamp(p[1], -s.half[1], s.half[1]),
    radial[2] * Math.min(rho, radius),
  ];
  const delta = sub(p, point),
    distance = norm(delta);
  if (distance > 1e-12)
    return { distance, normal: scale(delta, 1 / distance), point };
  if (radius - rho < s.half[1] - Math.abs(p[1]))
    return {
      distance: rho - radius,
      normal: radial,
      point: [radial[0] * radius, p[1], radial[2] * radius] as Vec3,
    };
  const sign = p[1] < 0 ? -1 : 1;
  return {
    distance: Math.abs(p[1]) - s.half[1],
    normal: [0, sign, 0] as Vec3,
    point: [p[0], sign * s.half[1], p[2]] as Vec3,
  };
}
export function structureContact(
  p: Vec3,
  s: StructureSolid,
  radius: number,
): Contact | null {
  if (norm(sub(p, s.center)) > s.bound + radius) return null;
  const hit = separation(toLocal(p, s), s);
  return hit.distance < radius
    ? {
        normal: vectorWorld(hit.normal, s),
        point: add(s.center, vectorWorld(hit.point, s)),
        penetration: radius - hit.distance,
      }
    : null;
}
export function sweepStructure(
  a: Vec3,
  b: Vec3,
  s: StructureSolid,
  radius: number,
) {
  const la = toLocal(a, s),
    lb = toLocal(b, s);
  if (segmentBox(la, lb, bounds(s), radius) === null) return null;
  const delta = sub(lb, la);
  let u = 0;
  for (let i = 0; i < 64; i++) {
    const hit = separation(lerp(la, lb, u), s),
      gap = hit.distance - radius;
    if (gap <= 1e-9) return { u, normal: vectorWorld(hit.normal, s) };
    const closing = -dot(delta, hit.normal);
    if (closing <= 1e-14) return null;
    u += gap / closing;
    if (u > 1 + 1e-12) return null;
    u = Math.min(1, u);
  }
  return null;
}
