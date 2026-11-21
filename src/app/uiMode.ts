// Interface layout only. A mode decides which layout and controls are *shown*;
// it never changes, resets or ignores any physical input. Hidden inputs keep
// their values and the solver always uses the complete configuration.
//
// Basit (simple): one focused screen — 3D field, the robot card, the few
// settings a team actually touches, Fire / Auto solve and a plain result.
// Gelişmiş (advanced): the full engineering workbench (model tree, telemetry,
// physics, analysis, calibration, debug).
export type UiMode = "simple" | "advanced";
export const UI_MODE_KEY = "pollen-ui-mode";

export const uiModes: { id: UiMode; label: string; description: string }[] = [
  {
    id: "simple",
    label: "Basit arayüz",
    description:
      "Tek ekran: saha, robotun, birkaç temel ayar, Atış yap / Otomatik çöz ve anlaşılır sonuç. Gizli ayarlar değerlerini korur.",
  },
  {
    id: "advanced",
    label: "Gelişmiş arayüz",
    description:
      "Tam mühendislik tezgâhı: model ağacı, telemetri, fizik, saha, analiz, kalibrasyon ve hata ayıklama.",
  },
];

export function atLeast(mode: UiMode, min: UiMode) {
  return min === "simple" || mode === "advanced";
}

/**
 * A layout the user chose is kept. Older three-step choices map onto the two
 * layouts (Kolay → Basit; Orta / Zor → Gelişmiş). Without a choice everyone
 * starts in Basit: having saved work is not a sign of wanting the workbench.
 */
export function initialUiMode(storage: Pick<Storage, "getItem">): UiMode {
  const saved = storage.getItem(UI_MODE_KEY);
  if (saved === "simple" || saved === "easy") return "simple";
  if (saved === "advanced" || saved === "medium" || saved === "hard")
    return "advanced";
  return "simple";
}

// The advanced workbench shows every tab. The simple layout has no tab strip;
// these lists describe what each layout can reach.
export const propertyTabsFor = (mode: UiMode) =>
  mode === "simple"
    ? ["Shooter", "Analysis", "Sekiş", "Limelight"]
    : ["Shooter", "Physics", "Field", "Analysis", "Sekiş", "Limelight"];

export const bottomTabsFor = (mode: UiMode) =>
  mode === "simple"
    ? ["Flight telemetry", "Shot history"]
    : ["Flight telemetry", "Shot metrics", "Shot history", "Debug state"];
