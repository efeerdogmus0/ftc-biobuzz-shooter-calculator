// Public robot setup: start panel, "Robotumu kur" form and the "Robotum" card.
// The form edits a local draft; nothing reaches the active scenario until the
// user confirms, so cancelling always leaves the current robot untouched.
import { useState } from "react";
import { useStore } from "../state/store";
import {
  blankSpec,
  inferSpec,
  mechanisms,
  validateSpec,
  type RobotSpec,
} from "../presets/factory";
import type { ScenarioOrigin } from "../utils/scenario";

export function originLabel(origin: ScenarioOrigin | null | undefined) {
  if (!origin || origin.kind === "user") return "Robotum";
  return origin.kind === "example" ? "Örnek · ölçülmemiş" : "Referans (kopya)";
}

export function StartPanel({
  onSetup,
  onExample,
  onFile,
  saved,
  onOpenSaved,
}: {
  onSetup: () => void;
  onExample: () => void;
  onFile: () => void;
  saved: string[];
  onOpenSaved: (i: number) => void;
}) {
  return (
    <section className="start-panel" aria-labelledby="start-title">
      <p className="eyebrow">BIOBUZZ 2026–27 · POLLEN ATIŞ SİMÜLATÖRÜ</p>
      <h1 id="start-title">Nasıl başlamak istersin?</h1>
      <p className="muted">
        Kendi shooter'ının ölçülerini gir ya da açıklamalı genel örnekle dene.
        Saha, HIVE ve POLLEN her takım için ortaktır; shooter senin.
      </p>
      <div className="start-actions">
        <button className="primary" onClick={onSetup}>
          Robotumu kur
        </button>
        <button onClick={onExample}>Genel örneği dene</button>
        <button onClick={onFile}>Dosyadan aç…</button>
      </div>
      {saved.length > 0 && (
        <div className="start-saved">
          <p className="eyebrow">ROBOTLARIM</p>
          {saved.map((name, i) => (
            <button key={i} onClick={() => onOpenSaved(i)}>
              {name}
            </button>
          ))}
        </div>
      )}
      <p className="muted small-print">
        Genel örnek kimsenin robotu değildir; sayıları ölçülmemiş, isabete
        ayarlanmamış bir başlangıç noktasıdır. Paylaşım bağlantıları doğrudan
        açılır.
      </p>
    </section>
  );
}

// Display only; untouched values stay exact in the draft.
const shown = (v: number) => Number(v.toFixed(3));

type Errors = Partial<Record<keyof RobotSpec, string>>;

function Field({
  label,
  value,
  unit,
  onChange,
  error,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  unit: string;
  onChange: (v: number) => void;
  error?: string;
  step?: number;
  hint?: string;
}) {
  return (
    <label className={`setup-field ${error ? "invalid" : ""}`}>
      <span>
        {label}
        {hint && <small> · {hint}</small>}
      </span>
      <span className="setup-input">
        <input
          type="number"
          value={shown(value)}
          step={step}
          aria-invalid={!!error}
          onChange={(e) => onChange(e.target.valueAsNumber)}
        />
        <small>{unit}</small>
      </span>
      {error && (
        <small className="setup-error" role="alert">
          {error}
        </small>
      )}
    </label>
  );
}

