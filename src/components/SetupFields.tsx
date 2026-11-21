// Form fields shared by the guided setup and the simple panel.
import { useState } from "react";
import {
  driveErrors,
  freeWheelRPM,
  motorFreeRPM,
  motorOptions,
  targetWheelRPM,
  type DriveChoice,
} from "../presets/motors";
import { useT } from "../i18n/useT";

export type Tag = "recalc" | "missing" | undefined;
const shown = (v: number, digits = 3) => Number(v.toFixed(digits));

/**
 * A translated sentence that may hold <b>…</b> / <i>…</i> markup. The markup
 * lives in the dictionary text so each language keeps its own word order.
 */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(<[bi]>.*?<\/[bi]>)/).map((part, i) => {
        const m = part.match(/^<([bi])>(.*)<\/\1>$/);
        if (!m) return part;
        return m[1] === "b" ? <b key={i}>{m[2]}</b> : <i key={i}>{m[2]}</i>;
      })}
    </>
  );
}

function Label({ label, tag }: { label: string; tag?: Tag }) {
  const t = useT();
  return (
    <span>
      {t(label)}
      {tag === "recalc" && <em className="tag recalc">ReCalc</em>}
      {tag === "missing" && (
        <em className="tag missing">{t("ReCalc'ta yok")}</em>
      )}
    </span>
  );
}

export function NumberField({
  label,
  value,
  unit,
  onChange,
  error,
  step = 1,
  tag,
  hint,
}: {
  label: string;
  value: number;
  unit: string;
  onChange: (v: number) => void;
  error?: string;
  step?: number;
  tag?: Tag;
  hint?: string;
}) {
  const t = useT();
  return (
    <label className={`setup-field ${error ? "invalid" : ""}`}>
      <Label label={label} tag={tag} />
      <span className="setup-input">
        <input
          type="number"
          value={Number.isFinite(value) ? shown(value) : ""}
          step={step}
          aria-invalid={!!error}
          onChange={(e) => onChange(e.target.valueAsNumber)}
        />
        <small>{t(unit)}</small>
      </span>
      {hint && <small className="hint">{t(hint)}</small>}
      {error && (
        <small className="setup-error" role="alert">
          {t(error)}
        </small>
      )}
    </label>
  );
}

const LENGTH = { mm: 0.001, in: 0.0254, cm: 0.01 } as const;
type LengthUnit = keyof typeof LENGTH;
const UNIT_KEY = "pollen-setup-length-unit";
function savedUnit(): LengthUnit {
  try {
    const v = localStorage.getItem(UNIT_KEY);
    if (v === "mm" || v === "in" || v === "cm") return v;
  } catch {
    /* preference only */
  }
  return "mm";
}

/**
 * A length in metres, entered in mm, cm or inches. Each field has its own
 * unit selector; the last chosen unit becomes the default for new fields.
 * Switching units converts the shown number; the stored value is unchanged.
 */
export function LengthField({
  label,
  meters,
  onChange,
  error,
  tag,
  hint,
}: {
  label: string;
  meters: number;
  onChange: (meters: number) => void;
  error?: string;
  tag?: Tag;
  hint?: string;
}) {
  const t = useT();
  const [unit, setUnit] = useState<LengthUnit>(savedUnit);
  const f = LENGTH[unit];
  return (
    <label className={`setup-field ${error ? "invalid" : ""}`}>
      <Label label={label} tag={tag} />
      <span className="setup-input">
        <input
          type="number"
          value={
            Number.isFinite(meters)
              ? shown(meters / f, unit === "in" ? 4 : 3)
              : ""
          }
          step={unit === "in" ? 0.01 : unit === "cm" ? 0.1 : 1}
          aria-invalid={!!error}
          onChange={(e) => onChange(e.target.valueAsNumber * f)}
        />
        <select
          aria-label={t.f("{label} birimi", { label: t(label) })}
          className="unit-select"
          value={unit}
          onChange={(e) => {
            const u = e.target.value as LengthUnit;
            setUnit(u);
            try {
              localStorage.setItem(UNIT_KEY, u);
            } catch {
              /* preference only */
            }
          }}
        >
          <option value="mm">mm</option>
          <option value="cm">cm</option>
          <option value="in">{t("inç")}</option>
        </select>
      </span>
      {hint && <small className="hint">{t(hint)}</small>}
      {error && (
        <small className="setup-error" role="alert">
          {t(error)}
        </small>
      )}
    </label>
  );
}

