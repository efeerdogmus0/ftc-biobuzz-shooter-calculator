// Fastest BIOBUZZ auto for one robot.
//
// Search: every order of every subset of the enabled pickup sources (pre-load
// first: it lies at the start). Trips fill the robot up to its capacity, then shoot. For each
// burst the shooting spot is chosen among the scoring spots of this app's
// shot map, minimising drive in + drive out (Probot Sim route times). Bursts
// that make the HIVE tip are tried two ways: shoot everything into the tipping
// CELL (extra weight shortens the tip wait), or shoot just enough and keep the
// rest for the next CELL. Plans are ranked by score, then by when the last tip
// happens, then by the time the robot is done.
//
// Scoring and the tip model follow Probot Sim (oyun/mac.ts, saha/biobuzz.ts):
// LEAVE 3, AUTO PARK in the own LOADING ZONE 5, TIP 20; a CELL tips once its
// contents weigh more than 0.19 kg, after a wait that shrinks from 2.5 s to
// 0.3 s as one more POLLEN of weight is added, then swings for 0.75 s. The
// first upward CELL starts with 3 NECTAR. These are Probot Sim's assumptions
// (source cited there), not checked against the game manual here.
import type { AutoRobot } from "./robot";
import { footprintCenter, frontReach, limitsOf, sweepRadius } from "./robot";
import { drive, type Leg } from "./travel";
import { sampleRoute } from "./probot";
import { loadingZone, type Pose, type PickupSource, fieldHalf } from "./field";
import type { ShotMap, ShotSpot } from "./shotMap";

export interface TipModel {
  thresholdKg: number;
  pollenKg: number;
  nectarKg: number;
  /** NECTAR already in the first upward CELL at the start. */
  startNectar: number;
  waitLong: number;
  waitShort: number;
  extraKg: number;
  swing: number;
}
export const probotTipModel: TipModel = {
  thresholdKg: 0.19,
  pollenKg: 0.025,
  nectarKg: 0.041,
  startNectar: 3,
  waitLong: 2.5,
  waitShort: 0.3,
  extraKg: 0.025,
  swing: 0.75,
};
/** Extra straight run into a nose-in park, m. */
const PARK_RUN_IN = 0.3;
export const SCORE = { leave: 3, park: 5, tip: 20 };

export interface PlanSettings {
  autoLength: number;
  park: boolean;
  /** Time for the flywheel to reach speed from rest, s (from the shooter model when known). */
  spinUp: number;
  /** Pre-load lies in front of the robot (Probot Sim, G304.G) or starts inside it. */
  preloadInside: boolean;
  tip: TipModel;
}
export const defaultSettings: PlanSettings = {
  autoLength: 30,
  park: true,
  spinUp: 1,
  preloadInside: false,
  tip: probotTipModel,
};

export type Step =
  | {
      kind: "drive";
      t0: number;
      t1: number;
      leg: Leg;
      /** Where to: a pickup source label, the shooting spot or the park. */
      to: "pickup" | "shoot" | "park";
      source?: string;
    }
  | {
      kind: "pickup";
      t0: number;
      t1: number;
      pose: Pose;
      source: string;
      sourceId: string;
      balls: number;
    }
  | {
      kind: "shoot";
      t0: number;
      t1: number;
      pose: Pose;
      spot: ShotSpot;
      balls: number;
      cell: "first" | "tipped";
      shotTimes: number[];
    }
  | { kind: "wait"; t0: number; t1: number; pose: Pose; label: string }
  | { kind: "tip"; t0: number; t1: number; cell: "first" | "tipped" };

export interface Plan {
  order: string[];
  steps: Step[];
  tips: number[];
  score: number;
  breakdown: { leave: number; park: number; tip: number };
  /** When the robot finished its last action (≤ auto length if it fits). */
  end: number;
  ballsShot: number;
  /** Seconds spent per kind of step, up to `end`. */
  budget: { drive: number; pickup: number; shoot: number; wait: number };
  /** Messages as templates + values, so the UI can translate them. */
  notes: { text: string; values?: Record<string, string | number> }[];
}

