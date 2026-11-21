// Shot points: the one shared list of places this robot shoots from. Helpers
// that move the robot to a point and read a point off the current shot.
import { placed } from "./placement";
import type { Candidate } from "../physics/analysis";
import type { Config, Shot } from "../physics/types";
import { samePlace, useStore } from "../state/store";
import type { ShotPoint } from "../utils/scenario";
export { distanceOf, placed } from "./placement";
import {
  cameraPose,
  viewAll,
  visionScene,
  type CameraSettings,
} from "../vision/limelight";

/** The current robot pose and settings as a shot point (without id / name). */
export function pointOf(
  c: Config,
  shot: Shot,
  source: ShotPoint["source"] = "manual",
): Omit<ShotPoint, "id" | "name"> {
  return {
    x: c.robot.x,
    y: c.robot.y,
    heading: c.robot.heading + c.robot.turretYaw,
    omega: c.shooter.primary.omega,
    hoodAngle: c.shooter.hoodAngle,
    clearance: shot.flight.entry?.clearance ?? 0,
    source,
  };
}

export function goToPoint(p: ShotPoint) {
  const s = useStore.getState();
  s.setConfig(placed(s.config, p.x, p.y, p.hoodAngle, p.omega));
}

/** Coverage cell click: drive there and apply the cell's solution. */
export function goToCell(x: number, y: number, v: Candidate) {
  const s = useStore.getState();
  s.setConfig(placed(s.config, x, y, v.angle, v.omega));
}

/** The saved point the robot is standing on with the same settings, if any. */
export function pointHere(points: ShotPoint[], c: Config) {
  return points.find(
    (p) =>
      samePlace(p, c.robot) &&
      Math.abs(p.omega - c.shooter.primary.omega) < 1e-6 &&
      Math.abs(p.hoodAngle - c.shooter.hoodAngle) < 1e-6,
  );
}

/** AprilTags the camera sees with the robot shooting from this point. */
export function tagsSeenAt(
  c: Config,
  camera: CameraSettings,
  p: { x: number; y: number },
) {
  const q = placed(c, p.x, p.y, c.shooter.hoodAngle);
  const pose = cameraPose(
    camera,
    q.robot.x,
    q.robot.y,
    q.robot.heading,
    q.robot.turretYaw,
    q.robot.turretCenter,
  );
  return viewAll(pose, camera, visionScene(c.field)).filter(
    (v) => v.reason === "seen",
  ).length;
}
