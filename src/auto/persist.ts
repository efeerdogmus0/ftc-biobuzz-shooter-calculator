// The planner's choices survive a reload and the round trip through the
// shooter setup. Only plain settings are stored; results are recomputed.
import { defaultSettings, type PlanSettings } from "./planner";
import type { AutoRobot } from "./robot";
import type { Alliance } from "./field";

export interface PlannerState {
  /** Builder source id, or "__manual". Robot files are not stored. */
  robotId: string | null;
  shooterChoice: "builder" | "app";
  overrides: Partial<AutoRobot>;
  alliance: Alliance;
  startIndex: number;
  enabled: Record<string, boolean>;
  settings: PlanSettings;
  spacing: number;
  mapLayer: "first" | "tipped" | "none";
}

export const defaultPlannerState: PlannerState = {
  robotId: null,
  shooterChoice: "builder",
  overrides: {},
  alliance: "blue",
  startIndex: 0,
  enabled: {
    preload: true,
    garden: true,
    "flower-0": true,
    "flower-1": true,
  },
  settings: defaultSettings,
  spacing: 0.25,
  mapLayer: "first",
};

const KEY = "shooterlab.autoPlanner.v1";
/** Robot numbers a user can change; nothing else is restored from storage. */
const NUMBERS = [
  "halfX",
  "halfY",
  "maxSpeed",
  "maxAccel",
  "maxTurnRate",
  "maxTurnAccel",
  "capacity",
  "intakePerBall",
  "flowerPerBall",
  "feedInterval",
] as const;

export function loadPlannerState(): PlannerState {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!v || typeof v !== "object") return defaultPlannerState;
    const overrides: Partial<AutoRobot> = {};
    for (const k of NUMBERS) {
      const n = v.overrides?.[k];
      if (typeof n === "number" && Number.isFinite(n) && n > 0)
        overrides[k] = n;
    }
    if (typeof v.overrides?.turret === "boolean")
      overrides.turret = v.overrides.turret;
    const num = (x: unknown, fallback: number) =>
      typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : fallback;
    const d = defaultPlannerState;
    return {
      robotId: typeof v.robotId === "string" ? v.robotId : null,
      shooterChoice: v.shooterChoice === "app" ? "app" : "builder",
      overrides,
      alliance: v.alliance === "red" ? "red" : "blue",
      startIndex: Math.round(num(v.startIndex, 0)),
      enabled:
        v.enabled && typeof v.enabled === "object"
          ? Object.fromEntries(
              Object.entries(v.enabled).map(([k, x]) => [k, !!x]),
            )
          : d.enabled,
      settings: {
        ...defaultSettings,
        park: v.settings?.park !== false,
        preloadInside: v.settings?.preloadInside === true,
        spinUp: num(v.settings?.spinUp, defaultSettings.spinUp),
      },
      spacing: [0.4, 0.3, 0.25, 0.2, 0.15].includes(v.spacing)
        ? v.spacing
        : d.spacing,
      mapLayer: ["first", "tipped", "none"].includes(v.mapLayer)
        ? v.mapLayer
        : d.mapLayer,
    };
  } catch {
    return defaultPlannerState;
  }
}

export function savePlannerState(s: PlannerState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage blocked: the planner still works for this visit.
  }
}
