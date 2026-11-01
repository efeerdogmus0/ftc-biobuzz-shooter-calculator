import type { Config } from "../physics/types";

/**
 * Names of this project's own pre-September-2026 default robot (72 mm wheel +
 * one 16 mm powered hood wheel) and its duplicate preset.
 */
export const LEGACY_DEFAULT_NAMES = [
  "72mm Rhino + Powered Hood",
  "BIOBUZZ POLLEN - Current Robot",
];

/**
 * Saved work is never rewritten on load. A name or a pair of numbers is not
 * proof that a scenario is an untouched factory default — a team can keep an
 * old name and set 72/16 mm on purpose, or place the HIVE where they measured
 * it. Older layouts are only *reported*; the user decides what to change.
 */
export function legacyNotices(c: Config): string[] {
  const notes: string[] = [];
  if (
    Math.abs(c.field.target.center[1] + 0.0254 * 6.5) < 1e-6 &&
    Math.abs(c.field.target.tilt + Math.PI / 3) < 1e-6
  )
    notes.push(
      "Kayıtlı senaryo eski HIVE konum/eğimini kullanıyor; değiştirilmedi. Güncel saha için yeni robot kur ya da genel örneği aç.",
    );
  if (
    LEGACY_DEFAULT_NAMES.includes(c.name) &&
    Math.abs(c.shooter.primary.diameter - 0.072) < 1e-9 &&
    Math.abs(c.shooter.secondary.diameter - 0.016) < 1e-9 &&
    c.shooter.rollers.length === 0
  )
    notes.push(
      "Kayıtlı robot eski varsayılan shooter'a benziyor; kayıtlı donanımın olduğu gibi korundu.",
    );
  return notes;
}
