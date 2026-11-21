import { useState } from "react";
import type { AnalysisState } from "../app/useAnalysis";
import type { Config } from "../physics/types";
import { NumberInput as N, Select, Section } from "./Inputs";
import { useStore } from "../state/store";
import { aim } from "../physics/flight";
import { toDeg, toRPM } from "../utils/units";
import {
  applyParameters,
  bakeMeasurements,
  calibrationStamp,
  parseMeasurements,
  type FitParameter,
  type Uncertainty,
} from "../physics/analysis";
import { downloadJSON } from "../utils/config";
import { ballModelSettings, physicsStamp } from "../physics/launchDynamics";
import { useT } from "../i18n/useT";
type T = ReturnType<typeof useT>;
const JOB_LABELS: Record<string, string> = {
  solve: "Auto shot solver",
  coverage: "Evaluate hood range",
  monteCarlo: "Monte Carlo consistency",
  calibrate: "Measured-shot calibration",
};
/**
 * Translates a message produced by the analysis engine. Fixed messages are
 * looked up whole; "prefix: message" chains (row ids, "Error") keep the prefix
 * and translate the rest; a few templated messages are matched by pattern.
 */
function localizeMessage(msg: string, t: T): string {
  const whole = t(msg);
  if (whole !== msg) return whole;
  let m = msg.match(/^(\S+) reached a parameter bound\.$/);
  if (m) return t.f("{key} reached a parameter bound.", { key: m[1] });
  m = msg.match(
    /^no predicted position at (\S+) s; free flight ended at (\S+) s\. Supply a pre-impact observation or use a model that resolves the later motion\.$/,
  );
  if (m)
    return t.f(
      "no predicted position at {time} s; free flight ended at {end} s. Supply a pre-impact observation or use a model that resolves the later motion.",
      { time: m[1], end: m[2] },
    );
  m = msg.match(/^([^:]+): ([\s\S]+)$/);
  if (m) return `${t(m[1])}: ${localizeMessage(m[2], t)}`;
  return msg;
}
const MEASUREMENT_TEXT_LIMIT = 512 * 1024;
/**
 * True when stored solver candidates belong to the robot now on screen. The
 * fields a candidate itself changes (hood angle, main wheel speed) and the
 * aim it re-applies are ignored, so the other suggestions stay usable after
 * one is applied; any other change (another robot, a moved robot, edited
 * geometry) hides them instead of letting a click restore an old robot.
 */
export function candidatesMatch(candidateConfig: string, config: Config) {
  if (!candidateConfig) return false;
  const strip = (c: Config) => {
    const q = structuredClone(c);
    q.shooter.hoodAngle = 0;
    q.shooter.primary.omega = 0;
    q.shooter.secondary.omega = 0;
    for (const r of q.shooter.rollers) r.omega = 0;
    q.robot.turretYaw = 0;
    q.calibrated = false;
    return JSON.stringify(q);
  };
  try {
    return strip(JSON.parse(candidateConfig) as Config) === strip(config);
  } catch {
    return false;
  }
}

/** Applies a solver candidate to the configuration it was computed for. */
export function applyCandidate(
  a: AnalysisState,
  x: AnalysisState["candidates"][number],
) {
  const s = useStore.getState();
  const q = aim(a.candidateConfig ? JSON.parse(a.candidateConfig) : s.config);
  q.shooter.hoodAngle = x.angle;
  q.shooter.primary.omega = x.omega;
  if (a.candidateModel)
    s.set({ bounceSettings: { ...s.bounceSettings, ...a.candidateModel } });
  s.setConfig(q);
}

