// Limelight / AprilTag visibility: from which robot poses can the camera see
// which BIOBUZZ AprilTags?
//
// Pinhole camera, geometry only. A tag counts as seen when, for the whole tag:
//   1. its printed face points towards the camera,
//   2. all four corners are in front of the lens and inside the image,
//   3. its shortest projected edge is at least `minTagPixels`,
//   4. the angle between the tag normal and the line of sight is at most
//      `maxViewAngle`,
//   5. no HIVE frame member (legs, rails, crossbar, CELL support arms, hubs)
//      crosses the line from the lens to any corner.
// Limits 3 and 4 are user-editable assumptions about the detector, not
// Limelight specifications. Motion blur, exposure, lighting, glare on the
// clear CELL panels, CELL rims and other robots are not modelled.
import type { Config, FieldConfig, Vec3 } from "../physics/types";
import { add, sub, scale, dot, cross, norm, rotateZ } from "../physics/math";
import {
  hiveStructureSolids,
  type StructureSolid,
} from "../field/hiveStructure";
import { aprilTags, type AprilTag } from "./aprilTags";

const deg = Math.PI / 180;

export interface CameraModel {
  id: string;
  label: string;
  hfov: number;
  vfov: number;
  width: number;
  height: number;
  source: string;
}
export const cameraModels: CameraModel[] = [
  {
    id: "limelight-3a",
    label: "Limelight 3A",
    hfov: 54.5 * deg,
    vfov: 42 * deg,
    width: 640,
    height: 480,
    source:
      "Limelight 3A belgelerindeki görüş alanı: 54.5° × 42°. Üretici verisi; bu projede ölçülmedi.",
  },
  {
    id: "custom",
    label: "Özel kamera",
    hfov: 70 * deg,
    vfov: 50 * deg,
    width: 640,
    height: 480,
    source: "Kullanıcının girdiği değerler.",
  },
];

/** Stored with the scenario; never part of the physics configuration. */
export interface CameraSettings {
  enabled: boolean;
  model: string;
  /** Chassis: fixed to the drivetrain. Turret: turns with the shooter turret. */
  mount: "chassis" | "turret";
  /** Lens position in the robot frame, metres: +forward, +left, up from the floor. */
  forward: number;
  left: number;
  up: number;
  /** Degrees. Yaw + = to the left, pitch + = tilted up, roll + = clockwise seen from behind. */
  yaw: number;
  pitch: number;
  roll: number;
  hfov: number;
  vfov: number;
  width: number;
  height: number;
  minTagPixels: number;
  maxViewAngle: number;
}
export const defaultCamera: CameraSettings = {
  enabled: true,
  model: "limelight-3a",
  mount: "chassis",
  forward: 0.15,
  left: 0,
  up: 0.25,
  yaw: 0,
  pitch: 25,
  roll: 0,
  hfov: 54.5,
  vfov: 42,
  width: 640,
  height: 480,
  minTagPixels: 15,
  maxViewAngle: 70,
};

const numeric = [
  "forward",
  "left",
  "up",
  "yaw",
  "pitch",
  "roll",
  "hfov",
  "vfov",
  "width",
  "height",
  "minTagPixels",
  "maxViewAngle",
] as const;
const ranges: Record<(typeof numeric)[number], [number, number]> = {
  forward: [-1, 1],
  left: [-1, 1],
  up: [0, 1.5],
  yaw: [-180, 180],
  pitch: [-90, 90],
  roll: [-180, 180],
  hfov: [5, 170],
  vfov: [5, 170],
  width: [16, 8000],
  height: [16, 8000],
  minTagPixels: [1, 500],
  maxViewAngle: [0, 89.9],
};
/** Problems with the settings, in Turkish (translated in the UI). Empty when usable. */
export function cameraErrors(c: CameraSettings): string[] {
  const errors: string[] = [];
  for (const key of numeric) {
    const v = c[key],
      [lo, hi] = ranges[key];
    if (!Number.isFinite(v) || v < lo || v > hi)
      errors.push(`${key}: ${lo} … ${hi}`);
  }
  return errors;
}
export function parseCamera(value: unknown): CameraSettings | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const v = value as Record<string, unknown>;
  const out = { ...defaultCamera };
  for (const key of numeric)
    if (typeof v[key] === "number" && Number.isFinite(v[key]))
      out[key] = v[key] as number;
  if (typeof v.enabled === "boolean") out.enabled = v.enabled;
  if (cameraModels.some((m) => m.id === v.model)) out.model = v.model as string;
  if (v.mount === "chassis" || v.mount === "turret") out.mount = v.mount;
  return cameraErrors(out).length ? null : out;
}
/** Field of view from the preset (unless custom); resolution is always the user's. */
export function lens(c: CameraSettings) {
  const m = cameraModels.find((x) => x.id === c.model);
  const preset = m && m.id !== "custom";
  return {
    hfov: preset ? m.hfov : c.hfov * deg,
    vfov: preset ? m.vfov : c.vfov * deg,
    width: c.width,
    height: c.height,
  };
}

