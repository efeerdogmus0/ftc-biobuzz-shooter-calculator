import { describe, expect, it } from "vitest";
import { fieldConfig } from "../field/fieldConfig";
import { hiveCells, hiveCellTarget } from "../field/hiveGeometry";
import { targetLocal } from "../physics/cellGeometry";
import { norm, sub } from "../physics/math";
import { current } from "../presets";
import { aprilTags, TAG_SIZE } from "../vision/aprilTags";
import {
  cameraPose,
  defaultCamera,
  parseCamera,
  viewAll,
  viewTag,
  visionMap,
  visionScene,
  type CameraPose,
  type CameraSettings,
} from "../vision/limelight";
import {
  captureScenario,
  defaultScenario,
  parseScenario,
} from "../utils/scenario";

const inch = 0.0254;
const tags = aprilTags(fieldConfig);
const scene = visionScene(fieldConfig);
const byId = (id: number) => tags.find((t) => t.id === id)!;
/** A camera at `position` looking along `forward` (unit), no roll. */
function lookAt(position: number[], target: number[]): CameraPose {
  const settings: CameraSettings = { ...defaultCamera, forward: 0, left: 0 };
  const d = sub(target as never, position as never),
    yaw = Math.atan2(d[1], d[0]),
    pitch = Math.atan2(d[2], Math.hypot(d[0], d[1]));
  return cameraPose(
    { ...settings, up: position[2], pitch: (pitch * 180) / Math.PI },
    position[0],
    position[1],
    yaw,
  );
}

describe("BIOBUZZ AprilTags (Manual 9.9)", () => {
  it("places IDs 30–45 under the four CELLS, 3.25 in square, facing down", () => {
    expect(tags.map((t) => t.id)).toEqual(
      Array.from({ length: 16 }, (_, i) => 30 + i),
    );
    for (const t of tags) {
      expect(t.normal[2]).toBeLessThan(-0.5);
      for (let i = 0; i < 4; i++)
        expect(norm(sub(t.corners[i], t.corners[(i + 1) % 4]))).toBeCloseTo(
          TAG_SIZE,
          9,
        );
      expect(t.alliance === "RED" ? t.center[0] < 0 : t.center[0] > 0).toBe(
        true,
      );
    }
    // +Y is the side opposite the audience.
    const side = (id: number) => (byId(id).center[1] > 0 ? "far" : "audience");
    for (let id = 30; id <= 33; id++) expect(side(id)).toBe("far");
    for (let id = 34; id <= 41; id++) expect(side(id)).toBe("audience");
    for (let id = 42; id <= 45; id++) expect(side(id)).toBe("far");
  });

  it("follows the Figure 9-17 order and the Figure 9-15 sticker layout", () => {
    const x = (id: number) => byId(id).center[0];
    // Seen from above, audience at the bottom: 33 32 31 30 | 45 44 43 42
    // and 34 35 36 37 | 38 39 40 41, left to right.
    expect(x(33) < x(32) && x(32) < x(31) && x(31) < x(30)).toBe(true);
    expect(x(45) < x(44) && x(44) < x(43) && x(43) < x(42)).toBe(true);
    expect(x(34) < x(35) && x(35) < x(36) && x(36) < x(37)).toBe(true);
    expect(x(38) < x(39) && x(39) < x(40) && x(40) < x(41)).toBe(true);
    for (const cell of hiveCells(fieldConfig)) {
      const t = hiveCellTarget(cell, fieldConfig);
      const local = tags
        .filter((tag) => tag.cellId === cell.id)
        .map((tag) => targetLocal(tag.center, t))
        .sort((a, b) => a[0] - b[0]);
      expect(local.map((p) => p[0] / inch)).toEqual(
        [-6.5, -2.75, 2.75, 6.5].map((v) => expect.closeTo(v, 6)),
      );
      for (const p of local) {
        expect(p[1]).toBeCloseTo(-t.height / 2 - t.thickness, 9);
        expect(p[2] / inch).toBeCloseTo(-(9.938 - 2.75), 6);
      }
    }
  });
});