/** Motor, count, gear teeth and operating point → main wheel RPM. */
export function MotorPicker({
  value,
  onChange,
}: {
  value: DriveChoice;
  onChange: (d: DriveChoice) => void;
}) {
  const e = driveErrors(value);
  const put = (patch: Partial<DriveChoice>) => onChange({ ...value, ...patch });
  const ok = Object.keys(e).length === 0;
  const reduction = value.wheelTeeth / value.motorTeeth;
  const t = useT();
  return (
    <div className="motor-picker">
      <label className="setup-field">
        <span>{t("Motor")}</span>
        <select
          value={value.motorId}
          onChange={(ev) => put({ motorId: ev.target.value })}
        >
          {motorOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {t(m.label)}
              {m.freeRPM ? ` · ${m.freeRPM} RPM` : ""}
            </option>
          ))}
        </select>
      </label>
      {value.motorId === "custom" && (
        <NumberField
          label="Motorun serbest (yüksüz) hızı"
          value={value.customRPM}
          unit="RPM"
          step={10}
          error={e.customRPM}
          onChange={(v) => put({ customRPM: v })}
        />
      )}
      <NumberField
        label="Motor adedi (bu tekeri çeviren)"
        value={value.count}
        unit="adet"
        error={e.count}
        onChange={(v) => put({ count: v })}
      />
      <div className="setup-two">
        <NumberField
          label="Motor tarafı dişli / kasnak"
          value={value.motorTeeth}
          unit="diş"
          error={e.motorTeeth}
          onChange={(v) => put({ motorTeeth: v })}
        />
        <NumberField
          label="Teker tarafı dişli / kasnak"
          value={value.wheelTeeth}
          unit="diş"
          error={e.wheelTeeth}
          onChange={(v) => put({ wheelTeeth: v })}
        />
      </div>
      <p className="hint">
        {t(
          "Doğrudan bağlıysa ikisine de 1 yaz. Örnek: motorda 20 diş, tekerde 40 diş → teker motorun yarı hızında döner (2:1 redüksiyon).",
        )}
      </p>
      <NumberField
        label="Çalışma hızı (serbest hızın yüzdesi)"
        value={value.targetPct}
        unit="%"
        step={5}
        error={e.targetPct}
        onChange={(v) => put({ targetPct: v })}
        hint="Shooter tekeri yük altında serbest hızın altında döner; hız kontrolüyle hangi hızda çalıştıracağını sen seçersin. Gerçek değeri robotta ölç."
      />
      {ok && (
        <div className="explain-metric">
          <span>{t("Teker hızı")}</span>
          <b>{targetWheelRPM(value).toFixed(0)} RPM</b>
          <small>
            {t.f(
              "Motor serbest {free} RPM · {ratio} → teker en fazla {max} RPM, %{pct} ile {target} RPM. Üretici nominal değerleri; doğrula.",
              {
                free: motorFreeRPM(value).toFixed(0),
                ratio:
                  reduction >= 1
                    ? t.f("{r}:1 redüksiyon", { r: shown(reduction, 2) })
                    : t.f("1:{r} hızlandırma", { r: shown(1 / reduction, 2) }),
                max: freeWheelRPM(value).toFixed(0),
                pct: value.targetPct,
                target: targetWheelRPM(value).toFixed(0),
              },
            )}
          </small>
        </div>
      )}
    </div>
  );
}
