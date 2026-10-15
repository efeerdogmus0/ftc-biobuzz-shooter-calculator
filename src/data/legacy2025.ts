/**
 * FTC #25577 Zağanos — 2025-26 season (FTC DECODE) measured shooter data.
 *
 * LAST SEASON'S ROBOT, BALL AND GOAL. This is NOT BIOBUZZ data and is not a
 * simulator prediction. It is kept as a reference for the single-wheel,
 * passive-hood shooter concept (ball rolls along a fixed hood → backspin).
 *
 * Archive root (A): /home/shared/projects/archive/ftc/de-cock/robot-code/
 * Java root (J): A/TeamCode/src/main/java/org/firstinspires/ftc/teamcode/
 *
 * Units are kept exactly as recorded: inches, hood "degrees" (see HOOD below),
 * wheel RPM. Convert at the display boundary only.
 */

/** Raw field sheet: A/scripts/ronaldo/ÖLÇÜMLER SAHA FTC.ods, Sheet1 (only sheet).
 * Columns: position (tile notation "a,b", written only on each group's first
 * row), Target RPM, Current RPM (measured actual), Hood Angle. One row per
 * recorded hit. `odsRow` is the spreadsheet row number (header is row 1). */
export interface LegacyShot {
  odsRow: number;
  position: string;
  targetRPM: number;
  actualRPM: number;
  hoodDeg: number;
}
const raw: [number, string, number, number, number][] = [
  [2, "6,3", 5400, 5691, 44],
  [3, "6,3", 5400, 5691, 47.5],
  [4, "6,3", 5400, 5760, 50],
  [5, "6,3", 5400, 5691, 50],
  [6, "6,3", 5400, 5691, 42],
  [7, "6,3", 5400, 5760, 43.5],
  [8, "6,3", 5500, 5829, 39.5],
  [9, "5,3", 5000, 5006, 45.5],
  [10, "5,3", 5100, 5417, 49],
  [11, "5,3", 5000, 5280, 46],
  [12, "5,3", 5100, 5417, 43],
  [13, "5,3", 5200, 5486, 40],
  [14, "5,3", 5100, 5417, 39.5],
  [15, "5,3", 5200, 5486, 47],
  [16, "4,3", 4900, 4937, 44],
  [17, "4,3", 4900, 5243, 40],
  [18, "4,3", 4800, 4937, 42],
  [19, "4,3", 4900, 5143, 42],
  [20, "4,3", 4900, 4869, 45],
  [21, "4,3", 4900, 5143, 48],
  [22, "4,3", 5900, 5143, 50],
  [23, "3,3", 4600, 4526, 35.5],
  [24, "3,3", 4700, 4869, 32.5],
  [25, "3,3", 4600, 4594, 38.5],
  [26, "3,3", 4700, 4937, 40],
  [27, "3,3", 4500, 4663, 42],
  [28, "3,3", 4500, 4663, 44],
  [29, "2,3", 4100, 4389, 33],
  [30, "2,3", 4100, 4320, 40],
  [31, "2,3", 4100, 4320, 38],
  [32, "2,3", 4100, 4320, 36],
  [33, "2,2", 4900, 4909, 30],
  [34, "2,2", 4900, 4977, 32.5],
  [35, "2,2", 4900, 4909, 32],
  [36, "3,1", 4400, 4389, 31.5],
  [37, "3,1", 4200, 4183, 32],
  [38, "3,1", 4200, 4183, 31],
  [39, "3,1", 4100, 4114, 32],
  [40, "3,1", 4400, 4389, 28],
  [41, "3,1", 4300, 4320, 29.5],
  [42, "3,1", 4200, 4251, 33],
  [43, "3,1", 4200, 4183, 34.5],
  [44, "3,1", 4300, 4320, 28],
  [45, "2,1", 3900, 3909, 26.5],
  [46, "2,1", 3900, 3977, 27.5],
  [47, "2,1", 3800, 3771, 29.5],
  [48, "2,1", 3700, 3703, 29.5],
  [49, "2,1", 3800, 3771, 30],
  [50, "2,1", 3900, 3909, 25],
];
export const legacyShots: LegacyShot[] = raw.map(
  ([odsRow, position, targetRPM, actualRPM, hoodDeg]) => ({
    odsRow,
    position,
    targetRPM,
    actualRPM,
    hoodDeg,
  }),
);
/** analyze_measurements.py L29/L76 drops position "2,2" as bad data. Note ods
 * row 22 (target 5900, actual 5143) looks like a target-RPM typo; the analysis
 * used actual RPM, so it is kept as recorded. */
export const legacyExcludedPositions = ["2,2"];

