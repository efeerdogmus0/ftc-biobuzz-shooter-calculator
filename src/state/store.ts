import { create } from "zustand";
import type { CameraSettings, MapMode, VisionMap } from "../vision/limelight";
import type { BounceSettings, Config, Shot, Vec3 } from "../physics/types";
import type { CoverageCell } from "../physics/analysis";
import { aim } from "../physics/flight";
import { legacyNotices } from "../utils/legacy";
import { physicsStamp } from "../physics/launchDynamics";
import { setPath } from "../utils/config";
import { consumeResetRequest } from "../app/recovery";
import { initialUiMode, UI_MODE_KEY, type UiMode } from "../app/uiMode";
import type { StageId } from "../app/journey";
import { detectLang, setLang as applyLang, type Lang } from "../i18n";
export type SetupScreen = "home" | "new" | "edit" | "recalc" | "sandbox";
import {
  captureScenario,
  exampleScenario,
  parseScenario,
  loadScenarios,
  type Scenario,
  type ScenarioState,
  type ScenarioOrigin,
  type StoredCalibration,
  type ShotPoint,
  type Chassis,
  MAX_SHOT_POINTS,
} from "../utils/scenario";
import type { LoggedShot } from "../export/shotLog";
/** Everything a pose / wheel speed / hood change leaves alone. */
function shooterIdentity(c: Config) {
  const q = structuredClone(c) as unknown as {
    robot: Record<string, unknown>;
    shooter: { hoodAngle?: number; primary: { omega?: number } };
  };
  for (const k of ["x", "y", "heading", "turretYaw"]) delete q.robot[k];
  delete q.shooter.hoodAngle;
  delete q.shooter.primary.omega;
  return JSON.stringify(q);
}
/** Same spot = within 2 cm; used to update a point instead of duplicating it. */
export const samePlace = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.hypot(a.x - b.x, a.y - b.y) < 0.02;
export type CameraView =
  "Orbit" | "Top" | "Side" | "Shooter" | "Target" | "CELL" | "HIVE";
interface State extends ScenarioState {
  config: Config;
  units: "FTC" | "SI";
  theme: "dark" | "light";
  view: CameraView;
  cameraReset: number;
  dragging: boolean;
  autoAim: boolean;
  drive: boolean;
  snap: number;
  playing: boolean;
  playSpeed: number;
  playReset: number;
  showTrajectory: boolean;
  bounceEnabled: boolean;
  bounceBusy: boolean;
  bounceProgress: string;
  bounceSettings: BounceSettings;
  residentCount: number;
  residentLayout: "center" | "left" | "right" | "manual";
  manualResidents: Vec3[];
  calibration: StoredCalibration | null;
  /** Whose robot this is (user / public example / reference); not physics. */
  origin: ScenarioOrigin | null;
  shotPoints: ShotPoint[];
  chassis: Chassis | null;
  /** Shots measured on the real robot; saved with the robot. */
  shotLog: LoggedShot[];
  /** Calibration badge result, mirrored from the app for other views (UI only). */
  measured: "none" | "verified" | "failed" | "stale";
  /** Adds a point, or updates the one already saved at the same spot. */
  saveShotPoint: (
    p: Omit<ShotPoint, "id" | "name"> & { name?: string },
  ) => void;
  removeShotPoint: (id: string) => void;
  renameShotPoint: (id: string, name: string) => void;
  /** First visit with nothing saved: show the start panel. */
  needsStart: boolean;
  /**
   * Full-screen start / setup screen (UI only): the welcome choices, the
   * guided robot setup (new or edit), ReCalc import or the sandbox picker.
   */
  setupOpen: SetupScreen | null;
  /** Journey step shown in the guided layout (UI only, not saved). */
  stage: StageId;
  /** Auto planner open: step 5 of the journey, full screen in expert view. */
  autoOpen: boolean;
  /** Reopen the auto planner when the guided setup it started finishes. */
  autoReturn: boolean;
  /** The robot's motor / gear ratio is still undecided: offer the comparison panel. */
  motorExplore: boolean;
  /** Increments whenever a whole scenario is loaded (another robot, file, example…). */
  scenarioId: number;
  /** Interface complexity; stored apart from the physical scenario. */
  uiMode: UiMode;
  setUiMode: (mode: UiMode) => void;
  /** Interface language (TR / EN), stored the Probot Studio way; not part of a scenario. */
  lang: Lang;
  setLang: (lang: Lang) => void;
  showResidentPaths: boolean;
  selectedBounce: number;
  playbackTime: number;
  seekTime: number;
  seekTick: number;
  trajectoryColor: "status" | "speed" | "time" | "vertical";
  history: { id: string; shot: Shot; scenario?: Scenario }[];
  coverage: CoverageCell[];
  coverageMode: "reachability" | "angle" | "velocity" | "energy";
  heatSpacing: number;
  cadURL: string | null;
  overlays: Record<string, boolean>;
  /** Limelight placement (saved with the robot); null = no camera set up. */
  camera: CameraSettings | null;
  setCamera: (camera: CameraSettings | null) => void;
  /** AprilTag visibility map on the floor (UI only). */
  visionMode: MapMode | "off";
  visionSpacing: number;
  visionMap: VisionMap | null;
  visionBusy: boolean;
  setConfig: (c: Config) => void;
  setScenario: (s: Scenario) => void;
  edit: (path: string, value: unknown) => void;
  set: (s: Partial<State>) => void;
  fire: (s: Shot) => void;
}
/** Legacy callers that need configuration only. The UI uses full scenarios. */
export const loadProfiles = (raw: string | null): Config[] =>
  loadScenarios(raw).map((s) => s.config);
