import type { Box } from "../physics/types";

/** Legacy names are migrated on import; direct callers also retain their meaning. */
export function obstaclePurpose(box: Box): NonNullable<Box["purpose"]> {
  return (
    box.purpose ??
    (box.name === "HIVE footprint / robot no-go"
      ? "robot-exclusion"
      : box.name === "HIVE pivot crossbar"
        ? "hive-proxy"
        : "solid")
  );
}