/** Apply the last fit to the robot and store its measurements as calibration evidence. */
export function applyFit(a: AnalysisState) {
  if (!a.fit) return;
  const s = useStore.getState();
  const q = applyParameters(
    a.fitConfig ? JSON.parse(a.fitConfig) : s.config,
    a.fit.parameters,
  );
  const bounceSettings = a.fitModel
    ? { ...s.bounceSettings, ...a.fitModel }
    : s.bounceSettings;
  if (a.fitModel) s.set({ bounceSettings });
  // The badge is recomputed from these measurements; no stored pass flag.
  q.calibrated = false;
  s.setConfig(q);
  s.set({
    calibration: {
      stamp: calibrationStamp(q, ballModelSettings(bounceSettings)),
      // Each row keeps the pose it was taken at, so moving the robot keeps the badge.
      measurements: bakeMeasurements(q, a.fitMeasurements),
    },
  });
}
/** The fit parameters offered for this shooter model, with their bounds. */
export function fitChoices(
  c: Config,
): [FitParameter["key"], number, number, number][] {
  return [
    ["cd", 0, 2, c.aero.cd],
    ["lift", 0, 3, c.aero.liftSlope],
    ...(c.shooter.mode === "recalc"
      ? ([["transfer", 0.1, 2, c.shooter.transfer]] as const)
      : ([
          ["friction", 0.05, 2, c.shooter.friction],
          ["stiffness", 100, 50000, c.shooter.ballStiffness],
        ] as const)),
  ].map((x) => [...x] as [FitParameter["key"], number, number, number]);
}
export type AnalysisPart = "solve" | "coverage" | "mc" | "calibrate";
/**
 * The analysis tools. `only` renders a single tool (opened) for a journey
 * stage; without it the expert workbench gets all of them.
 */