export interface CameraPose {
  position: Vec3;
  forward: Vec3;
  right: Vec3;
  up: Vec3;
}
/** World pose of the lens for a chassis at (x, y, heading) and a turret yaw. */
export function cameraPose(
  c: CameraSettings,
  x: number,
  y: number,
  heading: number,
  turretYaw = 0,
  turretCenter: Vec3 = [0, 0, 0],
): CameraPose {
  let mount: Vec3 = [c.forward, c.left, c.up],
    yaw = heading;
  if (c.mount === "turret") {
    // Offsets are measured from the turret axis, in the turret frame.
    mount = add(
      [turretCenter[0], turretCenter[1], 0],
      rotateZ(mount, turretYaw),
    );
    yaw = heading + turretYaw;
  }
  const position = add([x, y, 0], rotateZ(mount, heading));
  const a = yaw + c.yaw * deg,
    p = c.pitch * deg,
    r = c.roll * deg;
  const f: Vec3 = [
    Math.cos(p) * Math.cos(a),
    Math.cos(p) * Math.sin(a),
    Math.sin(p),
  ];
  const right0: Vec3 = [Math.sin(a), -Math.cos(a), 0];
  const up0 = cross(right0, f);
  // Roll about the optical axis, clockwise as seen from behind the camera.
  const right = add(scale(right0, Math.cos(r)), scale(up0, -Math.sin(r)));
  const up = add(scale(up0, Math.cos(r)), scale(right0, Math.sin(r)));
  return { position, forward: f, right, up };
}
export function robotCameraPose(c: CameraSettings, config: Config) {
  const r = config.robot;
  return cameraPose(c, r.x, r.y, r.heading, r.turretYaw, r.turretCenter);
}

export type TagReason =
  "seen" | "backface" | "outside" | "small" | "angle" | "blocked";
export interface TagView {
  id: number;
  reason: TagReason;
  distance: number;
  pixels: number;
  viewAngle: number;
  /** Pixel coordinates of the corners (origin top-left), when in front of the lens. */
  image?: [number, number][];
  blockedBy?: string;
}

function rayHitsSolid(a: Vec3, b: Vec3, s: StructureSolid) {
  // Segment against the oriented box (cylinders use their bounding box).
  if (
    norm(sub(add(a, scale(sub(b, a), 0.5)), s.center)) >
    norm(sub(b, a)) / 2 + s.bound
  )
    return false;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 3; i++) {
    const axis = s.basis[i],
      p = dot(sub(a, s.center), axis),
      d = dot(sub(b, a), axis),
      h = s.half[i];
    if (Math.abs(d) < 1e-12) {
      if (Math.abs(p) > h) return false;
      continue;
    }
    let t0 = (-h - p) / d,
      t1 = (h - p) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    lo = Math.max(lo, t0);
    hi = Math.min(hi, t1);
    if (lo > hi) return false;
  }
  // Ignore touching at the very end (the tag itself).
  return lo < 1 - 1e-6;
}

export interface VisionScene {
  tags: AprilTag[];
  solids: StructureSolid[];
}
export function visionScene(field: FieldConfig): VisionScene {
  return { tags: aprilTags(field), solids: hiveStructureSolids(field) };
}

export function viewTag(
  tag: AprilTag,
  pose: CameraPose,
  c: CameraSettings,
  scene: VisionScene,
): TagView {
  const L = lens(c);
  const toCam = sub(pose.position, tag.center),
    distance = norm(toCam);
  const cosView = dot(tag.normal, toCam) / Math.max(distance, 1e-9),
    viewAngle = Math.acos(Math.max(-1, Math.min(1, cosView)));
  const base = { id: tag.id, distance, viewAngle, pixels: 0 };
  if (cosView <= 0) return { ...base, reason: "backface" };
  const fx = L.width / 2 / Math.tan(L.hfov / 2),
    fy = L.height / 2 / Math.tan(L.vfov / 2);
  const image: [number, number][] = [];
  let inside = true;
  for (const corner of tag.corners) {
    const d = sub(corner, pose.position),
      z = dot(d, pose.forward);
    if (z <= 0.01) return { ...base, reason: "outside" };
    const px = L.width / 2 + (fx * dot(d, pose.right)) / z,
      py = L.height / 2 - (fy * dot(d, pose.up)) / z;
    image.push([px, py]);
    if (px < 0 || px > L.width || py < 0 || py > L.height) inside = false;
  }
  let pixels = Infinity;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = image[i],
      [bx, by] = image[(i + 1) % 4];
    pixels = Math.min(pixels, Math.hypot(bx - ax, by - ay));
  }
  const viewed = { ...base, pixels, image };
  if (!inside) return { ...viewed, reason: "outside" };
  if (pixels < c.minTagPixels) return { ...viewed, reason: "small" };
  if (viewAngle > c.maxViewAngle * deg) return { ...viewed, reason: "angle" };
  for (const corner of tag.corners)
    for (const s of scene.solids)
      if (rayHitsSolid(pose.position, corner, s))
        return { ...viewed, reason: "blocked", blockedBy: s.name };
  return { ...viewed, reason: "seen" };
}
export function viewAll(
  pose: CameraPose,
  c: CameraSettings,
  scene: VisionScene,
) {
  return scene.tags.map((t) => viewTag(t, pose, c, scene));
}

