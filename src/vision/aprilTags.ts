// BIOBUZZ AprilTags (Competition Manual Section 9 TU04, 9.9, Figures 9-15–9-17).
//
// - 36h11 family, 3.25 in square, four tags per AprilTag Cluster sticker.
// - One cluster on the bottom (flat) face of each CELL, facing down towards
//   the TILES, its reference-hole edge towards the field centre.
// - IDs: 30–33 red CELL opposite the audience, 34–37 red CELL audience side,
//   38–41 blue CELL audience side, 42–45 blue CELL opposite the audience.
//   Order along X as drawn in Figure 9-17 (top view, audience at the bottom).
// - Sticker layout (Fig. 9-15): tag centres 2.75 in and 6.5 in either side of
//   the cluster centreline, 2.75 in from the reference-hole line; that line is
//   9.938 in from the CELL front (opening).
//
// Field frame: +Y is the side opposite the audience (the north FLOWER wall,
// Fig. 9-2 / 9-17), red HIVE at -X. Tags follow the CELLS in the modelled
// deployed HIVE state; when a HIVE flips, its tags move with it.
import type { FieldConfig, Vec3 } from "../physics/types";
import { targetWorld, targetBasis } from "../physics/cellGeometry";
import { hiveCells, hiveCellTarget } from "../field/hiveGeometry";
import { scale } from "../physics/math";

const inch = 0.0254;
export const TAG_SIZE = 3.25 * inch;
export const TAG_FAMILY = "36h11";
const TAG_OFFSETS = [-6.5, -2.75, 2.75, 6.5].map((v) => v * inch);
const TAG_DEPTH = (9.938 - 2.75) * inch;

export interface AprilTag {
  id: number;
  alliance: "RED" | "BLUE";
  side: "audience" | "far";
  cellId: string;
  center: Vec3;
  /** Outward normal of the printed face (points down, towards the TILES). */
  normal: Vec3;
  corners: [Vec3, Vec3, Vec3, Vec3];
}

const firstId = {
  RED: { far: 30, audience: 34 },
  BLUE: { audience: 38, far: 42 },
} as const;
// Figure 9-17 lists the far clusters right-to-left (33…30, 45…42).
const descending = { far: true, audience: false } as const;

export function aprilTags(field: FieldConfig): AprilTag[] {
  const tags: AprilTag[] = [];
  for (const cell of hiveCells(field)) {
    const t = hiveCellTarget(cell, field),
      { v } = targetBasis(t);
    const side = cell.center[1] > 0 ? "far" : "audience";
    // Printed face on the outside of the flat CELL wall.
    const plane = -t.height / 2 - t.thickness;
    const half = TAG_SIZE / 2;
    const placed = TAG_OFFSETS.map((du) => {
      const local = (a: number, b: number): Vec3 => [
        du + a,
        plane,
        -TAG_DEPTH + b,
      ];
      return {
        center: targetWorld(local(0, 0), t),
        corners: [
          targetWorld(local(-half, -half), t),
          targetWorld(local(half, -half), t),
          targetWorld(local(half, half), t),
          targetWorld(local(-half, half), t),
        ] as AprilTag["corners"],
      };
    }).sort((a, b) =>
      descending[side] ? b.center[0] - a.center[0] : a.center[0] - b.center[0],
    );
    placed.forEach((p, i) =>
      tags.push({
        id: firstId[cell.alliance][side] + i,
        alliance: cell.alliance,
        side,
        cellId: cell.id,
        center: p.center,
        normal: scale(v, -1),
        corners: p.corners,
      }),
    );
  }
  return tags.sort((a, b) => a.id - b.id);
}
