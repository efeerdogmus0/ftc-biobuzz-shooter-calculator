import type { Config, HoodRollerConfig, WheelConfig } from "../physics/types";
import { deg, inch, inertiaImperial, rpm } from "../utils/units";
import { fieldConfig } from "../field/fieldConfig";
import {
  decodeGameElements,
  legacyDistanceIn,
  legacyHardware,
  legacyRPM,
} from "../data/legacy2025";
const wheel = (
  diameter: number,
  omega: number,
  mass: number | null = null,
  inertia: number | null = null,
): WheelConfig => ({
  diameter,
  omega,
  mass,
  inertia,
  inertiaMode: inertia === null ? "unknown" : "custom",
  ratio: 1,
});
const sushiWheel = (
  angle: number,
  centerX: number,
  contactStart: number,
  contactEnd: number,
): HoodRollerConfig => ({
  ...wheel(inch, rpm(1130 * 3.75)),
  ratio: 3.75,
  angle,
  radius: inch / 2,
  // Nominal center is tangent to POLLEN; global/per-roller compression moves it toward the path.
  center: [centerX, (2.8 * inch) / 2 + inch / 2],
  compression: 0,
  contactStart,
  contactEnd,
});

export const current: Config = {
  version: 1,
  name: "96mm Rhino + 3× Sushi Hood",
  calibrated: false,
  robot: {
    x: -1.15,
    y: -1.1,
    heading: deg(40),
    turretYaw: deg(4),
    turretCenter: [0, 0, 0],
    exitOffset: [0.12, 0, 0.347],
    width: 0.38,
    length: 0.4,
    velocity: [0, 0, 0],
    inheritVelocity: false,
  },
  shooter: {
    mode: "physical",
    topology: "powered",
    // 1130 RPM scores from the default pose against the manual-derived CELL (hits 1080–1180 RPM).
    primary: wheel(0.096, rpm(1130)),
    secondary: sushiWheel((-20 * Math.PI) / 180, 0.025, 0, 0.06),
    rollers: [
      sushiWheel(0, 0.07, 0.025, 0.105),
      sushiWheel((20 * Math.PI) / 180, 0.115, 0.07, 0.15),
    ],
    link: "gear",
    // Hood/main surface-speed ratio, used only by the "surface" lock. The 3.75
    // RPM ratio above already gives ~equal surface speeds, so the lock is 1:1.
    surfaceRatio: 1,
    hoodAngle: deg(65),
    hoodMin: deg(35),
    hoodMax: deg(85),
    hoodOffset: 0,
    hoodStart: deg(-40),
    hoodEnd: deg(70),
    hoodRadius: 0.078,
    compression: 0.008,
    friction: 0.65,
    ballStiffness: 4500,
    wheelStiffness: 9000,
    normalModel: "linear",
    forceCurve: [
      [0, 0],
      [0.004, 12],
      [0.008, 24],
      [0.012, 40],
    ],
    hysteresis: 0.12,
    contactStep: 0.0001,
    maxContactTime: 0.25,
    transfer: 1,
    flywheel: wheel(0.1016, 0, 0, 0),
    flywheelEnabled: false,
    effectiveInertia: 0.264 * inertiaImperial,
    motor: {
      count: 2,
      name: "Uncharacterized motor (editable)",
      efficiency: 0.7,
      reduction: 2.42,
      voltage: 10,
      batteryResistance: 0.015,
      statorLimit: 100,
      supplyLimit: 10,
      kV: 0.045,
      kA: 0.009,
      kP: 0.3392,
      resistance: 0.3,
      torqueConstant: 0.018,
    },
  },
  projectile: {
    name: "BIOBUZZ POLLEN - Current Robot",
    model: "sphere",
    diameter: 2.8 * inch,
    // Mass is unverified (manual gives none); weigh real balls. Scaling a 5 in
    // ResisDent (~71 g) by surface area suggests ~22 g.
    mass: 0.025,
    inertia: null,
    // Gopher ResisDent balls are hollow molded polyethylene shells (§9.8);
    // a thin shell is the closer default until inertia is measured.
    shell: true,
    initialVelocity: 0.5,
    spin: 0,
    roughness: 1,
  },
  aero: {
    cd: 0.47,
    // Sawicki, Hubbard & Stronge (arXiv:0712.0380) baseball fit: Cl = 1.5 S
    // for S < 0.1, else 0.09 + 0.6 S. The 0.35 cap is an uncalibrated
    // estimate for a light, seamed POLLEN shell; fit it from flight data.
    liftSlope: 0.6,
    liftMax: 0.35,
    liftModel: "sawicki",
    spinDecay: 0.1,
    magnus: true,
  },
  environment: {
    gravity: 9.80665,
    density: 1.225,
    temperature: 288.15,
    pressure: 101325,
    altitude: 0,
    wind: [0, 0, 0],
  },
  field: fieldConfig,
  simulation: {
    absTolerance: 1e-8,
    relTolerance: 1e-7,
    maxStep: 0.008,
    maxTime: 5,
    maxSpeed: 9,
    minOmega: rpm(300),
    maxOmega: rpm(5000),
    entryMin: deg(5),
    entryMax: deg(90),
    apex: "any",
    apexClearance: 0,
    objective: "energy",
  },
};
export const recalc: Config = structuredClone(current);
recalc.name = "ReCalc Reference - Uploaded Configuration";
Object.assign(recalc.shooter, {
  mode: "recalc",
  topology: "compound",
  primary: wheel(4 * inch, rpm(1700), 0.3, 1.3 * inertiaImperial),
  secondary: {
    ...sushiWheel(0, 0, 0, 0),
    ...wheel(inch, rpm(6800), 0.05, 0),
    ratio: 4,
  },
  rollers: [],
  link: "gear",
  flywheelEnabled: true,
  flywheel: { ...wheel(4 * inch, 0, 0, 0), ratio: 1 },
});
recalc.shooter.motor.name = "2 × REV HD Hex";
recalc.projectile = {
  name: "ReCalc reference projectile",
  model: "sphere",
  diameter: 3.5 * inch,
  mass: 0.042,
  inertia: 0.1 * inertiaImperial,
  shell: false,
  initialVelocity: 0.5,
  spin: 0,
  roughness: 1,
};
export const recalcReference = {
  maxAchievableOmega: rpm(2463),
  exitVelocity: 7.585,
  spin: 0,
  energyToBall: 1.208,
  drop: rpm(274),
  postOmega: rpm(1426),
  spinup: 0.323,
  recovery: 0.098,
  kV: 0.045,
  kA: 0.009,
  effectiveInertia: 0.264 * inertiaImperial,
  kP: 0.3392,
};
/**
 * FTC #25577 Zağanos, 2025-26 (DECODE): single 4 in flywheel and a passive
 * (unpowered) hood, so the hood contact has zero surface speed and the ball
 * leaves with backspin. LAST SEASON'S ROBOT AND BALL, NOT BIOBUZZ: the field and
 * scoring volume stay BIOBUZZ; the DECODE GOAL geometry is only recorded in
 * src/data/legacy2025.ts. Every unknown keeps the editable app default or an
 * explicitly flagged team assumption; see comments below.
 */