// A first visit (nothing saved) starts on the public example behind the
// start panel — never on the project's own reference robot.
let initial: Scenario = exampleScenario();
let needsStart = true;
/** Messages about the saved scenario shown once at startup. */
export let startupNotices: string[] = [];
let startMode: UiMode = "simple";
const startLang: Lang = detectLang();
applyLang(startLang);
try {
  // Read before ?reset clears the active scenario, so a reset keeps the user's mode.
  startMode = initialUiMode(localStorage);
} catch {
  /* No storage (tests/private mode). */
}
try {
  if (typeof location !== "undefined")
    consumeResetRequest(location, localStorage, history);
  const saved = localStorage.getItem("pollen-active");
  if (saved) {
    // Loaded exactly as saved; older layouts are reported, never rewritten.
    initial = parseScenario(JSON.parse(saved));
    startupNotices = legacyNotices(initial.config);
    needsStart = false;
  }
} catch {
  /* Invalid/stale saved state cannot crash startup. */
}
export const useStore = create<State>((set, get) => ({
  config: initial.config,
  units: "FTC",
  theme: "light",
  view: "Orbit",
  cameraReset: 0,
  dragging: false,
  autoAim: false,
  drive: false,
  snap: 0,
  playing: false,
  playSpeed: 1,
  playReset: 0,
  showTrajectory: true,
  bounceEnabled: initial.bounceEnabled,
  bounceBusy: false,
  bounceProgress: "",
  bounceSettings: initial.bounceSettings,
  residentCount: initial.residentCount,
  residentLayout: initial.residentLayout,
  manualResidents: initial.manualResidents,
  calibration: initial.calibration ?? null,
  origin: initial.origin ?? null,
  camera: initial.camera ?? null,
  shotPoints: initial.shotPoints ?? [],
  chassis: initial.chassis ?? null,
  shotLog: initial.shotLog ?? [],
  measured: "none",
  saveShotPoint: (p) => {
    const list = get().shotPoints;
    const at = list.findIndex((q) => samePlace(q, p));
    if (at >= 0) {
      const next = [...list];
      next[at] = { ...list[at], ...p, name: p.name ?? list[at].name };
      get().set({ shotPoints: next });
      return;
    }
    if (list.length >= MAX_SHOT_POINTS) return;
    let n = list.length + 1;
    while (list.some((q) => q.name === `P${n}`)) n++;
    get().set({
      shotPoints: [
        ...list,
        { ...p, id: crypto.randomUUID(), name: p.name ?? `P${n}` },
      ],
    });
  },
  removeShotPoint: (id) =>
    get().set({ shotPoints: get().shotPoints.filter((p) => p.id !== id) }),
  renameShotPoint: (id, name) =>
    get().set({
      shotPoints: get().shotPoints.map((p) =>
        p.id === id ? { ...p, name: name.slice(0, 40) } : p,
      ),
    }),
  setCamera: (camera) => {
    set({ camera });
    try {
      localStorage.setItem(
        "pollen-active",
        JSON.stringify(captureScenario(get())),
      );
    } catch {
      /* Explicit save reports storage errors. */
    }
  },
  visionMode: "off",
  visionSpacing: 0.1,
  visionMap: null,
  visionBusy: false,
  needsStart,
  setupOpen: null,
  stage: "shot",
  autoOpen: false,
  autoReturn: false,
  motorExplore: false,
  scenarioId: 0,
  lang: startLang,
  setLang: (lang) => {
    applyLang(lang);
    set({ lang });
  },
  uiMode: startMode,
  setUiMode: (uiMode) => {
    set({ uiMode });
    try {
      localStorage.setItem(UI_MODE_KEY, uiMode);
    } catch {
      /* Preference only; the session still switches. */
    }
  },
  showResidentPaths: true,
  selectedBounce: 0,
  playbackTime: 0,
  seekTime: 0,
  seekTick: 0,
  trajectoryColor: "status",
  history: [],
  coverage: [],
  coverageMode: "reachability",
  heatSpacing: 0.2,
  cadURL: null,
  overlays: {
    axes: false,
    origin: true,
    velocity: false,
    center: false,
    tangent: true,
    target: true,
    collisions: false,
    measurements: true,
    aim: true,
    forces: false,
    spin: false,
    markers: true,
    field: true,
  },
  setConfig: (c) => {
    c = structuredClone(c);
    for (const roller of [c.shooter.secondary, ...c.shooter.rollers])
      roller.radius = roller.diameter / 2;
    // Moving the robot or re-tuning speed / hood keeps the coverage map (it
    // was computed for the shooter, not the pose) and the saved shot points.
    const before = get();
    const same =
      !before.coverage.length && !before.shotPoints.length
        ? true
        : shooterIdentity(before.config) === shooterIdentity(c);
    set({
      config: c,
      showTrajectory: true,
      ...(same ? {} : { coverage: [] }),
    });
    try {
      localStorage.setItem(
        "pollen-active",
        JSON.stringify(captureScenario(get())),
      );
    } catch {
      /* Explicit save reports storage errors. */
    }
  },
  setScenario: (value) => {
    const scenario = parseScenario(value);
    set({
      config: scenario.config,
      bounceEnabled: scenario.bounceEnabled,
      bounceSettings: scenario.bounceSettings,
      residentCount: scenario.residentCount,
      residentLayout: scenario.residentLayout,
      manualResidents: scenario.manualResidents,
      calibration: scenario.calibration ?? null,
      origin: scenario.origin ?? null,
      camera: scenario.camera ?? null,
      shotPoints: scenario.shotPoints ?? [],
      chassis: scenario.chassis ?? null,
      shotLog: scenario.shotLog ?? [],
      visionMap: null,
      needsStart: false,
      setupOpen: null,
      motorExplore: false,
      scenarioId: get().scenarioId + 1,
      playing: false,
      playReset: get().playReset + 1,
      coverage: [],
      selectedBounce: 0,
      bounceBusy: false,
      bounceProgress: "",
      playbackTime: 0,
      seekTime: 0,
      seekTick: get().seekTick + 1,
      showTrajectory: true,
    });
    try {
      localStorage.setItem("pollen-active", JSON.stringify(scenario));
    } catch {
      /* Explicit save reports errors. */
    }
  },
  edit: (path, value) => {
    const s = get();
    let c = setPath(s.config, path, value);
    if (/^shooter\.(secondary|rollers\.\d+)\.radius$/.test(path))
      c = setPath(c, path.replace(/radius$/, "diameter"), 2 * Number(value));
    if (path === "shooter.hoodMin")
      c.shooter.hoodMax = Math.max(c.shooter.hoodMax, c.shooter.hoodMin);
    if (path === "shooter.hoodMax")
      c.shooter.hoodMin = Math.min(c.shooter.hoodMin, c.shooter.hoodMax);
    c.shooter.hoodAngle = Math.max(
      c.shooter.hoodMin,
      Math.min(c.shooter.hoodMax, c.shooter.hoodAngle),
    );
    c.calibrated = false;
    if (s.autoAim && path.startsWith("robot")) c = aim(c);
    s.setConfig(c);
  },
  set: (s) => {
    const previous = get();
    if (
      s.bounceSettings &&
      physicsStamp(previous.config, s.bounceSettings) !==
        physicsStamp(previous.config, previous.bounceSettings)
    )
      s = {
        ...s,
        config: { ...(s.config ?? previous.config), calibrated: false },
        coverage: [],
      };
    set(s);
    if (
      [
        "config",
        "bounceSettings",
        "bounceEnabled",
        "residentCount",
        "residentLayout",
        "manualResidents",
        "calibration",
        "origin",
        "shotPoints",
        "chassis",
        "shotLog",
      ].some((k) => k in s)
    )
      try {
        localStorage.setItem(
          "pollen-active",
          JSON.stringify(captureScenario(get())),
        );
      } catch {
        /* Explicit save reports errors. */
      }
  },
  fire: (shot) => {
    if (!shot.shooter.exited) return;
    set((s) => ({
      history: [
        ...s.history,
        {
          id: crypto.randomUUID(),
          shot: structuredClone(shot),
          scenario: captureScenario({ ...s, config: shot.config }),
        },
      ].slice(-40),
      showTrajectory: true,
      playing: true,
      playReset: s.playReset + 1,
    }));
  },
}));
