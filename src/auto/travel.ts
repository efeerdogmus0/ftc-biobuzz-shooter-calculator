// Drive time between two poses with Probot Sim's route builder (trapezoid
// profile per segment, mecanum / tank wheel limits). Paths go straight unless
// that crosses the HIVE frame; then they bend around its corners (shortest of
// the corner routes). Each segment ends at rest, as Probot Sim's strafeTo does,
// so times are on the safe side of a blended spline.
import { RouteBuilder, type Route, type RouteLimits } from "./probot";
import {
  fieldHalf,
  flowerBlocks,
  hiveNoGo,
  type Pose,
  type Rect,
} from "./field";

export interface Leg {
  from: Pose;
  to: Pose;
  waypoints: { x: number; y: number }[];
  time: number;
  route: Route;
}

const grow = (r: Rect, m: number): Rect => ({
  x0: r.x0 - m,
  x1: r.x1 + m,
  y0: r.y0 - m,
  y1: r.y1 + m,
});

/** True when the open segment a→b passes through the rectangle's interior. */
export function crosses(
  a: { x: number; y: number },
  b: { x: number; y: number },
  r: Rect,
) {
  let lo = 0,
    hi = 1;
  const d = [b.x - a.x, b.y - a.y],
    p = [a.x, a.y],
    min = [r.x0, r.y0],
    max = [r.x1, r.y1];
  for (let i = 0; i < 2; i++) {
    if (Math.abs(d[i]) < 1e-12) {
      if (p[i] <= min[i] || p[i] >= max[i]) return false;
      continue;
    }
    let t0 = (min[i] - p[i]) / d[i],
      t1 = (max[i] - p[i]) / d[i];
    if (t0 > t1) [t0, t1] = [t1, t0];
    lo = Math.max(lo, t0);
    hi = Math.min(hi, t1);
    if (hi - lo <= 1e-9) return false;
  }
  return true;
}

const inside = (p: { x: number; y: number }, r: Rect) =>
  p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1;

/**
 * Shortest corner path from a to b around the HIVE frame and the FLOWERS,
 * each grown by the robot's sweep radius. An obstacle that already holds a or
 * b (the FLOWER being visited) is left out for that leg.
 */
export function aroundHive(
  a: { x: number; y: number },
  b: { x: number; y: number },
  radius: number,
) {
  const boxes = [hiveNoGo, ...flowerBlocks]
    .map((r) => grow(r, radius))
    .filter((r) => !inside(a, r) && !inside(b, r));
  const blocked = (p: { x: number; y: number }, q: { x: number; y: number }) =>
    boxes.some((r) => crosses(p, q, r));
  if (!blocked(a, b)) return [] as { x: number; y: number }[];
  const lim = fieldHalf - 0.05;
  const nodes = [
    a,
    b,
    ...boxes.flatMap((r) => {
      const c = grow(r, 0.01);
      return [
        { x: c.x0, y: c.y0 },
        { x: c.x1, y: c.y0 },
        { x: c.x1, y: c.y1 },
        { x: c.x0, y: c.y1 },
      ];
    }),
  ].filter(
    (p, i) =>
      i < 2 ||
      (Math.abs(p.x) < lim &&
        Math.abs(p.y) < lim &&
        !boxes.some((r) => inside(p, r))),
  );
  const n = nodes.length,
    dist = new Array(n).fill(Infinity),
    prev = new Array(n).fill(-1),
    done = new Array(n).fill(false);
  dist[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++)
      if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity || u === 1) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || blocked(nodes[u], nodes[v])) continue;
      const w =
        dist[u] + Math.hypot(nodes[v].x - nodes[u].x, nodes[v].y - nodes[u].y);
      if (w < dist[v]) {
        dist[v] = w;
        prev[v] = u;
      }
    }
  }
  // No way round (should not happen on the BIOBUZZ field): drive straight.
  if (prev[1] < 0) return [];
  const path: { x: number; y: number }[] = [];
  for (let v = prev[1]; v > 0; v = prev[v]) path.unshift(nodes[v]);
  return path;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Holonomic: straight strafes, heading turning linearly towards the final one.
 * Tank: turn to each segment, drive it, then turn to the final heading
 * (driving backwards when that is the shorter turn).
 *
 * `depart` / `approach` (m): back straight out of the start pose, and finish by
 * driving straight into the end pose, so the robot never turns with its nose
 * against a wall, the GARDEN or a FLOWER (a turning rectangle sweeps its
 * corners further out than its half length).
 */
export function drive(
  from: Pose,
  to: Pose,
  limits: RouteLimits,
  tank: boolean,
  radius: number,
  { depart = 0, approach = 0 }: { depart?: number; approach?: number } = {},
): Leg {
  const b = new RouteBuilder({ ...from }, limits);
  let at = { ...from };
  if (depart > 0) {
    const out = {
      x: from.x - depart * Math.cos(from.h),
      y: from.y - depart * Math.sin(from.h),
    };
    if (tank) b.setReversed(true).lineTo(out.x, out.y).setReversed(false);
    else b.strafeTo(out.x, out.y);
    at = { ...out, h: from.h };
  }
  const staging =
    approach > 0
      ? {
          x: to.x - approach * Math.cos(to.h),
          y: to.y - approach * Math.sin(to.h),
        }
      : to;
  const waypoints = aroundHive(at, staging, radius);
  for (const p of [...waypoints, staging]) {
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (d < 1e-4) continue;
    if (tank) {
      const bearing = Math.atan2(p.y - at.y, p.x - at.x);
      const reverse = Math.abs(wrap(bearing - at.h)) > Math.PI / 2;
      const h = reverse ? wrap(bearing + Math.PI) : bearing;
      b.turnTo(h).setReversed(reverse).lineTo(p.x, p.y).setReversed(false);
      at = { x: p.x, y: p.y, h };
    } else {
      b.strafeToLinearHeading(p.x, p.y, to.h);
      at = { x: p.x, y: p.y, h: to.h };
    }
  }
  if (Math.abs(wrap(to.h - at.h)) > 1e-3) b.turnTo(to.h);
  if (approach > 0) b.lineTo(to.x, to.y);
  const route = b.build();
  return {
    from,
    to,
    waypoints: depart > 0 ? [{ x: at.x, y: at.y }, ...waypoints] : waypoints,
    time: route.sure,
    route,
  };
}
