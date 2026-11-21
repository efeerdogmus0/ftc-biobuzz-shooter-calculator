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
  ScanEye,
  CircleHelp,
} from "lucide-react";
import { useCalibrationBadge } from "./useCalibrationBadge";
import { ProbotBrand, ProbotNav } from "../components/ProbotBrand";
import { bottomTabsFor, propertyTabsFor, uiModes } from "./uiMode";
import { decodeShare, encodeShare, isShareHash } from "../utils/share";
import {
  WorkbenchMenu,
  ModelTree,
  TrajectoryTable,
  PanelTitle,
} from "../components/Workbench";
import { FieldScene } from "../scene/FieldScene";
import { startupNotices, useStore, type CameraView } from "../state/store";
import { upgradeCalibration } from "../physics/analysis";
import { useBounceSimulation } from "./useBounceSimulation";
import { BounceControls } from "../components/BounceControls";
import { usePreviewSimulation } from "./usePreviewSimulation";
import {
  ballModelSettings,
  shotKineticEnergy,
  type BallModelSettings,
} from "../physics/launchDynamics";
import { toDeg } from "../utils/units";
import type { Config } from "../physics/types";
import { downloadJSON, parseConfig } from "../utils/config";
import {
  captureScenario,
  defaultScenario,
  exampleScenario,
  parseScenario,
  loadScenarios,
  referenceEntries,
  referenceScenario,
  scenarioFromSpec,
  type Scenario,
} from "../utils/scenario";
import {
  applySpecChanges,
  buildRobot,
  type RobotSpec,
} from "../presets/factory";
import { currentSpec, originLabel } from "../components/RobotSetup";
import { Onboarding, type SetupExtras } from "../components/Onboarding";
import { Tour, tourSeen } from "../components/Tour";
import {
  AccountButton,
  MyRobotsDialog,
  SignInDialog,
} from "../components/Account";
import { AccountError } from "../services";
import { useAccount } from "../services/accountStore";
import { useT } from "../i18n/useT";
import { translate } from "../i18n";
import { JourneyRail } from "../components/JourneyRail";
import { RobotStage } from "../components/stages/RobotStage";
import { ShotStage } from "../components/stages/ShotStage";
import { FieldStage } from "../components/stages/FieldStage";
import { TrustStage, reliabilityOf } from "../components/stages/TrustStage";
import { ExportStage } from "../components/stages/ExportStage";
import { StageNext } from "../components/stages/StageNext";
import { hasPlan, stages, stageStatus, type StageId } from "./journey";
import { LimelightPanel } from "../components/LimelightPanel";
import AutoPlannerEntry from "./autoPlannerEntry";
import { useVisionMap } from "./useVisionMap";
import { applyRecalcExtras, looksLikeRecalc } from "../utils/recalc";
import {
  ShooterControls,
  PhysicsControls,
  FieldControls,
} from "../components/Controls";
import {
  AnalysisPanel,
  applyCandidate,
  candidatesMatch,
} from "../components/AnalysisPanel";
import { Telemetry, Metrics, CrossSection } from "../components/Telemetry";
import { PhysicsModel } from "../components/PhysicsModel";
import { ClearancePanel } from "../components/ClearancePanel";
import { LegacyData } from "../components/LegacyData";
import { placed } from "./shotPoints";
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
        <h2>{translate("3D viewport could not load")}</h2>
        <p>{this.state.error}</p>
        <p>
          {translate("Check WebGL support or remove an invalid imported GLB.")}
        </p>
        <div className="actions">
          {useStore.getState().cadURL && (
            <button onClick={() => this.retry(true)}>
              {translate("Remove imported CAD and retry")}
            </button>
          )}
          <button onClick={() => this.retry(false)}>
            {translate("Retry 3D view")}
          </button>
        </div>
      </div>
    ) : (
      this.props.children
    );
  }
}
/** Camera views offered in the simple layout. */
const cameraBasics: CameraView[] = ["Orbit", "Top", "Side"];

