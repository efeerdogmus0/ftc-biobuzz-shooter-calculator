/**
 * Launch-elevation study and clearance tables (docs/SHOT-STUDY.md).
 *
 *   npm run study            # all variants, sharded over CPU cores, writes the report
 *   npm run study -- --json out.json   # also dump raw position results
 *   npm run study -- --from out.json   # rebuild the report from a dump
 *
 * Internally re-invokes itself with `--shard i/n --variant name` per worker.
 */
import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { current } from "../src/presets";
import type { Config } from "../src/physics/types";
import {
  coverage,
  legalPositions,
  narrowestRange,
  recommended,
  relativeWindow,
  studyPosition,
  type PositionStudy,
  type StudyOptions,
} from "../src/physics/shotStudy";
import {
  clearanceEnvelope,
  hoodPathRadius,
  placeholderGeometry,
  range,
  safeHeights,
  shotsFromConfig,
  type ShooterGeometry,
} from "../src/physics/clearance";
import { deg, toDeg } from "../src/utils/units";

const ANGLES = range(deg(20), deg(87.5), 28);
const SPEED_CAP = 9;

interface Variant {
  name: string;
  label: string;
  spacing: number;
  extendedHive: boolean;
  exitHeight?: number;
  mass?: number;
}
const VARIANTS: Variant[] = [
  {
    name: "base",
    label: "Baseline (347 mm, 25 g)",
    spacing: 0.15,
    extendedHive: true,
  },
  {
    name: "flightOnly",
    label: "Baseline, flight collision set only",
    spacing: 0.15,
    extendedHive: false,
  },
  {
    name: "coarse",
    label: "347 mm, 25 g (0.3 m grid)",
    spacing: 0.3,
    extendedHive: true,
  },
  {
    name: "h250",
    label: "Exit height 250 mm",
    spacing: 0.3,
    extendedHive: true,
    exitHeight: 0.25,
  },
  {
    name: "h450",
    label: "Exit height 450 mm",
    spacing: 0.3,
    extendedHive: true,
    exitHeight: 0.45,
  },
  {
    name: "m20",
    label: "Ball mass 20 g",
    spacing: 0.3,
    extendedHive: true,
    mass: 0.02,
  },
  {
    name: "m30",
    label: "Ball mass 30 g",
    spacing: 0.3,
    extendedHive: true,
    mass: 0.03,
  },
];

function variantConfig(v: Variant): Config {
  const c = structuredClone(current);
  if (v.exitHeight !== undefined) c.robot.exitOffset[2] = v.exitHeight;
  if (v.mass !== undefined) c.projectile.mass = v.mass;
  return c;
}
const options = (v: Variant): StudyOptions => ({
  spacing: v.spacing,
  angles: ANGLES,
  speedMin: 2,
  speedMax: 15,
  speedTolerance: 0.005,
  extendedHive: v.extendedHive,
});

function runShard(v: Variant, shard: number, shards: number) {
  const c = variantConfig(v);
  const out = legalPositions(c, v.spacing)
    .filter((_, i) => i % shards === shard)
    .map(([x, y]) => studyPosition(c, x, y, options(v)));
  process.stdout.write(JSON.stringify(out));
}

function shardProcess(v: Variant, shard: number, shards: number) {
  return new Promise<PositionStudy[]>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        // vite-node drops the script path from argv; pass it explicitly.
        process.argv[1],
        fileURLToPath(import.meta.url),
        "--variant",
        v.name,
        "--shard",
        `${shard}/${shards}`,
      ],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    let text = "";
    child.stdout.on("data", (d) => (text += d));
    child.on("exit", (code) =>
      code === 0
        ? resolve(JSON.parse(text))
        : reject(new Error(`shard ${shard} failed`)),
    );
  });
}