export function RobotSetup({
  mode,
  initial,
  onCancel,
  onApply,
}: {
  mode: "new" | "edit";
  initial: RobotSpec;
  onCancel: () => void;
  /** `before` is the spec the form opened with; only differences are applied. */
  onApply: (before: RobotSpec, after: RobotSpec) => void;
}) {
  const [d, setD] = useState<RobotSpec>(initial);
  const put = (patch: Partial<RobotSpec>) => setD((x) => ({ ...x, ...patch }));
  const mm = (key: keyof RobotSpec) => (v: number) =>
    put({ [key]: v / 1000 } as Partial<RobotSpec>);
  const errors: Errors = validateSpec(d, mode === "edit" ? initial : undefined);
  const valid = Object.keys(errors).length === 0;
  const hood = d.mechanism !== "twin-wheel";
  const fixed = d.mechanism === "wheel-fixed-hood";
  return (
    <section className="robot-setup" aria-label="Robot kurulumu">
      <h2>{mode === "new" ? "Robotumu kur" : "Kurulumu düzenle"}</h2>
      <p className="eyebrow">1 · MEKANİZMA</p>
      <div className="mechanism-list" role="radiogroup" aria-label="Mekanizma">
        {mechanisms.map((m) => (
          <label key={m.id} className={d.mechanism === m.id ? "active" : ""}>
            <input
              type="radio"
              name="mechanism"
              checked={d.mechanism === m.id}
              onChange={() => put({ mechanism: m.id })}
            />
            <span>
              <b>{m.label}</b>
              <small>{m.description}</small>
            </span>
          </label>
        ))}
      </div>
      {mode === "edit" && d.mechanism !== initial.mechanism && (
        <p className="setup-error">
          Mekanizma değişince shooter geometrisi yeniden oluşturulur; özel rulo
          konumları sıfırlanır.
        </p>
      )}
      <p className="eyebrow">2 · BİLDİĞİN ÖLÇÜLER</p>
      <Field
        label="Ana teker çapı"
        value={d.wheelDiameter * 1000}
        unit="mm"
        error={errors.wheelDiameter}
        onChange={mm("wheelDiameter")}
      />
      <div className="setup-quick" aria-label="Yaygın çaplar">
        {[72, 96, 100, 104].map((v) => (
          <button key={v} onClick={() => put({ wheelDiameter: v / 1000 })}>
            {v}
          </button>
        ))}
      </div>
      <Field
        label="Ana teker hızı"
        value={d.wheelRPM}
        unit="RPM"
        step={10}
        error={errors.wheelRPM}
        onChange={(v) => put({ wheelRPM: v })}
      />
      {hood ? (
        <>
          <Field
            label="Hood rulmanı / temas sayısı"
            value={d.hoodRollers}
            unit="adet"
            error={errors.hoodRollers}
            onChange={(v) => put({ hoodRollers: v })}
          />
          <Field
            label="Hood rulman çapı"
            value={d.rollerDiameter * 1000}
            unit="mm"
            error={errors.rollerDiameter}
            onChange={mm("rollerDiameter")}
          />
        </>
      ) : (
        <Field
          label="Üst teker çapı"
          value={d.topWheelDiameter * 1000}
          unit="mm"
          error={errors.topWheelDiameter}
          onChange={mm("topWheelDiameter")}
        />
      )}
      {!fixed && (
        <>
          <label className="setup-field">
            <span>{hood ? "Hood tahriki" : "Üst teker tahriki"}</span>
            <select
              value={d.drive}
              onChange={(e) =>
                put({ drive: e.target.value as RobotSpec["drive"] })
              }
            >
              <option value="gear">Ana tekere dişli/kayışla bağlı</option>
              <option value="independent">Ayrı motor</option>
            </select>
          </label>
          {d.drive === "gear" ? (
            <Field
              label={hood ? "Hood / ana RPM oranı" : "Üst / alt RPM oranı"}
              value={d.ratio}
              unit=":1"
              step={0.05}
              error={errors.ratio}
              onChange={(v) => put({ ratio: v })}
            />
          ) : (
            <Field
              label={hood ? "Hood rulman hızı" : "Üst teker hızı"}
              value={d.secondRPM}
              unit="RPM"
              step={10}
              error={errors.secondRPM}
              onChange={(v) => put({ secondRPM: v })}
            />
          )}
        </>
      )}
      <Field
        label="Teker ile karşı yüzey arası boşluk"
        hint="sıkışma = POLLEN çapı − boşluk"
        value={d.gap * 1000}
        unit="mm"
        error={errors.gap}
        onChange={mm("gap")}
      />
      <Field
        label="Çıkış yüksekliği (yerden)"
        value={d.exitHeight * 1000}
        unit="mm"
        error={errors.exitHeight}
        onChange={mm("exitHeight")}
      />
      <div className="setup-three">
        <Field
          label="Hood açısı"
          value={d.hoodAngleDeg}
          unit="°"
          error={errors.hoodAngleDeg}
          onChange={(v) => put({ hoodAngleDeg: v })}
        />
        <Field
          label="Min"
          value={d.hoodMinDeg}
          unit="°"
          error={errors.hoodMinDeg}
          onChange={(v) => put({ hoodMinDeg: v })}
        />
        <Field
          label="Max"
          value={d.hoodMaxDeg}
          unit="°"
          error={errors.hoodMaxDeg}
          onChange={(v) => put({ hoodMaxDeg: v })}
        />
      </div>
      <p className="eyebrow">3 · MODEL VARSAYIMLARI (ÖLÇÜLMEDİ)</p>
      <ul className="assumptions">
        <li>Teker–top sürtünmesi 0,65 ve temas sertlikleri: tahmini.</li>
        <li>Teker ataleti bilinmiyor: hız düşüşü/toparlanma hesaplanmaz.</li>
        <li>Hava direnci Cd 0,47 ve Magnus eğimi 0,6: genel küre değerleri.</li>
        <li>
          Hood temas yerleşimi tipik çok-rulmanlı hood'dan türetilir; tam
          geometriyi Zor modda düzenleyebilirsin.
        </li>
        {fixed && (
          <li>
            Sabit hood dönmeyen yüzeydir. Serbest dönen (avara) rulmanlı hood
            modellenmez.
          </li>
        )}
      </ul>
      <p className="muted">
        Gerçek atış ölçümlerinle Analiz → Ölçümle kalibrasyon (Orta) bu
        varsayımları test eder.
      </p>
      <label className={`setup-field ${errors.name ? "invalid" : ""}`}>
        <span>Robot adı</span>
        <input
          type="text"
          value={d.name}
          maxLength={120}
          aria-invalid={!!errors.name}
          onChange={(e) => put({ name: e.target.value })}
        />
        {errors.name && (
          <small className="setup-error" role="alert">
            {errors.name}
          </small>
        )}
      </label>
      <div className="setup-actions">
        <button onClick={onCancel}>İptal</button>
        <button
          className="primary"
          disabled={!valid}
          onClick={() => onApply(initial, { ...d, name: d.name.trim() })}
        >
          {mode === "new" ? "Oluştur" : "Uygula"}
        </button>
      </div>
      {mode === "edit" && (
        <p className="muted">
          Uygula yalnız değiştirdiğin alanları uygular; robot konumu, POLLEN,
          sekme ayarları, ölçülmüş ataletler ve kalibrasyon ölçümlerin korunur.
        </p>
      )}
    </section>
  );
}

