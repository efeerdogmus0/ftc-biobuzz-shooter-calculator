import { useMemo, useState } from "react";
import { NumberInput as N, Section } from "./Inputs";
import { useStore } from "../state/store";
import {
  clearanceEnvelope,
  hoodPathRadius,
  geometryFromConfig,
  marginStations,
  range,
  safeHeights,
  shotsFromConfig,
  type ShooterGeometry,
} from "../physics/clearance";
import { deg } from "../utils/units";
import { launchInertia } from "../physics/launchDynamics";
import { simulateShooter } from "../physics/shooter";
import { downloadJSON } from "../utils/config";
import { useT } from "../i18n/useT";

const mm = (x: number | null) => (x === null ? "—" : (x * 1000).toFixed(0));

/**
 * Side view of the ball's swept volume around the hooded wheel for the
 * current projectile/aero config. Geometry follows the configured release
 * point, with panel-local CAD overrides.
 */
export function ClearancePanel() {
  const t = useT();
  const c = useStore((s) => s.config);
  const settings = useStore((s) => s.bounceSettings);
  const [overrides, setOverrides] = useState<Partial<ShooterGeometry>>({});
  const g = useMemo(
    () => ({ ...geometryFromConfig(c), ...overrides }),
    [c, overrides],
  );
  const [shot, setShot] = useState({
    minAngle: c.shooter.hoodMin + c.shooter.hoodOffset,
    maxAngle: c.shooter.hoodMax + c.shooter.hoodOffset,
    minSpeed: 4,
    maxSpeed: Math.max(4, c.simulation.maxSpeed),
    margin: 0.02,
  });
  const geo = (k: keyof ShooterGeometry) => (v: number) =>
    setOverrides({ ...overrides, [k]: v });
  const set = (k: keyof typeof shot) => (v: number) =>
    setShot({ ...shot, [k]: v });
  const effective = useMemo(() => {
    const q = structuredClone(c);
    q.projectile.diameter = g.ballDiameter;
    q.shooter.primary.diameter = g.wheelDiameter;
    q.shooter.compression = g.compression;
    q.shooter.hoodRadius = hoodPathRadius(g);
    q.shooter.hoodEnd = q.shooter.hoodStart + g.contactWrap;
    return q;
  }, [c, g]);
  const inertia = useMemo(
    () => launchInertia(effective, settings),
    [effective, settings],
  );
  const e = useMemo(() => {
    if (!simulateShooter(effective, inertia).exited) return null;
    const steps = Math.max(
      2,
      Math.round((shot.maxAngle - shot.minAngle) / deg(5)) + 1,
    );
    const shots = shotsFromConfig(
      effective,
      range(shot.minAngle, Math.max(shot.minAngle, shot.maxAngle), steps),
      range(shot.minSpeed, Math.max(shot.minSpeed, shot.maxSpeed), 3),
      inertia,
    );
    return clearanceEnvelope(
      g,
      shots,
      effective,
      {
        clearForward: 0.6,
        clearUp: 0.6,
        pathStep: 0.003,
        stationMin: -0.25,
        stationMax: 0.6,
        stationStep: 0.01,
      },
      settings,
    );
  }, [
    effective,
    inertia,
    g,
    shot.minAngle,
    shot.maxAngle,
    shot.minSpeed,
    shot.maxSpeed,
    settings,
  ]);
  const expanded = useMemo(
    () => (e ? marginStations(e, shot.margin) : []),
    [e, shot.margin],
  );
  // View: s −0.25…0.6 m, z −0.2…0.65 m relative to the wheel axis.
  const W = 300,
    H = 300,
    k = W / 0.85;
  const x = (s: number) => (s + 0.25) * k,
    y = (z: number) => H - (z + 0.2) * k;
  const R = hoodPathRadius(g);
  const autoSpin = useMemo(
    () => (simulateShooter(effective, inertia).spin * 60) / (2 * Math.PI),
    [effective, inertia],
  );
  if (!e)
    return (
      <Section title="Shooter clearance" open>
        <p role="alert" className="notice">
          {t(
            "Ball did not exit the shooter. Adjust the contact settings before computing a launch envelope.",
          )}
        </p>
        <button onClick={() => setOverrides({})}>
          {t("Reset geometry to shooter")}
        </button>
      </Section>
    );
  const axis = safeHeights(e, 0, shot.margin),
    turret = safeHeights(e, -g.wheelForward, shot.margin);
  const safeText = (h: ReturnType<typeof safeHeights>) =>
    !h.withinRange
      ? t("Outside traced range")
      : h.clearAll
        ? t("No overlap in traced paths")
        : `${t.f("below {mm} mm", { mm: mm(h.below) })} / ${h.above! > e.options.clearUp ? t("upper region beyond trace") : t.f("above {mm} mm", { mm: mm(h.above) })}`;
  return (
    <Section title="Shooter clearance" open>
      <p className="tool-intro">
        {t(
          "Wheel and ball dimensions follow the active shooter. The wheel axis is estimated from its release point and circular hood. Replace the estimates with CAD measurements below.",
        )}
      </p>
      <div className="tool-toolbar">
        <span>
          {t("Exit spin:")} <strong>{autoSpin.toFixed(1)} RPM</strong> ·{" "}
          {t("from shooter settings")}
        </span>
        <button onClick={() => setOverrides({})}>
          {t("Reset geometry to shooter")}
        </button>
        <button
          onClick={() =>
            downloadJSON("shooter-clearance.json", {
              geometry: g,
              sweep: shot,
              spinSource: "automatic shooter spin/speed ratio",
              options: e.options,
              stations: expanded,
            })
          }
        >
          {t("Export envelope")}
        </button>
      </div>
      <div className="clearance-layout">
        <div className="clearance-preview">
          <svg
            className="legacy-chart clearance-chart"
            viewBox={`0 0 ${W} ${H}`}
            aria-label={t("Clearance envelope side view")}
            style={{ color: "inherit" }}
          >
            {expanded.flatMap((st) =>
              st.intervals.map(([lo, hi], i) => (
                <rect
                  key={`margin-${st.s}-${i}`}
                  x={x(st.s - 0.005)}
                  width={0.01 * k + 0.3}
                  y={y(hi)}
                  height={(hi - lo) * k}
                  fill="var(--accent)"
                  opacity={0.15}
                />
              )),
            )}
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
                  fill="var(--trajectory)"
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
              {t("turret axis")}
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
            {t.f(
              "Orange: swept ball. Blue: clearance margin in every direction. Lines: ball-center paths. Dashed circle: hood path radius {mm} mm.",
              { mm: mm(R) },
            )}
          </p>
          <table aria-label={t("Clearance summary")}>
            <tbody>
              <tr>
                <td>{t("Wheel-axis vertical line")}</td>
                <td>{safeText(axis)}</td>
              </tr>
              <tr>
                <td>{t("Turret-axis vertical line")}</td>
                <td>{safeText(turret)}</td>
              </tr>
              <tr>
                <td>{t("Lateral, from shooter plane")}</td>
                <td>
                  {t.f("clear beyond {mm} mm", {
                    mm: mm(e.halfWidth + shot.margin),
                  })}
                </td>
              </tr>
              <tr>
                <td>{t("Sampled shot set")}</td>
                <td>
                  {t.f("{n} angle / speed combinations", {
                    n: e.paths.length,
                  })}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="muted">
            {t(
              "Heights relative to the wheel axis; results cover only the traced local paths, up to 0.6 m ahead/above. Sphere envelope in still air. Feed path, robot motion and HIVE retention are outside this tool. Speed sweep uses the automatic shooter spin/speed ratio.",
            )}
          </p>
        </div>
        <div className="clearance-settings">
          <h3>{t("Geometry & shot sweep")}</h3>
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
              kind="diameter"
              value={g.wheelCenterHeight}
              onChange={geo("wheelCenterHeight")}
              min={0.05}
              max={0.8}
              slider={false}
            />
            <N
              label="Wheel ahead of turret axis"
              kind="diameter"
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
              onChange={(v) =>
                setOverrides({ ...overrides, hoodRadius: v > 0 ? v : null })
              }
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
              max={shot.maxAngle}
              slider={false}
            />
            <N
              label="Max elevation"
              kind="angle"
              value={shot.maxAngle}
              onChange={set("maxAngle")}
              min={shot.minAngle}
              max={deg(89)}
              slider={false}
            />
            <N
              label="Min exit speed"
              unit="m/s"
              value={shot.minSpeed}
              onChange={set("minSpeed")}
              min={1}
              max={shot.maxSpeed}
              slider={false}
            />
            <N
              label="Max exit speed"
              unit="m/s"
              value={shot.maxSpeed}
              onChange={set("maxSpeed")}
              min={shot.minSpeed}
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
          <p className="muted">
            {t(
              "Geometry overrides stay in this tool. Active shooter settings are unchanged.",
            )}
          </p>
        </div>
      </div>
    </Section>
  );
}
