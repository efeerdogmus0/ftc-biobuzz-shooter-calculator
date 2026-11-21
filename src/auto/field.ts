// BIOBUZZ auto planning geometry, read from Probot Sim's field so both
// simulators use the same positions. Frame (shared by Probot Sim and this
// app): origin at the field centre, +x towards the blue alliance wall, +y away
// from the audience, metres. Plans are made for one alliance; the field is
// point-symmetric, so red is blue rotated by 180°.
import { biobuzzField, biobuzzStarts, biobuzzZones } from "./probot";

export type Alliance = "blue" | "red";
export interface Pose {
  x: number;
  y: number;
  h: number;
}
export interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
export interface PickupSource {
  id: string;
  kind: "preload" | "garden" | "flower";
  label: string;
  balls: number;
  /** Ball positions on the field (preload: filled in from the start pose). */
  points: { x: number; y: number }[];
  /** Direction the intake must face to collect (rad), and the target point. */
  approach: { x: number; y: number; facing: number };
}

const inch = 0.0254;
const half = biobuzzZones.yari;
const flip = (alliance: Alliance, p: { x: number; y: number }) =>
  alliance === "blue" ? p : { x: -p.x, y: -p.y };
const flipH = (alliance: Alliance, h: number) =>
  alliance === "blue" ? h : h + Math.PI;

/** G304 starting poses of the alliance (Probot Sim presets). */
export function starts(alliance: Alliance) {
  const own = biobuzzStarts.filter((s) =>
    alliance === "blue" ? s.poz.x > 0 : s.poz.x < 0,
  );
  return own.map((s) => ({ label: s.ad, pose: s.poz as Pose }));
}

/** HIVE frame footprint (49.46 × 38.95 in), robots may not enter it. */
export const hiveNoGo: Rect = {
  x0: (-49.46 / 2) * inch,
  x1: (49.46 / 2) * inch,
  y0: (-38.95 / 2) * inch,
  y1: (38.95 / 2) * inch,
};
export const fieldHalf = half;

/** FLOWER bases as squares around their outer ring (Probot Sim: ~0.073 m radius). */
export const flowerBlocks: Rect[] = biobuzzZones.cicekler.map((c) => ({
  x0: c.x - 0.075,
  x1: c.x + 0.075,
  y0: c.y - 0.075,
  y1: c.y + 0.075,
}));

export function loadingZone(alliance: Alliance): Rect {
  return alliance === "blue"
    ? biobuzzZones.yukleme.mavi
    : biobuzzZones.yukleme.kirmizi;
}

function wallNormal(p: { x: number; y: number }) {
  return Math.abs(p.x) > Math.abs(p.y)
    ? { x: -Math.sign(p.x), y: 0 }
    : { x: 0, y: -Math.sign(p.y) };
}

/** GARDEN row and the four FLOWERS, each with where the intake faces. */
export function pickupSources(alliance: Alliance): PickupSource[] {
  const pollen = biobuzzField.elemanlar.filter((e) => e.id.startsWith("polen"));
  // Blue GARDEN is the row in the (+x, +y) corner; red is mirrored.
  const garden = pollen
    .filter((e) => e.id.startsWith("polen-b"))
    .filter((e) => (alliance === "blue" ? e.x > 0 : e.x < 0))
    .map((e) => ({ x: e.x, y: e.y }));
  const gx = garden.reduce((s, p) => s + p.x, 0) / garden.length,
    gy = garden.reduce((s, p) => s + p.y, 0) / garden.length,
    gn = wallNormal({ x: gx, y: gy });
  const sources: PickupSource[] = [
    {
      id: "garden",
      kind: "garden",
      label: "GARDEN",
      balls: garden.length,
      points: garden,
      // Nose against the wall, intake across the row.
      approach: { x: gx, y: gy, facing: Math.atan2(-gn.y, -gn.x) },
    },
  ];
  biobuzzZones.cicekler.forEach((c, i) => {
    const n = wallNormal(c),
      balls = pollen.filter((e) => e.id.startsWith(`polen-c${i}`)).length;
    // Name the FLOWER by its wall as seen from this alliance.
    const own = flip(alliance, c);
    const wall =
      Math.abs(own.x) > Math.abs(own.y)
        ? own.x > 0
          ? "ittifak duvarı"
          : "karşı ittifak duvarı"
        : own.y > 0
          ? "uzak duvar"
          : "seyirci duvarı";
    sources.push({
      id: `flower-${i}`,
      kind: "flower",
      label: `FLOWER · ${wall}`,
      balls,
      points: [{ x: c.x, y: c.y }],
      approach: { x: c.x, y: c.y, facing: Math.atan2(-n.y, -n.x) },
    });
  });
  return sources;
}

/** Point-symmetric copy of a pose for the red alliance (blue unchanged). */
export function forAlliance(alliance: Alliance, p: Pose): Pose {
  const q = flip(alliance, p);
  return { x: q.x, y: q.y, h: flipH(alliance, p.h) };
}
