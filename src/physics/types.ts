/** All dimensional data is SI: m, kg, s, rad. Physics uses Z-up, X/Y floor. */
export type Vec3 = [number, number, number];
export interface WheelConfig {
  diameter: number;
  omega: number;
  mass: number | null;
  inertia: number | null;
  inertiaMode: "unknown" | "disk" | "custom";
  ratio: number;
}
/** Local 2D geometry of a hood roller. The ball travels in +X and its nominal path is Y=0. */
export interface HoodRollerConfig extends WheelConfig {
  angle: number;
  radius: number;
  center: [number, number];
  compression: number;
  contactStart: number;
  contactEnd: number;
}
export interface MotorConfig {
  count: number;
  name: string;
  efficiency: number;
  reduction: number;
  voltage: number;
  batteryResistance: number;
  statorLimit: number;
  supplyLimit: number;
  kV: number;
  kA: number;
  kP: number;
  resistance: number;
  torqueConstant: number;
}
export interface ShooterConfig {
  mode: "physical" | "recalc";
  topology: "passive" | "powered" | "opposing" | "compound";
  primary: WheelConfig;
  secondary: HoodRollerConfig;
  rollers: HoodRollerConfig[];
  link: "independent" | "gear" | "surface";
  surfaceRatio: number;
  hoodAngle: number;
  hoodMin: number;
  hoodMax: number;
  hoodOffset: number;
  hoodStart: number;
  hoodEnd: number;
  hoodRadius: number;
  compression: number;
  friction: number;
  ballStiffness: number;
  wheelStiffness: number;
  normalModel: "linear" | "table";
  forceCurve: [number, number][];
  hysteresis: number;
  contactStep: number;
  maxContactTime: number;
  transfer: number;
  flywheel: WheelConfig;
  flywheelEnabled: boolean;
  motor: MotorConfig;
  effectiveInertia: number;
}
export interface ProjectileConfig {
  name: string;
  model: "sphere" | "calibrated";
  diameter: number;
  mass: number;
  inertia: number | null;
  initialVelocity: number;
  spin: number;
  roughness: number;
}
export interface AerodynamicsConfig {
  cd: number;
  liftSlope: number;
  liftMax: number;
  spinDecay: number;
  magnus: boolean;
}
export interface EnvironmentConfig {
  gravity: number;
  density: number;
  temperature: number;
  pressure: number;
  altitude: number;
  wind: Vec3;
}
export interface RobotConfig {
  x: number;
  y: number;
  heading: number;
  turretYaw: number;
  turretCenter: Vec3;
  exitOffset: Vec3;
  width: number;
  length: number;
  velocity: Vec3;
  inheritVelocity: boolean;
}
export interface TargetConfig {
  center: Vec3;
  width: number;
  height: number;
  /** Vertical distance from the opening floor to the start of the two roof slopes. */
  shoulderHeight: number;
  depth: number;
  yaw: number;
  tilt: number;
  thickness: number;
  /** tilt=0: upward opening; tilt=pi/2: vertical */ provenance: string;
}
export interface HiveConfig {
  frameWidth: number;
  frameDepth: number;
  pivotHeight: number;
  allianceCenterSpacing: number;
  cellGap: number;
  assemblySpan: number;
  cellWidth: number;
  cellHeight: number;
  cellShoulderHeight: number;
  cellDepth: number;
  deployedCellPlaneAngle: number;
  topOpeningHeight: number;
  bottomOpeningHeight: number;
  bottomHeight: number;
  provenance: string;
}
export interface Box {
  min: Vec3;
  max: Vec3;
  name: string;
}
export interface FieldConfig {
  size: number;
  wallHeight: number;
  wallThickness: number;
  target: TargetConfig;
  hive: HiveConfig;
  obstacles: Box[];
  provenance: string;
}
export interface SimulationConfig {
  absTolerance: number;
  relTolerance: number;
  maxStep: number;
  maxTime: number;
  maxSpeed: number;
  minOmega: number;
  maxOmega: number;
  entryMin: number;
  entryMax: number;
  apex: "any" | "before" | "at" | "after";
  apexClearance: number;
  objective: "energy" | "rpm" | "clearance" | "robustness" | "time";
}
export interface Config {
  version: 1;
  name: string;
  calibrated: boolean;
  robot: RobotConfig;
  shooter: ShooterConfig;
  projectile: ProjectileConfig;
  aero: AerodynamicsConfig;
  environment: EnvironmentConfig;
  field: FieldConfig;
  simulation: SimulationConfig;
}
export interface Sample {
  t: number;
  p: Vec3;
  v: Vec3;
  spin: Vec3;
}
export interface ContactSample {
  t: number;
  velocity: number;
  spin: number;
  primaryOmega: number;
  secondaryOmega: number;
  normal: number;
  force: number;
  slip: number;
  travel: number;
  activeHoodContacts: number;
}
export interface ShooterResult {
  speed: number;
  spin: number;
  surfaceSpeeds: number[];
  postOmega: number;
  drop: number;
  energy: number;
  rotationalEnergy: number;
  storedEnergy: number | null;
  consumedEnergy: number | null;
  electricalEnergy: number;
  slipLoss: number;
  hysteresisLoss: number;
  deformationEnergy: number;
  recovery: number | null;
  spinup: number | null;
  efficiency: number | null;
  trace: ContactSample[];
  warnings: string[];
}
export interface Entry extends Sample {
  speed: number;
  angle: number;
  incidence: number;
  clearance: number;
  energy: number;
  local: [number, number];
}
export interface FlightResult {
  samples: Sample[];
  apex: Sample;
  entry: Entry | null;
  impact: Sample | null;
  status: "HIT" | "MISS" | "CLIPPED EDGE" | "COLLIDED BEFORE ENTRY";
  collision: string | null;
  missDistance: number;
  warnings: string[];
}
export interface Shot {
  config: Config;
  shooter: ShooterResult;
  flight: FlightResult;
  origin: Vec3;
  velocity: Vec3;
  spin: Vec3;
}