export function AnalysisPanel({
  a,
  openTool,
  only,
}: {
  a: AnalysisState;
  openTool?: (tool: string) => void;
  only?: AnalysisPart;
}) {
  const show = (part: AnalysisPart) => !only || only === part;
  const t = useT();
  const s = useStore(),
    c = s.config;
  const [data, setData] = useState(JSON.stringify(a.measurements, null, 2)),
    [dataError, setDataError] = useState("");
  const stale =
    a.resultConfig && a.resultConfig !== physicsStamp(c, s.bounceSettings);
  const prepare = (
    key: FitParameter["key"],
    min: number,
    max: number,
    value: number,
  ) => {
    const exists = a.parameters.some((p) => p.key === key);
    a.setParameters(
      exists
        ? a.parameters.filter((p) => p.key !== key)
        : [...a.parameters, { key, min, max, value, initial: value }],
    );
  };
  return (
    <>
      {!only && openTool && (
        <>
          <div className="control-heading">{t("ANALYSIS WORKBENCH")}</div>
          <div className="analysis-tool-links">
            <button onClick={() => openTool("clearance")}>
              {t("Shooter clearance…")}
            </button>
            <button onClick={() => openTool("study")}>
              {t("Shot angle study…")}
            </button>
            <button onClick={() => openTool("legacy")}>
              {t("DECODE reference data…")}
            </button>
          </div>
        </>
      )}
      {a.busy && (
        <div className="job">
          <span>
            {t(JOB_LABELS[a.busy] ?? a.busy)} · {(a.progress * 100).toFixed(0)}%
          </span>
          <progress max={1} value={a.progress} />
          <button onClick={a.cancel}>{t("Cancel job")}</button>
        </div>
      )}
      {a.error && (
        <p className="error" role="alert">
          {localizeMessage(a.error, t)}
        </p>
      )}
      {stale && (
        <p className="notice">
          {t(
            "Results belong to an earlier configuration. Run again after changing settings.",
          )}
        </p>
      )}
      {show("solve") && (
        <Section title="Auto shot solver" open>
          <Select
            label="Optimization objective"
            path="simulation.objective"
            options={[
              ["energy", "Minimum projectile energy"],
              ["rpm", "Minimum primary RPM"],
              ["clearance", "Maximum target clearance"],
              ["robustness", "Clearance / flight sensitivity proxy"],
              ["time", "Minimum flight time"],
            ]}
          />
          <N
            label="Minimum primary speed"
            path="simulation.minOmega"
            kind="rpm"
            max={c.simulation.maxOmega - 0.1}
          />
          <N
            label="Maximum primary speed"
            path="simulation.maxOmega"
            kind="rpm"
            min={c.simulation.minOmega + 0.1}
            max={2000}
          />
          <N
            label="Maximum projectile exit speed"
            path="simulation.maxSpeed"
            min={0.5}
            max={20}
            unit="m/s"
          />
          <div className="two-col">
            <N
              label="Entry angle min"
              path="simulation.entryMin"
              kind="angle"
              max={Math.PI / 2}
            />
            <N
              label="Entry angle max"
              path="simulation.entryMax"
              kind="angle"
              max={Math.PI / 2}
            />
          </div>
          <Select
            label="Apex position constraint"
            path="simulation.apex"
            options={[
              ["any", "Unconstrained"],
              ["before", "Before target entry"],
              ["at", "At entry ±20 ms"],
              ["after", "After target entry"],
            ]}
          />
          <N
            label="Apex clearance above target"
            path="simulation.apexClearance"
            max={2}
            unit="m"
          />
          <button
            className="primary wide"
            disabled={!!a.busy}
            onClick={() => a.run("solve")}
          >
            {t("Find candidate shots")}
          </button>
          <p className="muted">
            {t(
              "Searches angle + RPM. Finite search; “no candidate” is not a proof of impossibility. Robustness objective is a proxy; verify with Monte Carlo.",
            )}
          </p>
          {a.candidates.length > 0 &&
            !candidatesMatch(a.candidateConfig, c) && (
              <p className="muted">
                {t(
                  "Stored candidates were computed for another robot or pose; run the search again.",
                )}
              </p>
            )}
          {candidatesMatch(a.candidateConfig, c) &&
            a.candidates.map((x, i) => (
              <button
                className="candidate"
                key={i}
                onClick={() => applyCandidate(a, x)}
              >
                <span>
                  0{i + 1} <b>{toDeg(x.angle).toFixed(1)}°</b> ·{" "}
                  {toRPM(x.omega).toFixed(0)} RPM
                </span>
                <small>
                  {x.speed.toFixed(2)} m/s · {x.energy.toFixed(3)} J ·{" "}
                  {x.time.toFixed(2)} s<br />
                  {t.f("{mm} mm clearance · {deg}° entry", {
                    mm: (x.clearance * 1000).toFixed(0),
                    deg: toDeg(x.entryAngle).toFixed(1),
                  })}
                  <br />
                  {t.f("{hood}° hood margin · {rpm} RPM margin", {
                    hood: toDeg(x.hoodMargin).toFixed(1),
                    rpm: toRPM(x.rpmMargin).toFixed(0),
                  })}
                </small>
              </button>
            ))}
          {a.resultConfig && a.candidates.length === 0 && !a.busy && (
            <p className="muted">{t("No solver candidates stored.")}</p>
          )}
        </Section>
      )}
      {show("coverage") && (
        <Section title="Evaluate hood range" open={!!only}>
          <N
            label="Field grid spacing"
            value={a.spacing}
            onChange={a.setSpacing}
            min={0.05}
            max={0.5}
            step={0.05}
            kind="diameter"
          />
          <p className="muted">
            {t(
              "50 / 100 mm grids can take minutes. Worker remains cancellable. Robot center is inset by its bounding radius.",
            )}
          </p>
          <button
            className="wide"
            disabled={!!a.busy}
            onClick={() => a.run("coverage")}
          >
            {t("Evaluate Hood Range")}
          </button>
          <label className="select-control">
            {t("Heatmap layer")}
            <select
              value={s.coverageMode}
              onChange={(e) =>
                s.set({ coverageMode: e.target.value as typeof s.coverageMode })
              }
            >
              <option value="reachability">
                {t("Reachability / clearance")}
              </option>
              <option value="angle">{t("Required hood angle")}</option>
              <option value="velocity">{t("Required launch velocity")}</option>
              <option value="energy">{t("Projectile energy")}</option>
            </select>
          </label>
          {s.coverage.length > 0 && (
            <>
              <p className="success">
                {t.f("{n} / {total} sampled poses have a valid candidate.", {
                  n: s.coverage.filter((x) => x.candidate).length,
                  total: s.coverage.length,
                })}
              </p>
              <button
                onClick={() =>
                  downloadJSON("hood-range-analysis.json", s.coverage)
                }
              >
                {t("Export grid results")}
              </button>
              <button onClick={() => s.set({ coverage: [] })}>
                {t("Clear heatmap")}
              </button>
            </>
          )}
        </Section>
      )}
      {show("mc") && (
        <Section title="Monte Carlo consistency" open={!!only}>
          <label className="select-control">
            {t("Number of shots")}
            <select
              value={a.count}
              onChange={(e) => a.setCount(Number(e.target.value))}
            >
              {[100, 1000, 10000].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <N
            label="Random seed"
            value={a.seed}
            onChange={a.setSeed}
            max={1000000}
            step={1}
            slider={false}
          />
          {Object.entries(a.uncertainty).map(([key, v]) => (
            <N
              key={key}
              label={`${key} σ`}
              value={v}
              onChange={(x) => a.setUncertainty({ ...a.uncertainty, [key]: x })}
              max={
                key === "rpm"
                  ? 1000
                  : key === "mass"
                    ? 0.01
                    : key === "pose"
                      ? 0.2
                      : key === "diameter" || key === "compression"
                        ? 0.01
                        : key === "angle" || key === "yaw"
                          ? 0.2
                          : 1
              }
              step={key === "rpm" ? 1 : 0.0001}
              unit={
                (
                  {
                    rpm: "RPM",
                    angle: "rad",
                    mass: "kg",
                    diameter: "m",
                    cd: "",
                    compression: "m",
                    friction: "",
                    pose: "m",
                    yaw: "rad",
                    wind: "m/s",
                  } satisfies Record<keyof Uncertainty, string>
                )[key as keyof Uncertainty]
              }
              slider={false}
            />
          ))}
          <button
            className="wide"
            disabled={!!a.busy}
            onClick={() => a.run("monteCarlo")}
          >
            {t("Run consistency simulation")}
          </button>
          {a.mc && (
            <>
              <div className="probability">
                {(100 * a.mc.probability).toFixed(1)}
                <small>{t("% entry success")}</small>
              </div>
              <p className="muted">
                {t.f(
                  "{hits} / {count} · seed {seed}. Entry success is not retention probability.",
                  { hits: a.mc.hits, count: a.mc.count, seed: a.mc.seed },
                )}
              </p>
              <Scatter
                points={a.mc.entries}
                width={
                  a.mcConfig
                    ? JSON.parse(a.mcConfig).field.target.width
                    : c.field.target.width
                }
                height={
                  a.mcConfig
                    ? JSON.parse(a.mcConfig).field.target.height
                    : c.field.target.height
                }
                ellipses={a.mc.ellipses}
              />
              <p className="muted">
                {t(
                  "Successful entry points in opening coordinates. Gaussian covariance ellipses: 50 / 90 / 95%; conditional on entry.",
                )}
              </p>
              <Scatter
                points={a.mc.landings}
                width={
                  a.mcConfig ? JSON.parse(a.mcConfig).field.size : c.field.size
                }
                height={
                  a.mcConfig ? JSON.parse(a.mcConfig).field.size : c.field.size
                }
              />
              <p className="muted">
                {t("Floor impacts only; wall / CELL collisions excluded.")}
              </p>
              <button onClick={() => downloadJSON("monte-carlo.json", a.mc)}>
                {t("Export results")}
              </button>
            </>
          )}
        </Section>
      )}
      {show("calibrate") && (
        <Section title="Measured-shot calibration" open={!!only}>
          <p className="muted">
            {t(
              "Paste a JSON array of measured shots. Each row: id, split (training/validation), primaryRPM, secondaryRPM, hoodDeg, exitVelocity (m/s), spinRPM. Optional impact [X,Y,Z] requires time (s). Optional robot pose captures a different shot location. Linked hood RPM must match the configured ratio within 1 RPM; calibration keeps that linkage. Optional rollerRPMs lists the extra hood speeds in order; omitted extra speeds retain the configured commands. Timed positions must precede the end of predicted free flight.",
            )}
          </p>
          <textarea
            aria-label={t("Calibration measurements JSON")}
            rows={10}
            value={data}
            onChange={(e) => setData(e.target.value)}
            placeholder='[{"id":"shot-1","split":"training","primaryRPM":1700,"secondaryRPM":6375,"rollerRPMs":[6375,6375],"hoodDeg":65,"exitVelocity":7.1}]'
          />
          <button
            onClick={() => {
              try {
                if (data.length > MEASUREMENT_TEXT_LIMIT)
                  throw new Error(
                    t.f("Measurement JSON exceeds {n} kB.", {
                      n: MEASUREMENT_TEXT_LIMIT / 1024,
                    }),
                  );
                const rows = parseMeasurements(
                  JSON.parse(data),
                  c.simulation.maxTime,
                );
                a.setMeasurements(rows);
                setDataError(
                  t.f("{n} measured shots loaded.", { n: rows.length }),
                );
              } catch (e) {
                setDataError(localizeMessage(String(e), t));
              }
            }}
          >
            {t("Validate measurements")}
          </button>
          <p className="muted">{dataError}</p>
          <p className="eyebrow">{t("PARAMETERS TO FIT · BOUNDED")}</p>
          {fitChoices(c).map(([key, min, max, value]) => (
            <label className="toggle" key={key}>
              <input
                type="checkbox"
                checked={a.parameters.some((p) => p.key === key)}
                onChange={() => prepare(key, min, max, value)}
              />
              <span>
                {key} [{min}, {max}]
              </span>
            </label>
          ))}
          <button
            className="wide"
            disabled={
              !!a.busy || !a.measurements.length || !a.parameters.length
            }
            onClick={() => a.run("calibrate")}
          >
            {t("Fit training measurements")}
          </button>
          {a.fit && (
            <>
              <table>
                <thead>
                  <tr>
                    <th>{t("Parameter")}</th>
                    <th>{t("Initial")}</th>
                    <th>{t("Fitted")}</th>
                  </tr>
                </thead>
                <tbody>
                  {a.fit.parameters.map((p) => (
                    <tr key={p.key}>
                      <td>{p.key}</td>
                      <td>{p.initial.toPrecision(4)}</td>
                      <td>{p.value.toPrecision(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                {t.f("Training RMSE: {train} · Validation: {validation}", {
                  train: a.fit.trainingRMSE.toFixed(3),
                  validation:
                    a.fit.validationRMSE?.toFixed(3) ?? t("not supplied"),
                })}{" "}
                <small>{t("(normalized)")}</small>
              </p>
              <p className={a.fit.validationPassed ? "muted" : "notice"}>
                {a.fit.validationPassed
                  ? t("Measured fit validated.")
                  : t("Fit has not passed held-out validation.")}{" "}
                {t(
                  "Requires measured outcomes in every row, validation RMSE ≤ 1 and maximum normalized error ≤ 2. This validates only the supplied launch/flight observations, not HIVE retention or bounce materials.",
                )}
              </p>
              {a.fit.warnings.map((w) => (
                <p className="notice" key={w}>
                  {localizeMessage(w, t)}
                </p>
              ))}
              <button onClick={() => applyFit(a)}>
                {t("Apply fitted parameters")}
              </button>
              <button
                onClick={() => downloadJSON("calibration-fit.json", a.fit)}
              >
                {t("Export fit report")}
              </button>
            </>
          )}
        </Section>
      )}
    </>
  );
}
function Scatter({
  points,
  width,
  height,
  ellipses = [],
}: {
  points: [number, number][];
  width: number;
  height: number;
  ellipses?: NonNullable<AnalysisState["mc"]>["ellipses"];
}) {
  const t = useT();
  const scale = 220 / Math.max(width, height);
  return (
    <svg
      className="scatter"
      viewBox="0 0 260 180"
      aria-label={t("Shot scatter plot")}
    >
      <rect
        x={130 - (width * scale) / 2}
        y={90 - (height * scale) / 2}
        width={width * scale}
        height={height * scale}
        fill="none"
        stroke="#73867c"
      />
      {points.slice(0, 10000).map(([x, y], i) => (
        <circle
          key={i}
          cx={130 + x * scale}
          cy={90 - y * scale}
          r={1.3}
          fill="#e7bc77"
          opacity={0.45}
        />
      ))}
      {ellipses.map((e) => (
        <ellipse
          key={e.level}
          cx={130 + e.center[0] * scale}
          cy={90 - e.center[1] * scale}
          rx={e.radii[0] * scale}
          ry={e.radii[1] * scale}
          transform={`rotate(${-toDeg(e.angle)},${130 + e.center[0] * scale},${90 - e.center[1] * scale})`}
          fill="none"
          stroke="#afd4be"
          strokeWidth="1"
          opacity={e.level}
        />
      ))}
    </svg>
  );
}
