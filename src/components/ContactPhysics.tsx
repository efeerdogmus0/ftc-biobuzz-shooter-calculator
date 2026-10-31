import { useState } from "react";
import { useStore } from "../state/store";
import type { BounceSettings, Shot } from "../physics/types";
import {
  advancedBounceDefaults,
  dropCalibration,
  type SurfaceKind,
} from "../physics/contactModel";
type NumericKey = {
  [
    K in keyof Required<BounceSettings>
  ]: Required<BounceSettings>[K] extends number ? K : never;
}[keyof Required<BounceSettings>];
export function ContactPhysics({ shot }: { shot: Shot }) {
  const s = useStore(),
    settings = s.bounceSettings,
    d = shot.flight.diagnostics;
  const [drop, setDrop] = useState(""),
    [rise, setRise] = useState(""),
    [surface, setSurface] = useState<Exclude<SurfaceKind, "ball">>("floor"),
    [message, setMessage] = useState("");
  const edit = (value: Partial<BounceSettings>) =>
    s.set({
      bounceSettings: { ...settings, ...value },
      playing: false,
      selectedBounce: 0,
      playReset: s.playReset + 1,
    });
  const control = (
    key: NumericKey,
    label: string,
    min: number,
    max: number,
    step: number,
    fallback: number,
  ) => {
    const value = Number(settings[key] ?? fallback);
    return (
      <label key={key}>
        {label}
        <output>{value.toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0)}</output>
        <input
          aria-label={label}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => edit({ [key]: Number(e.target.value) })}
        />
      </label>
    );
  };
  const soft = settings.contactModel === "hertz",
    energy = d?.energy ?? [];
  const maxE = Math.max(
      0.01,
      ...energy.map(
        (e) => e.translation + e.rotation + e.elastic + (e.hiveKinetic ?? 0),
      ),
    ),
    end = energy.at(-1)?.t ?? 1;
  const curve = (
    kind: "translation" | "rotation" | "elastic" | "hiveKinetic",
  ) =>
    energy
      .map(
        (e) =>
          `${30 + (e.t / end) * 540},${118 - ((e[kind] ?? 0) / maxE) * 95}`,
      )
      .join(" ");
  return (
    <section className="contact-physics">
      <label>
        Temas modeli
        <select
          aria-label="Temas modeli"
          value={settings.contactModel ?? "rigid"}
          onChange={(e) =>
            edit({ contactModel: e.target.value as "rigid" | "hertz" })
          }
        >
          <option value="rigid">Çoklu rijit temas · hızlı</option>
          <option value="hertz">Hertz esnek temas · ayrıntılı</option>
        </select>
      </label>
      <label>
        Topun atalet modeli
        <select
          aria-label="Topun atalet modeli"
          value={settings.inertiaModel ?? "config"}
          onChange={(e) =>
            edit({
              inertiaModel: e.target.value as "config" | "solid" | "shell",
            })
          }
        >
          <option value="config">
            {settings.shapeModel === "pollen"
              ? "POLLEN kabuğu / ölçülmüş profil"
              : "Profildeki atalet / mevcut varsayım"}
          </option>
          <option value="solid">Katı küre</option>
          <option value="shell">İçi boş ince kabuk</option>
        </select>
      </label>
      <p>
        {soft
          ? "Sıkışma ve temas süresiyle normal kuvvet hesaplanır; sekme, malzeme kaybından ortaya çıkar. Tam şekil deformasyonu çözülmez."
          : "Darbeler ve yığındaki destek kuvvetleri birlikte çözülür. Sekme hıza göre değişir; kayma, tutunma, yuvarlanma ve eksen etrafında dönüş ayrı etkiler taşır."}
      </p>
      {s.bounceBusy && (
        <div className="physics-progress" role="status">
          {s.bounceProgress || "Sekiş hesaplanıyor…"}
        </div>
      )}
      {shot.flight.bounceError && (
        <p className="physics-warning" role="alert">
          {shot.flight.bounceError}
        </p>
      )}
      {d?.warnings.map((warning, i) => (
        <p key={i} className="physics-warning">
          {warning}
        </p>
      ))}
      <details open={soft}>
        <summary>Malzeme ve yüzey özellikleri</summary>
        <div className="bounce-settings">
          {soft ? (
            <>
              <label>
                Etkin Hertz sertliği
                <output>
                  {(settings.contactStiffness ?? 300000).toExponential(1)}{" "}
                  N/m¹·⁵
                </output>
                <input
                  aria-label="Etkin Hertz sertliği"
                  type="range"
                  min="4.7"
                  max="6.7"
                  step="0.05"
                  value={Math.log10(settings.contactStiffness ?? 300000)}
                  onChange={(e) =>
                    edit({ contactStiffness: 10 ** Number(e.target.value) })
                  }
                />
              </label>
              {control(
                "materialDissipation",
                "Malzeme enerji kaybı · s/m",
                0,
                1,
                0.01,
                0.3,
              )}
            </>
          ) : (
            <>
              {(["floor", "wall", "cell", "ball"] as const).map((key, i) =>
                control(
                  key,
                  [
                    "Zemin sekmesi",
                    "Duvar sekmesi",
                    "CELL sekmesi",
                    "Top–top sekmesi",
                  ][i],
                  0,
                  1,
                  0.01,
                  key === "ball" ? 0.55 : 0.4,
                ),
              )}
              {control(
                "speedLoss",
                "Hızla sekme azalması · s/m",
                0,
                0.2,
                0.005,
                0.035,
              )}
              {control(
                "referenceSpeed",
                "Sekme referans hızı · m/s",
                0.1,
                10,
                0.1,
                1,
              )}
            </>
          )}
          {(["floor", "wall", "cell", "ball"] as const).map((kind, i) => {
            const v = settings.surfaceFriction?.[kind] ?? settings.friction;
            const label = [
              "Zemin kayma sürtünmesi",
              "Duvar kayma sürtünmesi",
              "CELL kayma sürtünmesi",
              "Top–top kayma sürtünmesi",
            ][i];
            return (
              <label key={kind}>
                {label}
                <output>{v.toFixed(2)}</output>
                <input
                  aria-label={label}
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={v}
                  onChange={(e) =>
                    edit({
                      surfaceFriction: {
                        ...settings.surfaceFriction,
                        [kind]: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            );
          })}
          {control("staticRatio", "Tutunma / kayma oranı", 1, 2, 0.05, 1.4)}
          {control(
            "rollingResistance",
            "Yuvarlanma direnci",
            0,
            0.3,
            0.005,
            0.08,
          )}
          {control(
            "spinResistance",
            "Eksen etrafında dönüş direnci",
            0,
            0.15,
            0.005,
            0.015,
          )}
        </div>
        <p>
          Katsayılar ölçülmemiş başlangıç varsayımlarıdır. Tutunma sınırı
          aşılınca kayma sürtünmesi kullanılır; dönme direnci temas yüküne
          bağlıdır.
        </p>
      </details>
      {!soft && (
        <details>
          <summary>Düşürme ölçümüyle sekmeyi ayarla</summary>
          <p>
            Aynı malzemeden düz, yatay numuneye sıfır spinle bırakılan top için:
            e = √(sekme yüksekliği / bırakma yüksekliği). Hava etkisi ihmal
            edilir; tek ölçüm yalnızca bu hızdaki katsayıyı belirler.
          </p>
          <div className="drop-calibration">
            <select
              aria-label="Ölçülen yüzey"
              value={surface}
              onChange={(e) => setSurface(e.target.value as typeof surface)}
            >
              <option value="floor">Zemin</option>
              <option value="cell">CELL malzemesi</option>
              <option value="wall">Duvar malzemesi</option>
            </select>
            <label>
              Bırakma yüksekliği · mm
              <input
                aria-label="Bırakma yüksekliği"
                type="number"
                value={drop}
                onChange={(e) => setDrop(e.target.value)}
              />
            </label>
            <label>
              Sekme yüksekliği · mm
              <input
                aria-label="Sekme yüksekliği"
                type="number"
                value={rise}
                onChange={(e) => setRise(e.target.value)}
              />
            </label>
            <button
              onClick={() => {
                try {
                  const measured = dropCalibration(
                    Number(drop) / 1000,
                    Number(rise) / 1000,
                    s.config.environment.gravity,
                  );
                  const delta =
                    (settings.speedLoss ?? 0.035) *
                    (measured.speed - (settings.referenceSpeed ?? 1));
                  const rebased = Object.fromEntries(
                    (["floor", "wall", "cell", "ball"] as const).map((key) => [
                      key,
                      Math.max(0, Math.min(1, (settings[key] ?? 0.55) - delta)),
                    ]),
                  );
                  edit({
                    ...rebased,
                    [surface]: measured.restitution,
                    referenceSpeed: measured.speed,
                  });
                  setMessage(
                    `e=${measured.restitution.toFixed(3)} · ${measured.speed.toFixed(2)} m/s referansı uygulandı.`,
                  );
                } catch (error) {
                  setMessage(String(error));
                }
              }}
            >
              Ölçümü uygula
            </button>
            <p role="status">{message}</p>
          </div>
        </details>
      )}
      <details>
        <summary>Hesap hassasiyeti ve enerji</summary>
        <div className="bounce-settings">
          {control("previewTime", "Simülasyon süresi · s", 0.5, 20, 0.5, 10)}
          {control("solverIterations", "Temas çözüm tekrarları", 4, 48, 1, 16)}
          <label>
            En büyük temas adımı
            <output>
              {((settings.maxContactStep ?? 0.001) * 1000).toFixed(2)} ms
            </output>
            <input
              aria-label="En büyük temas adımı"
              type="range"
              min="0.00005"
              max="0.002"
              step="0.00005"
              value={settings.maxContactStep ?? 0.001}
              onChange={(e) => edit({ maxContactStep: Number(e.target.value) })}
            />
          </label>
        </div>
        <button
          className="refine-physics"
          onClick={() =>
            edit({
              maxContactStep: Math.max(
                0.00005,
                (settings.maxContactStep ?? 0.001) / 2,
              ),
              solverIterations: Math.min(
                48,
                (settings.solverIterations ?? 16) + 8,
              ),
            })
          }
        >
          Daha küçük adımla yeniden hesapla
        </button>
        {d && (
          <>
            <div className="impact-metrics">
              <span>
                En küçük adım<strong>{(d.minStep * 1000).toFixed(3)} ms</strong>
              </span>
              <span>
                {soft ? "En büyük sıkışma" : "En büyük sayısal geçiş"}
                <strong>{(d.maxOverlap * 1000).toFixed(2)} mm</strong>
              </span>
              {soft && (
                <span title="Noktasal Hertz yaklaşımı küçük sıkışma varsayar. %15, bu uygulamanın tanı amaçlı uyarı eşiğidir; evrensel bir Hertz geçerlilik sınırı değildir. k ölçülmediği için fiziksel doğruluk iddiası yoktur.">
                  Sıkışma / yarıçap
                  <strong
                    className={
                      d.maxOverlap > (s.config.projectile.diameter / 2) * 0.15
                        ? "warn"
                        : ""
                    }
                  >
                    {(
                      (100 * d.maxOverlap) /
                      (s.config.projectile.diameter / 2)
                    ).toFixed(1)}{" "}
                    %{" "}
                    {d.maxOverlap > (s.config.projectile.diameter / 2) * 0.15
                      ? "· uyarı eşiği (%15) aşıldı"
                      : "· uyarı eşiği %15"}
                  </strong>
                </span>
              )}
              <span>
                Enerji bilançosu farkı
                <strong>{(d.energyBalanceError * 1000).toFixed(2)} mJ</strong>
              </span>
              <span>
                {soft ? "Malzemede enerji kaybı" : "Temas işi"}
                <strong>
                  {(
                    (soft ? d.normalDissipationLoss : d.contactWork) * 1000
                  ).toFixed(2)}{" "}
                  mJ
                </strong>
              </span>
              <span>
                Yığını oturtma
                <strong>
                  {d.settlingTime.toFixed(2)} s ·{" "}
                  {d.settled ? "durdu" : "hareket sürüyor"}
                </strong>
              </span>
            </div>
            <svg
              viewBox="0 0 600 145"
              className="bounce-chart"
              role="img"
              aria-label="Sekiş enerji grafiği"
            >
              <text x="30" y="15">
                Hareket · dönüş · esneme enerjisi (J)
              </text>
              <text x="5" y="30">
                {maxE.toFixed(2)}
              </text>
              <polyline
                points={curve("translation")}
                fill="none"
                stroke="#66e6d4"
                strokeWidth="2"
              />
              <polyline
                points={curve("rotation")}
                fill="none"
                stroke="#d29cff"
                strokeWidth="2"
              />
              <polyline
                points={curve("elastic")}
                fill="none"
                stroke="#f5ce77"
                strokeWidth="2"
              />
              <polyline
                points={curve("hiveKinetic")}
                fill="none"
                stroke="#ffa8be"
                strokeWidth="2"
              />
              <text x="30" y="138">
                0 s
              </text>
              <text x="535" y="138">
                {end.toFixed(2)} s
              </text>
            </svg>
            <p>
              Turkuaz: ilerleme · mor: topun dönüşü · sarı: esneme · pembe:
              HIVE'ın dönüşü. Rijit modelde kuvvet, darbenin zaman adımına
              bölünmüş ortalamasıdır; fiziksel tepe kuvveti değildir.
              {soft &&
                " Enerji farkı, malzeme kaybının ayrı integraliyle kontrol edilir; adımı küçülterek karşılaştır."}
            </p>
          </>
        )}
      </details>
      <button
        className="reset-physics"
        onClick={() => edit(advancedBounceDefaults)}
      >
        Gelişmiş ayarları sıfırla
      </button>
    </section>
  );
}
