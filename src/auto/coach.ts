// "What would make this auto better?" Re-plans the same field with one thing
// about the robot changed at a time and reports what each change is worth.
// These are planner results for a hypothetical robot, not measurements.
import { planAuto, type Plan, type PlanInput } from "./planner";

export interface Advice {
  id: string;
  /** Value shown with the label, e.g. the new speed. */
  value: number;
  score: number;
  end: number;
  dScore: number;
  /** Seconds saved (positive = faster). */
  saved: number;
}

type Change = (i: PlanInput) => { input: PlanInput; value: number } | null;
const robot = (
  id: string,
  f: (r: PlanInput["robot"]) => Partial<PlanInput["robot"]>,
  value: (r: PlanInput["robot"]) => number,
): [string, Change] => [
  id,
  (i) => {
    const patch = f(i.robot),
      r = { ...i.robot, ...patch };
    return { input: { ...i, robot: r }, value: value(r) };
  },
];

export const changes: [string, Change][] = [
  robot(
    "speed",
    (r) => ({ maxSpeed: r.maxSpeed * 1.25, maxTurnRate: r.maxTurnRate * 1.25 }),
    (r) => r.maxSpeed,
  ),
  robot(
    "accel",
    (r) => ({ maxAccel: r.maxAccel * 1.5, maxTurnAccel: r.maxTurnAccel * 1.5 }),
    (r) => r.maxAccel,
  ),
  robot(
    "capacity",
    (r) => ({ capacity: r.capacity + 1 }),
    (r) => r.capacity,
  ),
  robot(
    "intake",
    (r) => ({
      intakePerBall: r.intakePerBall / 2,
      flowerPerBall: r.flowerPerBall / 2,
    }),
    (r) => r.flowerPerBall,
  ),
  robot(
    "feed",
    (r) => ({ feedInterval: r.feedInterval / 2 }),
    (r) => r.feedInterval,
  ),
  [
    "spinUp",
    (i) => ({
      input: {
        ...i,
        settings: { ...i.settings, spinUp: i.settings.spinUp / 2 },
      },
      value: i.settings.spinUp / 2,
    }),
  ],
  [
    "turret",
    (i) =>
      i.robot.turret
        ? null
        : { input: { ...i, robot: { ...i.robot, turret: true } }, value: 1 },
  ],
];

/** Changes that raise the score or save at least `minSaved` s, best first. */
export function coach(input: PlanInput, base: Plan, minSaved = 0.3): Advice[] {
  const out: Advice[] = [];
  for (const [id, change] of changes) {
    const c = change(input);
    if (!c) continue;
    const p = planAuto(c.input, 1).best;
    const a: Advice = {
      id,
      value: c.value,
      score: p.score,
      end: p.end,
      dScore: p.score - base.score,
      saved: base.end - p.end,
    };
    if (a.dScore > 0 || (a.dScore === 0 && a.saved >= minSaved)) out.push(a);
  }
  return out.sort((a, b) => b.dScore - a.dScore || b.saved - a.saved);
}
