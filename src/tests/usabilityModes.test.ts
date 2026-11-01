import { describe, expect, it } from "vitest";
import {
  atLeast,
  bottomTabsFor,
  initialUiMode,
  propertyTabsFor,
  UI_MODE_KEY,
  uiModes,
} from "../app/uiMode";
import { useStore } from "../state/store";
import { captureScenario } from "../utils/scenario";

const storage = (entries: Record<string, string>) => ({
  getItem: (k: string) => entries[k] ?? null,
});

describe("interface modes", () => {
  it("keeps a chosen mode and otherwise starts in Kolay — saved work is not expertise", () => {
    expect(initialUiMode(storage({}))).toBe("easy");
    expect(initialUiMode(storage({ "pollen-active": "{}" }))).toBe("easy");
    expect(initialUiMode(storage({ "pollen-profiles": "[]" }))).toBe("easy");
    expect(
      initialUiMode(storage({ [UI_MODE_KEY]: "hard", "pollen-active": "{}" })),
    ).toBe("hard");
    expect(initialUiMode(storage({ [UI_MODE_KEY]: "medium" }))).toBe("medium");
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
    // Auto solve lives in Analysis, which every mode shows: no forced mode switch.
    for (const m of uiModes)
      expect(propertyTabsFor(m.id)).toContain("Analysis");
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
