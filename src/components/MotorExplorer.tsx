// Basit arayüz: compare motors and gear ratios for the main wheel, apply one,
// or open the same wheel in ReCalc for the motor-side dynamics.
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { AnalysisState } from "../app/useAnalysis";
import { inferSpec } from "../presets/factory";
import {
  defaultDrive,
  driveErrors,
  freeWheelRPM,
  motorConfigOf,
  motorOptions,
  recalcLinkFor,
  targetWheelRPM,
  type DriveChoice,
} from "../presets/motors";
import { useStore } from "../state/store";
import { rpm, toRPM } from "../utils/units";
import { candidatesMatch } from "./AnalysisPanel";
import { Section } from "./Inputs";
import { MotorPicker, Rich } from "./SetupFields";
import { useT } from "../i18n/useT";

export function MotorExplorer({ a }: { a: AnalysisState }) {
  const s = useStore();
  const t = useT();
  const c = s.config;
  const [drive, setDrive] = useState<DriveChoice>(defaultDrive);
  const ok = Object.keys(driveErrors(drive)).length === 0;
  const target = targetWheelRPM(drive);
  const current = toRPM(c.shooter.primary.omega);
  // Lowest wheel speed among the solver's hits for this robot and pose.
  const needed =
    candidatesMatch(a.candidateConfig, c) && a.candidates.length
      ? Math.min(...a.candidates.map((x) => toRPM(x.omega)))
      : null;
  const apply = () => {
    s.edit("shooter.primary.omega", rpm(target));
    const q = structuredClone(useStore.getState().config);
    q.shooter.motor = { ...q.shooter.motor, ...motorConfigOf(drive) };
    s.setConfig(q);
    s.set({ motorExplore: false });
  };
  const spec = inferSpec(c);
  return (
    <Section title="Motor ve dişli oranı" open={s.motorExplore}>
      {s.motorExplore && (
        <p className="ob-warning">
          {t.f(
            "Motor ve oran henüz seçilmedi; şu anki {rpm} RPM geçici. Aşağıda farklı seçenekleri karşılaştır, uygun olanı uygula.",
            { rpm: current.toFixed(0) },
          )}
        </p>
      )}
      <MotorPicker value={drive} onChange={setDrive} />
      <button className="primary wide" disabled={!ok} onClick={apply}>
        {t.f("Bu hızı uygula · {rpm} RPM", {
          rpm: ok ? target.toFixed(0) : "—",
        })}
      </button>
      <p className="ob-section">
        {t.f("AYNI DİŞLİ ORANI VE %{pct} İLE", { pct: drive.targetPct })}
      </p>
      {needed !== null ? (
        <p className="hint">
          <Rich
            text={t.f(
              "Bu konumdan isabet için en az ≈ <b>{rpm} RPM</b> gerekiyor (Otomatik çöz). Daha yüksek hız, açıyı ayarlayarak yine isabet ettirebilir: hızı uyguladıktan sonra Otomatik çöz'e tekrar bas.",
              { rpm: needed.toFixed(0) },
            )}
          />
        </p>
      ) : (
        <p className="hint">
          {t("İsabet için gereken hızı görmek için önce Otomatik çöz'e bas.")}
        </p>
      )}
      <table className="motor-table">
        <thead>
          <tr>
            <th>{t("Motor")}</th>
            <th>{t("Teker RPM")}</th>
            {needed !== null && <th />}
          </tr>
        </thead>
        <tbody>
          {motorOptions
            .filter((m) => m.id !== "custom")
            .map((m) => {
              const d = { ...drive, motorId: m.id };
              const w = targetWheelRPM(d);
              return (
                <tr
                  key={m.id}
                  className={m.id === drive.motorId ? "active" : ""}
                  onClick={() => setDrive(d)}
                >
                  <td>{t(m.label)}</td>
                  <td>
                    {ok ? w.toFixed(0) : "—"}
                    <small> / {ok ? freeWheelRPM(d).toFixed(0) : "—"}</small>
                  </td>
                  {needed !== null && (
                    <td>
                      <span
                        className={`rc-status ${w >= needed ? "imported" : "ignored"}`}
                      >
                        {t(w >= needed ? "yeter" : "yetmez")}
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
        </tbody>
      </table>
      <p className="hint">
        {t(
          "Çalışma hızı / serbest hız. Satıra tıklayınca o motor seçilir. Bu tablo yalnız teker hızını karşılaştırır; hızlanma süresi ve atış sonrası hız düşüşü için ReCalc'a bak.",
        )}
      </p>
      {spec && (
        <a
          className="link-button wide"
          href={recalcLinkFor(spec, drive)}
          target="_blank"
          rel="noreferrer"
        >
          {t("Bu teker ve motorla ReCalc'ta incele")} <ArrowRight size={13} />
        </a>
      )}
    </Section>
  );
}
