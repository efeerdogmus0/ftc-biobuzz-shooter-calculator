// The field at one moment of a plan, for the animated playback: where the
// robot is, what it holds, which POLLEN is gone from the field, balls in the
// air, CELL contents, the tip swing and the score so far. Pure: same plan and
// time give the same world.
import { poseAtTime, SCORE, type Plan } from "./planner";
import type { Pose } from "./field";

/** Drawn flight time of a shot, s (display only: the planner does not use it). */
export const FLIGHT = 0.55;

export interface Flight {
  from: { x: number; y: number };
  cell: "first" | "tipped";
  /** 0 at the shooter, 1 in the CELL. */
  u: number;
}
export interface World {
  t: number;
  pose: Pose;
  held: number;
  /** POLLEN already taken, per source id. */
  taken: Record<string, number>;
  flights: Flight[];
  /** POLLEN that has landed in each CELL. */
  cells: { first: number; tipped: number };
  /** Tip swing in progress: 0 → 1. */
  swing: { cell: "first" | "tipped"; u: number } | null;
  tipsDone: number;
  score: number;
  /** Index into plan.steps of the robot's current step, -1 before / after. */
  step: number;
  /** Points just scored (for a pop-up), with the age in seconds. */
  pop: { points: number; age: number } | null;
}

export function playbackLength(plan: Plan, autoLength: number) {
  return Math.min(Math.max(plan.end, 0.1), autoLength + 5);
}

export function worldAt(
  plan: Plan,
  start: Pose,
  t: number,
  autoLength: number,
): World {
  const picked = plan.steps.reduce(
    (n, s) => (s.kind === "pickup" ? n + s.balls : n),
    0,
  );
  // Balls that never went through a pickup step started inside the robot.
  let held = Math.max(0, plan.ballsShot - picked);
  const taken: Record<string, number> = {};
  const flights: Flight[] = [];
  const cells = { first: 0, tipped: 0 };
  let swing: World["swing"] = null,
    tipsDone = 0,
    step = -1,
    pop: World["pop"] = null,
    score = 0;
  plan.steps.forEach((s, i) => {
    if (s.kind === "tip") {
      if (t >= s.t0 && s.t0 <= autoLength + 1e-9) {
        tipsDone++;
        score += SCORE.tip;
        if (t < s.t1) swing = { cell: s.cell, u: (t - s.t0) / (s.t1 - s.t0) };
        if (t - s.t0 < 1.2) pop = { points: SCORE.tip, age: t - s.t0 };
      }
      return;
    }
    if (t >= s.t0 && t < s.t1) step = i;
    if (s.kind === "pickup" && t >= s.t0) {
      const n = Math.min(
        s.balls,
        Math.ceil((s.balls * (t - s.t0)) / Math.max(1e-6, s.t1 - s.t0)),
      );
      held += n;
      taken[s.sourceId] = (taken[s.sourceId] ?? 0) + n;
    }
    if (s.kind === "shoot")
      for (const at of s.shotTimes) {
        if (t < at) continue;
        held--;
        if (t < at + FLIGHT)
          flights.push({ from: s.pose, cell: s.cell, u: (t - at) / FLIGHT });
        else cells[s.cell]++;
      }
  });
  const done = Math.min(plan.end, autoLength);
  if (t >= done - 1e-9) {
    const final = plan.breakdown.leave + plan.breakdown.park;
    score += final;
    if (final && t - done < 1.2 && !pop) pop = { points: final, age: t - done };
  }
  return {
    t,
    pose: poseAtTime(plan.steps, start, t),
    held: Math.max(0, held),
    taken,
    flights,
    cells,
    swing,
    tipsDone,
    score,
    step,
    pop,
  };
}
