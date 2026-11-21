// Motor + gear choice for the main shooter wheel, and a pre-filled ReCalc link.
//
// Free speeds are the manufacturers' nominal no-load figures at 12 V. A loaded
// shooter wheel runs below free speed; the "target %" is the user's choice of
// operating point, not a measurement. Values should be checked on the robot.
import { POLLEN_DIAMETER, type RobotSpec } from "./factory";

export interface MotorOption {
  id: string;
  label: string;
  /** Nominal no-load speed at the motor output (after any built-in gearbox), RPM. */
  freeRPM: number;
  /** Exact name in ReCalc's motor list, when ReCalc has the same motor. */
  recalc?: string;
}

export const motorOptions: MotorOption[] = [
  { id: "gobilda-1", label: "goBILDA 5203 Yellow Jacket 1:1", freeRPM: 6000 },
  {
    id: "gobilda-3.7",
    label: "goBILDA 5203 Yellow Jacket 3.7:1",
    freeRPM: 1620,
  },
  {
    id: "gobilda-5.2",
    label: "goBILDA 5203 Yellow Jacket 5.2:1",
    freeRPM: 1150,
  },
  {
    id: "rev-hdhex",
    label: "REV HD Hex (redüktörsüz)",
    freeRPM: 6000,
    recalc: "HD Hex",
  },
  { id: "custom", label: "Diğer: serbest hızı kendim gireceğim", freeRPM: 0 },
];

export interface DriveChoice {
  motorId: string;
  /** Free speed for "custom". */
  customRPM: number;
  count: number;
  /** Teeth (or pulley teeth) on the motor side and the wheel side. */
  motorTeeth: number;
  wheelTeeth: number;
  /** Operating point as % of free wheel speed. */
  targetPct: number;
}

export const defaultDrive: DriveChoice = {
  motorId: "gobilda-1",
  customRPM: 6000,
  count: 1,
  motorTeeth: 1,
  wheelTeeth: 1,
  targetPct: 85,
};

export function motorOf(d: DriveChoice) {
  return motorOptions.find((m) => m.id === d.motorId) ?? motorOptions[0];
}
export function motorFreeRPM(d: DriveChoice) {
  return d.motorId === "custom" ? d.customRPM : motorOf(d).freeRPM;
}
/** Motor turns per wheel turn (>1: reduction, <1: step-up). */
export function reductionOf(d: DriveChoice) {
  return d.wheelTeeth / d.motorTeeth;
}
export function freeWheelRPM(d: DriveChoice) {
  return motorFreeRPM(d) / reductionOf(d);
}
export function targetWheelRPM(d: DriveChoice) {
  return (freeWheelRPM(d) * d.targetPct) / 100;
}

export function driveErrors(
  d: DriveChoice,
): Partial<Record<keyof DriveChoice, string>> {
  const e: Partial<Record<keyof DriveChoice, string>> = {};
  const bad = (v: number, min: number, max: number) =>
    !Number.isFinite(v) || v < min || v > max;
  if (d.motorId === "custom" && bad(d.customRPM, 1, 50000))
    e.customRPM = "1–50000 RPM olmalı.";
  if (!Number.isInteger(d.count) || bad(d.count, 1, 16))
    e.count = "1–16 arası tam sayı.";
  if (bad(d.motorTeeth, 1, 500)) e.motorTeeth = "1–500 olmalı.";
  if (bad(d.wheelTeeth, 1, 500)) e.wheelTeeth = "1–500 olmalı.";
  if (bad(d.targetPct, 10, 100)) e.targetPct = "%10–100 olmalı.";
  return e;
}

/** What the config stores about the drive (shown again in the advanced workbench). */
export function motorConfigOf(d: DriveChoice) {
  const m = motorOf(d);
  return {
    name:
      d.motorId === "custom"
        ? `Özel motor · ${motorFreeRPM(d).toFixed(0)} RPM serbest`
        : m.label,
    count: d.count,
    reduction: reductionOf(d),
  };
}

const q = (v: unknown) => JSON.stringify(v);
/** "A to B" as ReCalc stores it: Reduction m means A turns m times per B turn. */
function recalcRatio(aPerB: number) {
  return aPerB >= 1
    ? { magnitude: Number(aPerB.toFixed(4)), ratioType: "Reduction" }
    : { magnitude: Number((1 / aPerB).toFixed(4)), ratioType: "Step-up" };
}

/**
 * ReCalc Flywheel link pre-filled with this robot's wheel(s) and the POLLEN.
 * The motor is included only when ReCalc lists the same motor; otherwise the
 * user picks the closest one there. ReCalc has no driven hood: such robots
 * open as a single wheel + hood.
 */
export function recalcLinkFor(spec: RobotSpec, drive?: DriveChoice | null) {
  const p = new URLSearchParams();
  const twin = spec.mechanism === "twin-wheel";
  p.set("shooterMode", twin ? "dual-shooter" : "single-hooded");
  p.set(
    "shooterDiameter",
    q({ s: +(spec.wheelDiameter * 1000).toFixed(2), u: "mm" }),
  );
  p.set("shooterTargetSpeed", q({ s: Math.round(spec.wheelRPM), u: "rpm" }));
  p.set(
    "projectileDiameter",
    q({ s: +(POLLEN_DIAMETER / 0.0254).toFixed(3), u: "in" }),
  );
  p.set("projectileWeight", q({ s: 25, u: "g" }));
  if (twin) {
    p.set(
      "secondaryShooterDiameter",
      q({ s: +(spec.topWheelDiameter * 1000).toFixed(2), u: "mm" }),
    );
    if (spec.drive === "gear" && spec.ratio > 0)
      p.set("secondaryShooterToShooterRatio", q(recalcRatio(spec.ratio)));
  }
  const motor = drive ? motorOf(drive) : null;
  if (drive && motor?.recalc) {
    p.set("motor", q({ name: motor.recalc, quantity: drive.count }));
    p.set("ratio", q(recalcRatio(reductionOf(drive))));
  }
  return `https://www.reca.lc/flywheel?${p.toString()}`;
}
