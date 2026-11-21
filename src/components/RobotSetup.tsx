// Robot identity helpers and the "Robotum" card. The guided setup itself is
// the full-screen flow in Onboarding.tsx.
import { useStore } from "../state/store";
import { inferSpec, mechanisms, type RobotSpec } from "../presets/factory";
import type { ScenarioOrigin } from "../utils/scenario";
import { useT } from "../i18n/useT";

export function originLabel(origin: ScenarioOrigin | null | undefined) {
  if (!origin || origin.kind === "user") return "Robotum";
  return origin.kind === "example" ? "Örnek · ölçülmemiş" : "Referans (kopya)";
}

/** Spec for "Kurulumu düzenle", read exactly from the live config (never a stale copy). */
export function currentSpec(): RobotSpec | null {
  return inferSpec(useStore.getState().config);
}

export function RobotCard() {
  const s = useStore();
  const t = useT();
  const spec = inferSpec(s.config);
  const mechanism = spec
    ? mechanisms.find((m) => m.id === spec.mechanism)?.label
    : "Compound / ReCalc modeli (Gelişmiş arayüzde düzenlenir)";
  return (
    <div className="robot-card">
      <div>
        <span className={`origin-chip ${s.origin?.kind ?? "user"}`}>
          {t(originLabel(s.origin))}
        </span>
        <b>{t(s.config.name)}</b>
      </div>
      <p className="muted">{mechanism && t(mechanism)}</p>
      {s.origin?.kind && s.origin.kind !== "user" && (
        <p className="muted">
          {s.origin.source ? `${t(s.origin.source)}. ` : ""}
          {t(
            "Değişiklikler bu kopyada kalır; üstteki Kaydet ile Robotlarım'a eklenir.",
          )}
        </p>
      )}
      <div className="button-row">
        <button disabled={!spec} onClick={() => s.set({ setupOpen: "edit" })}>
          {t("Kurulumu düzenle")}
        </button>
        <button onClick={() => s.set({ setupOpen: "home" })}>
          {t("Başka robot…")}
        </button>
      </div>
    </div>
  );
}
