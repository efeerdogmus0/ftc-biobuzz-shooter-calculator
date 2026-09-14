import type { FieldConfig, TargetConfig, Vec3 } from "../physics/types";

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
  const centerSeparation = hive.cellGap + hive.cellDepth;
  const rise =
    target.center[2] -
    (hive.bottomHeight + (hive.cellHeight * Math.cos(Math.PI / 6)) / 2);
  const lateral = Math.sqrt(Math.max(0, centerSeparation ** 2 - rise ** 2));
  const lowerZ =
    hive.bottomHeight + (hive.cellHeight * Math.cos(Math.PI / 6)) / 2;
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
      center: [-halfAlliance, lateral / 2, target.center[2]],
      yaw: Math.PI,
      tilt: target.tilt,
      active: false,
    },
    {
      id: "red-lower-cell",
      alliance: "RED",
      center: [-halfAlliance, -lateral / 2, lowerZ],
      yaw: Math.PI,
      tilt: Math.PI - target.tilt,
      active: false,
    },
    blueUp,
    {
      id: "blue-lower-cell",
      alliance: "BLUE",
      center: [halfAlliance, lateral / 2, lowerZ],
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