describe("Limelight visibility", () => {
  const tag = byId(41);
  const below = [tag.center[0], tag.center[1] - 0.3, 0.25];

  it("sees a tag it looks straight at and explains every other case", () => {
    const pose = lookAt(below, tag.center);
    const v = viewTag(tag, pose, defaultCamera, scene);
    expect(v.reason).toBe("seen");
    expect(v.distance).toBeCloseTo(norm(sub(pose.position, tag.center)), 9);
    expect(v.pixels).toBeGreaterThan(defaultCamera.minTagPixels);
    expect(
      viewTag(tag, pose, { ...defaultCamera, minTagPixels: 500 }, scene).reason,
    ).toBe("small");
    expect(
      viewTag(tag, pose, { ...defaultCamera, maxViewAngle: 1 }, scene).reason,
    ).toBe("angle");
    // Looking the other way.
    const away = lookAt(below, [below[0], below[1] - 1, 0.25]);
    expect(viewTag(tag, away, defaultCamera, scene).reason).toBe("outside");
    // From above, the printed face points away.
    const above = lookAt([tag.center[0], tag.center[1], 2], tag.center);
    expect(viewTag(tag, above, defaultCamera, scene).reason).toBe("backface");
  });

  it("projects the tag centre to the image centre when aimed at it", () => {
    const pose = lookAt(below, tag.center);
    const img = viewTag(tag, pose, defaultCamera, scene).image!;
    const cx = img.reduce((s, p) => s + p[0], 0) / 4,
      cy = img.reduce((s, p) => s + p[1], 0) / 4;
    expect(cx).toBeCloseTo(defaultCamera.width / 2, 0);
    expect(cy).toBeCloseTo(defaultCamera.height / 2, 0);
  });

  it("finds poses where the HIVE frame hides a tag", () => {
    let blocked = 0;
    for (let x = -1.6; x <= 1.6; x += 0.2)
      for (let y = -1.6; y <= 1.6; y += 0.2)
        for (let k = 0; k < 8; k++) {
          const pose = cameraPose(defaultCamera, x, y, (k * Math.PI) / 4);
          blocked += viewAll(pose, defaultCamera, scene).filter(
            (v) => v.reason === "blocked",
          ).length;
        }
    expect(blocked).toBeGreaterThan(0);
  });

  it("turret mount turns the lens with the turret, chassis mount does not", () => {
    const turret: CameraSettings = { ...defaultCamera, mount: "turret" };
    const a = cameraPose(turret, 0, 0, 0, 0),
      b = cameraPose(turret, 0, 0, 0, Math.PI / 2);
    expect(b.forward[1]).toBeCloseTo(a.forward[0], 9);
    expect(b.position[1]).toBeCloseTo(defaultCamera.forward, 9);
    const c = cameraPose(defaultCamera, 0, 0, 0, Math.PI / 2);
    expect(c.forward).toEqual(a.forward);
  });

  it("maps the field and keeps the HIVE footprint empty", () => {
    const config = structuredClone(current);
    const map = visionMap(defaultCamera, config, "faceHive", 0.2);
    expect(map.cells.length).toBeGreaterThan(50);
    expect(map.oneOrMore).toBeGreaterThanOrEqual(map.twoOrMore);
    const hive = config.field.obstacles.find(
      (o) => o.purpose === "robot-exclusion",
    )!;
    for (const cell of map.cells)
      expect(
        cell.x > hive.min[0] &&
          cell.x < hive.max[0] &&
          cell.y > hive.min[1] &&
          cell.y < hive.max[1],
      ).toBe(false);
    const any = visionMap(defaultCamera, config, "anyHeading", 0.3);
    for (const cell of any.cells) {
      expect(cell.value).toBeGreaterThanOrEqual(0);
      expect(cell.value).toBeLessThanOrEqual(1);
    }
  });
});

describe("Limelight settings", () => {
  it("are validated and saved with the scenario, outside the physics config", () => {
    expect(parseCamera({ ...defaultCamera, pitch: 200 })).toBeNull();
    expect(parseCamera("x")).toBeNull();
    const camera = { ...defaultCamera, pitch: 31, mount: "turret" as const };
    const saved = captureScenario({ ...defaultScenario(), camera });
    const back = parseScenario(JSON.parse(JSON.stringify(saved)));
    expect(back.camera).toEqual(camera);
    expect("camera" in back.config).toBe(false);
    expect(parseScenario(defaultScenario()).camera ?? null).toBeNull();
  });
});
