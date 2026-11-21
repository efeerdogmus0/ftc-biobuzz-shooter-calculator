// ReCalc flywheel share links → a robot setup.
//
// ReCalc's "Copy Link" (https://www.reca.lc/flywheel?…) stores every input as a
// query parameter: measurements as JSON `{"s": value, "u": unit}`, ratios as
// `{"magnitude": m, "ratioType": "Reduction" | "Step-up"}`, flags as
// "true"/"false". This module reads those values; it never fetches anything.
//
// What maps: shooter type, wheel diameters, target RPM, wheel-to-wheel ratio,
// wheel/flywheel mass and MOI, motor data. What ReCalc does not have (gap /
// compression, exit height, hood angle) is reported as missing so the guided
// setup asks for it. The BIOBUZZ POLLEN is always the projectile: a ReCalc
// projectile is shown for comparison only.
import type { Config, WheelConfig } from "../physics/types";
import { blankSpec, POLLEN_DIAMETER, type RobotSpec } from "../presets/factory";
import { inch, inertiaImperial, pound } from "./units";

const units: Record<string, Record<string, number>> = {
  length: { in: inch, ft: 0.3048, mm: 0.001, cm: 0.01, m: 1 },
  mass: { oz: 0.028349523125, lbs: pound, g: 0.001, kg: 1 },
  moi: { "in2*lbs": inertiaImperial, "kg*m2": 1 },
  speed: { "in/s": inch, "ft/s": 0.3048, mph: 0.44704, "m/s": 1, kph: 1 / 3.6 },
  rpm: { rpm: 1 },
  voltage: { V: 1 },
  current: { A: 1 },
  resistance: { Ohm: 1 },
};
type Kind = keyof typeof units;

export type RecalcMode = "single-hooded" | "dual-shooter" | "compound";

export interface RecalcRow {
  label: string;
  recalc: string;
  ours: string;
  status: "imported" | "kept" | "ignored";
}

export interface RecalcExtras {
  primary: Pick<WheelConfig, "mass" | "inertia" | "inertiaMode">;
  secondary?: Pick<WheelConfig, "mass" | "inertia" | "inertiaMode">;
  flywheel?: WheelConfig;
  motor?: {
    name: string;
    count: number;
    efficiency?: number;
    reduction?: number;
    voltage?: number;
    batteryResistance?: number;
    statorLimit?: number;
    supplyLimit?: number;
  };
  feedSpeed?: number;
}

export interface RecalcImport {
  mode: RecalcMode;
  spec: RobotSpec;
  /** Setup fields ReCalc has no value for; the guided setup asks for them. */
  missing: (keyof RobotSpec)[];
  rows: RecalcRow[];
  warnings: string[];
  extras: RecalcExtras;
}

const RECALC_HOSTS = ["reca.lc", "www.reca.lc"];

/** True for text that looks like a ReCalc flywheel link (cheap check for paste handlers). */
export function looksLikeRecalc(text: string) {
  return /(^|\/\/)(www\.)?reca\.lc\//i.test(text.trim());
}

function queryOf(text: string): URLSearchParams {
  const t = text.trim();
  if (!t) throw new Error("ReCalc linkini yapıştır.");
  if (t.length > 20_000) throw new Error("Link çok uzun; ReCalc linki değil.");
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    throw new Error("Bu bir bağlantı değil. ReCalc'ta Copy Link ile kopyala.");
  }
  if (!RECALC_HOSTS.includes(url.hostname.toLowerCase()))
    throw new Error(
      `Bu link ${url.hostname} adresine ait; ReCalc (reca.lc) linki bekleniyor.`,
    );
  if (!/^\/flywheel\/?$/i.test(url.pathname))
    throw new Error(
      "Bu ReCalc linki flywheel hesaplayıcısına ait değil. ReCalc → Flywheel sayfasında Copy Link kullan.",
    );
  if (!url.searchParams.has("shooterMode"))
    throw new Error(
      "Linkte ayar yok. ReCalc'ta adres çubuğunu değil, Copy Link düğmesini kullan.",
    );
  return url.searchParams;
}

