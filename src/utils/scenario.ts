import type { BounceSettings, Config, Vec3 } from "../physics/types";
import { current } from "../presets";
import { defaultBounce } from "../physics/bounce";
import { advancedBounceDefaults } from "../physics/contactModel";
import { defaultHiveReference } from "../physics/hiveReference";
import { placementError } from "../physics/collisionWorld";
import { parseConfig } from "./config";
import { parseMeasurements, type Measurement } from "../physics/analysis";

/**
 * Measurements behind a fitted profile and the physics stamp they were fitted
 * against. Holds no pass/fail flag: the badge is always recomputed from these.
 */
export interface StoredCalibration {
  stamp: string;
  measurements: Measurement[];
}
export interface ScenarioState {
  config: Config;
  bounceEnabled: boolean;
  bounceSettings: BounceSettings;
  residentCount: number;
  residentLayout: "center" | "left" | "right" | "manual";
  manualResidents: Vec3[];
  calibration?: StoredCalibration | null;
}
export interface Scenario extends ScenarioState {
  format: "pollen-shooter-scenario";
  version: 1;
}
export function defaultScenario(config: Config = current): Scenario {
  return captureScenario({
    config,
    bounceEnabled: false,
    bounceSettings: {
      ...defaultBounce,
      ball: 0.55,
      ...advancedBounceDefaults,
      hiveReferenceMass: defaultHiveReference.mass,
      hiveReferenceDiameter: defaultHiveReference.diameter,
    },
    residentCount: 0,
    residentLayout: "center",
    manualResidents: [],
  });
}
/** Explicit fields prevent UI state, callbacks or old trajectories entering a profile. */
export function captureScenario(s: ScenarioState): Scenario {
  return structuredClone({
    format: "pollen-shooter-scenario",
    version: 1,
    config: s.config,
    bounceEnabled: s.bounceEnabled,
    bounceSettings: s.bounceSettings,
    residentCount: s.residentCount,
    residentLayout: s.residentLayout,
    manualResidents: s.manualResidents,
    ...(s.calibration ? { calibration: s.calibration } : {}),
  });
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function addHoodGeometry(value: unknown) {
  if (!record(value)) return value;
  const q = structuredClone(value),
    shooter = q.shooter;
  if (!record(shooter)) return q;
  const defaults = [current.shooter.secondary, ...current.shooter.rollers];
  const rollers = [
    shooter.secondary,
    ...(Array.isArray(shooter.rollers) ? shooter.rollers : []),
  ];
  rollers.forEach((roller, i) => {
    if (!record(roller)) return;
    const fallback = defaults[Math.min(i, defaults.length - 1)];
    for (const key of [
      "angle",
      "radius",
      "center",
      "compression",
      "contactStart",
      "contactEnd",
    ] as const)
      if (roller[key] === undefined)
        roller[key] = structuredClone(fallback[key]);
  });
  return q;
}
export function parseScenario(value: unknown): Scenario {
  if (!record(value)) throw new Error("Expected a scenario or legacy profile.");
  if (!("format" in value))
    return defaultScenario(parseConfig(addHoodGeometry(value)));
  if (value.format !== "pollen-shooter-scenario" || value.version !== 1)
    throw new Error("Unsupported scenario format/version.");
  const config = parseConfig(addHoodGeometry(value.config));
  if (typeof value.bounceEnabled !== "boolean" || !record(value.bounceSettings))
    throw new Error("Invalid bounce scenario.");
  const defaults = defaultScenario().bounceSettings;
  const settings = { ...defaults, ...value.bounceSettings } as BounceSettings;
  for (const [key, v] of Object.entries(settings)) {
    if (!(key in defaults)) throw new Error(`Unknown physics setting: ${key}`);
    if (key === "orientation") {
      if (
        !Array.isArray(v) ||
        v.length !== 3 ||
        !v.every((x) => typeof x === "number" && Number.isFinite(x))
      )
        throw new Error("Invalid ball orientation.");
    } else if (key === "surfaceFriction") {
      if (
        !record(v) ||
        Object.entries(v).some(
          ([k, n]) =>
            !["floor", "wall", "cell", "ball"].includes(k) ||
            typeof n !== "number" ||
            !Number.isFinite(n) ||
            n < 0,
        )
      )
        throw new Error("Invalid surface friction.");
    } else {
      const template = defaults[key as keyof BounceSettings];
      if (
        typeof v !== typeof template ||
        (typeof v === "number" && !Number.isFinite(v))
      )
        throw new Error(`Invalid physics setting: ${key}`);
    }
  }
  const enums: [unknown, string[]][] = [
    [settings.contactModel, ["rigid", "hertz"]],
    [settings.inertiaModel, ["config", "solid", "shell"]],
    [settings.shapeModel, ["sphere", "pollen"]],
  ];
  if (enums.some(([v, values]) => !values.includes(v as string)))
    throw new Error("Unknown ball/contact model.");
  const signed = new Set([
    "hiveInitialAngle",
    "hiveInitialSpeed",
    "hemispherePhase",
  ]);
  for (const [key, v] of Object.entries(settings))
    if (typeof v === "number" && !signed.has(key) && v < 0)
      throw new Error(`Negative physics setting: ${key}`);
  if (
    [settings.floor, settings.wall, settings.cell, settings.ball!].some(
      (v) => v > 1,
    ) ||
    settings.maxContactStep! < 1e-6 ||
    settings.maxContactStep! > 0.002 ||
    settings.previewTime! < 0.5 ||
    settings.previewTime! > 30 ||
    settings.contactStiffness! <= 0 ||
    settings.hiveInertia! <= 0 ||
    settings.hiveReferenceMass! <= 0 ||
    settings.hiveReferenceDiameter! <= 0 ||
    settings.asphericity! > 0.05 ||
    settings.solverIterations! < 4 ||
    settings.solverIterations! > 48 ||
    !Number.isInteger(settings.solverIterations)
  )
    throw new Error("Physics settings exceed model bounds.");
  if (
    !Number.isInteger(value.residentCount) ||
    Number(value.residentCount) < 0 ||
    Number(value.residentCount) > 8 ||
    !["center", "left", "right", "manual"].includes(
      value.residentLayout as string,
    )
  )
    throw new Error("Invalid resident-ball scenario.");
  if (
    !Array.isArray(value.manualResidents) ||
    value.manualResidents.length > 8 ||
    value.manualResidents.some(
      (p) =>
        !Array.isArray(p) ||
        p.length !== 3 ||
        !p.every((x) => typeof x === "number" && Number.isFinite(x)),
    )
  )
    throw new Error("Invalid manual ball positions.");
  let calibration: StoredCalibration | null = null;
  if (value.calibration !== undefined && value.calibration !== null) {
    const raw = value.calibration;
    if (
      !record(raw) ||
      typeof raw.stamp !== "string" ||
      !/^v1-[0-9a-f]{16}$/.test(raw.stamp)
    )
      throw new Error("Invalid calibration evidence.");
    calibration = {
      stamp: raw.stamp,
      measurements: parseMeasurements(
        raw.measurements,
        config.simulation.maxTime,
      ),
    };
  }
  const scenario = captureScenario({
    ...value,
    config,
    bounceSettings: settings,
    calibration,
  } as unknown as ScenarioState);
  if (scenario.residentLayout === "manual") {
    if (scenario.manualResidents.length !== scenario.residentCount)
      throw new Error("Manual layout needs one position per ball.");
    const error = placementError(config, scenario.manualResidents);
    if (error) throw new Error(error);
  }
  return scenario;
}
/** Migrate each entry independently; a malformed profile cannot discard others. */
export function loadScenarios(raw: string | null): Scenario[] {
  try {
    const values: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(values)) return [];
    return values.flatMap((value) => {
      try {
        return [parseScenario(value)];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
