// Full-screen start and setup flow (Probot Builder style):
//   home    → how do you want to start?
//   new     → guided robot setup, one topic per step, with a live schematic
//   edit    → the same guided setup on the active robot (only changed fields apply)
//   recalc  → paste a ReCalc flywheel link; values fill the guided setup
//   sandbox → ready-made example robots to play with
// Nothing reaches the active scenario until the user confirms.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardPaste,
  FileUp,
  FlaskConical,
  Link2,
  Play,
  Route,
  Wrench,
} from "lucide-react";
import {
  POLLEN_DIAMETER,
  blankSpec,
  mechanisms,
  sandboxSpecs,
  validateSpec,
  type RobotSpec,
} from "../presets/factory";
import {
  looksLikeRecalc,
  parseRecalcLink,
  type RecalcExtras,
  type RecalcImport,
} from "../utils/recalc";
import { useStore, type SetupScreen } from "../state/store";
import {
  defaultDrive,
  driveErrors,
  motorConfigOf,
  recalcLinkFor,
  targetWheelRPM,
  type DriveChoice,
} from "../presets/motors";
import { MechanismDiagram, MechanismIcon } from "./MechanismDiagram";
import {
  LengthField,
  MotorPicker,
  NumberField as Field,
  Rich,
  type Tag,
} from "./SetupFields";
import { useT } from "../i18n/useT";

type Translator = ReturnType<typeof useT>;

/**
 * ReCalc import messages with values inside (recalc.ts builds them in
 * Turkish). Each template is matched against the message and rebuilt in the
 * active language; fixed messages are plain dictionary lookups.
 */
const RECALC_TEMPLATES = [
  "Bu link {host} adresine ait; ReCalc (reca.lc) linki bekleniyor.",
  "ReCalc alanı okunamadı: {key}.",
  'ReCalc alanı {key}: "{unit}" birimi tanınmıyor.',
  "ReCalc oranı okunamadı: {key}.",
  "ReCalc shooter tipi tanınmıyor: {mode}.",
  "ReCalc'taki top {ball}; BIOBUZZ POLLEN {pollen}. Atışlar POLLEN ile hesaplanır, bu yüzden çıkış hızı ReCalc'tan farklı olabilir.",
];
const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function localizeRecalcMessage(msg: string, t: Translator) {
  const direct = t(msg);
  if (direct !== msg || t.lang === "tr") return direct;
  for (const template of RECALC_TEMPLATES) {
    const parts = template.split(/\{(\w+)\}/);
    const names = parts.filter((_, i) => i % 2 === 1);
    const re = new RegExp(
      "^" + parts.map((x, i) => (i % 2 ? "(.*?)" : escapeRe(x))).join("") + "$",
    );
    const m = msg.match(re);
    if (m)
      return t.f(
        template,
        Object.fromEntries(names.map((n, i) => [n, m[i + 1]])),
      );
  }
  return msg;
}

/** Table cells of a ReCalc import: whole-text lookup, else the known words inside. */
const RECALC_WORDS = [
  "→ üst teker",
  "disk ataleti",
  "(özel)",
  "redüksiyon",
  "hızlandırma",
];
function localizeRecalcCell(text: string, t: Translator) {
  const direct = t(text);
  if (direct !== text || t.lang === "tr") return direct;
  return RECALC_WORDS.reduce((x, w) => x.split(w).join(t(w)), text);
}

type Errors = Partial<Record<keyof RobotSpec, string>>;

/** What the setup adds beyond the spec: imported data, the motor, or "decide later". */
export interface SetupExtras {
  recalc?: RecalcExtras;
  motor?: { name: string; count: number; reduction: number };
  motorLater?: boolean;
  chassis?: ChassisSetup;
}
/** Footprint and drivetrain: asked once here so the auto planner need not. */
export interface ChassisSetup {
  length: number;
  width: number;
  drive: "holonomic" | "tank";
  turret: boolean;
}
export const defaultChassis: ChassisSetup = {
  length: 0.4,
  width: 0.4,
  drive: "holonomic",
  turret: false,
};
const sizeError = (m: number) =>
  !Number.isFinite(m) || m < 0.15 || m > 0.46
    ? "15 cm ile 45,7 cm (18 inç) arasında olmalı."
    : undefined;

export interface OnboardingProps {
  screen: SetupScreen;
  go: (screen: SetupScreen) => void;
  /** Leaves the flow; absent on the very first visit (a choice is required). */
  onClose?: () => void;
  editSpec: RobotSpec | null;
  /** The current robot's chassis, shown when editing. */
  chassis?: ChassisSetup;
  saved: string[];
  onOpenSaved: (i: number) => void;
  onFile: () => void;
  onSandbox: (spec: RobotSpec) => void;
  /** "Hemen dene": the example robot on the field, no setup. */
  onTry: () => void;
  onCreate: (spec: RobotSpec, extras: SetupExtras) => void;
  onApplyEdit: (
    before: RobotSpec,
    after: RobotSpec,
    extras: SetupExtras,
  ) => void;
  recalcText: string;
  /** Robots in the signed-in account (empty when signed out). */
  accountRobots: { id: string; name: string; summary: string }[];
  signedIn: boolean;
  onOpenAccount: (id: string) => void;
  onSignIn: () => void;
}

