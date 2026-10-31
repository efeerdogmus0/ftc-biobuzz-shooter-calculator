import type { FieldConfig, TargetConfig, Vec3 } from "../physics/types";
import { targetBasis } from "../physics/cellGeometry";
import { axisRotation, rotate } from "../physics/rigidMath";
import { add, sub, scale, cross, dot } from "../physics/math";

export type HiveAlliance = "RED" | "BLUE";
export interface HiveCell {
  id: string;
  alliance: HiveAlliance;
  center: Vec3;
  yaw: number;
  tilt: number;
  active: boolean;
}

/** Four CELLS in the published deployed state. The blue upward CELL is the scoring volume. */
export function hiveCells(field: FieldConfig): HiveCell[] {
  const { hive, target } = field;
  const halfAlliance = hive.allianceCenterSpacing / 2;
  const lower = oppositeCellTarget(field);
  const blueUp: HiveCell = {
    id: "blue-upward-cell",
    alliance: "BLUE",
    center: target.center,
    yaw: target.yaw,
    tilt: target.tilt,
    active: true,
  };
  return [
    {
      id: "red-upward-cell",
      alliance: "RED",
      center: [-halfAlliance, -target.center[1], target.center[2]],
      yaw: Math.PI,
      tilt: target.tilt,
      active: false,
    },
    {
      id: "red-lower-cell",
      alliance: "RED",
      center: [-halfAlliance, -lower.center[1], lower.center[2]],
      yaw: 0,
      tilt: lower.tilt,
      active: false,
    },
    blueUp,
    {
      id: "blue-lower-cell",
      alliance: "BLUE",
      center: lower.center,
      yaw: lower.yaw,
      tilt: lower.tilt,
      active: false,
    },
  ];
}
export function oppositeCellTarget(field: FieldConfig): TargetConfig {
  const t = field.target,
    a = field.hive.deployedCellPlaneAngle,
    axis = targetBasis(t).u,
    pivot: Vec3 = [t.center[0], 0, field.hive.pivotHeight],
    level = rotate(axisRotation(axis, a), sub(t.center, pivot)),
    along = cross([0, 0, 1], axis),
    mirrored = sub(level, scale(along, 2 * dot(level, along)));
  return {
    ...t,
    center: add(pivot, rotate(axisRotation(axis, -a), mirrored)),
    yaw: t.yaw + Math.PI,
    tilt: -Math.PI - t.tilt,
  };
}

export function hiveCellTarget(
  cell: HiveCell,
  field: FieldConfig,
): TargetConfig {
  return {
    ...field.target,
    center: cell.center,
    yaw: cell.yaw,
    tilt: cell.tilt,
  };
}

/** Stable contact order: active blue, opposite blue, then the two fixed red CELLS. */
export function collisionCells(field: FieldConfig) {
  const cells = hiveCells(field);
  return [
    cells.find((c) => c.active)!,
    cells.find((c) => c.alliance === "BLUE" && !c.active)!,
    ...cells.filter((c) => c.alliance === "RED"),
  ].map((cell, index) => ({
    target: hiveCellTarget(cell, field),
    moving: index < 2,
    prefix: ["", "Opposite ", "Red upward ", "Red lower "][index],
  }));
}
