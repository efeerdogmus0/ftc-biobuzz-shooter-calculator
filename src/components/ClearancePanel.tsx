import { useMemo, useState } from "react";
import { NumberInput as N, Section } from "./Inputs";
import { useStore } from "../state/store";
import {
  clearanceEnvelope,
  hoodPathRadius,
  placeholderGeometry,
  range,
  safeHeights,
  shotsFromConfig,
  type ShooterGeometry,
} from "../physics/clearance";
import { deg } from "../utils/units";

const mm = (x: number | null) => (x === null ? "—" : (x * 1000).toFixed(0));

/**
 * Side view of the ball's swept volume around the hooded wheel for the
 * current projectile/aero config. Geometry is panel-local (not saved in
 * profiles) and starts from PLACEHOLDER values until CAD numbers exist.
 */
export function ClearancePanel() {
  const c = useStore((s) => s.config);
  const [g, setG] = useState<ShooterGeometry>(placeholderGeometry);
  // Default shot set: recommended elevations of 90% of positions and their
  // speed windows in docs/SHOT-STUDY.md (uncalibrated).
  const [shot, setShot] = useState({
    minAngle: deg(60),
    maxAngle: deg(80),
    minSpeed: 4.75,
    maxSpeed: 9,
    margin: 0.02,
  });
  const geo = (k: keyof ShooterGeometry) => (v: number) =>
    setG({ ...g, [k]: v });
  const set = (k: keyof typeof shot) => (v: number) =>
    setShot({ ...shot, [k]: v });
  const e = useMemo(() => {
    const steps = Math.max(
      2,
      Math.round((shot.maxAngle - shot.minAngle) / deg(5)) + 1,
    );
    const shots = shotsFromConfig(
      c,
      range(shot.minAngle, Math.max(shot.minAngle, shot.maxAngle), steps),
      range(shot.minSpeed, Math.max(shot.minSpeed, shot.maxSpeed), 3),
    );
    return clearanceEnvelope(g, shots, c, {
      clearForward: 0.6,
      clearUp: 0.6,
      pathStep: 0.003,
      stationMin: -0.25,
      stationMax: 0.6,
      stationStep: 0.01,
    });
  }, [c, g, shot]);
  const axis = safeHeights(e, 0, shot.margin),
    turret = safeHeights(e, -g.wheelForward, shot.margin);
  // View: s −0.25…0.6 m, z −0.2…0.65 m relative to the wheel axis.
  const W = 300,
    H = 300,
    k = W / 0.85;
  const x = (s: number) => (s + 0.25) * k,
    y = (z: number) => H - (z + 0.2) * k;
  const R = hoodPathRadius(g);
  return (
    <Section title="Clearance envelope">
      <p className="notice">
        Uncalibrated. Geometry defaults are PLACEHOLDERS, not CAD. Enter the
        real wheel, hood and turret numbers. Side view in the shooter plane;
        heights are relative to the wheel axis.
      </p>
      <svg
        className="legacy-chart clearance-chart"
        viewBox={`0 0 ${W} ${H}`}
        aria-label="Clearance envelope side view"
        style={{ color: "inherit" }}
      >
        {[-0.2, 0, 0.2, 0.4, 0.6].map((v) => (
          <g key={v} opacity={0.35}>
            <line
              x1={x(v)}
              x2={x(v)}
              y1={0}
              y2={H}
              stroke="currentColor"
              strokeWidth={0.4}
            />
            <line
              x1={0}
              x2={W}
              y1={y(v)}
              y2={y(v)}
              stroke="currentColor"
              strokeWidth={0.4}
            />
            <text x={x(v) + 2} y={H - 3} fontSize="8" fill="currentColor">
              {v.toFixed(1)}
            </text>
            <text x={2} y={y(v) - 2} fontSize="8" fill="currentColor">
              {v.toFixed(1)}
            </text>
          </g>
        ))}
        {e.stations.flatMap((st) =>
          st.intervals.map(([lo, hi], i) => (
            <rect
              key={`${st.s}-${i}`}
              x={x(st.s - 0.005)}
              width={0.01 * k + 0.3}
              y={y(hi)}
              height={(hi - lo) * k}
              fill="var(--accent, #e7bc77)"
              opacity={0.35}
            />
          )),
        )}
        {e.paths.map((p, i) => (
          <polyline
            key={i}
            points={p.points.map((q) => `${x(q[0])},${y(q[2])}`).join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth={0.5}
            opacity={0.5}
          />
        ))}
        <circle
          cx={x(0)}
          cy={y(0)}
          r={(g.wheelDiameter / 2) * k}
          fill="none"
          stroke="currentColor"
        />
        <circle
          cx={x(0)}
          cy={y(0)}
          r={R * k}
          fill="none"
          stroke="currentColor"
          strokeDasharray="2 2"
          opacity={0.6}
        />
        <line
          x1={x(-g.wheelForward)}
          x2={x(-g.wheelForward)}
          y1={0}
          y2={H}
          stroke="currentColor"
          strokeDasharray="5 3"
        />
        <text
          x={x(-g.wheelForward) + 2}
          y={10}
          fontSize="8"
          fill="currentColor"
        >
          turret axis
        </text>
        <line
          x1={0}
          x2={W}
          y1={y(-g.wheelCenterHeight)}
          y2={y(-g.wheelCenterHeight)}
          stroke="currentColor"
        />
      </svg>
      <p className="muted">
        Shaded: ball surface over all shots (hood arc + free flight, traced to
        0.6 m ahead/above). Lines: ball-center paths. Dashed circle: hood path
        radius {mm(R)} mm.
      </p>
      <table aria-label="Clearance summary">
        <tbody>
          <tr>
            <td>Wheel-axis vertical line</td>
            <td>
              {axis.clearAll
                ? "never reached"
                : `clear below ${mm(axis.below)} or above ${axis.above! >= 0.6 ? "> 600" : mm(axis.above)} mm`}
            </td>
          </tr>
          <tr>
            <td>Turret-axis vertical line</td>
            <td>
              {turret.clearAll
                ? "never reached"
                : `clear below ${mm(turret.below)} or above ${turret.above! >= 0.6 ? "> 600" : mm(turret.above)} mm`}
            </td>
          </tr>
          <tr>
            <td>Lateral, from shooter plane</td>
            <td>clear beyond {mm(e.halfWidth + shot.margin)} mm</td>
          </tr>
          <tr>
            <td>Behind wheel axis</td>
            <td>clear beyond {mm(R + e.ballRadius + shot.margin)} mm</td>
          </tr>
        </tbody>
      </table>
      <p className="muted">
        Includes the margin. Heights relative to the wheel axis. The feed path
        into the hood is not modeled.
      </p>
      <div className="two-col">
        <N
          label="Wheel diameter"
          kind="diameter"
          value={g.wheelDiameter}
          onChange={geo("wheelDiameter")}
          min={0.03}
          max={0.2}
          slider={false}
        />
        <N
          label="Compression"
          kind="diameter"
          value={g.compression}
          onChange={geo("compression")}
          min={0}
          max={0.03}
          slider={false}
        />
        <N
          label="Wheel axis height"
          kind="length"
          value={g.wheelCenterHeight}
          onChange={geo("wheelCenterHeight")}
          min={0.05}
          max={0.8}
          slider={false}
        />
        <N
          label="Wheel ahead of turret axis"
          kind="length"
          value={g.wheelForward}
          onChange={geo("wheelForward")}
          min={-0.3}
          max={0.3}
          slider={false}
        />
        <N
          label="Hood contact wrap"
          kind="angle"
          value={g.contactWrap}
          onChange={geo("contactWrap")}
          min={0}
          max={deg(200)}
          slider={false}
        />
        <N
          label="Hood path radius (0 = auto)"
          kind="diameter"
          value={g.hoodRadius ?? 0}
          onChange={(v) => setG({ ...g, hoodRadius: v > 0 ? v : null })}
          min={0}
          max={0.2}
          slider={false}
        />
        <N
          label="Min elevation"
          kind="angle"
          value={shot.minAngle}
          onChange={set("minAngle")}
          min={deg(10)}
          max={deg(89)}
          slider={false}
        />
        <N
          label="Max elevation"
          kind="angle"
          value={shot.maxAngle}
          onChange={set("maxAngle")}
          min={deg(10)}
          max={deg(89)}
          slider={false}
        />
        <N
          label="Min exit speed"
          unit="m/s"
          value={shot.minSpeed}
          onChange={set("minSpeed")}
          min={1}
          max={20}
          slider={false}
        />
        <N
          label="Max exit speed"
          unit="m/s"
          value={shot.maxSpeed}
          onChange={set("maxSpeed")}
          min={1}
          max={20}
          slider={false}
        />
        <N
          label="Margin"
          kind="diameter"
          value={shot.margin}
          onChange={set("margin")}
          min={0}
          max={0.1}
          slider={false}
        />
      </div>
    </Section>
  );
}
