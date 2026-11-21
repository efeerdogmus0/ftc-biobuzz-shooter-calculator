// Shot points and the chassis are one shared model: saved with the robot,
// carried by share links, and kept in step by the store.
import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../state/store";
import {
  captureScenario,
  defaultScenario,
  MAX_SHOT_POINTS,
  parseScenario,
  parseShotPoints,
  type ShotPoint,
} from "../utils/scenario";
import { decodeShare, encodeShare } from "../utils/share";
import { placed, pointHere } from "../app/shotPoints";

const point = (over: Partial<ShotPoint> = {}): ShotPoint => ({
  id: "a",
  name: "Yakın",
  x: 0.5,
  y: -0.6,
  heading: 1,
  omega: 250,
  hoodAngle: 0.9,
  clearance: 0.03,
  source: "manual",
  ...over,
});

describe("shot points in saved robots", () => {
  it("opens robots saved before shot points existed with an empty list", () => {
    const old = JSON.parse(JSON.stringify(captureScenario(defaultScenario())));
    expect(old.shotPoints).toBeUndefined();
    const s = parseScenario(old);
    expect(s.shotPoints ?? []).toEqual([]);
    expect(s.chassis ?? null).toBeNull();
    useStore.getState().setScenario(s);
    expect(useStore.getState().shotPoints).toEqual([]);
    expect(useStore.getState().chassis).toBeNull();
  });
  it("drops broken points instead of refusing the robot", () => {
    const list = parseShotPoints([
      point(),
      { ...point({ id: "b" }), x: "0.5" },
      { ...point({ id: "c" }), x: 9 },
      { ...point({ id: "d" }), omega: -1 },
      point({ id: "a", x: 1 }), // repeated id
      null,
    ]);
    expect(list.map((p) => p.id)).toEqual(["a"]);
    expect(parseShotPoints("x")).toEqual([]);
    expect(
      parseShotPoints(
        Array.from({ length: 60 }, (_, i) => point({ id: `p${i}` })),
      ),
    ).toHaveLength(MAX_SHOT_POINTS);
  });
  it("survives save and a share link, with the chassis", async () => {
    const state = {
      ...defaultScenario(),
      shotPoints: [point({ reliability: 0.82 })],
      chassis: { drive: "tank" as const, turret: true },
    };
    const saved = parseScenario(
      JSON.parse(JSON.stringify(captureScenario(state))),
    );
    expect(saved.shotPoints).toEqual(state.shotPoints);
    expect(saved.chassis).toEqual(state.chassis);
    const shared = await decodeShare(await encodeShare(state));
    expect(shared.shotPoints).toEqual(state.shotPoints);
    expect(shared.chassis).toEqual(state.chassis);
  });
});

describe("shot points in the store", () => {
  beforeEach(() => useStore.getState().setScenario(defaultScenario()));
  const cell = { x: 0, y: 0, candidate: null };

  it("updates the point at the same place instead of adding a twin", () => {
    const s = useStore.getState();
    const p = {
      x: 0.5,
      y: -0.6,
      heading: 1,
      omega: 250,
      hoodAngle: 0.9,
      clearance: 0.03,
      source: "manual" as const,
    };
    s.saveShotPoint(p);
    s.saveShotPoint({ ...p, x: p.x + 0.005, omega: 300 });
    s.saveShotPoint({ ...p, x: p.x + 0.5 });
    const list = useStore.getState().shotPoints;
    expect(list.map((q) => q.name)).toEqual(["P1", "P2"]);
    expect(list[0].omega).toBe(300);
    s.renameShotPoint(list[0].id, "Uzak");
    s.removeShotPoint(list[1].id);
    expect(useStore.getState().shotPoints.map((q) => q.name)).toEqual(["Uzak"]);
  });
  it("keeps the coverage map when only pose, speed or hood change", () => {
    const s = useStore.getState();
    s.set({ coverage: [cell] });
    const c = s.config;
    s.setConfig(placed(c, 0.4, -0.7, c.shooter.hoodAngle, 123));
    expect(useStore.getState().coverage).toHaveLength(1);
    const q = structuredClone(useStore.getState().config);
    q.shooter.primary.diameter *= 1.1;
    useStore.getState().setConfig(q);
    expect(useStore.getState().coverage).toHaveLength(0);
  });
  it("recognises the saved point the robot stands on", () => {
    const s = useStore.getState();
    const c = placed(s.config, 0.5, -0.6, s.config.shooter.hoodAngle, 250);
    const p = point({ hoodAngle: c.shooter.hoodAngle });
    expect(pointHere([p], c)?.id).toBe("a");
    expect(pointHere([{ ...p, omega: 260 }], c)).toBeUndefined();
    expect(pointHere([{ ...p, x: 0.6 }], c)).toBeUndefined();
  });
});