export function Onboarding(p: OnboardingProps) {
  const t = useT();
  const [imported, setImported] = useState<RecalcImport | null>(null);
  const [pasted, setPasted] = useState("");
  const startNew = (from?: RecalcImport) => {
    setImported(from ?? null);
    p.go("new");
  };
  return (
    <div className="onboarding" role="main">
      {p.screen === "home" ? (
        <Home
          {...p}
          onNew={() => startNew()}
          onPasteRecalc={(text) => {
            setPasted(text);
            p.go("recalc");
          }}
        />
      ) : p.screen === "recalc" ? (
        <RecalcScreen
          initial={pasted || p.recalcText}
          back={() => p.go("home")}
          onContinue={(imp) => startNew(imp)}
        />
      ) : p.screen === "sandbox" ? (
        <Sandbox back={() => p.go("home")} pick={p.onSandbox} />
      ) : p.screen === "edit" && p.editSpec ? (
        <Wizard
          key="edit"
          mode="edit"
          initial={p.editSpec}
          chassis={p.chassis}
          onCancel={p.onClose ?? (() => p.go("home"))}
          onDone={(after, extras) => p.onApplyEdit(p.editSpec!, after, extras)}
          openRecalc={() => p.go("recalc")}
        />
      ) : (
        <Wizard
          key={imported ? "recalc" : "new"}
          mode="new"
          initial={imported?.spec ?? blankSpec()}
          imported={imported}
          onCancel={() => p.go(imported ? "recalc" : "home")}
          onDone={(after, extras) =>
            p.onCreate(after, { ...extras, recalc: imported?.extras })
          }
          openRecalc={() => p.go("recalc")}
        />
      )}
      {p.onClose && p.screen !== "edit" && (
        <button className="onboarding-close" onClick={p.onClose}>
          {t("Simülasyona dön")}
        </button>
      )}
    </div>
  );
}