export interface PlanInput {
  robot: AutoRobot;
  start: Pose;
  sources: PickupSource[];
  maps: { first: ShotMap; tipped: ShotMap | null };
  settings: PlanSettings;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((x, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [
      x,
      ...p,
    ]),
  );
}

function subsets<T>(items: T[]): T[][] {
  return items.reduce<T[][]>(
    (all, x) => [...all, ...all.map((s) => [...s, x])],
    [[]],
  );
}

/** Where the robot stands to collect from a source. */
export function pickupPose(
  s: PickupSource,
  robot: AutoRobot,
  start: Pose,
): Pose {
  if (s.kind === "preload") {
    const d = 0.05;
    return {
      x: start.x + d * Math.cos(start.h),
      y: start.y + d * Math.sin(start.h),
      h: start.h,
    };
  }
  // A little short of touching: tracking overshoot would push the nose in.
  const reach = frontReach(robot) + (s.kind === "flower" ? 0.1 : 0.05);
  const h = s.approach.facing;
  const lim = fieldHalf - Math.min(robot.halfX, robot.halfY);
  return {
    x: Math.max(-lim, Math.min(lim, s.approach.x - reach * Math.cos(h))),
    y: Math.max(-lim, Math.min(lim, s.approach.y - reach * Math.sin(h))),
    h,
  };
}

/**
 * Where the auto ends: footprint over the own LOADING ZONE, not touching the
 * wall. The robot stops a full sweep radius away from the wall, facing the way
 * it arrives, so it never turns with a corner against the wall (in physics a
 * robot that arrives a little late wedges there). A robot too short to reach
 * the zone from that distance parks nose-in instead (`noseIn`).
 */
export function parkPose(
  robot: AutoRobot,
  from?: Pose,
): Pose & { noseIn: boolean } {
  const z = loadingZone("blue"),
    y = (z.y0 + z.y1) / 2,
    gap = sweepRadius(robot) + 0.04,
    reach = Math.min(robot.halfX - Math.abs(robot.offsetX), robot.halfY),
    depth = fieldHalf - z.x0;
  if (!from || gap - reach > depth - 0.05)
    return { x: fieldHalf - frontReach(robot) - 0.03, y, h: 0, noseIn: true };
  const x = fieldHalf - gap;
  const d = Math.hypot(x - from.x, y - from.y);
  let h = from.h;
  if (robot.drive === "tank" && d > 0.02) {
    const bearing = Math.atan2(y - from.y, x - from.x),
      turn = Math.atan2(Math.sin(bearing - from.h), Math.cos(bearing - from.h));
    h = Math.abs(turn) > Math.PI / 2 ? bearing + Math.PI : bearing;
    h = Math.atan2(Math.sin(h), Math.cos(h));
  }
  return { x, y, h, noseIn: false };
}

/** Planned pose at time t (the robot holds still between drives). */
export function poseAtTime(steps: Step[], start: Pose, t: number): Pose {
  let pose = start;
  for (const s of steps) {
    if (s.kind === "tip" || t < s.t0) {
      if (s.kind !== "tip") break;
      continue;
    }
    if (s.kind === "drive") {
      const o = sampleRoute(s.leg.route, Math.min(t, s.t1) - s.t0).poz;
      pose = { x: o.x, y: o.y, h: o.h };
    } else pose = s.pose;
  }
  return pose;
}

/** Tip wait for a CELL holding `kg` (Probot Sim fizik/saglam.ts). */
function tipWait(kg: number, m: TipModel) {
  const share = Math.min(1, Math.max(0, (kg - m.thresholdKg) / m.extraKg));
  return m.waitLong + (m.waitShort - m.waitLong) * share;
}

interface State {
  t: number;
  pose: Pose;
  held: number;
  cell: "first" | "tipped" | "done";
  cellKg: number;
  /** Time the current CELL crossed the threshold, or null. */
  over: number | null;
  omega: number | null;
  steps: Step[];
  tips: number[];
  shot: number;
  /** The robot stands nose-in at a wall / GARDEN / FLOWER. */
  atWall: boolean;
}

