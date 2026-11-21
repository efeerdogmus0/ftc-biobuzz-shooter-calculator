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

describe("interface layouts", () => {
  it("keeps a chosen layout and otherwise starts in Basit — saved work is not expertise", () => {
    expect(initialUiMode(storage({}))).toBe("simple");
    expect(initialUiMode(storage({ "pollen-active": "{}" }))).toBe("simple");
    expect(initialUiMode(storage({ "pollen-profiles": "[]" }))).toBe("simple");
    expect(initialUiMode(storage({ [UI_MODE_KEY]: "advanced" }))).toBe(
      "advanced",
    );
    expect(initialUiMode(storage({ [UI_MODE_KEY]: "bogus" }))).toBe("simple");
  });

  it("maps the older Kolay / Orta / Zor choices onto the two layouts", () => {
    expect(initialUiMode(storage({ [UI_MODE_KEY]: "easy" }))).toBe("simple");
    expect(initialUiMode(storage({ [UI_MODE_KEY]: "medium" }))).toBe(
      "advanced",
    );
    expect(
      initialUiMode(storage({ [UI_MODE_KEY]: "hard", "pollen-active": "{}" })),
    ).toBe("advanced");
  });

  it("Gelişmiş keeps every workbench tab; Basit only reaches a subset", () => {
    const [simple, advanced] = uiModes.map((m) => m.id);
    for (const tabs of [propertyTabsFor, bottomTabsFor])
      expect(tabs(simple).every((t) => tabs(advanced).includes(t))).toBe(true);
    expect(propertyTabsFor("advanced")).toEqual([
      "Shooter",
      "Physics",
      "Field",
      "Analysis",
      "Sekiş",
      "Limelight",
    ]);
    expect(bottomTabsFor("advanced")).toEqual([
      "Flight telemetry",
      "Shot metrics",
      "Shot history",
      "Debug state",
    ]);
    // Auto solve is reachable in both layouts: no forced switch.
    for (const m of uiModes)
      expect(propertyTabsFor(m.id)).toContain("Analysis");
    expect(atLeast("advanced", "advanced")).toBe(true);
    expect(atLeast("simple", "advanced")).toBe(false);
    expect(atLeast("simple", "simple")).toBe(true);
  });

  it("switching layouts never changes the physical scenario or enters saved files", () => {
    const before = JSON.stringify(captureScenario(useStore.getState()));
    for (const m of ["simple", "advanced", "simple"] as const) {
      useStore.getState().setUiMode(m);
      expect(useStore.getState().uiMode).toBe(m);
      expect(JSON.stringify(captureScenario(useStore.getState()))).toBe(before);
    }
    expect(before).not.toMatch(/uiMode/);
  });
});
