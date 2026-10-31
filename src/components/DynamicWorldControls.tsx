import { useStore } from "../state/store";
import type { BounceSettings, Shot, Vec3 } from "../physics/types";
import { sampleHive } from "../physics/hiveDynamics";
import { residentPlayback } from "../utils/residentPlayback";
import { defaultHiveReference } from "../physics/hiveReference";
const deg = (x: number) => (x * 180) / Math.PI,
  rad = (x: number) => (x * Math.PI) / 180;
export function DynamicWorldControls({ shot }: { shot: Shot }) {
  const s = useStore(),
    p = s.bounceSettings,
    f = shot.flight,
    h = sampleHive(f.hiveTrack ?? [], s.playbackTime);
  const edit = (v: Partial<BounceSettings>) =>
    s.set({
      bounceSettings: { ...p, ...v },
      playing: false,
      selectedBounce: 0,
      playReset: s.playReset + 1,
    });
  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    set: (x: number) => void,
    unit = "",
  ) => (
    <label key={label}>
      {label}
      <output>
        {value.toFixed(step < 1 ? 2 : 0)} {unit}
      </output>
      <input
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => set(Number(e.target.value))}
      />
    </label>
  );
  const orientation = p.orientation ?? [0, 0, 0],
    residents = residentPlayback(shot, s.playbackTime),
    inside = residents.filter((b) => b.inside).length,
    spinRPM = (shot.shooter.spin * 30) / Math.PI;
  const replaySpill = () =>
    s.set({
      view: "HIVE",
      cameraReset: s.cameraReset + 1,
      showResidentPaths: true,
      showTrajectory: true,
      playing: true,
      playSpeed: 0.5,
      seekTime: Math.max(0, (f.hiveTips?.[0]?.t ?? 0) - 0.8),
      seekTick: s.seekTick + 1,
    });
  return (
    <section className="dynamic-world contact-physics">
      <strong>Hareketli HIVE ve delikli POLLEN</strong>
      <div className="automatic-spin">
        <span>Shooter’dan otomatik çıkış spini</span>
        <output aria-label="Otomatik çıkış spini">
          {Math.abs(spinRPM).toFixed(0)} RPM
          <small>
            {Math.abs(spinRPM) < 0.5
              ? "Dönüş yok"
              : spinRPM > 0
                ? "Backspin"
                : "Topspin"}
          </small>
        </output>
        <p>
          Tekerlek hızları, çaplar, hood temasları, sıkıştırma, sürtünme ve top
          ataletiyle hesaplanır. Shooter ayarları değişince hız ve spin birlikte
          güncellenir; çarpışmalarda her topun dönüşü ayrı hesaplanır.
        </p>
      </div>
      <label className="dynamic-check">
        <input
          type="checkbox"
          aria-label="HIVE hareketli"
          checked={!!p.hiveMotion}
          onChange={(e) => edit({ hiveMotion: e.target.checked })}
        />
        HIVE hareketli · pivot ve darbe tepkisi
      </label>
      {p.hiveMotion && (
        <div className="hive-live">
          <span>
            HIVE açısı <b>{h ? (deg(h.angle) - 30).toFixed(1) : "—"}°</b>
          </span>
          <span>
            Dönüş hızı <b>{h ? deg(h.omega).toFixed(1) : "—"}°/s</b>
          </span>
          <span>
            Devrilme <b>{f.hiveTips?.length ?? 0}</b>
          </span>
        </div>
      )}
      {residents.length > 0 && (
        <div className="resident-live">
          <strong>Toplar · {s.playbackTime.toFixed(2)} s</strong>
          <div className="hive-live" aria-label="Topların anlık durumu">
            <span>
              CELL içinde{" "}
              <b>
                {inside} / {residents.length}
              </b>
            </span>
            <span>
              CELL dışında <b>{residents.length - inside}</b>
            </span>
            <span>
              Zemine ulaşan{" "}
              <b>{residents.filter((b) => b.reachedFloor).length}</b>
            </span>
            <span>
              Düşen{" "}
              <b>{residents.filter((b) => b.status === "Düşüyor").length}</b>
            </span>
          </div>
          <button
            disabled={s.bounceBusy || !!f.bounceError}
            onClick={replaySpill}
          >
            Devrilme ve dökülmeyi oynat
          </button>
          <p>
            Her top serbesttir: hareketli duvar, diğer toplar ve zeminle
            çarpışır. HIVE ile birlikte sabitlenmez. Kesikli çizgiler topların
            izlediği yollardır.
          </p>
          <details>
            <summary>Top top hareketi izle</summary>
            <table className="resident-motion-table">
              <thead>
                <tr>
                  <th>Top</th>
                  <th>Durum</th>
                  <th>Hız</th>
                  <th>Spin</th>
                </tr>
              </thead>
              <tbody>
                {residents.map((ball) => (
                  <tr key={ball.id}>
                    <td style={{ color: ball.color }}>● {ball.id}</td>
                    <td>{ball.status}</td>
                    <td>{ball.speed.toFixed(2)} m/s</td>
                    <td>
                      {(
                        (Math.hypot(...ball.state.spin) * 30) /
                        Math.PI
                      ).toFixed(0)}{" "}
                      RPM
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}
      <label className="dynamic-check">
        <input
          type="checkbox"
          aria-label="Delikli POLLEN geometrisi"
          checked={p.shapeModel === "pollen"}
          onChange={(e) =>
            edit({ shapeModel: e.target.checked ? "pollen" : "sphere" })
          }
        />
        Delikli POLLEN · yönelime bağlı temas
      </label>
      <p>
        26 delik ve içi boş kabuk CAD'den alındı. Delik kenarı ve ovalite temas
        noktasını değiştirir; bu noktadaki darbe topun dönüşünü de değiştirir.
      </p>
      <details>
        <summary>HIVE dengesi ve başlangıç hareketi</summary>
        <p>
          Resmî 7/8 POLLEN deneyi arka duvarda yükle kalibre edilir. Model top
          sayısına göre devrilme komutu vermez: yükün yeri ve darbe torku
          belirler. Atalet, sönüm ve eşik yaklaşık değerlerdir. Topun ağırlığı
          veya çapı değişince HIVE yeniden dengelenmez; aşağıdaki referans top
          sabit tutulur.
        </p>
        <div className="bounce-settings">
          {slider(
            "Denge referansı · POLLEN",
            p.hiveThreshold ?? 7.5,
            6,
            10,
            0.1,
            (v) => edit({ hiveThreshold: v }),
          )}
          {slider(
            "Denge referans top kütlesi",
            (p.hiveReferenceMass ?? defaultHiveReference.mass) * 1000,
            10,
            60,
            0.1,
            (v) => edit({ hiveReferenceMass: v / 1000 }),
            "g",
          )}
          {slider(
            "Denge referans top çapı",
            (p.hiveReferenceDiameter ?? defaultHiveReference.diameter) * 1000,
            50,
            100,
            0.1,
            (v) => edit({ hiveReferenceDiameter: v / 1000 }),
            "mm",
          )}
          {slider(
            "HIVE ataleti",
            p.hiveInertia ?? 0.12,
            0.02,
            0.5,
            0.01,
            (v) => edit({ hiveInertia: v }),
            "kg·m²",
          )}
          {slider(
            "Pivot ve damper sönümü",
            p.hiveDamping ?? 0.08,
            0,
            0.4,
            0.01,
            (v) => edit({ hiveDamping: v }),
            "N·m·s/rad",
          )}
          {slider(
            "Durdurucu sekmesi",
            p.hiveStopRestitution ?? 0.08,
            0,
            0.4,
            0.01,
            (v) => edit({ hiveStopRestitution: v }),
          )}
          {slider(
            "Başlangıç HIVE açısı",
            deg(p.hiveInitialAngle ?? 0) - 30,
            -30,
            30,
            1,
            (v) => edit({ hiveInitialAngle: rad(v + 30) }),
            "°",
          )}
          {slider(
            "Başlangıç HIVE dönüş hızı",
            deg(p.hiveInitialSpeed ?? 0),
            -120,
            120,
            1,
            (v) => edit({ hiveInitialSpeed: rad(v) }),
            "°/s",
          )}
        </div>
        <button
          onClick={() =>
            edit({
              hiveReferenceMass: s.config.projectile.mass,
              hiveReferenceDiameter: s.config.projectile.diameter,
            })
          }
        >
          Seçili topu denge referansı yap
        </button>
        <button
          onClick={() =>
            s.set({
              residentCount: 8,
              residentLayout: "center",
              manualResidents: [],
              bounceSettings: {
                ...p,
                hiveMotion: true,
                hiveInitialAngle: 0,
                hiveInitialSpeed: 0,
              },
              playing: false,
              playReset: s.playReset + 1,
            })
          }
        >
          8 POLLEN ile yük deneyi
        </button>
        <p>
          Referans tutma torku: {f.hiveCalibrationTorque?.toFixed(3) ?? "—"}{" "}
          N·m. İki CELL birlikte döner; damper uçtaki darbeyi sönümler. Arka
          plandaki diğer ittifakın HIVE'ı bu deneyde sabittir.
        </p>
      </details>
      <details>
        <summary>Topun şekli, yönelimi ve spin</summary>
        <div className="bounce-settings">
          {slider(
            "Çaptan sapma / ovalite",
            (p.asphericity ?? 0.01) * 100,
            0,
            5,
            0.1,
            (v) => edit({ asphericity: v / 100 }),
            "%",
          )}
          {slider(
            "İki yarımın delik fazı",
            deg(p.hemispherePhase ?? 0),
            0,
            180,
            1,
            (v) => edit({ hemispherePhase: rad(v) }),
            "°",
          )}
          {["X", "Y", "Z"].map((axis, i) =>
            slider(
              `İlk yönelim · ${axis}`,
              deg(orientation[i]),
              -180,
              180,
              1,
              (v) => {
                const next = [...orientation] as Vec3;
                next[i] = rad(v);
                edit({ orientation: next });
              },
              "°",
            ),
          )}
        </div>
        <p>
          Ovalite başlangıçta %1 varsayılır; ölçülen topa göre değiştir. Delikli
          kabuğun ataleti hesaplanır. Temas, delik kenarlarının destek
          yaklaşımıdır; deliklerin birbirine geçmesi ve ayrıntılı hava akışı
          çözülmez. Sürükleme/Magnus katsayıları ölçüm gerektirir.
        </p>
      </details>
      {!!f.hiveTrack?.length && (
        <details>
          <summary>HIVE açısı ve devrilme zamanları</summary>
          <svg
            className="bounce-chart"
            viewBox="0 0 600 145"
            role="img"
            aria-label="HIVE açı grafiği"
          >
            <text x="20" y="15">
              HIVE açısı · −30° → +30°
            </text>
            <polyline
              fill="none"
              stroke="#f5ce77"
              strokeWidth="2"
              points={f.hiveTrack
                .map(
                  (v) =>
                    `${30 + (540 * v.t) / (f.samples.at(-1)?.t || 1)},${115 - (90 * v.angle) / (Math.PI / 3)}`,
                )
                .join(" ")}
            />
            {(f.hiveTips ?? []).map((tip, i) => (
              <line
                key={i}
                x1={30 + (540 * tip.t) / (f.samples.at(-1)?.t || 1)}
                x2={30 + (540 * tip.t) / (f.samples.at(-1)?.t || 1)}
                y1="25"
                y2="120"
                stroke="#66e6d4"
                strokeDasharray="4 4"
              />
            ))}
            <text x="30" y="138">
              0 s
            </text>
            <text x="530" y="138">
              {f.samples.at(-1)?.t.toFixed(2)} s
            </text>
          </svg>
          {(f.hiveTips ?? []).length ? (
            (f.hiveTips ?? []).map((v, i) => (
              <button
                key={i}
                onClick={() =>
                  s.set({
                    playing: false,
                    seekTime: v.t,
                    seekTick: s.seekTick + 1,
                  })
                }
              >
                Devrilme {i + 1} · {v.t.toFixed(2)} s → göster
              </button>
            ))
          ) : (
            <p>Bu senaryoda karşı durdurucuya ulaşan devrilme yok.</p>
          )}
        </details>
      )}
    </section>
  );
}
