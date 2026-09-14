import type {
  Config,
  Vec3,
  Sample,
  FlightResult,
  Entry,
  TargetConfig,
  Box,
  Shot,
} from "./types";
import { add, sub, scale, dot, norm, lerp, rotateZ } from "./math";
import { integrate } from "./integrator";
import { aerodynamicForces } from "./aerodynamics";
import { ballInertia, simulateShooter } from "./shooter";
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
/** Same solids drive rendering and collision. CELL is an open box, extending behind its opening. */
export function targetBoxes(t: TargetConfig): Box[] {
  const w = t.width / 2,
    h = t.height / 2,
    d = t.depth,
    k = t.thickness;
  return [
    { min: [-w - k, -h - k, -d], max: [-w, h + k, 0], name: "CELL left rim" },
    { min: [w, -h - k, -d], max: [w + k, h + k, 0], name: "CELL right rim" },
    { min: [-w, -h - k, -d], max: [w, -h, 0], name: "CELL front rim" },
    { min: [-w, h, -d], max: [w, h + k, 0], name: "CELL back rim" },
    {
      min: [-w - k, -h - k, -d - k],
      max: [w + k, h + k, -d],
      name: "CELL bottom",
    },
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
export function flight(
  origin: Vec3,
  velocity: Vec3,
  spin: Vec3,
  c: Config,
  collisions = true,
): FlightResult {
  const r = c.projectile.diameter / 2,
    sim = c.simulation;
  if (origin[2] < r) {
    const initial: Sample = { t: 0, p: origin, v: velocity, spin };
    return {
      samples: [initial],
      apex: initial,
      entry: null,
      impact: initial,
      status: "COLLIDED BEFORE ENTRY",
      collision: "Floor (launch overlap)",
      missDistance: norm(sub(origin, c.field.target.center)),
      warnings: ["Launch point overlaps the floor."],
    };
  }
  const states = integrate(
    (_t, y) => {
      const v = y.slice(3, 6) as Vec3,
        w = y.slice(6, 9) as Vec3,
        { drag, lift } = aerodynamicForces(v, w, c);
      const a = scale(add(drag, lift), 1 / c.projectile.mass);
      return [
        ...v,
        a[0],
        a[1],
        a[2] - c.environment.gravity,
        ...scale(w, -c.aero.spinDecay),
      ];
    },
    [...origin, ...velocity, ...spin],
    sim.maxTime,
    sim.absTolerance,
    sim.relTolerance,
    sim.maxStep,
    (_t, y) => y[2] <= r,
  );
  const all: Sample[] = states.map((s) => ({
    t: s.t,
    p: s.y.slice(0, 3) as Vec3,
    v: s.y.slice(3, 6) as Vec3,
    spin: s.y.slice(6, 9) as Vec3,
  }));
  const target = c.field.target,
    { n } = targetBasis(target),
    half = c.field.size / 2;
  const walls: Box[] = [
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
    ...c.field.obstacles,
  ];
  let entry: Entry | null = null,
    impact: Sample | null = null,
    collision: string | null = null,
    status: FlightResult["status"] = "MISS",
    apex = all[0],
    missDistance = Infinity;
  const samples = [all[0]];
  for (let i = 1; i < all.length; i++) {
    const a = all[i - 1],
      b = all[i];
    let terminal: Sample | null = null,
      name: string | null = null;
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
        const u = segmentBox(a.p, b.p, box, r);
        if (u !== null) {
          const hit = interpolate(a, b, u);
          if (!terminal || hit.t < terminal.t) {
            terminal = hit;
            name = box.name;
          }
        }
      }
      for (const box of targetBoxes(target)) {
        const u = segmentBox(la, lb, box, r);
        if (u !== null) {
          const hit = interpolate(a, b, u);
          if (!terminal || hit.t < terminal.t) {
            terminal = hit;
            name = box.name;
          }
        }
      }
      if (la[2] > 0 && lb[2] <= 0 && !entry) {
        const hit = root(a, b, (s) => targetLocal(s.p, target)[2]),
          local = targetLocal(hit.p, target);
        missDistance = Math.hypot(
          Math.max(0, Math.abs(local[0]) - target.width / 2 + r),
          Math.max(0, Math.abs(local[1]) - target.height / 2 + r),
        );
        const clearance =
          Math.min(
            target.width / 2 - Math.abs(local[0]),
            target.height / 2 - Math.abs(local[1]),
          ) - r;
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
            energy:
              0.5 * c.projectile.mass * speed ** 2 +
              0.5 * ballInertia(c) * norm(hit.spin) ** 2,
            local: [local[0], local[1]],
          };
          status = "HIT";
        }
      }
    }
    if (terminal) {
      impact = terminal;
      collision = name;
      samples.push(terminal);
      if (!entry && name !== "Floor")
        status = name?.includes("rim")
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
    missDistance,
    warnings: impact ? [] : ["Flight time limit reached before impact."],
  };
}
export function shooterPose(c: Config) {
  const r = c.robot;
  const yaw = r.heading + r.turretYaw;
  const center = add([r.x, r.y, 0], rotateZ(r.turretCenter, r.heading));
  return { origin: add(center, rotateZ(r.exitOffset, yaw)), yaw };
}
export function simulate(c: Config): Shot {
  const shooter = simulateShooter(c),
    { origin, yaw } = shooterPose(c),
    pitch = c.shooter.hoodAngle + c.shooter.hoodOffset;
  let velocity: Vec3 = [
    shooter.speed * Math.cos(pitch) * Math.cos(yaw),
    shooter.speed * Math.cos(pitch) * Math.sin(yaw),
    shooter.speed * Math.sin(pitch),
  ];
  if (c.robot.inheritVelocity) velocity = add(velocity, c.robot.velocity);
  const spin: Vec3 = [
    -Math.sin(yaw) * shooter.spin,
    Math.cos(yaw) * shooter.spin,
    0,
  ];
  return {
    config: c,
    shooter,
    origin,
    velocity,
    spin,
    flight: flight(origin, velocity, spin, c),
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
