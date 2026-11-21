// Drives a plan in Probot Sim's physics: the robot follows each planned leg
// with Probot Sim's own route follower (takip.ts) on the BIOBUZZ field, holds
// position while it collects or shoots, and every leg's tracking is measured.
// "light" is Probot Sim's 2D planck world (fast); "rigid" its 3D Rapier world
// with the HIVE, FLOWERS and the balls on the field.
import {
  biobuzzField,
  followVelocity,
  LightPhysics,
  prepareRapier,
  RigidPhysics,
  sampleRoute,
  wheelPowers,
  type DriveModel,
  type PhysicsEngine,
  type ProbotRobot,
} from "./probot";
import type { Plan, Step } from "./planner";
import { rootPose, type AutoRobot } from "./robot";
import type { Pose } from "./field";

export type Engine = "light" | "rigid";
export interface LegCheck {
  step: number;
  t0: number;
  t1: number;
  /** Largest distance from the planned point while driving, m. */
  maxError: number;
  /** Distance from the planned end pose when the leg's time is up, m. */
  endError: number;
  endHeadingError: number;
  /** New contacts with walls / field structures during the leg. */
  collisions: number;
}
export interface Verification {
  engine: Engine;
  legs: LegCheck[];
  maxError: number;
  collisions: number;
  /** Poses sampled every 0.1 s for drawing the driven path. */
  track: Pose[];
  ok: boolean;
  computeMs: number;
}

const DT = 0.01;
/** Pass marks per leg (m, rad). A leg that misses its end pose by more than this fails. */
export const verifyLimits = {
  maxError: 0.35,
  endError: 0.15,
  endHeading: (20 * Math.PI) / 180,
};
export const legOk = (l: LegCheck, lim = verifyLimits) =>
  l.maxError <= lim.maxError &&
  l.endError <= lim.endError &&
  l.endHeadingError <= lim.endHeading;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Smallest RAMSETE gain (1/s): what holds the robot while it turns in place or stands. */
const K_MIN = 8;

/**
 * RAMSETE (b = 2, ζ = 0.7, gain at least 8 1/s) for drives that cannot move
 * sideways: steers the heading into the lateral error, which Probot Sim's
 * follower (made for holonomic drives) does not. Run at the turning point.
 */
export function ramsete(
  target: { poz: Pose; hiz: { vx: number; vy: number; w: number } },
  at: Pose,
  b = 2,
  zeta = 0.7,
  kMin = K_MIN,
) {
  const c = Math.cos(at.h),
    s = Math.sin(at.h);
  const dx = target.poz.x - at.x,
    dy = target.poz.y - at.y;
  const ex = c * dx + s * dy,
    ey = -s * dx + c * dy,
    eh = wrap(target.poz.h - at.h);
  const vd =
      target.hiz.vx * Math.cos(target.poz.h) +
      target.hiz.vy * Math.sin(target.poz.h),
    wd = target.hiz.w;
  const k = Math.max(kMin, 2 * zeta * Math.sqrt(wd * wd + b * vd * vd));
  const sinc = Math.abs(eh) < 1e-6 ? 1 : Math.sin(eh) / eh;
  return {
    vx: vd * Math.cos(eh) + k * ex,
    vy: 0,
    w: wd + k * eh + b * vd * sinc * ey,
  };
}

