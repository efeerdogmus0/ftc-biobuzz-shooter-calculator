import { builderTemplates, robotFromProject } from "./probot";
import { fromFootprint, robotFromProbot } from "./robot";
import { buildRobot, exampleSpec } from "../presets/factory";
import { pickupSources, starts, type PickupSource } from "./field";
import { planAuto, defaultSettings } from "./planner";
import { shotGrid, type ShotMap } from "./shotMap";

const loaded = (() => {
  const t = builderTemplates.find((x) => x.id.includes("starter"))!;
  const r = robotFromProject(t.proje()!);
  if (typeof r === "string") throw new Error(r);
  return r;
})();
const robot = robotFromProbot(
  loaded.robot,
  buildRobot(exampleSpec),
  exampleSpec,
  "builder",
);
const fakeMap = (
  cell: "first" | "tipped",
  target: [number, number],
): ShotMap => ({
  cell,
  spacing: 0.3,
  tried: 0,
  spots: shotGrid(0.3, robot.halfX, robot.halfY)
    .filter((p) => Math.hypot(p.x - target[0], p.y - target[1]) < 1.6)
    .map((p) => ({
      ...p,
      heading: Math.atan2(target[1] - p.y, target[0] - p.x),
      omega: 300,
      angle: 1.1,
      clearance: 0.02,
    })),
});
const start = fromFootprint(robot, starts("blue")[0].pose);
const preload: PickupSource = {
  id: "preload",
  kind: "preload",
  label: "Ön yük",
  balls: 4,
  points: [],
  approach: { x: start.x, y: start.y, facing: start.h },
};
const plan = planAuto({
  robot,
  start,
  sources: [
    preload,
    ...pickupSources("blue").filter(
      (s) => s.kind === "garden" || s.id === "flower-1",
    ),
  ],
  maps: {
    first: fakeMap("first", [0.32, -0.4]),
    tipped: fakeMap("tipped", [0.32, 0.4]),
  },
  settings: defaultSettings,
}).best;

const maps = {
  first: fakeMap("first", [0.32, -0.4]),
  tipped: fakeMap("tipped", [0.32, 0.4]),
};
export { loaded, robot, plan, start, maps };
