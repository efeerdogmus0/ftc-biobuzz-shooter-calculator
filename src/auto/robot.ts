// The robot an auto is planned for: drivetrain and size from a Probot Builder
// robot (via Probot Sim), the shooter either recognised on that robot or taken
// from this app (the active robot or a guided setup), plus the few timing
// numbers a plan needs. Every number here can be edited in the planner.
import { buildRobot, type RobotSpec } from "../presets/factory";
import type { Config } from "../physics/types";
import {
  driveModel,
  footprint,
  rpmRad,
  type ProbotRobot,
  type RouteLimits,
} from "./probot";

export type DriveKind = "holonomic" | "tank";
export interface AutoRobot {
  name: string;
  /** Where the drivetrain came from. */
  origin: "builder" | "file" | "manual";
  /** Half length (x, forward) and half width (y) of the footprint, m. */
  halfX: number;
  halfY: number;
  /**
   * Plans place the robot by its turning point: between the driven wheels of
   * a tank drive (it cannot turn about anything else), the footprint centre of
   * a holonomic one. `offsetX/Y`: footprint centre from that point (robot
   * frame). `pivot`: that point in the Probot robot's root frame.
   */
  offsetX: number;
  offsetY: number;
  pivot: { x: number; y: number };
  drive: DriveKind;
  /** Free wheel surface speed from the drive motors, m/s (0 when unknown). */
  wheelFreeSpeed: number;
  /** Planning limits; maxSpeed defaults to 80 % of the free speed. */
  maxSpeed: number;
  maxAccel: number;
  maxTurnRate: number;
  maxTurnAccel: number;
  /** Balls the robot can hold at once. */
  capacity: number;
  /** Seconds to take in one POLLEN from the floor / out of a FLOWER. */
  intakePerBall: number;
  flowerPerBall: number;
  /** Shortest time between two shots from the feeder, s. */
  feedInterval: number;
  /** A turret aims by itself; otherwise the chassis must face the CELL. */
  turret: boolean;
  /** Shooter: this app's physical model of it. */
  shooter: Config;
  shooterSpec: RobotSpec | null;
  shooterOrigin: "builder" | "app";
  notes: string[];
}

/** Probot Starter Bot shooter, from its Builder kit parts (not measured on a robot). */
export const probotShooterSpec: RobotSpec = {
  version: 1,
  name: "Probot Starter Bot shooter",
  mechanism: "wheel-fixed-hood",
  wheelDiameter: 0.1,
  wheelRPM: 3000,
  hoodRollers: 1,
  rollerDiameter: 0.0254,
  drive: "independent",
  ratio: 1,
  secondRPM: 0,
  topWheelDiameter: 0.1,
  gap: 0.068,
  exitHeight: 0.3,
  hoodAngleDeg: 65,
  hoodMinDeg: 65,
  hoodMaxDeg: 65,
};

const SHOOTER_PARTS = ["part-kit-shooter-modul"];

function hasShooter(r: ProbotRobot) {
  return r.linkler.some((l) =>
    l.gorsel.some((g) => SHOOTER_PARTS.includes(g.tip)),
  );
}

/** Distance from the turning point to the front edge. */
export const frontReach = (r: AutoRobot) => r.halfX + r.offsetX;
/** Circle around the turning point that holds the whole footprint. */
export const sweepRadius = (r: AutoRobot) =>
  Math.hypot(r.halfX + Math.abs(r.offsetX), r.halfY + Math.abs(r.offsetY));
/** Footprint centre on the field for a planned pose. */
export function footprintCenter(
  r: AutoRobot,
  p: { x: number; y: number; h: number },
) {
  const c = Math.cos(p.h),
    s = Math.sin(p.h);
  return {
    x: p.x + c * r.offsetX - s * r.offsetY,
    y: p.y + s * r.offsetX + c * r.offsetY,
  };
}

/** Planned pose (turning point) for a robot whose footprint centre is at `p`. */
export function fromFootprint(
  r: AutoRobot,
  p: { x: number; y: number; h: number },
) {
  const c = Math.cos(p.h),
    s = Math.sin(p.h);
  return {
    x: p.x - (c * r.offsetX - s * r.offsetY),
    y: p.y - (s * r.offsetX + c * r.offsetY),
    h: p.h,
  };
}
/** Pose of the Probot robot's root frame for a planned pose. */
export function rootPose(r: AutoRobot, p: { x: number; y: number; h: number }) {
  const c = Math.cos(p.h),
    s = Math.sin(p.h);
  return {
    x: p.x - (c * r.pivot.x - s * r.pivot.y),
    y: p.y - (s * r.pivot.x + c * r.pivot.y),
    h: p.h,
  };
}

