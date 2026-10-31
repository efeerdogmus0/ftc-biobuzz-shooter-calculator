import { nominalHiveY } from "../field/fieldConfig";
import { create } from "zustand";
import type { BounceSettings, Config, Shot, Vec3 } from "../physics/types";
import type { CoverageCell } from "../physics/analysis";
import { current } from "../presets";
import { aim } from "../physics/flight";
import { physicsStamp } from "../physics/launchDynamics";
import { setPath } from "../utils/config";
import { consumeResetRequest } from "../app/recovery";
import {
  captureScenario,
  defaultScenario,
  parseScenario,
  loadScenarios,
  type Scenario,
  type ScenarioState,
  type StoredCalibration,
} from "../utils/scenario";
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
  setConfig: (c: Config) => void;
  setScenario: (s: Scenario) => void;
  edit: (path: string, value: unknown) => void;
  set: (s: Partial<State>) => void;
  fire: (s: Shot) => void;
}
/** Legacy callers that need configuration only. The UI uses full scenarios. */
export const loadProfiles = (raw: string | null): Config[] =>
  loadScenarios(raw).map((s) => s.config);
let initial = defaultScenario();
function migrateLegacyShooter(c: Config) {
  if (
    Math.abs(c.field.target.center[1] + 0.0254 * 6.5) < 1e-6 &&
    Math.abs(c.field.target.tilt + Math.PI / 3) < 1e-6
  ) {
    c.field.target.center[1] = nominalHiveY;
    c.field.hive.bottomHeight = 0.0254 * 30.6;
  }
  const legacy =
    Math.abs(c.shooter.primary.diameter - 0.072) < 1e-9 &&
    Math.abs(c.shooter.secondary.diameter - 0.016) < 1e-9 &&
    c.shooter.rollers.length === 0;
  if (!legacy) return c;
  const q = structuredClone(c);
  q.name = current.name;
  q.projectile.name = "POLLEN";
  q.projectile.diameter = current.projectile.diameter;
  q.projectile.mass = current.projectile.mass;
  q.shooter.primary = {
    ...current.shooter.primary,
    omega: q.shooter.primary.omega,
  };
  q.shooter.secondary = structuredClone(current.shooter.secondary);
  q.shooter.rollers = structuredClone(current.shooter.rollers);
  q.shooter.link = "gear";
  q.shooter.surfaceRatio = current.shooter.surfaceRatio;
  return q;
}
try {
  if (typeof location !== "undefined")
    consumeResetRequest(location, localStorage, history);
  const saved = localStorage.getItem("pollen-active");
  if (saved) {
    initial = parseScenario(JSON.parse(saved));
    initial.config = migrateLegacyShooter(initial.config);
    localStorage.setItem("pollen-active", JSON.stringify(initial));
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
    set({ config: c, showTrajectory: true, coverage: [] });
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
