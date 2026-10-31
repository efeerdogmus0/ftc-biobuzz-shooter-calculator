import { useEffect, useRef, useState } from "react";
import { NumberInput as N, Section } from "./Inputs";
import { useStore } from "../state/store";
import {
  recommended,
  type PositionStudy,
  type StudyOptions,
} from "../physics/shotStudy";
import { deg, toDeg } from "../utils/units";
import { downloadJSON } from "../utils/config";
import type { Config } from "../physics/types";
import { ballModelSettings } from "../physics/launchDynamics";

interface Report {
  config: Config;
  options: StudyOptions;
  results: PositionStudy[];
}

export function AngleStudyPanel() {
  const c = useStore((s) => s.config);
  const settings = useStore((s) => s.bounceSettings);
  const [spacing, setSpacing] = useState(0.5);
  const [step, setStep] = useState(deg(2.5));
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  const cancel = () => {
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
  };
  const run = () => {
    cancel();
    setError("");
    setReport(null);
    setBusy(true);
    setProgress("Preparing field grid…");
    const config = structuredClone(c);
    const min = c.shooter.hoodMin + c.shooter.hoodOffset;
    const max = c.shooter.hoodMax + c.shooter.hoodOffset;
    const angles = Array.from(
      { length: Math.floor((max - min) / step + 1e-9) + 1 },
      (_, i) => min + i * step,
    );
    if (angles.at(-1)! < max - 1e-9) angles.push(max);
    const options: StudyOptions = {
      spacing,
      angles,
      speedMin: 1,
      speedMax: c.simulation.maxSpeed,
      speedTolerance: 0.01,
      extendedHive: true,
      bounceSettings: structuredClone(settings),
    };
    const job = new Worker(
      new URL("../workers/study.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = job;
    job.onmessage = (event) => {
      if (worker.current !== job) return;
      const message = event.data;
      if (message.type === "progress")
        setProgress(`${message.done} / ${message.total} field positions`);
      if (message.type === "result") {
        setReport({ config, options, results: message.results });
        cancel();
      }
      if (message.type === "error") {
        setError(message.message);
        cancel();
      }
    };
    job.onerror = (event) => {
      if (worker.current === job) {
        setError(event.message);
        cancel();
      }
    };
    job.postMessage({ config, options });
  };
  const reachable = report?.results.filter((p) => p.windows.length).length ?? 0;
  const stale =
    report &&
    (JSON.stringify(c) !== JSON.stringify(report.config) ||
      JSON.stringify(ballModelSettings(settings)) !==
        JSON.stringify(ballModelSettings(report.options.bounceSettings)));
  return (
    <Section title="Shot angle study" open>
      <p className="tool-intro">
        Scan the field for entry angles and exit-speed windows using the active
        shooter and target. The target is fixed during this study; bounce,
        resident balls and retention are evaluated in the main simulation.
      </p>
      <div className="tool-toolbar">
        <N
          label="Study grid spacing"
          kind="length"
          value={spacing}
          onChange={setSpacing}
          min={0.2}
          max={1.5}
          slider={false}
        />
        <N
          label="Study angle step"
          kind="angle"
          value={step}
          onChange={setStep}
          min={deg(2.5)}
          max={deg(10)}
          slider={false}
        />
        <button className="primary" disabled={busy} onClick={run}>
          Run angle study
        </button>
        {busy && <button onClick={cancel}>Cancel study</button>}
        {report && (
          <button
            onClick={() =>
              downloadJSON("shot-angle-study.json", {
                ...report,
                assumptions: [
                  "Uncalibrated fixed-target entry study",
                  "No bounce, residents or retention",
                  "Finite grid and prescribed exit speeds; automatic spin/speed ratio",
                ],
              })
            }
          >
            Export angle study
          </button>
        )}
      </div>
      {busy && <p role="status">{progress}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {stale && (
        <p className="notice">
          Shooter settings changed. Run again to update these results.
        </p>
      )}
      {report && (
        <>
          <p role="status" className="study-summary">
            <strong>
              {reachable} / {report.results.length}
            </strong>{" "}
            sampled positions have an entry window within{" "}
            {report.options.speedMax.toFixed(1)} m/s. Finite sampling can miss
            narrow windows.
          </p>
          <div className="study-layout">
            <svg
              className="study-map"
              viewBox="-2 -2 4 4"
              aria-label="Angle study field map"
            >
              <rect
                x={-c.field.size / 2}
                y={-c.field.size / 2}
                width={c.field.size}
                height={c.field.size}
                fill="none"
                stroke="var(--border)"
                strokeWidth={0.015}
              />
              {report.results.map((p) => (
                <circle
                  key={`${p.x},${p.y}`}
                  cx={p.x}
                  cy={-p.y}
                  r={report.options.spacing * 0.22}
                  fill={p.windows.length ? "var(--accent)" : "var(--border)"}
                >
                  <title>{`X ${p.x.toFixed(2)}, Y ${p.y.toFixed(2)}: ${p.windows.length ? "entry window" : "no sampled entry"}`}</title>
                </circle>
              ))}
            </svg>
            <div className="reference-table">
              <table aria-label="Angle study results">
                <thead>
                  <tr>
                    <th>X / Y (m)</th>
                    <th>Candidate angle</th>
                    <th>Exit speed (m/s)</th>
                  </tr>
                </thead>
                <tbody>
                  {report.results.map((p) => {
                    const best = recommended(p, report.options.speedMax);
                    return (
                      <tr key={`${p.x},${p.y}`}>
                        <td>
                          {p.x.toFixed(2)} / {p.y.toFixed(2)}
                        </td>
                        <td>
                          {best ? `${toDeg(best.angle).toFixed(1)}°` : "—"}
                        </td>
                        <td>
                          {best
                            ? `${best.lo.toFixed(2)}–${best.hi.toFixed(2)}`
                            : "No window"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <p className="muted">
        Exit speeds are prescribed within the design limit, with spin scaled
        from the shooter. Candidate angles compare speed tolerance and a 1° hood
        error where adjacent angle samples are available; otherwise only speed
        tolerance is compared. It does not establish an achievable motor RPM or
        scoring probability. Study method contributed by Tuna / FTC #25577
        Zağanos.
      </p>
    </Section>
  );
}