export const zaganos2025: Config = structuredClone(current);
zaganos2025.name = "Zağanos 2025-26 (DECODE, passive hood)";
{
  const s = zaganos2025.shooter;
  const ballRadius = decodeGameElements.artifactDiameterNominalM / 2;
  s.mode = "physical";
  s.topology = "passive";
  s.link = "independent";
  s.surfaceRatio = 1;
  // HardwareConstants.java L160: 4.0 in wheel. Mass/MOI not recorded → unknown.
  // Default speed: mean measured-fit wheel RPM at the 90.7 in position "3,3".
  s.primary = wheel(
    legacyHardware.wheelDiameterIn * inch,
    rpm(Math.round(legacyRPM(legacyDistanceIn("3,3")))),
  );
  // Fixed hood surface. Its curvature is unknown; a 1 m contact radius is a
  // modeling choice that keeps penetration ≈ compression along the contact
  // arc (a nearly flat local hood), not a measurement.
  const flatHoodRadius = 1;
  // ASSUMPTION, not measured: 1 in compression (4 in wheel-to-hood gap for the
  // 5 in ball). With the default 8 mm the 21 N normal force caps wheel
  // friction, the ball slides the whole arc and exits at a constant 9.41 m/s
  // for any RPM. At 1 in (67 N) the contact reaches the rolling limit
  // (≈ ½ surface speed) across the measured 3700–5800 RPM. The ball and wheel
  // stiffness are also unmeasured; refit compression/friction from data.
  s.compression = 0.0254;
  // Hood radius about the wheel axis follows from wheel + ball radii minus the
  // compression.
  s.hoodRadius = s.primary.diameter / 2 + ballRadius - s.compression;
  const arc = Math.abs(s.hoodEnd - s.hoodStart) * s.hoodRadius;
  s.secondary = {
    ...wheel(2 * flatHoodRadius, 0),
    angle: 0,
    radius: flatHoodRadius,
    center: [arc / 2, ballRadius + flatHoodRadius],
    compression: 0,
    contactStart: 0,
    contactEnd: arc,
  };
  s.rollers = [];
  s.flywheelEnabled = false;
  s.motor = {
    ...s.motor,
    count: legacyHardware.motorCount,
    // Motor model not recorded; electrical constants stay editable estimates.
    name: "2 × unidentified motor (model not recorded)",
    // reduction = motor/wheel; code says wheel = motor × 1.6 (unconfirmed).
    reduction: 1 / legacyHardware.motorToWheelRatio,
  };
  // Hood launch angle range/offset: the legacy hood value (25–50) is a servo
  // command, not a launch angle, so the app's default hood range is kept.
  zaganos2025.projectile = {
    name: "DECODE ARTIFACT (2025-26, NOT POLLEN) · mass unverified",
    model: "sphere",
    // DECODE manual §9.9: 5 in nominal.
    diameter: decodeGameElements.artifactDiameterNominalM,
    // UNVERIFIED: the manual and AndyMark listing give no mass. 0.200 lb is
    // the team's own earlier calculator assumption
    // (archive/ftc/de-cock/ball-auto-istic/configs/new_shooter.yaml, no source).
    mass: 0.2 * 0.45359237,
    inertia: null,
    // Construction (hollow or not) not verified for the DECODE ARTIFACT.
    shell: false,
    initialVelocity: current.projectile.initialVelocity,
    spin: 0,
    roughness: 1,
  };
  // UNVERIFIED exit height: 300 mm release height from the team's simulation
  // config (ball-auto-istic/configs/default.yaml L6); never measured.
  zaganos2025.robot.exitOffset = [0, 0, 0.3];
  // Solver bounds cover the measured 3703–5829 wheel RPM.
  zaganos2025.simulation.maxOmega = rpm(6000);
  zaganos2025.simulation.maxSpeed = 20;
}
export const presets = [
  current,
  { ...structuredClone(current), name: "BIOBUZZ POLLEN - Current Robot" },
  recalc,
  zaganos2025,
];
