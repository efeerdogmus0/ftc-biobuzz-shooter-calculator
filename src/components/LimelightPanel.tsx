// Limelight placement on the robot and which BIOBUZZ AprilTags it can see:
// a per-tag list from the current pose and a floor map over the whole field.
import { useMemo } from "react";
import { useStore } from "../state/store";
import { useT } from "../i18n/useT";
import { LengthField, NumberField } from "./SetupFields";
import {
  ANY_HEADING_STEPS,
  cameraErrors,
  cameraModels,
  defaultCamera,
  robotCameraPose,
  viewAll,
  visionScene,
  type CameraSettings,
  type MapMode,
  type TagReason,
} from "../vision/limelight";
import { TAG_FAMILY, TAG_SIZE } from "../vision/aprilTags";

const reasonText: Record<TagReason, string> = {
  seen: "Görüyor",
  backface: "Arkası dönük",
  outside: "Görüş alanı dışında",
  small: "Çok küçük",
  angle: "Açı çok yatık",
  blocked: "HIVE çerçevesi engelliyor",
};
const modes: [MapMode | "off", string][] = [
  ["off", "Kapalı"],
  ["current", "Robotun şu anki yönüyle"],
  ["faceHive", "Shooter HIVE'a dönükken"],
  ["anyHeading", "Herhangi bir yöne dönebilirse"],
];

