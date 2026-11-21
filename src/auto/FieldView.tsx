// Top view of the field for the planner. The fixed layer (tiles, zones, shot
// spots, planned path) is memoised; the moving layer draws one `World`: the
// robot and what it holds, POLLEN left on the field, balls in the air, the
// CELLs, the tip and the score pop-up.
import { memo } from "react";
import type { TargetConfig } from "../physics/types";
import {
  fieldHalf,
  hiveNoGo,
  loadingZone,
  type Alliance,
  type PickupSource,
  type Pose,
} from "./field";
import type { Plan } from "./planner";
import type { AutoRobot } from "./robot";
import type { World } from "./playback";
import type { ShotMaps } from "./useShotMaps";
import { tippedTarget } from "./shotMap";

const deg = 180 / Math.PI;
const H = fieldHalf;
const tile = 24 * 0.0254;
const BALL = 0.036;

const Fixed = memo(function Fixed({
  maps,
  layer,
  plan,
}: {
  maps: ShotMaps | null;
  layer: "first" | "tipped" | "none";
  plan: Plan | null;
}) {
  const lz = loadingZone("blue");
  const spots = layer === "none" || !maps ? [] : maps[layer].spots;
  const r = maps ? Math.min(0.04, maps.first.spacing * 0.16) : 0.03;
  return (
    <>
      <rect
        x={lz.x0}
        y={lz.y0}
        width={lz.x1 - lz.x0}
        height={lz.y1 - lz.y0}
        className="zone own"
      />
      <rect
        x={-lz.x1}
        y={-lz.y1}
        width={lz.x1 - lz.x0}
        height={lz.y1 - lz.y0}
        className="zone other"
      />
      {spots.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={r} className={`spot ${layer}`} />
      ))}
      <rect
        x={hiveNoGo.x0}
        y={hiveNoGo.y0}
        width={hiveNoGo.x1 - hiveNoGo.x0}
        height={hiveNoGo.y1 - hiveNoGo.y0}
        rx={0.03}
        className="hive"
      />
      {plan?.steps.map((s, i) =>
        s.kind === "drive"
          ? s.leg.route.izler.map((line, j) => (
              <polyline
                key={`${i}-${j}`}
                points={line.map(([x, y]) => `${x},${y}`).join(" ")}
                className={`path to-${s.to}`}
              />
            ))
          : null,
      )}
    </>
  );
});