// ----- report helpers --------------------------------------------------------
const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
const d = (a: number) => toDeg(a).toFixed(1);
const ms = (x: number) => x.toFixed(2);
const mm = (x: number) => (1000 * x).toFixed(0);
const table = (head: string[], rows: (string | number)[][]) =>
  [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
const zone = (r: PositionStudy[], z: string) => r.filter((p) => p.zone === z);
const feasible = (p: PositionStudy, cap = Infinity) =>
  p.windows.filter((w) => w.lo <= cap);
const span = (p: PositionStudy, cap = Infinity) => {
  const w = feasible(p, cap);
  return w.length ? [w[0].angle, w[w.length - 1].angle] : null;
};

function coverageRows(r: PositionStudy[], mins: number[], max: number) {
  return mins.map((min) => [
    `${d(min)}°–${d(max)}°`,
    pct(coverage(r, min, max)),
    pct(coverage(r, min, max, SPEED_CAP)),
    pct(coverage(zone(r, "front"), min, max, SPEED_CAP)),
    pct(coverage(zone(r, "back"), min, max, SPEED_CAP)),
  ]);
}

function farthest(r: PositionStudy[], cap = Infinity) {
  return r
    .filter((p) => feasible(p, cap).length)
    .reduce<PositionStudy | null>(
      (a, b) => (!a || b.distance > a.distance ? b : a),
      null,
    );
}

function windowTable(p: PositionStudy) {
  return table(
    ["Elevation", "Speed window m/s", "Width m/s", "Relative"],
    p.windows.map((w) => [
      `${d(w.angle)}°`,
      `${ms(w.lo)}–${ms(w.hi)}`,
      ms(w.hi - w.lo),
      pct(relativeWindow(w)),
    ]),
  );
}

function rangeSummary(r: PositionStudy[], cap: number) {
  return [0.5, 0.8, 0.9, 0.95, 1].map((f) => {
    const best = narrowestRange(r, ANGLES, f, cap);
    return [
      pct(f),
      best ? `${d(best.min)}°–${d(best.max)}°` : "not reachable",
      best ? pct(best.coverage) : "—",
    ];
  });
}

function bestSingle(r: PositionStudy[], cap: number) {
  return ANGLES.map((a) => ({ a, c: coverage(r, a, a, cap) })).reduce((x, y) =>
    y.c > x.c ? y : x,
  );
}

// ----- clearance tables (part C) ---------------------------------------------
const STATIONS = [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2, 0.3];
const TRACE = {
  clearForward: 1,
  clearUp: 1,
  pathStep: 0.002,
  stationMin: -0.2,
  stationMax: 0.5,
  stationStep: 0.01,
};
interface ClearanceCase {
  label: string[];
  g: ShooterGeometry;
  min: number;
  max: number;
}
function clearanceTable(
  head: string[],
  cases: ClearanceCase[],
  speeds: [number, number],
  which: "above" | "below",
) {
  const rows = cases.map(({ label, g, min, max }) => {
    const shots = shotsFromConfig(
      current,
      range(min, max, Math.round(toDeg(max - min) / 2.5) + 1),
      range(speeds[0], speeds[1], 4),
    );
    const e = clearanceEnvelope(g, shots, current, TRACE);
    return [
      ...label,
      ...STATIONS.map((s) => {
        const h = safeHeights(e, s);
        if (h.clearAll) return "clear";
        const v = which === "above" ? h.above! : h.below!;
        return which === "above" && v >= TRACE.clearUp ? "> 1000" : mm(v);
      }),
    ];
  });
  return table([...head, ...STATIONS.map((s) => `s=${mm(s)}`)], rows);
}
const geometry = (dia: number, height = 0.3): ShooterGeometry => ({
  ...placeholderGeometry,
  wheelDiameter: dia,
  wheelCenterHeight: height,
});
const wheelCases = (min: number, max: number) =>
  [0.072, 0.096, 0.104].flatMap((dia) =>
    [0.3, 0.45].map((h) => ({
      label: [`${mm(dia)} / ${mm(hoodPathRadius(geometry(dia)))}`, mm(h)],
      g: geometry(dia, h),
      min,
      max,
    })),
  );

// ----- report -----------------------------------------------------------------
function report(results: Record<string, PositionStudy[]>) {
  const base = results.base;
  const front = zone(base, "front"),
    back = zone(base, "back"),
    side = zone(base, "side");
  const reach = (r: PositionStudy[]) =>
    r.filter((p) => feasible(p, SPEED_CAP).length);
  const lows = reach(base);
  // Ranges are sized for the positions that have any HIT at all.
  const all = narrowestRange(lows, ANGLES, 1, SPEED_CAP);
  const allNoCap = narrowestRange(
    base.filter((p) => p.windows.length),
    ANGLES,
    1,
  );
  const frontAll = narrowestRange(reach(front), ANGLES, 1, SPEED_CAP);
  const recs = lows.map((p) => recommended(p, SPEED_CAP)!.angle);
  // Narrowest elevation interval holding `fraction` of the recommended angles.
  const recRange = (angles: number[], fraction: number) => {
    const a = [...angles].sort((x, y) => x - y),
      n = Math.ceil(fraction * a.length - 1e-9);
    let best = { min: a[0], max: a[a.length - 1] };
    for (let i = 0; i + n - 1 < a.length; i++)
      if (a[i + n - 1] - a[i] < best.max - best.min - 1e-9)
        best = { min: a[i], max: a[i + n - 1] };
    return best;
  };
  const rec90 = recRange(recs, 0.9);
  const frontRecs = reach(front).map((p) => recommended(p, SPEED_CAP)!.angle);
  const front90 = recRange(frontRecs, 0.9);
  const recShare = (min: number, max: number) =>
    recs.filter((a) => a >= min - 1e-9 && a <= max + 1e-9).length / recs.length;
  const longFront = farthest(front, SPEED_CAP)!;
  const longAll = farthest(base, SPEED_CAP)!;
  const recFront = recommended(longFront, SPEED_CAP)!;
  const recAll = recommended(longAll, SPEED_CAP)!;
  const top = deg(85);
  const unreached = base.filter((p) => !feasible(p, SPEED_CAP).length);
  const single = bestSingle(base, SPEED_CAP);

  const sens = ["coarse", "h250", "h450", "m20", "m30"].map((name) => {
    const r = results[name];
    const v = VARIANTS.find((x) => x.name === name)!;
    const full = narrowestRange(reach(r), ANGLES, 1, SPEED_CAP);
    const fr = narrowestRange(reach(zone(r, "front")), ANGLES, 1, SPEED_CAP);
    const far = farthest(zone(r, "front"), SPEED_CAP);
    const rec = far ? recommended(far, SPEED_CAP) : null;
    return [
      v.label,
      pct(coverage(r, deg(35), top, SPEED_CAP)),
      pct(coverage(r, deg(55), top, SPEED_CAP)),
      pct(reach(r).length / r.length),
      full ? `${d(full.min)}°–${d(full.max)}°` : "—",
      fr ? `${d(fr.min)}°–${d(fr.max)}°` : "—",
      rec ? `${d(rec.angle)}° @ ${ms(rec.lo)}–${ms(rec.hi)}` : "—",
    ];
  });

  // Clearance speeds: every speed window inside the full-field design range.
  const design = rec90;
  const speedsIn = (r: PositionStudy[], min: number, max: number) => {
    const w = r.flatMap((p) =>
      p.windows.filter(
        (x) =>
          x.angle >= min - 1e-9 && x.angle <= max + 1e-9 && x.lo <= SPEED_CAP,
      ),
    );
    return [
      Math.min(...w.map((x) => x.lo)),
      Math.min(SPEED_CAP, Math.max(...w.map((x) => x.hi))),
    ] as [number, number];
  };
  const designSpeeds = speedsIn(base, design.min, design.max);
  const frontRange = front90;
  const frontSpeeds = speedsIn(front, frontRange.min, frontRange.max);
  const g = placeholderGeometry,
    R = hoodPathRadius(g),
    rb = g.ballDiameter / 2;
  const vertical = (a: number, m: number) => (R + rb + m) / Math.cos(a);

  return `# Shot-angle study and shooter clearance

Generated by \`npm run study\` (\`scripts/shotStudy.ts\`) from the simulator's
physics modules. **Everything here is uncalibrated simulation**: no measured
launches, no CAD. Use it to size the hood range and keep-out zones, then
re-run with measured numbers.

## Headline answers

- **Reachability**: ${lows.length} of ${base.length} legal positions (${pct(lows.length / base.length)}) have a HIT at
  ≤ ${SPEED_CAP} m/s somewhere in ${d(ANGLES[0])}°–${d(ANGLES[ANGLES.length - 1])}°. The ${unreached.length} others sit right under the
  HIVE arms; their shots are blocked by the inactive lower CELLS and arms
  (with the flight collision set alone every position is reachable; see Sensitivity).
- **Hood range to shoot every reachable position at its recommended angle**:
  **${d(Math.min(...recs))}°–${d(Math.max(...recs))}°**; 90% of positions fall in **${d(rec90.min)}°–${d(rec90.max)}°**
  (front positions: ${d(front90.min)}°–${d(front90.max)}° for 90%). ${pct(recShare(deg(55), deg(85)))} recommend 55°–85°
  (distribution below; recommendation = most tolerant of exit-speed plus 1° hood-angle error).
- **Narrowest range that reaches every reachable position at all** (worse speed windows):
  ${all ? `**${d(all.min)}°–${d(all.max)}°**` : "none"} (≤ ${SPEED_CAP} m/s; without the cap
  ${allNoCap ? `${d(allNoCap.min)}°–${d(allNoCap.max)}°` : "—"}). The bottom of the range hardly matters; the top does.
  Front only: ${frontAll ? `${d(frontAll.min)}°–${d(frontAll.max)}°` : "—"}. Close-in positions need steep shots, so
  the top of the hood range must reach ~80°+ whatever the bottom is.
- **Behind the HIVE** the CELL opening faces away (its normal tilts 60° from vertical
  toward the front), so the ball must descend steeper than 60° below horizontal to
  enter: only lobs work, lowest feasible elevation behind
  ${d(Math.min(...reach(back).map((p) => span(p, SPEED_CAP)![0])))}°, with narrow speed windows (1–3%).
- **Longest front shot**: robot at (${ms(longFront.x)}, ${ms(longFront.y)}) m,
  ${ms(longFront.distance)} m from the launch point to the CELL center (horizontal).
  Feasible ${d(span(longFront, SPEED_CAP)![0])}°–${d(span(longFront, SPEED_CAP)![1])}° at ≤ ${SPEED_CAP} m/s.
  Recommended **${d(recFront.angle)}° at ${ms(recFront.lo)}–${ms(recFront.hi)} m/s**
  (most tolerant of exit-speed error plus a 1° hood error; near the minimum-speed
  angle the required speed hardly changes with elevation).
- **Longest shot anywhere**: (${ms(longAll.x)}, ${ms(longAll.y)}) m, ${longAll.zone},
  ${ms(longAll.distance)} m; recommended ${d(recAll.angle)}° at ${ms(recAll.lo)}–${ms(recAll.hi)} m/s.
- **"35°" readings**, hood range up to 85° (preset maximum), exit speed ≤ ${SPEED_CAP} m/s,
  share of all ${base.length} legal positions:
  - 35° from vertical = **55° minimum elevation**: ${pct(coverage(base, deg(55), top, SPEED_CAP))} of the field
    (front ${pct(coverage(front, deg(55), top, SPEED_CAP))}, side ${pct(coverage(side, deg(55), top, SPEED_CAP))}, back ${pct(coverage(back, deg(55), top, SPEED_CAP))}).
  - **35° minimum elevation**: ${pct(coverage(base, deg(35), top, SPEED_CAP))} of the field
    (front ${pct(coverage(front, deg(35), top, SPEED_CAP))}, side ${pct(coverage(side, deg(35), top, SPEED_CAP))}, back ${pct(coverage(back, deg(35), top, SPEED_CAP))}).
  - Identical: no position needs less than 55°. What decides coverage is the top of
    the range (see "Upper limit varied"): ${pct(coverage(base, deg(55), deg(70), SPEED_CAP))} at 70°, ${pct(coverage(base, deg(55), deg(75), SPEED_CAP))} at 75°,
    ${pct(coverage(base, deg(55), deg(80), SPEED_CAP))} at 80°.
- **Best fixed (non-adjustable) hood**: ${d(single.a)}° covers ${pct(single.c)} of the field
  (speed alone sets range; steep, so speeds are higher).
- **Cable chain / structure rule of thumb** (placeholder geometry, R_h = ${mm(R)} mm,
  ball r = ${mm(rb)} mm; details in Part C):
  - Anything **more than r + margin = ${mm(rb)} mm + margin to the side of the shooter's
    vertical plane is never hit** (the ball does not leave that plane; spin is
    about the horizontal axis, wind/robot motion excluded).
  - Anything **more than R_h + r + margin = ${mm(R + rb)} mm + margin behind the wheel axis**
    is never touched by the hood arc or the flight (feed path not modeled).
  - On the **vertical line through the wheel axis**, a structure above the wheel must
    be higher than ≈ (R_h + r + margin) / cos α_max above the axis
    (the free-flight tangent line, gravity neglected):
    ${[65, 70, 75, 80].map((a) => `${a}° → ${mm(vertical(deg(a), 0.02))} mm`).join(", ")} (20 mm margin).
    Steep lobs run up the line, so a chain directly above the wheel is impractical
    if the hood reaches > ~70°; route it beside the shooter plane or behind the wheel.

## Method

- Field: BIOBUZZ ARENA V1 geometry in \`src/field/fieldConfig.ts\` (CELL opening center
  derived from TU01 §9.6, HIVE bottom 30.6 in). Target: blue upward CELL.
- Positions: ${base.length} robot-center points on a ${VARIANTS[0].spacing} m grid. A position is legal if the robot's
  circumscribed circle (${mm(Math.hypot(current.robot.width, current.robot.length) / 2)} mm radius, so any chassis heading) stays inside the walls
  and off the HIVE footprint. Zones: front = opening side of the HIVE footprint
  (${front.length}), side (${side.length}), back (${back.length}).
- The turret aims at the CELL center (exit offset 120 mm forward, ${mm(current.robot.exitOffset[2])} mm high).
- For every elevation in ${d(ANGLES[0])}°–${d(ANGLES[ANGLES.length - 1])}° (2.5° steps) the exit speed is scanned 2–15 m/s
  (0.25 m/s), centered crossings are bisected, and the contiguous HIT window is
  grown to ±5 mm/s. HIT = whole ball inward through the pentagonal opening before
  any solid. Speed is prescribed directly; spin uses the preset's spin/speed ratio
  (≈ 0 for the matched-speed powered hood).
- Extended HIVE solids: besides the flight collision set (footprint, crossbar, active
  CELL rims, walls) the study rejects paths through the rendered inactive CELLS,
  side A-frames and arms before entry (\`hiveExtraSolids\`). This is approximate,
  visual-model geometry; the official CAD is the authority.
- Recommended angle = largest robustness margin: half the speed window minus the
  shift of the required speed caused by a 1° hood-angle error (slope from adjacent
  elevations), relative to speed (\`robustMargin\`).

## Assumptions (all uncalibrated)

- POLLEN 2.8 in, **25 g unverified** (manual gives no mass; area scaling suggests ~22 g),
  thin-shell inertia, Cd ${current.aero.cd}, Sawicki lift capped at ${current.aero.liftMax}, sea-level air, no wind.
- Exit point 347 mm high (preset default), fixed for every elevation (in a real hood the
  release point moves by ~R_h with elevation; see sensitivity).
- No calibration: exit speed is an input, so the RPM needed for a speed is not claimed.
- Speed cap ${SPEED_CAP} m/s is the preset solver limit, not a measured shooter capability.
- No bounce, retention or HIVE motion. A finite search: narrow windows can be missed.

## Coverage by hood range

Fraction of legal positions with at least one HIT elevation inside the range.

${table(
  [
    "Range",
    "Any speed",
    `≤ ${SPEED_CAP} m/s`,
    `Front ≤ ${SPEED_CAP}`,
    `Back ≤ ${SPEED_CAP}`,
  ],
  coverageRows(base, [20, 30, 35, 40, 45, 50, 55, 60, 65, 70].map(deg), top),
)}

Upper limit varied (lower limit 35° / 55°, ≤ ${SPEED_CAP} m/s):

${table(
  ["Max elevation", "35°–max", "55°–max"],
  [65, 70, 75, 77.5, 80, 82.5, 85, 87.5].map((m) => [
    `${m}°`,
    pct(coverage(base, deg(35), deg(m), SPEED_CAP)),
    pct(coverage(base, deg(55), deg(m), SPEED_CAP)),
  ]),
)}

Narrowest elevation range reaching a share of the **reachable** positions (≤ ${SPEED_CAP} m/s):

${table(["Target", "Range", "Achieved"], rangeSummary(lows, SPEED_CAP))}

Reachable front positions only:

${table(["Target", "Range", "Achieved"], rangeSummary(reach(front), SPEED_CAP))}

Recommended-angle distribution (reachable positions):

${table(
  ["Recommended", "Positions", "Share"],
  ANGLES.filter((a) => recs.some((r) => Math.abs(r - a) < 1e-9)).map((a) => {
    const n = recs.filter((r) => Math.abs(r - a) < 1e-9).length;
    return [`${d(a)}°`, n, pct(n / recs.length)];
  }),
)}

## Feasible elevation by position

Feasible elevation span (≤ ${SPEED_CAP} m/s) and the recommended angle, sampled every
other grid point (x right, y toward the far wall; the CELL opens toward −y).

${table(
  ["x m", "y m", "Zone", "Dist m", "Feasible", "Recommended", "Window m/s"],
  base
    .filter((_, i) => i % 3 === 0)
    .map((p) => {
      const s = span(p, SPEED_CAP),
        r = recommended(p, SPEED_CAP);
      return [
        ms(p.x),
        ms(p.y),
        p.zone,
        ms(p.distance),
        s ? `${d(s[0])}°–${d(s[1])}°` : "none",
        r ? `${d(r.angle)}°` : "—",
        r ? `${ms(r.lo)}–${ms(r.hi)}` : "—",
      ];
    }),
)}

Positions with no HIT at ≤ ${SPEED_CAP} m/s: ${unreached.length ? unreached.map((p) => `(${ms(p.x)}, ${ms(p.y)})`).join(", ") : "none"}.
These are under the HIVE arms (see Reachability).

## Longest shots: speed window per elevation

Longest front shot, (${ms(longFront.x)}, ${ms(longFront.y)}), ${ms(longFront.distance)} m:

${windowTable(longFront)}

Longest shot anywhere, (${ms(longAll.x)}, ${ms(longAll.y)}), ${ms(longAll.distance)} m (${longAll.zone}):

${windowTable(longAll)}

## Sensitivity

Coarser 0.3 m grid; compare against the first (baseline) row, not the 0.15 m tables.

${table(
  [
    "Variant",
    "35°–85° coverage",
    "55°–85° coverage",
    "Reachable",
    "Range for all reachable",
    "Range for reachable front",
    "Longest front: rec.",
  ],
  sens,
)}

Extended HIVE solids effect (0.15 m grid): with ${pct(coverage(base, deg(20), deg(87.5)))} vs flight collision set only
${pct(coverage(results.flightOnly, deg(20), deg(87.5)))} covered (any speed, 20°–87.5°).

## Part C: clearance envelope (placeholder geometry)

\`src/physics/clearance.ts\`, and **Analysis → Clearance envelope** in the app for
CAD numbers. The ball center rides the hood circle of radius R_h = R_wheel + r_ball −
compression (8 mm, preset value) over the back of the wheel, released tangentially at
polar angle 90° + elevation (from wheel axis: s = −R_h sin α, z = R_h cos α). Hood
contact wrap 110° (preset span; placeholder). Free flight is traced with the drag/lift
model until 1 m ahead or 1 m above the axis. Heights are **ball-surface heights
relative to the wheel axis, margin 0** — add your own margin (≥ 20 mm suggested:
ball deformation, hood tolerance, turret vibration). "s" is the horizontal station
from the wheel axis along the shot (negative = behind). "clear" means the ball never
reaches that vertical line.

Lateral: the swept tube half-width is r_ball = ${mm(rb)} mm (lateral deviation
computed as 0 for these shots; spin is about the horizontal axis). Any structure
farther than ${mm(rb)} mm + margin from the shooter's vertical plane is never hit.

### Wheel size, hood range ${d(design.min)}°–${d(design.max)}° (recommended angle of 90% of positions), ${ms(designSpeeds[0])}–${ms(designSpeeds[1])} m/s

Clear **above** this height (mm above wheel axis):

${clearanceTable(["Wheel / R_h mm", "Axis height mm"], wheelCases(design.min, design.max), designSpeeds, "above")}

Clear **below** this height (mm, relative to wheel axis; negative = below the axis;
the wheel, hood and feed occupy much of this region):

${clearanceTable(["Wheel / R_h mm", "Axis height mm"], wheelCases(design.min, design.max), designSpeeds, "below")}

Wheel-axis height (300 vs 450 mm) changes these relative numbers only through floor
truncation; identical rows confirm it does not matter near the shooter.

### Top of the hood range decides the overhead keep-out (96 mm wheel)

Clear **above** (mm above wheel axis), bottom of range 45°, same speeds:

${clearanceTable(
  ["Hood range"],
  [60, 65, 70, 75, 80, 85].map((m) => ({
    label: [`45°–${m}°`],
    g: geometry(0.096),
    min: deg(45),
    max: deg(m),
  })),
  designSpeeds,
  "above",
)}

### Front range ${d(frontRange.min)}°–${d(frontRange.max)}° (recommended angle of 90% of front positions), ${ms(frontSpeeds[0])}–${ms(frontSpeeds[1])} m/s

${clearanceTable(
  ["Wheel / R_h mm", "Axis height mm"],
  wheelCases(frontRange.min, frontRange.max).filter((_, i) => i % 2 === 0),
  frontSpeeds,
  "above",
)}

Values "> 1000" are beyond the traced 1 m.
`;
}

// ----- entry -----------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const arg = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const shard = arg("--shard");
  if (shard) {
    const [i, n] = shard.split("/").map(Number);
    runShard(
      VARIANTS.find((v) => v.name === arg("--variant"))!,
      i,
      n,
    );
    return;
  }
  const from = arg("--from");
  const results: Record<string, PositionStudy[]> = from
    ? JSON.parse(readFileSync(from, "utf8"))
    : {};
  const workers = Math.max(1, availableParallelism() - 2);
  for (const v of from ? [] : VARIANTS) {
    const t0 = Date.now();
    const parts = await Promise.all(
      Array.from({ length: workers }, (_, i) => shardProcess(v, i, workers)),
    );
    const order = new Map(
      legalPositions(variantConfig(v), v.spacing).map(([x, y], i) => [
        `${x},${y}`,
        i,
      ]),
    );
    results[v.name] = parts
      .flat()
      .sort(
        (a, b) => order.get(`${a.x},${a.y}`)! - order.get(`${b.x},${b.y}`)!,
      );
    console.error(
      `${v.name}: ${results[v.name].length} positions, ${((Date.now() - t0) / 1000).toFixed(0)} s`,
    );
  }
  const json = arg("--json");
  if (json) writeFileSync(json, JSON.stringify(results));
  const file = fileURLToPath(new URL("../docs/SHOT-STUDY.md", import.meta.url));
  // Keep `npm run format:check` green for the generated file.
  writeFileSync(file, await format(report(results), { parser: "markdown" }));
  console.error(`wrote ${file}`);
}
main();