/** Robot-center conversion from analyze_measurements.py L17-54: tile "a,b" →
 * Pedro x = b·24 − 202 mm, y = 144 − a·24 + 199 mm (inches). The −202/+199 mm
 * offsets locate the robot center, not the shooter exit. */
export function legacyPedroPosition(position: string): [number, number] {
  const [a, b] = position.split(",").map(Number);
  return [b * 24 + -202 / 25.4, 144 - a * 24 + 199 / 25.4];
}
/** The analysis measured distance from robot center to Pedro (0, 144) in
 * (analyze_measurements.py L19, L56-60). The robot at runtime instead used the
 * corner shifted by the 2.5 in ball radius, BLUE (2.5, 141.5)
 * (AdvancedLogicConstants.java L190-193), so lookups were biased by that shift. */
export const legacyAnalysisTargetPedroIn: [number, number] = [0, 144];
export function legacyDistanceIn(position: string) {
  const [x, y] = legacyPedroPosition(position);
  return Math.hypot(
    legacyAnalysisTargetPedroIn[0] - x,
    legacyAnalysisTargetPedroIn[1] - y,
  );
}

/** Robot lookup table, verbatim: J/config/logic/AdvancedLogicConstants.java
 * L315-372 (Ronaldo.lookupTable), identical to
 * A/scripts/ronaldo/analysis_output/lookup_table.txt. Rows are
 * {distanceIn, hoodDeg, minHitRPM, maxHitRPM}: min/max actual RPM per position
 * and hood setting over the non-excluded shots. Valid 43.3–150.5 in (L292-293). */
export const legacyLookupTable: [number, number, number, number][] = [
  [43.3, 25.0, 3909, 3909],
  [43.3, 26.5, 3909, 3909],
  [43.3, 27.5, 3977, 3977],
  [43.3, 29.5, 3703, 3771],
  [43.3, 30.0, 3771, 3771],
  [66.1, 28.0, 4320, 4389],
  [66.1, 29.5, 4320, 4320],
  [66.1, 31.0, 4183, 4183],
  [66.1, 31.5, 4389, 4389],
  [66.1, 32.0, 4114, 4183],
  [66.1, 33.0, 4251, 4251],
  [66.1, 34.5, 4183, 4183],
  [75.6, 33.0, 4389, 4389],
  [75.6, 36.0, 4320, 4320],
  [75.6, 38.0, 4320, 4320],
  [75.6, 40.0, 4320, 4320],
  [90.7, 32.5, 4869, 4869],
  [90.7, 35.5, 4526, 4526],
  [90.7, 38.5, 4594, 4594],
  [90.7, 40.0, 4937, 4937],
  [90.7, 42.0, 4663, 4663],
  [90.7, 44.0, 4663, 4663],
  [109.0, 40.0, 5243, 5243],
  [109.0, 42.0, 4937, 5143],
  [109.0, 44.0, 4937, 4937],
  [109.0, 45.0, 4869, 4869],
  [109.0, 48.0, 5143, 5143],
  [109.0, 50.0, 5143, 5143],
  [129.2, 39.5, 5417, 5417],
  [129.2, 40.0, 5486, 5486],
  [129.2, 43.0, 5417, 5417],
  [129.2, 45.5, 5006, 5006],
  [129.2, 46.0, 5280, 5280],
  [129.2, 47.0, 5486, 5486],
  [129.2, 49.0, 5417, 5417],
  [150.5, 39.5, 5829, 5829],
  [150.5, 42.0, 5691, 5691],
  [150.5, 43.5, 5760, 5760],
  [150.5, 44.0, 5691, 5691],
  [150.5, 47.5, 5691, 5691],
  [150.5, 50.0, 5691, 5760],
];

/** A/scripts/ronaldo/analysis_output/MIN_MAX_IDEAL_FORMULAS.txt, verbatim
 * coefficients. d = distance in inches (robot center to Pedro (0,144)),
 * h = hood setting. Fitted on the 7 per-position aggregates (mean/min/max),
 * so R² is optimistic: ALL_FORMULAS.txt reports R² 0.9656 / RMSE 117.1 RPM for
 * the mean RPM line over all 46 shots. Do not extrapolate outside 43.3–150.5 in. */