export function LimelightPanel() {
  const t = useT();
  const camera = useStore((s) => s.camera),
    setCamera = useStore((s) => s.setCamera),
    config = useStore((s) => s.config),
    mode = useStore((s) => s.visionMode),
    spacing = useStore((s) => s.visionSpacing),
    map = useStore((s) => s.visionMap),
    busy = useStore((s) => s.visionBusy),
    set = useStore((s) => s.set);
  const scene = useMemo(() => visionScene(config.field), [config.field]);
  const errors = camera ? cameraErrors(camera) : [];
  const views = useMemo(
    () =>
      camera && camera.enabled && !cameraErrors(camera).length
        ? viewAll(robotCameraPose(camera, config), camera, scene)
        : [],
    [camera, config, scene],
  );

  if (!camera)
    return (
      <div className="limelight-panel">
        <p className="hint">
          {t(
            "Robotuna bir Limelight yerleştir; sahanın neresinden hangi AprilTag'i görebildiğini hesaplayalım.",
          )}
        </p>
        <button
          className="primary wide"
          onClick={() => {
            setCamera({ ...defaultCamera });
            if (mode === "off") set({ visionMode: "current" });
          }}
        >
          {t("Limelight ekle")}
        </button>
      </div>
    );

  const patch = (p: Partial<CameraSettings>) => setCamera({ ...camera, ...p });
  const custom = camera.model === "custom";
  const model = cameraModels.find((m) => m.id === camera.model)!;
  const seen = views.filter((v) => v.reason === "seen");

  return (
    <div className="limelight-panel">
      <label className="toggle">
        <input
          type="checkbox"
          checked={camera.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />
        <span>{t("Limelight'ı göster ve hesapla")}</span>
      </label>

      <h4>{t("Kamera")}</h4>
      <label className="select-control">
        <span>{t("Model")}</span>
        <select
          value={camera.model}
          onChange={(e) => {
            const m = cameraModels.find((x) => x.id === e.target.value)!;
            patch({
              model: m.id,
              hfov: Math.round(((m.hfov * 180) / Math.PI) * 10) / 10,
              vfov: Math.round(((m.vfov * 180) / Math.PI) * 10) / 10,
            });
          }}
        >
          {cameraModels.map((m) => (
            <option key={m.id} value={m.id}>
              {t(m.label)}
            </option>
          ))}
        </select>
      </label>
      <small className="hint">{t(model.source)}</small>
      {custom && (
        <div className="two-col">
          <NumberField
            label="Yatay görüş açısı"
            unit="°"
            value={camera.hfov}
            onChange={(v) => patch({ hfov: v })}
          />
          <NumberField
            label="Dikey görüş açısı"
            unit="°"
            value={camera.vfov}
            onChange={(v) => patch({ vfov: v })}
          />
        </div>
      )}
      <div className="two-col">
        <NumberField
          label="Görüntü genişliği"
          unit="px"
          value={camera.width}
          onChange={(v) => patch({ width: v })}
        />
        <NumberField
          label="Görüntü yüksekliği"
          unit="px"
          value={camera.height}
          onChange={(v) => patch({ height: v })}
        />
      </div>

      <h4>{t("Robottaki konumu")}</h4>
      <label className="select-control">
        <span>{t("Nereye bağlı")}</span>
        <select
          value={camera.mount}
          onChange={(e) =>
            patch({ mount: e.target.value as CameraSettings["mount"] })
          }
        >
          <option value="chassis">{t("Şasiye sabit")}</option>
          <option value="turret">{t("Taretle birlikte döner")}</option>
        </select>
      </label>
      <small className="hint">
        {t(
          camera.mount === "turret"
            ? "Ölçüler taret ekseninden, taretin baktığı yöne göre."
            : "Ölçüler robotun ortasından: ileri robotun önü, sola robotun solu, yükseklik yerden.",
        )}
      </small>
      <LengthField
        label="İleri"
        meters={camera.forward}
        onChange={(v) => Number.isFinite(v) && patch({ forward: v })}
      />
      <LengthField
        label="Sola"
        meters={camera.left}
        onChange={(v) => Number.isFinite(v) && patch({ left: v })}
      />
      <LengthField
        label="Yerden yükseklik"
        meters={camera.up}
        onChange={(v) => Number.isFinite(v) && patch({ up: v })}
      />
      <NumberField
        label="Yukarı eğim (pitch)"
        unit="°"
        value={camera.pitch}
        hint="0° yere paralel, + yukarı bakar. Etiketler CELL'lerin altında, aşağı bakıyor."
        onChange={(v) => patch({ pitch: v })}
      />
      <div className="two-col">
        <NumberField
          label="Yön (yaw)"
          unit="°"
          value={camera.yaw}
          hint="+ sola döner"
          onChange={(v) => patch({ yaw: v })}
        />
        <NumberField
          label="Yatma (roll)"
          unit="°"
          value={camera.roll}
          onChange={(v) => patch({ roll: v })}
        />
      </div>

      <details className="section">
        <summary>
          {t("Algılama varsayımları")}
          <span>+</span>
        </summary>
        <div className="section-content">
          <NumberField
            label="En küçük etiket kenarı"
            unit="px"
            value={camera.minTagPixels}
            hint="Etiketin görüntüdeki en kısa kenarı bundan küçükse okunamaz sayılır. Ölçülmüş değer değil; kendi kameranla dene."
            onChange={(v) => patch({ minTagPixels: v })}
          />
          <NumberField
            label="En büyük bakış açısı"
            unit="°"
            value={camera.maxViewAngle}
            hint="Etiket yüzeyine dik bakış 0°. Çok yatık bakışta etiket okunamaz sayılır."
            onChange={(v) => patch({ maxViewAngle: v })}
          />
        </div>
      </details>

      {errors.length > 0 && (
        <p className="setup-error" role="alert">
          {t("Geçersiz değer")}: {errors.join(", ")}
        </p>
      )}

      {camera.enabled && !errors.length && (
        <>
          <h4>
            {t.f("Şu anki konumdan: {n} / 16 etiket", { n: seen.length })}
          </h4>
          <table className="tag-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{t("Durum")}</th>
                <th>{t("Mesafe")}</th>
                <th>px</th>
                <th>{t("Açı")}</th>
              </tr>
            </thead>
            <tbody>
              {[...views]
                .sort(
                  (a, b) =>
                    Number(b.reason === "seen") - Number(a.reason === "seen") ||
                    a.id - b.id,
                )
                .map((v) => (
                  <tr key={v.id} className={v.reason === "seen" ? "seen" : ""}>
                    <td>{v.id}</td>
                    <td title={v.blockedBy}>{t(reasonText[v.reason])}</td>
                    <td>{v.distance.toFixed(2)} m</td>
                    <td>{v.pixels ? v.pixels.toFixed(0) : "·"}</td>
                    <td>{((v.viewAngle * 180) / Math.PI).toFixed(0)}°</td>
                  </tr>
                ))}
            </tbody>
          </table>

          <h4>{t("Saha haritası")}</h4>
          <label className="select-control">
            <span>{t("Robot nasıl dururken")}</span>
            <select
              value={mode}
              onChange={(e) =>
                set({ visionMode: e.target.value as MapMode | "off" })
              }
            >
              {modes.map(([id, label]) => (
                <option key={id} value={id}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>
          {mode !== "off" && (
            <>
              <label className="select-control">
                <span>{t("Izgara aralığı")}</span>
                <select
                  value={spacing}
                  onChange={(e) =>
                    set({ visionSpacing: Number(e.target.value) })
                  }
                >
                  {[0.05, 0.1, 0.15, 0.2].map((v) => (
                    <option key={v} value={v}>
                      {v * 100} cm
                    </option>
                  ))}
                </select>
              </label>
              <p className="vision-summary" aria-live="polite">
                {busy || !map
                  ? t("Harita hesaplanıyor…")
                  : t.f(
                      "Robotun durabildiği alanda: en az 1 etiket görülen yer %{one}, aynı anda en az 2 etiket görülen yer %{two}.",
                      {
                        one: Math.round(map.oneOrMore * 100),
                        two: Math.round(map.twoOrMore * 100),
                      },
                    )}
              </p>
              <div className="vision-legend">
                {mode === "anyHeading" ? (
                  <>
                    <span className="sw none" /> {t("Hiçbir yönde")}
                    <span className="sw some" /> {t("Bazı yönlerde")}
                    <span className="sw all" /> {t("Çoğu yönde")}
                  </>
                ) : (
                  <>
                    <span className="sw none" /> 0
                    <span className="sw one" /> 1
                    <span className="sw two" /> 2–3
                    <span className="sw all" /> 4+
                  </>
                )}
              </div>
              <small className="hint">
                {t(
                  mode === "anyHeading"
                    ? "Her nokta için robot 24 farklı yöne çevrilir; renk, en az bir etiketin göründüğü yönlerin payı."
                    : mode === "faceHive"
                      ? "Her noktada shooter etkin CELL'e döndürülür (taretliyse taret, değilse şasi)."
                      : "Her noktada robot şu anki yönünde ve taret açısında durur.",
                )}{" "}
                {t(
                  "Haritadaki her kare robotun ortasının durduğu yer. HIVE ayağının çevresi ve duvar payı boş bırakılır.",
                )}
              </small>
              {mode === "anyHeading" && (
                <small className="hint">
                  {t.f("{n} yön × her nokta; biraz sürebilir.", {
                    n: ANY_HEADING_STEPS,
                  })}
                </small>
              )}
            </>
          )}
        </>
      )}

      <details className="section">
        <summary>
          {t("Model ve kaynak")}
          <span>+</span>
        </summary>
        <div className="section-content">
          <p className="hint">
            {t.f(
              "Etiketler: BIOBUZZ Kılavuzu Bölüm 9 (TU04) 9.9, Şekil 9-15–9-17. {family} ailesi, {size} mm kare, her CELL'in alt yüzünde dörtlü küme; ID 30–33 kırmızı uzak, 34–37 kırmızı seyirci tarafı, 38–41 mavi seyirci tarafı, 42–45 mavi uzak.",
              { family: TAG_FAMILY, size: (TAG_SIZE * 1000).toFixed(1) },
            )}
          </p>
          <p className="hint">
            {t(
              "Etiketler modeldeki HIVE duruşuna göre yerleşir; HIVE dönünce etiketler de yer değiştirir. Hesap yalnız geometri: hareket bulanıklığı, pozlama, ışık, şeffaf CELL panellerindeki parlama, CELL kenarları ve diğer robotlar hesaba katılmaz.",
            )}
          </p>
        </div>
      </details>
      <button className="link-button" onClick={() => setCamera(null)}>
        {t("Limelight'ı kaldır")}
      </button>
    </div>
  );
}
