import type { Vec3 } from "./types";
export const add = (a: Vec3, b: Vec3): Vec3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
export const sub = (a: Vec3, b: Vec3): Vec3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
export const scale = (a: Vec3, s: number): Vec3 => [
  a[0] * s,
  a[1] * s,
  a[2] * s,
];
export const dot = (a: Vec3, b: Vec3) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vec3) => Math.hypot(...a);
export const unit = (a: Vec3): Vec3 =>
  norm(a) > 1e-15 ? scale(a, 1 / norm(a)) : [0, 0, 0];
export const clamp = (x: number, a: number, b: number) =>
  Math.max(a, Math.min(b, x));
export const lerp = (a: Vec3, b: Vec3, u: number) =>
  add(a, scale(sub(b, a), u));
export const rotateZ = (a: Vec3, y: number): Vec3 => [
  a[0] * Math.cos(y) - a[1] * Math.sin(y),
  a[0] * Math.sin(y) + a[1] * Math.cos(y),
  a[2],
];