export function limitsOf(r: AutoRobot): RouteLimits {
  const track = r.halfX + r.halfY;
  return {
    maxHiz: r.maxSpeed,
    maxIvme: r.maxAccel,
    maxAciHiz: r.maxTurnRate,
    maxAciIvme: r.maxTurnAccel,
    teker:
      r.wheelFreeSpeed > 0
        ? { hiz: r.maxSpeed, k: track, tank: r.drive === "tank" }
        : null,
  };
}

const defaults = {
  maxAccel: 1.5,
  maxTurnAccel: 2 * Math.PI,
  capacity: 4,
  intakePerBall: 0.25,
  flowerPerBall: 0.5,
  feedInterval: 0.3,
  turret: false,
};

/** Robot from a Probot Builder robot definition. */
export function robotFromProbot(
  robot: ProbotRobot,
  appShooter: Config,
  appSpec: RobotSpec | null,
  origin: "builder" | "file",
  notes: string[] = [],
): AutoRobot {
  const m = driveModel(robot),
    iz = footprint(robot);
  const driven = m.tekerler.filter((w) => w.motor);
  const free = driven.length
    ? Math.min(...driven.map((w) => rpmRad(w.motor!.serbestDevir) * w.yaricap))
    : 0;
  const halfX = (iz.max[0] - iz.min[0]) / 2,
    halfY = (iz.max[1] - iz.min[1]) / 2;
  const tank = !(m.tip === "mecanum" || m.tip === "omni");
  const pivot =
    tank && driven.length
      ? {
          x: driven.reduce((a, w) => a + w.konum[0], 0) / driven.length,
          y: driven.reduce((a, w) => a + w.konum[1], 0) / driven.length,
        }
      : { x: m.merkez[0], y: m.merkez[1] };
  const maxSpeed = free > 0 ? 0.8 * free : 1.2;
  const out: string[] = [...notes];
  if (!driven.length)
    out.push("Sürüş motoru bulunamadı; hız sınırı varsayılan 1,2 m/s.");
  if (m.kutleTahmini) out.push("Robot kütlesi bilinmiyor (12 kg varsayıldı).");
  const builderShooter = hasShooter(robot);
  const spec = builderShooter ? probotShooterSpec : appSpec;
  const shooter = builderShooter ? buildRobot(probotShooterSpec) : appShooter;
  if (builderShooter)
    out.push(
      "Shooter, Builder'daki Probot shooter modülünden kuruldu (100 mm teker, sabit hood). Ölçüler kit parçalarından; robotta ölçülmedi.",
    );
  return {
    name: robot.ad,
    origin,
    halfX,
    halfY,
    offsetX: m.merkez[0] - pivot.x,
    offsetY: m.merkez[1] - pivot.y,
    pivot,
    drive: tank ? "tank" : "holonomic",
    wheelFreeSpeed: free,
    maxSpeed,
    maxTurnRate:
      maxSpeed /
      Math.max(0.1, Math.hypot(halfX + Math.abs(m.merkez[0] - pivot.x), halfY)),
    ...defaults,
    shooter,
    shooterSpec: spec,
    shooterOrigin: builderShooter ? "builder" : "app",
    notes: out,
  };
}

/** Robot without a Builder model: size and drive typed in, shooter from this app. */
export function manualRobot(
  appShooter: Config,
  appSpec: RobotSpec | null,
  chassis: { drive: DriveKind; turret: boolean } | null = null,
): AutoRobot {
  const halfX = appShooter.robot.length / 2,
    halfY = appShooter.robot.width / 2;
  return {
    name: appSpec?.name ?? appShooter.name,
    origin: "manual",
    halfX,
    halfY,
    offsetX: 0,
    offsetY: 0,
    pivot: { x: 0, y: 0 },
    drive: chassis?.drive ?? "holonomic",
    wheelFreeSpeed: 0,
    maxSpeed: 1.5,
    maxTurnRate: 1.5 / Math.hypot(halfX, halfY),
    ...defaults,
    turret: chassis?.turret ?? defaults.turret,
    shooter: appShooter,
    shooterSpec: appSpec,
    shooterOrigin: "app",
    notes: [
      "Hız ve ivme tahmin; Builder robotu seçilirse motorlardan hesaplanır.",
    ],
  };
}
