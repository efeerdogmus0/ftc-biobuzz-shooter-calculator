import type { Vec3 } from "../physics/types";

const inch = 0.0254;

/** Section 9 V1, 9.7 / Fig. 9-12. Small hardware dimensions are visual approximations. */
export const flowerDimensions = {
  openingRadius: 2 * inch,
  openingHeight: 21.5 * inch,
  backstopHeight: 1.25 * inch,
  bottomOpeningRadius: (2.79 * inch) / 2,
  bottomThickness: 0.43 * inch,
  retrievalHeight: 3.55 * inch,
  outerRadius: 0.073,
  ringThickness: 0.01,
  pipeRadius: 0.009,
  pipeOffset: 0.044,
};

/** Fig. 9-2: one on each wall at the second/fourth tile seam.
 * Wall standoff is approximated from the model envelope, not a surveyed CAD datum.
 * Local +Y faces the perimeter; the lower retrieval opening faces local -Y.
 */
export function flowerPlacements(
  fieldSize: number,
): { id: string; position: Vec3; yaw: number }[] {
  const wall = fieldSize / 2 - flowerDimensions.outerRadius;
  const seam = fieldSize / 6;
  return [
    { id: "north-flower", position: [-seam, wall, 0], yaw: 0 },
    { id: "east-flower", position: [wall, seam, 0], yaw: -Math.PI / 2 },
    { id: "south-flower", position: [seam, -wall, 0], yaw: Math.PI },
    { id: "west-flower", position: [-wall, -seam, 0], yaw: Math.PI / 2 },
  ];
}
