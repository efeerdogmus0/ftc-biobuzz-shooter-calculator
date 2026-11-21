// The planner's shot map follows the main simulator: same ball model, the
// user's saved shot points, and the chassis described in the setup.
import { describe, expect, it } from "vitest";
import { current } from "../presets";
import { ballModelSettings } from "../physics/launchDynamics";
import { defaultScenario } from "../utils/scenario";
import { fits, shotGrid } from "./shotMap";
import { shooterKey } from "./useShotMaps";
import { manualRobot } from "./robot";
import { hiveNoGo } from "./field";

describe("shot map inputs", () => {
  const ball = ballModelSettings(defaultScenario().bounceSettings);
  it("is recomputed when the ball model or the saved points change", () => {
    const base = shooterKey(current, false, 0.25, ball);
    expect(shooterKey(current, false, 0.25, ball)).toBe(base);
    const other = { ...ball, asphericity: 0.05 };
    expect(shooterKey(current, false, 0.25, other)).not.toBe(base);
    expect(
      shooterKey(current, false, 0.25, ball, [{ x: 0.1, y: 0.2 }]),
    ).not.toBe(base);
    const moved = structuredClone(current);
    moved.robot.x += 0.5;
    expect(shooterKey(moved, false, 0.25, ball)).toBe(base);
  });
  it("adds saved points to the grid unless they cannot be driven to", () => {
    const grid = shotGrid(0.4, 0.2, 0.2);
    const inside = {
      x: (hiveNoGo.x0 + hiveNoGo.x1) / 2,
      y: (hiveNoGo.y0 + hiveNoGo.y1) / 2,
    };
    expect(fits(inside.x, inside.y, 0.2, 0.2)).toBe(false);
    const onGrid = grid[0];
    const free = { x: onGrid.x + 0.13, y: onGrid.y + 0.07 };
    expect(fits(free.x, free.y, 0.2, 0.2)).toBe(true);
    const out = shotGrid(0.4, 0.2, 0.2, [inside, onGrid, free, { x: 9, y: 0 }]);
    expect(out).toHaveLength(grid.length + 1);
    expect(out.at(-1)).toEqual(free);
  });
  it("takes drive type and turret from the robot's chassis", () => {
    expect(manualRobot(current, null).drive).toBe("holonomic");
    const r = manualRobot(current, null, { drive: "tank", turret: true });
    expect(r.drive).toBe("tank");
    expect(r.turret).toBe(true);
    expect(r.halfX).toBe(current.robot.length / 2);
  });
});
