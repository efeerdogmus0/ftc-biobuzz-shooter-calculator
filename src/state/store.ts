import { create } from "zustand";
import type { Config, Shot } from "../physics/types";
import type { CoverageCell } from "../physics/analysis";
import { current } from "../presets";
import { aim } from "../physics/flight";
import { parseConfig, setPath } from "../utils/config";
export type CameraView = "Orbit" | "Top" | "Side" | "Shooter" | "Target";
interface State {
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
  trajectoryColor: "status" | "speed" | "time" | "vertical";
  history: { id: string; shot: Shot }[];
  coverage: CoverageCell[];
  coverageMode: "reachability" | "angle" | "velocity" | "energy";
  heatSpacing: number;
  cadURL: string | null;
  overlays: Record<string, boolean>;
  setConfig: (c: Config) => void;
  edit: (path: string, value: unknown) => void;
  set: (s: Partial<State>) => void;
  fire: (s: Shot) => void;
}
let initial = structuredClone(current);
function migrateLegacyShooter(c: Config) {
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
  const saved = localStorage.getItem("pollen-active");
  if (saved) {
    initial = migrateLegacyShooter(parseConfig(JSON.parse(saved)));
    localStorage.setItem("pollen-active", JSON.stringify(initial));
  }
} catch {
  /* Invalid/stale saved state cannot crash startup. */
}
export const useStore = create<State>((set, get) => ({
  config: initial,
  units: "FTC",
  theme: "dark",
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
    set({ config: c, showTrajectory: true, coverage: [] });
    try {
      localStorage.setItem("pollen-active", JSON.stringify(c));
    } catch {
      /* Explicit save reports storage errors. */
    }
  },
  edit: (path, value) => {
    const s = get();
    let c = setPath(s.config, path, value);
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
  set: (s) => set(s),
  fire: (shot) =>
    set((s) => ({
      history: [
        ...s.history,
        { id: crypto.randomUUID(), shot: structuredClone(shot) },
      ].slice(-40),
      showTrajectory: true,
      playing: true,
      playReset: s.playReset + 1,
    })),
}));
