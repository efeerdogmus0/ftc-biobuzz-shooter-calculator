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
  Hexagon,
  SlidersHorizontal,
  Activity,
  Box,
  FlaskConical,
  Sun,
  Moon,
  FilePlus2,
  FolderOpen,
  Copy,
  PanelLeft,
  Maximize2,
  Minimize2,
  Settings2,
  X,
  Square,
  Link2,
} from "lucide-react";
import { useCalibrationBadge } from "./useCalibrationBadge";
import { decodeShare, encodeShare, isShareHash } from "../utils/share";
import {
  WorkbenchMenu,
  ModelTree,
  TrajectoryTable,
  PanelTitle,
} from "../components/Workbench";
import { FieldScene } from "../scene/FieldScene";
import { useStore, type CameraView } from "../state/store";
import { useBounceSimulation } from "./useBounceSimulation";
import { BounceControls } from "../components/BounceControls";
import { usePreviewSimulation } from "./usePreviewSimulation";
import {
  ballModelSettings,
  shotKineticEnergy,
  type BallModelSettings,
} from "../physics/launchDynamics";
import { toDeg } from "../utils/units";
import { presets } from "../presets";
import { downloadJSON } from "../utils/config";
import {
  captureScenario,
  defaultScenario,
  parseScenario,
  loadScenarios,
  type Scenario,
} from "../utils/scenario";
import {
  ShooterControls,
  PhysicsControls,
  FieldControls,
} from "../components/Controls";
import { AnalysisPanel } from "../components/AnalysisPanel";
import { Telemetry, Metrics, CrossSection } from "../components/Telemetry";
import { PhysicsModel } from "../components/PhysicsModel";
import { ClearancePanel } from "../components/ClearancePanel";
import { LegacyData } from "../components/LegacyData";
import { AngleStudyPanel } from "../components/AngleStudyPanel";
import { useAnalysis } from "./useAnalysis";
class SceneBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  retry = (removeCAD: boolean) => {
    if (removeCAD) {
      const url = useStore.getState().cadURL;
      if (url) URL.revokeObjectURL(url);
      useStore.getState().set({ cadURL: null });
    }
    this.setState({ error: "" });
  };
  render() {
    return this.state.error ? (
      <div className="scene-error" role="alert">
        <h2>3D viewport could not load</h2>
        <p>{this.state.error}</p>
        <p>Check WebGL support or remove an invalid imported GLB.</p>
        <div className="actions">
          {useStore.getState().cadURL && (
            <button onClick={() => this.retry(true)}>
              Remove imported CAD and retry
            </button>
          )}
          <button onClick={() => this.retry(false)}>Retry 3D view</button>
        </div>
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
  const importRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [modelVisible, setModelVisible] = useState(true),
    [propertiesVisible, setPropertiesVisible] = useState(true),
    [telemetryVisible, setTelemetryVisible] = useState(true),
    [focusScene, setFocusScene] = useState(false),
    [sceneTab, setSceneTab] = useState("3D View");
  const [tab, setTab] = useState("Shooter"),
    [bottom, setBottom] = useState("Flight telemetry"),
    [modal, setModal] = useState(""),
    [notification, setNotification] = useState(""),
    [profiles, setProfiles] = useState<Scenario[]>(() => {
      try {
        return loadScenarios(localStorage.getItem("pollen-profiles"));
      } catch {
        return [];
      }
    });
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>("button")?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModal("");
      if (event.key !== "Tab" || !dialog) return;
      const nodes = [
        ...dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], summary",
        ),
      ].filter((node) => node.getClientRects().length);
      const first = nodes[0],
        last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("keydown", keys);
      previous?.focus();
    };
  }, [modal]);
  const modelJSON = JSON.stringify(ballModelSettings(s.bounceSettings));
  const model = useMemo(
    () => JSON.parse(modelJSON) as BallModelSettings,
    [modelJSON],
  );
  const result = usePreviewSimulation({ config: c, model });
  const calibrationBadge = useCalibrationBadge(c, model, s.calibration);
  useEffect(() => {
    if (!isShareHash(location.hash)) return;
    const hash = location.hash;
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    decodeShare(hash).then(
      (scenario) => {
        useStore.getState().setScenario(scenario);
        setNotification("Shared scenario loaded.");
      },
      (e) =>
        setNotification(
          `Shared link ignored: ${e instanceof Error ? e.message : e}`,
        ),
    );
  }, []);
  const shot = useBounceSimulation(
    result.shot,
    s.bounceEnabled,
    s.bounceSettings,
    s.residentCount,
    s.residentLayout,
    s.manualResidents,
  );
  const tell = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(""), 5000);
  };
  const share = async () => {
    try {
      const url = `${location.origin}${location.pathname}${location.search}${await encodeShare(s)}`;
      await navigator.clipboard.writeText(url);
      tell(`Share link copied (${url.length} characters).`);
    } catch (e) {
      tell(`Share failed: ${e instanceof Error ? e.message : e}`);
    }
  };
  const save = (duplicate = false) => {
    try {
      const q = captureScenario(s);
      if (duplicate)
        q.config.name = `${q.config.name} · copy ${profiles.length + 1}`;
      const next = [
        ...profiles.filter((p) => p.config.name !== q.config.name),
        q,
      ];
      localStorage.setItem("pollen-profiles", JSON.stringify(next));
      setProfiles(next);
      if (duplicate) s.setScenario(q);
      tell("Profile saved locally.");
    } catch (e) {
      tell(`Save failed: ${e}`);
    }
  };
  if (!shot)
    return (
      <main
        className="scene-error"
        aria-busy={!result.error}
        role={result.error ? "alert" : "status"}
      >
        <h1>
          {result.error
            ? "Configuration cannot be simulated"
            : "Computing preview…"}
        </h1>
        <p>
          {result.error ||
            "The shot is simulated in a background worker. If this takes long, the active scenario may be expensive; you can recover without losing saved profiles."}
        </p>
        <div className="actions">
          <button
            onClick={() =>
              downloadJSON("pollen-active.json", captureScenario(s))
            }
          >
            Export active scenario JSON
          </button>
          <button onClick={() => s.setScenario(defaultScenario(presets[0]))}>
            Restore current robot preset
          </button>
        </div>
        {profiles.length > 0 && (
          <>
            <h2>Open a saved profile</h2>
            <div className="actions">
              {profiles.map((p) => (
                <button key={p.config.name} onClick={() => s.setScenario(p)}>
                  {p.config.name}
                </button>
              ))}
            </div>
          </>
        )}
      </main>
    );
  const distance = Math.hypot(
    c.field.target.center[0] - shot.origin[0],
    c.field.target.center[1] - shot.origin[1],
  );
  const fallbackBadge =
    c.shooter.mode === "recalc" ? "ReCalc-calibrated" : "Uncalibrated";
  const fitValidated =
    calibrationBadge.kind === "verified" && calibrationBadge.result.passed;
  const badge =
    calibrationBadge.kind === "verified"
      ? fitValidated
        ? `Measured fit validated · ${calibrationBadge.result.validationCount} held-out re-verified`
        : `Measured fit not validated · ${fallbackBadge}`
      : calibrationBadge.kind === "verifying"
        ? "Verifying measured fit…"
        : calibrationBadge.kind === "stale"
          ? `Measurements were for other settings · ${fallbackBadge}`
          : calibrationBadge.kind === "error"
            ? `Calibration check failed · ${fallbackBadge}`
            : fallbackBadge;
  const chooseTab = (name: string) => {
    setTab(name);
    setPropertiesVisible(true);
    if (name === "Sekiş") s.set({ bounceEnabled: true, showTrajectory: true });
  };
  const chooseView = (view: CameraView) => {
    setSceneTab("3D View");
    s.set({ view, cameraReset: s.cameraReset + 1 });
  };
  const toggleBounce = () => {
    const enabled = !s.bounceEnabled;
    setTab(enabled ? "Sekiş" : "Shooter");
    setPropertiesVisible(true);
    s.set({
      bounceEnabled: enabled,
      playing: false,
      playReset: s.playReset + 1,
      showTrajectory: true,
    });
  };
  const cannotPlay =
    result.stale ||
    !shot.shooter.exited ||
    s.bounceBusy ||
    !!shot.flight.bounceError;
  const play = () =>
    !cannotPlay &&
    s.set(
      !s.playing && s.playbackTime >= shot.flight.samples.at(-1)!.t - 0.01
        ? { playing: true, playReset: s.playReset + 1 }
        : { playing: !s.playing },
    );
  const resetPlayback = () =>
    s.set({ playReset: s.playReset + 1, playing: false });
  const solve = () => {
    chooseTab("Analysis");
    a.run("solve");
  };
  const focus = () => setFocusScene(!focusScene);
  const warnings =
    shot.shooter.speed > c.simulation.maxSpeed
      ? "Exit speed exceeds design limit"
      : shot.shooter.warnings[0];
  const menus = [
    {
      label: "File",
      items: [
        {
          label: "New model",
          run: () => s.setScenario(defaultScenario(presets[0])),
        },
        { label: "Open profile…", run: () => importRef.current?.click() },
        { label: "Save profile", run: () => save() },
        {
          label: "Export profile…",
          run: () => downloadJSON("pollen-profile.json", captureScenario(s)),
        },
        { label: "Copy share link", run: share },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Duplicate profile", run: () => save(true) },
        { label: "Shooter properties", run: () => chooseTab("Shooter") },
        { label: "Physics parameters", run: () => chooseTab("Physics") },
      ],
    },
    {
      label: "View",
      items: [
        {
          label: "Model explorer",
          checked: modelVisible,
          run: () => setModelVisible(!modelVisible),
        },
        {
          label: "Properties",
          checked: propertiesVisible,
          run: () => setPropertiesVisible(!propertiesVisible),
        },
        {
          label: "Telemetry",
          checked: telemetryVisible,
          run: () => setTelemetryVisible(!telemetryVisible),
        },
        { label: "Focus 3D view", checked: focusScene, run: focus },
        {
          label: "Reset camera",
          run: () => s.set({ cameraReset: s.cameraReset + 1 }),
        },
      ],
    },
    {
      label: "Simulation",
      items: [
        { label: "Fire shot", disabled: cannotPlay, run: () => s.fire(shot) },
        {
          label: s.playing ? "Pause" : "Play",
          disabled: cannotPlay,
          run: play,
        },
        { label: "Reset playback", run: resetPlayback },
        {
          label: "Bounce simulation",
          checked: s.bounceEnabled,
          run: toggleBounce,
        },
      ],
    },
    {
      label: "Tools",
      items: [
        { label: "Auto solve", disabled: !!a.busy, run: solve },
        { label: "Analysis", run: () => chooseTab("Analysis") },
        { label: "Shooter clearance…", run: () => setModal("clearance") },
        { label: "Shot angle study…", run: () => setModal("study") },
        { label: "DECODE reference data…", run: () => setModal("legacy") },
        {
          label: "Export shot data…",
          run: () => downloadJSON("selected-shot-debug.json", shot),
        },
      ],
    },
    {
      label: "Help",
      items: [
        {
          label: "Physics model & assumptions",
          run: () => setModal("physics"),
        },
      ],
    },
  ];
  return (
    <div
      className={`app workbench ${s.theme} ${focusScene ? "focus-scene" : ""}`}
    >
      <div className="app-menubar">
        <div className="brand">
          <Hexagon size={19} />
          <span>POLLEN SHOOTER</span>
        </div>
        <WorkbenchMenu menus={menus} />
        <span className="project-title">BIOBUZZ 2026–27</span>
      </div>
      <header className="app-toolbar">
        <div className="toolbar">
          <button
            title="New model"
            aria-label="New model"
            onClick={() => s.setScenario(defaultScenario(presets[0]))}
          >
            <FilePlus2 size={17} />
          </button>
          <button
            title="Open profile"
            aria-label="Open profile"
            onClick={() => importRef.current?.click()}
          >
            <FolderOpen size={17} />
          </button>
          <select
            aria-label="Robot preset"
            value=""
            onChange={(e) => {
              const [type, i] = e.target.value.split(":");
              if (type === "preset")
                s.setScenario(defaultScenario(presets[Number(i)]));
              else s.setScenario(profiles[Number(i)]);
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
                    {p.config.name}
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
            <Copy size={16} />
          </button>
          <button
            title="Export JSON"
            aria-label="Export JSON"
            onClick={() =>
              downloadJSON("pollen-profile.json", captureScenario(s))
            }
          >
            <Download size={16} />
          </button>
          <button
            title="Copy share link"
            aria-label="Copy share link"
            onClick={share}
          >
            <Link2 size={16} />
          </button>
          <label className="icon-button import-button" title="Import JSON">
            <Upload size={16} />
            <input
              ref={importRef}
              aria-label="Import JSON profile"
              hidden
              type="file"
              accept=".json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f)
                  try {
                    s.setScenario(parseScenario(JSON.parse(await f.text())));
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

        <div className="workspace-tools">
          <button
            aria-label="Toggle model explorer"
            title="Model explorer"
            className={modelVisible ? "active" : ""}
            onClick={() => setModelVisible(!modelVisible)}
          >
            <PanelLeft size={17} />
          </button>
          <button
            aria-label="Show properties"
            title="Properties"
            onClick={() => setPropertiesVisible(!propertiesVisible)}
          >
            <Settings2 size={17} />
          </button>
          <span className="toolbar-divider" />
          <button
            aria-label={focusScene ? "Restore workspace" : "Focus 3D view"}
            title={focusScene ? "Restore workspace" : "Focus 3D view"}
            onClick={focus}
          >
            {focusScene ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
        </div>
      </header>
      <main
        className={`workspace ${!modelVisible ? "no-model" : ""} ${!propertiesVisible ? "no-properties" : ""} ${!telemetryVisible ? "no-telemetry" : ""}`}
      >
        {modelVisible && (
          <ModelTree
            shot={shot}
            tab={tab}
            select={chooseTab}
            view={chooseView}
            bottom={(name) => {
              setBottom(name);
              setTelemetryVisible(true);
            }}
          />
        )}
        <section
          className="main-column dock-panel"
          aria-label="Simulation viewport"
        >
          <nav className="scene-tabs" aria-label="Viewport tabs">
            {["3D View", "Shooter section"].map((name) => (
              <button
                key={name}
                className={sceneTab === name ? "active" : ""}
                onClick={() => setSceneTab(name)}
              >
                {name}
              </button>
            ))}
            <span className="scene-document">{c.name}</span>
          </nav>
          <div className="viewport">
            <div
              className={`scene-canvas ${sceneTab !== "3D View" ? "hidden" : ""}`}
            >
              <SceneBoundary>
                <FieldScene shot={shot} />
              </SceneBoundary>
            </div>
            {sceneTab === "Shooter section" ? (
              <div className="section-viewport">
                <CrossSection shot={shot} />
              </div>
            ) : (
              <>
                {result.error ? (
                  <div
                    className="physics-compute-overlay preview-failed"
                    role="alert"
                  >
                    Preview failed for the edited configuration: {result.error}{" "}
                    · showing the last good result (Fire/Play disabled)
                  </div>
                ) : result.pending ? (
                  <div
                    className="physics-compute-overlay preview-pending"
                    role="status"
                  >
                    Computing preview for the edited configuration · showing the
                    previous result
                  </div>
                ) : (
                  s.bounceEnabled &&
                  s.bounceBusy && (
                    <div className="physics-compute-overlay" role="status">
                      {s.bounceProgress || "Calculating…"}
                    </div>
                  )
                )}
                <div className="viewport-readout">
                  <div>
                    <span>Apex</span>
                    <b>{shot.flight.apex.p[2].toFixed(2)} m</b>
                  </div>
                  <div>
                    <span>Range to target</span>
                    <b>{distance.toFixed(2)} m</b>
                  </div>
                  <div>
                    <span>Exit height</span>
                    <b>{(shot.origin[2] * 1000).toFixed(0)} mm</b>
                  </div>
                </div>
                <div
                  className="camera-controls"
                  role="group"
                  aria-label="Camera views"
                >
                  {(
                    [
                      "Orbit",
                      "Top",
                      "Side",
                      "Shooter",
                      "Target",
                      "HIVE",
                    ] as CameraView[]
                  ).map((view) => (
                    <button
                      key={view}
                      aria-pressed={s.view === view}
                      className={s.view === view ? "active" : ""}
                      onClick={() => chooseView(view)}
                    >
                      {view}
                    </button>
                  ))}
                  <button
                    title="Reset Camera"
                    aria-label="Reset Camera"
                    onClick={() => s.set({ cameraReset: s.cameraReset + 1 })}
                  >
                    <RotateCcw size={13} />
                  </button>
                </div>
                <div className="viewport-caption">
                  <span
                    className={
                      shot.flight.status === "HIT" ? "status hit" : "status"
                    }
                  >
                    {shot.flight.status}
                  </span>
                  {s.bounceEnabled && <span>Static target reference</span>}
                  <span>Drag robot to position · Scroll to zoom</span>
                </div>
              </>
            )}
          </div>
          <div className="shot-controls">
            <button
              className="primary"
              disabled={cannotPlay}
              onClick={() => s.fire(shot)}
            >
              <Play size={13} fill="currentColor" />
              Fire shot
            </button>
            <button
              title="Stop and reset"
              aria-label="Reset shot animation"
              onClick={resetPlayback}
            >
              <Square size={11} fill="currentColor" />
            </button>
            <button
              disabled={cannotPlay}
              aria-label={s.playing ? "Pause shot" : "Play shot"}
              onClick={play}
            >
              {s.playing ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <button
              aria-label="Replay shot"
              title="Replay shot"
              disabled={cannotPlay}
              onClick={() =>
                s.set({ playReset: s.playReset + 1, playing: true })
              }
            >
              <RotateCcw size={14} />
            </button>
            <select
              aria-label="Playback speed"
              value={s.playSpeed}
              onChange={(e) => s.set({ playSpeed: Number(e.target.value) })}
            >
              {[0.1, 0.25, 0.5, 1, 2].map((v) => (
                <option key={v} value={v}>
                  {v}×
                </option>
              ))}
            </select>
            <label className="trajectory-toggle">
              <input
                type="checkbox"
                checked={s.showTrajectory}
                onChange={(e) => s.set({ showTrajectory: e.target.checked })}
              />
              Show trajectory
            </label>
            <label className="bounce-toggle">
              <input
                type="checkbox"
                aria-label="Sekiş simülasyonu"
                checked={s.bounceEnabled}
                onChange={toggleBounce}
              />
              Sekiş
            </label>
            <button
              className="solve-button"
              disabled={!!a.busy}
              onClick={solve}
            >
              <Crosshair size={13} />
              Auto solve
            </button>
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
                shotKineticEnergy(shot, shot.flight.samples[0]).toFixed(3),
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
        </section>
        {telemetryVisible && (
          <div className="bottom-panel">
            <nav>
              {[
                "Flight telemetry",
                "Shot metrics",
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
              <button
                className="dock-close"
                aria-label="Close telemetry"
                title="Close telemetry"
                onClick={() => setTelemetryVisible(false)}
              >
                <X size={13} />
              </button>
            </nav>
            <div className="bottom-content">
              {bottom === "Flight telemetry" ? (
                <div className="telemetry-workspace">
                  <Telemetry shot={shot} />
                  <TrajectoryTable shot={shot} />
                </div>
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
                      Select a recorded shot to restore its complete scenario.
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
                        s.setScenario(
                          h.scenario ?? defaultScenario(h.shot.config),
                        )
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
        )}
        {propertiesVisible && (
          <aside className="properties dock-panel" aria-label="Properties">
            <PanelTitle
              label="Hide properties"
              close={() => setPropertiesVisible(false)}
            >
              Properties
            </PanelTitle>
            <nav className="tabs" aria-label="Properties tabs">
              {[
                ["Shooter", SlidersHorizontal],
                ["Physics", Activity],
                ["Field", Box],
                ["Analysis", FlaskConical],
                ["Sekiş", Crosshair],
              ].map(([name, Icon]) => {
                const I = Icon as typeof Activity;
                return (
                  <button
                    key={String(name)}
                    className={tab === name ? "active" : ""}
                    onClick={() => {
                      chooseTab(String(name));
                    }}
                  >
                    <I size={13} />
                    {String(name)}
                  </button>
                );
              })}
            </nav>
            <div
              className={`controls-scroll ${tab === "Sekiş" ? "bounce-scroll" : ""}`}
            >
              {tab === "Sekiş" ? (
                <BounceControls shot={shot} />
              ) : tab === "Shooter" ? (
                <ShooterControls shot={shot} />
              ) : tab === "Physics" ? (
                <PhysicsControls />
              ) : tab === "Field" ? (
                <FieldControls />
              ) : (
                <AnalysisPanel a={a} openTool={setModal} />
              )}
            </div>
            <div className="model-status">
              <span>
                {s.bounceEnabled
                  ? s.bounceSettings.contactModel === "hertz"
                    ? "Esnek temas · SI"
                    : "Rijit temas · SI"
                  : "RK45 · SI"}
              </span>{" "}
              <small>{shot.flight.samples.length} integration samples</small>
            </div>
          </aside>
        )}
      </main>
      <footer className="statusbar">
        <span className="ready-status">
          {result.error
            ? "Preview failed · last good result shown"
            : result.pending
              ? "Computing preview… (previous result shown)"
              : s.bounceBusy
                ? s.bounceProgress
                : a.busy
                  ? "Analysis running…"
                  : "Ready"}
        </span>
        {warnings && (
          <button
            className="model-warning"
            title={warnings}
            onClick={() => setModal("physics")}
          >
            Model assumptions
          </button>
        )}
        <span
          className={`calibration-status ${fitValidated ? "calibrated" : ""}`}
        >
          {badge}
        </span>
        <span>
          {s.bounceEnabled
            ? s.bounceSettings.contactModel === "hertz"
              ? "Hertz contact"
              : "Rigid contact"
            : "Physical contact model"}
        </span>
        <span>{s.units === "FTC" ? "FTC units" : "SI units"}</span>
        <span className="coordinate-status">
          X: {c.robot.x.toFixed(2)}&nbsp;&nbsp; Y: {c.robot.y.toFixed(2)}
          &nbsp;&nbsp; Z: {shot.origin[2].toFixed(2)} m
        </span>
      </footer>
      {notification && (
        <div className="toast" role="status">
          {notification}
        </div>
      )}
      {modal && (
        <div className="modal-scrim" onClick={() => setModal("")}>
          <div
            ref={dialogRef}
            className={`modal ${modal === "physics" ? "" : "tool-modal"}`}
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "physics"
                ? "Physics Model"
                : modal === "clearance"
                  ? "Shooter clearance"
                  : modal === "study"
                    ? "Shot angle study"
                    : "DECODE reference data"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label={
                modal === "physics" ? "Close Physics Model" : "Close tool"
              }
              onClick={() => setModal("")}
            >
              ✕
            </button>
            {modal === "physics" ? (
              <PhysicsModel />
            ) : modal === "clearance" ? (
              <ClearancePanel />
            ) : modal === "study" ? (
              <AngleStudyPanel />
            ) : (
              <LegacyData />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
