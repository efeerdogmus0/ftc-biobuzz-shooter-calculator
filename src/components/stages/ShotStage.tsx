// Stage 2 · Atış: the shot result in plain words, Auto solve with one-click
// suggestions, then the two values a team sets on the real robot.
import { Check, Crosshair, Loader2, MapPin, Navigation } from "lucide-react";
import type { AnalysisState } from "../../app/useAnalysis";
import type { Shot } from "../../physics/types";
import { useStore } from "../../state/store";
import { toDeg, toRPM } from "../../utils/units";
import { aim } from "../../physics/flight";
import { wheelSpeeds } from "../../physics/shooter";
import { applyCandidate, candidatesMatch } from "../AnalysisPanel";
import { NumberInput as N, Section, Toggle } from "../Inputs";
import { useT } from "../../i18n/useT";
import { pointHere, pointOf } from "../../app/shotPoints";
import { MAX_SHOT_POINTS } from "../../utils/scenario";

const meaning: Record<Shot["flight"]["status"], string> = {
  HIT: "Top HIVE hücresine giriyor.",
  MISS: "Top hedefe girmiyor. Açıyı veya hızı değiştir ya da Otomatik çöz'ü dene.",
  "CLIPPED EDGE": "Top hücrenin kenarına sürtüyor; küçük bir hata ıskalatır.",
  "COLLIDED BEFORE ENTRY": "Top hedefe girmeden bir yapıya çarpıyor.",
  "NO EXIT":
    "Top shooter'dan çıkamıyor: hız, sıkışma veya temas ayarlarını kontrol et.",
};
const label: Record<Shot["flight"]["status"], string> = {
  HIT: "İSABET",
  MISS: "ISKA",
  "CLIPPED EDGE": "KENARA SÜRTÜYOR",
  "COLLIDED BEFORE ENTRY": "ÇARPIYOR",
  "NO EXIT": "ÇIKMIYOR",
};

