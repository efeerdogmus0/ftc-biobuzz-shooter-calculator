import { Component, useMemo, useState, type ReactNode } from "react";
import {
  Crosshair,
  Play,
  Pause,
  RotateCcw,
  Download,
  Upload,
  Save,
  Plus,
  Hexagon,
  SlidersHorizontal,
  Activity,
  Box,
  FlaskConical,
  Sun,
  Moon,
} from "lucide-react";
import { FieldScene } from "../scene/FieldScene";
import { useStore, type CameraView } from "../state/store";
import { simulate } from "../physics/flight";
import { toDeg } from "../utils/units";
import { presets } from "../presets";
import { parseConfig, downloadJSON } from "../utils/config";
import type { Config } from "../physics/types";
import {
  ShooterControls,
  PhysicsControls,
  FieldControls,
} from "../components/Controls";
import { AnalysisPanel } from "../components/AnalysisPanel";
import { Telemetry, Metrics, CrossSection } from "../components/Telemetry";
import { PhysicsModel } from "../components/PhysicsModel";
import { useAnalysis } from "./useAnalysis";
class SceneBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    return this.state.error ? (
      <div className="scene-error">
        <h2>3D viewport could not load</h2>
        <p>{this.state.error}</p>
        <p>
          Check WebGL support or remove an invalid imported GLB, then reload.
        </p>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  const s = useStore(),
    c = s.config,
    a = useAnalysis();
  const [tab, setTab] = useState("Shooter"),
    [bottom, setBottom] = useState("Flight telemetry"),
    [modal, setModal] = useState(""),
    [notification, setNotification] = useState(""),
    [profiles, setProfiles] = useState<Config[]>(() => {
      try {
        return (
          JSON.parse(
            localStorage.getItem("pollen-profiles") ?? "[]",
          ) as unknown[]
        ).map(parseConfig);
      } catch {
        return [];
      }
    });
  const result = useMemo(() => {
    try {
      return { shot: simulate(c), error: "" };
    } catch (e) {
      return { shot: null, error: String(e) };
    }
  }, [c]);
  const shot = result.shot;
  const tell = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(""), 5000);
  };
  const save = (duplicate = false) => {
    try {
      const q = structuredClone(c);
      if (duplicate) q.name = `${q.name} · copy ${profiles.length + 1}`;
      const next = [...profiles.filter((p) => p.name !== q.name), q];
      localStorage.setItem("pollen-profiles", JSON.stringify(next));
      setProfiles(next);
      if (duplicate) s.setConfig(q);
      tell("Profile saved locally.");
    } catch (e) {
      tell(`Save failed: ${e}`);
    }
  };
  if (!shot)
    return (
      <main className="scene-error">
        <h1>Configuration cannot be simulated</h1>
        <p>{result.error}</p>
        <button onClick={() => s.setConfig(structuredClone(presets[0]))}>
          Restore current robot preset
        </button>
      </main>
    );
  const distance = Math.hypot(
    c.field.target.center[0] - shot.origin[0],
    c.field.target.center[1] - shot.origin[1],
  );
  const badge = c.calibrated
    ? "Experimentally calibrated"
    : c.shooter.mode === "recalc"
      ? "ReCalc-calibrated"
      : "Uncalibrated";
  return (
    <div className={`app ${s.theme}`}>
      <header>
        <div className="brand">
          <Hexagon size={27} />
          <div>
            POLLEN<span>SHOOTER LAB</span>
          </div>
          <small>01 / DIGITAL TWIN</small>
        </div>
        <div className="toolbar">
          <select
            aria-label="Robot preset"
            value=""
            onChange={(e) => {
              const [type, i] = e.target.value.split(":");
              s.setConfig(
                structuredClone(
                  type === "preset" ? presets[Number(i)] : profiles[Number(i)],
                ),
              );
              tell("Profile loaded.");
            }}
          >
            <option value="" disabled>
              {c.name}
            </option>
            <optgroup label="Design presets">
              {presets.map((p, i) => (
                <option key={i} value={`preset:${i}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
            {profiles.length > 0 && (
              <optgroup label="Saved profiles">
                {profiles.map((p, i) => (
                  <option key={i} value={`saved:${i}`}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <button
            title="Save Profile"
            aria-label="Save Profile"
            onClick={() => save()}
          >
            <Save size={16} />
          </button>
          <button
            title="Duplicate Profile"
            aria-label="Duplicate Profile"
            onClick={() => save(true)}
          >
            <Plus size={16} />
          </button>
          <button
            title="Export JSON"
            aria-label="Export JSON"
            onClick={() => downloadJSON("pollen-profile.json", c)}
          >
            <Download size={16} />
          </button>
          <label className="icon-button" title="Import JSON">
            <Upload size={16} />
            <input
              aria-label="Import JSON profile"
              hidden
              type="file"
              accept=".json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f)
                  try {
                    s.setConfig(parseConfig(JSON.parse(await f.text())));
                    tell("Profile imported.");
                  } catch (error) {
                    tell(`Import rejected: ${error}`);
                  }
                e.target.value = "";
              }}
            />
          </label>
          <select
            aria-label="Units"
            value={s.units}
            onChange={(e) => s.set({ units: e.target.value as "FTC" | "SI" })}
          >
            <option value="FTC">FTC units</option>
            <option value="SI">SI units</option>
          </select>
          <button
            aria-label="Toggle theme"
            onClick={() =>
              s.set({ theme: s.theme === "dark" ? "light" : "dark" })
            }
          >
            {s.theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>
      <div className="workspace-bar">
        <div>
          <span className="live-dot" /> LIVE WORKSPACE{" "}
          <span className="slash">/</span>
          <span>BIOBUZZ 2026–27</span>
        </div>
        <div>
          <span className={`badge ${c.calibrated ? "green" : ""}`}>
            {badge}
          </span>
          <button className="text-button" onClick={() => setModal("physics")}>
            Physics model ↗
          </button>
        </div>
      </div>
      <main className="workspace">
        <section className="main-column">
          <div className="viewport">
            <SceneBoundary>
              <FieldScene shot={shot} />
            </SceneBoundary>
            <div className="view-heading">
              <span>FIELD VIEW</span>
              <h1>Every shot, understood.</h1>
              <p>Drag the robot to explore your shooting envelope.</p>
            </div>
            <div className="camera-controls">
              {(
                ["Orbit", "Top", "Side", "Shooter", "Target"] as CameraView[]
              ).map((view) => (
                <button
                  key={view}
                  className={s.view === view ? "active" : ""}
                  onClick={() => s.set({ view })}
                >
                  {view}
                </button>
              ))}
              <button
                title="Reset Camera"
                aria-label="Reset Camera"
                onClick={() => s.set({ cameraReset: s.cameraReset + 1 })}
              >
                <RotateCcw size={14} />
              </button>
            </div>
            <div className="field-status">
              <span
                className={`status ${shot.flight.status === "HIT" ? "hit" : ""}`}
              >
                {shot.flight.status === "HIT" ? "●" : "○"} {shot.flight.status}
              </span>
              <span>{distance.toFixed(2)} m to target</span>
              <span>Exit {(shot.origin[2] * 1000).toFixed(0)} mm</span>
            </div>
            <div className="view-footer">
              <span>XY floor · Z up · 1 scene unit = 1 m</span>
              <span>COMPETITION HIVE · DEPLOYED 30° · BLUE ACTIVE CELL</span>
            </div>
            <div className="shot-controls">
              <button className="primary" onClick={() => s.fire(shot)}>
                <Crosshair size={16} /> Fire shot
              </button>
              <button
                aria-label={s.playing ? "Pause shot" : "Play shot"}
                onClick={() => s.set({ playing: !s.playing })}
              >
                {s.playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button
                aria-label="Reset shot animation"
                onClick={() =>
                  s.set({ playReset: s.playReset + 1, playing: false })
                }
              >
                <RotateCcw size={15} />
              </button>
              <select
                aria-label="Playback speed"
                value={s.playSpeed}
                onChange={(e) => s.set({ playSpeed: Number(e.target.value) })}
              >
                {[0.25, 0.5, 1, 2].map((v) => (
                  <option key={v} value={v}>
                    {v}×
                  </option>
                ))}
              </select>
              <button
                onClick={() => s.set({ showTrajectory: !s.showTrajectory })}
              >
                {s.showTrajectory ? "Hide" : "Show"} trajectory
              </button>
              <button
                className="solve-button"
                disabled={!!a.busy}
                onClick={() => {
                  setTab("Analysis");
                  a.run("solve");
                }}
              >
                Auto solve ↗
              </button>
            </div>
          </div>
          <div className="headline-metrics">
            {[
              ["Launch velocity", shot.shooter.speed.toFixed(2), "m/s"],
              [
                "Launch angle",
                toDeg(c.shooter.hoodAngle + c.shooter.hoodOffset).toFixed(1),
                "°",
              ],
              ["Apex height", shot.flight.apex.p[2].toFixed(2), "m"],
              [
                "Ball energy",
                (shot.shooter.energy + shot.shooter.rotationalEnergy).toFixed(
                  3,
                ),
                "J",
              ],
              [
                "Target clearance",
                shot.flight.entry
                  ? (shot.flight.entry.clearance * 1000).toFixed(1)
                  : "—",
                "mm",
              ],
            ].map(([label, value, unit]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>
                  {value}
                  <small>{unit}</small>
                </strong>
              </div>
            ))}
          </div>
          <div className="bottom-panel">
            <nav>
              {[
                "Flight telemetry",
                "Shot metrics",
                "Shooter section",
                "Shot history",
                "Debug state",
              ].map((v) => (
                <button
                  key={v}
                  className={bottom === v ? "active" : ""}
                  onClick={() => setBottom(v)}
                >
                  {v}
                  {v === "Shot history" && s.history.length > 0
                    ? ` (${s.history.length})`
                    : ""}
                </button>
              ))}
            </nav>
            <div className="bottom-content">
              {bottom === "Flight telemetry" ? (
                <Telemetry shot={shot} />
              ) : bottom === "Shot metrics" ? (
                <Metrics shot={shot} />
              ) : bottom === "Shooter section" ? (
                <CrossSection shot={shot} />
              ) : bottom === "Debug state" ? (
                <>
                  <button
                    onClick={() =>
                      downloadJSON("selected-shot-debug.json", shot)
                    }
                  >
                    Export complete shot state
                  </button>
                  <pre>{JSON.stringify(shot, null, 2)}</pre>
                </>
              ) : (
                <>
                  <div className="button-row">
                    <span className="muted">
                      Select a recorded shot to restore its configuration.
                    </span>
                    <button onClick={() => s.set({ history: [] })}>
                      Clear All Shots
                    </button>
                  </div>
                  {s.history.length === 0 && (
                    <p className="empty-state">
                      Your next experiment starts with a shot. Press Fire to
                      record it.
                    </p>
                  )}
                  {s.history.map((h, i) => (
                    <button
                      className="history-row"
                      key={h.id}
                      onClick={() =>
                        s.setConfig(structuredClone(h.shot.config))
                      }
                    >
                      <span>SHOT {String(i + 1).padStart(2, "0")}</span>
                      <b>{h.shot.shooter.speed.toFixed(2)} m/s</b>
                      <span>
                        {toDeg(h.shot.config.shooter.hoodAngle).toFixed(1)}°
                      </span>
                      <span>{h.shot.flight.status}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </section>
        <aside>
          <nav className="tabs">
            {[
              ["Shooter", SlidersHorizontal],
              ["Physics", Activity],
              ["Field", Box],
              ["Analysis", FlaskConical],
            ].map(([name, Icon]) => {
              const I = Icon as typeof Activity;
              return (
                <button
                  key={String(name)}
                  className={tab === name ? "active" : ""}
                  onClick={() => setTab(String(name))}
                >
                  <I size={17} />
                  {String(name)}
                </button>
              );
            })}
          </nav>
          <div className="controls-scroll">
            {tab === "Shooter" ? (
              <ShooterControls shot={shot} />
            ) : tab === "Physics" ? (
              <PhysicsControls />
            ) : tab === "Field" ? (
              <FieldControls />
            ) : (
              <AnalysisPanel a={a} />
            )}
          </div>
          <div className="model-status">
            <span className="live-dot" /> RK45 · deterministic · SI core{" "}
            <small>{shot.flight.samples.length} integration samples</small>
          </div>
        </aside>
      </main>
      <footer>
        <span>POLLEN / ENGINEERING WORKSPACE</span>
        <span>
          {shot.shooter.speed > c.simulation.maxSpeed
            ? "⚠ Exit speed exceeds design limit"
            : (shot.shooter.warnings[0] ??
              "Physical coefficients require measured-shot calibration.")}
        </span>
        <button className="text-button" onClick={() => setModal("physics")}>
          Model assumptions ↗
        </button>
      </footer>
      {notification && (
        <div className="toast" role="status">
          {notification}
        </div>
      )}
      {modal && (
        <div className="modal-scrim" onClick={() => setModal("")}>
          <div
            className="modal"
            role="dialog"
            aria-label="Physics Model"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close Physics Model"
              onClick={() => setModal("")}
            >
              ✕
            </button>
            <PhysicsModel />
          </div>
        </div>
      )}
    </div>
  );
}
