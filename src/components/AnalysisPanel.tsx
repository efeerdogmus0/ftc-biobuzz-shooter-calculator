import { useState } from "react";
import type { AnalysisState } from "../app/useAnalysis";
import { NumberInput as N, Select, Section, type Unit } from "./Inputs";
import { jobLabels } from "../app/useAnalysis";
import { useStore } from "../state/store";
import { aim } from "../physics/flight";
import { toDeg, toRPM } from "../utils/units";
import {
  applyParameters,
  type FitParameter,
  type Measurement,
  type Uncertainty,
} from "../physics/analysis";
import { downloadJSON } from "../utils/config";
import { LegacyData } from "./LegacyData";
import { ClearancePanel } from "./ClearancePanel";
const sigmaLabels: Record<keyof Uncertainty, [string, Unit, string?]> = {
  rpm: ["Wheel speed σ", "none", "RPM"],
  angle: ["Hood angle σ", "angle"],
  mass: ["Ball mass σ", "mass"],
  diameter: ["Ball diameter σ", "diameter"],
  cd: ["Drag coefficient σ", "none"],
  compression: ["Compression σ", "diameter"],
  friction: ["Friction coefficient σ", "none"],
  pose: ["Robot position σ", "diameter"],
  yaw: ["Turret yaw σ", "angle"],
  wind: ["Wind speed σ", "none", "m/s"],
};
const fitLabels: Record<FitParameter["key"], string> = {
  cd: "Drag coefficient",
  lift: "Lift slope",
  transfer: "Transfer calibration",
  friction: "Friction",
  stiffness: "Ball stiffness",
};
export function AnalysisPanel({ a }: { a: AnalysisState }) {
  const s = useStore(),
    c = s.config;
  const [data, setData] = useState(JSON.stringify(a.measurements, null, 2)),
    [dataError, setDataError] = useState("");
  const stale = a.resultConfig && a.resultConfig !== JSON.stringify(c);
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
      {a.busy && (
        <div className="job" aria-live="polite">
          <span>
            Running {jobLabels[a.busy] ?? a.busy} ·{" "}
            {(a.progress * 100).toFixed(0)}%
          </span>
          <progress max={1} value={a.progress} />
          <button onClick={a.cancel}>Cancel job</button>
        </div>
      )}
      {a.error && (
        <p className="error" role="alert">
          {a.error}
        </p>
      )}
      {stale && (
        <p className="notice">
          Results belong to an earlier configuration. Run again after changing
          settings.
        </p>
      )}
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
          {a.busy === "solve" ? "Searching…" : "Find candidate shots"}
        </button>
        <p className="muted">
          Searches angle + RPM. Finite search; “no candidate” is not a proof of
          impossibility. Robustness objective is a proxy; verify with Monte
          Carlo.
        </p>
        {a.candidates.map((x, i) => (
          <button
            className="candidate"
            key={i}
            onClick={() => {
              const q = aim(
                a.candidateConfig ? JSON.parse(a.candidateConfig) : c,
              );
              q.shooter.hoodAngle = x.angle;
              q.shooter.primary.omega = x.omega;
              s.setConfig(q);
            }}
          >
            <span className="rank">{String(i + 1).padStart(2, "0")}</span>
            <span>
              <b>{toDeg(x.angle).toFixed(1)}°</b> hood ·{" "}
              <b>{toRPM(x.omega).toFixed(0)}</b> RPM
            </span>
            <small>
              {x.speed.toFixed(2)} m/s · {x.energy.toFixed(3)} J ·{" "}
              {x.time.toFixed(2)} s<br />
              {(x.clearance * 1000).toFixed(0)} mm clearance ·{" "}
              {toDeg(x.entryAngle).toFixed(1)}° entry
              <br />
              {toDeg(x.hoodMargin).toFixed(1)}° hood margin ·{" "}
              {toRPM(x.rpmMargin).toFixed(0)} RPM margin
            </small>
          </button>
        ))}
        {a.candidates.length > 0 && (
          <p className="muted">Click a candidate to apply it.</p>
        )}
        {a.resultConfig && a.candidates.length === 0 && !a.busy && (
          <p className="notice">
            No candidate found within the RPM, exit-speed and entry-angle limits
            above. Widen the limits or move the robot.
          </p>
        )}
      </Section>
      <Section title="Evaluate hood range">
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
          50 / 100 mm grids can take minutes. Worker remains cancellable. Robot
          center is inset by its bounding radius.
        </p>
        <button
          className="wide"
          disabled={!!a.busy}
          onClick={() => a.run("coverage")}
        >
          {a.busy === "coverage" ? "Evaluating…" : "Run field coverage"}
        </button>
        <label className="select-control">
          Heatmap layer
          <select
            value={s.coverageMode}
            onChange={(e) =>
              s.set({ coverageMode: e.target.value as typeof s.coverageMode })
            }
          >
            <option value="reachability">Reachability / clearance</option>
            <option value="angle">Required hood angle</option>
            <option value="velocity">Required launch velocity</option>
            <option value="energy">Projectile energy</option>
          </select>
        </label>
        {s.coverage.length > 0 && (
          <>
            <p className="success">
              {s.coverage.filter((x) => x.candidate).length} /{" "}
              {s.coverage.length} sampled poses have a valid candidate.
            </p>
            <p className="muted">
              Heatmap is drawn on the field floor; use the Top camera.
            </p>
            <div className="button-row">
              <button
                onClick={() =>
                  downloadJSON("hood-range-analysis.json", s.coverage)
                }
              >
                Export grid results
              </button>
              <button onClick={() => s.set({ coverage: [] })}>
                Clear heatmap
              </button>
            </div>
          </>
        )}
      </Section>
      <Section title="Monte Carlo consistency">
        <p className="muted">
          Repeats the current shot with random measurement errors to estimate
          how often it still enters the CELL.
        </p>
        <label className="select-control">
          Number of shots
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
        <p className="eyebrow">Measurement uncertainty (1σ)</p>
        {Object.entries(a.uncertainty).map(([key, v]) => (
          <N
            key={key}
            label={sigmaLabels[key as keyof Uncertainty][0]}
            kind={sigmaLabels[key as keyof Uncertainty][1]}
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
            unit={sigmaLabels[key as keyof Uncertainty][2]}
            slider={false}
          />
        ))}
        <button
          className="wide"
          disabled={!!a.busy}
          onClick={() => a.run("monteCarlo")}
        >
          {a.busy === "monteCarlo"
            ? "Simulating…"
            : "Run consistency simulation"}
        </button>
        {a.mc && (
          <>
            <div className="probability">
              {(100 * a.mc.probability).toFixed(1)}
              <small>% entry success</small>
            </div>
            <p className="muted">
              {a.mc.hits} / {a.mc.count} · seed {a.mc.seed}. Entry success is
              not retention probability.
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
              label="Entry points in CELL opening"
              unit="mm"
            />
            <p className="muted">
              Successful entry points in opening coordinates. Gaussian
              covariance ellipses: 50 / 90 / 95%; conditional on entry.
            </p>
            <Scatter
              points={a.mc.landings}
              width={
                a.mcConfig ? JSON.parse(a.mcConfig).field.size : c.field.size
              }
              height={
                a.mcConfig ? JSON.parse(a.mcConfig).field.size : c.field.size
              }
              label="Floor impacts on field"
              unit="m"
            />
            <p className="muted">
              Floor impacts only; wall / CELL collisions excluded.
            </p>
            <button onClick={() => downloadJSON("monte-carlo.json", a.mc)}>
              Export results
            </button>
          </>
        )}
      </Section>
      <Section title="Measured-shot calibration">
        <p className="muted">
          Paste a JSON array of measured shots. Each row: id, split
          (training/validation), primaryRPM, secondaryRPM, hoodDeg, exitVelocity
          (m/s), spinRPM. Optional impact [X,Y,Z] requires time (s). Optional
          robot pose captures a different shot location.
        </p>
        <textarea
          aria-label="Calibration measurements JSON"
          rows={10}
          value={data}
          onChange={(e) => setData(e.target.value)}
          placeholder='[{"id":"shot-1","split":"training","primaryRPM":2300,"secondaryRPM":10350,"hoodDeg":65,"exitVelocity":7.1}]'
        />
        <button
          onClick={() => {
            try {
              const rows = JSON.parse(data) as Measurement[];
              if (!Array.isArray(rows) || rows.length === 0)
                throw new Error("Enter at least one measured shot.");
              for (const r of rows) {
                if (
                  !["training", "validation"].includes(r.split) ||
                  ![r.primaryRPM, r.secondaryRPM, r.hoodDeg].every(
                    Number.isFinite,
                  )
                )
                  throw new Error(
                    "Each shot needs valid split, RPMs and hoodDeg.",
                  );
                if (
                  r.exitVelocity === undefined &&
                  r.spinRPM === undefined &&
                  !r.impact
                )
                  throw new Error(
                    "Each row needs at least one observed measurement.",
                  );
                if (
                  r.impact &&
                  (!Number.isFinite(r.time) ||
                    r.impact.length !== 3 ||
                    !r.impact.every(Number.isFinite))
                )
                  throw new Error("Impact requires XYZ and measured time.");
              }
              a.setMeasurements(rows);
              setDataError(`${rows.length} measured shots loaded.`);
            } catch (e) {
              setDataError(String(e));
            }
          }}
        >
          Validate measurements
        </button>
        <p className="muted">{dataError}</p>
        <p className="eyebrow">PARAMETERS TO FIT · BOUNDED</p>
        {(
          [
            ["cd", 0, 2, c.aero.cd],
            ["lift", 0, 3, c.aero.liftSlope],
            ...(c.shooter.mode === "recalc"
              ? [["transfer", 0.1, 2, c.shooter.transfer]]
              : [
                  ["friction", 0.05, 2, c.shooter.friction],
                  ["stiffness", 100, 50000, c.shooter.ballStiffness],
                ]),
          ] as [FitParameter["key"], number, number, number][]
        ).map(([key, min, max, value]) => (
          <label className="toggle" key={key}>
            <input
              type="checkbox"
              checked={a.parameters.some((p) => p.key === key)}
              onChange={() => prepare(key, min, max, value)}
            />
            <span>
              {fitLabels[key]} · {key} [{min}, {max}]
            </span>
          </label>
        ))}
        <button
          className="wide"
          disabled={!!a.busy || !a.measurements.length || !a.parameters.length}
          onClick={() => a.run("calibrate")}
        >
          Fit training measurements
        </button>
        {a.fit && (
          <>
            <table>
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Initial</th>
                  <th>Fitted</th>
                </tr>
              </thead>
              <tbody>
                {a.fit.parameters.map((p) => (
                  <tr key={p.key}>
                    <td>
                      {fitLabels[p.key]} <small>{p.key}</small>
                    </td>
                    <td>{p.initial.toPrecision(4)}</td>
                    <td>{p.value.toPrecision(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Training RMSE: {a.fit.trainingRMSE.toFixed(3)} · Validation:{" "}
              {a.fit.validationRMSE?.toFixed(3) ?? "not supplied"}{" "}
              <small>(normalized)</small>
            </p>
            {a.fit.warnings.map((w) => (
              <p className="notice" key={w}>
                {w}
              </p>
            ))}
            <button
              onClick={() => {
                const q = applyParameters(
                  a.fitConfig ? JSON.parse(a.fitConfig) : c,
                  a.fit!.parameters,
                );
                q.calibrated = a.fit!.validationCount > 0;
                s.setConfig(q);
              }}
            >
              Apply fitted parameters
            </button>
            <button onClick={() => downloadJSON("calibration-fit.json", a.fit)}>
              Export fit report
            </button>
          </>
        )}
      </Section>
      <ClearancePanel />
      <LegacyData />
    </>
  );
}
function Scatter({
  points,
  width,
  height,
  ellipses = [],
  label,
  unit,
}: {
  points: [number, number][];
  width: number;
  height: number;
  ellipses?: NonNullable<AnalysisState["mc"]>["ellipses"];
  label: string;
  unit: "m" | "mm";
}) {
  // Plot area 40..250 × 22..152 inside a 260 × 180 view box; points are SI m.
  const scale = Math.min(210 / width, 130 / height),
    cx = 145,
    cy = 87,
    k = unit === "mm" ? 1000 : 1,
    fmt = (v: number) => (v * k).toFixed(unit === "mm" ? 0 : 2);
  return (
    <svg className="scatter" viewBox="0 0 260 180" aria-label={label}>
      <text className="axis-title" x="130" y="13" textAnchor="middle">
        {label}
      </text>
      <rect
        className="frame"
        x={cx - (width * scale) / 2}
        y={cy - (height * scale) / 2}
        width={width * scale}
        height={height * scale}
      />
      {points.slice(0, 10000).map(([x, y], i) => (
        <circle
          className="pt"
          key={i}
          cx={cx + x * scale}
          cy={cy - y * scale}
          r={1.3}
        />
      ))}
      {ellipses.map((e) => (
        <ellipse
          className="ellipse"
          key={e.level}
          cx={cx + e.center[0] * scale}
          cy={cy - e.center[1] * scale}
          rx={e.radii[0] * scale}
          ry={e.radii[1] * scale}
          transform={`rotate(${-toDeg(e.angle)},${cx + e.center[0] * scale},${cy - e.center[1] * scale})`}
          opacity={e.level}
        />
      ))}
      <text
        className="tick"
        x={cx}
        y={cy + (height * scale) / 2 + 14}
        textAnchor="middle"
      >
        {fmt(-width / 2)} … {fmt(width / 2)} {unit} (horizontal)
      </text>
      <text
        className="tick"
        transform={`translate(${cx - (width * scale) / 2 - 6} ${cy}) rotate(-90)`}
        textAnchor="middle"
      >
        {fmt(-height / 2)} … {fmt(height / 2)} {unit}
      </text>
    </svg>
  );
}
