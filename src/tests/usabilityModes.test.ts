import { describe, expect, it } from "vitest";
import {
  atLeast,
  bottomTabsFor,
  initialUiMode,
  propertyTabsFor,
  UI_MODE_KEY,
  uiModes,
} from "../app/uiMode";
import { applyRobotType, robotTypes } from "../presets/robotTypes";
import { current, recalc, presets } from "../presets";
import { parseConfig } from "../utils/config";
import { simulate } from "../physics/flight";
import { launchInertia } from "../physics/launchDynamics";
import { useStore } from "../state/store";
import { captureScenario } from "../utils/scenario";

const storage = (entries: Record<string, string>) => ({
  getItem: (k: string) => entries[k] ?? null,
});

describe("interface modes", () => {
  it("starts new visitors in Kolay and keeps returning users on the full workbench", () => {
    expect(initialUiMode(storage({}))).toBe("easy");
    expect(initialUiMode(storage({ "pollen-active": "{}" }))).toBe("hard");
    expect(initialUiMode(storage({ "pollen-profiles": "[]" }))).toBe("hard");
    expect(
      initialUiMode(
        storage({ [UI_MODE_KEY]: "medium", "pollen-active": "{}" }),
      ),
    ).toBe("medium");
    expect(initialUiMode(storage({ [UI_MODE_KEY]: "bogus" }))).toBe("easy");
  });

  it("only ever adds controls as the mode rises; Zor keeps every existing tab", () => {
    const [easy, medium, hard] = uiModes.map((m) => m.id);
    for (const tabs of [propertyTabsFor, bottomTabsFor]) {
      expect(tabs(easy).every((t) => tabs(medium).includes(t))).toBe(true);
      expect(tabs(medium).every((t) => tabs(hard).includes(t))).toBe(true);
    }
    expect(propertyTabsFor("hard")).toEqual([
      "Shooter",
      "Physics",
      "Field",
      "Analysis",
      "Sekiş",
    ]);
    expect(bottomTabsFor("hard")).toEqual([
      "Flight telemetry",
      "Shot metrics",
      "Shot history",
      "Debug state",
    ]);
    expect(propertyTabsFor("easy")).toEqual(["Shooter", "Sekiş"]);
    expect(atLeast("hard", "medium") && !atLeast("easy", "medium")).toBe(true);
  });

  it("switching modes never changes the physical scenario or enters saved files", () => {
    const before = JSON.stringify(captureScenario(useStore.getState()));
    for (const m of ["easy", "medium", "hard", "easy"] as const) {
      useStore.getState().setUiMode(m);
      expect(useStore.getState().uiMode).toBe(m);
      expect(JSON.stringify(captureScenario(useStore.getState()))).toBe(before);
    }
    expect(before).not.toMatch(/uiMode/);
  });
});

describe("robot types", () => {
  const run = (id: (typeof robotTypes)[number]["id"]) => {
    const c = parseConfig(
      JSON.parse(JSON.stringify(applyRobotType(current, id))),
    );
    return { c, s: simulate(c, launchInertia(c)) };
  };
  const rpm = (w: number) => (w * 60) / (2 * Math.PI);

  it("replace only the shooter: pose, field, POLLEN and calibration flag are kept honest", () => {
    const moved = structuredClone(current);
    moved.robot.x = 0.3;
    moved.calibrated = true;
    for (const t of robotTypes) {
      const q = applyRobotType(moved, t.id);
      expect(q.robot).toEqual(moved.robot);
      expect(q.field).toEqual(moved.field);
      expect(q.projectile).toEqual(moved.projectile);
      expect(q.calibrated).toBe(false);
      expect(() => parseConfig(JSON.parse(JSON.stringify(q)))).not.toThrow();
      expect(t.description.length).toBeGreaterThan(20);
    }
  });

  it("keeps the current robot's mechanism and the existing presets unchanged", () => {
    expect(applyRobotType(current, "powered-hood").shooter).toEqual(
      current.shooter,
    );
    expect(presets).toContain(current);
    expect(presets).toContain(recalc);
  });

  it("produce the mechanism-specific behaviour of the shared contact model", () => {
    const powered = run("powered-hood").s.shooter,
      independent = run("independent-hood").s.shooter,
      passive = run("passive-hood").s.shooter,
      opposed = run("opposed-wheels").s.shooter;
    for (const x of [powered, independent, passive, opposed])
      expect(x.exited).toBe(true);
    // Fixed hood: only the lower wheel drives → slower exit with strong backspin.
    expect(passive.surfaceSpeeds.slice(1).every((v) => v === 0)).toBe(true);
    expect(passive.speed).toBeLessThan(0.7 * powered.speed);
    expect(rpm(passive.spin)).toBeGreaterThan(500);
    // Slower independent hood → speed difference → more spin than the matched gear link.
    expect(independent.surfaceSpeeds[1]).toBeLessThan(powered.surfaceSpeeds[1]);
    expect(Math.abs(rpm(independent.spin))).toBeGreaterThan(
      Math.abs(rpm(powered.spin)) + 50,
    );
    // Equal top/bottom surface speed → little spin, near-wheel-speed exit.
    expect(opposed.surfaceSpeeds).toHaveLength(2);
    expect(opposed.surfaceSpeeds[1]).toBeCloseTo(opposed.surfaceSpeeds[0], 6);
    expect(Math.abs(rpm(opposed.spin))).toBeLessThan(150);
    expect(opposed.speed).toBeGreaterThan(0.85 * opposed.surfaceSpeeds[0]);
  });
});