export default function App() {
  const s = useStore(),
    c = s.config,
    a = useAnalysis();
  useVisionMap();
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
    [recalcText, setRecalcText] = useState(""),
    [afterSignIn, setAfterSignIn] = useState<(() => void) | null>(null),
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
  const t = useT();
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Simple layout: Auto solve puts the best setting on the robot by itself.
  const autoApply = useRef<"idle" | "armed" | "running">("idle");
  useEffect(() => {
    if (autoApply.current === "armed" && a.busy === "solve")
      autoApply.current = "running";
    else if (autoApply.current === "running" && !a.busy) {
      autoApply.current = "idle";
      const best = a.candidates[0];
      if (
        best &&
        candidatesMatch(a.candidateConfig, useStore.getState().config)
      )
        applyCandidate(a, best);
    }
    // Only the search finishing triggers this.
  }, [a.busy]);
  const account = useAccount();
  useEffect(() => {
    void useAccount.getState().init();
  }, []);
  // Modes hide controls only; they never edit the scenario.
  const propertyTabs: readonly string[] = propertyTabsFor(s.uiMode);
  const activeTab = propertyTabs.includes(tab) ? tab : propertyTabs[0];
  const bottomTabs = bottomTabsFor(s.uiMode);
  const activeBottom =
    bottomTabs.includes(bottom) || bottom === "Shooter section"
      ? bottom
      : bottomTabs[0];
  const calibrationBadge = useCalibrationBadge(c, model, s.calibration);
  // Files saved before the pose-free stamp: upgrade once while the old stamp still matches.
  useEffect(() => {
    if (!s.calibration?.stamp.startsWith("v1-")) return;
    const next = upgradeCalibration(c, model, s.calibration);
    if (next !== s.calibration) s.set({ calibration: next });
  }, [c, model, s]);
  const measured =
    calibrationBadge.kind === "verified"
      ? calibrationBadge.result.passed
        ? "verified"
        : "failed"
      : calibrationBadge.kind === "stale"
        ? "stale"
        : "none";
  useEffect(() => {
    if (useStore.getState().measured !== measured) s.set({ measured });
  }, [measured, s]);
  useEffect(() => {
    if (startupNotices.length)
      setNotification(startupNotices.map((n) => translate(n)).join(" "));
  }, []);
  useEffect(() => {
    if (!isShareHash(location.hash)) return;
    const hash = location.hash;
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    decodeShare(hash).then(
      (scenario) => {
        useStore.getState().setScenario(scenario);
        setNotification(translate("Shared scenario loaded."));
      },
      (e) =>
        setNotification(
          `${translate("Shared link ignored")}: ${e instanceof Error ? e.message : e}`,
        ),
    );
  }, []);
  // A ReCalc link pasted anywhere outside a text field opens the import screen.
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (!looksLikeRecalc(text)) return;
      const st = useStore.getState();
      if (st.setupOpen === "recalc" || (!st.setupOpen && st.needsStart)) return; // the start screens handle their own paste
      setRecalcText(text);
      st.set({ setupOpen: "recalc" });
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
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
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setNotification(""), 5000);
  };
  const share = async () => {
    try {
      const url = `${location.origin}${location.pathname}${location.search}${await encodeShare(s)}`;
      await navigator.clipboard.writeText(url);
      tell(t.f("Share link copied ({n} characters).", { n: url.length }));
    } catch (e) {
      tell(`${t("Share failed")}: ${e instanceof Error ? e.message : e}`);
    }
  };
  const openSetup = () => s.set({ setupOpen: "new" });
  const openStart = () => s.set({ setupOpen: "home" });
  const openExample = () => {
    s.setScenario(exampleScenario());
    tell(t("Genel örnek açıldı · ölçülmemiş başlangıç noktası."));
  };
  const openSandbox = (spec: RobotSpec) => {
    try {
      s.setScenario(
        parseScenario(
          JSON.parse(
            JSON.stringify({
              ...defaultScenario(buildRobot(spec)),
              origin: { kind: "example", source: "Sandbox", spec },
            }),
          ),
        ),
      );
      tell(t("Sandbox: örnek robot sahada · ölçülmemiş."));
    } catch (e) {
      tell(`${t("Örnek açılamadı")}: ${e instanceof Error ? e.message : e}`);
    }
  };
  // Every commit is validated before it touches the active project; an
  // invalid draft only produces a message and keeps the setup open.
  const withMotor = (config: Config, motor?: SetupExtras["motor"]) => {
    if (!motor) return config;
    const q = structuredClone(config);
    q.shooter.motor = { ...q.shooter.motor, ...motor };
    return q;
  };
  const createRobot = (spec: RobotSpec, extras: SetupExtras) => {
    try {
      const base = scenarioFromSpec(spec);
      if (extras.recalc) {
        base.config = applyRecalcExtras(base.config, extras.recalc);
        base.origin = { kind: "user", source: "ReCalc'tan aktarıldı", spec };
      }
      base.config = withMotor(base.config, extras.motor);
      if (extras.chassis) {
        base.config.robot.length = extras.chassis.length;
        base.config.robot.width = extras.chassis.width;
        base.chassis = {
          drive: extras.chassis.drive,
          turret: extras.chassis.turret,
        };
      }
      s.setScenario(parseScenario(JSON.parse(JSON.stringify(base))));
      // Started from the auto planner: go back to it with the new shooter.
      if (s.autoReturn)
        s.set({ setupOpen: null, autoOpen: true, autoReturn: false });
      else {
        // New robot: straight to the journey. Motor still open → Robot step.
        s.set({
          setupOpen: null,
          stage: extras.motorLater ? "robot" : "shot",
          motorExplore: !!extras.motorLater,
        });
        tell(
          t(
            extras.motorLater
              ? "Robot hazır. Motor ve dişli oranlarını sağdaki panelde karşılaştırabilirsin."
              : "Robot hazır. Şimdi Otomatik çöz'e bas.",
          ),
        );
      }
    } catch (e) {
      tell(
        `${t("Robot oluşturulamadı, mevcut robot değişmedi")}: ${e instanceof Error ? e.message : e}`,
      );
    }
  };
  const applyEdit = (
    before: RobotSpec,
    after: RobotSpec,
    extras: SetupExtras,
  ) => {
    try {
      const next = parseConfig(
        JSON.parse(
          JSON.stringify(
            withMotor(applySpecChanges(s.config, before, after), extras.motor),
          ),
        ),
      );
      if (extras.chassis) {
        next.robot.length = extras.chassis.length;
        next.robot.width = extras.chassis.width;
        s.set({
          chassis: {
            drive: extras.chassis.drive,
            turret: extras.chassis.turret,
          },
        });
      }
      s.setConfig(next);
      // The live config is authoritative; drop any creation-time spec copy.
      if (s.origin?.spec) {
        const { spec: _drop, ...rest } = s.origin;
        void _drop;
        s.set({ origin: rest });
      }
      s.set({
        setupOpen: null,
        ...(extras.motorLater ? { motorExplore: true } : {}),
      });
      tell(t("Kurulum uygulandı."));
    } catch (e) {
      tell(
        `${t("Kurulum uygulanamadı, mevcut robot değişmedi")}: ${e instanceof Error ? e.message : e}`,
      );
    }
  };
  const save = (duplicate = false) => {
    try {
      const q = captureScenario(s);
      // Saving an example/reference copy makes it the user's own robot; the
      // source stays recorded.
      if (q.origin && q.origin.kind !== "user") {
        q.origin = {
          kind: "user",
          source: `${q.origin.source ?? originLabel(q.origin)} temel alındı`,
          ...(q.origin.spec ? { spec: q.origin.spec } : {}),
        };
        s.set({ origin: q.origin });
      }
      if (duplicate)
        q.config.name = `${q.config.name} · copy ${profiles.length + 1}`;
      const next = [
        ...profiles.filter((p) => p.config.name !== q.config.name),
        q,
      ];
      localStorage.setItem("pollen-profiles", JSON.stringify(next));
      setProfiles(next);
      if (duplicate) s.setScenario(q);
      tell(t("Profile saved locally."));
    } catch (e) {
      tell(`${t("Save failed")}: ${e}`);
    }
  };
  // Account save: updates the open account robot, or creates one. Signed out:
  // the sign-in dialog opens and the save continues after signing in.
  const saveToAccount = async (asNew = false) => {
    if (!useAccount.getState().session) {
      setAfterSignIn(() => () => void saveToAccount(asNew));
      setModal("signin");
      return;
    }
    try {
      const outcome = await useAccount
        .getState()
        .save(captureScenario(useStore.getState()), asNew);
      tell(
        t(
          outcome === "updated"
            ? "Hesabındaki robot güncellendi."
            : "Robot hesabına kaydedildi.",
        ),
      );
    } catch (e) {
      if (e instanceof AccountError && e.code === "CONFLICT")
        tell(
          t(
            "Bu robot başka bir sekmede değiştirilmiş. Üzerine yazılmadı; Hesabımdaki robotlar → Kopya olarak kaydet.",
          ),
        );
      else
        tell(`${t("Kaydedilemedi")}: ${e instanceof Error ? t(e.message) : e}`);
    }
  };
  const openFromAccount = async (id: string) => {
    try {
      const { accountId, accountVersion, ...scenario } = await useAccount
        .getState()
        .load(id);
      s.setScenario(parseScenario(scenario));
      useAccount.getState().attach(accountId, accountVersion);
      setModal("");
      tell(t("Robot hesabından açıldı."));
    } catch (e) {
      tell(`${t("Açılamadı")}: ${e instanceof Error ? t(e.message) : e}`);
    }
  };
  const simple = s.uiMode === "simple";
  const screen = s.setupOpen ?? (s.needsStart ? "home" : null);
  // The tour runs once, the first time the simple workbench is on screen.
  const [tour, setTour] = useState(false);
  const atWorkbench = simple && !screen && !s.autoOpen;
  const stage: StageId = s.autoOpen ? "auto" : s.stage;
  const goStage = (id: StageId) =>
    id === "auto"
      ? s.set({ autoOpen: true })
      : s.set({ autoOpen: false, stage: id });
  useEffect(() => {
    if (atWorkbench && !tourSeen()) setTour(true);
  }, [atWorkbench]);
  const startTour = () => {
    s.setUiMode("simple");
    s.set({ autoOpen: false, stage: "shot" });
    setTour(true);
  };
  const fileInput = (
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
            tell(t("Profil açıldı."));
          } catch (error) {
            tell(`${t("Dosya açılamadı")}: ${error}`);
          }
        e.target.value = "";
      }}
    />
  );
  const siteHeader = (
    <header className="site-header">
      <ProbotBrand />
      <ProbotNav />
      <AccountButton
        onSignIn={() => setModal("signin")}
        onRobots={() => setModal("robots")}
      />
    </header>
  );
  const accountModal = (modal === "signin" || modal === "robots") && (
    <div className="modal-scrim" onClick={() => setModal("")}>
      <div
        ref={dialogRef}
        className="modal account-modal"
        role="dialog"
        aria-modal="true"
        aria-label={
          modal === "signin" ? t("Giriş yap") : t("Hesabımdaki robotlar")
        }
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close"
          aria-label={t("Kapat")}
          onClick={() => setModal("")}
        >
          ✕
        </button>
        {modal === "signin" ? (
          <SignInDialog
            onCancel={() => {
              setAfterSignIn(null);
              setModal("");
            }}
            onDone={() => {
              setModal("");
              tell(t("Giriş yapıldı."));
              const next = afterSignIn;
              setAfterSignIn(null);
              next?.();
            }}
          />
        ) : (
          <MyRobotsDialog
            currentName={c.name}
            onOpen={(id) => void openFromAccount(id)}
            onSaveCurrent={(asNew) => void saveToAccount(asNew)}
          />
        )}
      </div>
    </div>
  );
  const toast = notification && (
    <div className="toast" role="status">
      {notification}
    </div>
  );
  if (s.autoOpen && !s.setupOpen && !simple)
    return (
      <div className={`app onboarding-app ${s.theme}`}>
        {siteHeader}
        <AutoPlannerEntry onClose={() => s.set({ autoOpen: false })} />
        {toast}
      </div>
    );
  if (screen)
    return (
      <div className={`app onboarding-app ${s.theme}`}>
        {siteHeader}
        <Onboarding
          screen={screen}
          go={(next) => s.set({ setupOpen: next })}
          onClose={
            s.needsStart
              ? undefined
              : () =>
                  s.set({
                    setupOpen: null,
                    autoOpen: s.autoReturn,
                    autoReturn: false,
                  })
          }
          editSpec={screen === "edit" ? currentSpec() : null}
          chassis={{
            length: c.robot.length,
            width: c.robot.width,
            drive: s.chassis?.drive ?? "holonomic",
            turret: s.chassis?.turret ?? false,
          }}
          saved={profiles.map((p) => p.config.name)}
          onOpenSaved={(i) => {
            s.setScenario(profiles[i]);
            tell(t("Robot açıldı."));
          }}
          onFile={() => importRef.current?.click()}
          onSandbox={openSandbox}
          onTry={() => {
            s.setScenario(exampleScenario());
            s.setUiMode("simple");
          }}
          onCreate={createRobot}
          onApplyEdit={applyEdit}
          recalcText={recalcText}
          accountRobots={account.robots}
          signedIn={!!account.session}
          onOpenAccount={(id) => void openFromAccount(id)}
          onSignIn={() => setModal("signin")}
        />
        {fileInput}
        {toast}
        {accountModal}
      </div>
    );
  if (!shot)
    return (
      <main
        className="scene-error"
        aria-busy={!result.error}
        role={result.error ? "alert" : "status"}
      >
        <h1>
          {result.error
            ? t("Configuration cannot be simulated")
            : t("Computing preview…")}
        </h1>
        <p>
          {result.error ||
            t(
              "The shot is simulated in a background worker. If this takes long, the active scenario may be expensive; you can recover without losing saved profiles.",
            )}
        </p>
        <div className="actions">
          <button
            onClick={() =>
              downloadJSON("pollen-active.json", captureScenario(s))
            }
          >
            {t("Export active scenario JSON")}
          </button>
          <button onClick={() => s.setScenario(exampleScenario())}>
            {t("Genel örneği aç")}
          </button>
        </div>
        {profiles.length > 0 && (
          <>
            <h2>{t("Open a saved profile")}</h2>
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
  // Choosing a model never makes a robot measured; only re-verified held-out
  // measurements (below) can, for any model.
  const fallbackBadge =
    c.shooter.mode === "recalc"
      ? t("ReCalc modeli · ölçülmüş doğrulama değil")
      : t("Ölçümle doğrulanmadı");
  const fitValidated =
    calibrationBadge.kind === "verified" && calibrationBadge.result.passed;
  const badge =
    calibrationBadge.kind === "verified"
      ? fitValidated
        ? t.f("Measured fit validated · {n} held-out re-verified", {
            n: calibrationBadge.result.validationCount,
          })
        : `${t("Measured fit not validated")} · ${fallbackBadge}`
      : calibrationBadge.kind === "verifying"
        ? t("Verifying measured fit…")
        : calibrationBadge.kind === "stale"
          ? `${t("Measurements were for other settings")} · ${fallbackBadge}`
          : calibrationBadge.kind === "error"
            ? `${t("Calibration check failed")} · ${fallbackBadge}`
            : fallbackBadge;
  const stageInfo = stages.find((x) => x.id === stage) ?? stages[1];
  const status = stageStatus({
    ownRobot: s.origin?.kind === "user",
    hit: shot.flight.status === "HIT",
    mapped: s.coverage.length > 0,
    points: s.shotPoints.length,
    reliability: reliabilityOf(a, c),
    planned: hasPlan(),
    calibration:
      calibrationBadge.kind === "verified"
        ? fitValidated
          ? "verified"
          : "failed"
        : calibrationBadge.kind === "stale"
          ? "stale"
          : "none",
  });
  const chooseTab = (name: string) => {
    if (!propertyTabs.includes(name)) {
      // Never switch modes on the user's behalf; say where the tool lives.
      const needed = uiModes.find((m) => propertyTabsFor(m.id).includes(name));
      tell(
        t.f(
          "{name} ayarları {mode} içinde; üst çubuktaki arayüz düğmesinden açabilirsin.",
          { name: t(name), mode: t(needed?.label ?? "Gelişmiş arayüz") },
        ),
      );
      return;
    }
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
  // Nothing fires before the first-run choice (example / own robot / file).
  const cannotPlay =
    s.needsStart ||
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
    if (simple) autoApply.current = "armed";
    else chooseTab("Analysis");
    a.run("solve");
  };
  const focus = () => setFocusScene(!focusScene);
  const warnings =
    shot.shooter.speed > c.simulation.maxSpeed
      ? t("Exit speed exceeds design limit")
      : shot.shooter.warnings[0];
  const menus = [
    {
      label: t("Dosya"),
      items: [
        { label: t("Başlangıç ekranı…"), run: openStart },
        { label: t("Yeni robot kur…"), run: openSetup },
        {
          label: t("ReCalc'tan aktar…"),
          run: () => s.set({ setupOpen: "recalc" }),
        },
        {
          label: t("Sandbox örnekleri…"),
          run: () => s.set({ setupOpen: "sandbox" }),
        },
        { label: t("Genel örneği aç"), run: openExample },
        { label: t("Profil aç…"), run: () => importRef.current?.click() },
        { label: t("Hesabıma kaydet"), run: () => void saveToAccount() },
        { label: t("Hesabımdaki robotlar…"), run: () => setModal("robots") },
        { label: t("Bu tarayıcıya kaydet"), run: () => save() },
        {
          label: t("Profili dışa aktar…"),
          run: () => downloadJSON("pollen-profile.json", captureScenario(s)),
        },
        { label: t("Paylaşım bağlantısını kopyala"), run: share },
      ],
    },
    {
      label: t("Düzenle"),
      items: [
        { label: t("Profili çoğalt"), run: () => save(true) },
        { label: t("Shooter ayarları"), run: () => chooseTab("Shooter") },
        { label: t("Fizik parametreleri"), run: () => chooseTab("Physics") },
      ],
    },
    {
      label: t("Görünüm"),
      items: [
        {
          label: t("Model gezgini"),
          checked: modelVisible,
          run: () => setModelVisible(!modelVisible),
        },
        {
          label: t("Özellikler"),
          checked: propertiesVisible,
          run: () => setPropertiesVisible(!propertiesVisible),
        },
        {
          label: t("Telemetri"),
          checked: telemetryVisible,
          run: () => setTelemetryVisible(!telemetryVisible),
        },
        { label: t("3D görünüme odaklan"), checked: focusScene, run: focus },
        {
          label: t("Kamerayı sıfırla"),
          run: () => s.set({ cameraReset: s.cameraReset + 1 }),
        },
      ],
    },
    {
      label: t("Simülasyon"),
      items: [
        { label: t("Atış yap"), disabled: cannotPlay, run: () => s.fire(shot) },
        {
          label: t(s.playing ? "Duraklat" : "Oynat"),
          disabled: cannotPlay,
          run: play,
        },
        { label: t("Oynatmayı sıfırla"), run: resetPlayback },
        {
          label: t("Sekme simülasyonu"),
          checked: s.bounceEnabled,
          run: toggleBounce,
        },
      ],
    },
    {
      label: t("Araçlar"),
      items: [
        { label: t("Oto planlayıcı…"), run: () => s.set({ autoOpen: true }) },
        { label: t("Otomatik çöz"), disabled: !!a.busy, run: solve },
        { label: t("Analiz"), run: () => chooseTab("Analysis") },
        { label: t("Shooter açıklığı…"), run: () => setModal("clearance") },
        { label: t("Atış açısı çalışması…"), run: () => setModal("study") },
        ...(!simple
          ? [
              {
                label: t("Gelişmiş örnek: geçmiş sezon (DECODE) verisi…"),
                run: () => setModal("legacy"),
              },
            ]
          : []),
        {
          label: t("Atış verisini dışa aktar…"),
          run: () => downloadJSON("selected-shot-debug.json", shot),
        },
      ],
    },
    {
      label: t("Yardım"),
      items: [
        { label: t("Hızlı tur"), run: startTour },
        {
          label: t("Fizik modeli ve varsayımlar"),
          run: () => setModal("physics"),
        },
      ],
    },
  ];
  // Basit arayüz: one short menu instead of the menu bar and icon row.
  const moreMenu = [
    {
      label: t("Daha fazla"),
      items: [
        { label: t("Oto planlayıcı…"), run: () => s.set({ autoOpen: true }) },
        { label: t("Yeni robot kur…"), run: openSetup },
        { label: t("Başlangıç ekranı…"), run: openStart },
        { label: t("Dosyadan aç…"), run: () => importRef.current?.click() },
        {
          label: t("Profili dışa aktar…"),
          run: () => downloadJSON("pollen-profile.json", captureScenario(s)),
        },
        { label: t("Paylaşım bağlantısını kopyala"), run: share },
        {
          label: t(
            s.units === "FTC" ? "SI birimlerine geç" : "FTC birimlerine geç",
          ),
          run: () => s.set({ units: s.units === "FTC" ? "SI" : "FTC" }),
        },
        { label: t("Hızlı tur"), run: startTour },
        {
          label: t("Fizik modeli ve varsayımlar"),
          run: () => setModal("physics"),
        },
      ],
    },
  ];
  return (
    <div
      className={`app workbench ${simple ? "layout-simple" : "layout-advanced"} ${s.theme} ${focusScene ? "focus-scene" : ""}`}
    >
      {siteHeader}
      <div className="app-menubar">
        <WorkbenchMenu menus={menus} />
        <span className="project-title">
          {t("POLLEN Shooter · BIOBUZZ 2026–27")}
        </span>
      </div>
      <header className="app-toolbar">
        <div className="toolbar">
          <button
            title={t("Yeni robot kur")}
            aria-label="New model"
            onClick={openSetup}
          >
            <FilePlus2 size={17} />
          </button>
          <button
            className="tb-extra"
            title={t("Open profile")}
            aria-label="Open profile"
            onClick={() => importRef.current?.click()}
          >
            <FolderOpen size={17} />
          </button>
          <span
            className={`origin-chip ${s.origin?.kind ?? "user"}`}
            title={t(
              "Bu robot kimin? Robotum = senin; Örnek/Referans = ölçülmemiş kopya",
            )}
          >
            {t(originLabel(s.origin))}
          </span>
          <select
            aria-label="Robot"
            value=""
            onChange={(e) => {
              const [type, id] = e.target.value.split(":");
              if (type === "new") openSetup();
              else if (type === "recalc") s.set({ setupOpen: "recalc" });
              else if (type === "sandbox") s.set({ setupOpen: "sandbox" });
              else if (type === "example") openExample();
              else if (type === "file") importRef.current?.click();
              else if (type === "saved") {
                s.setScenario(profiles[Number(id)]);
                tell(t("Robot açıldı."));
              } else if (type === "ref") {
                s.setScenario(
                  referenceScenario(
                    id as (typeof referenceEntries)[number]["id"],
                  ),
                );
                tell(t("Referans kopyası açıldı; ölçülmüş değildir."));
              } else if (type === "decode") setModal("legacy");
            }}
          >
            <option value="" disabled>
              {t(c.name)}
            </option>
            <option value="new:">＋ {t("Yeni robot kur…")}</option>
            <option value="recalc:">{t("ReCalc'tan aktar…")}</option>
            <option value="sandbox:">{t("Sandbox örnekleri…")}</option>
            <option value="example:">{t("Genel örneği aç")}</option>
            <option value="file:">{t("Dosyadan aç…")}</option>
            {profiles.length > 0 && (
              <optgroup label={t("Bu tarayıcıdaki robotlarım")}>
                {profiles.map((p, i) => (
                  <option key={i} value={`saved:${i}`}>
                    {p.config.name}
                  </option>
                ))}
              </optgroup>
            )}
            {!simple && (
              <optgroup label={t("Gelişmiş örnekler (referans arşivi)")}>
                {referenceEntries.map((r) => (
                  <option key={r.id} value={`ref:${r.id}`}>
                    {t(r.label)}
                  </option>
                ))}
                <option value="decode:">
                  {t(
                    "Geçmiş sezon verisi · DECODE 2025–26 (BIOBUZZ'a uygulanmaz)",
                  )}
                </option>
              </optgroup>
            )}
          </select>
          <button
            title={
              account.session ? t("Hesabıma kaydet") : t("Bu tarayıcıya kaydet")
            }
            aria-label="Save Profile"
            onClick={() => {
              if (account.session) void saveToAccount();
              else {
                save();
                tell(
                  t(
                    "Bu tarayıcıya kaydedildi. Hesabına kaydetmek için sağ üstten giriş yap.",
                  ),
                );
              }
            }}
          >
            <Save size={16} />
            {simple && <span className="tb-label">{t("Kaydet")}</span>}
          </button>
          {simple && <WorkbenchMenu menus={moreMenu} />}
          <button
            className="tb-extra"
            title={t("Duplicate Profile")}
            aria-label="Duplicate Profile"
            onClick={() => save(true)}
          >
            <Copy size={16} />
          </button>
          <button
            className="tb-extra"
            title={t("Export JSON")}
            aria-label="Export JSON"
            onClick={() =>
              downloadJSON("pollen-profile.json", captureScenario(s))
            }
          >
            <Download size={16} />
          </button>
          <button
            className="tb-extra"
            title={t("Copy share link")}
            aria-label="Copy share link"
            onClick={share}
          >
            <Link2 size={16} />
          </button>
          <div className="mode-switch">
            <button
              role="switch"
              aria-checked={!simple}
              className={simple ? "" : "active"}
              title={t(
                "Uzman görünümü: model ağacı, telemetri, fizik ve hata ayıklama ile tam tezgâh. Ayarların korunur.",
              )}
              onClick={() => {
                s.setUiMode(simple ? "advanced" : "simple");
                if (simple && s.autoOpen) s.set({ autoOpen: false });
              }}
            >
              <SlidersHorizontal size={14} /> {t("Uzman görünümü")}
            </button>
          </div>
          <button
            title={t("Profil dosyası aç")}
            aria-label="Import JSON"
            onClick={() => importRef.current?.click()}
          >
            <Upload size={16} />
          </button>
          <select
            aria-label="Units"
            value={s.units}
            onChange={(e) => s.set({ units: e.target.value as "FTC" | "SI" })}
          >
            <option value="FTC">{t("FTC units")}</option>
            <option value="SI">{t("SI units")}</option>
          </select>
          {simple && (
            <button
              className="tour-open"
              title={t("Hızlı tur")}
              aria-label={t("Hızlı tur")}
              onClick={startTour}
            >
              <CircleHelp size={16} />
            </button>
          )}
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
            title={t("Model explorer")}
            className={modelVisible ? "active" : ""}
            onClick={() => setModelVisible(!modelVisible)}
          >
            <PanelLeft size={17} />
          </button>
          <button
            aria-label="Show properties"
            title={t("Properties")}
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
      {simple && <JourneyRail active={stage} status={status} go={goStage} />}
      {simple && s.autoOpen ? (
        <div className="stage-auto">
          <AutoPlannerEntry onClose={() => goStage("shot")} />
        </div>
      ) : (
        <main
          className={`workspace ${!modelVisible ? "no-model" : ""} ${!propertiesVisible ? "no-properties" : ""} ${!telemetryVisible ? "no-telemetry" : ""}`}
        >
          {!simple && modelVisible && (
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
            <nav
              className="scene-tabs"
              aria-label="Viewport tabs"
              hidden={simple || undefined}
            >
              {["3D View", "Shooter section"].map((name) => (
                <button
                  key={name}
                  className={sceneTab === name ? "active" : ""}
                  onClick={() => setSceneTab(name)}
                >
                  {t(name)}
                </button>
              ))}
              <span className="scene-document">{t(c.name)}</span>
            </nav>
            <div className="viewport">
              <div
                className={`scene-canvas ${sceneTab !== "3D View" && !simple ? "hidden" : ""}`}
              >
                <SceneBoundary>
                  <FieldScene shot={shot} />
                </SceneBoundary>
              </div>
              {sceneTab === "Shooter section" && !simple ? (
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
                      {t("Preview failed for the edited configuration")}:{" "}
                      {result.error} ·{" "}
                      {t("showing the last good result (Fire/Play disabled)")}
                    </div>
                  ) : result.pending ? (
                    <div
                      className="physics-compute-overlay preview-pending"
                      role="status"
                    >
                      {t(
                        "Computing preview for the edited configuration · showing the previous result",
                      )}
                    </div>
                  ) : (
                    s.bounceEnabled &&
                    s.bounceBusy && (
                      <div className="physics-compute-overlay" role="status">
                        {s.bounceProgress || t("Calculating…")}
                      </div>
                    )
                  )}
                  <div className="viewport-readout">
                    <div>
                      <span>{t("Apex")}</span>
                      <b>{shot.flight.apex.p[2].toFixed(2)} m</b>
                    </div>
                    <div>
                      <span>{t("Range to target")}</span>
                      <b>{distance.toFixed(2)} m</b>
                    </div>
                    <div>
                      <span>{t("Exit height")}</span>
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
                    )
                      .filter((view) => !simple || cameraBasics.includes(view))
                      .map((view) => (
                        <button
                          key={view}
                          aria-pressed={s.view === view}
                          className={s.view === view ? "active" : ""}
                          onClick={() => chooseView(view)}
                        >
                          {t(view)}
                        </button>
                      ))}
                    <button
                      title={t("Reset Camera")}
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
                      {t(shot.flight.status)}
                    </span>
                    {s.bounceEnabled && (
                      <span>{t("Static target reference")}</span>
                    )}
                    <span>{t("Drag robot to position · Scroll to zoom")}</span>
                  </div>
                </>
              )}
            </div>
            <div className="shot-controls">
              <button
                className="primary"
                aria-label="Fire shot"
                title={t("Atış yap (Fire shot)")}
                disabled={cannotPlay}
                onClick={() => s.fire(shot)}
              >
                <Play size={13} fill="currentColor" />
                {t("Atış yap")}
              </button>
              <button
                title={t("Stop and reset")}
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
                title={t("Replay shot")}
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
              <label
                className="trajectory-toggle"
                title={t("Yörüngeyi göster")}
              >
                <input
                  type="checkbox"
                  aria-label={t("Yörüngeyi göster")}
                  checked={s.showTrajectory}
                  onChange={(e) => s.set({ showTrajectory: e.target.checked })}
                />
                {t("Yörünge")}
              </label>
              <label className="bounce-toggle">
                <input
                  type="checkbox"
                  aria-label={t("Sekiş simülasyonu")}
                  checked={s.bounceEnabled}
                  onChange={toggleBounce}
                />
                {t("Sekiş")}
              </label>
              <button
                className="solve-button"
                disabled={!!a.busy}
                onClick={solve}
              >
                <Crosshair size={13} />
                {t("Otomatik çöz")}
              </button>
            </div>
            <div className="headline-metrics">
              {[
                [t("Launch velocity"), shot.shooter.speed.toFixed(2), "m/s"],
                [
                  t("Launch angle"),
                  toDeg(c.shooter.hoodAngle + c.shooter.hoodOffset).toFixed(1),
                  "°",
                ],
                [t("Apex height"), shot.flight.apex.p[2].toFixed(2), "m"],
                [
                  t("Ball energy"),
                  shotKineticEnergy(shot, shot.flight.samples[0]).toFixed(3),
                  "J",
                ],
                [
                  t("Target clearance"),
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
          {!simple && telemetryVisible && (
            <div className="bottom-panel">
              <nav>
                {bottomTabs.map((v) => (
                  <button
                    key={v}
                    className={activeBottom === v ? "active" : ""}
                    onClick={() => setBottom(v)}
                  >
                    {t(v)}
                    {v === "Shot history" && s.history.length > 0
                      ? ` (${s.history.length})`
                      : ""}
                  </button>
                ))}
                <button
                  className="dock-close"
                  aria-label="Close telemetry"
                  title={t("Close telemetry")}
                  onClick={() => setTelemetryVisible(false)}
                >
                  <X size={13} />
                </button>
              </nav>
              <div className="bottom-content">
                {activeBottom === "Flight telemetry" ? (
                  <div className="telemetry-workspace">
                    <Telemetry shot={shot} />
                    <TrajectoryTable shot={shot} />
                  </div>
                ) : activeBottom === "Shot metrics" ? (
                  <Metrics shot={shot} />
                ) : activeBottom === "Shooter section" ? (
                  <CrossSection shot={shot} />
                ) : activeBottom === "Debug state" ? (
                  <>
                    <button
                      onClick={() =>
                        downloadJSON("selected-shot-debug.json", shot)
                      }
                    >
                      {t("Export complete shot state")}
                    </button>
                    <pre>{JSON.stringify(shot, null, 2)}</pre>
                  </>
                ) : (
                  <>
                    <div className="button-row">
                      <span className="muted">
                        {t(
                          "Select a recorded shot to restore its complete scenario.",
                        )}
                      </span>
                      <button onClick={() => s.set({ history: [] })}>
                        {t("Clear All Shots")}
                      </button>
                    </div>
                    {s.history.length === 0 && (
                      <p className="empty-state">
                        {t(
                          "Your next experiment starts with a shot. Press Fire to record it.",
                        )}
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
                        <span>{t(h.shot.flight.status)}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
          {simple && (
            <aside
              className="properties dock-panel simple-side"
              aria-label={t(stageInfo.label)}
            >
              <PanelTitle label={t(stageInfo.question)}>
                {t(stageInfo.label)}
              </PanelTitle>
              <div className="controls-scroll" key={stage}>
                {stage === "robot" ? (
                  <RobotStage a={a} openTool={setModal} />
                ) : stage === "field" ? (
                  <FieldStage a={a} openTool={setModal} />
                ) : stage === "trust" ? (
                  <TrustStage a={a} shot={shot} />
                ) : stage === "export" ? (
                  <ExportStage
                    a={a}
                    badge={badge}
                    verified={fitValidated}
                    badgeState={calibrationBadge}
                    exportProfile={() =>
                      downloadJSON("pollen-profile.json", captureScenario(s))
                    }
                    share={share}
                  />
                ) : (
                  <ShotStage
                    shot={shot}
                    a={a}
                    distance={distance}
                    solve={solve}
                    stale={result.pending || result.stale}
                  />
                )}
                <StageNext stage={stage} go={goStage} />
              </div>
            </aside>
          )}
          {!simple && propertiesVisible && (
            <aside className="properties dock-panel" aria-label="Properties">
              <PanelTitle
                label={t("Hide properties")}
                close={() => setPropertiesVisible(false)}
              >
                {t("Properties")}
              </PanelTitle>
              <nav className="tabs" aria-label={t("Properties")}>
                {(
                  [
                    ["Shooter", SlidersHorizontal],
                    ["Physics", Activity],
                    ["Field", Box],
                    ["Analysis", FlaskConical],
                    ["Sekiş", Crosshair],
                    ["Limelight", ScanEye],
                  ] as const
                )
                  .filter(([name]) => propertyTabs.includes(name))
                  .map(([name, Icon]) => {
                    const I = Icon as typeof Activity;
                    return (
                      <button
                        key={String(name)}
                        className={activeTab === name ? "active" : ""}
                        aria-current={activeTab === name ? "page" : undefined}
                        onClick={(e) => {
                          chooseTab(String(name));
                          e.currentTarget.scrollIntoView({
                            block: "nearest",
                            inline: "nearest",
                          });
                        }}
                      >
                        <I size={13} />
                        {t(String(name))}
                      </button>
                    );
                  })}
              </nav>
              <div
                className={`controls-scroll ${activeTab === "Sekiş" ? "bounce-scroll" : ""}`}
              >
                {activeTab === "Sekiş" ? (
                  <BounceControls shot={shot} />
                ) : activeTab === "Limelight" ? (
                  <LimelightPanel />
                ) : activeTab === "Shooter" ? (
                  <ShooterControls shot={shot} />
                ) : activeTab === "Physics" ? (
                  <PhysicsControls />
                ) : activeTab === "Field" ? (
                  <FieldControls />
                ) : (
                  <AnalysisPanel a={a} openTool={setModal} />
                )}
              </div>
              <div className="model-status">
                <span>
                  {s.bounceEnabled
                    ? s.bounceSettings.contactModel === "hertz"
                      ? t("Esnek temas · SI")
                      : t("Rijit temas · SI")
                    : "RK45 · SI"}
                </span>{" "}
                <small>
                  {t.f("{n} integration samples", {
                    n: shot.flight.samples.length,
                  })}
                </small>
              </div>
            </aside>
          )}
        </main>
      )}
      <footer className="statusbar">
        <span className="ready-status">
          {result.error
            ? t("Preview failed · last good result shown")
            : result.pending
              ? t("Computing preview… (previous result shown)")
              : s.bounceBusy
                ? s.bounceProgress
                : a.busy
                  ? t("Analysis running…")
                  : t("Ready")}
        </span>
        {warnings && (
          <button
            className="model-warning"
            title={t(warnings)}
            onClick={() => setModal("physics")}
          >
            {t("Model assumptions")}
          </button>
        )}
        <button
          className={`calibration-status ${fitValidated ? "calibrated" : ""}`}
          title={t("Ölçülen atışlarla kalibrasyon")}
          onClick={() => (simple ? goStage("export") : chooseTab("Analysis"))}
        >
          {badge}
        </button>
        <span>
          {s.bounceEnabled
            ? s.bounceSettings.contactModel === "hertz"
              ? t("Hertz contact")
              : t("Rigid contact")
            : t("Physical contact model")}
        </span>
        <span>{t(s.units === "FTC" ? "FTC units" : "SI units")}</span>
        <span className="coordinate-status">
          X: {c.robot.x.toFixed(2)}&nbsp;&nbsp; Y: {c.robot.y.toFixed(2)}
          &nbsp;&nbsp; Z: {shot.origin[2].toFixed(2)} m
        </span>
      </footer>
      {toast}
      {tour && atWorkbench && !modal && <Tour onDone={() => setTour(false)} />}
      {fileInput}
      {accountModal}
      {modal && modal !== "signin" && modal !== "robots" && (
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
              <AngleStudyPanel
                onUse={(x, y, angle) => {
                  s.setConfig(placed(c, x, y, angle - c.shooter.hoodOffset));
                  setModal("");
                  s.set({ autoOpen: false, stage: "shot" });
                  solve();
                }}
              />
            ) : (
              <LegacyData />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
