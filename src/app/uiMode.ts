// Interface complexity only. A mode decides which controls are *shown*; it never
// changes, resets or ignores any physical input. Hidden inputs keep their values
// and the solver always uses the complete configuration.
export type UiMode = "easy" | "medium" | "hard";
export const UI_MODE_KEY = "pollen-ui-mode";
const order: Record<UiMode, number> = { easy: 0, medium: 1, hard: 2 };

export const uiModes: { id: UiMode; label: string; description: string }[] = [
  {
    id: "easy",
    label: "Kolay",
    description:
      "Robot tipi, konum, açı ve RPM; atış, yörünge ve sekme. Gizli ayarlar değerlerini korur.",
  },
  {
    id: "medium",
    label: "Orta",
    description:
      "Kolay + teker/hood bağlantısı, sıkışma ve temas, POLLEN, aero, saha ve HIVE/temas ayarları.",
  },
  {
    id: "hard",
    label: "Zor (Gelişmiş)",
    description:
      "Tüm mühendislik tezgâhı: motor, sayısal integrasyon, analiz, kalibrasyon ve hata ayıklama.",
  },
];

export function atLeast(mode: UiMode, min: UiMode) {
  return order[mode] >= order[min];
}

/** New visitors start in Kolay; anyone who already has saved work keeps the full workbench. */
export function initialUiMode(storage: Pick<Storage, "getItem">): UiMode {
  const saved = storage.getItem(UI_MODE_KEY);
  if (saved === "easy" || saved === "medium" || saved === "hard") return saved;
  const returning =
    storage.getItem("pollen-active") !== null ||
    storage.getItem("pollen-profiles") !== null;
  return returning ? "hard" : "easy";
}

export const propertyTabsFor = (mode: UiMode) =>
  mode === "easy"
    ? ["Shooter", "Sekiş"]
    : mode === "medium"
      ? ["Shooter", "Physics", "Field", "Sekiş"]
      : ["Shooter", "Physics", "Field", "Analysis", "Sekiş"];

export const bottomTabsFor = (mode: UiMode) =>
  mode === "easy"
    ? ["Flight telemetry", "Shot history"]
    : mode === "medium"
      ? ["Flight telemetry", "Shot metrics", "Shot history"]
      : ["Flight telemetry", "Shot metrics", "Shot history", "Debug state"];
