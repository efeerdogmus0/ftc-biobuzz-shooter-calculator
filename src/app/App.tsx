import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Crosshair,
  Play,
  Pause,
  RotateCcw,
  Download,
  Upload,
  Save,
  CopyPlus,
  Hexagon,
  SlidersHorizontal,
  Activity,
  Box,
  FlaskConical,
  Sun,
  Moon,
  Wand2,
  X,
  Spline,
} from "lucide-react";
import { FieldScene } from "../scene/FieldScene";
import { useStore, loadProfiles, type CameraView } from "../state/store";
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
import { useAnalysis, jobLabels } from "./useAnalysis";
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
const bottomTabs = [
  "Flight telemetry",
  "Shot metrics",
  "Shooter section",
  "Shot history",
  "Debug state",
];
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
        return loadProfiles(localStorage.getItem("pollen-profiles"));
      } catch {
        return [];
      }
    });
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    document.documentElement.dataset.theme = s.theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", s.theme === "dark" ? "#151c21" : "#ffffff");
  }, [s.theme]);
  useEffect(() => {
    if (!modal) return;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setModal("");
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [modal]);
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
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setNotification(""), 5000);
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
  const hit = shot.flight.status === "HIT";
  const warning =
    shot.shooter.speed > c.simulation.maxSpeed
      ? "Exit speed exceeds the solver's design limit."
      : shot.shooter.warnings[0];
  return (
    <div className={`app ${s.theme}`}>
      <header className="topbar">
        <div className="brand">
          <Hexagon size={22} aria-hidden />
          <span className="brand-name">POLLEN</span>
          <span className="brand-sub">Shooter Lab · BIOBUZZ 2026–27</span>
        </div>
        <div className="profile-bar">
          <select
            aria-label="Robot preset"
            title="Load a preset or saved profile"
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
            <optgroup label="Presets">
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
          <div className="btn-group" role="group" aria-label="Profile">
            <button
              className="icon"
              title="Save profile"
              aria-label="Save Profile"
              onClick={() => save()}
            >
              <Save size={16} />
            </button>
            <button
              className="icon"
              title="Duplicate profile"
              aria-label="Duplicate Profile"
              onClick={() => save(true)}
            >
              <CopyPlus size={16} />
            </button>
            <button
              className="icon"
              title="Export profile JSON"
              aria-label="Export JSON"
              onClick={() => downloadJSON("pollen-profile.json", c)}
            >
              <Download size={16} />
            </button>
            <label className="icon-button" title="Import profile JSON">
              <Upload size={16} />
              <input
                aria-label="Import JSON profile"
                className="sr-only"
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
          </div>
        </div>
        <div className="header-end">
          <span
            className={`badge ${c.calibrated ? "green" : ""}`}
            title="Calibration state of the active model"
          >
            {badge}
          </span>
          <button className="text-button" onClick={() => setModal("physics")}>
            Physics model
          </button>
          <select
            aria-label="Units"
            title="Display units"
            value={s.units}
            onChange={(e) => s.set({ units: e.target.value as "FTC" | "SI" })}
          >
            <option value="FTC">FTC units</option>
            <option value="SI">SI units</option>
          </select>
          <button
            className="icon"
            aria-label="Toggle theme"
            title={s.theme === "dark" ? "Light theme" : "Dark theme"}
            onClick={() =>
              s.set({ theme: s.theme === "dark" ? "light" : "dark" })
            }
          >
            {s.theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>
      <main className="workspace">
        <section className="main-column">
          <div className="viewport">
            <SceneBoundary>
              <FieldScene shot={shot} />
            </SceneBoundary>
            <div className="viewport-overlay overlay-top">
              <div className="field-status" aria-live="polite">
                <span className={`status ${hit ? "hit" : ""}`}>
                  {shot.flight.status}
                </span>
                <span className="status-detail">
                  {distance.toFixed(2)} m to target · exit{" "}
                  {(shot.origin[2] * 1000).toFixed(0)} mm
                </span>
              </div>
              {a.busy && (
                <div className="job-chip" aria-live="polite">
                  <span>
                    {jobLabels[a.busy] ?? a.busy}{" "}
                    {(a.progress * 100).toFixed(0)}%
                  </span>
                  <progress max={1} value={a.progress} />
                  <button
                    className="icon"
                    aria-label="Cancel job"
                    title="Cancel job"
                    onClick={a.cancel}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              <div
                className="segmented camera-controls"
                role="group"
                aria-label="Camera"
              >
                {(
                  ["Orbit", "Top", "Side", "Shooter", "Target"] as CameraView[]
                ).map((view) => (
                  <button
                    key={view}
                    className={s.view === view ? "active" : ""}
                    aria-pressed={s.view === view}
                    onClick={() =>
                      s.set({ view, cameraReset: s.cameraReset + 1 })
                    }
                  >
                    {view}
                  </button>
                ))}
                <button
                  title="Reset camera"
                  aria-label="Reset Camera"
                  onClick={() => s.set({ cameraReset: s.cameraReset + 1 })}
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            </div>
            <div className="viewport-overlay overlay-bottom">
              <div className="shot-controls">
                <button className="primary" onClick={() => s.fire(shot)}>
                  <Crosshair size={16} /> Fire shot
                </button>
                <button
                  className="secondary"
                  disabled={!!a.busy}
                  title="Search hood angle + RPM for this pose (opens Analysis)"
                  onClick={() => {
                    setTab("Analysis");
                    a.run("solve");
                  }}
                >
                  <Wand2 size={15} />
                  {a.busy === "solve" ? "Solving…" : "Auto solve"}
                </button>
                <div
                  className="segmented playback"
                  role="group"
                  aria-label="Shot playback"
                >
                  <button
                    aria-label={s.playing ? "Pause shot" : "Play shot"}
                    title={s.playing ? "Pause" : "Play"}
                    onClick={() => s.set({ playing: !s.playing })}
                  >
                    {s.playing ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                  <button
                    aria-label="Reset shot animation"
                    title="Restart animation"
                    onClick={() =>
                      s.set({ playReset: s.playReset + 1, playing: false })
                    }
                  >
                    <RotateCcw size={14} />
                  </button>
                  <select
                    aria-label="Playback speed"
                    value={s.playSpeed}
                    onChange={(e) =>
                      s.set({ playSpeed: Number(e.target.value) })
                    }
                  >
                    {[0.25, 0.5, 1, 2].map((v) => (
                      <option key={v} value={v}>
                        {v}×
                      </option>
                    ))}
                  </select>
                  <button
                    aria-pressed={s.showTrajectory}
                    title="Show / hide trajectory"
                    onClick={() => s.set({ showTrajectory: !s.showTrajectory })}
                  >
                    <Spline size={15} /> Trajectory
                  </button>
                </div>
              </div>
              <p className="view-hint">
                Drag robot to move · drag field to orbit · scroll to zoom · Z
                up, 1 unit = 1 m
              </p>
            </div>
          </div>
          <div className="results">
            <div className="headline-metrics">
              {[
                ["Launch speed", shot.shooter.speed.toFixed(2), "m/s"],
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
                  "Entry clearance",
                  shot.flight.entry
                    ? (shot.flight.entry.clearance * 1000).toFixed(1)
                    : "—",
                  shot.flight.entry ? "mm" : "",
                ],
                [
                  "Flight time",
                  (shot.flight.entry?.t ?? shot.flight.impact?.t)?.toFixed(2) ??
                    "—",
                  "s",
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
            {warning && <p className="model-warning">⚠ {warning}</p>}
          </div>
          <div className="bottom-panel">
            <nav className="panel-tabs" aria-label="Result views">
              {bottomTabs.map((v) => (
                <button
                  key={v}
                  className={bottom === v ? "active" : ""}
                  aria-pressed={bottom === v}
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
                  <div className="panel-toolbar">
                    <span>
                      RK45 · SI · {shot.flight.samples.length} integration
                      samples
                    </span>
                    <button
                      className="push"
                      onClick={() =>
                        downloadJSON("selected-shot-debug.json", shot)
                      }
                    >
                      <Download size={14} /> Export complete shot state
                    </button>
                  </div>
                  <pre>{JSON.stringify(shot, null, 2)}</pre>
                </>
              ) : (
                <>
                  <div className="panel-toolbar">
                    <span>
                      Select a recorded shot to restore its configuration.
                    </span>
                    <button
                      className="push"
                      disabled={s.history.length === 0}
                      onClick={() => s.set({ history: [] })}
                    >
                      Clear all shots
                    </button>
                  </div>
                  {s.history.length === 0 && (
                    <p className="empty-state">
                      No shots recorded yet. Press <b>Fire shot</b> to store the
                      current configuration and trajectory.
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
                      <span>Shot {String(i + 1).padStart(2, "0")}</span>
                      <b>{h.shot.shooter.speed.toFixed(2)} m/s</b>
                      <span>
                        {toDeg(h.shot.config.shooter.hoodAngle).toFixed(1)}°
                      </span>
                      <span
                        className={h.shot.flight.status === "HIT" ? "hit" : ""}
                      >
                        {h.shot.flight.status}
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </section>
        <aside aria-label="Settings">
          <nav className="tabs" aria-label="Settings sections">
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
                  aria-pressed={tab === name}
                  onClick={() => setTab(String(name))}
                >
                  <I size={16} aria-hidden />
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
        </aside>
      </main>
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
            aria-modal="true"
            aria-label="Physics Model"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              ref={closeButton}
              className="modal-close"
              aria-label="Close Physics Model"
              onClick={() => setModal("")}
            >
              <X size={16} />
            </button>
            <PhysicsModel />
          </div>
        </div>
      )}
    </div>
  );
}