export default function FieldView({
  alliance,
  plan,
  world,
  track,
  start,
  robot,
  maps,
  layer,
  sources,
  target,
  stale,
}: {
  alliance: Alliance;
  plan: Plan | null;
  world: World | null;
  track: Pose[] | null;
  start: Pose;
  robot: AutoRobot | null;
  maps: ShotMaps | null;
  layer: "first" | "tipped" | "none";
  sources: PickupSource[];
  target: TargetConfig;
  stale: boolean;
}) {
  const red = alliance === "red";
  const up = red ? -1 : 1;
  const pose = world?.pose ?? start;
  const first = target.center,
    tipped = tippedTarget(target).center;
  const cell = { first, tipped };
  const tips = world?.tipsDone ?? 0;
  const upCell = tips === 0 ? "first" : tips === 1 ? "tipped" : null;
  const hive = {
    x: (hiveNoGo.x0 + hiveNoGo.x1) / 2,
    y: (hiveNoGo.y0 + hiveNoGo.y1) / 2,
  };
  /** Upright text at a field point (the field group is flipped / rotated). */
  const label = (
    x: number,
    y: number,
    text: string,
    className: string,
    opacity = 1,
  ) => (
    <g
      transform={`translate(${x} ${y}) ${red ? "rotate(180)" : ""} scale(1 -1)`}
      opacity={opacity}
    >
      <text
        className={className}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {text}
      </text>
    </g>
  );
  const shape = (p: Pose, cls: string, held = -1) => {
    if (!robot) return null;
    const slots = Math.min(robot.capacity, 8);
    const gap = Math.min(0.085, (robot.halfY * 2 - 0.06) / Math.max(1, slots));
    return (
      <g
        transform={`translate(${p.x} ${p.y}) rotate(${p.h * deg})`}
        className={cls}
      >
        <rect
          x={robot.offsetX - robot.halfX}
          y={robot.offsetY - robot.halfY}
          width={robot.halfX * 2}
          height={robot.halfY * 2}
          rx={0.02}
        />
        <path
          className="nose"
          d={`M ${robot.offsetX + robot.halfX - 0.07} ${robot.offsetY - 0.05} L ${robot.offsetX + robot.halfX - 0.015} ${robot.offsetY} L ${robot.offsetX + robot.halfX - 0.07} ${robot.offsetY + 0.05} Z`}
        />
        {held >= 0 &&
          Array.from({ length: slots }, (_, i) => (
            <circle
              key={i}
              cx={robot.offsetX - 0.04}
              cy={robot.offsetY + (i - (slots - 1) / 2) * gap}
              r={Math.min(BALL, gap * 0.42)}
              className={i < held ? "held full" : "held"}
            />
          ))}
      </g>
    );
  };
  const pop = world?.pop;
  const popAt =
    pop && pop.points === 20 ? hive : pop ? { x: pose.x, y: pose.y } : null;
  return (
    <svg
      className={`auto-field ${stale ? "stale" : ""}`}
      viewBox={`${-H - 0.05} ${-H - 0.05} ${2 * H + 0.1} ${2 * H + 0.1}`}
      role="img"
    >
      <g transform="scale(1 -1)">
        <rect
          x={-H - 0.03}
          y={-H - 0.03}
          width={2 * H + 0.06}
          height={2 * H + 0.06}
          rx={0.04}
          className="field-wall"
        />
        <rect
          x={-H}
          y={-H}
          width={2 * H}
          height={2 * H}
          className="field-floor"
        />
        {[-2, -1, 0, 1, 2].map((i) => (
          <g key={i}>
            <line
              x1={i * tile}
              y1={-H}
              x2={i * tile}
              y2={H}
              className="field-tile"
            />
            <line
              x1={-H}
              y1={i * tile}
              x2={H}
              y2={i * tile}
              className="field-tile"
            />
          </g>
        ))}
        <g transform={red ? "rotate(180)" : ""} className={alliance}>
          <Fixed maps={maps} layer={layer} plan={plan} />
          {plan?.steps.map((s, i) =>
            s.kind === "shoot" ? (
              <g key={i}>{shape(s.pose, "ghost shoot")}</g>
            ) : null,
          )}
          {shape(start, "ghost start")}
          {sources.flatMap((s) => {
            const gone = world?.taken[s.id] ?? 0;
            if (s.kind === "flower") {
              const left = Math.max(0, s.balls - gone);
              const p = s.points[0];
              return p
                ? [
                    <g key={s.id}>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={0.075}
                        className={`flower ${left ? "" : "empty"}`}
                      />
                      {label(p.x, p.y, String(left), "count dark")}
                    </g>,
                  ]
                : [];
            }
            return s.points
              .slice(gone)
              .map((p, i) => (
                <circle
                  key={s.id + i}
                  cx={p.x}
                  cy={p.y}
                  r={BALL}
                  className="ball"
                />
              ));
          })}
          {track && (
            <polyline
              className="driven"
              points={track.map((p) => `${p.x},${p.y}`).join(" ")}
            />
          )}
          {(["first", "tipped"] as const).map((c) => (
            <g key={c}>
              <circle
                cx={cell[c][0]}
                cy={cell[c][1]}
                r={0.085}
                className={`cell ${upCell === c ? "up" : "down"}`}
              />
              {world?.swing?.cell === c && (
                <circle
                  cx={cell[c][0]}
                  cy={cell[c][1]}
                  r={0.085 + 0.25 * world.swing.u}
                  className="swing"
                  opacity={1 - world.swing.u}
                />
              )}
              {world &&
                label(
                  cell[c][0],
                  cell[c][1],
                  String(world.cells[c]),
                  "count light",
                )}
            </g>
          ))}
          {shape(pose, "robot", world ? world.held : -1)}
          {world?.flights.map((f, i) => {
            const to = cell[f.cell];
            const x = f.from.x + (to[0] - f.from.x) * f.u,
              y = f.from.y + (to[1] - f.from.y) * f.u,
              lift = Math.sin(Math.PI * f.u);
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={BALL} className="shadow" />
                <circle
                  cx={x}
                  cy={y + up * 0.12 * lift}
                  r={BALL * (1 + 0.7 * lift)}
                  className="ball flying"
                />
              </g>
            );
          })}
          {pop &&
            popAt &&
            label(
              popAt.x,
              popAt.y + up * (0.2 + 0.3 * pop.age),
              `+${pop.points}`,
              "pop",
              Math.max(0, 1 - pop.age / 1.2),
            )}
        </g>
      </g>
    </svg>
  );
}
