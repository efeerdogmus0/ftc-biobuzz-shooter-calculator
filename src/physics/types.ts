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
  /** Marks profiles whose factory surface ratio has been corrected. */
  surfaceRatioVersion: number;
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
  liftModel: "linear" | "sawicki";
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
  purpose?: "solid" | "robot-exclusion" | "hive-proxy";
}
export interface FieldConfig {
  size: number;
  wallHeight: number;
  wallThickness: number;
  target: TargetConfig;
  hive: HiveConfig;
  obstacles: Box[];
  /** Disable only in isolated target/lab scenes without the HIVE support frame. */
  hiveStructure?: boolean;
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
  rotation?: [number, number, number, number];
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
  /** False means contact ended before the ball reached the physical exit. */
  exited: boolean;
  contactTravel: number;
  contactTime: number;
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
  status: "HIT" | "MISS" | "CLIPPED EDGE" | "COLLIDED BEFORE ENTRY" | "NO EXIT";
  collision: string | null;
  impactNormal?: Vec3;
  bounces?: BounceEvent[];
  worldEvents?: BounceEvent[];
  ballTracks?: BallTrack[];
  residentCount?: number;
  retainedResidents?: number;
  retainedShot?: boolean;
  bounceEnd?: "Stopped" | "Time limit" | "Impact limit";
  diagnostics?: BounceDiagnostics;
  bounceError?: string;
  hiveTrack?: HiveSample[];
  hiveTips?: { t: number; angle: number; from: number; to: number }[];
  hiveCalibrationTorque?: number;
  pollenInertia?: Vec3;
  /** Body-frame diagonal inertia and dimensionless aero axes used by this flight. */
  ballInertia?: Vec3;
  aeroAxes?: Vec3;

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

export interface BounceSettings {
  floor: number;
  wall: number;
  cell: number;
  friction: number;
  rollingResistance: number;
  ball?: number;
  contactModel?: "rigid" | "hertz";
  inertiaModel?: "config" | "solid" | "shell";
  previewTime?: number;
  staticRatio?: number;
  speedLoss?: number;
  referenceSpeed?: number;
  spinResistance?: number;
  contactStiffness?: number;
  materialDissipation?: number;
  solverIterations?: number;
  maxContactStep?: number;
  surfaceFriction?: Partial<Record<"floor" | "wall" | "cell" | "ball", number>>;
  hiveMotion?: boolean;
  hiveThreshold?: number;
  /** Calibration reference, independent of the projectile under test. */
  hiveReferenceMass?: number;
  hiveReferenceDiameter?: number;
  hiveInertia?: number;
  hiveDamping?: number;
  hiveStopRestitution?: number;
  hiveInitialAngle?: number;
  hiveInitialSpeed?: number;
  shapeModel?: "sphere" | "pollen";
  asphericity?: number;
  hemispherePhase?: number;
  orientation?: Vec3;
}
export interface HiveSample {
  t: number;
  angle: number;
  omega: number;
  loadTorque: number;
  retained: number;
}
export interface BounceEvent extends Sample {
  surface: string;
  outgoing: Vec3;
  normal: Vec3;
  outgoingSpin?: Vec3;
  relativeIncoming?: Vec3;
  relativeOutgoing?: Vec3;
  ballId?: number;
  otherBallId?: number;
  impulse?: number;
  restitution?: number;
  contact?: Vec3;
  duration?: number;
  endTime?: number;
  peakForce?: number;
  maxCompression?: number;
  regime?: "sticking" | "sliding";
  observedRestitution?: number;
  hiveAngle?: number;
  surfaceVelocity?: Vec3;
}
export interface BallTrack {
  id: number;
  color: string;
  samples: Sample[];
}

export interface EnergyFrame {
  t: number;
  translation: number;
  rotation: number;
  gravity: number;
  elastic: number;
  hiveKinetic?: number;
  hivePotential?: number;
}
export interface BounceDiagnostics {
  settings: BounceSettings;
  inertia: number;
  model: "rigid" | "hertz";
  steps: number;
  minStep: number;
  maxOverlap: number;
  maxForce: number;
  slipContacts: number;
  stickContacts: number;
  settlingTime: number;
  settled: boolean;
  aeroWork: number;
  contactWork: number;
  frictionWork: number;
  normalDissipationLoss: number;
  correctionWork: number;
  resistanceLoss: number;
  energyBalanceError: number;
  hingeLoss?: number;
  energy: EnergyFrame[];
  warnings: string[];
}
