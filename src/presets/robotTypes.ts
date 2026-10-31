// Shooter mechanism types. Each type replaces only `config.shooter` (plus a
// matching name); robot pose, field, POLLEN, bounce materials and residents are
// kept. All values are UNMEASURED starting configurations built from the same
// contact model as the current robot — none of them is calibrated.
import type { Config, HoodRollerConfig, ShooterConfig } from "../physics/types";
import { inch, rpm } from "../utils/units";
import { current } from "./index";

export type RobotTypeId =
  "powered-hood" | "independent-hood" | "passive-hood" | "opposed-wheels";

export interface RobotType {
  id: RobotTypeId;
  name: string;
  /** Short Turkish description shown next to the selector. */
  description: string;
  shooter: () => ShooterConfig;
}

const ballRadius = (2.8 * inch) / 2;

function hood(over: Partial<HoodRollerConfig>[]): HoodRollerConfig[] {
  const base = [current.shooter.secondary, ...current.shooter.rollers];
  return base.map((w, i) => ({ ...structuredClone(w), ...over[i] }));
}

export const robotTypes: RobotType[] = [
  {
    id: "powered-hood",
    name: "Ana teker + tahrikli hood (dişli bağlı)",
    description:
      "96 mm ana teker, 3× 1 in hood tekeri dişliyle 3,75:1 bağlı. Mevcut robotun mekanizması.",
    shooter: () => structuredClone(current.shooter),
  },
  {
    id: "independent-hood",
    name: "Ana teker + bağımsız motorlu hood",
    description:
      "Aynı geometri; hood tekerleri ayrı motorla kendi RPM'inde döner. Yüzey hızı farkı spin üretir.",
    shooter: () => {
      const s = structuredClone(current.shooter);
      s.topology = "powered";
      s.link = "independent";
      const hoodRpm = rpm(1450 * 3.75 * 0.85);
      s.secondary.omega = hoodRpm;
      s.rollers.forEach((r) => (r.omega = hoodRpm));
      return s;
    },
  },
  {
    id: "passive-hood",
    name: "Ana teker + pasif (sabit) hood",
    description:
      "Yalnız ana teker tahrikli; hood temasları sabit yüzey gibi davranır. Top sürtünmeyle geri spin alır.",
    shooter: () => {
      const s = structuredClone(current.shooter);
      s.topology = "passive";
      s.secondary.omega = 0;
      s.rollers.forEach((r) => (r.omega = 0));
      return s;
    },
  },
  {
    id: "opposed-wheels",
    name: "Karşılıklı iki teker",
    description:
      "Alt ve üst 96 mm teker topu iki taraftan sıkıştırır; üst teker dişliyle 1:1 bağlı (eşit yüzey hızı → az spin).",
    shooter: () => {
      const s = structuredClone(current.shooter);
      s.topology = "opposing";
      s.link = "gear";
      const radius = 0.048;
      const [top] = hood([
        {
          diameter: 0.096,
          radius,
          ratio: 1,
          omega: s.primary.omega,
          angle: 0,
          center: [0.0, ballRadius + radius],
          contactStart: -0.03,
          contactEnd: 0.03,
        },
      ]);
      s.secondary = top;
      s.secondary.ratio = 1;
      s.rollers = [];
      s.hoodRadius = radius;
      return s;
    },
  },
];

export function applyRobotType(config: Config, id: RobotTypeId): Config {
  const type = robotTypes.find((t) => t.id === id);
  if (!type) throw new Error(`Unknown robot type: ${id}`);
  const q = structuredClone(config);
  q.shooter = type.shooter();
  q.name = type.name;
  q.calibrated = false;
  return q;
}