class Planner {
  constructor(
    private input: PlanInput,
    private cache: Map<string, Leg>,
  ) {}
  private get robot() {
    return this.input.robot;
  }
  /** Straight-in / straight-out distance at walls: enough to turn freely. */
  get clearance() {
    const r = this.robot;
    return Math.max(0.1, sweepRadius(r) - frontReach(r) + 0.08);
  }
  /** `approach`: true = straight in over the clearance, a number adds to it (m). */
  leg(
    a: Pose,
    b: Pose,
    depart = false,
    approach: boolean | number = false,
  ): Leg {
    const k = [a.x, a.y, a.h, b.x, b.y, b.h, +depart, +approach]
      .map((v) => v.toFixed(3))
      .join();
    let l = this.cache.get(k);
    if (!l) {
      l = drive(
        a,
        b,
        limitsOf(this.robot),
        this.robot.drive === "tank",
        sweepRadius(this.robot),
        {
          depart: depart ? this.clearance : 0,
          approach:
            approach === false
              ? 0
              : this.clearance + (approach === true ? 0 : approach),
        },
      );
      this.cache.set(k, l);
    }
    return l;
  }
  go(
    s: State,
    to: Pose,
    kind: "pickup" | "shoot" | "park",
    source?: string,
    atWall: boolean | number = false,
  ) {
    const l = this.leg(s.pose, to, s.atWall, atWall);
    s.atWall = atWall !== false;
    if (l.time > 1e-3)
      s.steps.push({
        kind: "drive",
        t0: s.t,
        t1: s.t + l.time,
        leg: l,
        to: kind,
        ...(source ? { source } : {}),
      });
    s.t += l.time;
    s.pose = to;
  }
  /** Lets a pending tip finish if its time has come; returns true when it did. */
  settleTip(s: State, until: number) {
    if (s.over === null || s.cell === "done") return false;
    const m = this.input.settings.tip;
    const tipAt = s.over + tipWait(s.cellKg, m);
    if (tipAt > until) return false;
    s.steps.push({ kind: "tip", t0: tipAt, t1: tipAt + m.swing, cell: s.cell });
    s.tips.push(tipAt);
    if (s.cell === "first" && this.input.maps.tipped) {
      s.cell = "tipped";
      s.cellKg = 0;
      s.over = null;
    } else s.cell = "done";
    return true;
  }
  /** Ready time of the CELL to receive shots after a tip swing. */
  cellReady(s: State) {
    const last = s.steps.filter((x) => x.kind === "tip").at(-1);
    return last ? last.t1 : 0;
  }
  spotFor(s: State, next: Pose | null): { spot: ShotSpot; pose: Pose } | null {
    const map =
      s.cell === "tipped" ? this.input.maps.tipped : this.input.maps.first;
    if (!map || !map.spots.length || s.cell === "done") return null;
    const r = this.robot;
    const poseOf = (p: ShotSpot): Pose => ({
      x: p.x,
      y: p.y,
      h: r.turret ? (next ? next.h : s.pose.h) : p.heading,
    });
    const est = (p: ShotSpot) =>
      Math.hypot(p.x - s.pose.x, p.y - s.pose.y) +
      (next ? Math.hypot(next.x - p.x, next.y - p.y) : 0);
    const ranked = [...map.spots].sort((a, b) => est(a) - est(b)).slice(0, 6);
    let best: { spot: ShotSpot; pose: Pose; cost: number } | null = null;
    for (const spot of ranked) {
      const pose = poseOf(spot);
      const cost =
        this.leg(s.pose, pose, s.atWall).time +
        (next ? this.leg(pose, next).time : 0);
      if (!best || cost < best.cost) best = { spot, pose, cost };
    }
    return best;
  }
  shoot(s: State, count: number, next: Pose | null) {
    const set = this.input.settings,
      r = this.robot;
    const target = this.spotFor(s, next);
    if (!target) return false;
    this.go(s, target.pose, "shoot");
    // Flywheel: spun up from the start, re-speeded between spots.
    let ready = Math.max(set.spinUp, this.cellReady(s));
    if (s.omega !== null && Math.abs(target.spot.omega - s.omega) > 1) {
      const max = Math.max(target.spot.omega, s.omega);
      ready = Math.max(
        ready,
        s.t + (set.spinUp * Math.abs(target.spot.omega - s.omega)) / max,
      );
    }
    s.omega = target.spot.omega;
    if (ready > s.t) {
      s.steps.push({
        kind: "wait",
        t0: s.t,
        t1: ready,
        pose: target.pose,
        label: "Shooter hızlanıyor / CELL dönüyor",
      });
      s.t = ready;
    }
    const m = set.tip,
      t0 = s.t,
      times: number[] = [];
    const cell = s.cell as "first" | "tipped";
    for (let i = 0; i < count; i++) {
      const at = t0 + i * r.feedInterval;
      times.push(at);
      s.cellKg += m.pollenKg;
      if (s.over === null && s.cellKg > m.thresholdKg) s.over = at;
    }
    s.t = t0 + (count - 1) * r.feedInterval + 0.1;
    s.held -= count;
    s.shot += count;
    s.steps.push({
      kind: "shoot",
      t0,
      t1: s.t,
      pose: target.pose,
      spot: target.spot,
      balls: count,
      cell,
      shotTimes: times,
    });
    return true;
  }
}

