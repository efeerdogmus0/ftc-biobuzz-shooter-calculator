// Stage 6 · Robota aktar: the shot table for the robot's code, then the shots
// actually taken on the robot, compared with the simulation one by one.
import {
  Check,
  ClipboardCopy,
  Download,
  FileCode2,
  Link2,
  Loader2,
  Plus,
  Printer,
  Ruler,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { AnalysisState } from "../../app/useAnalysis";
import type { BadgeState } from "../../app/useCalibrationBadge";
import { placed } from "../../app/placement";
import { ballModelSettings } from "../../physics/launchDynamics";
import { samePlace, useStore } from "../../state/store";
import { Section } from "../Inputs";
import { AnalysisPanel, applyFit, fitChoices } from "../AnalysisPanel";
import { useT } from "../../i18n/useT";
import { downloadText } from "../../utils/config";
import { toDeg, toRPM } from "../../utils/units";
import {
  interpolate,
  lookupRows,
  mixedAngles,
  rowsFromPoints,
  toCSV,
  toJava,
  type ShotRow,
  type SweepOptions,
  type TableMeta,
} from "../../export/shotTable";
import {
  MAX_LOGGED_SHOTS,
  OUTCOMES,
  toMeasurements,
  type LoggedShot,
  type Outcome,
} from "../../export/shotLog";
import { useComparison, useSweep } from "../../export/useExportJobs";

const outcomeLabel: Record<Outcome, string> = {
  in: "Girdi",
  short: "Kısa kaldı",
  long: "Uzun gitti",
  rim: "Kenara çarptı",
  noexit: "Çıkmadı",
};
const today = () => new Date().toISOString().slice(0, 10);

export function ExportStage({
  a,
  badge,
  verified,
  badgeState,
  exportProfile,
  share,
}: {
  a: AnalysisState;
  badge: string;
  verified: boolean;
  badgeState: BadgeState;
  exportProfile: () => void;
  share: () => void;
}) {
  const t = useT();
  const s = useStore();
  const c = s.config;
  const model = useMemo(
    () => ballModelSettings(s.bounceSettings),
    [s.bounceSettings],
  );
  const comparison = useComparison(c, model, s.shotLog);
  const agreed = comparison.result?.filter((x) => x.agrees).length ?? 0;
  const evidence = [
    t(
      verified && badgeState.kind === "verified"
        ? "Kalibrasyon: ölçülen çıkış hızlarıyla doğrulandı."
        : "Simülasyon sonucu; robotta ölçülerek doğrulanmadı.",
    ),
    ...(verified && badgeState.kind === "verified"
      ? [
          t.f("{n} ayrılmış ölçüm yeniden kontrol edildi.", {
            n: badgeState.result.validationCount,
          }),
        ]
      : []),
    ...(comparison.result
      ? [
          t.f(
            "Robotta {n} atış girildi; simülasyon {k} tanesinin sonucunu doğru tahmin etti.",
            { n: comparison.result.length, k: agreed },
          ),
        ]
      : []),
    t("Maçta kullanmadan önce gerçek robotta dene."),
  ];
  return (
    <div className="simple-panel">
      <p className="stage-lead">
        {t(
          "Atış tablosunu robot koduna koy, sonra robotunla birkaç atış yap ve sonuçlarını buraya yaz. Simülasyon gerçek atışlarını tutturuyorsa sayılara güvenebilirsin.",
        )}
      </p>
      <section className={`result-card ${verified ? "hit" : "miss"}`}>
        <div className="result-head">
          <span className="result-status">
            {t(verified ? "ÖLÇÜMLE DOĞRULANDI" : "ÖLÇÜLMEDİ")}
          </span>
        </div>
        <p>{badge}</p>
        {comparison.result && (
          <p className="muted">
            {t.f("Gerçek atışların: {k} / {n} tahmin tuttu.", {
              k: agreed,
              n: comparison.result.length,
            })}
          </p>
        )}
      </section>
      <ShotTableSection evidence={evidence} model={model} />
      <ShotLogSection a={a} comparison={comparison} />
      <Section title="İleri düzey · ölçüm JSON'u ve parametreler">
        <AnalysisPanel a={a} only="calibrate" />
      </Section>
      <Section title="Robotu paylaş">
        <div className="button-row">
          <button onClick={exportProfile}>
            <Download size={13} /> {t("Profil dosyası indir")}
          </button>
          <button onClick={share}>
            <Link2 size={13} /> {t("Bağlantı kopyala")}
          </button>
        </div>
      </Section>
    </div>
  );
}

function ShotTableSection({
  evidence,
  model,
}: {
  evidence: string[];
  model: ReturnType<typeof ballModelSettings>;
}) {
  const t = useT();
  const s = useStore();
  const c = s.config;
  const [source, setSource] = useState<"points" | "sweep">(
    s.shotPoints.length ? "points" : "sweep",
  );
  const [options, setOptions] = useState<SweepOptions>({
    from: 0.8,
    to: 2.6,
    step: 0.2,
  });
  const sweep = useSweep(c, model, options);
  const pointRows = useMemo(
    () => rowsFromPoints(c, s.shotPoints),
    [c, s.shotPoints],
  );
  const rows: ShotRow[] =
    source === "points" ? pointRows : (sweep.result?.rows ?? []);
  const table = lookupRows(rows);
  const [probe, setProbe] = useState(1.5);
  const [copied, setCopied] = useState(false);
  const meta: TableMeta = {
    robot: c.name || t("Robotum"),
    date: today(),
    evidence,
    labels: {
      title: t("Probot Shooter atış tablosu"),
      name: t("Nokta"),
      distance: t("Shooter çıkışından HIVE merkezine yer mesafesi (m)"),
      rpm: t("Ana teker hızı (RPM)"),
      angle: t("Atış açısı, yataydan (°)"),
      clearance: t("Hedef payı (mm)"),
      reliability: t("Güven (%)"),
      distanceNote: t(
        "Mesafe: shooter çıkışından HIVE merkezine yer mesafesi, metre.",
      ),
      angleNote: t(
        "Açı topun çıkış açısıdır, servo konumu değil; servo değerini kendi robotunda ölç.",
      ),
      interpolationNote: t(
        "Satırlar arası doğrusal ara değer; tablo dışında ilk/son satır kullanılır.",
      ),
    },
  };
  const java = () => toJava(rows, meta, "ShotTable");
  const ready = table.length > 0;
  const rpmAt = interpolate(
    table.map((r) => r.distance),
    table.map((r) => r.rpm),
    probe,
  );
  const angleAt = interpolate(
    table.map((r) => r.distance),
    table.map((r) => r.angle),
    probe,
  );
  return (
    <Section title="Atış tablosu" open>
      <div className="segmented" role="tablist">
        <button
          className={source === "points" ? "active" : ""}
          onClick={() => setSource("points")}
        >
          {t.f("Atış noktalarım ({n})", { n: s.shotPoints.length })}
        </button>
        <button
          className={source === "sweep" ? "active" : ""}
          onClick={() => setSource("sweep")}
        >
          {t("Mesafe taraması")}
        </button>
      </div>
      {source === "points" && !s.shotPoints.length && (
        <p className="muted">
          {t(
            "Henüz kayıtlı nokta yok. Saha adımında nokta kaydet ya da mesafe taramasını kullan.",
          )}
        </p>
      )}
      {source === "sweep" && (
        <>
          <p className="muted">
            {t(
              "Robot, taramayı başlattığın anda durduğu yönde HIVE'dan uzaklaşarak her adımda yeniden çözülür. Tüm tabloda tek atış açısı kullanılır, yalnız teker hızı değişir; böylece robotun ara değeri de gerçek bir çözüm üzerinde kalır.",
            )}
          </p>
          <div className="sweep-inputs">
            {(
              [
                ["from", "En yakın (m)"],
                ["to", "En uzak (m)"],
                ["step", "Adım (m)"],
              ] as const
            ).map(([k, label]) => (
              <label key={k}>
                {t(label)}
                <input
                  type="number"
                  step={0.05}
                  min={k === "step" ? 0.05 : 0.3}
                  max={k === "step" ? 1 : 4}
                  value={options[k]}
                  disabled={sweep.busy}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v > 0)
                      setOptions({ ...options, [k]: v });
                  }}
                />
              </label>
            ))}
          </div>
          {sweep.busy ? (
            <div className="job">
              <span>
                {t.f("Mesafeler çözülüyor… %{p}", {
                  p: Math.round(sweep.progress * 100),
                })}
              </span>
              <progress max={1} value={sweep.progress} />
              <button onClick={sweep.cancel}>{t("Durdur")}</button>
            </div>
          ) : (
            <button
              className="primary wide"
              disabled={
                options.to < options.from ||
                (options.to - options.from) / options.step > 40
              }
              onClick={sweep.run}
            >
              <Ruler size={14} />{" "}
              {t(sweep.result ? "Yeniden tara" : "Mesafeleri tara")}
            </button>
          )}
          {sweep.error && <p className="setup-error">{sweep.error}</p>}
          {sweep.result && (
            <p className="muted">
              {sweep.result.angle === null
                ? t("Bu doğrultuda hiçbir mesafede isabet bulunamadı.")
                : t.f("Seçilen açı {a}°: en çok mesafeden isabet veren açı.", {
                    a: sweep.result.angle.toFixed(1),
                  })}{" "}
              {sweep.result.blocked > 0 &&
                t.f("{n} adım sahaya ya da HIVE'a çarptığı için atlandı.", {
                  n: sweep.result.blocked,
                })}
            </p>
          )}
          {sweep.result && sweep.result.misses.length > 0 && (
            <p className="muted">
              {t.f("Bu açıyla {n} mesafede isabet yok: {d} m.", {
                n: sweep.result.misses.length,
                d: sweep.result.misses.map((d) => d.toFixed(2)).join(", "),
              })}
            </p>
          )}
        </>
      )}
      {rows.length > 0 && (
        <div className="reference-table shot-table">
          <table aria-label={t("Atış tablosu")}>
            <thead>
              <tr>
                <th>{t("Nokta")}</th>
                <th>{t("Mesafe")}</th>
                <th>{t("Teker hızı")}</th>
                <th>{t("Atış açısı")}</th>
                <th>{t("Hedef payı")}</th>
                <th>{t("Güven")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.name}-${i}`}>
                  <td>{r.name}</td>
                  <td>{r.distance.toFixed(2)} m</td>
                  <td>{r.rpm.toFixed(0)} RPM</td>
                  <td>{r.angle.toFixed(1)}°</td>
                  <td>{r.clearance.toFixed(0)} mm</td>
                  <td>
                    {r.reliability === undefined ? (
                      <span className="muted">—</span>
                    ) : (
                      <em className={r.reliability >= 0.8 ? "good" : "warn"}>
                        %{Math.round(r.reliability * 100)}
                      </em>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {mixedAngles(table) && (
        <p className="notice">
          {t(
            "Bu satırlarda farklı atış açıları var. İki satırın arasındaki bir mesafe için robot iki farklı atışın ortasını kullanır ve ıskalayabilir. Ara değer kullanacaksan mesafe taramasını (tek açı) seç ya da noktalarını aynı açıyla kaydet.",
          )}
        </p>
      )}
      {ready && (
        <>
          <ul className="evidence">
            {evidence.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <div className="probe">
            <label>
              {t("Mesafe gir")}
              <input
                type="number"
                step={0.05}
                min={0}
                max={5}
                value={probe}
                onChange={(e) => setProbe(Number(e.target.value) || 0)}
              />
              m
            </label>
            <span>
              → <b>{rpmAt?.toFixed(0)} RPM</b> · <b>{angleAt?.toFixed(1)}°</b>
            </span>
            <small className="muted">
              {t("Robot kodu da aynı ara değeri hesaplar.")}
            </small>
          </div>
          <div className="button-row">
            <button
              onClick={() =>
                downloadText("shot-table.csv", toCSV(table, meta), "text/csv")
              }
            >
              <Download size={13} /> CSV
            </button>
            <button
              onClick={() =>
                downloadText("ShotTable.java", java(), "text/x-java")
              }
            >
              <FileCode2 size={13} /> Java
            </button>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(java()).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? <Check size={13} /> : <ClipboardCopy size={13} />}{" "}
              {t(copied ? "Kopyalandı" : "Java'yı kopyala")}
            </button>
            <button onClick={() => window.print()}>
              <Printer size={13} /> {t("Yazdır")}
            </button>
          </div>
          <p className="muted">
            {t(
              "Java dosyası yalnız tabloyu ve ara değer fonksiyonunu içerir; motor ve servo adlarını kendi kodunda kullan. Mesafeyi Limelight ya da odometriden al.",
            )}
          </p>
          <PrintSheet rows={table} meta={meta} />
        </>
      )}
    </Section>
  );
}

function PrintSheet({ rows, meta }: { rows: ShotRow[]; meta: TableMeta }) {
  const l = meta.labels;
  return (
    <div className="print-sheet" aria-hidden>
      <h1>
        {l.title} · {meta.robot}
      </h1>
      <p>{meta.date}</p>
      <ul>
        {meta.evidence.map((e) => (
          <li key={e}>{e}</li>
        ))}
        <li>{l.distanceNote}</li>
        <li>{l.angleNote}</li>
      </ul>
      <table>
        <thead>
          <tr>
            <th>{l.name}</th>
            <th>{l.distance}</th>
            <th>{l.rpm}</th>
            <th>{l.angle}</th>
            <th>{l.clearance}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.name}</td>
              <td>{r.distance.toFixed(2)}</td>
              <td>{r.rpm.toFixed(0)}</td>
              <td>{r.angle.toFixed(1)}</td>
              <td>{r.clearance.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ShotLogSection({
  a,
  comparison,
}: {
  a: AnalysisState;
  comparison: ReturnType<typeof useComparison>;
}) {
  const t = useT();
  const s = useStore();
  const c = s.config;
  const [from, setFrom] = useState("now");
  const log = s.shotLog;
  const setLog = (shotLog: LoggedShot[]) => s.set({ shotLog });
  const update = (id: string, patch: Partial<LoggedShot>) =>
    setLog(log.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = () => {
    const p = s.shotPoints.find((x) => x.id === from);
    const q = p ? placed(c, p.x, p.y, p.hoodAngle, p.omega) : c;
    setLog([
      ...log,
      {
        id: crypto.randomUUID(),
        x: q.robot.x,
        y: q.robot.y,
        heading: q.robot.heading,
        turretYaw: q.robot.turretYaw,
        rpm: Math.round(toRPM(q.shooter.primary.omega)),
        angle:
          Math.round(toDeg(q.shooter.hoodAngle + q.shooter.hoodOffset) * 10) /
          10,
        result: "in",
      },
    ]);
  };
  const where = (r: LoggedShot) =>
    s.shotPoints.find((p) => samePlace(p, r))?.name ??
    `${r.x.toFixed(2)}, ${r.y.toFixed(2)}`;
  const byId = new Map(comparison.result?.map((x) => [x.id, x]) ?? []);
  const timed = log.filter((r) => r.exitVelocity !== undefined).length;
  const calibrating = a.busy === "calibrate";
  const fitHere = a.fit && a.fitMeasurements.length > 0;
  const calibrate = () => {
    const rows = toMeasurements(c, log);
    const parameters = fitChoices(c)
      // Exit speed identifies the launch only; drag needs measured flight positions.
      .filter(([k]) => k === "transfer" || k === "friction")
      .map(([key, min, max, value]) => ({
        key,
        min,
        max,
        value,
        initial: value,
      }));
    a.setMeasurements(rows);
    a.setParameters(parameters);
    a.run("calibrate", { measurements: rows, parameters });
  };
  return (
    <Section title="Robotta ölçülen atışlar" open>
      <p className="muted">
        {t(
          "Robotunla atış yap ve her atışı bir satır olarak gir: nereden attın, hangi RPM ve açıyla, top ne yaptı. Simülasyon her satırı aynı ayarla dener ve sonucu yan yana koyar.",
        )}
      </p>
      <div className="log-add">
        <label className="select-control">
          {t("Nereden attın?")}
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="now">{t("Robotun şu anki konumu")}</option>
            {s.shotPoints.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="primary"
          disabled={log.length >= MAX_LOGGED_SHOTS}
          onClick={add}
        >
          <Plus size={13} /> {t("Atış ekle")}
        </button>
      </div>
      {log.length > 0 && (
        <ul className="log-list" aria-label={t("Robotta ölçülen atışlar")}>
          {log.map((r) => {
            const cmp = byId.get(r.id);
            return (
              <li key={r.id}>
                <div className="log-head">
                  <b>{where(r)}</b>
                  {cmp ? (
                    <em
                      className={cmp.agrees ? "good" : "warn"}
                      title={t.f("Simüle edilen çıkış hızı {v} m/s", {
                        v: cmp.speed.toFixed(2),
                      })}
                    >
                      {cmp.agrees ? <Check size={11} /> : <X size={11} />}{" "}
                      {t.f("Simülasyon: {o}", {
                        o: t(outcomeLabel[cmp.predicted]),
                      })}
                    </em>
                  ) : (
                    <Loader2 size={12} className="spin" />
                  )}
                  <button
                    className="icon"
                    title={t("Satırı sil")}
                    aria-label={t("Satırı sil")}
                    onClick={() => setLog(log.filter((x) => x.id !== r.id))}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="log-fields">
                  <label>
                    {t("Teker hızı")}
                    <span>
                      <input
                        type="number"
                        min={0}
                        max={50000}
                        step={10}
                        value={r.rpm}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v >= 0 && v <= 50000)
                            update(r.id, { rpm: v });
                        }}
                      />
                      RPM
                    </span>
                  </label>
                  <label>
                    {t("Atış açısı")}
                    <span>
                      <input
                        type="number"
                        min={0}
                        max={90}
                        step={0.5}
                        value={r.angle}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v >= 0 && v <= 90)
                            update(r.id, { angle: v });
                        }}
                      />
                      °
                    </span>
                  </label>
                  <label>
                    {t("Top ne yaptı?")}
                    <select
                      value={r.result}
                      onChange={(e) =>
                        update(r.id, { result: e.target.value as Outcome })
                      }
                    >
                      {OUTCOMES.map((o) => (
                        <option key={o} value={o}>
                          {t(outcomeLabel[o])}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label title={t("İsteğe bağlı: ağır çekim videodan ölç")}>
                    {t("Çıkış hızı")}
                    <span>
                      <input
                        type="number"
                        placeholder={t("isteğe bağlı")}
                        min={0}
                        max={40}
                        step={0.1}
                        value={r.exitVelocity ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const v = Number(raw);
                          if (!raw) {
                            const rest = { ...r };
                            delete rest.exitVelocity;
                            setLog(log.map((x) => (x.id === r.id ? rest : x)));
                          } else if (Number.isFinite(v) && v > 0 && v < 40)
                            update(r.id, { exitVelocity: v });
                        }}
                      />
                      m/s
                    </span>
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {comparison.error && <p className="setup-error">{comparison.error}</p>}
      {log.length > 0 && (
        <div className="calibrate-box">
          <p className="muted">
            {timed < 3
              ? t.f(
                  "Modeli robotuna göre düzeltmek için en az 3 atışta çıkış hızını gir (şu an {n}). Her üçüncü atış kontrol için ayrılır.",
                  { n: timed },
                )
              : t.f(
                  "{n} atışta çıkış hızı var. Model bunların çoğuna göre düzeltilir, her üçüncüsüyle kontrol edilir.",
                  { n: timed },
                )}
          </p>
          <button
            className="wide"
            disabled={timed < 3 || !!a.busy}
            onClick={calibrate}
          >
            {calibrating ? (
              <Loader2 size={13} className="spin" />
            ) : (
              <Ruler size={13} />
            )}{" "}
            {t("Çıkış hızlarıyla modeli düzelt")}
          </button>
          {a.error && !a.busy && <p className="setup-error">{t(a.error)}</p>}
          {fitHere && a.fit && (
            <div
              className={`fit-summary ${a.fit.validationPassed ? "good" : "warn"}`}
            >
              <b>
                {t(
                  a.fit.validationPassed
                    ? "Kontrol atışları tuttu."
                    : "Kontrol atışları tutmadı.",
                )}
              </b>{" "}
              <span>
                {t.f(
                  "Ortalama hata (normalize): düzeltme {train} · kontrol {val}. 1'in altı iyi.",
                  {
                    train: a.fit.trainingRMSE.toFixed(2),
                    val: a.fit.validationRMSE?.toFixed(2) ?? "—",
                  },
                )}
              </span>
              <button onClick={() => applyFit(a)}>
                {t("Düzeltmeyi robota uygula")}
              </button>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