export const legacyFormulas = {
  rpm: {
    mean: { slope: 17.846972, intercept: 3062.575912, r2: 0.996354 }, // L8-10
    min: { slope: 17.296586, intercept: 2962.780445, r2: 0.978358 }, // L12-14
    max: { slope: 17.806383, intercept: 3203.11745, r2: 0.980323 }, // L16-18
  },
  /** Hood = a·d² + b·d + c (L38-48). */
  hood: {
    mean: { a: -0.001477, b: 0.461383, c: 9.628793, r2: 0.951909 },
    min: { a: -0.001262, b: 0.395142, c: 9.295587, r2: 0.916168 },
    max: { a: -0.002039, b: 0.597408, c: 6.599889, r2: 0.957936 },
  },
  /** Continuous piecewise linear hood, breakpoint 100 in (L74-93). */
  hoodPiecewise: {
    breakpoint: 100,
    mean: {
      near: [0.239748, 17.117071],
      far: [0.01916, 39.175843],
      r2: 0.882606,
    },
    min: {
      near: [0.175938, 17.500514],
      far: [-0.011936, 36.287892],
      r2: 0.631532,
    },
    max: {
      near: [0.303129, 16.235345],
      far: [0.000435, 46.50479],
      r2: 0.91131,
    },
  },
  /** RPM = 40.817652·d − 151.309496·h + 0.008751·d² − 0.585222·d·h
   *  + 2.547210·h² + 4975.170974, R² 0.973623 (L126-132). */
  multivariate: {
    d: 40.817652,
    h: -151.309496,
    d2: 0.008751,
    dh: -0.585222,
    h2: 2.54721,
    c: 4975.170974,
    r2: 0.973623,
  },
  validDistanceIn: [43.3, 150.5] as [number, number],
} as const;
export type LegacyBand = "mean" | "min" | "max";
export const legacyRPM = (d: number, band: LegacyBand = "mean") =>
  legacyFormulas.rpm[band].slope * d + legacyFormulas.rpm[band].intercept;
export const legacyHood = (d: number, band: LegacyBand = "mean") => {
  const f = legacyFormulas.hood[band];
  return f.a * d * d + f.b * d + f.c;
};
export const legacyMultivariateRPM = (d: number, h: number) => {
  const f = legacyFormulas.multivariate;
  return f.d * d + f.h * h + f.d2 * d * d + f.dh * d * h + f.h2 * h * h + f.c;
};

/** Hardware facts, each with source; null = not found in the archive. */
export const legacyHardware = {
  /** J/config/HardwareConstants.java L160. */
  wheelDiameterIn: 4.0,
  /** Two motors, shooterRight/shooterLeft, left follows at 1.0 (L147-152).
   * The motor model is not stated anywhere in the code. */
  motorCount: 2,
  motorModel: null,
  /** wheel RPM = motor RPM × 1.6 (L159). Its comment says "Direct drive
   * (1:1)", contradicting the value; 1.6 was in place on the 2025-12-11
   * measurement date. Unconfirmed. */
  motorToWheelRatio: 1.6,
  /** L155 = 28 ticks/rev; its comment claims an 8192 CPR Through Bore. */
  encoderTicksPerRev: 28,
  /** Table RPM is the computed WHEEL RPM: ticks/s · 60 / 28 · 1.6
   * (ShooterPidfPowerSubsystem.java L102-115). */
  rpmIsWheelRPM: true,
  flywheelMassKg: null,
  flywheelInertia: null,
  /** Ball exit height above the tiles: not found. */
  exitHeightM: null,
  /** Turret offset in code is (0, 0) (L277-278); exit offset not found. */
  exitOffsetM: null,
  /** HOOD: "hoodDeg" is NOT a launch angle. It is a 25–50 command mapped
   * linearly onto 0–215° of a 300° servo (L670-688, HoodSubsystem.java
   * L27-57). Its relation to the physical launch angle was never measured. */
  hoodCommandRange: [25, 50] as [number, number],
  hoodLaunchAngleZero: null,
  /** Passive hood: no hood wheels (zero surface speed → backspin). */
  hoodPowered: false,
} as const;

/** DECODE ARTIFACT and GOAL. Source: FTC DECODE Competition Manual (Team
 * Update 12 copy at /home/shared/projects/archive/ftc/de-cock/re-cock-nize/
 * DECODE_Competition_Manual_TU12.pdf), §9.9 and §9.7. */
export const decodeGameElements = {
  /** §9.9: 5 in (12.70 cm) nominal Gopher ResisDent polypropylene ball
   * (AndyMark am-3376a); 4.9 in ± 0.25 in at the mold seam. */
  artifactDiameterNominalM: 5 * 0.0254,
  artifactDiameterSeamM: [4.65 * 0.0254, 5.15 * 0.0254] as [number, number],
  /** Not in the manual or the AndyMark listing. */
  artifactMassKg: null,
  /** §9.7: ~27 × 27 × 54 in structure; opening ~26.5 in wide × 18.3 in deep;
   * top lip 38.75 in above the tiles; backboard ≤ 15 in above the opening. */
  goalOpeningWidthM: 26.5 * 0.0254,
  goalOpeningDepthM: 18.3 * 0.0254,
  goalLipHeightM: 38.75 * 0.0254,
} as const;
