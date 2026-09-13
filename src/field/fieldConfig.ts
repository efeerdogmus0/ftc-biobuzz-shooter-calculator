import type { FieldConfig } from "../physics/types";
/** Section 9 ARENA V1, 2026-09-12. Nominal CELL size; pose is editable engineering fixture,
 * not an assertion of official pivot/tilt geometry. Imported visual CAD never silently supplies collisions. */
export const fieldConfig: FieldConfig = {
  size: 3.6576,
  wallHeight: 0.3,
  wallThickness: 0.0254,
  target: {
    center: [0, 0, 1.25],
    width: 0.508,
    height: 0.3556,
    depth: 0.3048,
    yaw: 0,
    tilt: 0,
    thickness: 0.012,
    provenance:
      "CELL opening dimensions: official manual §9.6.2. Center height, tilt, frame solids: configurable engineering fixture; CAD verification required.",
  },
  obstacles: [],
  provenance:
    "144 in field / nominal CELL dimensions from FIRST BIOBUZZ ARENA V1. Simplified static single-CELL fixture, not the full tipping HIVE assembly.",
};
