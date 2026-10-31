import type { TargetConfig, Vec3, Box } from "./types";
import { add, sub, scale, dot, norm, clamp, lerp } from "./math";

export interface Contact {
  normal: Vec3;
  penetration: number;
  point: Vec3;
}
export interface CellSolid {
  box: Box;
  center?: Vec3;
  angle?: number;
  polygon?: boolean;
}

export function targetBasis(t: TargetConfig) {
  const u: Vec3 = [Math.cos(t.yaw), Math.sin(t.yaw), 0];
  const v: Vec3 = [
    -Math.sin(t.yaw) * Math.cos(t.tilt),
    Math.cos(t.yaw) * Math.cos(t.tilt),
    -Math.sin(t.tilt),
  ];
  const n: Vec3 = [
    -Math.sin(t.yaw) * Math.sin(t.tilt),
    Math.cos(t.yaw) * Math.sin(t.tilt),
    Math.cos(t.tilt),
  ];
  return { u, v, n };
}
export function targetLocal(p: Vec3, t: TargetConfig): Vec3 {
  const d = sub(p, t.center),
    { u, v, n } = targetBasis(t);
  return [dot(d, u), dot(d, v), dot(d, n)];
}
export function targetWorld(p: Vec3, t: TargetConfig): Vec3 {
  const { u, v, n } = targetBasis(t);
  return add(
    t.center,
    add(scale(u, p[0]), add(scale(v, p[1]), scale(n, p[2]))),
  );
}
/** The CELL opening is a pentagon: vertical sides rise to shoulders, then slope to the peak. */
export function targetOpeningTop(t: TargetConfig, localX: number) {
  const half = t.width / 2;
  if (Math.abs(localX) > half) return -Infinity;
  const shoulder = t.shoulderHeight - t.height / 2;
  const peak = t.height / 2;
  return shoulder + ((peak - shoulder) * (half - Math.abs(localX))) / half;
}
export function targetOpeningClearance(
  t: TargetConfig,
  local: readonly [number, number] | Vec3,
  radius: number,
) {
  const points = targetOpeningPoints(t);
  let clearance = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    // The points are counter-clockwise. Signed distance into each half-plane
    // gives the exact convex-polygon erosion distance for a spherical ball.
    clearance = Math.min(
      clearance,
      (dx * (local[1] - a[1]) - dy * (local[0] - a[0])) / Math.hypot(dx, dy),
    );
  }
  return clearance - radius;
}
export function targetOpeningPoints(t: TargetConfig): Vec3[] {
  const half = t.width / 2;
  const bottom = -t.height / 2;
  const shoulder = t.shoulderHeight - t.height / 2;
  const peak = t.height / 2;
  return [
    [-half, bottom, 0],
    [half, bottom, 0],
    [half, shoulder, 0],
    [0, peak, 0],
    [-half, shoulder, 0],
    [-half, bottom, 0],
  ];
}
/** Slab CCD against Minkowski-expanded boxes. Conservative at box corners. */
export function segmentBox(a: Vec3, b: Vec3, box: Box, r: number) {
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 3; i++) {
    const d = b[i] - a[i];
    if (Math.abs(d) < 1e-12) {
      if (a[i] < box.min[i] - r || a[i] > box.max[i] + r) return null;
    } else {
      let x = (box.min[i] - r - a[i]) / d,
        y = (box.max[i] + r - a[i]) / d;
      if (x > y) [x, y] = [y, x];
      lo = Math.max(lo, x);
      hi = Math.min(hi, y);
      if (lo > hi) return null;
    }
  }
  return lo;
}

/** One pentagonal CELL shell for flight, contact, rendering and studies. */
export function cellSurfaces(t: TargetConfig) {
  const points = targetOpeningPoints(t),
    k = t.thickness;
  const names = [
    "CELL front rim",
    "CELL right rim",
    "CELL roof right",
    "CELL roof left",
    "CELL left rim",
  ];
  return points.slice(0, -1).map((a, i) => {
    const b = points[i + 1],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy);
    return {
      name: names[i],
      center: [
        (a[0] + b[0]) / 2 + ((dy / length) * k) / 2,
        (a[1] + b[1]) / 2 - ((dx / length) * k) / 2,
        0,
      ] as Vec3,
      angle: Math.atan2(dy, dx),
      size: [length + k, k, t.depth] as Vec3,
    };
  });
}
export function cellSolids(t: TargetConfig): CellSolid[] {
  return [
    ...cellSurfaces(t).map((s) => ({
      center: s.center,
      angle: s.angle,
      box: {
        name: s.name,
        min: [-s.size[0] / 2, -s.size[1] / 2, -t.depth] as Vec3,
        max: [s.size[0] / 2, s.size[1] / 2, 0] as Vec3,
      },
    })),
    {
      polygon: true,
      box: {
        name: "CELL bottom",
        min: [-t.width / 2, -t.height / 2, -t.depth - t.thickness],
        max: [t.width / 2, t.height / 2, -t.depth],
      },
    },
  ];
}

