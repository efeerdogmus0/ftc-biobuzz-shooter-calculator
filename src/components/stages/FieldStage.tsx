// Stage 3 · Saha: from where on the field does this robot score? Coverage map,
// the shot angle study and what the Limelight sees.
import {
  Loader2,
  Map as MapIcon,
  Navigation,
  Target,
  Trash2,
} from "lucide-react";
import { useMemo } from "react";
import type { AnalysisState } from "../../app/useAnalysis";
import { useStore } from "../../state/store";
import { Section } from "../Inputs";
import { LimelightPanel } from "../LimelightPanel";
import { useT } from "../../i18n/useT";
import {
  distanceOf,
  goToPoint,
  pointHere,
  tagsSeenAt,
} from "../../app/shotPoints";
import { toDeg, toRPM } from "../../utils/units";

const grids = [
  { spacing: 0.3, label: "Hızlı · 30 cm" },
  { spacing: 0.2, label: "Normal · 20 cm" },
  { spacing: 0.1, label: "İnce · 10 cm (dakikalar sürebilir)" },
];

export function FieldStage({
  a,
  openTool,
}: {
  a: AnalysisState;
  openTool: (tool: string) => void;
}) {
  const s = useStore();
  const t = useT();
  const scanning = a.busy === "coverage";
  const reachable = s.coverage.filter((x) => x.candidate).length;
  const c = s.config;
  const here = pointHere(s.shotPoints, c);
  const seen = useMemo(
    () =>
      s.camera ? s.shotPoints.map((p) => tagsSeenAt(c, s.camera!, p)) : null,
    [s.shotPoints, s.camera, c],
  );
  return (
    <div className="simple-panel">
      <p className="stage-lead">
        {t(
          "Robotun sahanın her noktasından atış yapmayı dener ve isabet bulduğu yerleri sahaya boyar.",
        )}
      </p>
      <section className="solve-card">
        {scanning ? (
          <div className="job">
            <span>
              {t.f("Saha taranıyor… %{p}", {
                p: Math.round(a.progress * 100),
              })}
            </span>
            <progress max={1} value={a.progress} />
            <button onClick={a.cancel}>{t("Durdur")}</button>
          </div>
        ) : (
          <button
            className="primary wide"
            disabled={!!a.busy}
            onClick={() => a.run("coverage")}
          >
            {a.busy ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <MapIcon size={14} />
            )}
            {t(s.coverage.length ? "Sahayı yeniden tara" : "Sahayı tara")}
          </button>
        )}
        <label className="select-control">
          {t("Tarama sıklığı")}
          <select
            value={a.spacing}
            disabled={scanning}
            onChange={(e) => a.setSpacing(Number(e.target.value))}
          >
            {grids.map((g) => (
              <option key={g.spacing} value={g.spacing}>
                {t(g.label)}
              </option>
            ))}
          </select>
        </label>
        {a.error && !a.busy && <p className="setup-error">{t(a.error)}</p>}
        {s.coverage.length > 0 ? (
          <>
            <div className="stage-figure">
              <b>
                {Math.round((100 * reachable) / s.coverage.length)}
                <small>%</small>
              </b>
              <span>
                {t.f("sahanın bu kadarından isabet var ({n} / {total} nokta)", {
                  n: reachable,
                  total: s.coverage.length,
                })}
              </span>
            </div>
            <label className="select-control">
              {t("Haritada göster")}
              <select
                value={s.coverageMode}
                onChange={(e) =>
                  s.set({
                    coverageMode: e.target.value as typeof s.coverageMode,
                  })
                }
              >
                <option value="reachability">
                  {t("Girer mi / hedef payı")}
                </option>
                <option value="angle">{t("Gereken atış açısı")}</option>
                <option value="velocity">{t("Gereken çıkış hızı")}</option>
                <option value="energy">{t("Top enerjisi")}</option>
              </select>
            </label>
            <p className="muted solve-hint">
              {t(
                "Haritada renkli bir kareye tıkla: robot oraya gider ve o noktanın açısı ile teker hızı uygulanır.",
              )}
            </p>
            <button onClick={() => s.set({ coverage: [] })}>
              {t("Haritayı kaldır")}
            </button>
          </>
        ) : (
          !scanning && (
            <p className="muted solve-hint">
              {t(
                "Robotu değiştirdiğinde harita silinir; yeniden taraman gerekir.",
              )}
            </p>
          )
        )}
      </section>
      <Section title="Atış noktaların" open>
        {s.shotPoints.length === 0 ? (
          <p className="muted">
            {t(
              "Henüz kayıtlı nokta yok. Atış adımında isabet bulunca “Bu noktayı kaydet”e bas ya da haritada bir kareye tıklayıp oradan kaydet. Otonom planı ve atış tablosu bu noktaları kullanır.",
            )}
          </p>
        ) : (
          <ul className="point-list">
            {s.shotPoints.map((p, i) => {
              const d = distanceOf(c, p);
              return (
                <li key={p.id} className={here?.id === p.id ? "here" : ""}>
                  <input
                    aria-label={t("Nokta adı")}
                    value={p.name}
                    maxLength={40}
                    onChange={(e) => s.renameShotPoint(p.id, e.target.value)}
                  />
                  <span className="point-facts">
                    {d.toFixed(2)} m · {toRPM(p.omega).toFixed(0)} RPM ·{" "}
                    {toDeg(p.hoodAngle + c.shooter.hoodOffset).toFixed(1)}°
                    {p.reliability !== undefined && (
                      <em
                        className={p.reliability >= 0.8 ? "good" : "warn"}
                        title={t("Güven adımında ölçülen isabet oranı")}
                      >
                        %{Math.round(p.reliability * 100)}
                      </em>
                    )}
                    {seen && (
                      <em
                        className={seen[i] ? "good" : "warn"}
                        title={t(
                          "Limelight bu noktadan HIVE'a dönükken kaç AprilTag görüyor",
                        )}
                      >
                        {seen[i]
                          ? t.f("{n} etiket", { n: seen[i] })
                          : t("etiket yok")}
                      </em>
                    )}
                  </span>
                  <button
                    className="icon"
                    title={t("Robotu bu noktaya götür")}
                    aria-label={t("Robotu bu noktaya götür")}
                    onClick={() => goToPoint(p)}
                  >
                    <Navigation size={13} />
                  </button>
                  <button
                    className="icon"
                    title={t("Noktayı sil")}
                    aria-label={t("Noktayı sil")}
                    onClick={() => s.removeShotPoint(p.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      <Section title="En iyi atış açısı" open>
        <p className="muted">
          {t(
            "Sabit hood'lu robotlar için: sahanın kurala uygun noktalarında hangi açı en çok yerden isabet veriyor?",
          )}
        </p>
        <button className="wide" onClick={() => openTool("study")}>
          <Target size={13} /> {t("Atış açısı çalışmasını aç…")}
        </button>
      </Section>
      <Section title="Limelight · AprilTag görüşü">
        <LimelightPanel />
      </Section>
    </div>
  );
}
