import { describe, expect, it } from "vitest";
import { current } from "../presets";
import {
  calibrationStamp,
  measurementConfig,
  parseMeasurements,
  verifyCalibration,
  type Measurement,
} from "../physics/analysis";
import { simulate } from "../physics/flight";
import { ballModelSettings, launchInertia } from "../physics/launchDynamics";
import {
  captureScenario,
  defaultScenario,
  parseScenario,
} from "../utils/scenario";
import { decodeShare, encodeShare, SHARE_PREFIX } from "../utils/share";
import { previewStatus } from "../app/usePreviewSimulation";
import type { Shot } from "../physics/types";

const model = ballModelSettings(defaultScenario().bounceSettings);
const row = (over: Partial<Measurement> = {}): Measurement => ({
  id: "shot-1",
  split: "training",
  primaryRPM: 1450,
  secondaryRPM: 1450 * 3.75,
  rollerRPMs: [1450 * 3.75, 1450 * 3.75],
  hoodDeg: 65,
  exitVelocity: 7.2,
  ...over,
});

describe("preview status", () => {
  const a = { config: structuredClone(current), model };
  const b = { config: structuredClone(current), model };
  const shot = { id: "a" } as unknown as Shot;
  it("is pending on the very first render after an edit", () => {
    const settled = { request: a, shot, error: "" };
    expect(previewStatus(a, settled, settled)).toMatchObject({
      pending: false,
      stale: false,
    });
    expect(previewStatus(b, settled, settled)).toMatchObject({
      pending: true,
      stale: true,
      shot,
    });
  });
  it("keeps the last good shot, marked stale, when the current request fails", () => {
    const good = { request: a, shot, error: "" };
    const failed = { request: b, shot: null, error: "budget" };
    expect(previewStatus(b, failed, good)).toEqual({
      shot,
      error: "budget",
      pending: false,
      stale: true,
    });
    // an old failure is not reported against a newer configuration
    const c = { config: structuredClone(current), model };
    expect(previewStatus(c, failed, good).error).toBe("");
  });
});

describe("shared measurement parsing", () => {
  it("accepts the documented schema", () => {
    expect(
      parseMeasurements([row(), row({ id: "v", split: "validation" })]),
    ).toHaveLength(2);
  });
  it.each([
    ["NaN RPM", [row({ primaryRPM: NaN })]],
    ["huge RPM", [row({ primaryRPM: 1e9 })]],
    ["duplicate id", [row(), row()]],
    ["no observation", [row({ exitVelocity: undefined })]],
    ["time without impact", [row({ time: 0.3 })]],
    ["impact without time", [row({ impact: [1, 2, 0.5] })]],
    ["non-array", { rows: [] }],
    ["empty", []],
    [
      "too many rows",
      Array.from({ length: 501 }, (_, i) => row({ id: `r${i}` })),
    ],
  ])("rejects %s", (_, value) => {
    expect(() => parseMeasurements(value)).toThrow();
  });
});

describe("calibration evidence", () => {
  const validation = () => {
    const r = row({
      id: "held-out",
      split: "validation",
      exitVelocity: undefined,
    });
    const q = measurementConfig(current, r);
    const s = simulate(q, launchInertia(q, model), model);
    return { ...r, exitVelocity: s.shooter.speed };
  };
  it("passes held-out data the current model predicts and fails perturbed data", () => {
    const exact = validation();
    expect(verifyCalibration(current, [row(), exact], model).passed).toBe(true);
    const off = { ...exact, exitVelocity: exact.exitVelocity! + 1 };
    expect(verifyCalibration(current, [row(), off], model).passed).toBe(false);
    expect(verifyCalibration(current, [row()], model).passed).toBe(false); // no held-out rows
  });
  it("stamp ignores name and the legacy flag but follows physics edits", () => {
    const q = structuredClone(current);
    q.name = "renamed";
    q.calibrated = true;
    expect(calibrationStamp(q, model)).toBe(calibrationStamp(current, model));
    q.aero.cd += 0.01;
    expect(calibrationStamp(q, model)).not.toBe(
      calibrationStamp(current, model),
    );
  });
  it("stores only stamp and measurements; a stored pass flag is discarded", () => {
    const scenario = {
      ...defaultScenario(),
      calibration: {
        stamp: calibrationStamp(current, model),
        measurements: [row()],
        validationPassed: true,
      },
    };
    const parsed = parseScenario(JSON.parse(JSON.stringify(scenario)));
    expect(parsed.calibration).toEqual({
      stamp: scenario.calibration.stamp,
      measurements: [row()],
    });
    expect(parsed.config.calibrated).toBe(false);
  });
  it("still loads profiles without calibration evidence and rejects malformed evidence", () => {
    expect(
      parseScenario(JSON.parse(JSON.stringify(defaultScenario()))).calibration,
    ).toBeUndefined();
    const bad = {
      ...defaultScenario(),
      calibration: { stamp: "nope", measurements: [row()] },
    };
    expect(() => parseScenario(bad)).toThrow(/calibration/);
    const badRows = {
      ...defaultScenario(),
      calibration: {
        stamp: "v1-0123456789abcdef",
        measurements: [row({ primaryRPM: -1 })],
      },
    };
    expect(() => parseScenario(badRows)).toThrow();
  });
});

describe("share links", () => {
  it("round-trips the same settings, including calibration evidence", async () => {
    const state = {
      ...defaultScenario(),
      residentCount: 3,
      calibration: {
        stamp: calibrationStamp(current, model),
        measurements: [row()],
      },
    };
    const hash = await encodeShare(state);
    expect(hash.startsWith(SHARE_PREFIX)).toBe(true);
    expect(hash.length).toBeLessThan(16_000);
    const decoded = await decodeShare(hash);
    expect(decoded).toEqual(
      parseScenario(JSON.parse(JSON.stringify(captureScenario(state)))),
    );
  });
  it("rejects other versions, bad characters, corrupted data and oversize links", async () => {
    await expect(decodeShare("#s=2.abc")).rejects.toThrow(/version/);
    await expect(decodeShare(`${SHARE_PREFIX}abc$`)).rejects.toThrow(
      /base64url/,
    );
    await expect(decodeShare(`${SHARE_PREFIX}AAAA`)).rejects.toThrow();
    await expect(
      decodeShare(SHARE_PREFIX + "A".repeat(100_000)),
    ).rejects.toThrow(/too long/);
  });
  it("refuses a small link that inflates past the JSON limit", async () => {
    const bomb = new TextEncoder().encode(`"${" ".repeat(2 * 1024 * 1024)}"`);
    const compressed = new Uint8Array(
      await new Response(
        new Blob([bomb])
          .stream()
          .pipeThrough(new CompressionStream("deflate-raw")),
      ).arrayBuffer(),
    );
    let binary = "";
    for (const b of compressed) binary += String.fromCharCode(b);
    const link =
      SHARE_PREFIX +
      btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(link.length).toBeLessThan(96 * 1024);
    await expect(decodeShare(link)).rejects.toThrow(/expands beyond/);
  });
  it("rejects a valid link carrying an invalid scenario", async () => {
    const hash = await encodeShare({ ...defaultScenario(), residentCount: 99 });
    await expect(decodeShare(hash)).rejects.toThrow(/resident/);
  });
});