function json(q: URLSearchParams, key: string): unknown {
  const raw = q.get(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** A measurement in SI (or RPM for kind "rpm"); undefined when absent. */
function measure(
  q: URLSearchParams,
  key: string,
  kind: Kind,
): { si: number; text: string } | undefined {
  const v = json(q, key) as { s?: unknown; u?: unknown } | undefined;
  if (v === undefined) return undefined;
  if (
    typeof v !== "object" ||
    v === null ||
    typeof v.s !== "number" ||
    !Number.isFinite(v.s) ||
    typeof v.u !== "string"
  )
    throw new Error(`ReCalc alanı okunamadı: ${key}.`);
  const factor = units[kind][v.u];
  if (factor === undefined)
    throw new Error(`ReCalc alanı ${key}: "${v.u}" birimi tanınmıyor.`);
  return { si: v.s * factor, text: `${v.s} ${v.u}` };
}

/** "A to B" ratio as A-speed / B-speed. ReCalc "Reduction m" from A to B: B = A / m. */
function ratio(
  q: URLSearchParams,
  key: string,
): { value: number; text: string } | undefined {
  const v = json(q, key) as
    { magnitude?: unknown; ratioType?: unknown } | undefined;
  if (v === undefined) return undefined;
  if (
    typeof v !== "object" ||
    v === null ||
    typeof v.magnitude !== "number" ||
    !(v.magnitude > 0) ||
    (v.ratioType !== "Reduction" && v.ratioType !== "Step-up")
  )
    throw new Error(`ReCalc oranı okunamadı: ${key}.`);
  return {
    value: v.ratioType === "Reduction" ? v.magnitude : 1 / v.magnitude,
    text: `${v.magnitude}:1 ${v.ratioType === "Reduction" ? "redüksiyon" : "hızlandırma"}`,
  };
}

const flag = (q: URLSearchParams, key: string) => q.get(key) === "true";
const mm = (m: number) => `${(m * 1000).toFixed(1)} mm`;
const kg = (m: number) => `${(m * 1000).toFixed(0)} g`;

function wheelMass(
  q: URLSearchParams,
  weightKey: string,
  customKey: string,
  useCustomKey: string,
): Pick<WheelConfig, "mass" | "inertia" | "inertiaMode"> & {
  text: string;
  ours: string;
} {
  const weight = measure(q, weightKey, "mass");
  const custom = measure(q, customKey, "moi");
  if (flag(q, useCustomKey) && custom)
    return {
      mass: weight?.si ?? null,
      inertia: custom.si,
      inertiaMode: "custom",
      text: `MOI ${custom.text}`,
      ours: `${custom.si.toExponential(3)} kg·m² (özel)`,
    };
  if (weight && weight.si > 0)
    return {
      mass: weight.si,
      inertia: null,
      inertiaMode: "disk",
      text: weight.text,
      ours: `${kg(weight.si)} · disk ataleti`,
    };
  return {
    mass: null,
    inertia: null,
    inertiaMode: "unknown",
    text: "—",
    ours: "bilinmiyor",
  };
}

export function parseRecalcLink(text: string): RecalcImport {
  const q = queryOf(text);
  const mode = q.get("shooterMode") as RecalcMode;
  if (!["single-hooded", "dual-shooter", "compound"].includes(mode))
    throw new Error(`ReCalc shooter tipi tanınmıyor: ${q.get("shooterMode")}.`);
  if (mode === "compound")
    throw new Error(
      "ReCalc'taki Compound (Single + Dual) shooter henüz kurulum sihirbazına aktarılamıyor. ReCalc'ta Single Shooter Wheel + Hood ya da Dual Shooter Wheel seçip linki yeniden kopyala.",
    );
  const diameter = measure(q, "shooterDiameter", "length");
  const target = measure(q, "shooterTargetSpeed", "rpm");
  if (!diameter || !target)
    throw new Error("Linkte teker çapı veya hedef hız yok.");
  const rows: RecalcRow[] = [];
  const warnings: string[] = [];
  const dual = mode === "dual-shooter";
  const spec: RobotSpec = {
    ...blankSpec(),
    name: "ReCalc'tan aktarılan robot",
    mechanism: dual ? "twin-wheel" : "wheel-fixed-hood",
    wheelDiameter: diameter.si,
    wheelRPM: target.si,
    drive: "gear",
    ratio: 1,
  };
  rows.push({
    label: "Shooter tipi",
    recalc: dual ? "Dual Shooter Wheel" : "Single Shooter Wheel + Hood",
    ours: dual ? "Karşılıklı iki teker" : "Teker + sabit (dönmeyen) hood",
    status: "imported",
  });
  rows.push({
    label: "Ana teker çapı",
    recalc: diameter.text,
    ours: mm(diameter.si),
    status: "imported",
  });
  rows.push({
    label: "Ana teker hedef hızı",
    recalc: target.text,
    ours: `${target.si.toFixed(0)} RPM`,
    status: "imported",
  });
  const primary = wheelMass(
    q,
    "shooterWeight",
    "customShooterMoi",
    "useCustomShooterMoi",
  );
  rows.push({
    label: "Ana teker ağırlık / atalet",
    recalc: primary.text,
    ours: primary.ours,
    status: primary.inertiaMode === "unknown" ? "ignored" : "imported",
  });
  const extras: RecalcExtras = {
    primary: {
      mass: primary.mass,
      inertia: primary.inertia,
      inertiaMode: primary.inertiaMode,
    },
  };
  if (dual) {
    const top = measure(q, "secondaryShooterDiameter", "length");
    const r = ratio(q, "secondaryShooterToShooterRatio");
    if (top) spec.topWheelDiameter = top.si;
    if (r) spec.ratio = r.value;
    rows.push({
      label: "Üst teker çapı",
      recalc: top?.text ?? "—",
      ours: mm(spec.topWheelDiameter),
      status: top ? "imported" : "kept",
    });
    rows.push({
      label: "Üst / alt teker hız oranı",
      recalc: r?.text ?? "—",
      ours: `${spec.ratio.toFixed(3)} → üst teker ${(spec.wheelRPM * spec.ratio).toFixed(0)} RPM`,
      status: r ? "imported" : "kept",
    });
    const secondary = wheelMass(
      q,
      "secondaryShooterWeight",
      "customSecondaryShooterMoi",
      "useCustomSecondaryShooterMoi",
    );
    extras.secondary = {
      mass: secondary.mass,
      inertia: secondary.inertia,
      inertiaMode: secondary.inertiaMode,
    };
    rows.push({
      label: "Üst teker ağırlık / atalet",
      recalc: secondary.text,
      ours: secondary.ours,
      status: secondary.inertiaMode === "unknown" ? "ignored" : "imported",
    });
  }
  if (flag(q, "flywheelEnabled")) {
    const d = measure(q, "flywheelDiameter", "length");
    const m = wheelMass(
      q,
      "flywheelWeight",
      "customFlywheelMoi",
      "useCustomFlywheelMoi",
    );
    const r = ratio(q, "flywheelToShooterRatio");
    if (d && m.inertiaMode !== "unknown") {
      extras.flywheel = {
        diameter: d.si,
        omega: 0,
        mass: m.mass ?? 0,
        inertia: m.inertia ?? 0,
        inertiaMode: m.inertiaMode,
        ratio: r?.value ?? 1,
      };
      rows.push({
        label: "Ek flywheel",
        recalc: `${d.text} · ${m.text}${r ? ` · ${r.text}` : ""}`,
        ours: `${mm(d.si)} · ${m.ours}`,
        status: "imported",
      });
    }
  } else
    rows.push({
      label: "Ek flywheel",
      recalc: "kapalı",
      ours: "yok",
      status: "imported",
    });
  const motor = json(q, "motor") as
    { name?: unknown; quantity?: unknown } | undefined;
  if (
    motor &&
    typeof motor === "object" &&
    typeof motor.name === "string" &&
    typeof motor.quantity === "number"
  ) {
    const reduction = ratio(q, "ratio");
    const efficiency = Number(q.get("efficiency"));
    // Only positive values are taken; anything else keeps the model's default.
    const positive = (key: string, kind: Kind) => {
      const v = measure(q, key, kind);
      return v && v.si > 0 ? v.si : undefined;
    };
    const fields = {
      reduction: reduction?.value,
      efficiency:
        efficiency > 0 && efficiency <= 100 ? efficiency / 100 : undefined,
      voltage: positive("supplyVoltage", "voltage"),
      batteryResistance: positive("batteryResistance", "resistance"),
      statorLimit: positive("statorLimit", "current"),
      supplyLimit: positive("supplyLimit", "current"),
    };
    extras.motor = {
      name: motor.name.slice(0, 80),
      count: Math.min(16, Math.max(1, Math.round(motor.quantity))),
      ...Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== undefined),
      ),
    };
    rows.push({
      label: "Motor",
      recalc: `${extras.motor.count} × ${extras.motor.name}${reduction ? ` · ${reduction.text}` : ""}`,
      ours: "Kaydedilir; atış önizlemesi motor eğrisini kullanmaz",
      status: "kept",
    });
  }
  const feed = measure(q, "ballInitialVelocity", "speed");
  if (feed && feed.si > 0) {
    extras.feedSpeed = feed.si;
    rows.push({
      label: "Topun giriş hızı",
      recalc: feed.text,
      ours: `${feed.si.toFixed(2)} m/s`,
      status: "imported",
    });
  }
  const pd = measure(q, "projectileDiameter", "length");
  const pw = measure(q, "projectileWeight", "mass");
  if (pd || pw) {
    rows.push({
      label: "Oyun parçası",
      recalc: [pd?.text, pw?.text].filter(Boolean).join(" · "),
      ours: `BIOBUZZ POLLEN · ${mm(POLLEN_DIAMETER)} · 25 g (nominal)`,
      status: "ignored",
    });
    if (pd && Math.abs(pd.si - POLLEN_DIAMETER) / POLLEN_DIAMETER > 0.1)
      warnings.push(
        `ReCalc'taki top ${pd.text}; BIOBUZZ POLLEN ${mm(POLLEN_DIAMETER)}. Atışlar POLLEN ile hesaplanır, bu yüzden çıkış hızı ReCalc'tan farklı olabilir.`,
      );
  }
  if (spec.wheelRPM < 1 || spec.wheelRPM > 20000)
    throw new Error("ReCalc hedef hızı 1–20000 RPM aralığında değil.");
  if (spec.wheelDiameter < 0.01 || spec.wheelDiameter > 0.3)
    throw new Error("ReCalc teker çapı 10–300 mm aralığında değil.");
  warnings.push(
    "ReCalc'ta sıkışma (boşluk), çıkış yüksekliği ve hood açısı yok; bunları sonraki adımlarda sen gireceksin.",
  );
  return {
    mode,
    spec,
    missing: ["gap", "exitHeight", "hoodAngleDeg", "hoodMinDeg", "hoodMaxDeg"],
    rows,
    warnings,
    extras,
  };
}

/** Writes what the setup form cannot hold (inertias, flywheel, motor, feed) into a built config. */
export function applyRecalcExtras(
  config: Config,
  extras: RecalcExtras,
): Config {
  const q = structuredClone(config);
  const s = q.shooter;
  Object.assign(s.primary, extras.primary);
  if (extras.secondary) Object.assign(s.secondary, extras.secondary);
  if (extras.flywheel) {
    s.flywheel = { ...extras.flywheel };
    s.flywheelEnabled = true;
  }
  if (extras.motor) Object.assign(s.motor, extras.motor);
  if (extras.feedSpeed) q.projectile.initialVelocity = extras.feedSpeed;
  return q;
}
