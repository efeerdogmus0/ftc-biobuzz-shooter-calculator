// Stage 4 · Güven: will this shot still go in when the robot is a little off?
// Monte Carlo with plain tolerance presets, plus the bounce simulation.
import { Dices, Loader2 } from "lucide-react";
import { useEffect } from "react";
import type { AnalysisState } from "../../app/useAnalysis";
import { RELIABLE } from "../../app/journey";
import { defaultUncertainty, type Uncertainty } from "../../physics/analysis";
import type { Config, Shot } from "../../physics/types";
import { useStore } from "../../state/store";
import { AnalysisPanel } from "../AnalysisPanel";
import { BounceControls } from "../BounceControls";
import { Section, Toggle } from "../Inputs";
import { useT } from "../../i18n/useT";
import { pointHere } from "../../app/shotPoints";

const presets = [
  {
    scale: 0.5,
    label: "Özenli",
    hint: "PID'li teker, sıkı mekanik, dikkatli hizalama",
  },
  { scale: 1, label: "Normal", hint: "Tipik bir FTC robotu" },
  {
    scale: 2,
    label: "Kaba",
    hint: "Boşluklu mekanik, pil düşünce yavaşlayan teker",
  },
] as const;

const scaled = (k: number) =>
  Object.fromEntries(
    Object.entries(defaultUncertainty).map(([key, v]) => [key, v * k]),
  ) as unknown as Uncertainty;

/** True when the stored Monte Carlo result belongs to the robot on screen. */
export const reliabilityOf = (a: AnalysisState, c: Config) =>
  a.mc && a.mcConfig === JSON.stringify(c) ? a.mc.probability : null;

export function TrustStage({ a, shot }: { a: AnalysisState; shot: Shot }) {
  const s = useStore();
  const t = useT();
  const running = a.busy === "monteCarlo";
  const p = reliabilityOf(a, s.config);
  const old = a.mc && p === null;
  // The measured hit rate belongs to the saved point the robot stands on.
  const here = pointHere(s.shotPoints, s.config);
  useEffect(() => {
    if (p === null || !here || here.reliability === p) return;
    useStore.getState().set({
      shotPoints: useStore
        .getState()
        .shotPoints.map((x) =>
          x.id === here.id ? { ...x, reliability: p } : x,
        ),
    });
  }, [p, here]);
  const active = presets.find(
    (x) =>
      Math.abs(a.uncertainty.rpm - defaultUncertainty.rpm * x.scale) < 1e-9,
  );
  const verdict =
    p === null
      ? ""
      : p >= 0.95
        ? "Çok güvenilir. Küçük hatalar bu atışı bozmuyor."
        : p >= RELIABLE
          ? "Güvenilir. Maçta çoğu atış girer."
          : p >= 0.5
            ? "Riskli. Hedef payı daha büyük bir açı / hız seç ya da HIVE'a yaklaş."
            : "Güvenilmez. Bu ayar ancak şansla girer; Atış adımında başka bir çözüm seç.";
  return (
    <div className="simple-panel">
      <p className="stage-lead">
        {t(
          "Gerçek robot her atışta biraz farklı atar. Aynı atışı küçük hatalarla yüzlerce kez dener, kaçının girdiğini sayar.",
        )}
      </p>
      <section className="solve-card">
        <span className="stage-label">{t("Robotun ne kadar tutarlı?")}</span>
        <div className="preset-row" role="radiogroup">
          {presets.map((x) => (
            <button
              key={x.label}
              role="radio"
              aria-checked={active === x}
              className={active === x ? "active" : ""}
              title={t(x.hint)}
              disabled={running}
              onClick={() => a.setUncertainty(scaled(x.scale))}
            >
              {t(x.label)}
            </button>
          ))}
        </div>
        <p className="muted solve-hint">
          {t(active ? active.hint : "Özel toleranslar (aşağıda ayrıntılar)")}
        </p>
        {running ? (
          <div className="job">
            <span>
              {t.f("Deneniyor… %{p}", { p: Math.round(a.progress * 100) })}
            </span>
            <progress max={1} value={a.progress} />
            <button onClick={a.cancel}>{t("Durdur")}</button>
          </div>
        ) : (
          <button
            className="primary wide"
            disabled={!!a.busy}
            onClick={() => a.run("monteCarlo")}
          >
            {a.busy ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Dices size={14} />
            )}
            {t.f("{n} atış dene", { n: a.count })}
          </button>
        )}
        {a.error && !a.busy && <p className="setup-error">{t(a.error)}</p>}
      </section>
      {p !== null && a.mc && (
        <section
          className={`result-card ${p >= RELIABLE ? "hit" : "miss"}`}
          aria-live="polite"
        >
          <div className="stage-figure">
            <b>
              {(100 * p).toFixed(0)}
              <small>%</small>
            </b>
            <span>
              {t.f("{hits} / {count} atış girdi", {
                hits: a.mc.hits,
                count: a.mc.count,
              })}
            </span>
          </div>
          <p>{t(verdict)}</p>
          <p className="muted">
            {t(
              "Bu, girişi ölçer; topun HIVE içinde kalmasını değil. Toleranslar tahmindir, robotunda ölçülmedi.",
            )}
          </p>
        </section>
      )}
      {old && !running && (
        <p className="notice">
          {t("Eski sonuç başka bir ayara aitti. Yeniden dene.")}
        </p>
      )}
      <Section title="Toleranslar ve dağılım (ayrıntı)">
        <AnalysisPanel a={a} only="mc" />
      </Section>
      <Section
        title="Sekiş: top girdikten sonra ne oluyor?"
        open={s.bounceEnabled}
      >
        <Toggle
          label="Sekiş simülasyonu"
          checked={s.bounceEnabled}
          onChange={(bounceEnabled) =>
            s.set({
              bounceEnabled,
              playing: false,
              playReset: s.playReset + 1,
              showTrajectory: true,
            })
          }
        />
        <p className="muted">
          {t(
            "Topun hücreye, duvara ve içerideki diğer toplara çarpıp nerede durduğunu hesaplar. Daha yavaştır.",
          )}
        </p>
        {s.bounceEnabled && <BounceControls shot={shot} />}
      </Section>
    </div>
  );
}
