import type { FieldConfig, TargetConfig, Vec3 } from "../physics/types";
import { hiveArm } from "./fieldConfig";

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
  // Downward CELLS sit at the other end of the same 30° arm (see hiveArm).
  const lowY = hiveArm.lowY,
    lowerZ = hiveArm.lowZ;
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
      center: [-halfAlliance, -lowY, lowerZ],
      yaw: Math.PI,
      tilt: Math.PI - target.tilt,
      active: false,
    },
    blueUp,
    {
      id: "blue-lower-cell",
      alliance: "BLUE",
      center: [halfAlliance, lowY, lowerZ],
      yaw: 0,
      tilt: Math.PI - target.tilt,
      active: false,
    },
  ];
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
