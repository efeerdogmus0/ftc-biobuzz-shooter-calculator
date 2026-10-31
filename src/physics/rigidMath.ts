import type { Vec3 } from "./types";
import { add, cross, scale } from "./math";
export type Rotation = [number, number, number, number];
export const identity: Rotation = [0, 0, 0, 1];
export function rotate(q: Rotation, v: Vec3): Vec3 {
  const u: Vec3 = [q[0], q[1], q[2]],
    t = scale(cross(u, v), 2);
  return add(v, add(scale(t, q[3]), cross(u, t)));
}
export const unrotate = (q: Rotation, v: Vec3) =>
  rotate([-q[0], -q[1], -q[2], q[3]], v);
export function axisRotation(axis: Vec3, angle: number): Rotation {
  return [...scale(axis, Math.sin(angle / 2)), Math.cos(angle / 2)] as Rotation;
}
export function multiply(a: Rotation, b: Rotation): Rotation {
  const av: Vec3 = [a[0], a[1], a[2]],
    bv: Vec3 = [b[0], b[1], b[2]];
  return [
    ...add(add(scale(av, b[3]), scale(bv, a[3])), cross(av, bv)),
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ] as Rotation;
}
export function eulerRotation(v: Vec3): Rotation {
  return multiply(
    axisRotation([0, 0, 1], v[2]),
    multiply(axisRotation([0, 1, 0], v[1]), axisRotation([1, 0, 0], v[0])),
  );
}
export function tensor(
  q: Rotation,
  diagonal: Vec3,
  v: Vec3,
  inverse = false,
): Vec3 {
  const [x, y, z, w] = q,
    xx = 1 - 2 * (y * y + z * z),
    xy = 2 * (x * y - z * w),
    xz = 2 * (x * z + y * w),
    yx = 2 * (x * y + z * w),
    yy = 1 - 2 * (x * x + z * z),
    yz = 2 * (y * z - x * w),
    zx = 2 * (x * z - y * w),
    zy = 2 * (y * z + x * w),
    zz = 1 - 2 * (x * x + y * y);
  const a =
      (xx * v[0] + yx * v[1] + zx * v[2]) *
      (inverse ? 1 / diagonal[0] : diagonal[0]),
    b =
      (xy * v[0] + yy * v[1] + zy * v[2]) *
      (inverse ? 1 / diagonal[1] : diagonal[1]),
    c =
      (xz * v[0] + yz * v[1] + zz * v[2]) *
      (inverse ? 1 / diagonal[2] : diagonal[2]);
  return [
    xx * a + xy * b + xz * c,
    yx * a + yy * b + yz * c,
    zx * a + zy * b + zz * c,
  ];
}
