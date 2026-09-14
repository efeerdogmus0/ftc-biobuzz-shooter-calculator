import type { FieldConfig } from "../physics/types";

const inches = (value: number) => value * 0.0254;

/** Section 9 ARENA V1, 2026-09-12. Deployed HIVE geometry derived from Figures 9-7–9-11. */
export const fieldConfig: FieldConfig = {
  size: 3.6576,
  wallHeight: 0.3,
  wallThickness: 0.0254,
  target: {
    // Blue HIVE's upward-facing CELL in the deployed Figure 9-10 attitude.
    // CELL plane is 30° from vertical, therefore its opening normal is 60° from Z.
    center: [inches(12.75), -inches(6.5), inches(59.55)],
    width: inches(20),
    height: inches(14),
    shoulderHeight: inches(7.61),
    depth: inches(12.04),
    yaw: 0,
    tilt: -Math.PI / 3,
    thickness: 0.012,
    provenance:
      "FIRST BIOBUZZ Competition Manual Section 9 V1, Figures 9-9–9-11: blue upward CELL in the published 30° deployed HIVE position.",
  },
  hive: {
    frameWidth: inches(49.46),
    frameDepth: inches(38.95),
    pivotHeight: inches(43.95),
    allianceCenterSpacing: inches(25.5),
    cellGap: inches(18.84),
    assemblySpan: inches(42.91),
    cellWidth: inches(20),
    cellHeight: inches(14),
    cellShoulderHeight: inches(7.61),
    cellDepth: inches(12.04),
    deployedCellPlaneAngle: Math.PI / 6,
    topOpeningHeight: inches(65.6),
    bottomOpeningHeight: inches(53.5),
    bottomHeight: inches(25.5),
    provenance:
      "FIRST BIOBUZZ Competition Manual Section 9 V1, Figures 9-7–9-11. Dimensions are modeled from the published field drawings; official CAD remains the fabrication authority.",
  },
  obstacles: [],
  provenance:
    "144 in field and centered HIVE from FIRST BIOBUZZ ARENA V1. Rendered HIVE uses the published deployed bi-stable pose; scoring collision uses the blue upward CELL opening.",
};