export async function verifyPlan(
  robot: ProbotRobot,
  auto: AutoRobot,
  plan: Plan,
  start: Pose,
  engine: Engine,
  limits = verifyLimits,
): Promise<Verification> {
  const began = performance.now();
  if (engine === "rigid") await prepareRapier();
  // Plans move the turning point; Probot Sim follows the root frame.
  const root = (p: Pose) => rootPose(auto, p);
  const f: PhysicsEngine & { model: DriveModel } =
    engine === "rigid"
      ? new RigidPhysics(robot, biobuzzField, root(start))
      : new LightPhysics(robot, biobuzzField, root(start));
  // Measured at the turning point, like the plan.
  const pivotOf = (p: Pose): Pose => {
    const c = Math.cos(p.h),
      s = Math.sin(p.h);
    return {
      x: p.x + c * auto.pivot.x - s * auto.pivot.y,
      y: p.y + s * auto.pivot.x + c * auto.pivot.y,
      h: p.h,
    };
  };
  const steps = plan.steps.filter((s) => s.kind !== "tip");
  const legs: LegCheck[] = [];
  const track: Pose[] = [];
  let hold: Pose = start,
    i = 0,
    nextSample = 0;
  // Held in an object: finish() clears it from a closure.
  const now: {
    leg: { leg: LegCheck; step: Extract<Step, { kind: "drive" }> } | null;
  } = { leg: null };
  const finish = () => {
    if (!now.leg) return;
    const d = pivotOf(f.durum().poz),
      goal = now.leg.step.leg.to;
    now.leg.leg.endError = Math.hypot(d.x - goal.x, d.y - goal.y);
    now.leg.leg.endHeadingError = Math.abs(wrap(d.h - goal.h));
    now.leg.leg.collisions = f.durum().carpismaSayisi - now.leg.leg.collisions;
    hold = goal;
    now.leg = null;
  };
  try {
    for (let t = 0; t <= plan.end + 0.5; t += DT) {
      // Advance to the step running at time t.
      while (i < steps.length && t >= steps[i].t1) {
        if (now.leg && steps[i] === now.leg.step) finish();
        else if ("pose" in steps[i]) hold = (steps[i] as { pose: Pose }).pose;
        i++;
      }
      const s = steps[i];
      if (s && s.kind === "drive" && t >= s.t0 && now.leg?.step !== s) {
        const leg: LegCheck = {
          step: plan.steps.indexOf(s),
          t0: s.t0,
          t1: s.t1,
          maxError: 0,
          endError: 0,
          endHeadingError: 0,
          collisions: f.durum().carpismaSayisi,
        };
        legs.push(leg);
        now.leg = { leg, step: s };
      }
      const d = f.durum(),
        at = pivotOf(d.poz);
      const planned = now.leg
        ? sampleRoute(now.leg.step.leg.route, t - now.leg.step.t0)
        : { t, poz: { ...hold }, hiz: { vx: 0, vy: 0, w: 0 } };
      if (now.leg)
        now.leg.leg.maxError = Math.max(
          now.leg.leg.maxError,
          Math.hypot(planned.poz.x - at.x, planned.poz.y - at.y),
        );
      if (t >= nextSample - 1e-9) {
        track.push(at);
        nextSample += 0.1;
      }
      // Root target: same heading, offset back; root velocity = v + w × r.
      const rp = root(planned.poz),
        rx = rp.x - planned.poz.x,
        ry = rp.y - planned.poz.y,
        w = planned.hiz.w;
      const target = {
        t: planned.t,
        poz: rp,
        hiz: { vx: planned.hiz.vx - w * ry, vy: planned.hiz.vy + w * rx, w },
      };
      let command;
      if (auto.drive !== "tank") command = followVelocity(target, d.poz);
      else {
        // The turning point is the only point a tank can hold still while it
        // turns: track there, then express the command at the root frame.
        const c = ramsete(planned, at);
        command = {
          vx: c.vx + c.w * auto.pivot.y,
          vy: -c.w * auto.pivot.x,
          w: c.w,
        };
      }
      const powers = wheelPowers(f.model, command, 0.03);
      for (const [name, p] of Object.entries(powers)) f.tekerGuc(name, p);
      f.adim(DT);
    }
    finish();
    const maxError = Math.max(0, ...legs.map((l) => l.maxError));
    return {
      engine,
      legs,
      maxError,
      collisions: f.durum().carpismaSayisi,
      track,
      ok: legs.every((l) => legOk(l, limits)),
      computeMs: performance.now() - began,
    };
  } finally {
    f.yokEt();
  }
}
