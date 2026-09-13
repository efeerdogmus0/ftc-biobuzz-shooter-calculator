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
try {
  const saved = localStorage.getItem("pollen-active");
  if (saved) initial = parseConfig(JSON.parse(saved));
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
  history: [],
  coverage: [],
  coverageMode: "reachability",
  heatSpacing: 0.2,
  cadURL: null,
  overlays: {
    axes: false,
    origin: true,
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