function initial(input: PlanInput): State {
  return {
    t: 0,
    pose: input.start,
    held: 0,
    cell: "first",
    cellKg: input.settings.tip.startNectar * input.settings.tip.nectarKg,
    over: null,
    omega: null,
    steps: [],
    tips: [],
    shot: 0,
    atWall: false,
  };
}

/** POLLEN needed in the current CELL to pass the threshold. */
function toTip(s: State, m: TipModel) {
  return Math.max(1, Math.floor((m.thresholdKg - s.cellKg) / m.pollenKg) + 1);
}

/** One plan: the sources in this order, with this keep / dump pattern. */
export function runOrder(
  input: PlanInput,
  order: PickupSource[],
  split: boolean[],
  cache: Map<string, Leg>,
): Plan {
  const p = new Planner(input, cache),
    r = input.robot,
    set = input.settings,
    s = initial(input);
  const queue = order.map((src) => ({ src, left: src.balls }));
  let burst = 0;
  const pickPose = (src: PickupSource) => pickupPose(src, r, input.start);
  const flush = (next: Pose | null) => {
    while (s.held > 0 && s.cell !== "done") {
      // settleTip may finish the HIVE.
      if (p.settleTip(s, s.t) && (s.cell as State["cell"]) === "done") break;
      const need = s.over === null ? toTip(s, set.tip) : s.held;
      const keep = split[burst++ % split.length];
      const n = keep && need < s.held ? need : s.held;
      if (!p.shoot(s, n, next)) break;
      // Waiting here for the swing is accounted for by the next shot's ready time.
      p.settleTip(s, s.t + 10);
    }
  };
  collect: for (const q of queue) {
    while (q.left > 0) {
      // Nothing left to score into, or the robot is full and cannot unload.
      if ((s.cell as State["cell"]) === "done") break collect;
      if (r.capacity - s.held <= 0) flush(pickPose(q.src));
      const take = Math.min(q.left, r.capacity - s.held);
      if (take <= 0 || (s.cell as State["cell"]) === "done") break collect;
      if (q.src.kind === "preload" && set.preloadInside) {
        s.held += take;
        q.left -= take;
        continue;
      }
      const pose = pickPose(q.src);
      p.go(s, pose, "pickup", q.src.label, q.src.kind !== "preload");
      const per = q.src.kind === "flower" ? r.flowerPerBall : r.intakePerBall;
      s.steps.push({
        kind: "pickup",
        t0: s.t,
        t1: s.t + take * per,
        pose,
        source: q.src.label,
        sourceId: q.src.id,
        balls: take,
      });
      s.t += take * per;
      s.held += take;
      q.left -= take;
    }
  }
  flush(set.park ? parkPose(r, s.pose) : null);
  const park = set.park ? parkPose(r, s.pose) : null;
  if (park)
    p.go(
      s,
      { x: park.x, y: park.y, h: park.h },
      "park",
      undefined,
      // Nose-in: line up well before the wall (see parkPose).
      park.noseIn ? PARK_RUN_IN : false,
    );
  // A tip still pending at the end of the auto counts only if it happens in time.
  p.settleTip(s, set.autoLength);

  const inTime = (t: number) => t <= set.autoLength + 1e-9;
  const tips = s.tips.filter(inTime);
  const parked = !!park && inTime(s.t);
  // LEAVE: judged where the robot is when the auto ends (Probot Sim: not
  // touching the perimeter), even if it is still driving then.
  const at = poseAtTime(s.steps, input.start, set.autoLength),
    final = { ...at, ...footprintCenter(r, at) },
    ex =
      Math.abs(Math.cos(final.h)) * r.halfX +
      Math.abs(Math.sin(final.h)) * r.halfY,
    ey =
      Math.abs(Math.sin(final.h)) * r.halfX +
      Math.abs(Math.cos(final.h)) * r.halfY,
    onWall =
      Math.abs(final.x) + ex >= fieldHalf - 0.005 ||
      Math.abs(final.y) + ey >= fieldHalf - 0.005;
  const breakdown = {
    leave: !onWall ? SCORE.leave : 0,
    park: parked ? SCORE.park : 0,
    tip: tips.length * SCORE.tip,
  };
  const notes: Plan["notes"] = [];
  if (s.held > 0)
    notes.push({
      text:
        s.cell === "done"
          ? "{n} top elde kaldı: iki devirme de tamam (modelde üçüncü CELL yok)."
          : "{n} top atılamadı: bu CELL için atış noktası yok.",
      values: { n: s.held },
    });
  if (s.t > set.autoLength)
    notes.push({
      text: "Plan {limit} sn'yi {over} sn aşıyor; süre sonrası adımlar puan almaz.",
      values: {
        limit: set.autoLength,
        over: (s.t - set.autoLength).toFixed(1),
      },
    });
  const budget = { drive: 0, pickup: 0, shoot: 0, wait: 0 };
  for (const x of s.steps) if (x.kind !== "tip") budget[x.kind] += x.t1 - x.t0;
  return {
    budget,
    order: order.map((o) => o.label),
    steps: s.steps,
    tips,
    score: breakdown.leave + breakdown.park + breakdown.tip,
    breakdown,
    end: s.t,
    ballsShot: s.shot,
    notes,
  };
}