export function ShotStage({
  shot,
  a,
  distance,
  solve,
  stale,
}: {
  shot: Shot;
  a: AnalysisState;
  distance: number;
  solve: () => void;
  stale: boolean;
}) {
  const s = useStore();
  const t = useT();
  const c = s.config;
  const f = shot.flight;
  const ok = f.status === "HIT";
  // Suggestions computed for another robot / pose are never offered.
  const fresh = candidatesMatch(a.candidateConfig, c);
  const saved = pointHere(s.shotPoints, c);
  const full = s.shotPoints.length >= MAX_SHOT_POINTS;
  return (
    <div className="simple-panel">
      <section
        className={`result-card ${ok ? "hit" : "miss"} ${stale ? "stale" : ""}`}
        aria-live="polite"
      >
        <div className="result-head">
          <span className="result-status">{t(label[f.status])}</span>
          <span className="muted">
            {t.f("hedefe {d} m", { d: distance.toFixed(2) })}
          </span>
        </div>
        <p>{t(stale ? "Yeni ayarlar hesaplanıyor…" : meaning[f.status])}</p>
        <div className="result-grid">
          <div>
            <span>{t("Atış açısı")}</span>
            <b>
              {toDeg(c.shooter.hoodAngle + c.shooter.hoodOffset).toFixed(1)}{" "}
              <small>°</small>
            </b>
          </div>
          <div>
            <span>{t("Teker hızı")}</span>
            <b>
              {toRPM(c.shooter.primary.omega).toFixed(0)} <small>RPM</small>
            </b>
          </div>
          <div>
            <span>{t("Çıkış hızı")}</span>
            <b>
              {shot.shooter.speed.toFixed(2)} <small>m/s</small>
            </b>
          </div>
          <div title={t("Topun hücre kenarına en yakın geçtiği mesafe")}>
            <span>{t("Hedef payı")}</span>
            <b>
              {f.entry ? (f.entry.clearance * 1000).toFixed(0) : "—"}{" "}
              <small>mm</small>
            </b>
          </div>
        </div>
        {ok && !stale && (
          <div className="result-save">
            {saved ? (
              <span className="saved-point">
                <Check size={13} />
                {t.f("Atış noktası olarak kayıtlı: {name}", {
                  name: saved.name,
                })}
              </span>
            ) : (
              <button
                disabled={full}
                title={t(
                  full
                    ? "En fazla 40 atış noktası kaydedilebilir."
                    : "Bu konum ve ayar; Saha, Otonom ve Robota aktar adımlarında kullanılır.",
                )}
                onClick={() => s.saveShotPoint(pointOf(c, shot))}
              >
                <MapPin size={13} /> {t("Bu noktayı kaydet")}
              </button>
            )}
          </div>
        )}
      </section>
      <section className="solve-card">
        <button className="primary wide" disabled={!!a.busy} onClick={solve}>
          {a.busy === "solve" ? (
            <Loader2 size={14} className="spin" />
          ) : (
            <Crosshair size={14} />
          )}
          {a.busy === "solve"
            ? t.f("Aranıyor… %{p}", { p: Math.round(a.progress * 100) })
            : t("Otomatik çöz")}
        </button>
        {!(fresh && a.candidates.length > 0) && !a.busy && (
          <p className="muted solve-hint">
            {t("Bu konumdan isabet eden açıyı ve teker hızını bulur.")}
          </p>
        )}
        {a.error && <p className="setup-error">{t(a.error)}</p>}
        {fresh && a.candidates.length > 0 && (
          <div className="suggestions">
            <p className="muted">
              {t(
                "Bu konumdan isabet eden ayarlar. En iyisi robota uygulandı; başka birine tıklayarak geçebilirsin:",
              )}
            </p>
            {a.candidates.slice(0, 3).map((x, i) => {
              const applied =
                Math.abs(x.angle - c.shooter.hoodAngle) < 1e-6 &&
                Math.abs(x.omega - c.shooter.primary.omega) < 1e-6;
              return (
                <button
                  key={i}
                  className={`suggestion ${applied ? "applied" : ""}`}
                  aria-pressed={applied}
                  onClick={() => applyCandidate(a, x)}
                >
                  <b>
                    {toDeg(x.angle).toFixed(1)}° · {toRPM(x.omega).toFixed(0)}{" "}
                    RPM
                  </b>
                  <small>
                    {x.speed.toFixed(2)} m/s ·{" "}
                    {t.f("{c} mm pay", { c: (x.clearance * 1000).toFixed(0) })}
                    {applied && <em>{t("Uygulandı")}</em>}
                  </small>
                </button>
              );
            })}
          </div>
        )}
        {fresh && !a.busy && a.candidates.length === 0 && (
          <p className="muted">
            {t(
              'Bu konumdan isabet bulunamadı. Robotu hedefe yaklaştır veya açı aralığını Robot adımındaki Kurulumu düzenle\'den genişlet. (Arama sınırlıdır; "bulunamadı" imkânsız demek değildir.)',
            )}
          </p>
        )}
      </section>
      <Section title="Elle ayarla" open>
        <N
          label="Teker hızı"
          path="shooter.primary.omega"
          kind="rpm"
          max={c.simulation.maxOmega}
          step={(2 * Math.PI) / 60}
        />
        <N
          label="Atış açısı"
          path="shooter.hoodAngle"
          kind="angle"
          min={c.shooter.hoodMin}
          max={c.shooter.hoodMax}
        />
      </Section>
      <Section title="Daha fazla ayar">
        {c.shooter.topology !== "passive" && (
          <div className="inline-metric">
            <span>
              {t(
                c.shooter.topology === "opposing"
                  ? "Üst teker"
                  : "Hood tekerleği",
              )}
            </span>
            <strong>
              {toRPM(wheelSpeeds(c)[1]).toFixed(0)} <small>RPM</small>
            </strong>
          </div>
        )}
        <div className="two-col">
          <N
            label="Robot X"
            path="robot.x"
            kind="length"
            min={-c.field.size / 2}
            max={c.field.size / 2}
            slider={false}
          />
          <N
            label="Robot Y"
            path="robot.y"
            kind="length"
            min={-c.field.size / 2}
            max={c.field.size / 2}
            slider={false}
          />
        </div>
        <button className="wide" onClick={() => s.setConfig(aim(s.config))}>
          <Navigation size={13} /> {t("Taret'i HIVE'a çevir")}
        </button>
        <Toggle
          label="Robot sürüklenince otomatik nişan al"
          checked={s.autoAim}
          onChange={(autoAim) => s.set({ autoAim })}
        />
      </Section>
    </div>
  );
}