function Home({
  go,
  saved,
  onOpenSaved,
  onFile,
  onTry,
  onNew,
  onPasteRecalc,
  accountRobots,
  signedIn,
  onOpenAccount,
  onSignIn,
}: OnboardingProps & {
  onNew: () => void;
  onPasteRecalc: (text: string) => void;
}) {
  // Pasting a ReCalc link anywhere on the start screen jumps straight to import.
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text") ?? "";
      if (looksLikeRecalc(text)) onPasteRecalc(text);
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [onPasteRecalc]);
  const t = useT();
  const cards: {
    id: string;
    title: string;
    text: string;
    icon: React.ReactNode;
    run: () => void;
    primary?: boolean;
  }[] = [
    {
      id: "try",
      title: "Hemen dene",
      text: "Kurulum yok. Örnek bir robot sahada hazır; kısa bir tur atışı, otomatik çözümü ve sonucu gösterir.",
      icon: <Play size={22} />,
      run: onTry,
      primary: true,
    },
    {
      id: "setup",
      title: "Robotumu kur",
      text: "Adım adım; her ölçünün ne olduğu ve nasıl ölçüleceği yanında anlatılır. Yaklaşık 2 dakika.",
      icon: <Wrench size={22} />,
      run: onNew,
    },
  ];
  const more: typeof cards = [
    {
      id: "recalc",
      title: "ReCalc'tan aktar",
      text: "ReCalc Flywheel bağlantını yapıştır; ölçüler kendiliğinden dolar.",
      icon: <Link2 size={18} />,
      run: () => go("recalc"),
    },
    {
      id: "sandbox",
      title: "Örnek robotlar",
      text: "Hazır robotlardan birini seç, serbestçe kurcala.",
      icon: <FlaskConical size={18} />,
      run: () => go("sandbox"),
    },
    {
      id: "file",
      title: "Dosyadan aç",
      text: "Daha önce dışa aktardığın profil (.json).",
      icon: <FileUp size={18} />,
      run: onFile,
    },
  ];
  return (
    <section className="ob-home" aria-labelledby="ob-title">
      <div className="ob-hero">
        <p className="ob-eyebrow">
          {t("BIOBUZZ 2026–27 · POLLEN ATIŞ SİMÜLATÖRÜ")}
        </p>
        <h1 id="ob-title">{t("Shooter'ını kur, atışını sahada gör.")}</h1>
        <p className="ob-lead">
          {t(
            "Saha, HIVE ve POLLEN her takım için aynıdır; shooter senin. Ölçülerini gir, simülatör topun nereye gideceğini ve isabet için hangi açı/RPM gerektiğini hesaplasın.",
          )}
        </p>
      </div>
      <p className="ob-section">{t("NASIL BAŞLAMAK İSTERSİN?")}</p>
      <div className="ob-cards two">
        {cards.map((c) => (
          <button
            key={c.id}
            className={`ob-card ${c.primary ? "featured" : ""}`}
            aria-label={`${t(c.title)}. ${t(c.text)}`}
            onClick={c.run}
          >
            <span className="ob-card-icon">{c.icon}</span>
            <b>{t(c.title)}</b>
            <span>{t(c.text)}</span>
            <span className="ob-card-go">
              {t(c.primary ? "Dene" : "Başla")} <ArrowRight size={14} />
            </span>
          </button>
        ))}
      </div>
      <p className="ob-section">{t("BAŞKA YOLLAR")}</p>
      <div className="ob-more">
        {more.map((c) => (
          <button
            key={c.id}
            aria-label={`${t(c.title)}. ${t(c.text)}`}
            onClick={c.run}
          >
            <span className="ob-card-icon">{c.icon}</span>
            <span>
              <b>{t(c.title)}</b>
              <small>{t(c.text)}</small>
            </span>
          </button>
        ))}
      </div>
      {__PROBOT_SIM__ && (
        <button
          className="ob-auto"
          onClick={() => useStore.getState().set({ autoOpen: true })}
        >
          <span className="ob-card-icon">
            <Route size={22} />
          </span>
          <span className="ob-auto-text">
            <b>{t("Oto planlayıcı")}</b>
            <span>
              {t(
                "Robotunun 30 saniyede alabileceği en yüksek puanı bul: en hızlı otonomu planlar, sahada oynatır, Probot Sim fiziğinde dener.",
              )}
            </span>
          </span>
          <span className="ob-card-go">
            {t("Aç")} <ArrowRight size={14} />
          </span>
        </button>
      )}
      <p className="ob-section">{t("HESABIMDAKİ ROBOTLAR")}</p>
      {signedIn ? (
        accountRobots.length > 0 ? (
          <div className="ob-saved">
            {accountRobots.map((r) => {
              const mech = r.summary.split(" · ")[0];
              return (
                <button key={r.id} onClick={() => onOpenAccount(r.id)}>
                  <MechanismIcon
                    mechanism={
                      mechanisms.some((m) => m.id === mech)
                        ? (mech as (typeof mechanisms)[number]["id"])
                        : "wheel-driven-hood"
                    }
                  />
                  <span>{r.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="hint">{t("Hesabında henüz kayıtlı robot yok.")}</p>
        )
      ) : (
        <p className="hint">
          <button className="link-inline" onClick={onSignIn}>
            {t("Giriş yap")}
          </button>{" "}
          {t("ve robotlarını hesabına kaydet.")}
        </p>
      )}
      {saved.length > 0 && (
        <>
          <p className="ob-section">{t("BU TARAYICIDAKİ ROBOTLAR")}</p>
          <div className="ob-saved">
            {saved.map((name, i) => (
              <button key={i} onClick={() => onOpenSaved(i)}>
                <MechanismIcon mechanism="wheel-driven-hood" />
                <span>{name}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <p className="ob-note">
        {t(
          "Simülasyon bir modeldir: örnekler ve varsayılan katsayılar ölçülmemiştir. Gerçek atış ölçümlerinle Gelişmiş arayüz → Analiz → Ölçümle kalibrasyon bunları test eder. Paylaşım bağlantıları doğrudan açılır.",
        )}
      </p>
    </section>
  );
}

function Sandbox({
  back,
  pick,
}: {
  back: () => void;
  pick: (spec: RobotSpec) => void;
}) {
  const t = useT();
  return (
    <section className="ob-home" aria-labelledby="sb-title">
      <button className="ob-back" onClick={back}>
        <ArrowLeft size={14} /> {t("Geri")}
      </button>
      <div className="ob-hero">
        <p className="ob-eyebrow">SANDBOX</p>
        <h1 id="sb-title">{t("Bir örnek robot seç ve oyna.")}</h1>
        <p className="ob-lead">
          {t(
            "Bu robotlar kimsenin gerçek robotu değil; yuvarlak sayılarla kurulmuş, ölçülmemiş ve isabete ayarlanmamış başlangıç noktaları. Sahada robotu sürükle, açıyı ve hızı değiştir, Otomatik çöz ile isabet bul.",
          )}
        </p>
      </div>
      <div className="ob-cards three">
        {sandboxSpecs.map(({ spec, blurb }) => (
          <button
            key={spec.name}
            className="ob-card sandbox"
            aria-label={`${t(mechanisms.find((m) => m.id === spec.mechanism)?.label ?? "")}. ${t(blurb)}`}
            onClick={() => pick(spec)}
          >
            <MechanismDiagram spec={spec} />
            <b>
              {t(mechanisms.find((m) => m.id === spec.mechanism)?.label ?? "")}
            </b>
            <span>{t(blurb)}</span>
            <span className="ob-card-go">
              {t("Sahaya çık")} <ArrowRight size={14} />
            </span>
          </button>
        ))}
      </div>
      <p className="ob-note">
        {t(
          "Sandbox robotu Robotlarım'a kendiliğinden eklenmez. Beğendiğin bir ayarı üstteki Kaydet ile saklayabilirsin.",
        )}
      </p>
    </section>
  );
}

function RecalcScreen({
  initial,
  back,
  onContinue,
}: {
  initial: string;
  back: () => void;
  onContinue: (imp: RecalcImport) => void;
}) {
  const t = useT();
  const [text, setText] = useState(initial);
  const [clipError, setClipError] = useState("");
  const parsed = useMemo((): { ok?: RecalcImport; error?: string } | null => {
    if (!text.trim()) return null;
    try {
      return { ok: parseRecalcLink(text) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [text]);
  const ok = parsed?.ok;
  const fromClipboard = async () => {
    setClipError("");
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) setClipError("Pano boş görünüyor.");
      setText(clip);
    } catch {
      setClipError(
        "Tarayıcı panoyu okumaya izin vermedi. Kutuya tıklayıp ⌘V / Ctrl+V ile yapıştır.",
      );
    }
  };
  const stepLink = t("{link} sayfasında shooter'ını gir.").split("{link}");
  return (
    <section className="ob-home ob-recalc" aria-labelledby="rc-title">
      <button className="ob-back" onClick={back}>
        <ArrowLeft size={14} /> {t("Geri")}
      </button>
      <div className="ob-hero">
        <p className="ob-eyebrow">{t("RECALC'TAN AKTAR")}</p>
        <h1 id="rc-title">{t("ReCalc linkini yapıştır.")}</h1>
        <ol className="ob-steps-inline">
          <li>
            {stepLink[0]}
            <a
              href="https://www.reca.lc/flywheel"
              target="_blank"
              rel="noreferrer"
            >
              reca.lc/flywheel
            </a>
            {stepLink[1]}
          </li>
          <li>
            <Rich text={t("Sağ üstteki <b>Copy Link</b> düğmesine bas.")} />
          </li>
          <li>{t("Buraya yapıştır. Değerler aşağıda tabloya dökülür.")}</li>
        </ol>
      </div>
      <div className="rc-input">
        <textarea
          aria-label={t("ReCalc linki")}
          placeholder="https://www.reca.lc/flywheel?motor=…"
          value={text}
          rows={3}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        <button onClick={fromClipboard}>
          <ClipboardPaste size={15} /> {t("Panodan yapıştır")}
        </button>
      </div>
      {clipError && <p className="setup-error">{t(clipError)}</p>}
      {parsed?.error && (
        <p className="setup-error" role="alert">
          {localizeRecalcMessage(parsed.error, t)}
        </p>
      )}
      {ok && (
        <>
          <table className="rc-table">
            <thead>
              <tr>
                <th>{t("Alan")}</th>
                <th>ReCalc</th>
                <th>{t("Simülatörde")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ok.rows.map((r) => (
                <tr key={r.label} className={r.status}>
                  <td>{t(r.label)}</td>
                  <td className="mono">{localizeRecalcCell(r.recalc, t)}</td>
                  <td>{localizeRecalcCell(r.ours, t)}</td>
                  <td>
                    <span className={`rc-status ${r.status}`}>
                      {t(
                        r.status === "imported"
                          ? "aktarıldı"
                          : r.status === "kept"
                            ? "saklandı"
                            : "kullanılmadı",
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {ok.warnings.map((w) => (
            <p key={w} className="ob-warning">
              {localizeRecalcMessage(w, t)}
            </p>
          ))}
          <div className="ob-actions">
            <button className="primary" onClick={() => onContinue(ok)}>
              {t("Kuruluma devam et")} <ArrowRight size={14} />
            </button>
          </div>
        </>
      )}
      <p className="ob-note">
        {t(
          "Link yalnız tarayıcında okunur; hiçbir yere gönderilmez. ReCalc ile bu simülatör farklı modeller kullanır, aynı ayarda çıkış hızları birebir tutmayabilir.",
        )}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- wizard

const STEPS = [
  { id: "mechanism", title: "Mekanizma", keys: ["mechanism"] },
  { id: "wheel", title: "Ana teker", keys: ["wheelDiameter", "wheelRPM"] },
  {
    id: "second",
    title: "Hood / üst teker",
    keys: [
      "hoodRollers",
      "rollerDiameter",
      "topWheelDiameter",
      "drive",
      "ratio",
      "secondRPM",
    ],
  },
  { id: "gap", title: "Sıkışma ve yükseklik", keys: ["gap", "exitHeight"] },
  {
    id: "angle",
    title: "Atış açısı",
    keys: ["hoodAngleDeg", "hoodMinDeg", "hoodMaxDeg"],
  },
  { id: "chassis", title: "Şasi", keys: [] },
  { id: "summary", title: "Özet", keys: ["name"] },
] as const satisfies readonly {
  id: string;
  title: string;
  keys: readonly (keyof RobotSpec)[];
}[];

const shown = (v: number) => Number(v.toFixed(3));

function Wizard({
  mode,
  initial,
  imported,
  chassis,
  onCancel,
  onDone,
  openRecalc,
}: {
  mode: "new" | "edit";
  initial: RobotSpec;
  chassis?: ChassisSetup;
  imported?: RecalcImport | null;
  onCancel: () => void;
  onDone: (after: RobotSpec, extras: SetupExtras) => void;
  openRecalc: () => void;
}) {
  const t = useT();
  const [d, setD] = useState<RobotSpec>(initial);
  // How the wheel speed is decided. A new robot starts from the motor; an
  // import or an existing robot already has an RPM.
  const [speedMode, setSpeedMode] = useState<"motor" | "rpm" | "later">(
    mode === "new" && !imported ? "motor" : "rpm",
  );
  const [drive, setDrive] = useState<DriveChoice>(defaultDrive);
  const driveOk = Object.keys(driveErrors(drive)).length === 0;
  const [body, setBody] = useState<ChassisSetup>(chassis ?? defaultChassis);
  const bodyErrors =
    (sizeError(body.length) ? 1 : 0) + (sizeError(body.width) ? 1 : 0);
  const chooseDrive = (next: DriveChoice) => {
    setDrive(next);
    if (Object.keys(driveErrors(next)).length === 0)
      setD((x) => ({ ...x, wheelRPM: Math.round(targetWheelRPM(next)) }));
  };
  // An import already answers the first steps; start where the user is needed.
  const [step, setStep] = useState(imported ? 3 : 0);
  const panel = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = panel.current;
    el?.scrollTo({ top: 0 });
    // Phone: the page scrolls, not the panel, and the step strip is sideways.
    if (el && el.getBoundingClientRect().top < 0)
      el.scrollIntoView({ block: "start" });
    const on = rail.current?.querySelector<HTMLElement>("[aria-current]");
    if (on && rail.current) rail.current.scrollLeft = on.offsetLeft - 48;
    // No auto-focus on touch: it would pop the keyboard over the step.
    if (window.matchMedia?.("(pointer: fine)").matches)
      el?.querySelector<HTMLElement>("input, button.mech")?.focus({
        preventScroll: true,
      });
  }, [step]);
  const put = (patch: Partial<RobotSpec>) => setD((x) => ({ ...x, ...patch }));
  const len = (key: keyof RobotSpec) => (v: number) =>
    put({ [key]: v } as Partial<RobotSpec>);
  const errors: Errors = validateSpec(d, mode === "edit" ? initial : undefined);
  const stepErrors = (i: number) =>
    STEPS[i].keys.filter((k) => errors[k as keyof RobotSpec]).length +
    (STEPS[i].id === "wheel" && speedMode === "motor" && !driveOk ? 1 : 0) +
    (STEPS[i].id === "chassis" ? bodyErrors : 0);
  const valid =
    Object.keys(errors).length === 0 &&
    (speedMode !== "motor" || driveOk) &&
    bodyErrors === 0;
  const extras = (): SetupExtras => ({
    chassis: body,
    ...(speedMode === "motor"
      ? { motor: motorConfigOf(drive) }
      : speedMode === "later"
        ? { motorLater: true }
        : {}),
  });
  const hood = d.mechanism !== "twin-wheel";
  const fixed = d.mechanism === "wheel-fixed-hood";
  const tag = (k: keyof RobotSpec): Tag =>
    !imported
      ? undefined
      : imported.missing.includes(k)
        ? "missing"
        : d[k] === imported.spec[k] &&
            ["wheelDiameter", "wheelRPM", "topWheelDiameter", "ratio"].includes(
              k,
            )
          ? "recalc"
          : undefined;
  const surface = (Math.PI * d.wheelDiameter * d.wheelRPM) / 60;
  const squeeze = (POLLEN_DIAMETER - d.gap) * 1000;
  const last = step === STEPS.length - 1;
  const current = STEPS[step];
  const highlight = (
    {
      mechanism: "mechanism",
      wheel: "wheel",
      second: "second",
      gap: "gap",
      angle: "angle",
      chassis: undefined,
      summary: undefined,
    } as const
  )[current.id];
  return (
    <section className="wizard" aria-label={t("Robot kurulumu")}>
      <aside className="wizard-rail">
        <p className="ob-eyebrow">
          {t(
            mode === "edit"
              ? "KURULUMU DÜZENLE"
              : imported
                ? "RECALC'TAN KURULUM"
                : "ROBOTUMU KUR",
          )}
        </p>
        <ol ref={rail}>
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                className={`${i === step ? "active" : ""} ${i < step ? "done" : ""}`}
                aria-current={i === step ? "step" : undefined}
                onClick={() => setStep(i)}
              >
                <span className="rail-num">
                  {stepErrors(i) ? "!" : i < step ? <Check size={12} /> : i + 1}
                </span>
                {t(s.id === "second" ? (hood ? "Hood" : "Üst teker") : s.title)}
              </button>
            </li>
          ))}
        </ol>
        <button className="rail-cancel" onClick={onCancel}>
          {t(mode === "edit" ? "Vazgeç" : "Kurulumdan çık")}
        </button>
      </aside>
      <div className="wizard-main" ref={panel}>
        <p className="wizard-count">
          {t.f("Adım {n} / {total}", { n: step + 1, total: STEPS.length })}
        </p>
        {current.id === "mechanism" && (
          <>
            <h2>{t("Shooter'ın hangi yapıda?")}</h2>
            <p className="explain">
              <Rich
                text={t(
                  "Topu fırlatan parçaların dizilişi. <b>Emin değilsen:</b> tek motorlu bir teker ve üstünde dönmeyen kavisli bir plaka varsa <i>sabit hood</i>; üstte motorla dönen hood tekerlekleri varsa <i>tahrikli hood</i>; topu iki taraftan iki teker sıkıştırıyorsa <i>karşılıklı iki teker</i>.",
                )}
              />
            </p>
            <div
              className="mechanism-cards"
              role="radiogroup"
              aria-label={t("Mekanizma")}
            >
              {mechanisms.map((m) => (
                <button
                  key={m.id}
                  role="radio"
                  aria-checked={d.mechanism === m.id}
                  className={`mech ${d.mechanism === m.id ? "active" : ""}`}
                  onClick={() => put({ mechanism: m.id })}
                >
                  <MechanismIcon mechanism={m.id} />
                  <b>{t(m.label)}</b>
                  <small>{t(m.description)}</small>
                </button>
              ))}
            </div>
            {mode === "edit" && d.mechanism !== initial.mechanism && (
              <p className="ob-warning">
                {t(
                  "Mekanizma değişince shooter geometrisi yeniden oluşturulur; özel hood tekerleği konumların sıfırlanır.",
                )}
              </p>
            )}
          </>
        )}
        {current.id === "wheel" && (
          <>
            <h2>{t("Ana teker")}</h2>
            <p className="explain">
              <Rich
                text={t(
                  "Topa değen, motorla dönen ana teker. <b>Çap</b>: lastik dahil dış çap. <b>Hız</b>: tekerin kendi devri; motor devri değil. Motoru ve dişli oranını seçersen hızı biz hesaplarız.",
                )}
              />
            </p>
            <LengthField
              label="Teker çapı"
              meters={d.wheelDiameter}
              error={errors.wheelDiameter}
              onChange={len("wheelDiameter")}
              tag={tag("wheelDiameter")}
            />
            <div className="setup-quick" aria-label={t("Yaygın çaplar")}>
              {[72, 96, 100, 104].map((v) => (
                <button
                  key={v}
                  className={
                    Math.abs(d.wheelDiameter * 1000 - v) < 0.01 ? "active" : ""
                  }
                  onClick={() => put({ wheelDiameter: v / 1000 })}
                >
                  {v} mm
                </button>
              ))}
            </div>
            <p className="ob-section">{t("TEKER HIZI NASIL BELİRLENSİN?")}</p>
            <div
              className="segmented wide"
              role="radiogroup"
              aria-label={t("Teker hızı")}
            >
              {(
                [
                  ["motor", "Motor ve dişli oranı"],
                  ["rpm", "RPM'i biliyorum"],
                  ["later", "Sonra belirleyeceğim"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={speedMode === v}
                  className={speedMode === v ? "active" : ""}
                  onClick={() => {
                    setSpeedMode(v);
                    if (v === "motor") chooseDrive(drive);
                  }}
                >
                  {t(label)}
                </button>
              ))}
            </div>
            {speedMode === "motor" && (
              <MotorPicker value={drive} onChange={chooseDrive} />
            )}
            {speedMode === "rpm" && (
              <Field
                label="Teker hızı"
                value={d.wheelRPM}
                unit="RPM"
                step={10}
                error={errors.wheelRPM}
                onChange={(v) => put({ wheelRPM: v })}
                tag={tag("wheelRPM")}
              />
            )}
            {speedMode === "later" && (
              <div className="later-panel">
                <p>
                  {t(
                    "Motoru ve dişli oranını henüz seçmediysen, farklı seçeneklerin nasıl sonuç verdiğini incelemek ister misin?",
                  )}
                </p>
                <div className="later-options">
                  <div className="later-card">
                    <b>{t("Sandbox'ta karşılaştır")}</b>
                    <span>
                      <Rich
                        text={t(
                          "Kurulumu geçici bir hızla bitir. Sahada, Basit arayüzdeki <i>Motor ve dişli</i> panelinde farklı motor ve oranların teker hızını ve isabeti yan yana gör.",
                        )}
                      />
                    </span>
                    <small>
                      {t("Kurulumun devam eder; geçici hız aşağıda.")}
                    </small>
                  </div>
                  <div className="later-card">
                    <b>{t("ReCalc'ta incele")}</b>
                    <span>
                      {t(
                        "ReCalc motor tarafını hesaplar: hızlanma süresi, atış sonrası hız düşüşü, toparlanma. Teker ölçülerin ve POLLEN hazır gelir. Beğendiğin ayarı Copy Link ile kopyalayıp buraya yapıştır.",
                      )}
                    </span>
                    <div className="button-row">
                      <a
                        className="link-button"
                        href={recalcLinkFor(d)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("ReCalc'ı aç")} <ArrowRight size={13} />
                      </a>
                      <button onClick={openRecalc}>
                        {t("ReCalc linkini yapıştır")}
                      </button>
                    </div>
                    {d.mechanism === "wheel-driven-hood" && (
                      <small>
                        {t(
                          "ReCalc'ta tahrikli hood yok; tek teker + hood olarak açılır.",
                        )}
                      </small>
                    )}
                  </div>
                </div>
                <Field
                  label="Şimdilik kullanılacak geçici teker hızı"
                  value={d.wheelRPM}
                  unit="RPM"
                  step={10}
                  error={errors.wheelRPM}
                  onChange={(v) => put({ wheelRPM: v })}
                  hint="Sonra Basit arayüzde motor ve oran seçince değişir."
                />
              </div>
            )}
            <div className="explain-metric">
              <span>{t("Teker yüzey hızı")}</span>
              <b>{Number.isFinite(surface) ? surface.toFixed(2) : "—"} m/s</b>
              <small>
                {t(
                  "= π × çap × RPM / 60. Topun çıkış hızı bu değere bağlıdır ama eşit değildir; kaymayı ve hood'u simülasyon hesaplar.",
                )}
              </small>
            </div>
          </>
        )}
        {current.id === "second" && (
          <>
            <h2>{t(hood ? "Hood" : "Üst teker")}</h2>
            <p className="explain">
              <Rich
                text={t(
                  hood
                    ? fixed
                      ? "Topun ana tekerin karşısında sürtündüğü hood. Sabit hood dönmez. Hood'unda <b>dönmeyen tekerlekler</b> varsa sayısını ve çapını gir. Düz/kavisli bir plakaysa simülatör onu birkaç dönmeyen tekerlekle yaklaşık modeller: varsayılanı bırakabilir, tam geometriyi Gelişmiş arayüzde düzenleyebilirsin. Serbest dönen (avara) tekerlekler bu modelde yok."
                      : "Hood'daki motorla dönen tekerlekler. <b>Sayı</b> ve <b>çap</b>ı gir. Ana tekere dişli veya kayışla bağlıysa <b>oran</b> (hood tekerleği RPM ÷ ana teker RPM), ayrı motorluysa doğrudan <b>RPM</b>."
                    : "Topu üstten sıkıştıran ikinci teker. Ana tekere bağlıysa <b>oran</b> (üst RPM ÷ alt RPM), ayrı motorluysa <b>RPM</b>. Yüzey hızları eşitse top az spinle çıkar; farklıysa spin alır.",
                )}
              />
            </p>
            {hood ? (
              <>
                <Field
                  label="Hood tekerlek sayısı"
                  value={d.hoodRollers}
                  unit="adet"
                  error={errors.hoodRollers}
                  onChange={(v) => put({ hoodRollers: v })}
                />
                <LengthField
                  label="Hood tekerlek çapı"
                  meters={d.rollerDiameter}
                  error={errors.rollerDiameter}
                  onChange={len("rollerDiameter")}
                />
              </>
            ) : (
              <LengthField
                label="Üst teker çapı"
                meters={d.topWheelDiameter}
                error={errors.topWheelDiameter}
                onChange={len("topWheelDiameter")}
                tag={tag("topWheelDiameter")}
              />
            )}
            {!fixed && (
              <>
                <div
                  className="segmented"
                  role="radiogroup"
                  aria-label={t("Tahrik")}
                >
                  {(
                    [
                      ["gear", "Ana tekere bağlı"],
                      ["independent", "Ayrı motor"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      role="radio"
                      aria-checked={d.drive === v}
                      className={d.drive === v ? "active" : ""}
                      onClick={() => put({ drive: v })}
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>
                {d.drive === "gear" ? (
                  <Field
                    label={
                      hood
                        ? "Hood tekerleği / ana teker RPM oranı"
                        : "Üst / alt teker RPM oranı"
                    }
                    value={d.ratio}
                    unit=":1"
                    step={0.05}
                    error={errors.ratio}
                    onChange={(v) => put({ ratio: v })}
                    tag={tag("ratio")}
                  />
                ) : (
                  <Field
                    label={hood ? "Hood tekerlek hızı" : "Üst teker hızı"}
                    value={d.secondRPM}
                    unit="RPM"
                    step={10}
                    error={errors.secondRPM}
                    onChange={(v) => put({ secondRPM: v })}
                  />
                )}
              </>
            )}
          </>
        )}
        {current.id === "gap" && (
          <>
            <h2>{t("Sıkışma ve çıkış yüksekliği")}</h2>
            <p className="explain">
              <Rich
                text={t.f(
                  "<b>Boşluk</b>: ana teker ile karşı yüzey (hood ya da üst teker) arasındaki en dar mesafe. POLLEN {d} mm; boşluk daha dar olduğunda top sıkışır. <b>Sıkışma = POLLEN çapı − boşluk</b> ve iki tarafın toplamıdır. Kumpasla en dar noktadan ölç.",
                  { d: (POLLEN_DIAMETER * 1000).toFixed(1) },
                )}
              />
            </p>
            <LengthField
              label="Teker ile karşı yüzey arası boşluk"
              meters={d.gap}
              error={errors.gap}
              onChange={len("gap")}
              tag={tag("gap")}
            />
            <div className="explain-metric">
              <span>{t("Toplam sıkışma")}</span>
              <b>
                {Number.isFinite(squeeze)
                  ? Math.max(0, squeeze).toFixed(1)
                  : "—"}{" "}
                mm
              </b>
              <small>
                {t(
                  squeeze <= 0
                    ? "Boşluk topa eşit veya geniş: top tekere bastırılmaz, kayar."
                    : "Daha çok sıkışma daha iyi tutuş ama daha çok enerji kaybı demektir; gerçek değeri test et.",
                )}
              </small>
            </div>
            <LengthField
              label="Çıkış yüksekliği (yerden)"
              meters={d.exitHeight}
              error={errors.exitHeight}
              onChange={len("exitHeight")}
              tag={tag("exitHeight")}
            />
            <p className="hint">
              {t("Topun shooter'dan ayrıldığı noktanın zeminden yüksekliği.")}
            </p>
          </>
        )}
        {current.id === "angle" && (
          <>
            <h2>{t("Atış açısı")}</h2>
            <p className="explain">
              <Rich
                text={t(
                  "Topun çıkış yönünün yatayla yaptığı açı. Hood açın ayarlanabiliyorsa <b>min–max</b> aralığını gir: Otomatik çöz isabet ararken bu aralıkta kalır. Açı sabitse üçünü aynı yap.",
                )}
              />
            </p>
            <Field
              label="Şu anki açı"
              value={d.hoodAngleDeg}
              unit="°"
              error={errors.hoodAngleDeg}
              onChange={(v) => put({ hoodAngleDeg: v })}
              tag={tag("hoodAngleDeg")}
            />
            <div className="setup-two">
              <Field
                label="En düşük"
                value={d.hoodMinDeg}
                unit="°"
                error={errors.hoodMinDeg}
                onChange={(v) => put({ hoodMinDeg: v })}
                tag={tag("hoodMinDeg")}
              />
              <Field
                label="En yüksek"
                value={d.hoodMaxDeg}
                unit="°"
                error={errors.hoodMaxDeg}
                onChange={(v) => put({ hoodMaxDeg: v })}
                tag={tag("hoodMaxDeg")}
              />
            </div>
          </>
        )}
        {current.id === "chassis" && (
          <>
            <h2>{t("Şasi ve sürüş")}</h2>
            <p className="explain">
              <Rich
                text={t(
                  "Robotun yerdeki ayak izi ve nasıl sürüldüğü. Sahadaki robot çizimi, duvara ne kadar yaklaşabildiği ve <b>otonom planlayıcı</b> bu bilgiyi kullanır; planlayıcı sana bir daha sormaz.",
                )}
              />
            </p>
            <div className="setup-two">
              <LengthField
                label="Boy (ileri yön)"
                meters={body.length}
                error={sizeError(body.length)}
                onChange={(v) => setBody((b) => ({ ...b, length: v }))}
              />
              <LengthField
                label="En"
                meters={body.width}
                error={sizeError(body.width)}
                onChange={(v) => setBody((b) => ({ ...b, width: v }))}
              />
            </div>
            <p className="ob-section">{t("SÜRÜŞ TİPİ")}</p>
            <div
              className="mechanism-cards two"
              role="radiogroup"
              aria-label={t("Sürüş tipi")}
            >
              {(
                [
                  [
                    "holonomic",
                    "Mecanum / holonomik",
                    "Yana kayabilir: dönmeden her yöne gider. Mecanum, omni (X-drive) ve swerve bu gruptadır.",
                  ],
                  [
                    "tank",
                    "Tank",
                    "Yana kayamaz: önce döner, sonra düz gider. Normal lastikli 4 veya 6 tekerli şasiler.",
                  ],
                ] as const
              ).map(([id, label, hint]) => (
                <button
                  key={id}
                  role="radio"
                  aria-checked={body.drive === id}
                  className={`mech ${body.drive === id ? "active" : ""}`}
                  onClick={() => setBody((b) => ({ ...b, drive: id }))}
                >
                  <b>{t(label)}</b>
                  <small>{t(hint)}</small>
                </button>
              ))}
            </div>
            <p className="ob-section">{t("TARET")}</p>
            <div
              className="segmented wide"
              role="radiogroup"
              aria-label={t("Taret")}
            >
              {(
                [
                  [false, "Yok: nişan için robot döner"],
                  [true, "Var: shooter kendi döner"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={label}
                  role="radio"
                  aria-checked={body.turret === v}
                  className={body.turret === v ? "active" : ""}
                  onClick={() => setBody((b) => ({ ...b, turret: v }))}
                >
                  {t(label)}
                </button>
              ))}
            </div>
          </>
        )}
        {current.id === "summary" && (
          <>
            <h2>
              {t(mode === "edit" ? "Değişiklikleri uygula" : "Son kontrol")}
            </h2>
            <label className={`setup-field ${errors.name ? "invalid" : ""}`}>
              <span>{t("Robot adı")}</span>
              <input
                type="text"
                value={d.name}
                maxLength={120}
                aria-invalid={!!errors.name}
                onChange={(e) => put({ name: e.target.value })}
              />
              {errors.name && (
                <small className="setup-error" role="alert">
                  {t(errors.name)}
                </small>
              )}
            </label>
            <dl className="summary-list">
              <dt>{t("Mekanizma")}</dt>
              <dd>
                {t(mechanisms.find((m) => m.id === d.mechanism)?.label ?? "")}
              </dd>
              <dt>{t("Ana teker")}</dt>
              <dd>
                {shown(d.wheelDiameter * 1000)} mm · {shown(d.wheelRPM)} RPM
              </dd>
              <dt>{t(hood ? "Hood" : "Üst teker")}</dt>
              <dd>
                {hood
                  ? t.f("{n} × {d} mm tekerlek", {
                      n: d.hoodRollers,
                      d: shown(d.rollerDiameter * 1000),
                    })
                  : `${shown(d.topWheelDiameter * 1000)} mm`}
                {!fixed &&
                  (d.drive === "gear"
                    ? ` · ${t.f("oran {r}:1", { r: shown(d.ratio) })}`
                    : ` · ${shown(d.secondRPM)} RPM`)}
              </dd>
              <dt>{t("Boşluk / yükseklik")}</dt>
              <dd>
                {shown(d.gap * 1000)} mm · {shown(d.exitHeight * 1000)} mm
              </dd>
              <dt>{t("Açı")}</dt>
              <dd>
                {shown(d.hoodAngleDeg)}° ({shown(d.hoodMinDeg)}–
                {shown(d.hoodMaxDeg)}°)
              </dd>
              <dt>{t("Şasi")}</dt>
              <dd>
                {shown(body.length * 100)} × {shown(body.width * 100)} cm ·{" "}
                {t(body.drive === "tank" ? "Tank" : "Mecanum / holonomik")} ·{" "}
                {t(body.turret ? "taretli" : "taretsiz")}
              </dd>
            </dl>
            <p className="ob-section">{t("MODEL VARSAYIMLARI (ÖLÇÜLMEDİ)")}</p>
            <ul className="assumptions">
              <li>
                {t(
                  "Teker–top sürtünmesi 0,65 ve temas sertlikleri tahminidir.",
                )}
              </li>
              <li>
                {t(
                  imported?.extras.primary.inertiaMode &&
                    imported.extras.primary.inertiaMode !== "unknown"
                    ? "Teker ataleti ReCalc'tan alındı."
                    : "Teker ataleti bilinmiyor: atış sonrası hız düşüşü hesaplanmaz.",
                )}
              </li>
              <li>
                {t(
                  "Hava direnci Cd 0,47 ve Magnus eğimi 0,6: genel küre değerleri.",
                )}
              </li>
              <li>
                {t(
                  "Hood temas yerleşimi tipik bir hood'dan türetilir; tam geometriyi Gelişmiş arayüzde düzenleyebilirsin.",
                )}
              </li>
            </ul>
            {mode === "edit" && (
              <p className="hint">
                {t(
                  "Uygula yalnız değiştirdiğin alanları uygular; robot konumu, POLLEN, sekme ayarları, ölçülmüş ataletler ve kalibrasyon ölçümlerin korunur.",
                )}
              </p>
            )}
            {!valid && (
              <p className="setup-error" role="alert">
                {t(
                  "Bazı adımlarda düzeltilmesi gereken değer var (soldaki ! işaretli adımlar).",
                )}
              </p>
            )}
          </>
        )}
        <div className="wizard-actions">
          <button onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}>
            <ArrowLeft size={14} />{" "}
            {t(step === 0 ? (mode === "edit" ? "Vazgeç" : "Geri") : "Önceki")}
          </button>
          {last ? (
            <button
              className="primary"
              disabled={!valid}
              onClick={() => onDone({ ...d, name: d.name.trim() }, extras())}
            >
              <Check size={14} />{" "}
              {t(mode === "edit" ? "Uygula" : "Robotu oluştur ve sahaya çık")}
            </button>
          ) : (
            <button
              className="primary"
              disabled={stepErrors(step) > 0}
              onClick={() => setStep(step + 1)}
            >
              {t("İleri")} <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
      <aside className="wizard-preview" aria-label={t("Canlı şema")}>
        <p className="ob-eyebrow">{t("CANLI ŞEMA · YAN GÖRÜNÜM")}</p>
        <MechanismDiagram spec={d} highlight={highlight} />
        <p className="hint">
          {t(
            "Ölçekli şematik çizim; sen değer girdikçe güncellenir. Simülasyondaki temas geometrisi bunun ayrıntılı halidir.",
          )}
        </p>
      </aside>
    </section>
  );
}