const better = (a: Plan, b: Plan) =>
  a.score !== b.score
    ? a.score > b.score
    : (a.tips.at(-1) ?? Infinity) !== (b.tips.at(-1) ?? Infinity)
      ? (a.tips.at(-1) ?? Infinity) < (b.tips.at(-1) ?? Infinity)
      : a.end < b.end;

/** Best plan over source orders and tip strategies, plus the runners-up. */
export function planAuto(input: PlanInput, keep = 5) {
  const pre = input.sources.filter((s) => s.kind === "preload"),
    rest = input.sources.filter((s) => s.kind !== "preload");
  // Every order of every subset: leaving a source out can be what makes the
  // park fit into the auto.
  const orders = subsets(rest)
    .flatMap(permutations)
    .map((o) => [...pre, ...o]);
  const splits = [[false], [true], [true, false], [false, true]];
  const plans: Plan[] = [],
    cache = new Map<string, Leg>();
  for (const order of orders)
    for (const split of splits)
      plans.push(runOrder(input, order, split, cache));
  plans.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
  const unique: Plan[] = [];
  for (const p of plans) {
    const key = p.steps.map((s) => s.kind + s.t0.toFixed(2)).join();
    if (
      !unique.some(
        (u) => u.steps.map((s) => s.kind + s.t0.toFixed(2)).join() === key,
      )
    )
      unique.push(p);
    if (unique.length >= keep) break;
  }
  return { best: unique[0], others: unique.slice(1), tried: plans.length };
}