export type MapMode = "current" | "faceHive" | "anyHeading";
export interface MapCell {
  x: number;
  y: number;
  /** Tags seen (current / faceHive) or share of headings with ≥ 1 tag (anyHeading). */
  value: number;
  /** Most tags seen at once. */
  best: number;
  ids: number[];
}
export interface VisionMap {
  mode: MapMode;
  spacing: number;
  /** Grid: x = start + i·spacing for i in 0…count (same for y). */
  start: number;
  count: number;
  cells: MapCell[];
  /** Share of reachable cells where at least one / two tags are seen. */
  oneOrMore: number;
  twoOrMore: number;
}
export const ANY_HEADING_STEPS = 24;

/**
 * Coverage over every reachable robot centre on a grid. The HIVE footprint
 * (grown by the robot's circumscribed radius) and the wall margin are skipped.
 * `current` keeps the robot's heading and turret; `faceHive` turns the shooter
 * yaw towards the active CELL (turret mount: turret turns, else the chassis);
 * `anyHeading` tries 24 chassis headings with the current turret yaw.
 */
export function visionMap(
  c: CameraSettings,
  config: Config,
  mode: MapMode,
  spacing = 0.1,
  scene = visionScene(config.field),
): VisionMap {
  const r = config.robot,
    f = config.field,
    radius = Math.hypot(r.width, r.length) / 2,
    limit = f.size / 2 - radius,
    no = f.obstacles.filter((o) => o.purpose === "robot-exclusion");
  const cells: MapCell[] = [];
  const count = Math.floor((2 * limit) / spacing);
  const start = -((count * spacing) / 2);
  const target = f.target.center;
  for (let i = 0; i <= count; i++)
    for (let j = 0; j <= count; j++) {
      const x = start + i * spacing,
        y = start + j * spacing;
      if (
        no.some(
          (o) =>
            x > o.min[0] - radius &&
            x < o.max[0] + radius &&
            y > o.min[1] - radius &&
            y < o.max[1] + radius,
        )
      )
        continue;
      if (mode === "anyHeading") {
        let hits = 0,
          best = 0;
        const ids = new Set<number>();
        for (let k = 0; k < ANY_HEADING_STEPS; k++) {
          const h = (2 * Math.PI * k) / ANY_HEADING_STEPS;
          const pose = cameraPose(c, x, y, h, r.turretYaw, r.turretCenter);
          const seen = viewAll(pose, c, scene).filter(
            (v) => v.reason === "seen",
          );
          if (seen.length) hits++;
          best = Math.max(best, seen.length);
          seen.forEach((v) => ids.add(v.id));
        }
        cells.push({
          x,
          y,
          value: hits / ANY_HEADING_STEPS,
          best,
          ids: [...ids].sort((a, b) => a - b),
        });
        continue;
      }
      let heading = r.heading,
        turret = r.turretYaw;
      if (mode === "faceHive") {
        const bearing = Math.atan2(target[1] - y, target[0] - x);
        if (c.mount === "turret") turret = bearing - heading;
        else {
          heading = bearing;
          turret = 0;
        }
      }
      const pose = cameraPose(c, x, y, heading, turret, r.turretCenter);
      const ids = viewAll(pose, c, scene)
        .filter((v) => v.reason === "seen")
        .map((v) => v.id);
      cells.push({ x, y, value: ids.length, best: ids.length, ids });
    }
  const reach = cells.length || 1;
  const seenAt = (n: number) => cells.filter((cell) => cell.best >= n).length;
  return {
    mode,
    spacing,
    start,
    count,
    cells,
    oneOrMore: seenAt(1) / reach,
    twoOrMore: seenAt(2) / reach,
  };
}
