import type { FieldConfig } from "../physics/types";

const inches = (value: number) => value * 0.0254;

/**
 * Deployed blue upward CELL opening center, from BIOBUZZ Competition Manual
 * TU01 §9.6 (Figures 9-8–9-11), in inches, pivot axis along X at Y=0:
 * - Pivot axis 43.95 above the TILES (§9.6.1). The HIVE assembly is 42.91 long
 *   with the pivot at its middle (Fig. 9-9), so each CELL opening face is
 *   L = 21.455 from the pivot along the arm.
 * - The arm is 30° from horizontal (Fig. 9-10), so the opening plane is 30°
 *   from vertical and its 14 in height spans 14·sin 60° = 12.1 vertically,
 *   matching 65.6 − 53.5 (Fig. 9-10). Opening center Z = (65.6 + 53.5)/2 = 59.55.
 * - Z − pivot = 15.6 > L·sin 30° = 10.73, so the opening center sits
 *   h = (15.6 − 10.73)/cos 30° = 5.63 above the arm axis (perpendicular).
 * - Horizontal distance from the pivot: L·cos 30° − h·sin 30° = 15.77, on the
 *   −Y side for the blue upward CELL (outward normal points −Y and up).
 */
export const hiveArm = (() => {
  const plane = Math.PI / 6,
    pivot = 43.95,
    half = 42.91 / 2,
    openingZ = (65.6 + 53.5) / 2;
  const offset = (openingZ - pivot - half * Math.sin(plane)) / Math.cos(plane);
  return {
    half: inches(half),
    offset: inches(offset),
    upY: -inches(half * Math.cos(plane) - offset * Math.sin(plane)),
    upZ: inches(openingZ),
    lowY: inches(half * Math.cos(plane) + offset * Math.sin(plane)),
    lowZ: inches(pivot - half * Math.sin(plane) + offset * Math.cos(plane)),
  };
})();

/** Section 9 ARENA V1, 2026-09-12. Deployed HIVE geometry derived from Figures 9-7–9-11. */
export const fieldConfig: FieldConfig = {
  size: 3.6576,
  wallHeight: 0.3,
  wallThickness: 0.0254,
  target: {
    // Blue HIVE's upward-facing CELL in the deployed Figure 9-10 attitude.
    // CELL plane is 30° from vertical, therefore its opening normal is 60° from Z.
    center: [inches(12.75), hiveArm.upY, hiveArm.upZ],
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
    // "Bottom of HIVE above TILES", Fig. 9-10 (25.5 in is the HIVE spacing).
    bottomHeight: inches(30.6),
    provenance:
      "FIRST BIOBUZZ Competition Manual Section 9 V1, Figures 9-7–9-11. Dimensions are modeled from the published field drawings; official CAD remains the fabrication authority.",
  },
  obstacles: [
    {
      min: [-inches(49.46) / 2, -inches(38.95) / 2, 0],
      max: [inches(49.46) / 2, inches(38.95) / 2, 0.3],
      name: "HIVE footprint / robot no-go",
    },
    {
      min: [-inches(49.46) / 2, -0.03, inches(43.95) - 0.03],
      max: [inches(49.46) / 2, 0.03, inches(43.95) + 0.03],
      name: "HIVE pivot crossbar",
    },
  ],
  provenance:
    "144 in field and centered HIVE from FIRST BIOBUZZ ARENA V1. Rendered HIVE uses the published deployed bi-stable pose; scoring collision uses the blue upward CELL opening. The footprint is a robot no-go volume for coverage.",
};
