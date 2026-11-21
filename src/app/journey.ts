// The student's path through the tools: six stages on one rail. Pure data and
// status rules; the rail and the stage panels render from this.
export type StageId = "robot" | "shot" | "field" | "trust" | "auto" | "export";
export type StageStatus = "todo" | "done" | "warn";

export const stages: readonly {
  id: StageId;
  label: string;
  question: string;
}[] = [
  { id: "robot", label: "Robot", question: "Robotum ne?" },
  { id: "shot", label: "Atış", question: "Buradan girer mi?" },
  { id: "field", label: "Saha", question: "Nereden atabilirim?" },
  { id: "trust", label: "Güven", question: "Maçta tutar mı?" },
  { id: "auto", label: "Otonom", question: "30 saniyede ne yaparım?" },
  { id: "export", label: "Robota aktar", question: "Koda ne yazacağım?" },
];

export const isStage = (v: unknown): v is StageId =>
  stages.some((s) => s.id === v);

/** The stage after `id`, or null on the last one. */
export function nextStage(id: StageId) {
  const i = stages.findIndex((s) => s.id === id);
  return stages[i + 1] ?? null;
}

export interface JourneyFacts {
  /** The robot on screen is the user's own (not an example / reference copy). */
  ownRobot: boolean;
  /** The current shot enters the HIVE. */
  hit: boolean;
  /** A coverage map for the current robot is on the field. */
  mapped: boolean;
  /** Saved shot points. */
  points: number;
  /** Monte Carlo entry probability for the current settings; null = not run. */
  reliability: number | null;
  /** A saved auto plan exists. */
  planned: boolean;
  calibration: "none" | "verified" | "failed" | "stale";
}

/** Below this entry probability the Güven stage asks for attention. */
export const RELIABLE = 0.8;

export function stageStatus(f: JourneyFacts): Record<StageId, StageStatus> {
  return {
    robot: f.ownRobot ? "done" : "todo",
    shot: f.hit ? "done" : "warn",
    field: f.mapped || f.points > 0 ? "done" : "todo",
    trust:
      f.reliability === null
        ? "todo"
        : f.reliability >= RELIABLE
          ? "done"
          : "warn",
    auto: f.planned ? "done" : "todo",
    export:
      f.calibration === "verified"
        ? "done"
        : f.calibration === "none"
          ? "todo"
          : "warn",
  };
}

/** True once the auto planner has stored its choices in this browser. */
export function hasPlan() {
  try {
    return !!localStorage.getItem("shooterlab.autoPlanner.v1");
  } catch {
    return false;
  }
}