interface Separation {
  distance: number;
  normal: Vec3;
  point: Vec3;
}
export function boxSeparation(p: Vec3, box: Box): Separation {
  const point = p.map((v, i) => clamp(v, box.min[i], box.max[i])) as Vec3;
  const delta = sub(p, point),
    d = norm(delta);
  if (d > 1e-12) return { distance: d, normal: scale(delta, 1 / d), point };
  let depth = Infinity,
    normal: Vec3 = [0, 0, 1],
    closest = [...p] as Vec3;
  for (let i = 0; i < 3; i++)
    for (const sign of [-1, 1]) {
      const face = sign < 0 ? box.min[i] : box.max[i];
      if (Math.abs(face - p[i]) < depth) {
        depth = Math.abs(face - p[i]);
        normal = [0, 0, 0];
        normal[i] = sign;
        closest = [...p];
        closest[i] = face;
      }
    }
  return { distance: -depth, normal, point: closest };
}
function polygonSeparation(p: Vec3, t: TargetConfig): Separation {
  const minZ = -t.depth - t.thickness,
    maxZ = -t.depth;
  const q: Vec3 = [p[0], p[1], clamp(p[2], minZ, maxZ)];
  const outline = targetOpeningPoints(t);
  const inside = targetOpeningClearance(t, p, 0) >= 0;
  let edgeDistance = Infinity,
    edgePoint: Vec3 = q,
    edgeNormal: Vec3 = [0, 1, 0];
  for (let i = 0; i < outline.length - 1; i++) {
    const a = outline[i],
      b = outline[i + 1],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy);
    const u = clamp(
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (length * length),
      0,
      1,
    );
    const point: Vec3 = [a[0] + u * dx, a[1] + u * dy, q[2]];
    const d = Math.hypot(p[0] - point[0], p[1] - point[1]);
    if (d < edgeDistance) {
      edgeDistance = d;
      edgePoint = point;
      edgeNormal = [dy / length, -dx / length, 0];
    }
  }
  const point = inside ? q : edgePoint,
    delta = sub(p, point),
    distance = norm(delta);
  if (distance > 1e-12)
    return { distance, normal: scale(delta, 1 / distance), point };
  const lower = p[2] - minZ,
    upper = maxZ - p[2];
  if (edgeDistance < Math.min(lower, upper))
    return { distance: -edgeDistance, normal: edgeNormal, point: edgePoint };
  const sign = lower < upper ? -1 : 1;
  return {
    distance: -Math.min(lower, upper),
    normal: [0, 0, sign],
    point: [p[0], p[1], sign < 0 ? minZ : maxZ],
  };
}
function rotate2(v: Vec3, a: number): Vec3 {
  return [
    v[0] * Math.cos(a) - v[1] * Math.sin(a),
    v[0] * Math.sin(a) + v[1] * Math.cos(a),
    v[2],
  ];
}
function solidSeparation(
  p: Vec3,
  solid: CellSolid,
  t: TargetConfig,
): Separation {
  const local = solid.center ? rotate2(sub(p, solid.center), -solid.angle!) : p;
  const hit = solid.polygon
    ? polygonSeparation(local, t)
    : boxSeparation(local, solid.box);
  return solid.center
    ? {
        ...hit,
        normal: rotate2(hit.normal, solid.angle!),
        point: add(rotate2(hit.point, solid.angle!), solid.center),
      }
    : hit;
}
export function sphereBoxContact(
  p: Vec3,
  box: Box,
  radius: number,
): Contact | null {
  const s = boxSeparation(p, box);
  return s.distance < radius
    ? { normal: s.normal, point: s.point, penetration: radius - s.distance }
    : null;
}
/** p and returned vectors are in the CELL coordinate frame. */
export function cellContact(
  p: Vec3,
  solid: CellSolid,
  t: TargetConfig,
  radius: number,
): Contact | null {
  const s = solidSeparation(p, solid, t);
  return s.distance < radius
    ? { normal: s.normal, point: s.point, penetration: radius - s.distance }
    : null;
}
/** Conservative advancement against the same convex prisms used by contacts.
 * The separating plane gives a safe lower bound on the first sphere contact. */
export function sweepCellSolid(
  a: Vec3,
  b: Vec3,
  solid: CellSolid,
  t: TargetConfig,
  radius: number,
) {
  const localA = solid.center
    ? rotate2(sub(a, solid.center), -solid.angle!)
    : a;
  const localB = solid.center
    ? rotate2(sub(b, solid.center), -solid.angle!)
    : b;
  if (segmentBox(localA, localB, solid.box, radius) === null) return null;
  const delta = sub(b, a);
  let u = 0;
  for (let i = 0; i < 64; i++) {
    const hit = solidSeparation(lerp(a, b, u), solid, t);
    const gap = hit.distance - radius;
    if (gap <= 1e-9) return { u, normal: hit.normal };
    const closing = -dot(delta, hit.normal);
    if (closing <= 1e-14) return null;
    u += gap / closing;
    if (u > 1 + 1e-12) return null;
    u = Math.min(1, u);
  }
  return null;
}