/** Spec for "Kurulumu düzenle", read exactly from the live config (never a stale copy). */
export function currentSpec(): RobotSpec | null {
  return inferSpec(useStore.getState().config);
}

export function RobotCard() {
  const s = useStore();
  const spec = inferSpec(s.config);
  const mechanism = spec
    ? mechanisms.find((m) => m.id === spec.mechanism)?.label
    : "Compound / ReCalc modeli (yalnız Zor modda düzenlenir)";
  return (
    <div className="robot-card">
      <div>
        <span className={`origin-chip ${s.origin?.kind ?? "user"}`}>
          {originLabel(s.origin)}
        </span>
        <b>{s.config.name}</b>
      </div>
      <p className="muted">{mechanism}</p>
      {s.origin?.kind && s.origin.kind !== "user" && (
        <p className="muted">
          {s.origin.source ? `${s.origin.source}. ` : ""}Değişiklikler bu
          kopyada kalır; Dosya → Profili kaydet ile Robotlarım'a eklenir.
        </p>
      )}
      <div className="button-row">
        <button disabled={!spec} onClick={() => s.set({ setupOpen: "edit" })}>
          Kurulumu düzenle
        </button>
        <button onClick={() => s.set({ setupOpen: "new" })}>
          Yeni robot kur
        </button>
      </div>
    </div>
  );
}

export { blankSpec };
